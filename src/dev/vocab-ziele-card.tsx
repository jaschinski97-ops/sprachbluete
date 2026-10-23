import { LearningStagePicker } from '@/components/learning-stage-picker';
import { type LearningStage, STAGE_KEYS } from '@/lib/learning-stages';
import { useLocale } from '@/lib/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, ProgressPanel } from '@/components/generator-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import { createTextClient } from '@/lib/providers/text';
import type { BatchProgress } from '@/lib/generation/batch';
import {
  defaultChoiceFor,
  defaultModelFor,
  loadGeneratorSettings,
  providersForGroup,
  setGeneratorChoice,
  setGeneratorProvider,
  type GeneratorChoice,
} from '@/lib/providers/settings';
import { PROVIDER_INFO, PROVIDERS, type ProviderId, type TextClient } from '@/lib/providers/types';
import {
  pruefeVocabKreuzBatch,
  PRUEF_BATCH_GROESSE,
  type KreuzResultat,
} from '@/lib/content/kreuzpruefung';
import { loadApiKey } from '@/lib/api-key';
import { clearContentSelection, startAutomaticDelivery, studioRequest } from './content-client';
import { readMeta, writeMeta } from '@/lib/repository';
import {
  pruefeVocabDoc,
  vocabSchluessel,
} from '@/lib/content/vocab-schema';
import { listeAusAntwort } from '@/lib/content/ki-json';
import { bundledDocuments } from '@/lib/content/bundled';
import { thaiDialogwoerterOhneEintrag } from '@/lib/content/dialogue-gaps';
import { activeVocabulary } from '@/data/active-vocabulary';
import type { VocabEntry } from '@/data/vocab-types';
import { LEARNING_LANGUAGES } from '@/lib/languages/definitions';
import { isLanguageCode, LANGUAGE_CODES, type LanguageCode } from '@/lib/languages/types';
import { UI_LANGUAGES } from '@/lib/i18n/types';

/** Die Vokabel-Sprachen = alle Lernsprachen (`LANGUAGE_CODES`). */
type VocabSprache = LanguageCode;

/** Ein Wortschatz-Ziel je Lernsprache; Erzeugung und Prüfung starten mit einem Klick. */
const SPRACHEN: { code: VocabSprache; label: string }[] = LANGUAGE_CODES.map((code) => ({
  code,
  label: LEARNING_LANGUAGES[code].label,
}));

const ZIEL_PRESETS = [250, 500, 1000, 2000];

/**
 * Das Wortschatz-Ziel gilt je Sprache UND Stufe (18.10.2026): Gezählt wurde
 * schon je Stufe, gespeichert aber nur je Sprache — 2.000 Anfänger-Wörter
 * hätten das Profi-Ziel als erreicht gemeldet. Anfänger behält den alten
 * Schlüssel, damit gesetzte Ziele weitergelten.
 */
export function zielSchluessel(code: VocabSprache, stage: LearningStage): string {
  return stage === 'beginner' ? `vocabZiel-${code}` : `vocabZiel-${code}-${stage}`;
}

type LaufErgebnis = {
  erzeugt: number;
  kreuzGeprueft: number;
  einfachGeprueft: number;
  kreuzAbgelehnt: number;
  duplikate: number;
  aussortiert: number;
  /** Begriffe, die auf der Blacklist bereits abgelehnter Wörter standen. */
  schwarzgelistet: number;
  /** Einträge, die aus einer am Token-Limit abgeschnittenen Antwort gerettet wurden. */
  gerettet: number;
  /** Weiche Fehler (z. B. ein kaputtes Prüfpaket) — der Lauf läuft weiter. */
  fehler: string[];
  /** Geschätzte Ausgaben dieses Pakets in USD (Stichtagspreise, s. u.). */
  usd: number;
};

/** Kapazität der Blacklist je Sprache — die neuesten Ablehnungen bleiben liegen. */
const BLACKLIST_CAP = 2000;

async function ladeBlacklist(code: VocabSprache): Promise<string[]> {
  try {
    const liste = await readMeta<string[]>(`vocabBlacklist-${code}`, []);
    return Array.isArray(liste) ? liste.filter((begriff) => typeof begriff === 'string') : [];
  } catch {
    return [];
  }
}

async function speichereBlacklist(code: VocabSprache, liste: string[]): Promise<void> {
  await writeMeta(`vocabBlacklist-${code}`, liste.slice(-BLACKLIST_CAP));
}

/**
 * Stichtagspreise (09/2026) in USD pro Mio. Tokens für die Budget-Schätzung
 * des Loops — bewusst grob; sie ist kein Abrechnungsersatz. Unbekannte
 * Modelle rechnen wir konservativ TEURER, damit das Budget eher früher als
 * zu spät stoppt.
 */
const TOKEN_PREISE: { muster: RegExp; input: number; output: number }[] = [
  // DeepSeek (23.10.2026): Die offizielle Preisseite ließ sich nicht maschinell
  // lesen, Drittquellen nennen verschiedene Werte (Tageszeit-Tarife). Hier
  // steht jeweils das obere Ende — das Budget stoppt eher zu früh.
  { muster: /deepseek.*flash/, input: 0.44, output: 1.32 },
  { muster: /deepseek/, input: 1.74, output: 3.96 },
  { muster: /gpt-4o-mini/, input: 0.15, output: 0.6 },
  { muster: /gpt-4\.1-mini/, input: 0.4, output: 1.6 },
  { muster: /gpt-5-mini/, input: 0.25, output: 2 },
  { muster: /flash/, input: 0.3, output: 2.5 },
];
const PREIS_OHNE_TREFFER = { input: 0.5, output: 3 };

function paketUsd(modell: string, inputTokens: number, outputTokens: number): number {
  const preis = TOKEN_PREISE.find((eintrag) => eintrag.muster.test(modell)) ?? PREIS_OHNE_TREFFER;
  return (inputTokens * preis.input + outputTokens * preis.output) / 1_000_000;
}

const usdText = (usd: number) => `${usd.toFixed(2).replace('.', ',')} $`;

/** Sieben Zeichen stabiler Hash für KI-Vokabel-IDs. */
function kurzHash(text: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0').slice(0, 8);
}

/** Der Erzeugungs-Prompt: Vertrags-JSON mit sprachspezifischen Pflichten. */
function baueWortschatzPrompt(options: {
  sprache: VocabSprache;
  anzahl: number;
  thema: string;
  bekannte: string[];
  abgelehnt: string[];
}): string {
  const { sprache, anzahl, thema, bekannte, abgelehnt } = options;
  return [
    `Erzeuge genau ${anzahl} Einträge eines grundlegenden Alltags-Wortschatzes für Lernende, die ${sprache.toUpperCase()} lernen.`,
    thema ? `Thema: „${thema}".` : 'Thema: grundlegende, hochfrequente Wörter und feste Wendungen des Alltags — häufige Wörter zuerst.',
    'Keine Eigennamen, keine Markennamen, keine vulgären Ausdrücke, keine Duplikate innerhalb der Liste.',
    '',
    'Antworte NUR mit JSON:',
    '{ "woerter": [',
    '  {',
    '    "term": "Wort in der Zielsprache",',
    '    "romanization": "Lesehilfe",',
    '    "german": "deutsche Bedeutung",',
    '    "translations": { "th": "Bedeutung auf Thai", "en": "English meaning", "es": "significado en español", "de": "deutsche Bedeutung", "…": "weitere App-Sprachen" },',
    '    "partOfSpeech": "noun|verb|adjective|adverb|pronoun|numeral|particle|preposition|conjunction|interjection",',
    '    "register": "neutral"|"formal"|"informal",',
    '    "isConcrete": true|false,',
    '    "exampleTerm": "Beispielsatz in der Zielsprache",',
    '    "exampleRoman": "Umschrift des Beispielsatzes",',
    '    "exampleGerman": "deutsche Übersetzung des Beispielsatzes",',
    '    "syllables": [ … ],',
    '    … sprachspezifische Felder siehe unten …',
    '  }',
    '] }',
    '',
    `Sprachregeln für ${sprache}:`,
    isLanguageCode(sprache) ? LEARNING_LANGUAGES[sprache].generatorRules : '',
    `translations enthält für JEDEN dieser Sprachcodes eine kurze passende Bedeutung: ${UI_LANGUAGES.join(', ')}. Für ${sprache} ist die Übersetzung identisch mit term.`,
    '',
    `Ausschlussliste — diese Begriffe existieren bereits und dürfen NICHT vorkommen:`,
    bekannte.slice(0, 3000).join(' | '),
    '',
    `BLACKLIST — diese Begriffe wurden bereits geprüft und ABGELEHNT. Schläge sie NIEMALS wieder vor:`,
    abgelehnt.slice(0, 1000).join(' | '),
  ].join('\n');
}

type StudioDokument = { language?: string; term?: string; learningStage?: LearningStage };
type StudioBestand = { zahlen: Partial<Record<string, number>>; dokumente: StudioDokument[] };

/** Zustand vom HELPER (Katalog auf der Platte + Stage) — der gebündelte
 * Katalog im Browser bleibt sonst hinter Publishes zurück (Lektion 16.09.:
 * „Thai 16 vorhanden", obwohl längst 68 auf der Platte lagen). */
async function leseStudioBestand(): Promise<StudioBestand> {
  const zustand = await studioRequest<{
    shipped?: { entries?: { kind: string; id: string; document: StudioDokument }[] };
    stage?: { entries?: { kind: string; id: string; document: StudioDokument }[] };
  }>('/state');
  const eindeutig = new Map<string, StudioDokument>();
  for (const eintrag of [...(zustand.shipped?.entries ?? []), ...(zustand.stage?.entries ?? [])]) {
    if (eintrag.kind === 'vocabulary' && eintrag.document) eindeutig.set(String(eintrag.id), eintrag.document);
  }
  const dokumente = [...eindeutig.values()];
  const zahlen: Partial<Record<string, number>> = {};
  for (const { code } of SPRACHEN) zahlen[code] = dokumente.filter((d) => d.language === code).length;
  return { zahlen, dokumente };
}

export function VocabZieleCard({ onFinished, onRunningChange, blocked = false }: { onFinished: () => void; onRunningChange?: (running: boolean) => void; blocked?: boolean }) {
  const theme = useTheme();
  const toneColor = useToneColor();
  const { t } = useLocale();
  const [stage, setStage] = useState<LearningStage>('beginner');
  const deliveryRef = useRef<Awaited<ReturnType<typeof startAutomaticDelivery>> | null>(null);
  const [sprache, setSprache] = useState<VocabSprache>('th');
  const [alleSprachen, setAlleSprachen] = useState(false);
  const [ziele, setZiele] = useState<Partial<Record<string, number>>>({});
  /** Für welche Stufe `ziele` geladen ist — vorher startet kein Lauf. */
  const [zieleStufe, setZieleStufe] = useState<LearningStage | null>(null);
  const [bestand, setBestand] = useState<Partial<Record<string, number>> | null>(null);
  const [paketText, setPaketText] = useState('50');
  const [thema, setThema] = useState('');
  const [wahl, setWahl] = useState<GeneratorChoice>(() => defaultChoiceFor('vocabulary'));
  const [running, setRunning] = useState(false);
  const starting = useRef(false);
  const [deleteScope, setDeleteScope] = useState<string | null>(null);
  const [meldung, setMeldung] = useState('');
  const [ergebnis, setErgebnis] = useState<LaufErgebnis | null>(null);
  /** Live-Fortschritt während des Laufs — bleibt nach dem Lauf stehen (wie bei den anderen Karten). */
  const [fortschritt, setFortschritt] = useState<BatchProgress | null>(null);
  /** Fehler des letzten Laufs — prominent unterm Fortschritt, nicht nur in der grauen Meldung unten. */
  const [laufFehler, setLaufFehler] = useState<string[]>([]);

  useEffect(() => {
    // Gespeicherte Wahl der Gruppe `vocabulary` — ohne Stand bleibt die
    // Werksvorgabe (Gemini + dessen Text-Vorschlag) stehen.
    loadGeneratorSettings()
      .then((s) => setWahl(s.vocabulary))
      .catch(() => {});
  }, []);

  /** Anbieterwechsel zieht das Modell mit (Regel wie bei allen Gruppen). */
  const wahlAendern = useCallback(async (change: Partial<GeneratorChoice>) => {
    const next =
      change.provider !== undefined
        ? await setGeneratorProvider('vocabulary', change.provider)
        : await setGeneratorChoice('vocabulary', change);
    setWahl(next.vocabulary);
  }, []);

  const ladeBestand = useCallback(async (): Promise<StudioBestand> => {
    const bestand = await leseStudioBestand();
    setBestand(Object.fromEntries(SPRACHEN.map(({code}) => [code, bestand.dokumente.filter(d => d.language === code && (d.learningStage ?? 'beginner') === stage).length])));
    return bestand;
  }, [stage]);

  useEffect(() => {
    let aktuell = true;
    void Promise.resolve().then(ladeBestand).catch(error => setMeldung(error instanceof Error ? error.message : String(error)));
    void Promise.all(SPRACHEN.map(async ({ code }) => [code, await readMeta(zielSchluessel(code, stage), 250)] as const)).then(values => {
      if (!aktuell) return;
      setZiele(Object.fromEntries(values));
      setZieleStufe(stage);
    });
    return () => { aktuell = false; };
  }, [ladeBestand, stage]);

  const ziel = ziele[sprache] ?? 250;
  const vorhanden = bestand?.[sprache] ?? 0;
  const fehlt = Math.max(0, ziel - vorhanden);

  /** Im „Alle Sprachen“-Lauf zählt jede Sprache mit ihrem eigenen Ziel. */
  const aktiveSprachen: readonly VocabSprache[] = useMemo(() => alleSprachen
    ? SPRACHEN.map((eintrag) => eintrag.code)
    : [sprache], [alleSprachen, sprache]);
  const gesamtFehlt = aktiveSprachen.reduce(
    (summe, code) => summe + Math.max(0, (ziele[code] ?? 250) - (bestand?.[code] ?? 0)),
    0
  );

  const zielSetzenFuer = (code: VocabSprache, wert: number) => {
    setZiele((alt) => ({ ...alt, [code]: wert }));
    void writeMeta(zielSchluessel(code, stage), wert).catch(() => {});
  };
  const zielSetzen = (wert: number) => zielSetzenFuer(sprache, wert);

  const paket = Math.max(1, Math.min(wahl.provider.startsWith('local-') ? 5 : Infinity, Number.parseInt(paketText, 10) || 50));
  /** Der nächste Lauf je Sprache — vom Paket und vom Sprach-Ziel begrenzt. */
  const mengeFuer = (code: VocabSprache) =>
    Math.min(paket, Math.max(0, (ziele[code] ?? 250) - (bestand?.[code] ?? 0)));
  const gesamtMenge = aktiveSprachen.reduce((summe, code) => summe + mengeFuer(code), 0);

  /**
   * EIN Sprachlauf: lädt Bestand und Stage, erzeugt das Paket, prüft und
   * legt es auf die Stage. `null` heißt „nichts zu tun“ (Ziel erreicht).
   * Veröffentlichen tut der Aufrufer — der „Alle Sprachen“-Kettenlauf
   * published einmal am Ende statt je Sprache.
   */
  const laufeFuer = useCallback(async (
    code: VocabSprache,
    tick: (term: string, ausgang: 'ok' | 'failed' | 'skipped') => void,
    status: (text: string) => void
  ): Promise<LaufErgebnis | null> => {
      const label = SPRACHEN.find(sprache => sprache.code === code)?.label ?? code;
      status(`${label}: Bestand wird geladen …`);
      const bestandJetzt = await ladeBestand();
      const vorhandenJetzt = bestandJetzt.dokumente.filter(d => d.language === code && (d.learningStage ?? 'beginner') === stage).length;
      const zielJetzt = ziele[code] ?? 250;
      const local = wahl.provider.startsWith('local-');
      const anzahl = Math.min(local ? Math.min(paket, 5) : paket, Math.max(0, zielJetzt - vorhandenJetzt));
      if (anzahl <= 0) return null;

      const settings = await loadGeneratorSettings();
      const { provider, model, checkModel } = settings.vocabulary;
      const checkProvider = settings.vocabulary.checkProvider ?? provider;
      const apiKey = (await loadApiKey(provider)) ?? '';
      if (!apiKey && PROVIDER_INFO[provider].needsKey !== false) throw Error('Bitte unter Anbieter & Schlüssel den Erzeuger-Schlüssel hinterlegen.');
      const client = createTextClient(provider, apiKey, model);
      // Der ausgewählte Prüfer und sein Modell gelten verbindlich. Die Liste
      // kommt aus PROVIDERS, damit ein neuer Anbieter (DeepSeek, 23.10.2026)
      // nicht an einer vergessenen Aufzählung scheitert.
      const schluessel: Partial<Record<string, string | null>> = Object.fromEntries(
        await Promise.all(PROVIDERS.map(async (id) =>
          [id, PROVIDER_INFO[id].needsKey === false ? 'ohne' : await loadApiKey(id)] as const))
      );
      if (!schluessel[checkProvider]) throw Error('Bitte unter Anbieter & Schlüssel den Prüfer-Schlüssel hinterlegen.');
      const hatSchluessel = (anbieter: string): boolean => Boolean(schluessel[anbieter]);
      const pruefModellFuer = (anbieter: ProviderId) =>
        checkModel?.trim() || (anbieter === provider ? model : defaultModelFor(anbieter, 'text'));
      const clientFuer = (anbieter: ReturnType<typeof defaultModelFor> extends never ? never : Parameters<typeof defaultModelFor>[0]) =>
        createTextClient(
          anbieter,
          (schluessel[anbieter] ?? '') as string,
          pruefModellFuer(anbieter)
        );

      // Echte Tokenzahlen je Aufruf sammeln (Erzeugung UND Prüfung) — daraus
      // schätzt der Loop die Ausgaben und stoppt am Budget.
      const verbrauch = { usd: 0 };
      const zaehl = (basis: TextClient): TextClient => ({
        ...basis,
        complete: async (request) => {
          const antwort = await basis.complete(request);
          if (antwort.usage && !basis.provider.startsWith('local-')) verbrauch.usd += paketUsd(basis.model, antwort.usage.inputTokens, antwort.usage.outputTokens);
          return antwort;
        },
      });

      // Bestand + Stage + Blacklist VOR dem Erzeugungsaufruf lesen — die
      // Ausschlussliste im Prompt muss auch Stage-Wörter kennen, sonst
      // schlägt das Modell sie laufend wieder vor (27 Duplikate, 16.09.).
      const eigene = bestandJetzt.dokumente.filter((d) => d.language === code);
      const bekannte = eigene.map((d) => d.term).filter((term): term is string => Boolean(term));
      const vorhandenSchluessel = new Set(eigene.map((d) => vocabSchluessel(String(d.term ?? ''), code)));
      try {
        const zustand = await studioRequest<{ stage?: { entries?: { kind: string; document: { term?: string; language?: string } }[] } }>('/state');
        for (const eintrag of zustand.stage?.entries ?? []) {
          if (eintrag.kind === 'vocabulary' && eintrag.document?.language === code && typeof eintrag.document?.term === 'string') {
            bekannte.push(eintrag.document.term);
            vorhandenSchluessel.add(vocabSchluessel(eintrag.document.term, code));
          }
        }
      } catch {
        // Ohne Helper bleibt der Vergleich beim lokalen Bestand.
      }
      const blacklistBegriffe = await ladeBlacklist(code);
      const blacklist = new Set(blacklistBegriffe.map((begriff) => vocabSchluessel(begriff, code)));
      // Fehlerprotokoll dieses Pakets — landet als JSON-Zeilen in
      // pipeline/logs/studio-failures.ndjson (Nutzerwunsch: Datei statt
      // Debug-Ausgabe in der GUI). Senden ist Feuer-und-Vergessen: Das Log
      // darf den Lauf NIE aufhalten.
      const protokoll: { kind: string; language: string; term?: string; gruende?: string[] }[] = [];

      status(`${label}: ${model} erzeugt ${anzahl} Wörter — warte auf KI-Antwort …`);
      const antwort = await zaehl(client).complete({
        system:
          'Du erzeugst Lernwortschatz als JSON und hältst dich EXAKT an das geforderte Schema. Keine Duplikate, keine Eigennamen, häufige Wörter zuerst.',
        user: baueWortschatzPrompt({ sprache: code, anzahl, thema, bekannte:local ? bekannte.slice(-500) : bekannte, abgelehnt: blacklistBegriffe.slice(-200) }) + '\nSchwierigkeitsgruppe: ' + stage + '. ' + (stage === 'beginner' ? 'Häufige grundlegende Wörter und kurze einfache Beispielsätze.' : stage === 'experienced' ? 'Wortschatz für selbstständige Alltagsgespräche, Meinungen, Arbeit; abwechslungsreiche Satzstrukturen.' : 'Differenzierter idiomatischer Wortschatz, abstrakte Themen und komplexe natürliche Beispielsätze. Keine seltenen Wörter nur um Schwierigkeit zu erzeugen.'),
        maxTokens: 32768,
      });

      status(`${label}: Antwort erhalten — Wörter werden vorbereitet …`);
      const laufSchluessel = new Set<string>();
      const resultat: LaufErgebnis = { erzeugt: 0, kreuzGeprueft: 0, einfachGeprueft: 0, kreuzAbgelehnt: 0, duplikate: 0, aussortiert: 0, schwarzgelistet: 0, gerettet: 0, fehler: [], usd: 0 };
      const abgelehntNeu: string[] = [];

      // 32700 statt 8000: 50 reiche Einträge (Thai-Schrift, Silben, Beispiele)
      // sprengten das alte Limit — die Antwort brach mitten im JSON ab
      // („Unterminated string", erster Kettenlauf 15.09.). Die Nutzerwahl
      // (gemini-3.8-flash, gpt-5.6-luna) trägt Ausgabe-Caps weit darüber;
      // der Saldo ist eine Obergrenze pro Aufruf, kein Verbrauchsziel.
      const { woerter, abgeschnitten } = listeAusAntwort(antwort.text);
      if (abgeschnitten) resultat.gerettet = woerter.length;

      // Phase A — sammeln: Duplikate, Blacklist und Schemamängel fliegen
      // sofort raus, die übrigen Kandidaten gehen als PAKET in die Prüfung.
      const kandidaten: { eintrag: VocabEntry; schluessel: string }[] = [];
      for (const rohEintrag of woerter) {
        const kandidat = rohEintrag as Record<string, unknown>;
        const term = String(kandidat.term ?? '');
        const schluessel = vocabSchluessel(term, code);
        if (!term || vorhandenSchluessel.has(schluessel) || laufSchluessel.has(schluessel)) {
          resultat.duplikate += 1;
          tick(term, 'skipped');
          continue;
        }
        if (blacklist.has(schluessel)) {
          // Schon einmal von der Prüfung abgelehnt — nicht nochmal bezahlen.
          resultat.schwarzgelistet += 1;
          protokoll.push({ kind: 'blacklist', language: code, term });
          tick(term, 'skipped');
          continue;
        }
        const eintrag: VocabEntry = {
          ...(kandidat as unknown as VocabEntry),
          id: `ki-${code}-${kurzHash(schluessel)}`,
          generatedAt: Date.now(),
          // 'de' trägt die Laufzeit längst (de-Pool; vocab-schema liest die
          // Sprache als string) — nur der Typ kennt es noch nicht: Cast.
          language: code as VocabEntry['language'],
          concept: `ki-${code}-${kurzHash(schluessel)}`,
          register: (kandidat.register as VocabEntry['register']) ?? 'neutral',
          isConcrete: Boolean(kandidat.isConcrete),
          // NIE true: das Feld bedeutet „quellengeprüft" und verlangt eine
          // Quellenangabe — sonst lehnt der Publish das Wort ab (52
          // steckengebliebene Wörter, 16.09.). Die Kreuzprüfung steht in
          // der verificationNote, und das Wort läuft als „ungeprüft".
          learningStage: stage,
          sourceVerified: false,
          verificationNote: 'KI-Erzeugung, einfach geprüft (Schema + Schrift + Regeln).',
          syllables: Array.isArray(kandidat.syllables) ? (kandidat.syllables as VocabEntry['syllables']) : [],
        };
        const pruefung = pruefeVocabDoc(eintrag);
        if (UI_LANGUAGES.some(language => typeof eintrag.translations?.[language] !== 'string' || !eintrag.translations[language]!.trim())) {
          pruefung.ok = false;
          pruefung.fehler.push('Bedeutungen für App-Sprachen fehlen.');
        }
        if (!pruefung.ok) {
          resultat.aussortiert += 1;
          protokoll.push({ kind: 'schema', language: code, term, gruende: pruefung.fehler });
          tick(term, 'skipped');
          continue;
        }
        kandidaten.push({ eintrag, schluessel });
        laufSchluessel.add(schluessel);
      }

      // Paketweise prüfen; gleicher Anbieter prüft die Bestandenen zweimal.
      for (let start = 0; start < kandidaten.length; start += PRUEF_BATCH_GROESSE) {
        const paket = kandidaten.slice(start, start + PRUEF_BATCH_GROESSE);
        status(`${label}: Prüfpaket ${Math.floor(start / PRUEF_BATCH_GROESSE) + 1} / ${Math.ceil(kandidaten.length / PRUEF_BATCH_GROESSE)} — ${pruefModellFuer(checkProvider)} prüft ${paket.length} Wörter …`);
        let resultate: KreuzResultat[];
        try {
          resultate = await pruefeVocabKreuzBatch(
            paket.map((kandidat) => kandidat.eintrag),
            t(STAGE_KEYS[stage]),
            provider,
            hatSchluessel,
            (anbieter) => zaehl(clientFuer(anbieter)),
            checkProvider
          );
        } catch (error) {
          // Ein kaputtes Paket (z. B. verstümmelte Prüf-Antwort) wirft NICHT
          // den Sprachlauf — bereits geprüfte Pakete zählen und werden
          // veröffentlicht, der Fehler steht in der Meldung.
          const nummer = Math.floor(start / PRUEF_BATCH_GROESSE) + 1;
          const meldung = `Prüfpaket ${nummer}: ${error instanceof Error ? error.message : String(error)}`;
          resultat.fehler.push(meldung);
          protokoll.push({ kind: 'paket', language: code, gruende: [meldung] });
          for (const kandidat of paket) tick(kandidat.eintrag.term, 'failed');
          continue;
        }
        for (const [position, kandidat] of paket.entries()) {
          const kreuz = resultate[position];
          const eintrag = kandidat.eintrag;
          if (kreuz.kreuz && kreuz.geprueft) {
            eintrag.verificationNote = `KI-Kreuzprüfung bestanden (${provider} erzeugt, ${checkProvider} mit ${pruefModellFuer(checkProvider)} geprüft).`;
            resultat.kreuzGeprueft += 1;
          } else if (kreuz.geprueft || kreuz.urteile.every((urteil) => urteil.bestanden)) {
            eintrag.verificationNote =
              'KI-Erzeugung, einfach geprüft (zweiter Durchlauf desselben Anbieters bestanden).';
            resultat.einfachGeprueft += 1;
          } else {
            resultat.kreuzAbgelehnt += 1;
            abgelehntNeu.push(eintrag.term);
            protokoll.push({
              kind: 'kreuzpruefung',
              language: code,
              term: eintrag.term,
              gruende: kreuz.gruende.length > 0 ? kreuz.gruende : kreuz.urteile.flatMap((urteil) => urteil.gruende),
            });
            tick(eintrag.term, 'failed');
            continue;
          }
          try {
            status(`${label}: „${eintrag.term}“ wird gespeichert …`);
            if (!deliveryRef.current) throw Error(t('studio.deliveryFailed'));
            await deliveryRef.current.deliver('vocabulary', { ...eintrag });
            await deliveryRef.current.flush();
          } catch (error) {
            resultat.fehler.push(`${eintrag.term}: ${error instanceof Error ? error.message : String(error)}`);
            tick(eintrag.term, 'failed');
            continue;
          }
          laufSchluessel.add(kandidat.schluessel);
          resultat.erzeugt += 1;
          tick(eintrag.term, 'ok');
        }
      }
      // Abgelehnte Begriffe dauerhaft merken — der nächste Lauf schlägt sie
      // weder vor (Blacklist im Prompt) noch prüft sie erneut (Phase A).
      if (abgelehntNeu.length > 0) {
        await speichereBlacklist(code, [...blacklistBegriffe, ...abgelehntNeu]).catch(() => {});
      }
      if (protokoll.length > 0) {
        void studioRequest('/log', { entries: protokoll }).catch(() => {});
      }
      resultat.usd = verbrauch.usd;
      return resultat;
  }, [ziele, paket, thema, ladeBestand, stage, wahl.provider, t]);

  const erzeugen = async () => {
    if (starting.current || blocked) return;
    starting.current = true;
    setRunning(true);
    onRunningChange?.(true);
    setMeldung('');
    // Altes Ergebnis weg — sonst sieht es nach einem fehlgeschlagenen Vorlauf
    // so aus, als hätte der NEUE Lauf nichts getan (Verwirrung 15.09.).
    setErgebnis(null);
    setLaufFehler([]);
    setFortschritt({
      total: Math.max(1, gesamtFehlt || gesamtMenge), processed: 0, ok: 0, failed: 0, skipped: 0,
      current: 'Wortschatz-Loop wird vorbereitet …',
      errors: [], done: false, cancelled: false,
    });
    const status = (current: string) => setFortschritt(alt => alt ? { ...alt, current } : alt);
    const tick = (term: string, ausgang: 'ok' | 'failed' | 'skipped') => {
      setFortschritt((alt) => {
        if (!alt) return alt;
        const processed = alt.processed + 1;
        return {
          ...alt,
          processed,
          total: Math.max(alt.total, processed),
          current: term,
          ok: alt.ok + (ausgang === 'ok' ? 1 : 0),
          failed: alt.failed + (ausgang === 'failed' ? 1 : 0),
          skipped: alt.skipped + (ausgang === 'skipped' ? 1 : 0),
        };
      });
    };
    try {
      deliveryRef.current = await startAutomaticDelivery();
      const codes = alleSprachen ? [...aktiveSprachen] : [sprache];
      const gesamt: LaufErgebnis = { erzeugt: 0, kreuzGeprueft: 0, einfachGeprueft: 0, kreuzAbgelehnt: 0, duplikate: 0, aussortiert: 0, schwarzgelistet: 0, gerettet: 0, fehler: [], usd: 0 };
      const fehler: string[] = [];
      const ohneFortschrittIn: string[] = [];
      let pakete = 0;
      let zielErreicht = 0;
      for (const code of codes) {
        const label = SPRACHEN.find((eintrag) => eintrag.code === code)?.label ?? code;
        for (let paketNummer = 1; ; paketNummer++) {
          if (deliveryRef.current?.failed) throw Error(t('studio.deliveryFailed'));
          status(`${label}: Paket ${paketNummer} — bisher ${usdText(gesamt.usd)} geschätzt …`);
          let teil: LaufErgebnis | null;
          try {
            teil = await laufeFuer(code, tick, status);
          } catch (error) {
            // Hart gescheitert (Schlüssel, Netz, Verstümmelung) — das nächste
            // Paket DIESER Sprache würde genauso enden: weiter zur nächsten.
            fehler.push(`${label} (Paket ${paketNummer}): ${error instanceof Error ? error.message : String(error)}`);
            break;
          }
          if (!teil) { zielErreicht += 1; break; }
          pakete += 1;
          for (const feld of ['erzeugt', 'kreuzGeprueft', 'einfachGeprueft', 'kreuzAbgelehnt', 'duplikate', 'aussortiert', 'schwarzgelistet', 'gerettet'] as const) {
            gesamt[feld] += teil[feld];
          }
          gesamt.fehler.push(...teil.fehler);
          gesamt.usd += teil.usd;
          if (teil.erzeugt > 0) {
            // Die einzeln bestätigten Wörter vor dem nächsten Paket zählen.
            status(`${label}: ${teil.erzeugt} Wörter werden in den Grundstock übernommen …`);
            try {
              await deliveryRef.current?.flush();
              await ladeBestand();
            } catch (error) {
              fehler.push(`Publish: ${error instanceof Error ? error.message : String(error)}`);
              break;
            }
          } else {
            // Ein GANZES Paket ohne einen einzigen neuen Treffer — in DIESER
            // Sprache erschöpft sich das Modell gerade in Bekanntem. Die
            // KETTE läuft mit der nächsten Sprache weiter (früher brach hier
            // alles ab: Thai-„kein Fortschritt" ließ en/es/de unberührt,
            // 16.09.). Nur die Sprache wird vermerkt.
            ohneFortschrittIn.push(label);
            break;
          }
        }
      }
      await deliveryRef.current?.finish();
      deliveryRef.current = null;
      onFinished();
      setErgebnis(gesamt);
      setLaufFehler(fehler);
      const verteilung = codes
        .map((code) => `${SPRACHEN.find((eintrag) => eintrag.code === code)?.label ?? code} ${bestand?.[code] ?? '…'}`)
        .join(' · ');
      const gruende = [
        ohneFortschrittIn.length > 0 ? `kein Fortschritt bei ${ohneFortschrittIn.join(', ')} (Thema wechseln hilft)` : '',
      ].filter(Boolean).join(' · ');
      const fehlerZusatz = fehler.length > 0
        ? ` · Fehler: ${fehler[0]}${fehler.length > 1 ? ` (+${fehler.length - 1} weitere)` : ''}`
        : '';
      const logHinweis = (gesamt.kreuzAbgelehnt + gesamt.aussortiert + gesamt.schwarzgelistet) > 0
        ? ' · Einzelheiten je abgelehntem Wort: pipeline/logs/studio-failures.ndjson'
        : '';
      if (pakete === 0 && fehler.length === 0 && zielErreicht > 0) {
        setMeldung('Das Ziel ist bereits erreicht — nichts zu erzeugen.');
      } else {
        setMeldung(
          `Loop beendet: ${pakete} Paket/Pakete · ${gesamt.erzeugt} erzeugt · ${gesamt.kreuzGeprueft} kreuzgeprüft · ${gesamt.einfachGeprueft} einfach geprüft · ${gesamt.kreuzAbgelehnt} abgelehnt · ${gesamt.duplikate} Duplikate · ${gesamt.schwarzgelistet} Blacklist-Treffer · ${gesamt.aussortiert} aussortiert · Ausgaben geschätzt ${usdText(gesamt.usd)} — Bestand: ${verteilung}${gruende ? ` · ${gruende} — erneut drücken füllt den Rest` : ' · Ziel erreicht'}${logHinweis}${fehlerZusatz}`
        );
      }
    } catch (error) {
      const nachricht = error instanceof Error ? error.message : String(error);
      setLaufFehler([nachricht]);
      setMeldung(nachricht);
    } finally {
      if (deliveryRef.current) {
        try { await deliveryRef.current.finish(); } catch (error) { setLaufFehler(alt => [...alt, String(error)]); }
        deliveryRef.current = null;
      }
      setFortschritt((alt) => (alt ? { ...alt, done: true, current: null } : alt));
      starting.current = false;
      setRunning(false); onRunningChange?.(false);
    }
  };

  const prueferAnbieter: ProviderId = wahl.checkProvider ?? wahl.provider;
  const scope = aktiveSprachen.join(',');
  const loeschen = async () => {
    if (deleteScope !== scope) { setDeleteScope(scope); return; }
    if (starting.current || blocked) return;
    starting.current = true;
    setRunning(true);
    onRunningChange?.(true);
    try {
      await clearContentSelection('vocabulary', [...aktiveSprachen]);
      await ladeBestand();
      setErgebnis(null);
      setFortschritt(null);
      setLaufFehler([]);
      setDeleteScope(null);
      setMeldung('Erzeugte Wörter der Auswahl gelöscht.');
      onFinished();
    } catch (error) { setMeldung(error instanceof Error ? error.message : String(error)); }
    finally { starting.current = false; setRunning(false); onRunningChange?.(false); }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <LearningStagePicker value={stage} onChange={value => { setBestand(null); setZiele({}); setZieleStufe(null); setStage(value); }} disabled={running || blocked} />
      <ThemedText type="smallBold">Wortschatz — {t(STAGE_KEYS[stage])} · Zielgröße je Sprache und Stufe</ThemedText>

      <View style={styles.zeile}>
        {SPRACHEN.map(({ code, label }) => (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: !alleSprachen && sprache === code }}
            onPress={() => {
              setSprache(code);
              setAlleSprachen(false);
            }}
            disabled={running || blocked}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.pressed,
              !alleSprachen && sprache === code && { borderColor: theme.accent, borderWidth: 1 },
            ]}>
            <ThemedText type="small" themeColor={!alleSprachen && sprache === code ? 'text' : 'textSecondary'}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alle Sprachen"
          accessibilityState={{ selected: alleSprachen }}
          onPress={() => setAlleSprachen(true)}
          disabled={running || blocked}
          style={({ pressed }) => [
            styles.chip,
            pressed && styles.pressed,
            alleSprachen && { borderColor: theme.accent, borderWidth: 1 },
          ]}>
          <ThemedText type="small" themeColor={alleSprachen ? 'text' : 'textSecondary'}>
            Alle Sprachen
          </ThemedText>
        </Pressable>
      </View>

      {!alleSprachen && (
      <View style={styles.zeile}>
        {ZIEL_PRESETS.map((preset) => (
          <Pressable
            key={preset}
            accessibilityRole="button"
            accessibilityState={{ selected: ziel === preset }}
            onPress={() => zielSetzen(preset)}
            disabled={running || blocked}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.pressed,
              ziel === preset && { borderColor: theme.accent, borderWidth: 1 },
            ]}>
            <ThemedText type="small" themeColor={ziel === preset ? 'text' : 'textSecondary'}>
              {preset.toLocaleString('de-DE')}
            </ThemedText>
          </Pressable>
        ))}
        <TextInput
          value={String(ziel)}
          onChangeText={(text) => {
            const zahl = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
            if (Number.isFinite(zahl) && zahl > 0) zielSetzen(zahl);
          }}
          keyboardType="number-pad"
          accessibilityLabel={`Freies Ziel für ${sprache}`}
          style={[styles.input, styles.kurz, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
      </View>
      )}

      <ThemedText type="smallBold">
        {alleSprachen
          ? `Alle Sprachen: ${gesamtFehlt.toLocaleString('de-DE')} fehlen gegenüber den Sprach-Zielen`
          : `${sprache}: ${vorhanden.toLocaleString('de-DE')} vorhanden · Ziel ${ziel.toLocaleString('de-DE')} · ${fehlt.toLocaleString('de-DE')} fehlt`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {SPRACHEN.map(({ code, label }) => `${label} ${bestand?.[code] ?? '…'}`).join(' · ')}
      </ThemedText>

      {alleSprachen && (
        <View style={styles.field}>
          <ThemedText type="small">Ziel je Sprache (im Alle-Sprachen-Lauf)</ThemedText>
          <View style={styles.zeile}>
            {SPRACHEN.map(({ code, label }) => (
              <View key={code} style={styles.zielFeld}>
                <TextInput
                  value={String(ziele[code] ?? 250)}
                  onChangeText={(text) => {
                    const zahl = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
                    if (Number.isFinite(zahl) && zahl > 0) zielSetzenFuer(code, zahl);
                  }}
                  keyboardType="number-pad"
                  accessibilityLabel={`Ziel für ${label}`}
                  style={[styles.input, styles.kurz, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
                />
                <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.field}>
        <ThemedText type="small">Paketgröße (Wörter je Lauf)</ThemedText>
        <TextInput
          value={paketText}
          onChangeText={(text) => setPaketText(text.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          accessibilityLabel="Paketgröße"
          style={[styles.input, styles.kurz, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
        <ThemedText type="small">Thema (optional)</ThemedText>
        <TextInput
          value={thema}
          onChangeText={setThema}
          accessibilityLabel="Thema des Pakets"
          placeholder="z. B. Im Restaurant"
          placeholderTextColor={theme.textSecondary}
          editable={!running}
          multiline
          style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
        {/* Testlauf 16.10.2026: Zahlen, บาท, ชื่อ, ประเทศ … fehlten im Grundstock.
            Der Knopf schreibt die Lücken als Pflichtwörter ins Thema; erzeugt
            wird erst mit dem normalen Start. */}
        {sprache === 'th' && !alleSprachen ? (
          <Pressable
            accessibilityRole="button"
            disabled={running}
            onPress={() => {
              const fehlend = thaiDialogwoerterOhneEintrag(bundledDocuments('situations'), activeVocabulary());
              if (fehlend.length === 0) {
                setMeldung('Alle Wörter der Thai-Dialoge haben einen Wortschatzeintrag.');
                return;
              }
              setThema(`Pflichtwörter aus den Dialogen — für genau diese Wörter je einen Eintrag (Eigennamen weglassen): ${fehlend.join(', ')}`);
              setPaketText(String(Math.min(fehlend.length, 100)));
              setMeldung(`${fehlend.length} Dialogwörter ohne Eintrag als Thema übernommen. Liste vor dem Start prüfen.`);
            }}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <ThemedText type="small">Dialogwörter ohne Eintrag übernehmen</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.field}>
        <ThemedText type="small">KI — Erzeugung</ThemedText>
        <View style={styles.zeile}>
          {providersForGroup('vocabulary').map((info) => (
            <Pressable
              key={info.id}
              accessibilityRole="button"
              accessibilityState={{ selected: wahl.provider === info.id }}
              onPress={() => void wahlAendern({ provider: info.id })}
              disabled={running || blocked}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.pressed,
                wahl.provider === info.id && { borderColor: theme.accent, borderWidth: 1 },
              ]}>
              <ThemedText type="small" themeColor={wahl.provider === info.id ? 'text' : 'textSecondary'}>
                {info.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={wahl.model}
          onChangeText={(wert) => void wahlAendern({ model: wert })}
          placeholder={PROVIDER_INFO[wahl.provider].modelPlaceholder.text}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!running}
          accessibilityLabel="Modellname für die Wortschatz-Erzeugung"
          style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
        <ThemedText type="small">KI — Prüfung: Anbieter</ThemedText>
        <View style={styles.zeile}>
          {providersForGroup('vocabulary').map((info) => (
            <Pressable
              key={info.id}
              accessibilityRole="button"
              accessibilityState={{ selected: prueferAnbieter === info.id }}
              onPress={() => void wahlAendern({ checkProvider: info.id, checkModel: info.id === wahl.provider ? wahl.model : defaultModelFor(info.id, 'text') })}
              disabled={running || blocked}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.pressed,
                prueferAnbieter === info.id && { borderColor: theme.accent, borderWidth: 1 },
              ]}>
              <ThemedText type="small" themeColor={prueferAnbieter === info.id ? 'text' : 'textSecondary'}>
                {info.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <ThemedText type="small">KI — Prüfung: Modell des Prüfers</ThemedText>
        <TextInput
          value={wahl.checkModel ?? ''}
          onChangeText={(wert) => void wahlAendern({ checkModel: wert })}
          placeholder={prueferAnbieter === wahl.provider ? wahl.model : defaultModelFor(prueferAnbieter, 'text')}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!running}
          accessibilityLabel="Modellname für die Wortschatz-Prüfung"
          style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
      </View>
      {fortschritt ? <ProgressPanel progress={fortschritt} /> : null}
      {laufFehler.length > 0 ? (
        <ThemedText type="smallBold" accessibilityLiveRegion="polite" style={{ color: toneColor('falling') }}>
          {`Der Lauf ist fehlgeschlagen: ${laufFehler[0]}${laufFehler.length > 1 ? ` (+${laufFehler.length - 1} weitere)` : ''}`}
        </ThemedText>
      ) : null}

      <View style={styles.zeile}>
        <Button label={running ? 'Wörter werden erzeugt …' : 'Fehlende Wörter erzeugen …'} onPress={erzeugen} disabled={running || blocked || gesamtMenge === 0 || zieleStufe !== stage} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {alleSprachen
          ? `${paket} Wörter je Sprache und Durchlauf (${gesamtMenge} gesamt) · der Loop läuft, bis ${gesamtFehlt.toLocaleString('de-DE')} fehlende Wörter erzeugt sind — Seite neu laden bricht ihn ab (je Paket veröffentlicht).`
          : `${paket} Wörter je Paket · der Loop läuft, bis ${gesamtFehlt.toLocaleString('de-DE')} fehlende Wörter erzeugt sind — Seite neu laden bricht ihn ab (je Paket veröffentlicht).`}
      </ThemedText>
      <View style={styles.zeile}>
        <Button label={deleteScope === scope ? 'Ausgewählte Wörter wirklich löschen?' : 'Erzeugte Wörter löschen'} onPress={loeschen} disabled={running || blocked} />
        {deleteScope === scope ? <Button label="Abbrechen" onPress={() => setDeleteScope(null)} disabled={running || blocked} /> : null}
      </View>

      {ergebnis ? (
        <ThemedText type="smallBold" accessibilityLiveRegion="polite">
          {`Ergebnis: ${ergebnis.erzeugt} erzeugt · ${ergebnis.kreuzGeprueft} kreuzgeprüft · ${ergebnis.einfachGeprueft} einfach geprüft · ${ergebnis.kreuzAbgelehnt} abgelehnt · ${ergebnis.duplikate} Duplikate verworfen · ${ergebnis.schwarzgelistet} Blacklist-Treffer · ${ergebnis.aussortiert} aussortiert · ${usdText(ergebnis.usd)} geschätzt.`}
        </ThemedText>
      ) : null}

      <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="textSecondary">
        {meldung}
      </ThemedText>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  zeile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: Colors.dark.backgroundSelected,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    fontSize: 13,
  },
  kurz: {
    width: 90,
  },
  zielFeld: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
  confirmBox: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
