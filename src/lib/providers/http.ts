/**
 * Gemeinsame Kleinteile für die selbst geschriebenen Anbieter-Clients.
 *
 * WARUM SELBST GESCHRIEBEN UND NICHT SDKs: ChatGPT und Gemini bräuchten je
 * ein Node-SDK — und genau darin lag die Versuchung: Jedes zusätzliche
 * Node-SDK im Browser-Bundle bringt sein eigenes Auflösungsverhalten mit,
 * und AE-12 hält fest, was das beim ersten SDK (Anthropic, inzwischen
 * entfernt) gekostet hat („Unable to resolve module
 * ./lib/credentials/types.js"). Beide Anbieter brauchen hier genau **einen**
 * POST mit JSON — dafür Megabyte Abhängigkeit einzuhandeln, wäre das
 * schlechtere Geschäft.
 */

/**
 * Beschreibt einen fehlgeschlagenen Aufruf so, dass die Ursache aus der
 * Fehlerliste des Laufs hervorgeht.
 *
 * DER CORS-HINWEIS IST KEIN SCHMUCK. `TypeError: Failed to fetch` ist die
 * einzige Auskunft, die der Browser bei einer CORS-Blockade herausgibt — der
 * eigentliche Grund steht nur in der Entwicklerkonsole, die im fertigen Build
 * niemand offen hat. Phase 10 hat Stunden damit verbracht, genau diesen einen
 * Satz zu entschlüsseln (AE-27); niemand sonst soll das noch einmal tun
 * müssen.
 */
export function describeNetworkFailure(error: unknown, endpointHost: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (!/failed to fetch|networkerror|load failed/i.test(message)) {
    return error instanceof Error ? error : new Error(message);
  }

  // Der gemessene Sonderfall bekommt seine eigene Erklaerung, weil er sonst
  // wie ein kaputter Schluessel aussieht - und weil er JEDEN echten
  // OpenAI-Schluessel betrifft (AE-27).
  const openAiHinweis = /openai\.com$/.test(endpointHost)
    ? ' Bei OpenAI ist das im Browser der Normalfall: gemessen wurde, dass ein POST ' +
      'mit einem Schlüssel, der mit „sk-" beginnt, eine Antwort ohne CORS-Header ' +
      'bekommt — und so beginnt jeder echte OpenAI-Schlüssel.'
    : '';

  return new Error(
    `Keine Antwort von ${endpointHost} (${message}). Im Browser ist das fast immer ` +
      'CORS: der Anbieter erlaubt den direkten Aufruf aus einer Webseite nicht ' +
      `(oder der Pfad stimmt nicht).${openAiHinweis} Am Gerät gibt es kein CORS — ` +
      'dort kann derselbe Aufruf funktionieren.'
  );
}

/**
 * Zieht aus einer Fehlerantwort heraus, was sich herausziehen lässt.
 *
 * Beide Anbieter melden Fehler in derselben Form `{"error":{…}}`; die
 * string- und message/name-Fälle fangen abweichende Antworten ab. Die Formen
 * stehen hier zusammen, statt dass jeder Client seinen eigenen Leser
 * mitbringt: Was in der Fehlerliste eines Laufs landet, soll überall gleich
 * aussehen.
 */
export function describeHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;

    const error = parsed.error;
    if (typeof error === 'string') return `HTTP ${status}: ${error}`;
    if (error && typeof error === 'object') {
      const detail = error as Record<string, unknown>;
      const text = [detail.message, detail.type, detail.status]
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join(' — ');
      if (text) return `HTTP ${status}: ${text}`;
    }
    if (typeof parsed.message === 'string') return `HTTP ${status}: ${parsed.message}`;
    if (typeof parsed.name === 'string') return `HTTP ${status}: ${parsed.name}`;
  } catch {
    // Keine JSON-Antwort - dann eben der Rohtext.
  }
  return `HTTP ${status}: ${body.slice(0, 200) || 'ohne Inhalt'}`;
}

/**
 * Keine Cookies an fremde APIs.
 *
 * Beide Anbieter authentifizieren über einen Header; Cookies werden nie
 * gebraucht und hätten an einer fremden API auch nichts zu suchen. Zusätzlich
 * verträgt sich eine Anfrage **mit** Anmeldedaten nicht mit einem
 * `Access-Control-Allow-Origin: *`, wie OpenAI es schickt — der Browser
 * verwirft die Antwort dann, obwohl sie da ist.
 *
 * ZUR EHRLICHKEIT: Das war in Phase 10 zuerst der Verdacht für den
 * OpenAI-Fehlschlag und ist es **nicht** gewesen; die Ursache steht in AE-27
 * und liegt am Präfix des Schlüssels. Diese Zeile bleibt trotzdem, weil sie
 * für sich richtig ist — aber sie hat nichts repariert.
 */
const NO_CREDENTIALS: RequestCredentials = 'omit';

export type JsonPostOptions = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /**
   * Zeitlimit für EINEN Versuch in Millisekunden. Standard 30 s — groß genug
   * für langsame Bild- und Audioantworten, klein genug, dass eine tote
   * Verbindung den Aufrufer nicht für immer hängt.
   */
  timeoutMs?: number;
};

const REQUEST_TIMEOUT_MS = 30_000;
/**
 * GENAU EIN zweiter Versuch, und zwar nur für Fehler, die fetch selbst wirft:
 * abgebrochene Verbindung oder Zeitlimit. Eine HTTP-Fehlerantwort (4xx/5xx)
 * ist eine ANTWORT — ein 401 bleibt auch beim zweiten Mal 401, und 5xx mit
 * einem Retry zu begegnen, hätte der Schlüsselinhaber der App besser verboten.
 */
const MAX_ATTEMPTS = 2;
/** Kurze Pause vor dem Wiederholungsversuch — lang genug, dass ein kurz gestörtes Netz sich fängt. */
const RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Macht den Zeitlimit-Abbruch für die Fehlerliste benennbar.
 *
 * Ein roher Abbruch-Fehler heißt je nach Plattform nur „signal timed out" oder
 * „The operation was aborted" — nach demselben Maßstab wie CORS-Meldungen
 * (AE-27) darf das nicht als Rätsel in der Fehlerliste enden.
 */
function describeTimeoutFailure(error: unknown, host: string, timeoutMs: number): unknown {
  const asError = error instanceof Error ? error : null;
  const indikator = asError ? `${asError.name} ${asError.message}` : String(error);
  if (!/abort|timed?[\s-]?out|timeout/i.test(indikator)) return error;
  return new Error(
    `Keine Antwort von ${host} innerhalb von ${Math.round(timeoutMs / 1000)} s ` +
      '(Zeitlimit abgelaufen). Entweder ist das Netz gerade gestört oder der Anbieter ' +
      'antwortet nicht.'
  );
}

/**
 * Der gemeinsame POST-Kern: Timeout je Versuch, ein Wiederholungsversuch nur
 * bei Netzwerk-/Timeout-Fehlern. Liefert die rohe Response — HTTP-Fehler
 * behandeln die Aufrufer mit `describeHttpError`, denn was eine Antwort ist,
 * wird nicht erneut gefragt.
 */
async function postWithRetry(options: JsonPostOptions): Promise<Response> {
  const host = hostOf(options.url);
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let networkFailure: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: JSON.stringify(options.body),
        credentials: NO_CREDENTIALS,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      networkFailure = error;
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }
  throw describeNetworkFailure(describeTimeoutFailure(networkFailure, host, timeoutMs), host);
}

/**
 * Eine HTTP-Fehlerantwort mit Status und Warte-Hinweis des Anbieters.
 *
 * Die Meldung bleibt dieselbe wie zuvor (`describeHttpError`); dazu kommen
 * die Felder, an denen die Drossel (`generation/drossel.ts`, 23.10.2026) ein
 * Ratenlimit erkennt, ohne den Text zu raten: `status` und — falls der
 * Anbieter es sagt — `retryAfterMs` aus dem Header `Retry-After` oder aus
 * Geminis `retryDelay` („17s“) im Fehlerkörper.
 */
export class HttpStatusError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(status: number, body: string, retryAfterHeader?: string | null) {
    super(describeHttpError(status, body));
    this.name = 'HttpStatusError';
    this.status = status;
    const wartezeit = warteHinweisMs(retryAfterHeader, body);
    if (wartezeit !== undefined) this.retryAfterMs = wartezeit;
  }
}

/** Retry-After (Sekunden oder Datum) bzw. Geminis `"retryDelay": "17s"`. */
export function warteHinweisMs(header: string | null | undefined, body = ''): number | undefined {
  const wert = header?.trim();
  if (wert) {
    if (/^\d+(\.\d+)?$/.test(wert)) return Math.round(Number(wert) * 1000);
    const datum = Date.parse(wert);
    if (Number.isFinite(datum)) return Math.max(0, datum - Date.now());
  }
  const gemini = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return gemini ? Math.round(Number(gemini[1]) * 1000) : undefined;
}

async function httpFehler(response: Response): Promise<HttpStatusError> {
  return new HttpStatusError(response.status, await response.text(), response.headers.get('retry-after'));
}

/** Ein POST mit JSON hin und JSON zurück — mit sprechenden Fehlern. */
export async function postJson(options: JsonPostOptions): Promise<unknown> {
  const host = hostOf(options.url);

  const response = await postWithRetry(options);

  if (!response.ok) {
    throw await httpFehler(response);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error(`Antwort von ${host} war kein gültiges JSON.`);
  }
}

/**
 * Ein POST mit JSON hin und **Binärdaten** zurück — für Anbieter, die eine
 * Audiodatei direkt liefern statt JSON mit Base64 (OpenAI, Phase 11).
 */
export async function postForBytes(
  options: JsonPostOptions
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const response = await postWithRetry(options);

  if (!response.ok) {
    throw await httpFehler(response);
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? '',
  };
}

export function hostOf(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1] : url;
}

/** Die Feldnamen einer Antwort — für Fehlermeldungen, die weiterhelfen. */
export function fieldNamesOf(value: unknown): string {
  if (typeof value !== 'object' || value === null) return typeof value;
  return Object.keys(value as Record<string, unknown>).join(', ') || 'keine';
}
