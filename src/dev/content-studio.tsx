import { LearningStagePicker } from '@/components/learning-stage-picker';
import { STAGE_LEVELS, type LearningStage } from '@/lib/learning-stages';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiKeysCard } from '@/components/api-keys-card';
import { SettingsRow } from '@/components/settings-row';
import { ThemedButton } from '@/components/themed-button';
import { ContentReport } from './content-report';
import { VocabZieleCard } from './vocab-ziele-card';
import { durchschnittsAnteil } from '@/lib/content/wortschatz-anteil';
import { findeDuplikat } from '@/lib/content/aehnlichkeit';
import { getStore } from '@/lib/storage';
import type { ConversationSituation as Situation } from '@/lib/conversation/types';
import { estimateRunCost } from './run-cost';
import { clearContentSelection, exportDrafts, studioRequest, type StudioState } from './content-client';
import { fahreKette, planChain, type ChainStep } from './chain-run';
import { planDeliveryAudio } from '@/lib/content/audio-plan';
import { previewAudioDelivery } from '@/lib/content/delivery-preview';


import { DiagnosticsCard } from '@/components/diagnostics-card';
import { CountItem, GeneratorCard, RunOption, StartArgs } from '@/components/generator-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EXAM_LEVELS, type ExamModule } from '@/lib/exam/types';
import { Spacing } from '@/constants/theme';
import { runClipBatch, missingClipSpecs } from '@/lib/clips/batch';
import { getActiveAudioBlobBackend, getAudioBlobStore } from '@/lib/clips/blob-store';
import { createClipGenerationClient } from '@/lib/clips/generator';
import { estimateClipBytes, formatBytes, planClips, planClipTestRun } from '@/lib/clips/plan';
import { voicesFor } from '@/data/tts-voices';
import { AudioClipSpec } from '@/lib/clips/types';
import { runGenerationBatch, missingSpecs } from '@/lib/conversation/batch';
import { ConversationSituation } from '@/lib/conversation/types';
import { createGenerationClient } from '@/lib/conversation/generator';
import { FULL_RUN, planSituations } from '@/lib/conversation/plan';
import { getActiveBlobBackend, getImageBlobStore } from '@/lib/images/blob-store';
import { runImageBatch, missingImageSpecs } from '@/lib/images/batch';
import { createImageGenerationClient } from '@/lib/images/generator';
import { countImageCandidates, IMAGE_TEST_RUN, planImages } from '@/lib/images/plan';
import { activeVocabularyFor } from '@/data/active-vocabulary';
import { VocabEntry } from '@/data/vocab-types';
import { LANGUAGE_ORDER, LANGUAGE_LABELS } from '@/lib/languages/registry';
import { Lang, type LanguageCode } from '@/lib/languages/types';
import { loadProfile } from '@/lib/profile';
import { HELPER_AUDIO_PROVIDER, ProviderId } from '@/lib/providers/types';
import {
  defaultSettings,
  GENERATOR_GROUP_INFO,
  GeneratorChoice,
  GeneratorGroupId,
  GeneratorSettings,
  loadGeneratorSettings,
  setGeneratorChoice,
  setGeneratorProvider,
} from '@/lib/providers/settings';
import { helperAudioAvailable } from '@/lib/providers/audio';
import {
  loadVocabulary,
  loadExamModules,
  countAudioClips,
  countAudioClipsByLanguage,
  countExamModules,
  countExamModulesByLevel,
  countGeneratedExamModules,
  countImagesByLanguage,
  countSituations,
  countSituationsByDirection,
  countVocabImages,
  loadSituations,
  sumAudioClipBytes,
  ClipLanguageCounts,
  ExamLevelCounts,
  ImageLanguageCounts,
  SituationDirectionCounts,
} from '@/lib/repository';

/**
 * Alle drei Generatoren teilen sich Aufbau und Bedienung (`GeneratorCard`),
 * darunter denselben Batch-Läufer und seit Phase 10 auch denselben
 * Anbieter-Vertrag; unterschiedlich sind nur Bauplan und Ablage.
 *
 * Die Anbieterwahl liegt **je Gruppe** getrennt (`meta/generators`) — auch
 * seit der Nutzerentscheidung vom 10.09. (nur noch Gemini und OpenAI/Helper
 * in der Auswahl), denn die Trennung kostet nichts und wer für Bilder und
 * Text verschieden einstellen will, soll das weiter können.
 */

const SITUATION_RUNS: RunOption[] = [
  {
    id: 'test',
    label: 'Probelauf',
    hint: '8 Situationen je Sprache — alle Themen und Niveaus je einmal',
  },
  {
    id: 'full',
    label: 'Vollständiger Lauf',
    hint: '256 Situationen je Sprache — vorhandene werden übersprungen',
  },
];

// SEIT PHASE 16 AUSDRUECKLICH THAI. Die Planer sind sprachparametrisiert
// (Pflicht 4), aber diese Seite bietet die Wahl noch nicht an - und eine Zahl
// ohne Sprache waere hier eine stille Falschaussage. Was fehlt, steht in
// PROGRESS.md unter Phase 16.

/** Audio und Bilder greifen auf denselben veröffentlichten Wortschatz zu. */
function poolFuer(code: Lang): VocabEntry[] { return activeVocabularyFor(code); }

/**
 * Der Bilderlauf haengt seit Phase 18 an der gewaehlten Sprache: Wie viele
 * Bilder es werden, steht erst fest, wenn die Sprache feststeht. Die
 * de-Pool-Begriffe teilen das Konzeptbild ihres Ankers (AE-46) — der Lauf
 * toppt fehlende Konzeptbilder auf.
 */
function imageRunOptions(language: Lang): RunOption[] {
  const alle = countImageCandidates(poolFuer(language));
  return [
    { id: 'test', label: 'Probelauf', hint: `${IMAGE_TEST_RUN} Bilder — kleiner Testlauf` },
    {
      id: 'full',
      label: 'Alle konkreten Vokabeln',
      hint: `${alle} Bilder (${LANGUAGE_LABELS[language]}) — kostet echtes Geld und dauert`,
      localHint: `${alle} Bilder (${LANGUAGE_LABELS[language]}) — läuft lokal; benötigt Zeit und Strom`,
    },
  ];
}

/**
 * Die Umfänge des Clip-Laufs hängen vom Bestand ab (wie viele Situationen
 * gespeichert sind) und vom Anbieter (WAV bei Gemini, mp3 bei ChatGPT) —
 * deshalb werden sie je Aufruf gebaut, nicht als Konstante. Die Schätzung
 * steht **vor** dem Start am Knopf (Pflicht 3).
 */
function clipRunOptions(
  storedSituations: ConversationSituation[],
  provider: ProviderId,
  language: Lang,
  exams: ExamModule[] = []
): { options: RunOption[]; specsFor: (optionId: string) => AudioClipSpec[] } {
  storedSituations = storedSituations.filter(s => s.direction.endsWith(`_to_${language}`));
  const plans: Record<string, AudioClipSpec[]> = {
    // Phase 2, Schritt 2: die drei Haupt-Buttons — Wörter, Sätze, Dialoge —
    // sauber getrennt (Schritt 7: erst Wörter und Kernsätze als Clips, die
    // Dialog-Turns laufen standardmäßig über die Laufzeit-Stimme).
    words: planClips({ vocabulary: poolFuer(language), includeExamples: false }),
    sentences: planClips({ vocabulary: poolFuer(language), includeWords: false }),
    // Nur Gesprächszüge der gewählten Zielsprache vertonen.
    turns: planClips({ includeWords: false, includeExamples: false, situations: storedSituations }),
    test: planClipTestRun(poolFuer(language)),
    delivery: [...new Map([...planDeliveryAudio(storedSituations, exams), ...planClips({ vocabulary: poolFuer(language) })].filter(spec => spec.language === language).map(spec => [spec.id, spec])).values()],
    all: planClips({ vocabulary: poolFuer(language), situations: storedSituations }),
  };
  const size = (specs: AudioClipSpec[]) => {
    const bytes = estimateClipBytes(specs, provider);
    return bytes === null ? '' : ` · geschätzt ${formatBytes(bytes)}`;
  };
  const options: RunOption[] = [
    { id: 'words', label: 'Wörter', hint: `${plans.words.length} Clips (${LANGUAGE_LABELS[language]}) — jedes Wort einzeln${size(plans.words)}` },
    { id: 'sentences', label: 'Sätze', hint: `${plans.sentences.length} Clips — die Beispielsätze der Vokabeln als Kernsätze${size(plans.sentences)}` },
    {
      id: 'turns',
      label: 'Dialoge',
      hint:
        plans.turns.length === 0
          ? 'Keine gespeicherten Sprachsituationen — erst im Text-Reiter Dialoge erzeugen.'
          : `${plans.turns.length} Clips — jeder Gesprächszug auf ${LANGUAGE_LABELS[language]} der ${storedSituations.length} gespeicherten Situationen, gleiche Sätze nur einmal${size(plans.turns)}`,
    },
    { id: 'test', label: 'Probelauf', hint: `${plans.test.length} Clips — fünf Vokabeln samt Beispielsatz${size(plans.test)}` },
    { id: 'delivery', label: 'Auslieferung: gewählte Sprache', hint: `${plans.delivery.length} Clips — Wörter, Beispiele, Dialoge und Hörtexte der Prüfungen${size(plans.delivery)}` },
    { id: 'all', label: 'Alles', hint: `${plans.all.length} Clips${size(plans.all)} — kostet echtes Geld und dauert` },
  ];
  return { options, specsFor: (optionId) => plans[optionId] ?? plans.words };
}

// ---------------------------------------------------------------------------
// Grundstock („Ich möchte einen Grundstock haben von allen") und die
// Schritte der „Alle …"-Kettenläufe. Beides liest dieselben Quellen: die
// sprachneutrale Registry/Planung und die Zähler-Helfer des Repositorys.
// ---------------------------------------------------------------------------

const RICHTUNGEN = ['de_to_th', 'de_to_en', 'de_to_es', 'th_to_de'] as const;

/**
 * Die GESPROCHENE Seite eines Dialogs — dieselbe Sicht, mit der auch der
 * Gesprächs-Reiter die Sprachen listet (Thai = de_to_th, Deutsch = th_to_de;
 * Nutzerwunsch 15.09.: Sprachnamen statt Richtungs-Pfeile im Grundstock).
 */
const GESPROCHENE_SEITE: Record<(typeof RICHTUNGEN)[number], string> = {
  de_to_th: LANGUAGE_LABELS.th,
  th_to_de: LANGUAGE_LABELS.de,
  de_to_en: LANGUAGE_LABELS.en,
  de_to_es: LANGUAGE_LABELS.es,
};

/**
 * Die Generier-Sprachen in Kettenreihenfolge, Deutsch zuletzt
 * (Nutzerentscheidung 10.09.). Seit dem Sprach-Umbau (23.09.) steht Deutsch
 * schon in `LANGUAGE_ORDER` — ein zweites Anhängen hätte Deutsch doppelt
 * geführt (doppelter React-Schlüssel, Kettenlauf zweimal über Deutsch).
 */
const GENERIER_SPRACHEN: Lang[] = [...LANGUAGE_ORDER.filter((code) => code !== 'de'), 'de'];

/** „Alle Sprachen“ der Bilder-/Audio-Kette: Thai → Englisch → Spanisch → Deutsch. */
const ALLE_SPRACHEN: ChainStep[] = GENERIER_SPRACHEN.map((code) => ({
  key: code,
  label: LANGUAGE_LABELS[code],
}));

/**
 * Eine Zeile „Thai 12 · Englisch 3 · Spanisch 0 · Deutsch 0“ fürs
 * Grundstock-Panel — die Deutsch-Zeile zählt die Clips/Bilder des
 * abgeleiteten de-Pools (siehe `countAudioClipsByLanguage`).
 */
function jeSprache(counts: ClipLanguageCounts | ImageLanguageCounts | null): string {
  return GENERIER_SPRACHEN
    .map((code) => `${LANGUAGE_LABELS[code]} ${counts ? counts[code] : '…'}`)
    .join(' · ');
}

/** Die Zähler-Zeile im Kopf eines Generators; die gewählte Sprache wird hervorgehoben. */
function sprachZaehler(
  counts: ClipLanguageCounts | ImageLanguageCounts | null,
  gewaehlt?: Lang
): CountItem[] {
  return GENERIER_SPRACHEN.map((code) => ({
    key: code,
    label: LANGUAGE_LABELS[code],
    count: counts ? counts[code] : null,
    ...(gewaehlt ? { highlighted: code === gewaehlt } : {}),
  }));
}

function richtungsZaehler(counts: SituationDirectionCounts | null): CountItem[] {
  return RICHTUNGEN.map((richtung) => ({
    key: richtung,
    label: GESPROCHENE_SEITE[richtung],
    count: counts ? counts[richtung] : null,
  }));
}

export default function ContentStudio() {
  // Phase 2, Schritt 2: „Inhalte erzeugen“ hat drei Unterreiter (Text /
  // Audio / Bilder); die Generator-Karten bleiben, die Navigation darüber
  // gruppiert neu. 'exam' entfällt ab Schritt 3 (Generator wird entfernt).
  const [situationLanguage, setSituationLanguage] = useState<Lang>('th');
  const [section, setSection] = useState<
    'home' | 'keys' | 'reports' | 'text' | 'audio' | 'bilder' | GeneratorGroupId
  >('home');
  /** Warnung des Audio-Reiters: ungeprüfte Einträge im Live-Bericht. */
  const [audioWarnung, setAudioWarnung] = useState('');
  const [running, setRunning] = useState(false);
  const [reportRevision, setReportRevision] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [situations, setSituations] = useState<number | null>(null);
  const [storedSituations, setStoredSituations] = useState<ConversationSituation[]>([]);
  const [situationsByDirection, setSituationsByDirection] = useState<SituationDirectionCounts | null>(null);
  const [wortschatzAnteil, setWortschatzAnteil] = useState<number | null>(null);
  const [clips, setClips] = useState<{ count: number; bytes: number } | null>(null);
  const [clipsByLanguage, setClipsByLanguage] = useState<ClipLanguageCounts | null>(null);
  const [clipBackend, setClipBackend] = useState<string | null>(null);
  const [images, setImages] = useState<number | null>(null);
  const [imagesByLanguage, setImagesByLanguage] = useState<ImageLanguageCounts | null>(null);
  const [blobBackend, setBlobBackend] = useState<string | null>(null);
  const [exams, setExams] = useState<{ total: number; generated: number } | null>(null);
  const [examsByLevel, setExamsByLevel] = useState<ExamLevelCounts | null>(null);
  const [storedExams, setStoredExams] = useState<ExamModule[]>([]);
  const [wordsByLanguage, setWordsByLanguage] = useState<ClipLanguageCounts | null>(null);
  const [generators, setGenerators] = useState<GeneratorSettings>(defaultSettings());
  /**
   * Fuer welche Sprache Bilder und Clips erzeugt werden.
   *
   * Voreingestellt ist die gerade gelernte Sprache — das ist fast immer die
   * gemeinte. Sie steht getrennt vom Lernprofil, weil ein Generierungslauf
   * eine einmalige Handlung ist und nicht bestimmen soll, was man lernt.
   */
  // SEIT DEM 10.09. VOM TYP `Lang`: Deutsch ist als Generier-Sprache dabei
  // (X_to_de-Rückseiten, abgeleiteter de-Pool) — siehe `ALLE_SPRACHEN`.
  const [mediaLanguage, setMediaLanguage] = useState<Lang>('th');

  const [situationStage, setSituationStage] = useState<LearningStage>('beginner');
  const refreshSituations = useCallback(async () => {
    const [count, nachRichtung] = await Promise.all([countSituations(), countSituationsByDirection()]);
    setSituations(count);
    setSituationsByDirection(nachRichtung);
    // Die Clip-Umfaenge haengen an den gespeicherten Situationen.
    const dialoge = await loadSituations();
    setStoredSituations(dialoge);
    // Phase 2, Schritt 4: der bekannte Wortschatz-Anteil der Dialoge
    // (deutsche Seite) — die Anzeige für die ~95-%-Regel.
    const vocab = await loadVocabulary();
    setWortschatzAnteil(durchschnittsAnteil(dialoge, vocab));
  }, []);

  const refreshClips = useCallback(async () => {
    const [count, bytes, nachSprache] = await Promise.all([
      countAudioClips(),
      sumAudioClipBytes(),
      countAudioClipsByLanguage(),
    ]);
    setClips({ count, bytes });
    setClipsByLanguage(nachSprache);
  }, []);

  const refreshImages = useCallback(async () => {
    const [count, nachSprache] = await Promise.all([countVocabImages(), countImagesByLanguage()]);
    setImages(count);
    setImagesByLanguage(nachSprache);
  }, []);

  const refreshExams = useCallback(async () => {
    const modules = await loadExamModules();
    setStoredExams(modules);
    const [total, generated, nachStufe] = await Promise.all([
      countExamModules(),
      countGeneratedExamModules(),
      countExamModulesByLevel(),
    ]);
    setExams({ total, generated });
    setExamsByLevel(nachStufe);
  }, []);

  /** Der ganze Bestand auf einmal — der „Aktualisieren“-Knopf und onFinished. */
  const refreshStock = useCallback(async () => {
    await studioRequest('/state');
    const words = await loadVocabulary();
    setWordsByLanguage(Object.fromEntries(GENERIER_SPRACHEN.map(code => [code, words.filter(word => String(word.language) === code).length])) as ClipLanguageCounts);
    await Promise.all([refreshSituations(), refreshClips(), refreshImages(), refreshExams()]);
  }, [refreshSituations, refreshClips, refreshImages, refreshExams]);

  // Phase 2, Schritt 2: die Reihenfolge-Warnung — Audio für Texte erzeugen,
  // die noch nicht geprüft sind, verschwendet Geld. Der Live-Bericht (Schritt
  // 1) zählt die ungeprüften Einträge; die Zahl steht oben im Audio-Reiter.
  useEffect(() => {
    if (section !== 'audio') return;
    let cancelled = false;
    studioRequest<StudioState>('/state')
      .then((state) => {
        if (cancelled) return;
        const ungeprueft = state.report.entries.filter((entry) => entry.status === 'unchecked');
        const thai = ungeprueft.filter((entry) => entry.language === 'th').length;
        setAudioWarnung(
          ungeprueft.length === 0
            ? ''
            : `⚠ ${ungeprueft.length} Einträge im Prüfbericht sind ungeprüft${thai ? ` (davon ${thai} Thai-Clips)` : ''}. Empfohlene Reihenfolge: Wortschatz → Dialoge → Audio — erst Texte prüfen, dann vertonen.`
        );
      })
      .catch(() => {
        if (!cancelled) setAudioWarnung('');
      });
    return () => {
      cancelled = true;
    };
  }, [section, reportRevision]);

  useEffect(() => {
    let cancelled = false;
    studioRequest('/state').then(() => Promise.all([countSituations(), loadSituations(), countVocabImages(), loadExamModules(),
      countExamModules(), countGeneratedExamModules(), countAudioClips(), sumAudioClipBytes(),
      countAudioClipsByLanguage(), countImagesByLanguage(), countSituationsByDirection(),
      countExamModulesByLevel()]))
      .then(([situationsCount, dialogs, imagesCount, modules, total, generated, count, bytes,
          clipsNachSprache, bilderNachSprache, situationenNachRichtung, pruefungenNachStufe]) => {
        if (cancelled) return;
        setSituations(situationsCount); setStoredSituations(dialogs); setImages(imagesCount);
        setStoredExams(modules); setExams({ total, generated }); setClips({ count, bytes });
        setClipsByLanguage(clipsNachSprache); setImagesByLanguage(bilderNachSprache);
        setSituationsByDirection(situationenNachRichtung); setExamsByLevel(pruefungenNachStufe);
      }).then(async () => {
        if (cancelled) return;
        // Phase 2, Schritt 4: der bekannte Wortschatz-Anteil auch beim
        // ersten Laden — nicht erst nach „Aktualisieren“.
        const [dialoge, vocab] = await Promise.all([loadSituations(), loadVocabulary()]);
        if (!cancelled) {
          setWortschatzAnteil(durchschnittsAnteil(dialoge, vocab));
          setWordsByLanguage(Object.fromEntries(GENERIER_SPRACHEN.map(code => [code, vocab.filter(word => String(word.language) === code).length])) as ClipLanguageCounts);
        }
      }).catch(() => { if (!cancelled) setExportMessage('Der gespeicherte Bestand konnte nicht geladen werden. Bitte Studio erneut öffnen.'); });
    getAudioBlobStore().then(() => setClipBackend(getActiveAudioBlobBackend()));
    // Erst der Zugriff laedt das Plattform-Backend; danach steht fest, was
    // tatsaechlich laeuft (Datei, IndexedDB oder Arbeitsspeicher).
    getImageBlobStore().then(() => setBlobBackend(getActiveBlobBackend()));
    loadProfile().then((profile) => setMediaLanguage(profile.language));
    // Studio-Vorgabe (Roadmap v2, Phase 2): Hörclips laufen über den lokalen
    // Helper, wenn er erreichbar ist — sein Schlüssel bleibt serverseitig.
    // Aber nur solange die Gruppe noch ihre Werksvorgabe trägt: Eine bewusst
    // gespeicherte Wahl (etwa Gemini direkt) wird nicht still umgebogen, und
    // ohne Helper gilt der Direktpfad wie bisher.
    (async () => {
      const stored = await loadGeneratorSettings();
      if (
        stored.audio.provider === GENERATOR_GROUP_INFO.audio.defaultProvider &&
        (await helperAudioAvailable())
      ) {
        const next = await setGeneratorProvider('audio', HELPER_AUDIO_PROVIDER);
        if (!cancelled) setGenerators(next);
        return;
      }
      if (!cancelled) setGenerators(stored);
    })().catch(() => {
      // Ohne Speicherstand bleibt die Werksvorgabe der Gruppe stehen.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Ein Anbieterwechsel zieht den Modellnamen mit (siehe `setGeneratorProvider`),
   * eine Modelleingabe nicht — sonst würde jeder Tastendruck den Anbieter
   * zurücksetzen.
   */
  const changeGenerator = useCallback(
    async (group: GeneratorGroupId, change: Partial<GeneratorChoice>) => {
      setGenerators(
        change.provider !== undefined
          ? await setGeneratorProvider(group, change.provider)
          : await setGeneratorChoice(group, change)
      );
    },
    []
  );

  const startSituations = useCallback(
    async ({ optionId, language, maxNew, chain, onChainStep, apiKey, provider, model, onProgress, shouldCancel, confirmRun }: StartArgs) => {
    await studioRequest('/state');
    const { steps, all } = await planChain(
      chain ?? [{ key: language, label: LANGUAGE_LABELS[language] }],
      (key) => planSituations({
        ...(optionId === 'full' ? FULL_RUN : { variantsPerCombo: 1 }),
        targetLanguage: key as LanguageCode,
        levels: STAGE_LEVELS[situationStage],
      }),
      (specs) => missingSpecs(specs),
      maxNew
    );
    if (!await confirmRun(estimateRunCost('situations', provider, model, all.map(() => ({}))))) return;
    // Phase 2, Schritt 6: Bestands-Snapshot vor dem Lauf — danach lassen sich
    // die NEUEN Situationen identifizieren und gegen (fast) Duplikate prüfen.
    const bestandVorher: Situation[] = await loadSituations();
    const vorIds = new Set(bestandVorher.map((situation) => situation.id));
    await fahreKette(steps, all.length, { onChainStep, onProgress, shouldCancel },
      (missing, onStepProgress) => runGenerationBatch({
        specs: missing,
        client: createGenerationClient(provider, apiKey, model),
        onProgress: onStepProgress,
        shouldCancel,
        // Kleine Pause zwischen den Aufrufen, damit ein langer Lauf nicht
        // unnötig ins Rate-Limit rennt.
        delayMs: 400,
      }));
    // Duplikate: fast gleiche Situationen (normalisierter Text, Jaccard ab
    // 0,85) werden aus dem Store verworfen und gezählt, BEVOR der Export sie
    // in Stage und Katalog bringen würde.
    const nachher = await loadSituations();
    const neueSituationen = nachher.filter((situation) => !vorIds.has(situation.id));
    const referenz: Situation[] = [...bestandVorher];
    const verworfen: Situation[] = [];
    for (const kandidat of neueSituationen) {
      const doppelt = findeDuplikat(kandidat, referenz);
      if (doppelt) {
        verworfen.push(kandidat);
      } else {
        referenz.push(kandidat);
      }
    }
    if (verworfen.length > 0) {
      const db = await getStore();
      for (const situation of verworfen) await db.remove('situations', situation.id);
      setExportMessage(`Duplikate verworfen: ${verworfen.length} (fast gleiche Situationen schon im Bestand).`);
    }
    await exportDrafts(setExportMessage);
    setReportRevision(value => value + 1);
  },
    [situationStage]
  );

  const startImages = useCallback(
    async ({ optionId, language, maxNew, chain, onChainStep, apiKey, provider, model, onProgress, shouldCancel, confirmRun }: StartArgs) => {
    await studioRequest('/state');
    // Ohne Kette ein Schritt (die gewählte Sprache), mit „Alle Sprachen“
    // einer je Pool — derselbe Bauplan, eine kombinierte Bestätigung.
    const { steps, all } = await planChain(
      chain ?? [{ key: language, label: LANGUAGE_LABELS[language] }],
      (key) => planImages({
        entries: poolFuer(key as Lang),
        ...(optionId === 'full' ? {} : { limit: IMAGE_TEST_RUN }),
      }),
      (specs) => missingImageSpecs(specs),
      maxNew
    );
    if (!await confirmRun(estimateRunCost('images', provider, model, all.map(() => ({}))))) return;
    await fahreKette(steps, all.length, { onChainStep, onProgress, shouldCancel },
      (missing, onStepProgress) => runImageBatch({
        specs: missing,
        client: createImageGenerationClient(provider, apiKey, model),
        onProgress: onStepProgress,
        shouldCancel,
        // Local jobs are already sequential; only cloud providers need a rate-limit pause.
        delayMs: provider === 'comfyui' ? 0 : 800,
      }));
    await exportDrafts(setExportMessage, provider === 'comfyui' ? { kinds: ['images'], publish: false } : undefined);
    setReportRevision(value => value + 1);
  },
    []
  );

  const startClips = useCallback(
    async ({ optionId, language, maxNew, chain, onChainStep, apiKey, provider, model, voice, onProgress, shouldCancel, confirmRun }: StartArgs) => {
      await studioRequest('/state');
      // Die Umfänge hängen an Bestand (Situationen, Prüfungen) und je Schritt
      // an der Sprache — einmal laden, dann je Schritt bauen.
      const dialogs = await loadSituations();
      const pruefungen = await loadExamModules();
      const { steps, all } = await planChain(
        chain ?? [{ key: language, label: LANGUAGE_LABELS[language] }],
        (key) => clipRunOptions(dialogs, provider, key as Lang, pruefungen).specsFor(optionId),
        (specs) => missingClipSpecs(specs),
        maxNew
      );
      if (!await confirmRun({ ...estimateRunCost('audio', provider, model, all),
        delivery: previewAudioDelivery(all, poolFuer('th')) })) return;
      // Phase 2, Schritt 7: mehrere Stimmen pro Sprache ABWECHSELND — die
      // Clips werden rundum auf die Stimmen des Anbieters verteilt (die
      // gewählte Stimme startet die Rotation). Fällt eine Stimme aus, hören
      // Lernende nicht denselben Klang für den ganzen Bestand.
      // 18.09. Abend, Thai-Ton-Diagnose: Eine EXPLIZIT eingetragene Stimme
      // rotiert nicht mehr — die Rotation verteilte bei Thai nach der ersten
      // Stimme weiter zu Stimmen, die die Töne nachweislich verfehlen
      // (coral/alloy/nova scheiterten an ลูกสาว, onyx bestand). Wer eine
      // Stimme einträgt, will genau diese; ohne Eintrag gilt weiter die
      // volle Rotation.
      const stimmen = voicesFor(provider).map((stimme) => stimme.name);
      const reihenfolge = (voice?.trim() ? [voice.trim()] : stimmen);
      await fahreKette(steps, all.length, { onChainStep, onProgress, shouldCancel },
        async (missing, onStepProgress) => {
          let voiceIndex = 0;
          await runClipBatch({
            specs: missing,
            client: { generate: (spec) => createClipGenerationClient(provider, apiKey, model, reihenfolge[voiceIndex++ % reihenfolge.length] ?? voice ?? '').generate(spec) },
            // 18.09.: Das Tontor liest die Solltöne je Silbe aus dem AKTIVEN
            // Thai-Bestand (Wörter über syllables, Sätze über die Roman-Umschrift)
            // — derselbe Stand, aus dem auch der Plan gebaut wurde. Andere
            // Sprachen berührt das nicht (das Tor meldet dort not-applicable).
            toneWortschatz: poolFuer('th'),
            onProgress: onStepProgress,
            shouldCancel,
            // 17.09. Nacht FINAL (1400 → 500 ms): OpenAI-TTS ist auf 30 Aufrufe/
            // Minute gedeckelt — der Helper WARTET bei vollem Fenster jetzt die
            // genannte Sekundenzahl und stellt dann selbst durch (statt mit 429
            // abzulehnen; siehe studio.cjs). Der Client darf deshalb flott
            // fragen: das Fenster glättet den Lauf automatisch auf das Limit,
            // der Durchsatz liegt damit AM Limit statt darunter.
            delayMs: provider === 'gemini' ? 6500 : provider === 'chatgpt-helper' ? 500 : 600,
          });
        });
      await exportDrafts(setExportMessage);
      setReportRevision(value => value + 1);
    },
    []
  );

  return (
    <View style={{ gap: Spacing.three }}>
      {section !== 'home' ? <ThemedButton label="Studio-Übersicht" disabled={running} onPress={() => setSection('home')} /> : null}
      {section === 'home' ? <>
        {/* Grundstock („Ich möchte einen Grundstock haben von allen“): oben,
            weil die Frage „was ist da und was fehlt“ vor jeder Erzeugung
            steht. Zwei Blöcke: statisch (liegt in der App, generiert nichts)
            und generiert (liegt im Speicher, je Zielsprache). */}
        <ThemedView type="backgroundElement" style={styles.panel}>
          <View style={styles.panelHeader}>
            <ThemedText type="smallBold">Grundstock</ThemedText>
            <ThemedButton label="Aktualisieren" onPress={refreshStock} disabled={running} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">Wortschatz (Vokabeln): {jeSprache(wordsByLanguage)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Hörclips: {jeSprache(clipsByLanguage)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Bilder: {jeSprache(imagesByLanguage)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Dialog-Situationen: {RICHTUNGEN.map((richtung) =>
              `${GESPROCHENE_SEITE[richtung]} ${situationsByDirection ? situationsByDirection[richtung] : '…'}`
            ).join(' · ')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {/* Stufen-Totals statt „davon erzeugt": Seit dem Generator- und
                Manuell-Aus gibt es keine andere Herkunft mehr — alle Module
                sind mitgeliefert, und die alte Zählung zeigte überall 0. */}
            Prüfungsaufgaben: {exams === null ? '…' : `${exams.total} gesamt`}
            {examsByLevel ? ` · ${EXAM_LEVELS.map((stufe) =>
              `${stufe} ${examsByLevel[stufe].total}`
            ).join(' · ')}` : ''}
          </ThemedText>
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">Was möchtest du verwalten?</ThemedText>
        <ThemedText type="smallBold">Inhalte erzeugen</ThemedText>
        {/* Phase 2, Schritt 2: der Reihenfolge-Hinweis gehört ÜBER die
            Erzeugung — Wortschatz zuerst, Bilder zuletzt. */}
        <ThemedText type="small" themeColor="textSecondary">
          Empfohlene Reihenfolge: Wortschatz → Dialoge → Audio → Bilder. Audio
          und Bilder setzen voraus, dass ihre Texte schon stehen und geprüft
          sind — der Audio-Reiter warnt, wenn der Prüfbericht noch Ungeprüftes
          zählt.
        </ThemedText>
        <View style={{ borderRadius: 16, overflow: 'hidden', gap: 1 }}>
          <SettingsRow title="Text, Wörter & Inhalte" detail="Wortschatz und Dialoge erzeugen" icon="document-text-outline" onPress={() => setSection('text')} />
          <SettingsRow title="Audio" detail="Wörter, Sätze und Dialoge vertonen" icon="volume-medium-outline" onPress={() => setSection('audio')} />
          <SettingsRow title="Bilder" detail="Vokabelbilder erstellen" icon="image-outline" onPress={() => setSection('bilder')} />
        </View>
        <ThemedText type="smallBold">Verwaltung</ThemedText>
        <View style={{ borderRadius: 16, overflow: 'hidden', gap: 1 }}>
          <SettingsRow title="Anbieter & Schlüssel" detail="Zugänge zentral verwalten" icon="key-outline" onPress={() => setSection('keys')} />
          <SettingsRow title="Prüfberichte & Diagnose" detail="Qualität und gespeicherte Inhalte" icon="pulse-outline" onPress={() => setSection('reports')} />
        </View>
      </> : null}
      {section === 'keys' ? <ApiKeysCard /> : null}
      {section === 'reports' ? <><ContentReport revision={reportRevision} /><DiagnosticsCard /></> : null}
      {exportMessage ? <ThemedText accessibilityLiveRegion="polite" type="small">{exportMessage}</ThemedText> : null}
      {/* Phase 2, Schritt 2: Unterreiter „Text, Wörter & Inhalte“ — die
          Wortschatz-Karte zeigt den Bestand und den Weg zur Zielgrößen-
          Erzeugung (Schritt 4 baut sie aus); Dialoge laufen wie bisher. */}
      {section === 'text' ? (
      <>
        <VocabZieleCard blocked={running} onRunningChange={setRunning} onFinished={() => { setReportRevision((v) => v + 1); void refreshStock(); }} />
      <LearningStagePicker value={situationStage} onChange={setSituationStage} disabled={running} />
      <GeneratorCard
        blocked={running} managedKeys onRunningChange={setRunning}
        language={situationLanguage} onLanguageChange={setSituationLanguage}
        heading="Generator: Gesprächssituationen"
        description="Dialoge einmalig erstellen und lokal zum Üben speichern."
        group="situations"
        choice={generators.situations}
        onChoiceChange={(change) => changeGenerator('situations', change)}
        statusLine={`Im Speicher: ${situations === null ? '…' : `${situations} Situationen`}${wortschatzAnteil !== null ? ` · bekannter Wortschatz-Anteil (deutsch): ${(wortschatzAnteil * 100).toFixed(0)} %` : ''}`}
        counts={richtungsZaehler(situationsByDirection)}
        runOptions={SITUATION_RUNS}
        onStart={startSituations}
        // Nach dem Löschen sofort nachzählen — ein stehengebliebener Zähler
        // sieht aus, als hätte das Löschen nicht geklappt (Nutzerwunsch 12.09.).
        onDelete={async (languages) => { await clearContentSelection('situations', languages); await refreshSituations(); }}
        deleteLabel="Erzeugte Situationen löschen"
        canDelete={Boolean(situations && situations > 0)}
        onFinished={refreshStock}
        allRun={{ label: 'Alle Sprachen', steps: ALLE_SPRACHEN }}
      />
      </>
      ) : null}

      {section === 'bilder' ? (
      <GeneratorCard
        blocked={running} managedKeys onManageKeys={() => setSection('keys')} onRunningChange={setRunning}
        heading="Generator: Bilder"
        description="Ein Bild je konkreter Vokabel — vorhandene werden übersprungen. Prüfung: dekodierbar und prompt-konform (ohne Text im Bild gebaut); ob das Bild zum Wort passt, prüfst du in der Vorschau."
        group="images"
        choice={generators.images}
        onChoiceChange={(change) => changeGenerator('images', change)}
        language={mediaLanguage}
        onLanguageChange={setMediaLanguage}
        statusLine={`Im Speicher: ${images === null ? '…' : `${images} Bilder insgesamt`} · Ablage ${blobBackend ?? '…'}`}
        counts={sprachZaehler(imagesByLanguage, mediaLanguage)}
        runOptions={imageRunOptions(mediaLanguage)}
        onStart={startImages}
        onDelete={async (languages) => { await clearContentSelection('images', languages); await refreshImages(); }}
        deleteLabel="Alle Bilder löschen"
        canDelete={Boolean(images && images > 0)}
        onFinished={refreshStock}
        allRun={{ label: 'Alle Sprachen', steps: ALLE_SPRACHEN }}
      />
      ) : null}

      {section === 'audio' ? (
      <>
        {audioWarnung ? (
          <ThemedView type="backgroundSelected" style={styles.panel}>
            <ThemedText type="small">{audioWarnung}</ThemedText>
          </ThemedView>
        ) : null}
      <GeneratorCard
        blocked={running} managedKeys onManageKeys={() => setSection('keys')} onRunningChange={setRunning}
        heading="Generator: Hörclips"
        description="Erst Wörter und Kernsätze vertonen — Dialog-Turns laufen standardmäßig über die Laufzeit-Stimme. Stimmen wechseln im Lauf abwechselnd durch; Thai-Töne werden automatisch geprüft (ungeprüft/aussortiert sieht du im Prüfbericht)."
        language={mediaLanguage}
        onLanguageChange={setMediaLanguage}
        group="audio"
        choice={generators.audio}
        onChoiceChange={(change) => changeGenerator('audio', change)}
        statusLine={`Im Speicher: ${clips === null ? '…' : `${clips.count} Clips, ${formatBytes(clips.bytes)}`} · Ablage ${clipBackend ?? '…'}${generators.audio.provider === 'gemini' ? ' · Pause je Aufruf: 6,5 Sekunden (Gemini-Ratenlimit)' : ''}${generators.audio.provider === 'chatgpt-helper' ? ' · Pause je Aufruf: 2,2 Sekunden (Helper-Ratenlimit, 30/min) · Schlüssel serverseitig' : ''}`}
        counts={sprachZaehler(clipsByLanguage, mediaLanguage)}
        runOptions={clipRunOptions(storedSituations, generators.audio.provider, mediaLanguage, storedExams).options}
        onStart={startClips}
        onDelete={async (languages) => { await clearContentSelection('audio', languages); await refreshClips(); }}
        deleteLabel="Alle Clips löschen"
        canDelete={Boolean(clips && clips.count > 0)}
        onFinished={refreshStock}
        allRun={{ label: 'Alle Sprachen', steps: ALLE_SPRACHEN }}
      />
      </>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
