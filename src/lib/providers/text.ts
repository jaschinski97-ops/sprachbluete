import { fieldNamesOf, postJson } from './http';
import { ProviderId, TextClient, TextRequest, TextResponse, unsupported } from './types';

// Umfangreiche Wort-/Dialogpakete und ihre Prüfung brauchen mehrere Minuten.
const TEXT_REQUEST_TIMEOUT_MS = 5 * 60_000;

/**
 * Die Textanbieter hinter einer Schnittstelle.
 *
 * Die Prompts stehen weiterhin bei den Generatoren (Phase 4 für Dialoge,
 * Phase 7 für Prüfungsaufgaben) und sind hier nicht zu sehen — das ist der
 * Sinn der Naht. Hier steht nur, wie man aus „System + Nutzertext" bei den
 * verschiedenen Gegenstellen einen Antworttext bekommt.
 *
 * BEIDE WEGE SIND AUS DEM LAUFENDEN WEB-BUILD GEMESSEN (AE-26/AE-27):
 * ChatGPT und Gemini kommen ohne Sonderbehandlung durch und prüfen den
 * Schlüssel **vor** der Anfrage- und Antwortform — beide antworten auf jede
 * Anfrage mit demselben Auth-Fehler. Deshalb nennt der Parser unten im
 * Fehlerfall die tatsächlich gelieferten Feldnamen — dieselbe
 * Vorsichtsmaßnahme wie beim Bild-Parser aus AE-13.
 *
 * NUTZERENTSCHEIDUNG 10.09.: Claude (Anthropic-SDK, AE-12) ist aus der
 * Auswahl gefallen; sein Weg stand hier bis dahin unverändert.
 */

function textOrThrow(text: string, provider: ProviderId, detail: string): string {
  if (text.trim() === '') {
    throw new Error(`Leere Antwort von ${provider} (${detail}).`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// ChatGPT (OpenAI)
// ---------------------------------------------------------------------------

export const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Liest die Antwortform von `chat/completions` aus.
 *
 * NICHT GEGEN DIE LAUFENDE API BELEGT — OpenAI beantwortet auch einen völlig
 * leeren Anfragekörper mit `invalid_api_key`, prüft die Form also erst nach
 * dem Schlüssel (gemessen in Phase 10). Anders als bei Stability ließ sich
 * hier ohne bezahlten Schlüssel nichts festklopfen. Deshalb steht in der
 * Fehlermeldung, was wirklich kam.
 */
export function parseOpenAiText(payload: unknown, fallbackModel: string): TextResponse {
  const data = payload as Record<string, unknown> | null;
  const choices = data?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(
      `Antwort enthielt kein Feld "choices" (gelieferte Felder: ${fieldNamesOf(payload)}).`
    );
  }
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  const text = typeof content === 'string' ? content : '';
  const usage = data?.usage as Record<string, unknown> | undefined;

  return {
    text: textOrThrow(text, 'chatgpt', `finish_reason: ${String(first.finish_reason)}`),
    model: typeof data?.model === 'string' ? data.model : fallbackModel,
    usage: verbrauch({ input: usage?.prompt_tokens, output: usage?.completion_tokens }),
  };
}

export function createOpenAiTextClient(apiKey: string, model: string): TextClient {
  return {
    provider: 'chatgpt',
    model,
    async complete(request: TextRequest): Promise<TextResponse> {
      const payload = await postJson({
        url: OPENAI_CHAT_ENDPOINT,
        timeoutMs: TEXT_REQUEST_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          // `max_completion_tokens` und nicht `max_tokens`: Letzteres lehnen
          // die neueren Modelle ab, Ersteres nehmen auch die aelteren an.
          // Nicht messbar ohne gueltigen Schluessel - wenn die API sich hier
          // beschwert, ist es genau diese Zeile.
          max_completion_tokens: request.maxTokens,
        },
      });
      return parseOpenAiText(payload, model);
    },
  };
}

// ---------------------------------------------------------------------------
// Gemini (Google)
// ---------------------------------------------------------------------------

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiEndpoint(model: string, method: string): string {
  // Der Modellname kommt aus einem Freitextfeld (Pflicht 5) und landet im
  // Pfad. Kodiert wird er trotzdem, damit ein Tippfehler mit Schraegstrich
  // keine fremde Adresse baut.
  return `${GEMINI_BASE}/${encodeURIComponent(model.trim())}:${method}`;
}

/**
 * Liest die Antwortform von `generateContent` aus.
 *
 * Wie bei OpenAI ungetestet gegen die laufende API: Google beantwortet mit
 * ungültigem Schlüssel **alles** gleich — erfundenes Modell, fehlendes
 * Pflichtfeld, sogar ein GET auf die Modellliste — nämlich mit
 * „API key not valid" (gemessen in Phase 10, AE-26). Das ist genau der Punkt,
 * an dem AE-13 sich seinerzeit gegen Google entschieden hat.
 */
export function parseGeminiText(payload: unknown, fallbackModel: string): TextResponse {
  const data = payload as Record<string, unknown> | null;
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    // Bei gesperrtem Prompt liefert Google statt Kandidaten ein
    // promptFeedback - das gehoert in die Meldung, sonst raetselt man.
    const feedback = data?.promptFeedback;
    throw new Error(
      `Antwort enthielt keine "candidates" (gelieferte Felder: ${fieldNamesOf(payload)})` +
        (feedback ? `; promptFeedback: ${JSON.stringify(feedback).slice(0, 200)}` : '') +
        '.'
    );
  }
  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? (content!.parts as Record<string, unknown>[]) : [];
  const text = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  const zähler = data?.usageMetadata as Record<string, unknown> | undefined;

  return {
    text: textOrThrow(text, 'gemini', `finishReason: ${String(first.finishReason)}`),
    model: typeof data?.modelVersion === 'string' ? data.modelVersion : fallbackModel,
    usage: verbrauch({
      input: zähler?.promptTokenCount,
      // candidatesTokenCount zählt nur die Antwort; das Denken steht in
      // thoughtsTokenCount und ist ebenso bezahlt — also dazunehmen.
      output: Number(zähler?.candidatesTokenCount ?? 0) +
        Number(zähler?.thoughtsTokenCount ?? 0) || undefined,
    }),
  };
}

/** Formt die Anbieter-Felder in die kleine Verbrauchs-Angabe — oder lässt sie weg. */
function verbrauch(werte: { input?: unknown; output?: unknown }): TextResponse['usage'] {
  const input = Number(werte.input);
  const output = Number(werte.output);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return undefined;
  return { inputTokens: input, outputTokens: output };
}

export function createGeminiTextClient(apiKey: string, model: string): TextClient {
  return {
    provider: 'gemini',
    model,
    async complete(request: TextRequest): Promise<TextResponse> {
      const payload = await postJson({
        url: geminiEndpoint(model, 'generateContent'),
        timeoutMs: TEXT_REQUEST_TIMEOUT_MS,
        // Schluessel im HEADER, nicht als `?key=` im Pfad. Beides kommt laut
        // Messung durch CORS; der Header ist der bessere Weg, weil eine URL
        // in Verlaufslisten, Protokollen und Fehlermeldungen landet.
        headers: { 'x-goog-api-key': apiKey },
        body: {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: { maxOutputTokens: request.maxTokens },
        },
      });
      return parseGeminiText(payload, model);
    },
  };
}

// ---------------------------------------------------------------------------

export function createTextClient(provider: ProviderId, apiKey: string, model: string): TextClient {
  switch (provider) {
    case 'local-qwen':
    case 'local-gemma':
      return { provider, model, async complete(request) {
        const payload = await postJson({ url:'http://localhost:8082/api/local/text', timeoutMs:600000,
          headers:{}, body:{provider, model, ...request} });
        return parseOpenAiText(payload, model);
      }};
    case 'chatgpt':
      return createOpenAiTextClient(apiKey, model);
    case 'gemini':
      return createGeminiTextClient(apiKey, model);
    default:
      throw unsupported(provider, 'text');
  }
}
