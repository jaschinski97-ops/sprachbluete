import { createTextClient, deepSeekDenkt, DEEPSEEK_CHAT_ENDPOINT, isGemini4 } from './text';

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

describe('DeepSeek (23.10.2026)', () => {
  function captureRequest(model: string, maxTokens: number, antwort: unknown = {
    model: 'deepseek-flash',
    choices: [{ message: { content: 'Antwort', reasoning_content: 'Gedanke' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 34 },
  }) {
    const originalFetch = global.fetch;
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    let url = '';
    let init: RequestInit | null = null;
    global.fetch = jest.fn(async (target: unknown, options: RequestInit) => {
      url = String(target);
      init = options;
      return new Response(JSON.stringify(antwort), { status: 200 });
    }) as typeof fetch;
    return {
      run: () => createTextClient('deepseek', 'sk-test-only', model).complete({ system: 's', user: 'u', maxTokens }),
      url: () => url,
      body: () => JSON.parse(String(init!.body)) as Record<string, any>,
      headers: () => init!.headers as Record<string, string>,
      timeout,
      restore: () => { timeout.mockRestore(); global.fetch = originalFetch; },
    };
  }

  it('erzeugt mit Flash ohne Denken und liest nur die Antwort, nicht das Denken', async () => {
    const probe = captureRequest('deepseek-flash', 32768);
    try {
      await expect(probe.run()).resolves.toEqual({
        text: 'Antwort',
        model: 'deepseek-flash',
        usage: { inputTokens: 12, outputTokens: 34 },
      });
      expect(probe.url()).toBe(DEEPSEEK_CHAT_ENDPOINT);
      expect(probe.headers().Authorization).toBe('Bearer sk-test-only');
      expect(probe.body()).toMatchObject({
        model: 'deepseek-flash',
        max_tokens: 32768,
        thinking: { type: 'disabled' },
        messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
      });
      expect(probe.timeout).toHaveBeenCalledWith(20 * 60_000);
    } finally {
      probe.restore();
    }
  });

  it('prüft mit Pro und Denken, mit Platz für die Denk-Tokens', async () => {
    const probe = captureRequest('deepseek-v4-pro', 4000);
    try {
      await probe.run();
      expect(probe.body()).toMatchObject({ max_tokens: 32_768, thinking: { type: 'enabled' } });
    } finally {
      probe.restore();
    }
  });

  it('nennt DeepSeek beim Namen, wenn nur gedacht und nichts geantwortet wurde', async () => {
    const probe = captureRequest('deepseek-v4-pro', 4000, {
      choices: [{ message: { content: '', reasoning_content: 'nur Gedanken' }, finish_reason: 'length' }],
    });
    try {
      await expect(probe.run()).rejects.toThrow('Leere Antwort von deepseek (finish_reason: length).');
    } finally {
      probe.restore();
    }
  });

  it('denkt nur außerhalb von Flash', () => {
    expect(deepSeekDenkt('deepseek-flash')).toBe(false);
    expect(deepSeekDenkt('deepseek-v4-flash')).toBe(false);
    expect(deepSeekDenkt('deepseek-v4-pro')).toBe(true);
  });
});
