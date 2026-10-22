/**
 * Sicherung und Wiederherstellung der Lernhistorie (Backend-Review 2026-09-07).
 *
 * WAS GESICHERT WIRD — Bestandsaufnahme über die vorhandenen Reader, nichts
 * doppelt erfunden:
 *
 * - **Kartenzustände** (`cards`): `loadAllCardStates` aus `./repository`.
 *   Das ist der komplette FSRS-Fortschritt je Vokabel und Richtung.
 * - **Wiederholungs-Protokoll** (`reviewLog`): `loadReviewLog` aus
 *   `./review-log`, ein Dokument je Kalendertag. Übungs- und Schreibzähler
 *   (`drills`, `drillsCorrect`) stecken darin — es gibt KEINEN eigenen
 *   Writing-Stats-Speicher, Schreibübungen laufen über `rateCard` in Karten
 *   und Protokoll (siehe `./writing/session.ts`).
 * - **Lernprofil** (`meta`/`profile`): `loadProfile` aus `./profile` —
 *   Sprache und die gemerkten Stände der Reiter, nachsichtig gelesen.
 * - **Übungsgedächtnis** (`practice`, seit 22.10.2026, optional):
 *   `loadAllWordPractice` aus `./word-practice`. Ältere Sicherungen haben es
 *   nicht; dann startet es leer. Kaputte Einzeleinträge werden übergangen —
 *   sie steuern nur die Auswahl freier Übungen, nie den Lernstand.
 *
 * BEWUSST NICHT GESICHERT: die Anbieter-Einstellungen aus
 * `./providers/settings` (Geräte-/Setup-Angelegenheit) und der API-Schlüssel
 * aus dem SecureStore — ein Schlüssel gehört nicht in eine exportierte,
 * weitergegebene Datei. Vokabeln, Situationen, Bilder und Clips
 * sind App-Bestandteil, nicht Nutzerdaten, und kommen mit App-Updates.
 *
 * FORMAT: versioniertes JSON mit Kennung, damit fremde Dateien klar
 * abgelehnt und zukünftige Formate erkennbar bleiben:
 *
 *     { format: 'thaispeaker-backup', version: 1, exportedAt: ISO,
 *       data: { cards: [...], reviewLog: [...], profile: {...} } }
 *
 * MERGE-STRATEGIE: bewusst einfach — Import ERSETZT die jeweiligen
 * Sammlungen (clear + putMany in EINER Transaktion). Die Oberfläche holt
 * vorher eine ausdrückliche Bestätigung ein. Ein Zusammenführen zweier
 * Historien wäre FSRS-lich unsauber (Kartenzustände sind keine Summen) und
 * für den Rettungs-Fall, für den es das gibt, auch gar nicht gefragt.
 *
 * PLATTFORM-AUFTEILUNG zur Laufzeit (nicht per Metro-Endung, weil dieses
 * Modul bewusst EINE Datei bleibt): nativ schreibt die neue File/Directory-API
 * von expo-file-system (SDK 57; siehe auch `./blobs/backend`) ins
 * Cache-Verzeichnis und übergibt die Datei an `Sharing.shareAsync`; im Web
 * (react-native-web) lädt ein Blob über eine Object-URL — expo-file-system
 * existiert dort nicht (Web-Stub) und `Sharing.shareAsync` kann lokale
 * Datei-URIs laut Doku nicht teilen.
 */

import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { translate, type TranslationKey } from './i18n';
import type { TParams } from './i18n/types';
import { HUB_LANGUAGE, isLanguageCode, isPairDirection } from './languages/types';
import { LearnerProfile, loadProfile, setConversationDirection, setLanguage, setReviewSpot } from './profile';
import { loadAllCardStates } from './repository';
import { dayKey, loadReviewLog, ReviewDayLog } from './review-log';
import { DataStore, getStore, transact } from './storage';
import { cardKey, Direction, FSRSCardState } from './fsrs/types';
import { isValidWordPractice, loadAllWordPractice, type WordPractice } from './word-practice';

/** Kennung des Formats — alles andere wird beim Import abgelehnt. */
export const BACKUP_FORMAT = 'thaispeaker-backup';
/** Aktuelle Format-Version. Import akzeptiert kleinere, lehnt größere ab. */
export const BACKUP_VERSION = 1;

/**
 * Obergrenze für einzulesende Dateien. Kein Schutz grenzenloser Größe —
 * `asset.size` und Textlänge werden VOR dem Anwenden geprüft —, aber eine
 * Plausibilitätsdecke: die App schreibt selbst Werte im zweistelligen
 * Kilobyte-Bereich, 20 MB sind also rund zwei Zehnerpotenzen Luft.
 */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/**
 * Dateitypen, die der Picker anbietet. Bewusst nicht nur `application/json`:
 * Android meldet gewählte `.json`-Dateien je nach Quelle auch als
 * `application/octet-stream` oder `text/plain`. Den Inhalt prüft danach
 * ohnehin die Validierung — der Filter soll nur den Dokumentbestand
 * überschaubar halten, keine korrekt benannte Sicherung aussperren.
 */
const BACKUP_MIME_TYPES = ['application/json', 'application/octet-stream', 'text/plain'];

export type BackupData = {
  cards: FSRSCardState[];
  reviewLog: ReviewDayLog[];
  profile: LearnerProfile | null;
  /** Fehlt in Sicherungen vor dem 22.10.2026. */
  wordPractice?: WordPractice[];
};

export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: BackupData;
};

/** Was der Import übernommen hat — für die Erfolgsmeldung der Oberfläche. */
export type BackupImportSummary = {
  cards: number;
  logEntries: number;
  profileApplied: boolean;
  /** Wann die Sicherung erstellt wurde (ISO), oder `null` wenn unbekannt. */
  exportedAt: string | null;
};

/* ---------- Aufbauen (Export) ---------- */

/**
 * Liest alle gesicherten Datenmengen über die bestehenden Reader und stellt
 * das versionierte Dokument zusammen.
 */
export async function buildBackupDocument(
  store?: DataStore,
  now: number = Date.now()
): Promise<BackupDocument> {
  const [cards, reviewLog, profile, wordPractice] = await Promise.all([
    loadAllCardStates(store),
    loadReviewLog(store),
    loadProfile(store),
    loadAllWordPractice(store),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: { cards, reviewLog, profile, wordPractice },
  };
}

/** `thaispeaker-backup-YYYY-MM-DD.json` — Datum in lokaler Zeit (`dayKey`). */
export function backupFileName(now: number = Date.now()): string {
  return `thaispeaker-backup-${dayKey(now)}.json`;
}

/**
 * Erzeugt die Sicherung und bringt sie zum Nutzer.
 *
 * Nativ: Datei ins Cache-Verzeichnis (darf das System bei Speichermangel
 * räumen — nach dem Teilen wird sie nicht mehr gebraucht) und Share-Sheet.
 * Web: Blob-Download. Gibt den Dateinamen für die Erfolgsmeldung zurück.
 */
export async function exportBackup(
  options: { now?: number; store?: DataStore } = {}
): Promise<string> {
  const now = options.now ?? Date.now();
  const document = await buildBackupDocument(options.store, now);
  const json = JSON.stringify(document);
  const fileName = backupFileName(now);

  if (Platform.OS === 'web') {
    downloadBackupOnWeb(json, fileName);
  } else {
    await writeAndShareBackup(json, fileName);
  }
  return fileName;
}

/**
 * Nativer Arm des Exports — Datei schreiben und teilen.
 *
 * Nach `docs.expo.dev/versions/v57.0.0/sdk/filesystem/`: neue File/Directory-
 * API statt der Legacy-Funktionen (`writeAsStringAsync` & Co. sind in SDK 57
 * deprecated). Nach `docs.expo.dev/versions/v57.0.0/sdk/sharing/`:
 * `shareAsync` nimmt die lokale Datei-URI; `mimeType` wirkt auf Android,
 * `dialogTitle` auf Android und Web.
 */
async function writeAndShareBackup(json: string, fileName: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  file.write(json);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Lernhistorie sichern',
  });
}

/**
 * Web-Arm des Exports — Blob über Object-URL und Anker herunterladen.
 *
 * Wie `src/hooks/use-microphone-capture.web.ts` mit Object-URLs umgeht, nur
 * dass hier bewusst KEIN `Sharing` bemüht wird: die Web-Share-API kann
 * laut Doku keine lokalen URIs teilen. Die URL wird erst nach dem Klick
 * freigegeben — Safari braucht sie bis dahin.
 */
function downloadBackupOnWeb(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ---------- Einlesen und Prüfen (Import) ---------- */

/** Ist das eine Richtung, die es im Sprachmodell gibt (`de_to_X`/`X_to_de`)? */
function isKnownDirection(value: unknown): value is Direction {
  if (typeof value !== 'string') return false;
  const parts = value.split('_to_');
  if (parts.length !== 2) return false;
  const [from, to] = parts;
  return (
    (from === HUB_LANGUAGE && isLanguageCode(to)) || (to === HUB_LANGUAGE && isLanguageCode(from))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCardState(value: unknown): value is FSRSCardState['state'] {
  return value === 'new' || value === 'learning' || value === 'review' || value === 'mastered';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * SEIT DEN KREUZRICHTUNGEN (Stufe 1) VALIDIEREN KARTEN ÜBER ALLE PAAR-
 * RICHTUNGEN: `en_to_es` & Co. tragen eigene Kartenzustände, und der Import
 * darf eine Sicherung eines Kreuz-Lernstands nicht still verlieren. SEIT DEM
 * AR-PILOTEN AUCH ar_to_* — eine Sicherung mit arabischen Brücken-Karten
 * bleibt verwertbar. Profil und Gesprächs-Richtung bleiben bewusst bei
 * `isKnownDirection` (de-geankert) — sie speichern nur den Bestand.
 */
function isValidCard(entry: unknown): boolean {
  if (!isPlainObject(entry)) return false;
  return (
    typeof entry.vocabId === 'string' &&
    entry.vocabId.length > 0 &&
    isPairDirection(entry.direction) &&
    isCardState(entry.state) &&
    (entry.difficulty === null || isFiniteNumber(entry.difficulty)) &&
    (entry.stability === null || isFiniteNumber(entry.stability)) &&
    isFiniteNumber(entry.due) &&
    (entry.lastReview === null || isFiniteNumber(entry.lastReview)) &&
    isFiniteNumber(entry.reps) &&
    entry.reps >= 0 &&
    isFiniteNumber(entry.lapses) &&
    entry.lapses >= 0
  );
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDayLog(entry: unknown): boolean {
  if (!isPlainObject(entry)) return false;
  if (typeof entry.date !== 'string' || !DATE_PATTERN.test(entry.date)) return false;
  if (!isFiniteNumber(entry.total) || entry.total < 0) return false;
  if (!isPlainObject(entry.byDirection) || !isPlainObject(entry.byRating)) return false;
  if (entry.drills !== undefined && !isFiniteNumber(entry.drills)) return false;
  if (entry.drillsCorrect !== undefined && !isFiniteNumber(entry.drillsCorrect)) return false;
  return true;
}

function isValidProfile(value: unknown): value is LearnerProfile {
  if (!isPlainObject(value)) return false;
  if (!isLanguageCode(value.language)) return false;
  if (value.review !== null) {
    if (!isPlainObject(value.review)) return false;
    if (!isKnownDirection(value.review.direction)) return false;
    if (typeof value.review.mode !== 'string') return false;
  }
  if (value.conversation !== null && !isKnownDirection(value.conversation)) return false;
  return true;
}

/**
 * Ein Fehler beim Einlesen einer Sicherung — mit Wörterbuchschlüssel, damit
 * die Oberfläche ihn in der App-Sprache zeigt. Bis zum 16.10.2026 stand hier
 * nur deutscher Text, auch auf jeder anderen Oberfläche. `message` bleibt
 * deutsch (Protokolle, Tests).
 */
export class BackupError extends Error {
  constructor(readonly key: TranslationKey, readonly params?: TParams) {
    super(translate('de', key, params));
    this.name = 'BackupError';
  }
}

export type ValidationResult =
  | { ok: true; data: BackupData; exportedAt: string }
  | { ok: false; reason: string; key: TranslationKey; params?: TParams };

function abgelehnt(key: TranslationKey, params?: TParams): ValidationResult {
  return { ok: false, reason: translate('de', key, params), key, ...(params ? { params } : {}) };
}

/**
 * Grobe Strukturprüfung eines eingelesenen Dokuments — rein, ohne Store.
 *
 * „Grob“ heißt: Feldtypen und Aufzählungswerte, die die Writer und Reader der
 * App brauchen; keine semantische Plausibilisierung (etwa ob es die Vokabel-
 * ID wirklich gibt — unbekannte IDs bleiben harmlos liegen, bis der Grundstock
 * sie eines Tages kennt, und stören keine Statistik).
 */
export function validateBackupDocument(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return abgelehnt('backup.errNoData');
  }
  if (raw.format !== BACKUP_FORMAT) {
    return abgelehnt('backup.errFormat');
  }
  if (
    typeof raw.version !== 'number' ||
    !Number.isInteger(raw.version) ||
    raw.version < 1
  ) {
    return abgelehnt('backup.errVersion');
  }
  if (raw.version > BACKUP_VERSION) {
    return abgelehnt('backup.errNewer', { found: raw.version, supported: BACKUP_VERSION });
  }
  if (typeof raw.exportedAt !== 'string') {
    return abgelehnt('backup.errNoDate');
  }
  const data = raw.data;
  if (!isPlainObject(data)) {
    return abgelehnt('backup.errNoSection');
  }

  if (!Array.isArray(data.cards)) {
    return abgelehnt('backup.errNoCards');
  }
  for (let i = 0; i < data.cards.length; i++) {
    if (!isValidCard(data.cards[i])) {
      return abgelehnt('backup.errBadCard', { index: i + 1 });
    }
  }

  if (!Array.isArray(data.reviewLog)) {
    return abgelehnt('backup.errNoLog');
  }
  for (let i = 0; i < data.reviewLog.length; i++) {
    if (!isValidDayLog(data.reviewLog[i])) {
      return abgelehnt('backup.errBadLog', { index: i + 1 });
    }
  }

  // Das Profil darf fehlen (dann bleibt das aktuelle) — gibt es das Feld,
  // muss es aber sauber sein: halb geparste Werte würden von den Settern
  // still verworfen, und der Nutzer wüßte nicht, was passiert ist.
  if (data.profile !== undefined && data.profile !== null && !isValidProfile(data.profile)) {
    return abgelehnt('backup.errBadProfile');
  }

  return {
    ok: true,
    exportedAt: raw.exportedAt,
    data: {
      cards: data.cards as FSRSCardState[],
      reviewLog: data.reviewLog as ReviewDayLog[],
      profile: data.profile === undefined ? null : (data.profile as LearnerProfile | null),
      ...(Array.isArray(data.wordPractice)
        ? { wordPractice: data.wordPractice.filter(isValidWordPractice) }
        : {}),
    },
  };
}

/**
 * Text in Backup-Daten überführen — wirft `BackupError` (übersetzbar).
 * `maxBytes` begrenzt die Textlänge als zweite Decke hinter `asset.size`.
 */
export function parseBackupText(
  text: string,
  maxBytes: number = MAX_BACKUP_BYTES
): { data: BackupData; exportedAt: string } {
  if (text.length > maxBytes) {
    throw new BackupError('backup.errTooLarge');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('backup.errNotJson');
  }
  const result = validateBackupDocument(raw);
  if (!result.ok) throw new BackupError(result.key, result.params);
  return { data: result.data, exportedAt: result.exportedAt };
}

/* ---------- Anwenden (Import) ---------- */

/**
 * Schreibt die geprüften Daten ERSETZEND in den Store.
 *
 * Karten und Protokoll in EINER Transaktion (`transact` aus `./storage`):
 * bricht die App dazwischen ab, bleibt entweder der alte oder der neue
 * komplette Stand — kein Mischling. Das Profil folgt NACH der Transaktion
 * über die öffentlichen Setter, weil deren Lesen-Ändern-Schreiben selbst die
 * Store-Sperre nimmt und `withStoreLock` bewusst nicht verschachtelbar ist.
 *
 * Duplikate in den Eingaben (gleiche Karte, gleicher Tag) sind durch die
 * Schlüsselform idempotent: der letzte Eintrag gewinnt, es entsteht kein
 * zweites Dokument.
 */
export async function applyBackupToStore(
  data: BackupData,
  store?: DataStore
): Promise<BackupImportSummary> {
  const db = store ?? (await getStore());

  const { cards, logEntries } = await transact(db, async () => {
    await db.clear('cards');
    await db.putMany(
      'cards',
      data.cards.map((card) => ({ id: cardKey(card.vocabId, card.direction), value: card }))
    );
    await db.clear('reviewLog');
    await db.putMany(
      'reviewLog',
      data.reviewLog.map((entry) => ({ id: entry.date, value: entry }))
    );
    // Das Übungsgedächtnis gehört zur ersetzten Historie: ohne Eintrag in
    // der Sicherung (älteres Format) beginnt es leer.
    await db.clear('practice');
    await db.putMany(
      'practice',
      (data.wordPractice ?? []).map((entry) => ({ id: entry.vocabId, value: entry }))
    );
    return { cards: data.cards.length, logEntries: data.reviewLog.length };
  });

  let profileApplied = false;
  if (data.profile) {
    // Reihenfolge bewusst: setLanguage setzt die gemerkten Stände zurück,
    // die beiden Folgenden schreiben die mitgebrachten wieder rein.
    await setLanguage(data.profile.language, db);
    await setReviewSpot(data.profile.review, db);
    await setConversationDirection(data.profile.conversation, db);
    profileApplied = true;
  }

  return { cards, logEntries, profileApplied, exportedAt: null };
}

/* ---------- Plattform-Arme des Imports ---------- */

/**
 * Dateiauswahl des Systems. Liefert das gewählte Dokument oder `null`, wenn
 * abgebrochen wurde — die Oberfläche unterscheidet beides, weil nur eines
 * davon eine Meldung verdient.
 */
export async function chooseBackupFile(): Promise<DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: BACKUP_MIME_TYPES,
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  return result.assets[0] ?? null;
}

async function readBackupText(asset: DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    // Web liefert das File-Objekt mit; ohne es bleibt die (Data-)URI,
    // die sich über fetch lesen lässt.
    if (asset.file) return asset.file.text();
    const response = await fetch(asset.uri);
    return response.text();
  }
  // Native: der Picker hat nach Cache kopiert (`copyToCacheDirectory`), die
  // neue File-Klasse liest asynchron Text.
  const file = new File(asset.uri);
  if (!file.exists) {
    throw new BackupError('backup.errUnreadable');
  }
  return file.text();
}

/**
 * Liest die gewählte Datei, prüft sie und ersetzt die Lernhistorie.
 * Wirft bei unbrauchbarer Datei einen `BackupError`; die
 * Bestätigung VOR dem Ersetzen holt die Oberfläche.
 */
export async function restoreBackup(
  asset: DocumentPickerAsset,
  store?: DataStore
): Promise<BackupImportSummary> {
  if (typeof asset.size === 'number' && asset.size > MAX_BACKUP_BYTES) {
    throw new BackupError('backup.errTooLarge');
  }
  const text = await readBackupText(asset);
  const { data, exportedAt } = parseBackupText(text);
  const summary = await applyBackupToStore(data, store);
  return { ...summary, exportedAt };
}
