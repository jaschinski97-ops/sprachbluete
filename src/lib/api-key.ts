import * as SecureStore from 'expo-secure-store';

import { PROVIDERS, ProviderId } from './providers/types';

/**
 * Ablage der API-Schlüssel.
 *
 * NACHGEPRÜFT, NICHT ANGENOMMEN (AE-10): `expo-secure-store@57.0.2` hat auf
 * Web **gar keine** Implementierung — `src/ExpoSecureStore.web.ts` besteht
 * aus `export default {}`. Entsprechend liefert `isAvailableAsync()` dort
 * `false` (es prüft `!!ExpoSecureStore.getValueWithKeyAsync`), und ein Aufruf
 * von `setItemAsync` würde mit „is not a function" scheitern.
 *
 * Daraus folgt:
 * - **Nativ (iOS/Android):** Schlüssel liegt im Keychain/Keystore und
 *   übersteht Neustarts.
 * - **Web, Entwickler-Studio (`__DEV__`):** Schlüssel wird im `localStorage`
 *   **im Klartext** abgelegt und beim nächsten Start wieder geladen —
 *   ausdrückliche Nutzerentscheidung vom 09.09.2026 für das lokale Debug-
 *   Studio: Der Schlüssel soll eingetragen bleiben und sichtbar sein, „es
 *   steht eh nur im Debug-Programm". Das Studio läuft nur auf localhost und
 *   ist dev-gegate; Produktions-Web-Builds nutzen weiterhin den reinen
 *   Sitzungsspeicher. Gegenüber der alten Regel (AE-10, „bewusst NICHT im
 *   localStorage") ist das bewusste Abweichen: Komfort im lokalen Dev-Werkzeug
 *   schlägt hier die Theorie, ein echtes Produktverhalten hat diese Ablage
 *   nie gesehen.
 * - **Web, Produktion:** Schlüssel bleibt **nur im Arbeitsspeicher**, für die
 *   laufende Sitzung — nach dem Neuladen weg.
 *
 * Die Weiche stellt `isAvailableAsync()` zur Laufzeit, nicht `Platform.OS` —
 * so verhält sich der Code richtig, falls eine Plattform die sichere Ablage
 * unerwartet nicht anbietet.
 *
 * SEIT PHASE 5 MEHRERE ANBIETER: Sprachsituationen, Bilder und Hörclips
 * brauchen je einen Schlüssel. Die Schlüssel liegen getrennt und nach genau
 * demselben Muster — ein gemeinsamer Schlüssel wäre schon deshalb falsch,
 * weil die Läufe unabhängig voneinander gestartet werden können und niemand
 * einen Schlüssel eintippen soll, den er gar nicht braucht.
 *
 * SEIT PHASE 10 NACH DEMSELBEN MUSTER GEZAHLT. Die Liste der Anbieter kommt
 * aus `providers/types.ts`, damit es nicht zwei Wahrheiten darüber gibt,
 * welche es gibt. NUTZERENTSCHEIDUNG 10.09.: `claude` und `stability` sind
 * aus der Liste gefallen — ihre Ablagenamen (`anthropic-api-key`,
 * `stability-api-key`) existieren in dieser Karte nicht mehr. Ein auf alten
 * Geräten noch vorhandener Eintrag im Keychain/localStorage bleibt dann
 * einfach liegen: unerreichbar, aber harmlos — ihn gezielt zu löschen, wäre
 * ein Eingriff in fremde Gerätedaten für einen Weg, den es nicht mehr gibt.
 */

export type Provider = ProviderId;
export { PROVIDERS };

const KEY_NAMES: Record<Provider, string> = {
  chatgpt: 'openai-api-key',
  // Der Helper hält seinen Schlüssel serverseitig in der Umgebung — für ihn
  // gibt es trotzdem einen eigenen Ablagenamen, damit die Struktur stimmt,
  // auch wenn ihn niemand nützen sollte.
  'chatgpt-helper': 'openai-helper-api-key',
  gemini: 'gemini-api-key',
  deepseek: 'deepseek-api-key',
  comfyui: 'comfyui-unused-key',
  'local-qwen': 'local-qwen-unused-key',
  'local-gemma': 'local-gemma-unused-key',
};

/** Nur für die laufende Sitzung, wenn keine sichere Ablage vorhanden ist. */
const sessionOnlyKeys: Record<Provider, string | null> = {
  chatgpt: null,
  'chatgpt-helper': null,
  gemini: null,
  deepseek: null,
  comfyui: null,
  'local-qwen': null,
  'local-gemma': null,
};

export type KeyStorageMode = 'secure-store' | 'local-dev' | 'session-only';

let cachedMode: KeyStorageMode | null = null;

/**
 * localStorage-Nutzung nur im Entwickler-Build (das Web-Studio läuft dort).
 * Produktions-Web bekommt den reinen Sitzungsspeicher — die Klartext-Ablage
 * ist eine bewusste Dev-Entscheidung (siehe Kopfkommentar) und soll niemals
 * in einen Release wandern.
 */
function localStorageAvailable(): boolean {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return false;
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function readLocalStorage(provider: Provider): string | null {
  try {
    return localStorage.getItem(KEY_NAMES[provider]);
  } catch {
    return null;
  }
}

function writeLocalStorage(provider: Provider, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY_NAMES[provider]);
    else localStorage.setItem(KEY_NAMES[provider], value);
  } catch {
    // Speichern gescheitert (Privatmodus, Vollstand) — wie session-only behandeln.
  }
}

export async function getKeyStorageMode(): Promise<KeyStorageMode> {
  if (cachedMode) return cachedMode;
  let available = false;
  try {
    available = await SecureStore.isAvailableAsync();
  } catch {
    available = false;
  }
  if (available) cachedMode = 'secure-store';
  else cachedMode = localStorageAvailable() ? 'local-dev' : 'session-only';
  return cachedMode;
}

export async function loadApiKey(provider: Provider): Promise<string | null> {
  const mode = await getKeyStorageMode();
  if (mode === 'session-only') {
    return sessionOnlyKeys[provider];
  }
  if (mode === 'local-dev') {
    return readLocalStorage(provider);
  }
  try {
    return await SecureStore.getItemAsync(KEY_NAMES[provider]);
  } catch {
    return null;
  }
}

export async function saveApiKey(key: string, provider: Provider): Promise<void> {
  const trimmed = key.trim();
  const mode = await getKeyStorageMode();
  if (mode === 'session-only') {
    sessionOnlyKeys[provider] = trimmed || null;
    return;
  }
  if (!trimmed) {
    await clearApiKey(provider);
    return;
  }
  if (mode === 'local-dev') {
    writeLocalStorage(provider, trimmed);
    return;
  }
  await SecureStore.setItemAsync(KEY_NAMES[provider], trimmed);
}

export async function clearApiKey(provider: Provider): Promise<void> {
  sessionOnlyKeys[provider] = null;
  const mode = await getKeyStorageMode();
  if (mode === 'local-dev') {
    writeLocalStorage(provider, null);
    return;
  }
  if (mode === 'session-only') return;
  try {
    await SecureStore.deleteItemAsync(KEY_NAMES[provider]);
  } catch {
    // Nichts gespeichert - kein Fehler.
  }
}

/** Nur für Tests. */
export function resetKeyStorageForTests(): void {
  for (const provider of PROVIDERS) {
    sessionOnlyKeys[provider] = null;
    if (localStorageAvailable()) writeLocalStorage(provider, null);
  }
  cachedMode = null;
}

/**
 * Grobe Formprüfung, damit ein offensichtlicher Tippfehler nicht erst nach
 * einem fehlgeschlagenen Netzwerkaufruf auffällt. Bewusst nachsichtig: das
 * Format der Schlüssel gehört uns nicht und kann sich ändern.
 */
export function looksLikeApiKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= 20 && !/\s/.test(trimmed);
}
