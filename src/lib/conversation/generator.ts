import { UI_LANGUAGES } from '../i18n/types';
import { LEARNING_LANGUAGES, passtZurSchrift } from '../languages/definitions';
import { createTextClient } from '../providers/text';
import { PROVIDER_INFO, ProviderId, TextClient } from '../providers/types';

import type { VocabEntry } from '@/data/vocab-types';

import { pruefeZielwoerter } from './dialog-words';
import {
  isValidSituation,
  SITUATION_SPRACHEN,
  ConversationSituation,
  ConversationTurn,
  CorrectionHint,
  SituationSpec,
  TOPIC_LABELS,
  TOPICS,
} from './types';

/**
 * Erzeugt eine einzelne Sprachsituation über ein Sprachmodell.
 *
 * Der Aufruf geht direkt vom Gerät bzw. Browser an die API — es gibt keinen
 * eigenen Server, und der Schlüssel verlässt das Gerät nur in Richtung des
 * gewählten Anbieters.
 *
 * SEIT PHASE 10 IST DER ANBIETER WÄHLBAR. Was sich dadurch **nicht** ändert:
 * der Prompt, die strenge Prüfung der Antwort und das Verhalten des
 * Batch-Laufs. Diese Datei kennt keinen Anbieter, sondern nur noch einen
 * `TextClient` — wie der Text zustande kommt, steht in
 * `lib/providers/text.ts`. NUTZERENTSCHEIDUNG 10.09.: Der frühere Default
 * Claude ist aus der Auswahl gefallen; das Modell-Vorgabefeld folgt dem
 * neuen Gruppen-Default Gemini.
 *
 * ANTWORTFORMAT: Es wird JSON im Prompt verlangt und danach **streng
 * geprüft**, statt `output_config.format` zu benutzen. Grund: Die Pipeline
 * ließ sich hier ohne echten Schlüssel nicht gegen die API testen; ein Fehler
 * im Schema-Parameter hätte jeden einzelnen Aufruf zum Scheitern gebracht,
 * während sich eine unerwartete Antwortform hier als *ein* fehlgeschlagener
 * Eintrag zeigt, den der Batch übersteht. Sobald ein echter Lauf die Basis
 * bestätigt, sind strukturierte Ausgaben die natürliche Verbesserung.
 */

/** Voreinstellung, kein Zwang — das Modell ist ein Freitextfeld (Pflicht 5). */
export const GENERATOR_MODEL = PROVIDER_INFO.gemini.modelPlaceholder.text;

/**
 * Antwortlänge. Großzügig, weil ein abgeschnittenes JSON den ganzen Eintrag
 * kostet und ein Fehlschlag teurer ist als ein paar ungenutzte Token.
 */
export const GENERATOR_MAX_TOKENS = 32768;

export type GenerationClient = {
  generate(spec: SituationSpec): Promise<ConversationSituation>;
};

function systemPrompt(): string {
  return [
    'Du erstellst Lernmaterial für eine Sprachlern-App für Thai, Englisch, Spanisch und Deutsch.',
    'Du antwortest ausschließlich mit einem einzigen JSON-Objekt, ohne',
    'Markdown-Codeblock, ohne Vor- oder Nachtext.',
  ].join(' ');
}

export function userPrompt(spec: SituationSpec): string {
  const language = SITUATION_SPRACHEN.find(item => item.direction === spec.direction)?.sprache;
  if (!language) throw Error('Unbekannte Gesprächssprache.');
  const name = LEARNING_LANGUAGES[language].label;
  const focus = TOPICS.find((topic) => topic.id === spec.topic)?.focus;
  const ziel = spec.targetWords ?? [];
  return `Erstelle eine natürliche Dialogsituation zum Üben von ${name}.
Thema: ${TOPIC_LABELS[spec.topic]}${focus ? ` (zum Beispiel ${focus})` : ''}. Niveau: ${spec.level}. Variante: ${spec.variant}.
${ziel.length ? `${wortAuftrag(ziel, spec.reviewWords ?? [], name)}
8 bis 14 abwechselnde Gesprächszüge` : '6 bis 10 abwechselnde Gesprächszüge'} (speaker: learner oder partner), mindestens eine learner-Zeile.
${spec.level.startsWith('A') ? 'Benutze häufigen Alltagswortschatz und kurze vollständige Sätze.' : spec.level.startsWith('B') ? 'Selbstständige Alltagsgespräche, Meinungen und Begründungen mit abwechslungsreicher Grammatik.' : 'Differenzierte Diskussion, präzise idiomatische Formulierungen und komplexe Satzstrukturen.'}
Alle targetText-Zeilen sind ausschließlich auf ${name}, unabhängig vom Sprecher.
${LEARNING_LANGUAGES[language].dialogRules}
german ist die deutsche Bedeutung. thai ist die Thai-Übersetzung (bei Thai gleich targetText).
2 bis 4 hilfreiche Korrektur-Hinweise für Lernende dieser Zielsprache.
Übersetze Titel, Szenenbeschreibung, ALLE Gesprächszeilen und Korrektur-Hinweise in JEDE dieser App-Sprachen: ${UI_LANGUAGES.join(', ')}.
Die Reihenfolge und Anzahl der turns und corrections ist in jeder Übersetzung IDENTISCH.
Keine neuen Gesprächszeilen erfinden. Für die Zielsprache entsprechen turns exakt targetText.
JSON ohne Markdown:
{"title":"deutscher Titel","setting":"deutsche Szenenbeschreibung",
"scriptTurns":[{"speaker":"partner","targetText":"Satz auf ${name}","thai":"Thai-Übersetzung","roman":"Lesehilfe","german":"deutsche Bedeutung"}],
"corrections":[{"issue":"typischer Fehler","explanation":"Erklärung auf Deutsch"}],
"translations":{"de":{"title":"Titel","setting":"Beschreibung","turns":["übersetzter Satz"],"corrections":[{"issue":"Fehler","explanation":"Erklärung"}]}, "en": {"title":"...","setting":"...","turns":["..."],"corrections":[{"issue":"...","explanation":"..."}]}}}
translations muss ALLE ${UI_LANGUAGES.length} Sprachcodes enthalten, nicht nur die beiden Beispiele.`;
}

const wortZeile = (word: VocabEntry) => `${word.term} (${word.german})`;

/**
 * Der Wortteil des Auftrags (24.10.2026): erst die Wörter, dann der Dialog.
 * Die Zielwörter MÜSSEN vorkommen; geprüft wird nach der Erzeugung.
 */
function wortAuftrag(ziel: readonly VocabEntry[], wiederholung: readonly VocabEntry[], name: string): string {
  return [
    `Zielwörter — JEDES davon muss mindestens einmal in den targetText-Zeilen auf ${name} vorkommen, gern gebeugt, verteilt auf beide Sprecher:`,
    ziel.map(wortZeile).join('; '),
    ...(wiederholung.length ? ['Schon bekannte Wörter zum Wiederholen (gern einbauen, nicht Pflicht):', wiederholung.map(wortZeile).join('; ')] : []),
    'Baue die Szene innerhalb des Themas so, dass alle Zielwörter natürlich passen. Bleib beim Niveau; wenig weitere neue Wörter.',
  ].join('\n');
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Feld "${field}" fehlt oder ist leer.`);
  }
  return value.trim();
}

/**
 * Prüft die Antwort streng, bevor sie gespeichert wird.
 *
 * Lieber ein Eintrag als Fehlschlag im Protokoll als eine halbe Situation im
 * Offline-Bestand, die beim Üben auffällt.
 */
export function parseSituation(
  raw: string,
  spec: SituationSpec,
  modelUsed: string,
  now: number = Date.now()
): ConversationSituation {
  let text = raw.trim();
  // Falls doch ein Codeblock kommt: Zäune abstreifen statt zu scheitern.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) text = fenced[1].trim();
  // 17.09.: Drei von vier Aufrufen des Nutzer-Laufs scheiterten an „kein
  // gültiges JSON" — die Modelle liefern gelegentlich Prosa um das Objekt
  // („Hier ist …:"). Erstes { bis letztes } schält das Objekt heraus; gibt es
  // keins, bleibt der Parse-Fehler darunter die ehrliche Antwort.
  const objektStart = text.indexOf('{');
  const objektEnde = text.lastIndexOf('}');
  if (objektStart !== -1 && objektEnde > objektStart) {
    text = text.slice(objektStart, objektEnde + 1);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Antwort war kein gültiges JSON.');
  }

  const turnsRaw = data.scriptTurns;
  if (!Array.isArray(turnsRaw) || turnsRaw.length < 2) {
    throw new Error('scriptTurns fehlt oder hat weniger als zwei Züge.');
  }

  const scriptTurns: ConversationTurn[] = turnsRaw.map((turn, index) => {
    const t = turn as Record<string, unknown>;
    const speaker = t.speaker;
    if (speaker !== 'learner' && speaker !== 'partner') {
      throw new Error(`Zug ${index + 1}: speaker muss "learner" oder "partner" sein.`);
    }
    return {
      speaker,
      ...(t.targetText !== undefined ? { targetText: asString(t.targetText, `scriptTurns[${index}].targetText`) } : {}),
      thai: asString(t.thai, `scriptTurns[${index}].thai`),
      roman: asString(t.roman, `scriptTurns[${index}].roman`),
      german: asString(t.german, `scriptTurns[${index}].german`),
    };
  });

  if (!scriptTurns.some((turn) => turn.speaker === 'learner')) {
    throw new Error('Kein einziger Zug für die lernende Person — nichts zu üben.');
  }

  const correctionsRaw = Array.isArray(data.corrections) ? data.corrections : [];
  const corrections: CorrectionHint[] = correctionsRaw.map((hint, index) => {
    const h = hint as Record<string, unknown>;
    return {
      issue: asString(h.issue, `corrections[${index}].issue`),
      explanation: asString(h.explanation, `corrections[${index}].explanation`),
    };
  });

  if (corrections.length === 0) {
    throw new Error('Keine Korrektur-Hinweise enthalten.');
  }

  const result: ConversationSituation = {
    id: spec.id,
    level: spec.level,
    topic: spec.topic,
    direction: spec.direction,
    title: asString(data.title, 'title'),
    setting: asString(data.setting, 'setting'),
    scriptTurns,
    corrections,
    generatedAt: now,
    modelUsed,
    ...(data.translations !== undefined ? { translations: data.translations as ConversationSituation['translations'] } : {}),
  };
  if (!isValidSituation(result)) throw Error('Unvollständige Gesprächsübersetzungen oder ungültige Dialogsprache.');
  return result;
}

/**
 * Inhaltliche Prüfungen einer geparsten Situation (Schrift passt, alle
 * App-Sprachen und Zieltexte vorhanden) — als Funktion, damit der
 * Wiederholungsversuch sie mit umfasst.
 */
function pruefeSituation(situation: ConversationSituation, spec: SituationSpec): ConversationSituation {
  if (UI_LANGUAGES.some(code => !situation.translations?.[code]) || situation.scriptTurns.some(turn => !turn.targetText)) {
    throw Error('Dialog unvollständig: Zieltext oder App-Sprachen fehlen. Bitte erneut erzeugen.');
  }
  const language = SITUATION_SPRACHEN.find(item => item.direction === spec.direction)!.sprache;
  if (situation.scriptTurns.some(turn => !passtZurSchrift(language, turn.targetText!))) {
    throw Error('Die Dialogschrift passt nicht zur gewählten Lernsprache.');
  }
  return situation;
}

/**
 * Speichert nur die Zielwörter, die wirklich im Dialog stehen. Fehlende
 * verwerfen den Dialog nicht (er ist bezahlt); sie bleiben offen, das Studio
 * meldet sie, und der nächste Lauf plant sie neu ein.
 */
export function mitZielwoertern(situation: ConversationSituation, spec: SituationSpec): ConversationSituation {
  if (!spec.targetWords) return situation;
  return { ...situation, vocabIds: pruefeZielwoerter(situation, spec.targetWords).gefunden };
}

/**
 * Verbindet den Prompt dieser Datei mit einem beliebigen Textanbieter.
 *
 * Das ist die ganze Anbieter-Anbindung: eine Anfrage, eine Antwort, der
 * vorhandene Parser. Ein vierter Anbieter bräuchte hier keine Zeile.
 *
 * SEIT DEM 17.09. mit GENAU EINEM Wiederholungsversuch je Situation: Flüchtige
 * Antwort-Ausreißer (Prosa statt JSON, Unvollständiges) waren der Hauptverlust
 * des Nutzer-Laufs — der zweite Aufruf kostet weniger als der bereits bezahlte
 * erste, der sonst verworfen würde. Fehler VOR einer Antwort (Netz, Schlüssel,
 * Modellname) werfen weiterhin sofort, ohne sie doppelt zu bezahlen.
 */
export function createSituationClient(text: TextClient): GenerationClient {
  return {
    async generate(spec) {
      let letzterFehler: unknown = null;
      for (let versuch = 0; versuch < 2; versuch += 1) {
        const response = await text.complete({
          system: systemPrompt(),
          user: userPrompt(spec),
          maxTokens: GENERATOR_MAX_TOKENS,
        });
        try {
          return mitZielwoertern(pruefeSituation(parseSituation(response.text, spec, response.model), spec), spec);
        } catch (fehler) {
          letzterFehler = fehler;
        }
      }
      throw letzterFehler instanceof Error ? letzterFehler : new Error(String(letzterFehler));
    },
  };
}

export function createGenerationClient(
  provider: ProviderId,
  apiKey: string,
  model: string = GENERATOR_MODEL
): GenerationClient {
  return createSituationClient(createTextClient(provider, apiKey, model));
}
