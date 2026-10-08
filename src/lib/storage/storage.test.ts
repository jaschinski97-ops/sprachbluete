import AsyncStorage from '@react-native-async-storage/async-storage';

import { createDataStore as createWebStore } from './backend.web';
import { MemoryDataStore } from './memory-store';
import {
  getActiveBackend,
  isStorageDegraded,
  resetStoreForTests,
  TransactionalDataStore,
} from './index';
import { DataStore } from './types';

// Der Ausfallpfad von `getStore()` laesst sich nur pruefen, wenn das
// Plattform-Backend bestimmt versagt — das echte SQLite braucht ein natives
// Modul und ist hier ohnehin nicht pruefbar (siehe Modulkommentar unten).
jest.mock('./backend', () => ({
  BACKEND_NAME: 'expo-sqlite',
  createDataStore: () => {
    throw new Error('Datenbank kaputt');
  },
}));

/**
 * Ein und dieselbe Vertragsprüfung für alle Backends.
 *
 * Der Sinn der Abstraktion aus AE-3 steht und fällt damit, dass sich die
 * Backends gleich verhalten — sonst funktioniert die Geschäftslogik auf einer
 * Plattform und auf der anderen nicht. Das native SQLite-Backend lässt sich
 * hier nicht mitprüfen, weil `expo-sqlite` ein natives Modul braucht; es wird
 * in Expo Go auf dem Gerät verifiziert (siehe PROGRESS.md, Phase 1).
 */
const BACKENDS: { name: string; create: () => DataStore }[] = [
  { name: 'MemoryDataStore', create: () => new MemoryDataStore() },
  { name: 'WebDataStore (Node persistence)', create: () => createWebStore() },
];

it('rolls back a failed browser write and remains usable for retry, including multi-collection commits', async () => {
  const disk = new Map<string, string>();
  let fail = false;
  const set = jest.fn(async (entries: [string, string][]) => {
    if (fail) throw new Error('transaction aborted');
    for (const [key, raw] of entries) disk.set(key, raw);
  });
  const persistence = { init: async () => {}, get: async (key: string) => disk.get(key) ?? null, set };
  const store = createWebStore(persistence);
  await store.init();
  await store.put('cards', 'one', { reps: 1 });
  fail = true;
  await expect(store.put('cards', 'one', { reps: 2 })).rejects.toThrow('transaction aborted');
  expect(await store.get('cards', 'one')).toEqual({ reps: 1 });
  await expect((store as TransactionalDataStore).withTransactionAsync(async () => {
    await store.put('cards', 'one', { reps: 3 });
    await store.put('meta', 'done', true);
  })).rejects.toThrow('transaction aborted');
  expect(set.mock.calls.at(-1)?.[0]).toHaveLength(2);
  expect(await store.get('cards', 'one')).toEqual({ reps: 1 });
  expect(await store.get('meta', 'done')).toBeNull();
  fail = false;
  await store.put('cards', 'one', { reps: 4 });
  const restarted = createWebStore(persistence);
  await restarted.init();
  expect(await restarted.get('cards', 'one')).toEqual({ reps: 4 });
});

describe.each(BACKENDS)('DataStore-Vertrag: $name', ({ create }) => {
  let store: DataStore;

  beforeEach(async () => {
    await AsyncStorage.clear();
    store = create();
    await store.init();
  });

  it('gibt null zurueck, wenn es den Eintrag nicht gibt', async () => {
    expect(await store.get('cards', 'fehlt')).toBeNull();
  });

  it('gibt eine leere Liste fuer eine unbenutzte Sammlung zurueck', async () => {
    expect(await store.getAll('situations')).toEqual([]);
  });

  it('speichert und liest einen Wert zurueck', async () => {
    await store.put('cards', 'gai:th_to_de', { reps: 3, stability: 4.2 });
    expect(await store.get('cards', 'gai:th_to_de')).toEqual({ reps: 3, stability: 4.2 });
  });

  it('ueberschreibt bei gleicher ID statt zu duplizieren', async () => {
    await store.put('cards', 'gai:th_to_de', { reps: 1 });
    await store.put('cards', 'gai:th_to_de', { reps: 2 });

    expect(await store.get('cards', 'gai:th_to_de')).toEqual({ reps: 2 });
    expect(await store.getAll('cards')).toHaveLength(1);
  });

  it('haelt Sammlungen voneinander getrennt', async () => {
    await store.put('cards', 'gleiche-id', { woher: 'cards' });
    await store.put('vocab', 'gleiche-id', { woher: 'vocab' });

    expect(await store.get('cards', 'gleiche-id')).toEqual({ woher: 'cards' });
    expect(await store.get('vocab', 'gleiche-id')).toEqual({ woher: 'vocab' });
    expect(await store.getAll('cards')).toHaveLength(1);
  });

  it('schreibt viele Eintraege auf einmal', async () => {
    await store.putMany(
      'vocab',
      Array.from({ length: 100 }, (_, i) => ({ id: `v${i}`, value: { index: i } }))
    );

    expect(await store.getAll('vocab')).toHaveLength(100);
    expect(await store.get('vocab', 'v42')).toEqual({ index: 42 });
  });

  it('vertraegt putMany mit leerer Liste', async () => {
    await expect(store.putMany('vocab', [])).resolves.toBeUndefined();
    expect(await store.getAll('vocab')).toEqual([]);
  });

  it('entfernt einen einzelnen Eintrag', async () => {
    await store.put('cards', 'a', { n: 1 });
    await store.put('cards', 'b', { n: 2 });
    await store.remove('cards', 'a');

    expect(await store.get('cards', 'a')).toBeNull();
    expect(await store.getAll('cards')).toEqual([{ n: 2 }]);
  });

  it('leert nur die angegebene Sammlung', async () => {
    await store.put('cards', 'a', { n: 1 });
    await store.put('vocab', 'b', { n: 2 });
    await store.clear('cards');

    expect(await store.getAll('cards')).toEqual([]);
    expect(await store.getAll('vocab')).toEqual([{ n: 2 }]);
  });

  it('haelt verschachtelte Werte und null-Felder unveraendert', async () => {
    const card = {
      vocabId: 'gai',
      direction: 'th_to_de',
      stability: null,
      nested: { tones: ['mid', 'low'], meta: { ok: true } },
    };
    await store.put('cards', 'gai:th_to_de', card);
    expect(await store.get('cards', 'gai:th_to_de')).toEqual(card);
  });

  it('gibt Kopien heraus, sodass Aufrufer den Speicher nicht aus Versehen aendern', async () => {
    await store.put('cards', 'a', { reps: 1 });

    const first = await store.get<{ reps: number }>('cards', 'a');
    first!.reps = 99;

    const second = await store.get<{ reps: number }>('cards', 'a');
    expect(second!.reps).toBe(1);
  });
});

describe('AsyncStorageDataStore (web) - Persistenz ueber einen Neustart', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('findet Daten einer frueheren Instanz wieder', async () => {
    // Erste "App-Sitzung"
    const before = createWebStore();
    await before.init();
    await before.put('cards', 'gai:th_to_de', { reps: 7, stability: 12.5 });

    // Zweite "App-Sitzung": neue Instanz, gleicher AsyncStorage-Inhalt.
    const after = createWebStore();
    await after.init();

    expect(await after.get('cards', 'gai:th_to_de')).toEqual({ reps: 7, stability: 12.5 });
  });

  it('startet mit einer leeren Sammlung, wenn der gespeicherte Blob beschaedigt ist', async () => {
    await AsyncStorage.setItem('thai-lernbegleiter:cards', '{ kein gueltiges JSON');

    const store = createWebStore();
    await store.init();

    expect(await store.getAll('cards')).toEqual([]);
    // Und der Speicher ist danach wieder normal benutzbar.
    await store.put('cards', 'a', { n: 1 });
    expect(await store.get('cards', 'a')).toEqual({ n: 1 });
  });
});

describe('AsyncStorageDataStore (web) - Zugriffsracen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('verliert bei parallelem Erstzugriff keinen der Schreibvorgaenge', async () => {
    // Vor der Serialisierungskette (Code-Review 2026-09-07): putMany und put
    // starteten beide mit einem leeren Cache, bauten je einen Bucket, und der
    // zweite ueberschrieb den ersten — im Cache UND im geflushten Blob blieb
    // nur eine Haelfte zurueck.
    const store = createWebStore();
    await store.init();

    await Promise.all([
      store.putMany('vocab', [
        { id: 'a', value: { n: 1 } },
        { id: 'b', value: { n: 2 } },
      ]),
      store.put('vocab', 'c', { n: 3 }),
      store.getAll('vocab'),
    ]);

    expect((await store.getAll('vocab')).length).toBe(3);
    // Auch der Persistierung ist nichts verloren gegangen — neuer Store,
    // gleicher AsyncStorage-Inhalt.
    const nachNeustart = createWebStore();
    await nachNeustart.init();
    expect((await nachNeustart.getAll('vocab')).length).toBe(3);
  });

  it('flusht interleaved put- und putMany-Aufrufe in einer nachvollziehbaren Reihenfolge', async () => {
    const store = createWebStore();
    await store.init();

    // Alles parallel auf dieselbe ID: die Serialisierung ordnet die
    // Schreibvorgaenge, und der finale Zustand ist der LETZTE in der
    // Aufrufreihenfolge — nicht der zufaellig letzte Flush.
    const jobs = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0
        ? store.put('cards', 'gai:th_to_de', { n: i })
        : store.putMany('cards', [{ id: 'gai:th_to_de', value: { n: i } }])
    );
    await Promise.all(jobs);

    expect(await store.get('cards', 'gai:th_to_de')).toEqual({ n: 9 });
    const nachNeustart = createWebStore();
    await nachNeustart.init();
    expect(await nachNeustart.get('cards', 'gai:th_to_de')).toEqual({ n: 9 });
  });
});

describe('AsyncStorageDataStore (web) - Transaktion', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('haelt Schreibvorgaenge zusammen und fluht sie erst am Ende', async () => {
    const store = createWebStore() as TransactionalDataStore;
    await store.init();

    const ergebnis = await store.withTransactionAsync(async () => {
      await store.put('cards', 'a', { n: 1 });
      await store.put('reviewLog', '2026-09-07', { total: 1 });
      return 'fertig';
    });
    expect(ergebnis).toBe('fertig');

    const nachNeustart = createWebStore();
    await nachNeustart.init();
    expect(await nachNeustart.get('cards', 'a')).toEqual({ n: 1 });
    expect(await nachNeustart.get('reviewLog', '2026-09-07')).toEqual({ total: 1 });
  });

  it('rollt bei einem Fehler ALLE Schreibvorgaenge der Transaktion zurueck', async () => {
    const store = createWebStore() as TransactionalDataStore;
    await store.init();
    // Zustand von vor der Transaktion — der muss bleiben.
    await store.put('cards', 'alt', { n: 0 });

    await expect(
      store.withTransactionAsync(async () => {
        await store.put('cards', 'neu', { n: 1 });
        await store.put('reviewLog', '2026-09-07', { total: 1 });
        throw new Error('Absturz dazwischen');
      })
    ).rejects.toThrow('Absturz dazwischen');

    // Weder im Cache ...
    expect(await store.get('cards', 'neu')).toBeNull();
    expect(await store.getAll('reviewLog')).toEqual([]);
    // ... noch im Persistierten ist etwas hängen geblieben.
    const nachNeustart = createWebStore();
    await nachNeustart.init();
    expect(await nachNeustart.get('cards', 'neu')).toBeNull();
    expect(await nachNeustart.getAll('reviewLog')).toEqual([]);
    expect(await nachNeustart.get('cards', 'alt')).toEqual({ n: 0 });
  });

  it('rollt auch Loeschungen innerhalb einer gescheiterten Transaktion zurueck', async () => {
    const store = createWebStore() as TransactionalDataStore;
    await store.init();
    await store.put('cards', 'a', { n: 1 });
    await store.put('cards', 'b', { n: 2 });

    await expect(
      store.withTransactionAsync(async () => {
        await store.remove('cards', 'a');
        await store.clear('reviewLog');
        throw new Error('doch nicht');
      })
    ).rejects.toThrow('doch nicht');

    expect(await store.get('cards', 'a')).toEqual({ n: 1 });
  });
});

describe('Backend-Ausfall zur Laufzeit', () => {
  afterEach(() => {
    resetStoreForTests();
  });

  it('meldet isStorageDegraded() nach dem stillen RAM-Rueckfall als true', async () => {
    // Vorher fiel die App bei kaputtem Backend stillschweigend auf den
    // RAM-Speicher zurueck, ohne dass jemand es erfragen konnte (P1 im
    // Code-Review 2026-09-07) — der Lernfortschritt waere beim Schliessen
    // verloren gegangen.
    resetStoreForTests();
    await expect(isStorageDegraded()).resolves.toBe(true);
    // Der synchron abfragbare Name sagt dasselbe (der Diagnose-Screen liest ihn).
    expect(getActiveBackend()).toMatch(/memory/);
  });
});


describe('Web-Dokumentspeicher: IndexedDB nicht verfügbar', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('arbeitet auf localStorage weiter, wenn IndexedDB sich nicht öffnen lässt', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createDocumentPersistence } = require('./document-persistence.web') as typeof import('./document-persistence.web');
    const blockiert = {
      open: () => {
        const request = {} as IDBOpenDBRequest;
        setTimeout(() => (request.onerror as ((event: Event) => void) | null)?.(new Event('error')), 0);
        return request;
      },
    } as unknown as IDBFactory;
    await AsyncStorage.setItem('thai-lernbegleiter:cards', JSON.stringify({ alt: { reps: 2 } }));

    const store = createWebStore(createDocumentPersistence(blockiert));
    await store.init();

    expect(await store.get('cards', 'alt')).toEqual({ reps: 2 });
    await store.put('cards', 'neu', { reps: 1 });
    expect(JSON.parse((await AsyncStorage.getItem('thai-lernbegleiter:cards'))!)).toHaveProperty('neu');
  });
});
