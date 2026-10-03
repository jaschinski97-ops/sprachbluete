import { readMeta, writeMeta } from '../repository';
import { DataStore } from '../storage';

import {
  isProviderId,
  PROVIDER_INFO,
  ProviderCapability,
  ProviderId,
  providersFor,
} from './types';

/**
 * Welcher Anbieter und welches Modell je Generator-Gruppe (Phase 10).
 *
 * VIER GRUPPEN, NICHT EINE EINSTELLUNG FÜR ALLES. Wer Dialoge von OpenAI und
 * Bilder von Gemini haben will, soll das können. Eine einzige App-weite
 * Anbieterwahl wäre eine Einschränkung ohne Not — die Trennung kostet nichts
 * und bleibt, auch wenn seit der Nutzerentscheidung vom 10.09. („Entferne bei
 * den KIs Claude und Stability") beide Cloud-Anbieter alle drei Fähigkeiten
 * abdecken.
 *
 * ABGELEGT IN DER SAMMLUNG `meta`, neben dem Lernprofil aus AE-17 — dieselbe
 * Stelle, die seit Phase 1 für „Einstellungen, Lernprofil, Zähler" vorgesehen
 * ist. **Ohne Schlüssel**: die Wahl ist eine Vorliebe, keine Geheimnis; die
 * Schlüssel liegen weiterhin getrennt und je Anbieter nach AE-10.
 *
 * NACHSICHTIG GELESEN wie das Lernprofil und die Dokumente an der Lesegrenze
 * (AE-25): Eine gespeicherte Einstellung aus einer älteren Version kann einen
 * Anbieter nennen, den es nicht mehr gibt — seit dem 10.09. trifft das jeden
 * gespeicherten `claude`/`stability`-Stand —, oder einen, der die verlangte
 * Fähigkeit gar nicht hat. Beides ergibt den Standard der Gruppe statt eines
 * Absturzes — Einstellungen sind kein Grund, eine App unbenutzbar zu machen.
 */

const SETTINGS_KEY = 'generators';

// Phase 2, Schritt 3: 'exam' ist aus den Generator-Gruppen gefallen —
// der Prüfungsaufgaben-Generator ist entfernt, die Prüfungen sind
// mitgeliefert (src/data/exam-modules.ts).
// Nutzerwunsch 15.09.: Wortschatz bekommt eine EIGENE Wahl (Anbieter +
// Modell), damit die Erzeugung nicht still die Dialog-Einstellung
// ('situations') mitbenutzt.
export const GENERATOR_GROUPS = ['situations', 'images', 'audio', 'vocabulary'] as const;
export type GeneratorGroupId = (typeof GENERATOR_GROUPS)[number];

export type GeneratorGroupInfo = {
  id: GeneratorGroupId;
  label: string;
  needs: ProviderCapability;
  defaultProvider: ProviderId;
};

export const GENERATOR_GROUP_INFO: Record<GeneratorGroupId, GeneratorGroupInfo> = {
  situations: {
    id: 'situations',
    label: 'Sprachsituationen',
    needs: 'text',
    // NUTZERENTSCHEIDUNG 10.09.: Der bisherige Text-Default Claude ist aus der
    // Auswahl gefallen — der Default MUSS deshalb wandern. Gemini, weil die
    // Audio-Gruppe ihn schon trägt (derselbe Schlüssel deckt dann alle
    // Textgruppen) und sein Web-Weg gemessen ist (AE-26).
    defaultProvider: 'gemini',
  },
  images: {
    id: 'images',
    label: 'Bilder',
    needs: 'image',
    // Lokale Bilder, ohne Änderung der Text- oder Audio-Wahl.
    defaultProvider: 'comfyui',
  },
  audio: {
    id: 'audio',
    label: 'Hörclips',
    needs: 'audio',
    // Kein Bestand, also die Wahl nach Messung: Gemini kam zuerst aus dem
    // Browser durch (AE-31); ChatGPT folgte mit der Nachmessung vom
    // 08.09.2026 (CORS-Header, siehe types.ts). Der Bestand bleibt bei
    // Gemini — ein Default wandert nicht still mit.
    defaultProvider: 'gemini',
  },
  vocabulary: {
    id: 'vocabulary',
    label: 'Wortschatz',
    needs: 'text',
    defaultProvider: 'gemini',
  },
};

export type GeneratorChoice = {
  provider: ProviderId;
  /** Nur bei Sprachausgabe: die Stimme des Anbieters. Freitext wie das Modell. */
  voice?: string;
  /**
   * Freitext. **Nicht validiert** (Pflicht 5): Modellnamen wechseln zu oft,
   * um sie einzufrieren, und ein Katalog im Code wäre schon beim nächsten
   * Modellwechsel falsch — dann aber auf die schlimmste Art, nämlich indem er
   * ein gültiges Modell ablehnt.
   */
  model: string;
  /**
   * Nur Wortschatz: das Modell der PRÜFUNG (Kreuzprüfung/Selbstprüfung).
   * Freitext wie `model`. Gehört zum bei `checkProvider` gewählten Prüf-
   * Anbieter — ohne `checkProvider` zum jeweiligen anderen (Kreuzregel).
   */
  checkModel?: string;
  /**
   * Nur Wortschatz: der Prüf-ANBIETER. Leer/unbekannt = die Kreuzregel
   * („der jeweils andere Anbieter"). NUTZERWUNSCH 15.09.: Wer den Prüfer
   * explizit wählt, bekommt ihn — gleiches Prinzip wie beim Freitext-Modell,
   * die Verantwortung für eine sinnvolle (unabhängige) Kombination wandert
   * mit der Wahl zur nutzenden Person. Wahl = Erzeuger gilt als Selbstprüfung
   * (zwei Runden, „einfach geprüft").
   */
  checkProvider?: ProviderId;
};

export type GeneratorSettings = Record<GeneratorGroupId, GeneratorChoice>;

export function defaultModelFor(provider: ProviderId, needs: ProviderCapability): string {
  return PROVIDER_INFO[provider].modelPlaceholder[needs];
}

export function defaultVoiceFor(provider: ProviderId): string {
  return PROVIDER_INFO[provider].voicePlaceholder;
}

export function defaultChoiceFor(group: GeneratorGroupId): GeneratorChoice {
  const info = GENERATOR_GROUP_INFO[group];
  const choice: GeneratorChoice = {
    provider: info.defaultProvider,
    model: defaultModelFor(info.defaultProvider, info.needs),
  };
  if (info.needs === 'audio') choice.voice = defaultVoiceFor(info.defaultProvider);
  return choice;
}

export function defaultSettings(): GeneratorSettings {
  return {
    situations: defaultChoiceFor('situations'),
    images: defaultChoiceFor('images'),
    audio: defaultChoiceFor('audio'),
    vocabulary: defaultChoiceFor('vocabulary'),
  };
}

/** Welche Anbieter für diese Gruppe überhaupt in Frage kommen. */
export function providersForGroup(group: GeneratorGroupId) {
  return providersFor(GENERATOR_GROUP_INFO[group].needs);
}

/**
 * Macht aus einem gespeicherten Wert eine brauchbare Wahl — oder dem Standard.
 *
 * Ein leeres Modellfeld ist ausdrücklich **kein** Fehler: Wer das Feld leert,
 * will den Vorschlag des Anbieters, nicht eine Fehlermeldung.
 *
 * SEIT DER ANBIETER-ENTFERNUNG (10.09.): Fällt der gespeicherte Anbieter auf
 * den Gruppen-Default zurück — weil es ihn nicht mehr gibt (alter
 * `claude`/`stability`-Stand) oder weil er die Aufgabe nicht kann —, wandert
 * Modell (und Stimme) mit in den Default. Dieselbe Regel wie bei
 * `setGeneratorProvider`: Der bisherige Name gehört dem alten Anbieter, und
 * `claude-opus-5` an Gemini geschickt wäre nur ein Fehlschlag, den niemand
 * mit dem stillen Wechsel in Verbindung brächte.
 */
export function normalizeChoice(raw: unknown, group: GeneratorGroupId): GeneratorChoice {
  const info = GENERATOR_GROUP_INFO[group];
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const gespeichert = value.provider;
  if (!isProviderId(gespeichert) || !PROVIDER_INFO[gespeichert].can[info.needs]) {
    return defaultChoiceFor(group);
  }

  const model =
    typeof value.model === 'string' && value.model.trim() !== ''
      ? value.model.trim()
      : defaultModelFor(gespeichert, info.needs);

  const choice: GeneratorChoice = { provider: gespeichert, model };
  if (typeof value.checkModel === 'string' && value.checkModel.trim() !== '') {
    choice.checkModel = value.checkModel.trim();
  }
  if (isProviderId(value.checkProvider)) {
    choice.checkProvider = value.checkProvider;
  }
  if (info.needs === 'audio') {
    choice.voice =
      typeof value.voice === 'string' && value.voice.trim() !== ''
        ? value.voice.trim()
        : defaultVoiceFor(gespeichert);
  }
  return choice;
}

export async function loadGeneratorSettings(store?: DataStore): Promise<GeneratorSettings> {
  const stored = await readMeta<Record<string, unknown>>(SETTINGS_KEY, {}, store);
  return {
    situations: normalizeChoice(stored?.situations, 'situations'),
    images: normalizeChoice(stored?.images, 'images'),
    audio: normalizeChoice(stored?.audio, 'audio'),
    vocabulary: normalizeChoice(stored?.vocabulary, 'vocabulary'),
  };
}

export async function setGeneratorChoice(
  group: GeneratorGroupId,
  choice: Partial<GeneratorChoice>,
  store?: DataStore
): Promise<GeneratorSettings> {
  const current = await loadGeneratorSettings(store);
  const merged = normalizeChoice({ ...current[group], ...choice }, group);
  const next: GeneratorSettings = { ...current, [group]: merged };
  await writeMeta(SETTINGS_KEY, next, store);
  return next;
}

/**
 * Anbieter wechseln — und dabei den Modellnamen mitziehen.
 *
 * Der bisherige Name gehört dem alten Anbieter: ein OpenAI-Modellname an
 * Gemini zu schicken ergibt nur einen Fehlschlag, den niemand sofort mit dem
 * Wechsel in Verbindung bringt. Deshalb setzt ein Anbieterwechsel den
 * Vorschlag des neuen Anbieters ein. Wer einen eigenen Namen eingetragen
 * hatte, tippt ihn neu — das ist der seltenere Fall und der offensichtlichere
 * Verlust.
 */
export async function setGeneratorProvider(
  group: GeneratorGroupId,
  provider: ProviderId,
  store?: DataStore
): Promise<GeneratorSettings> {
  return setGeneratorChoice(
    group,
    {
      provider,
      model: defaultModelFor(provider, GENERATOR_GROUP_INFO[group].needs),
      voice: defaultVoiceFor(provider),
    },
    store
  );
}
