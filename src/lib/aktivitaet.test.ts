import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { meldeAktivitaet, RUHE_NACH_MS, useNutzerAktiv } from './aktivitaet';

/** Zeigt den Hook-Wert als Text, damit der Test ihn lesen kann. */
function Anzeige() {
  return useNutzerAktiv() ? 'aktiv' : 'ruht';
}

describe('Nutzeraktivität', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ruht nach der Ruhezeit und wird mit der nächsten Berührung wieder aktiv', () => {
    let baum!: ReturnType<typeof create>;
    act(() => { baum = create(createElement(Anzeige)); });
    act(() => meldeAktivitaet());
    expect(baum.toJSON()).toBe('aktiv');
    act(() => { jest.advanceTimersByTime(RUHE_NACH_MS - 1); });
    expect(baum.toJSON()).toBe('aktiv');
    act(() => { jest.advanceTimersByTime(1); });
    expect(baum.toJSON()).toBe('ruht');
    act(() => meldeAktivitaet());
    expect(baum.toJSON()).toBe('aktiv');
    act(() => baum.unmount());
  });

  it('jede Aktivität schiebt die Ruhe hinaus', () => {
    let baum!: ReturnType<typeof create>;
    act(() => { baum = create(createElement(Anzeige)); });
    act(() => meldeAktivitaet());
    act(() => { jest.advanceTimersByTime(RUHE_NACH_MS - 1000); });
    act(() => meldeAktivitaet());
    act(() => { jest.advanceTimersByTime(RUHE_NACH_MS - 1000); });
    expect(baum.toJSON()).toBe('aktiv');
    act(() => baum.unmount());
  });
});
