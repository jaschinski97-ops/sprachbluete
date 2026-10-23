import {
  getErscheinung,
  loadErscheinung,
  normalizeErscheinung,
  resetErscheinungForTests,
  saveErscheinung,
  subscribeErscheinung,
} from '@/lib/appearance';
import { MemoryDataStore } from '@/lib/storage';

describe('Tag & Nacht (lib/appearance)', () => {
  afterEach(() => resetErscheinungForTests());

  it('folgt ohne Speicherstand dem Gerät', async () => {
    const store = new MemoryDataStore();
    await expect(loadErscheinung(store)).resolves.toBe('system');
    expect(getErscheinung()).toBe('system');
  });

  it('speichert die Wahl und liest sie beim nächsten Start wieder', async () => {
    const store = new MemoryDataStore();
    await saveErscheinung('dark', store);
    expect(getErscheinung()).toBe('dark');
    expect(await store.get('meta', 'appearance')).toBe('dark');

    resetErscheinungForTests();
    await expect(loadErscheinung(store)).resolves.toBe('dark');
    expect(getErscheinung()).toBe('dark');
  });

  it('meldet jeden Wechsel an die Hörer, gleiche Werte nicht doppelt', async () => {
    const store = new MemoryDataStore();
    const hoerer = jest.fn();
    const abmelden = subscribeErscheinung(hoerer);
    await saveErscheinung('light', store);
    await saveErscheinung('light', store);
    await saveErscheinung('system', store);
    abmelden();
    await saveErscheinung('dark', store);
    expect(hoerer).toHaveBeenCalledTimes(2);
  });

  it('macht aus kaputten oder alten Werten „wie das Gerät“', () => {
    expect(normalizeErscheinung('dark')).toBe('dark');
    expect(normalizeErscheinung('light')).toBe('light');
    expect(normalizeErscheinung(undefined)).toBe('system');
    expect(normalizeErscheinung('nacht')).toBe('system');
    expect(normalizeErscheinung(1)).toBe('system');
  });
});
