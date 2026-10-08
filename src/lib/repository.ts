/**
 * Typisierte Zugriffe auf den Dokumentspeicher.
 *
 * Die Screens sollen weder Sammlungsnamen noch Schlüsselformate kennen — sie
 * rufen hier ab. Der Speicher selbst kommt aus `lib/storage` und ist je nach
 * Plattform SQLite oder AsyncStorage (AE-3).
 */

import type { VocabEntry } from '@/data/vocab-types';
import { activeVocabulary, activeVocabularyIds, mitIpaStrichen } from '@/data/active-vocabulary';

import { BUILTIN_EXAM_MODULES } from '@/data/exam-modules';
import { EXAM_LEVELS, ExamLevel, ExamModule, isValidExamModule } from './exam/types';
import { bundledAssetUri, bundledDocuments, bundledEntry, isDeletedDraft, preferBundled } from './content/bundled';
import { isRejectedImageAsset } from './images/reviewed-assets';
import { isContentDeveloper } from './content/developer';

import { ConversationSituation, isValidSituation } from './conversation/types';
import { isLanguageCode, Lang, LANGUAGE_CODES } from './languages/types';
import { getAudioBlobStore } from './clips/blob-store';
import { invalidateClipIndex } from './clips/lookup';
import { AudioBlobStore, AudioClip, isValidAudioClip } from './clips/types';
import { getImageBlobStore } from './images/blob-store';
import { ImageBlobStore, VocabImage } from './images/types';

import { createCardState, reviewCard } from './fsrs/fsrs';
import { cardKey, Direction, FSRSCardState, PairDirection, Rating } from './fsrs/types';
import { packImageUri } from './packs/loader';
import type { PackLanguage } from './packs/manifest';
import { recordReviewInTransaction } from './review-log';
import { DataStore, getStore, transact } from './storage';

/**
 * Beim Lesen aussortierte Dokumente einmal melden.
 *
 * Sie werden bewusst nur ausgelassen und nicht geloescht: Vielleicht kann eine
 * spaetere Version mehr damit anfangen, und stilles Loeschen von Nutzerdaten
 * ist die schlechtere Voreinstellung. Die Meldung sorgt dafuer, dass ein
 * Schema-Bruch nicht voellig unbemerkt bleibt.
 */
function meldeAussortierte(was: string, roh: number, gueltig: number): void {
  if (roh !== gueltig) {
    console.warn(
      `[repository] ${roh - gueltig} von ${roh} ${was} sind unbrauchbar und werden ` +
        'beim Anzeigen ausgelassen (vermutlich aus einer aelteren Version).'
    );
  }
}

/* ---------- Vokabeln ---------- */

/**
 * Schreibt den mitgelieferten Grundstock in den Speicher.
 *
 * Bewusst idempotent und ueberschreibend: der Grundstock ist Teil der App,
 * nicht Nutzerdaten. Nutzerfortschritt liegt in der Sammlung `cards` und wird
 * hiervon nicht angefasst.
 */
export async function seedVocabulary(
  store?: DataStore,
  entries: VocabEntry[] = activeVocabulary()
): Promise<number> {
  const db = store ?? (await getStore());
  await db.putMany(
    'vocab',
    entries.map((entry) => ({ id: entry.id, value: entry }))
  );
  return entries.length;
}

export async function loadVocabulary(store?: DataStore): Promise<VocabEntry[]> {
  const db = store ?? (await getStore());
  const lokale = await db.getAll<VocabEntry>('vocab');
  // Was nicht (mehr) zum Katalog gehört — etwa Wörter des alten, festen
  // Grundstocks aus früheren Versionen — fliegt aus dem Vokabelspeicher.
  // Kartenstände (`cards`) bleiben unberührt.
  const aktiv = activeVocabularyIds();
  const retired = lokale.filter(word => !aktiv.has(word.id));
  for (const word of retired) await db.remove('vocab', word.id);
  // Phase 2, Schritt 4: KI-erzeugter Wortschatz läuft über catalog.json und
  // kommt gebündelt ÜBER den Store — dieselbe Regel wie bei den Prüfungen.
  // (Gebündelt ist hier der Katalog-Bestand der Art 'vocabulary'; der
  // mitgelieferte Grundstock oben ist Teil des Seeds.)
  return preferBundled('vocabulary', lokale.filter(word => aktiv.has(word.id))).map(mitIpaStrichen);
}

export async function loadVocabEntry(
  id: string,
  store?: DataStore
): Promise<VocabEntry | null> {
  return (await loadVocabulary(store)).find(word => word.id === id) ?? null;
}

/* ---------- Kartenzustände ---------- */

export async function loadCardState(
  vocabId: string,
  // SEIT DEN KREUZRICHTUNGEN AUF `PairDirection` (reine Weitung): Auch
  // Kreuzkarten werden hier gesucht; Bestandsaufrufer übergeben weiter
  // `Direction`-Werte und verhalten sich unverändert.
  direction: PairDirection,
  store?: DataStore
): Promise<FSRSCardState | null> {
  const db = store ?? (await getStore());
  return db.get<FSRSCardState>('cards', cardKey(vocabId, direction));
}

/**
 * Lädt den Kartenzustand oder legt ihn an, falls die Vokabel in dieser
 * Richtung noch nie gelernt wurde. Die neu angelegte Karte wird sofort
 * gespeichert, damit sie auch nach einem Neustart existiert.
 */
export async function loadOrCreateCardState(
  vocabId: string,
  direction: PairDirection,
  store?: DataStore,
  now: number = Date.now()
): Promise<FSRSCardState> {
  const db = store ?? (await getStore());
  const existing = await loadCardState(vocabId, direction, db);
  if (existing) return existing;

  const fresh = createCardState(vocabId, direction, now);
  await saveCardState(fresh, db);
  return fresh;
}

export async function saveCardState(card: FSRSCardState, store?: DataStore): Promise<void> {
  const db = store ?? (await getStore());
  await db.put('cards', cardKey(card.vocabId, card.direction), card);
}

export async function loadAllCardStates(store?: DataStore): Promise<FSRSCardState[]> {
  const db = store ?? (await getStore());
  return db.getAll<FSRSCardState>('cards');
}

/**
 * Wendet eine Bewertung an und schreibt das Ergebnis fort.
 *
 * Die Rechnung selbst macht `reviewCard` aus dem FSRS-Modul — hier wird sie
 * nur mit der Persistenz verbunden, damit die Screens weder die Formeln noch
 * den Speicher direkt anfassen.
 *
 * Kartenzustand und Tagesprotokoll entstehen in EINER Transaktion: bricht die
 * App zwischen beiden Schreibvorgängen ab, bleibt sonst eine Karte ohne
 * Protokolleintrag zurück (oder umgekehrt). Und der Kartenzustand wird
 * INNERHALB der Transaktion neu gelesen — der Aufruferübergabe liegt
 * womöglich ein älterer Snapshot zugrunde, und zwei parallele Bewertungen
 * derselben Karte würden sich sonst gegenseitig fortsetzen statt nacheinander.
 */
export async function rateCard(
  card: FSRSCardState,
  rating: Rating,
  store?: DataStore,
  now: number = Date.now()
): Promise<FSRSCardState> {
  const db = store ?? (await getStore());
  return transact(db, async () => {
    const current = (await loadCardState(card.vocabId, card.direction, db)) ?? card;
    const updated = reviewCard(current, rating, now);
    await saveCardState(updated, db);
    // Einziger Ort, an dem bewertet wird - deshalb auch der einzige Ort, an dem
    // das Tagesprotokoll fortgeschrieben werden muss. Ohne eigene Sperre, weil
    // die Transaktion den Store schon exklusiv haelt.
    await recordReviewInTransaction(card.direction, rating, now, db);
    return updated;
  });
}

export async function loadCardStatesForDirection(
  // SEIT DEN KREUZRICHTUNGEN AUF `PairDirection`: Die Sitzungs-
  // zusammenstellung (`review-session`) lädt auch `en_to_es` & Co.
  direction: PairDirection,
  store?: DataStore
): Promise<FSRSCardState[]> {
  const all = await loadAllCardStates(store);
  return all.filter((card) => card.direction === direction);
}

/* ---------- Sprachsituationen ---------- */

export async function loadSituations(store?: DataStore): Promise<ConversationSituation[]> {
  if (!__DEV__ || (!store && !isContentDeveloper())) return bundledDocuments('situations');
  const db = store ?? (await getStore());
  const roh = await db.getAll<unknown>('situations');
  const situations = roh.filter(isValidSituation);
  meldeAussortierte('Sprachsituationen', roh.length, situations.length);
  return preferBundled('situations', situations);
}

export async function loadSituation(
  id: string,
  store?: DataStore
): Promise<ConversationSituation | null> {
  return (await loadSituations(store)).find((situation) => situation.id === id) ?? null;
}

export async function countSituations(store?: DataStore): Promise<number> {
  return (await loadSituations(store)).length;
}

/**
 * Die beiden Richtungen, die gespeicherte Situationen kennen können —
 * `isValidSituation` lässt nur diese beiden zu; der Typ steht bewusst hier
 * als eigenes Bündel, damit das Studio nicht die breite `Direction`-Union
 * als Schlüssel braucht.
 */
export type SituationDirection = Extract<Direction, 'de_to_th' | 'th_to_de' | 'de_to_en' | 'de_to_es'>;
export type SituationDirectionCounts = Record<SituationDirection, number>;

/**
 * Situationen je Lernrichtung — der Bestand hinter dem Dialog-Reiter.
 *
 * Warum je Richtung und nicht nur gesamt: Der Generator erzeugt beide
 * Richtungen getrennt voneinander (sie sind eigene Plan-Einträge), und der
 * Nutzer soll sehen, welche Hälfte der Brücke schon gefüllt ist.
 */
export async function countSituationsByDirection(
  store?: DataStore
): Promise<SituationDirectionCounts> {
  const zaehler: SituationDirectionCounts = { de_to_th: 0, th_to_de: 0, de_to_en: 0, de_to_es: 0 };
  for (const situation of await loadSituations(store)) {
    if (situation.direction in zaehler) {
      zaehler[situation.direction as SituationDirection] += 1;
    }
  }
  return zaehler;
}

export async function clearSituations(store?: DataStore): Promise<void> {
  const db = store ?? (await getStore());
  await db.clear('situations');
}

/* ---------- Vokabelbilder (Phase 5) ---------- */

/**
 * Die Bilder liegen zweigeteilt: Metadaten in der Sammlung `images`, die
 * Bilddaten im Blob-Speicher (AE-14). Die Screens sollen davon nichts wissen
 * und fragen hier nach einer fertigen `uri`.
 */

export async function loadVocabImage(
  vocabId: string,
  store?: DataStore
): Promise<VocabImage | null> {
  const shipped = bundledDocuments('images').find((image) => image.id === vocabId);
  if (shipped) return shipped;
  if (!__DEV__ || (!store && !isContentDeveloper())) return null;
  const db = store ?? (await getStore());
  const doc = await db.get<VocabImage>('images', vocabId);
  return doc && !isDeletedDraft('images', doc) ? doc : null;
}

export async function loadVocabImages(store?: DataStore): Promise<VocabImage[]> {
  if (!__DEV__ || (!store && !isContentDeveloper())) return bundledDocuments('images');
  const db = store ?? (await getStore());
  const images = await db.getAll<VocabImage>('images');
  return preferBundled('images', images);
}

export async function countVocabImages(store?: DataStore): Promise<number> {
  return (await loadVocabImages(store)).length;
}

/** Bildbestand je Generator-Zielsprache — seit dem 10.09. inklusive Deutsch. */
export type ImageLanguageCounts = Record<Lang, number>;

/**
 * Bilder je Zielsprache — über den Vokabel-Eintrag, zu dem das Bild gehört.
 *
 * Die Bild-ID IST die Vokabel-ID („Gleich der Vokabel-ID", `images/types.ts`);
 * die Sprache steht also nicht im Bilddokument, sondern am zugehörigen
 * Eintrag des Grundstocks. Einträge außerhalb des Grundstocks werden
 * ausgelassen statt erraten — ein Bild ohne Vokabel wäre ohnehin nicht
 * auffindbar.
 *
 * SEIT „Füge noch Deutsch zum Generieren hinzu" (10.09.) zählt die Zeile
 * Deutsch mit, und zwar ehrlich für ihre Frage: Ein Bildmotiv gehört zum
 * BEGRIFF, nicht zur Sprache (AE-46) — deutsche Karten zeigen das
 * Konzeptbild ihres Ankers. Die Zeile sagt also, wie viele der de-Pool-
 * Begriffe ein Bild haben; dasselbe Bild kann dadurch auch in der Zeile
 * seines Ankers stehen. Die th/en/es-Zeilen zählen unverändert über die
 * Sprache ihres Grundstock-Eintrags.
 */
export async function countImagesByLanguage(
  store?: DataStore
): Promise<ImageLanguageCounts> {
  const zaehler = Object.fromEntries(LANGUAGE_CODES.map((code) => [code, 0])) as ImageLanguageCounts;
  const nachId = new Map(bundledDocuments('vocabulary').map((word) => [word.id, word]));
  for (const image of await loadVocabImages(store)) {
    const eintrag = nachId.get(image.vocabId || image.id);
    if (eintrag && isLanguageCode(eintrag.language)) zaehler[eintrag.language] += 1;
  }
  return zaehler;
}

/**
 * Anzeigbare Quelle für das Bild einer Vokabel, oder `null`.
 *
 * SEIT DER PAKET-ARCHITEKTUR (Roadmap v2) LÄUFT ES ZUERST ÜBERS PAKET: Ist
 * eine Sprache installiert und trägt das Bild, gewinnt seine file://-URI —
 * erst bei `null` greift das eingebettete Asset, dann der Ablage-Weg wie
 * vorher. Ohne `language` (oder ohne Dateisystem, etwa im Test) bleibt es
 * beim bisherigen Verhalten.
 *
 * `null` heißt hier ausdrücklich auch: Metadaten vorhanden, Datei aber weg.
 * Dann zeigt die Karte einfach kein Bild, statt eine leere Fläche zu
 * reservieren — und der nächste Generierungslauf holt das Bild nach.
 */
export async function loadVocabImageUri(
  vocabId: string,
  store?: DataStore,
  blobStore?: ImageBlobStore,
  language?: PackLanguage
): Promise<string | null> {
  if (language) {
    const gepackt = await packImageUri(language, vocabId).catch(() => null);
    if (gepackt && !isRejectedImageAsset(gepackt)) return gepackt;
  }
  if (isRejectedImageAsset(bundledEntry('images', vocabId)?.asset)) return null;
  const shipped = await bundledAssetUri('images', vocabId);
  if (shipped) return shipped;
  if (!__DEV__ || (!store && !isContentDeveloper())) return null;
  const doc = await loadVocabImage(vocabId, store);
  if (!doc) return null;
  if (isRejectedImageAsset(doc.blobKey)) return null;
  const blobs = blobStore ?? (await getImageBlobStore());
  return blobs.uri(doc.blobKey);
}

export async function clearVocabImages(
  store?: DataStore,
  blobStore?: ImageBlobStore
): Promise<void> {
  const db = store ?? (await getStore());
  const blobs = blobStore ?? (await getImageBlobStore());
  // Erst die Dateien, dann die Dokumente: bricht es dazwischen ab, bleiben
  // Dokumente ohne Datei zurueck - die gelten als "fehlt" und werden neu
  // erzeugt. Andersherum blieben Dateien liegen, von denen niemand mehr weiss.
  await blobs.clear();
  await db.clear('images');
}

/* ---------- Hoerclips (Phase 11) ---------- */

/**
 * Wie die Bilder zweigeteilt: Metadaten in der Sammlung `audio`, die
 * Audiodaten im Blob-Speicher (AE-30). Gelesen wird nachsichtig (AE-25).
 */

export async function loadAudioClips(store?: DataStore): Promise<AudioClip[]> {
  if (!__DEV__ || (!store && !isContentDeveloper())) return bundledDocuments('audio');
  const db = store ?? (await getStore());
  const raw = await db.getAll<unknown>('audio');
  const clips = raw.filter(isValidAudioClip);
  meldeAussortierte('Hoerclips', raw.length, clips.length);
  return preferBundled('audio', clips);
}

export async function countAudioClips(store?: DataStore): Promise<number> {
  return (await loadAudioClips(store)).length;
}

/** Summe der abgelegten Audiodaten in Byte — die gemessene Zahl neben der Schaetzung. */
export async function sumAudioClipBytes(store?: DataStore): Promise<number> {
  return (await loadAudioClips(store)).reduce((sum, clip) => sum + clip.byteSize, 0);
}

/** Clipbestand je Zielsprache. */
export type ClipLanguageCounts = Record<Lang, number>;

/**
 * Hörclips je Generator-Zielsprache.
 *
 * SEIT „Füge noch Deutsch zum Generieren hinzu" (10.09.) MIT Deutsch: Der
 * Studio-Audio-Generator erzeugt deutsche Clips für den de-Pool (X_to_de-
 * Rückseiten), und die Zeile zeigt, wie viele davon liegen. Vorher
 * entstanden de-Clips nur im Auslieferungslauf (Prüfungstexte); wer alle
 * zählen will, nimmt `countAudioClips`.
 */
export async function countAudioClipsByLanguage(
  store?: DataStore
): Promise<ClipLanguageCounts> {
  const zaehler: ClipLanguageCounts = { th: 0, en: 0, es: 0, de: 0 };
  for (const clip of await loadAudioClips(store)) {
    // `loadAudioClips` sortiert Fremdes aus (`isValidAudioClip`) — der
    // Schlüssel `ClipLanguage` deckt genau die vier Generator-Sprachen ab.
    zaehler[clip.language] += 1;
  }
  return zaehler;
}

export async function clearAudioClips(
  store?: DataStore,
  blobStore?: AudioBlobStore
): Promise<void> {
  const db = store ?? (await getStore());
  const blobs = blobStore ?? (await getAudioBlobStore());
  // Erst die Dateien, dann die Dokumente - wie bei den Bildern.
  await blobs.clear();
  await db.clear('audio');
  invalidateClipIndex();
}

/* ---------- Pruefungsmodule (Phase 7) ---------- */

/**
 * Spielt die mitgelieferten Aufgaben ein.
 *
 * Wie beim Vokabel-Grundstock: idempotent und ueberschreibend, weil sie Teil
 * der App sind und nicht Nutzerdaten. Erzeugte Aufgaben (`source: 'generated'`)
 * werden dabei nicht angefasst.
 */
export async function seedExamModules(
  store?: DataStore,
  modules: ExamModule[] = BUILTIN_EXAM_MODULES
): Promise<number> {
  const db = store ?? (await getStore());
  await db.putMany(
    'exam',
    modules.map((module) => ({ id: module.id, value: module }))
  );
  return modules.length;
}

export async function loadExamModules(store?: DataStore): Promise<ExamModule[]> {
  if (!__DEV__ || (!store && !isContentDeveloper())) return preferBundled('exam', BUILTIN_EXAM_MODULES);
  const db = store ?? (await getStore());
  const roh = await db.getAll<unknown>('exam');
  let modules = roh.filter(isValidExamModule);
  meldeAussortierte('Pruefungsaufgaben', roh.length, modules.length);

  // Geprueft wird, ob die MITGELIEFERTEN Aufgaben da sind - nicht, ob die
  // Sammlung leer ist. Der Unterschied ist keine Feinheit: wer auf einem
  // frischen Geraet erst Aufgaben erzeugt und dann die Pruefung oeffnet,
  // haette sonst nur die erzeugten und nie die mitgelieferten.
  const vorhanden = new Set(modules.map((module) => module.id));
  const fehlt = BUILTIN_EXAM_MODULES.some((module) => !vorhanden.has(module.id));
  if (fehlt) {
    await seedExamModules(db);
    modules = (await db.getAll<unknown>('exam')).filter(isValidExamModule);
  }

  return preferBundled('exam', modules);
}

export async function countExamModules(store?: DataStore): Promise<number> {
  return (await loadExamModules(store)).length;
}

export async function countGeneratedExamModules(store?: DataStore): Promise<number> {
  return (await loadExamModules(store)).filter((module) => module.source === 'generated').length;
}

/** Aufgaben je Stufe — gesamt und davon erzeugt. */
export type ExamLevelCounts = Record<ExamLevel, { total: number; generated: number }>;

/**
 * Prüfungsaufgaben je Stufe.
 *
 * Erzeugt und mitgeliefert getrennt zu sehen ist hier der eigentliche Punkt:
 * die mitgelieferten Aufgaben sind Teil der App, nur die übrigen sind das
 * Ergebnis von Generierungsläufen — und nur die kosten beim Löschen etwas.
 */
export async function countExamModulesByLevel(store?: DataStore): Promise<ExamLevelCounts> {
  const zaehler = Object.fromEntries(
    EXAM_LEVELS.map((level) => [level, { total: 0, generated: 0 }])
  ) as ExamLevelCounts;
  for (const module of await loadExamModules(store)) {
    const stufe = zaehler[module.level];
    if (!stufe) continue;
    stufe.total += 1;
    if (module.source === 'generated') stufe.generated += 1;
  }
  return zaehler;
}

/* ---------- Einstellungen / Lernprofil ---------- */

export async function readMeta<T>(key: string, fallback: T, store?: DataStore): Promise<T> {
  const db = store ?? (await getStore());
  const value = await db.get<T>('meta', key);
  return value === null ? fallback : value;
}

export async function writeMeta<T>(key: string, value: T, store?: DataStore): Promise<void> {
  const db = store ?? (await getStore());
  await db.put('meta', key, value);
}
