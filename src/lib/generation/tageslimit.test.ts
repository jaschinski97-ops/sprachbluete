import { genannteWartezeitMs, istTageslimit, mitTageslimit, neuerTageslimitStand, tageslimitMeldung } from './tageslimit';

const GEMINI = 'HTTP 429: You exceeded your current quota … Quota exceeded for metric: generativelanguage.googleapis.com/'
  + 'generate_content_paid_tier_2_requests, limit: 10000, model: gemini-3.8-flash-tts, description: Generate content '
  + 'requests per day limit exceeded on Tier 2. Please retry in 19h25m0.025055246s. — RESOURCE_EXHAUSTED';

describe('Tageslimit', () => {
  it('erkennt das Tageskontingent, aber keine kurze Bremse', () => {
    expect(istTageslimit(new Error(GEMINI))).toBe(true);
    expect(istTageslimit(new Error('HTTP 429: Rate limit, too many requests per minute'))).toBe(false);
    expect(istTageslimit(new Error('HTTP 503: overloaded'))).toBe(false);
  });

  it('liest die genannte Wartezeit', () => {
    expect(genannteWartezeitMs(GEMINI)).toBe(Math.round((19 * 3600 + 25 * 60 + 0.025055246) * 1000));
    expect(genannteWartezeitMs('"retryDelay": "3600s"')).toBe(3_600_000);
    expect(genannteWartezeitMs('kein Hinweis')).toBeNull();
  });

  it('merkt sich den ersten Treffer und reicht den Fehler weiter', async () => {
    const stand = neuerTageslimitStand();
    const client = mitTageslimit({ generate: async () => { throw new Error(GEMINI); } }, stand, () => 1_000);
    await expect(client.generate('x')).rejects.toThrow('RESOURCE_EXHAUSTED');
    expect(stand).toEqual({ erreicht: true, wiederAbMs: 1_000 + (19 * 3600 + 25 * 60) * 1000 + 25 });
    expect(tageslimitMeldung(stand)).toMatch(/^Tageslimit des Anbieters erreicht/);
  });

  it('lässt andere Fehler und Erfolge unberührt', async () => {
    const stand = neuerTageslimitStand();
    const ok = mitTageslimit({ generate: async (s: string) => s + '!' }, stand);
    expect(await ok.generate('a')).toBe('a!');
    const kaputt = mitTageslimit({ generate: async () => { throw new Error('HTTP 500'); } }, stand);
    await expect(kaputt.generate('a')).rejects.toThrow('HTTP 500');
    expect(stand.erreicht).toBe(false);
  });
});
