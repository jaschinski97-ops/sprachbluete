/**
 * Das Sprachmodell (Phase 15, seit dem v2-Plan: Paarmatrix).
 *
 * BIS HIERHER WAR ALLES AUF THAI↔DEUTSCH VERDRAHTET: `Direction` war der feste
 * Typ `de_to_th | th_to_de`, die Vokabel hatte ein Feld `thai`, und die
 * Tonfarben lagen als Konstante herum. Diese Datei zieht daraus ein Modell,
 * in dem Thai↔Deutsch das **erste** Sprachpaar ist und kein Sonderfall.
 *
 * DEUTSCH WAR DIE DREHSCHEIBE (AE-42) — und ist es im **Bestand** noch: Jede
 * ausgelieferte Richtung hat Deutsch auf einer Seite, und die deutsche Seite
 * jeder Vokabel (Genus, Stammformen, Steigerung) hängt an dieser Entscheidung.
 *
 * SEIT DEM PAARMATRIX-MODELL (Roadmap v2, 2026-09-08) GIBT ES HIER ZWEI
 * SCHICHTEN:
 *
 *   1. Die **Paarmatrix** (`SUPPORTED_TARGETS`, `Lang`, `Pair`, `pairsFor`):
 *      alle Kombinationen S→T mit S≠T über {de, en, es, fr, th} — 20 Paare.
 *      `BRIDGE_LOCALES` nennt dieselben fünf als Brückensprachen (= künftig
 *      die Systemsprache des Geräts).
 *   2. Der **Bestand** (`LANGUAGE_CODES`, `Direction`, `HUB_LANGUAGE`): die
 *      klassischen de↔th/en/es-Richtungen. `'de_to_th'` und `'th_to_de'`
 *      bleiben wörtlich gültige Werte — gespeicherte Kartenschlüssel
 *      (`vocabId:de_to_th`) sind davon unberührt — und `Direction` wurde nur
 *      um `de_to_fr`/`fr_to_de` erweitert, nie umgebaut.
 *
 * NEUER CODE liest Schicht 1; Schicht 2 trägt den Bestand. Französisch wurde
 * am 09.09.2026 komplett entfernt (Kern 4) — der frühere Grundstoff liegt
 * im Git-Verlauf und ist nicht mehr Teil des Typs.
 */

import { Tone } from '@/constants/tones';
import type { TranslationKey } from '../i18n/keys';
import { UI_LANGUAGES, type UiLanguage } from '@/lib/i18n/types';

/**
 * Die Drehscheibe. Steht auf einer Seite jedes Sprachpaars.
 *
 * @deprecated SEIT DEM PAARMATRIX-MODELL (Roadmap v2, Phase „Richtungslogik“)
 * ist Deutsch eine **Zielsprache unter fünf** und keine Drehcheibe mehr —
 * gültige Paare sind jetzt alle Kombinationen S→T mit S≠T, siehe
 * `SUPPORTED_TARGETS`, `Pair` und `pairsFor`. Der Export bleibt, bis alle
 * Aufrufer umgestellt sind (`profile.ts`, `backup.ts`, `questions.ts`
 * bauen damit weiterhin die klassischen de↔X-Richtungen). NEUER CODE liest
 * `HUB_LANGUAGE` nicht mehr; er nimmt `pairsFor` und `Pair`.
 */
export const HUB_LANGUAGE = 'de' as const;
export type HubLanguage = typeof HUB_LANGUAGE;

/**
 * DIE EINE LISTE DER LERNSPRACHEN (Sprach-Umbau 23.09.2026).
 *
 * Alles, was die App lernen lässt, hängt an dieser Liste — Ziele je
 * App-Sprache, Kartenpools, Übungskatalog, Studio-Erzeugung, Pipeline-Vertrag.
 * Deutsch ist hier eine Lernsprache WIE JEDE ANDERE (vorher lief es über
 * Sonderregeln `_to_de`, die immer wieder deutsch-spezifische Fehler
 * erzeugten).
 *
 * NEUE LERNSPRACHE: Code hier anhängen und in `definitions.ts` eine
 * Definition eintragen — der Typ `Record<LanguageCode, …>` dort (und an den
 * übrigen Stellen) meldet per Kompilierfehler jede Stelle, die noch etwas
 * wissen muss. Schritt-für-Schritt: `docs/neue-lernsprache.md`.
 */
export const LANGUAGE_CODES = ['th', 'en', 'es', 'de'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/** Alias aus der Paarmatrix-Zeit — dieselbe Liste. */
export const TARGET_LANGUAGES = LANGUAGE_CODES;
export type TargetLanguage = LanguageCode;

/**
 * Der Sprachkanon: dieselbe Liste wie `LANGUAGE_CODES`. Jede Lernsprache ist
 * zugleich eine Sprache, in der erklärt werden kann (Brücke).
 */
export const SUPPORTED_TARGETS = LANGUAGE_CODES;
export type Lang = LanguageCode;

/**
 * Die Brückensprachen — die Sprache, in der eine Vokabel **erklärt** wird.
 *
 * SPÄTER = SYSTEMSPRACHE: Der v2-Plan erkennt sie per `expo-localization`;
 * solange die i18n-Schicht nicht steht, bleibt Deutsch die Brücke. Der Kanon
 * ist absichtlich derselbe wie `SUPPORTED_TARGETS`: Jede Zielsprache ist auch
 * eine Sprache, in der erklärt werden kann.
 */
export const BRIDGE_LOCALES = SUPPORTED_TARGETS;

/**
 * Eine Richtung des Lernens: von `source` (Brückensprache) nach `target`
 * (Zielsprache). `en_to_de` heißt: Englisch als Brücke, Deutsch wird gelernt.
 */
export type Pair = { source: Lang; target: Lang };

/**
 * Stabile ID eines Paars — bewusst im **gewohnten Format**: `'de_to_th'` &
 * Co. sind seit Phase 15 Kartenschlüssel (`vocabId:de_to_th`) und dürfen
 * sich nie ändern. Der Typ schließt Selbstpaare (`de_to_de`) auf Typebene
 * aus; zur Laufzeit prüft `isPairId`.
 */
export type PairId = { [S in Lang]: `${S}_to_${Exclude<Lang, S>}` }[Lang];

/**
 * Brücken außerhalb des Ziel-Kanons — jede App-/Oberflächensprache, die
 * kein `Lang` ist.
 *
 * SEIT DEM 20-SPRACHEN-AUSBAU (13.09.2026) DER ALLGEMEINE FALL STATT DES
 * ar-SONDERFALLS (Pilot 10.09.): Die App gibt es in 20 Sprachen
 * (`UI_LANGUAGES` in src/lib/i18n/types.ts), lernbar bleiben die vier
 * Hauptsprachen. Jede OBERFLÄCHE außerhalb dieser Vier — `'ar'` und die 15
 * neuen Heimatsprachen — bekommt ihre generierten Ankerwörter
 * (`src/data/bridge-pools.ts`) und dieselben vier Lernziele: Karten mit
 * Brückenwort vorn, Zielform hinten, gekoppelt über `concept`.
 */
export type ForeignBridge = Exclude<UiLanguage, Lang>;

/** Die Fremd-Brücken zur Laufzeit — dieselbe Wahrheit wie der Typ. */
export const FOREIGN_BRIDGES: readonly ForeignBridge[] = UI_LANGUAGES.filter(
  (ui): ui is ForeignBridge => !(SUPPORTED_TARGETS as readonly string[]).includes(ui)
);

/** Ist das eine Brücke außerhalb des Ziel-Kanons? */
export function isForeignBridge(value: string): value is ForeignBridge {
  return (FOREIGN_BRIDGES as readonly string[]).includes(value);
}

/** Die Richtungen einer Fremd-Brücke — gelernt wird jeweils X. */
export type ForeignPairDirection = `${ForeignBridge}_to_${Lang}`;

/** Die ID eines Paars — im selben Format wie die alten Richtungs-Strings. */
export function pairId(pair: Pair): PairId {
  // Der Cast ist safe: `pair` kann laut Typ kein Selbstpaar sein, und genau
  // solche schließt `PairId` aus.
  return `${pair.source}_to_${pair.target}` as PairId;
}

/** Das Paar zu einer ID — `null` für Selbstpaare und Fremdformat. */
export function parsePairId(id: string): Pair | null {
  const [source, marker, target] = id.split('_');
  if (marker !== 'to' || !source || !target) return null;
  const isLang = (value: string): value is Lang =>
    (SUPPORTED_TARGETS as readonly string[]).includes(value);
  if (!isLang(source) || !isLang(target) || source === target) return null;
  return { source, target };
}

/** Schmale Laufzeitprüfung, passend zum Typ `PairId`. */
export function isPairId(value: unknown): value is PairId {
  return typeof value === 'string' && parsePairId(value) !== null;
}

/** Alle gültigen Paare des Kanons: 4 × 3 = 12, ohne Selbstpaare. */
export const PAIRS: Pair[] = SUPPORTED_TARGETS.flatMap((source) =>
  SUPPORTED_TARGETS.filter((target) => target !== source).map((target) => ({ source, target }))
);

/**
 * Alle Paare einer Brückensprache — „Was kann jemand mit dieser
 * Systemsprache lernen?“ Deutsch als Brücke liefert die klassischen
 * Richtungen `de_to_*`; Englisch als Brücke zusätzlich `en_to_de`,
 * `en_to_es` und `en_to_th`.
 */
export function pairsFor(bridge: Lang): Pair[] {
  return PAIRS.filter((pair) => pair.source === bridge);
}

/**
 * Lernrichtung. `de_to_th` heißt weiterhin: Deutsch verstehen, Thai
 * hervorbringen (AE-11 gilt unverändert).
 *
 * BEWUSST UNVERÄNDERT AUF DEM BESTAND: `Direction` umfasst nur die
 * ausgelieferten Paare (de↔th/en/es). Für die deutsch-geankerten Richtungen
 * über allem Grundstoff gibt es `TargetDirection` — eine reine Erweiterung,
 * und jeder `Direction`-Wert ist zugleich ein gültiger `TargetDirection`. So
 * bleibt jede Profil- und Backup-Stelle (`profile.ts`, `backup.ts`) auf dem
 * alten Typ.
 */
export type Direction =
  | `${HubLanguage}_to_${Exclude<LanguageCode, HubLanguage>}`
  | `${Exclude<LanguageCode, HubLanguage>}_to_${HubLanguage}`;

/**
 * Die deutsch-geankerten Richtungen über **allen** Ziel-Grundstücken — die
 * klassischen sechs.
 *
 * WARUM WEITERHIN DEUTSCH-GEANKERT: Die deutschen Grammatikübungen hängen
 * an der deutschen Seite eines Paars; für sie ist diese Union die
 * vollständige Menge. Das freie Kreuzprodukt S≠T
 * leistet separat `Pair`/`pairsFor` — ohne Erbanteil an der Bestandstypung.
 */
export type TargetDirection = Direction;

/**
 * Die Richtung, unter der die INHALTE einer Lernsprache gespeichert sind
 * (Situationen, Diktat, Clips): `de_to_<code>`, für Deutsch selbst der
 * historische Schlüssel `th_to_de`. Gespeicherte Inhalte tragen genau diese
 * IDs — deshalb nie ändern.
 */
export function contentDirectionOf(language: LanguageCode): Direction {
  return (language === HUB_LANGUAGE ? `th_to_${HUB_LANGUAGE}` : `${HUB_LANGUAGE}_to_${language}`) as Direction;
}

/**
 * Die Inhalts-Richtungen einer Lernsprache — seit dem Sprach-Umbau genau
 * eine (`contentDirectionOf`). Früher `[de_to_X, X_to_de]`; `X_to_de` ist
 * inzwischen das DEUTSCH-Ziel einer X-Oberfläche und gehört nicht mehr zu X.
 */
export function directionsFor(language: LanguageCode): Direction[] {
  return [contentDirectionOf(language)];
}

/**
 * Welche Zielsprache steckt in dieser Richtung? Deutsch ist ja immer dabei.
 *
 * NUR FÜR DEN BESTAND: Für Richtungen über allen Ziel-Grundstücken (inklusive
 * Französisch) gibt es `languageOfTargetDirection`.
 */
export function languageOfDirection(direction: Direction): LanguageCode {
  return targetLanguageOf(direction);
}

/** Dasselbe für die erweiterten Richtungen. */
export function languageOfTargetDirection(direction: TargetDirection): TargetLanguage {
  return targetLanguageOf(direction);
}

/**
 * Bringt die lernende Person in dieser Richtung die Zielsprache hervor?
 *
 * SEIT DEN KREUZRICHTUNGEN AUF `PairDirection`: Auch `en_to_es` produziert
 * seine Zielseite — die Frage ist paarsymmetrisch und braucht keinen
 * de-geankerten Vertrag mehr.
 */
export function producesTargetLanguage(direction: PairDirection): boolean {
  return direction.startsWith(`${HUB_LANGUAGE}_to_`);
}

/**
 * Lernrichtung über **allen** zwölf Paaren des Kanons — der de-geankerte
 * Bestand (`Direction`), die sechs Kreuzrichtungen (th↔en, th↔es, en↔es) und
 * seit dem 20-Sprachen-Ausbau die Richtungen ALLER Fremd-Brücken
 * (`ar_to_*`, `zh_to_*`, … — `ForeignPairDirection`).
 *
 * WARUM EIN ZWEITER NAME NEBEN `PairId`: Dieselbe Zeichenketten-Union plus
 * Fremd-Brücken — `PairId` benennt die Paare des Sprachmodells,
 * `PairDirection` die Lernrichtung einer Sitzung darüber. Zwei Namen für
 * denselben Typ halten die Aufrufstellen lesbar („welche Richtung wird
 * gelernt“ statt „welches Paar ist gemeint“) und kosten nichts.
 *
 * WARUM `Direction` NICHT ANGEFASST WIRD: Gespeicherte Profile, Backups und
 * Kartenschlüssel tragen de-geankerte Richtungen; `Direction` bleibt deren
 * Vertrag. Nur Ziele, Auswahl und Queue (`goals.ts`, `review-session.ts`,
 * Lern-Reiter) arbeiten mit `PairDirection` — jeder `Direction`-Wert ist
 * zugleich ein gültiger `PairDirection`, Bestandsaufrufer ändern sich nicht.
 */
export type PairDirection = PairId | ForeignPairDirection;

/**
 * Die Fremd-Brücken-Richtungen zur Laufzeit — dieselbe Wahrheit wie der Typ
 * `ForeignPairDirection`, als Liste für die schmale Prüfung darunter.
 */
const FOREIGN_PAIR_DIRECTIONS: readonly ForeignPairDirection[] = FOREIGN_BRIDGES.flatMap(
  (bridge) => SUPPORTED_TARGETS.map((target) => `${bridge}_to_${target}` as ForeignPairDirection)
);

/** Schmale Laufzeitprüfung, passend zum Typ `PairDirection`. */
export function isPairDirection(value: unknown): value is PairDirection {
  if (isPairId(value)) return true;
  return (
    typeof value === 'string' &&
    (FOREIGN_PAIR_DIRECTIONS as readonly string[]).includes(value)
  );
}

/**
 * Die LERNSPRACHE einer Richtung — immer die rechte Seite: `de_to_th` → th,
 * `th_to_de` → de, `ar_to_es` → es.
 *
 * SPRACH-UMBAU 23.09.2026: Früher lieferte `th_to_de` hier 'th' (die alte
 * Thai-Erkennungsrichtung) — daher kamen Thai-Tonlegenden und Thai-Karten im
 * Deutsch-Ziel. Die rechte Seite ist die einzige Regel.
 */
export function targetLanguageOf(direction: PairDirection): LanguageCode {
  return direction.split('_to_')[1] as LanguageCode;
}

/** @deprecated Alter Name — identisch mit `targetLanguageOf`. */
export const pairLanguageOf = targetLanguageOf;

/**
 * Die ANKER-/Bedeutungsseite einer Richtung — die Sprache, die die lernende
 * Person bereits spricht (die Brücke). `en_to_es` hat den Anker `'en'`:
 * Bedeutungen, Hinweise und Aufträge dieser Richtung lesen sich dort, und die
 * Übungen lokalisierten bisher stillschweigend nach Deutsch, weil der erste
 * Bestand de-geankert war. Seit dem 21.09.2026 lesen die Übungen die
 * Bedeutungsseite über `translations[anchorOf(direction)]`.
 */
export function anchorOf(direction: PairDirection): UiLanguage {
  return direction.split('_to_')[0] as UiLanguage;
}

/**
 * Ist das eine de-geankerte Richtung (Deutsch auf einer Seite)?
 *
 * ALS TYPE PREDICATE, DAMIT BESTANDSSTELLEN SCHMALER LAUFEN: Wo ein
 * `PairDirection`-Wert weiter an `Direction`-Verträge geht (Profil,
 * Backup, `directionLabel`), beweist dieser Test die Zuteilung statt zu
 * casten. Kreuzrichtungen fallen hier bewusst durch — sie sind Neuland
 * (Stufe 1), nicht Bestand. Genauso `zh_to_de`: Es endet zwar auf `_to_de`,
 * gehört aber zur Fremd-Brücke und darf nie als `Direction` in Profil- oder
 * Backup-Verträge rutschen.
 */
export function isDeAnchored(value: PairDirection): value is Direction {
  if (isForeignBridge(value.split('_')[0] ?? '')) return false;
  return value.startsWith(`${HUB_LANGUAGE}_to_`) || value.endsWith(`_to_${HUB_LANGUAGE}`);
}

/**
 * Eine Silbe mit dem, was das Merkmal über sie sagt.
 *
 * SEIT PHASE 16 HIER statt in `feature.ts`: Der Vokabeltyp braucht ihn, und
 * `feature.ts` importiert den Vokabeltyp — der Zirkel wäre sonst unvermeidlich.
 *
 * Die Felder sind bewusst optional und schließen sich nicht aus: Thai trägt
 * einen `tone`, Spanisch ein `stressed`, Englisch keines von beiden. Ein
 * Pflichtfeld hier hieße, jede Sprache müsse das Merkmal jeder anderen
 * mitschleppen.
 */
export type SyllableAnnotation = {
  /** Die Silbe in Umschrift, Schreibung oder Lautschrift. */
  roman: string;
  /** Thai: der Ton — er wird zur Farbe und zur Konturglyphe. */
  tone?: Tone;
  /** Spanisch: trägt diese Silbe die Betonung? */
  stressed?: boolean;
};

/**
 * Was die App über eine Sprache weiß, unabhängig davon, ob es schon Inhalte
 * gibt.
 */
export type LanguageMeta = {
  /**
   * Der Bestands-Code aus `LANGUAGE_CODES`. SEIT DEM PAARMATRIX-MODELL VOM
   * TYP `TargetLanguage`: auch Deutsch als Ziel trägt seinen Code hier,
   * App-Bestand ist (`delivered: false`).
   */
  code: TargetLanguage;
  /** Name auf Deutsch, wie er in der Auswahl steht. */
  label: string;
  /** Eigenbezeichnung — hilft beim Wiedererkennen. */
  endonym: string;
  /** Locale für die Sprachausgabe (`expo-speech`). */
  speechLocale: string;
  /**
   * Was diese Sprache besonders schwer macht — ein Satz, der in der Auswahl
   * steht. Für Thai die Töne, für Englisch die Aussprache, für Spanisch die
   * Betonung.
   */
  challenge: TranslationKey;
};

/**
 * Das sprachspezifische Merkmal als **einhängbarer Baustein** (Pflicht 3).
 *
 * Thai bringt Tonfarben, Konturglyphen und die Herleitungsübung mit; Spanisch
 * bekäme später Betonungsregeln, Englisch die Aussprache je Wort. Damit die
 * App das tragen kann, ohne für jede Sprache umgebaut zu werden, steht hier
 * die Naht — dieselbe Bauart wie die Anbieter-Naht aus Phase 10.
 *
 * WAS BEWUSST **NICHT** IN DIESEN VERTRAG WANDERT: die Darstellung selbst.
 * Die Tonfarben bleiben in `constants/tones.ts`, die Schriftregeln in
 * `data/thai-script.ts`. Ein Merkmal sagt hier nur, **dass** es sie gibt und
 * wie sie heißen — sonst entstünde ein zweites Darstellungssystem neben dem
 * geprüften, und genau das verbietet Pflicht 3.
 */
export type LanguageFeature = {
  /** Übersetzungsschlüssel für den Kurznamen des Merkmals. */
  label: TranslationKey;
  /** Ein Satz: was das Merkmal ist und warum es zählt. */
  description: TranslationKey;
  /**
   * Wie es erlernt wird — bestimmt, ob eine Herleitungsübung überhaupt Sinn
   * ergibt.
   *
   *   `derivable`  — aus der Schrift ableitbar (Thai-Töne, spanische Betonung).
   *                  Dann lohnt eine Regelübung wie in Phase 13.
   *   `per-word`   — steht nicht in der Schrift und muss je Wort hinterlegt
   *                  werden (englische Aussprache).
   *   `none`       — kein eigenes Merkmal.
   */
  kind: 'derivable' | 'per-word' | 'none';
  /** Ist es gebaut, oder bisher nur entschieden? */
  implemented: boolean;
  /** Quelle der Entscheidung — Pflicht 4 verlangt Recherche, nicht Meinung. */
  source?: { title: string; url: string; retrieved: string; quote: string };
};

export type LanguageDefinition = LanguageMeta & {
  feature: LanguageFeature;
  /**
   * Wie viele geprüfte Vokabeln vorliegen. `0` heißt: die Sprache steht in
   * der Auswahl, ist aber **nicht lernbar** — und wird genau so gekennzeichnet
   * (Pflicht 5).
   */
  entryCount: number;
  /**
   * Ist der Grundstoff **im App-Bestand** (also in `VOCABULARY` und damit auf
   * jedem Gerät)? `false` heißt: geprüfte Einträge liegen im Repo, aber die
   * Auslieferung kommt noch — die Auswahl zeigt die Sprache ehrlich als „noch
   * nicht lernbar“, der Sprachwechsel lässt sie weg. Französisch steht so da,
 * bis sein Paket ausgeliefert wird (Roadmap v2, Phase 3).
   */
  delivered: boolean;
  /**
   * Trägt diese Sprache die deutschen Module — die Grammatikübungen? Sie gehören zu „X → Deutsch" und damit zu **jedem**
   * Paar, nicht zu Thai allein (Pflicht 6).
   */
  hasGermanModules: true;
};
