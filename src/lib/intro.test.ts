import { closeIntro, introVisible, openIntro, showIntroOnFirstStart } from './intro';
import { MemoryDataStore } from './storage';

describe('Einführung', () => {
  it('geht beim ersten Start auf und danach nicht mehr von selbst', async () => {
    const store = new MemoryDataStore();
    await store.init();
    expect(await showIntroOnFirstStart(store)).toBe(true);
    expect(introVisible()).toBe(true);
    await closeIntro(store);
    expect(introVisible()).toBe(false);
    expect(await showIntroOnFirstStart(store)).toBe(false);
    expect(introVisible()).toBe(false);
  });

  it('lässt sich aus den Einstellungen wieder öffnen', async () => {
    const store = new MemoryDataStore();
    await store.init();
    await closeIntro(store);
    openIntro();
    expect(introVisible()).toBe(true);
    await closeIntro(store);
  });
});
