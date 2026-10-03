// One explicitly selected local llama.cpp model; never a cloud fallback.
const MODELS = { 'local-qwen': 'qwen3.5-9b', 'local-gemma': 'gemma-4-12b' };
async function generateLocalText(data, request = fetch) {
  const model = MODELS[data?.provider];
  if (!model || data.model !== model) throw Error('Unbekanntes lokales Textmodell.');
  if (typeof data.system !== 'string' || typeof data.user !== 'string' || !data.user.trim() || data.system.length + data.user.length > 200000) throw Error('Ungültiger Textauftrag.');
  const base = 'http://127.0.0.1:8090';
  const listed = await request(base + '/v1/models', { signal: AbortSignal.timeout(10000) });
  if (!listed.ok || !(await listed.json()).data?.some(item => item.id === model)) throw Error(`Bitte ${model} mit scripts/content/start-local-text.ps1 starten. Kein automatischer Anbieterwechsel.`);
  const response = await request(base + '/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(570000),
    body: JSON.stringify({ model, messages: [{role:'system', content:data.system}, {role:'user', content:data.user}],
      max_tokens: Math.min(8192, Math.max(1, Number(data.maxTokens) || 8192)),
      temperature: 0.6, stream: false, response_format: {type:'json_object'}, chat_template_kwargs: { enable_thinking: false } }),
  });
  if (!response.ok) throw Error(`Lokales Textmodell: HTTP ${response.status}`);
  const result = await response.json();
  if (result.model !== model) throw Error('Der lokale Server antwortet mit einem anderen Modell.');
  if (result.choices?.[0]?.finish_reason === 'length') throw Error('Lokale Antwort abgeschnitten. Kleineres Wortpaket verwenden.');
  return result;
}
module.exports = { generateLocalText, MODELS };
