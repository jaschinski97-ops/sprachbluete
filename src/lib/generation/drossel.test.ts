import { HttpStatusError, warteHinweisMs } from '../providers/http';

import { runBatch } from './batch';
import { Drossel, gedrosselt, istRatenlimit, parallelFuer, standardParallel } from './drossel';

/** Eine Uhr, die nur vorrückt, wenn die Drossel wartet. */
function uhr() {
  let jetzt = 0;
  const wartezeiten: number[] = [];
  return {
    jetzt: () => jetzt,
    warte: async (ms: number) => {
      wartezeiten.push(ms);
      jetzt += ms;
    },
    wartezeiten,
  };
}

const ratenlimit = (retryAfter?: string) => new HttpStatusError(429, '{"error":{"message":"Too many requests"}}', retryAfter);

describe('Drossel (Turbo, 23.10.2026)', () => {
  it('lässt höchstens so viele Aufrufe gleichzeitig laufen wie erlaubt', async () => {
    const zeit = uhr();
    const drossel = new Drossel({ max: 3, ...zeit });
    let gleichzeitig = 0;
    let hoechstens = 0;
    const freigaben: (() => void)[] = [];
    const laeufe = Array.from({ length: 10 }, (_, index) => drossel.lauf(async () => {
      gleichzeitig += 1;
      hoechstens = Math.max(hoechstens, gleichzeitig);
      await new Promise<void>((resolve) => freigaben.push(resolve));
      gleichzeitig -= 1;
      return index;
    }));
    // Nach und nach freigeben, bis alle durch sind.
    for (let runde = 0; runde < 20 && freigaben.length < 10; runde++) {
      await Promise.resolve();
      freigaben.splice(0).forEach((weiter) => weiter());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    freigaben.splice(0).forEach((weiter) => weiter());
    await expect(Promise.all(laeufe)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(hoechstens).toBe(3);
  });

  it('wiederholt nach einem 429 denselben Aufruf, wartet die genannte Zeit und halbiert', async () => {
    const zeit = uhr();
    const drossel = new Drossel({ max: 8, ...zeit });
    let versuche = 0;
    const ergebnis = await drossel.lauf(async () => {
      versuche += 1;
      if (versuche === 1) throw ratenlimit('7');
      return 'Clip';
    });
    expect(ergebnis).toBe('Clip');
    expect(versuche).toBe(2);
    expect(zeit.wartezeiten).toEqual([7000]);
    expect(drossel.erlaubt).toBe(4);
    expect(drossel.gebremst).toBe(1);
  });

  it('wartet ohne Angabe des Anbieters 2 s, dann 4 s, dann 8 s', async () => {
    const zeit = uhr();
    const drossel = new Drossel({ max: 4, ...zeit });
    let versuche = 0;
    await drossel.lauf(async () => {
      versuche += 1;
      if (versuche <= 3) throw ratenlimit();
      return 'ok';
    });
    expect(zeit.wartezeiten).toEqual([2000, 4000, 8000]);
    // 4 → 2 → 1 → 1, und der Erfolg am Ende gibt gleich wieder einen Platz dazu.
    expect(drossel.erlaubt).toBe(2);
  });

  it('erhöht nach Erfolgen in Folge wieder bis zum Höchstwert', async () => {
    const zeit = uhr();
    const drossel = new Drossel({ max: 4, ...zeit });
    let erster = true;
    await drossel.lauf(async () => {
      if (erster) { erster = false; throw ratenlimit('1'); }
      return 'ok';
    });
    expect(drossel.erlaubt).toBe(2);
    for (let i = 0; i < 20; i++) await drossel.lauf(async () => 'ok');
    expect(drossel.erlaubt).toBe(4);
  });

  it('gibt andere Fehler sofort weiter, ohne zu wiederholen', async () => {
    const drossel = new Drossel({ max: 2, ...uhr() });
    let versuche = 0;
    await expect(drossel.lauf(async () => {
      versuche += 1;
      throw new HttpStatusError(401, '{"error":{"message":"invalid key"}}');
    })).rejects.toThrow('HTTP 401: invalid key');
    expect(versuche).toBe(1);
    expect(drossel.erlaubt).toBe(2);
  });

  it('gibt nach der Höchstzahl an Versuchen auf', async () => {
    const drossel = new Drossel({ max: 2, maxVersuche: 3, ...uhr() });
    let versuche = 0;
    await expect(drossel.lauf(async () => {
      versuche += 1;
      throw ratenlimit('1');
    })).rejects.toThrow('HTTP 429');
    expect(versuche).toBe(3);
  });

  it('erkennt Ratenlimits und Überlastung, aber kein aufgebrauchtes Tageskontingent', () => {
    expect(istRatenlimit(ratenlimit())).toBe(true);
    expect(istRatenlimit(new HttpStatusError(503, '{"error":{"message":"The model is overloaded."}}'))).toBe(true);
    expect(istRatenlimit(new Error('HTTP 429: Rate-Limit: maximal 30 Aufrufe pro Minute. In 12s wiederholen.'))).toBe(true);
    expect(istRatenlimit(new Error('HTTP 429: Quota exceeded … GenerateRequestsPerDayPerProjectPerModel'))).toBe(false);
    expect(istRatenlimit(new Error('HTTP 400: Bad request'))).toBe(false);
  });

  it('liest die Wartezeit aus Retry-After und aus Geminis retryDelay', () => {
    expect(warteHinweisMs('12')).toBe(12_000);
    expect(warteHinweisMs(null, '{"error":{"details":[{"retryDelay": "17s"}]}}')).toBe(17_000);
    expect(warteHinweisMs(null, '{}')).toBeUndefined();
    expect(ratenlimit('3').retryAfterMs).toBe(3000);
  });
});

describe('Paralleler Lauf mit Drossel', () => {
  it('zählt einen kurz abgelehnten Eintrag nicht als Fehlschlag und erzeugt alles', async () => {
    const drossel = new Drossel({ max: 3, ...uhr() });
    let aufrufe = 0;
    const client = gedrosselt({
      generate: async (spec: { id: string }) => {
        aufrufe += 1;
        if (aufrufe === 2) throw ratenlimit('1');
        return spec.id;
      },
    }, drossel);
    const fertig: string[] = [];
    const ergebnis = await runBatch({
      specs: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })),
      task: { exists: async () => false, produce: async (spec) => { fertig.push(await client.generate(spec)); } },
      concurrency: drossel.max,
    });
    expect(ergebnis).toMatchObject({ ok: 5, failed: 0, done: true });
    expect(fertig.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(aufrufe).toBe(6);
    expect(drossel.gebremst).toBe(1);
  });
});

describe('Gleichzeitige Anfragen je Anbieter', () => {
  it('lässt lokale Modelle bei einem Aufruf und gibt Cloud-Anbietern mehr', () => {
    expect(standardParallel('comfyui', 'image')).toBe(1);
    expect(standardParallel('local-qwen', 'text')).toBe(1);
    expect(standardParallel('deepseek', 'text')).toBe(8);
    expect(standardParallel('gemini', 'audio')).toBe(4);
    expect(standardParallel('chatgpt-helper', 'audio')).toBe(3);
  });

  it('nimmt die eingestellte Zahl, begrenzt auf 1 bis 32', () => {
    expect(parallelFuer({ provider: 'gemini' }, 'audio')).toBe(4);
    expect(parallelFuer({ provider: 'gemini', parallel: 12 }, 'audio')).toBe(12);
    expect(parallelFuer({ provider: 'gemini', parallel: 0 }, 'audio')).toBe(1);
    expect(parallelFuer({ provider: 'gemini', parallel: 99 }, 'audio')).toBe(32);
  });
});
