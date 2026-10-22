import { createTextClient, isGemini4 } from './text';

test.each(['gemini', 'chatgpt'] as const)('%s allows a slow text package to finish after 30 seconds', async provider => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const timeout = jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  const fetchMock = jest.fn((_url: unknown, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('TimeoutError')));
    setTimeout(() => resolve(new Response(JSON.stringify(provider === 'gemini'
      ? { candidates: [{ content: { parts: [{ text: 'Antwort' }] } }] }
      : { choices: [{ message: { content: 'Antwort' } }] }), { status: 200 })), 45_000);
  }));
  global.fetch = fetchMock as typeof fetch;
  try {
    const result = createTextClient(provider, 'test-only', 'test').complete({ system: 'test', user: 'test', maxTokens: 32768 });
    await jest.advanceTimersByTimeAsync(45_000);
    await expect(result).resolves.toMatchObject({ text: 'Antwort' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(300_000);
  } finally {
    timeout.mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  }
});

describe('Gemini 4 (Argon, 22.10.2026)', () => {
  function captureRequest(model: string, maxTokens: number) {
    const originalFetch = global.fetch;
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    let body: Record<string, any> | null = null;
    global.fetch = jest.fn(async (_url: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Gedanke', thought: true }, { text: 'Antwort' }] } }],
      }), { status: 200 });
    }) as typeof fetch;
    return {
      run: () => createTextClient('gemini', 'test-only', model).complete({ system: 's', user: 'u', maxTokens }),
      body: () => body!,
      timeout,
      restore: () => { timeout.mockRestore(); global.fetch = originalFetch; },
    };
  }

  it('lässt dem Denken Platz und wartet bis zu 20 Minuten', async () => {
    const probe = captureRequest('gemini-4-argon', 4000);
    try {
      await expect(probe.run()).resolves.toMatchObject({ text: 'Antwort' });
      expect(probe.body().generationConfig.maxOutputTokens).toBe(32_768);
      expect(probe.timeout).toHaveBeenCalledWith(20 * 60_000);
    } finally {
      probe.restore();
    }
  });

  it('lässt ältere Gemini-Modelle unverändert', async () => {
    const probe = captureRequest('gemini-3.5-flash', 4000);
    try {
      await probe.run();
      expect(probe.body().generationConfig.maxOutputTokens).toBe(4000);
      expect(probe.timeout).toHaveBeenCalledWith(300_000);
    } finally {
      probe.restore();
    }
  });

  it('erkennt nur Gemini-4-Modelle', () => {
    expect(isGemini4('gemini-4-argon')).toBe(true);
    expect(isGemini4(' gemini-4 ')).toBe(true);
    expect(isGemini4('gemini-40-x')).toBe(false);
    expect(isGemini4('gemini-3.8-flash')).toBe(false);
  });
});
