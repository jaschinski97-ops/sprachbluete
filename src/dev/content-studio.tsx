import { stageForLevel } from '@/lib/learning-stages';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiKeysCard } from '@/components/api-keys-card';
import { SettingsRow } from '@/components/settings-row';
import { ThemedButton } from '@/components/themed-button';
import { ContentReport } from './content-report';
import { VocabZieleCard } from './vocab-ziele-card';
import { durchschnittsAnteil } from '@/lib/content/wortschatz-anteil';
import { findeDuplikat } from '@/lib/content/aehnlichkeit';
import { useLocale } from '@/lib/i18n';
import type { ConversationSituation as Situation } from '@/lib/conversation/types';
import { estimateRunCost } from './run-cost';
import { Drossel, gedrosselt } from '@/lib/generation/drossel';
import { clearContentSelection, startAutomaticDelivery, studioRequest, type StudioState } from './content-client';
import { fahreKette, planChain, type ChainStep } from './chain-run';
import { limitPlan } from '@/lib/generation/plan';
import { planDeliveryAudio } from '@/lib/content/audio-plan';
import { previewAudioDelivery } from '@/lib/content/delivery-preview';


import { DiagnosticsCard } from '@/components/diagnostics-card';
import { CountItem, GeneratorCard, RunOption, StartArgs } from '@/components/generator-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { runClipBatch, missingClipSpecs } from '@/lib/clips/batch';
import { getActiveAudioBlobBackend, getAudioBlobStore } from '@/lib/clips/blob-store';
import { createClipGenerationClient } from '@/lib/clips/generator';
import { estimateClipBytes, formatBytes, planClips, planClipTestRun } from '@/lib/clips/plan';
import { AudioClipSpec } from '@/lib/clips/types';
import { runGenerationBatch, missingSpecs } from '@/lib/conversation/batch';
import { ConversationSituation } from '@/lib/conversation/types';
import { createGenerationClient } from '@/lib/conversation/generator';
import { FULL_RUN, planSituations, TEST_RUN } from '@/lib/conversation/plan';
import { getActiveBlobBackend, getImageBlobStore } from '@/lib/images/blob-store';
import { runImageBatch, missingImageSpecs } from '@/lib/images/batch';
import { createImageGenerationClient } from '@/lib/images/generator';
import { IMAGE_TEST_RUN, planImages, summarizeImagePlan, type ImagePlanSummary } from '@/lib/images/plan';
import { loadOwnImageConcepts, saveOwnImageConcepts, type OwnImageConcepts } from '@/lib/images/own-concepts';
import { isRejectedImageAsset } from '@/lib/images/reviewed-assets';
import { bundledDocuments, bundledEntry } from '@/lib/content/bundled';
import { ImageOwnConceptsCard } from './image-own-concepts-card';
import { activeVocabularyFor } from '@/data/active-vocabulary';
import { VocabEntry } from '@/data/vocab-types';
import { LANGUAGE_ORDER, LANGUAGE_LABELS } from '@/lib/languages/registry';
import { Lang, type LanguageCode } from '@/lib/languages/types';
import { loadProfile } from '@/lib/profile';
import { ProviderId } from '@/lib/providers/types';
import {
  defaultSettings,
  GeneratorChoice,
  GeneratorGroupId,
  GeneratorSettings,
  loadGeneratorSettings,
  setGeneratorChoice,
  setGeneratorProvider,
} from '@/lib/providers/settings';
import {
  loadVocabulary,
  countAudioClips,
  countAudioClipsByLanguage,
  countImagesByLanguage,
  countSituations,
  countSituationsByDirection,
  countVocabImages,
  loadSituations,
  sumAudioClipBytes,
  ClipLanguageCounts,
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

// Die Zahlen kommen aus dem Plan selbst: Themen gelten nur auf ihren Stufen,
// eine feste Zahl wäre nach der nächsten Themenänderung wieder falsch.
const testRunSpecs = planSituations(TEST_RUN);
const stageCount = (stage: ReturnType<typeof stageForLevel>) =>
  testRunSpecs.filter((spec) => stageForLevel(spec.level) === stage).length;

const SITUATION_RUNS: RunOption[] = [
  {
    id: 'test',
    label: 'Probelauf',
    hint: `${testRunSpecs.length} Situationen je Sprache — jedes passende Thema einmal für Einstieg und Aufbau jeder Stufe (Anfänger ${stageCount('beginner')}, Fortgeschritten ${stageCount('experienced')}, Profi ${stageCount('pro')})`,
  },
  {
    id: 'full',
    label: 'Vollständiger Lauf',
    hint: `${planSituations(FULL_RUN).length} Situationen je Sprache (${FULL_RUN.variantsPerCombo} Varianten je Thema, Stufe und Teil), alle drei Stufen — vorhandene werden übersprungen`,
  },
];

// SEIT PHASE 16 AUSDRUECKLICH THAI. Die Planer sind sprachparametrisiert
// (Pflicht 4), aber diese Seite bietet die Wahl noch nicht an - und eine Zahl
// ohne Sprache waere hier eine stille Falschaussage. Was fehlt, steht in
// PROGRESS.md unter Phase 16.

/** Audio und Bilder greifen auf denselben veröffentlichten Wortschatz zu. */
function poolFuer(code: Lang): VocabEntry[] { return activeVocabularyFor(code); }

/**
 * Der Bilderlauf haengt seit Phase 18 an der gewaehlten Sprache. Seit dem
 * 24.10.2026 plant er je Begriff ein Bild: Begriffe, die schon ein Bild haben
 * (gleich aus welcher Sprache), laufen nicht mit, und die Zahl am Knopf ist
 * die der neuen Bilder.
 */
function imageRunOptions(language: Lang, summary: ImagePlanSummary | null): RunOption[] {
  const neu = summary ? String(summary.toGenerate) : '…';
  const gespart = summary ? ` (${summary.saved} gespart, ein Bild je Begriff)` : '';
  return [
    { id: 'test', label: 'Probelauf', hint: `${IMAGE_TEST_RUN} Bilder — kleiner Testlauf` },
    {
      id: 'full',
      label: 'Alle konkreten Begriffe',
      hint: `${neu} neue Bilder (${LANGUAGE_LABELS[language]})${gespart} — kostet echtes Geld und dauert`,
      localHint: `${neu} neue Bilder (${LANGUAGE_LABELS[language]})${gespart} — läuft lokal; benötigt Zeit und Strom`,
    },
  ];
}

/** Bild-IDs mit verwendbarem Bild im Live-Katalog — abgelehnte Motive zählen nicht. */
function vorhandeneBildIds(): Set<string> {
  return new Set(bundledDocuments('images')
    .filter((image) => !isRejectedImageAsset(bundledEntry('images', image.id)?.asset))
    .map((image) => image.id));
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
  language: Lang
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
    delivery: [...new Map([...planDeliveryAudio(storedSituations), ...planClips({ vocabulary: poolFuer(language) })].filter(spec => spec.language === language).map(spec => [spec.id, spec])).values()],
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
    { id: 'delivery', label: 'Auslieferung: gewählte Sprache', hint: `${plans.delivery.length} Clips — Wörter, Beispiele und Dialoge${size(plans.delivery)}` },
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
  const { t } = useLocale();
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
  // Bilder je Begriff: Sprach-Ausnahmen (Studio-Option) und die Einsparung.
  const [ownImageConcepts, setOwnImageConcepts] = useState<OwnImageConcepts>({});

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

  useEffect(() => {
    void loadOwnImageConcepts().then(setOwnImageConcepts).catch(() => {});
  }, []);

  // Die Einsparung neu rechnen, sobald Bestand, Sprache oder Ausnahmen wechseln.
  const imageSummary = useMemo<ImagePlanSummary | null>(() => (images === null ? null : summarizeImagePlan({
    entries: poolFuer(mediaLanguage),
    ownImageConcepts: ownImageConcepts[mediaLanguage],
    existingIds: vorhandeneBildIds(),
  })), [mediaLanguage, ownImageConcepts, images]);

  /** Der ganze Bestand auf einmal — der „Aktualisieren“-Knopf und onFinished. */
  const refreshStock = useCallback(async () => {
    await studioRequest('/state');
    const words = await loadVocabulary();
    setWordsByLanguage(Object.fromEntries(GENERIER_SPRACHEN.map(code => [code, words.filter(word => String(word.language) === code).length])) as ClipLanguageCounts);
    await Promise.all([refreshSituations(), refreshClips(), refreshImages()]);
  }, [refreshSituations, refreshClips, refreshImages]);

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
    studioRequest('/state').then(() => Promise.all([countSituations(), loadSituations(), countVocabImages(),
      countAudioClips(), sumAudioClipBytes(),
      countAudioClipsByLanguage(), countImagesByLanguage(), countSituationsByDirection()]))
      .then(([situationsCount, dialogs, imagesCount, count, bytes,
          clipsNachSprache, bilderNachSprache, situationenNachRichtung]) => {
        if (cancelled) return;
        setSituations(situationsCount); setStoredSituations(dialogs); setImages(imagesCount);
        setClips({ count, bytes });
        setClipsByLanguage(clipsNachSprache); setImagesByLanguage(bilderNachSprache);
        setSituationsByDirection(situationenNachRichtung);
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
    // Die Anbieterwahl gilt so, wie sie gespeichert ist. Bis 23.10.2026
    // stellte das Studio Hörclips beim Öffnen still auf den ChatGPT-Helper
    // um, sobald der Helper antwortete und Audio auf der Werksvorgabe Gemini
    // stand — eine bewusst gewählte Gemini-Stimme sah genauso aus und wurde
    // überschrieben. Unbemerkt blieb das nur, weil `/state` beim großen
    // Katalog länger als das 1,5-s-Zeitlimit brauchte.
    loadGeneratorSettings()
      .then((stored) => {
        if (!cancelled) setGenerators(stored);
      })
      .catch(() => {
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
    async ({ optionId, language, maxNew, chain, onChainStep, apiKey, provider, model, parallel, onProgress, shouldCancel, confirmRun }: StartArgs) => {
    await studioRequest('/state');
    const { steps, all } = await planChain(
      chain ?? [{ key: language, label: LANGUAGE_LABELS[language] }],
      (key) => planSituations({
        // Ein Textlauf bedient alle drei Stufen (Nutzerwunsch 04.10.2026);
        // jedes Thema nur auf seinen Stufen, der volle Lauf mit 4 Varianten.
        ...(optionId === 'full' ? FULL_RUN : TEST_RUN),
        targetLanguage: key as LanguageCode,
      }),
      (specs) => missingSpecs(specs),
      maxNew
    );
    if (!await confirmRun(estimateRunCost('situations', provider, model, all.map(() => ({}))))) return;
    // Phase 2, Schritt 6: Bestands-Snapshot vor dem Lauf — danach lassen sich
    // die NEUEN Situationen identifizieren und gegen (fast) Duplikate prüfen.
    const bestandVorher: Situation[] = await loadSituations();
    const referenz: Situation[] = [...bestandVorher];
    const drossel = new Drossel({ max: parallel });
    const delivery = await startAutomaticDelivery(count => setExportMessage(t('studio.autoDelivered', { count })));
    try {
        await fahreKette(steps, all.length, { onChainStep, onProgress, shouldCancel: () => shouldCancel?.() || delivery.failed },
          (missing, onStepProgress) => runGenerationBatch({
            specs: missing,
            // Turbo (23.10.2026): mehrere Situationen gleichzeitig; die Drossel
            // bremst bei 429 selbst, statt fest 400 ms zu warten.
            client: gedrosselt(createGenerationClient(provider, apiKey, model), drossel),
            concurrency: parallel,
            onProgress: onStepProgress, shouldCancel: () => shouldCancel?.() || delivery.failed,
            onProduced: async situation => {
              if (findeDuplikat(situation, referenz)) throw Error(t('studio.duplicateSituation'));
              await delivery.deliver('situations', situation);
              referenz.push(situation);
            },
          }));
    } finally {
      const count = await delivery.finish();
      setExportMessage(t('studio.autoDelivered', { count }));
      await studioRequest('/state');
    }
    setReportRevision(value => value + 1);
  },
    [t]
  );

  const startImages = useCallback(
    async ({ optionId, language, maxNew, chain, onChainStep, apiKey, provider, model, parallel, onProgress, shouldCancel, confirmRun }: StartArgs) => {
    await studioRequest('/state');
    // Ohne Kette ein Schritt (die gewählte Sprache), mit „Alle Sprachen“
    // einer je Pool — derselbe Bauplan, eine kombinierte Bestätigung.
    const { steps, all } = await planChain(
      chain ?? [{ key: language, label: LANGUAGE_LABELS[language] }],
      (key) => planImages({
        entries: poolFuer(key as Lang),
        // Je Begriff ein Bild; eingetragene Ausnahmen bekommen ein eigenes.
        ownImageConcepts: ownImageConcepts[key],
      }),
      // Erst die fehlenden, dann der Probelauf-Deckel: sonst träfe ein
      // Probelauf nur Begriffe, die eine andere Sprache längst bebildert hat.
      async (specs) => limitPlan(await missingImageSpecs(specs), optionId === 'full' ? undefined : IMAGE_TEST_RUN),
      maxNew
    );
    if (!await confirmRun(estimateRunCost('images', provider, model, all.map(() => ({}))))) return;
    // ComfyUI bleibt bei einem Bild zugleich (eine Grafikkarte); Cloud-Anbieter
    // laufen parallel und bremsen bei 429 selbst.
    const drossel = new Drossel({ max: parallel });
    const delivery = await startAutomaticDelivery(count => setExportMessage(t('studio.autoDelivered', { count })));
    try {
      await fahreKette(steps, all.length, { onChainStep, onProgress, shouldCancel: () => shouldCancel?.() || delivery.failed },
        (missing, onStepProgress) => runImageBatch({
          specs: missing,
          client: gedrosselt(createImageGenerationClient(provider, apiKey, model), drossel),
          concurrency: parallel,
          onProgress: onStepProgress,
          shouldCancel: () => shouldCancel?.() || delivery.failed,
          onProduced: (document, base64) => delivery.deliver('images', document, base64),
        }));
    } finally {
      const count = await delivery.finish();
      setExportMessage(t('studio.autoDelivered', { count }));
      await studioRequest('/state');
    }
    setReportRevision(value => value + 1);
  },
    [t, ownImageConcepts]
  );

  const startClips = useCallback(
    async ({ optionId, language, maxNew, chain, onChainStep, apiKey, provider, model, voice, parallel, onProgress, shouldCancel, confirmRun }: StartArgs) => {
      await studioRequest('/state');
      // Die Umfänge hängen an Bestand (Situationen) und je Schritt an der
      // Sprache — einmal laden, dann je Schritt bauen.
      const dialogs = await loadSituations();
      const { steps, all } = await planChain(
        chain ?? [{ key: language, label: LANGUAGE_LABELS[language] }],
        (key) => clipRunOptions(dialogs, provider, key as Lang).specsFor(optionId),
        (specs) => missingClipSpecs(specs),
        maxNew
      );
      if (!await confirmRun({ ...estimateRunCost('audio', provider, model, all),
        delivery: previewAudioDelivery(all, poolFuer('th')) })) return;
      // EINE Stimme je Lauf: die eingetragene, sonst der Vorschlag des
      // Anbieters (die Karte füllt ein leeres Feld damit auf). Die frühere
      // Rotation über alle Stimmen (Phase 2, Schritt 7) griff deshalb nie,
      // und die Thai-Ton-Diagnose vom 18.09. sprach ohnehin dagegen:
      // coral/alloy/nova verfehlten Töne, an denen onyx bestand.
      // Turbo (23.10.2026): mehrere Clips gleichzeitig. Statt fester Pausen
      // (Gemini 6,5 s, Helper 0,5 s) bremst die Drossel, sobald der Anbieter
      // 429 meldet, und wartet so lange, wie er es verlangt.
      const drossel = new Drossel({ max: parallel });
      const client = gedrosselt(createClipGenerationClient(provider, apiKey, model, voice ?? ''), drossel);
      const delivery = await startAutomaticDelivery(count => setExportMessage(t('studio.autoDelivered', { count })));
      try {
        await fahreKette(steps, all.length, { onChainStep, onProgress, shouldCancel },
          async (missing, onStepProgress) => {
            await runClipBatch({
              specs: missing,
              client,
              // 18.09.: Das Tontor liest die Solltöne je Silbe aus dem AKTIVEN
              // Thai-Bestand (Wörter über syllables, Sätze über die Roman-Umschrift)
              // — derselbe Stand, aus dem auch der Plan gebaut wurde. Andere
              // Sprachen berührt das nicht (das Tor meldet dort not-applicable).
              toneWortschatz: poolFuer('th'),
              onProgress: onStepProgress,
              shouldCancel: () => shouldCancel?.() || delivery.failed,
              onProduced: (document, base64) => delivery.deliver('audio', document, base64),
              concurrency: parallel,
            });
          });
      } finally {
        const count = await delivery.finish();
        setExportMessage(t('studio.autoDelivered', { count }));
        await studioRequest('/state');
      }
      setReportRevision(value => value + 1);
    },
    [t]
  );

  return (
    <View style={{ gap: Spacing.three }}>
      <ThemedText type="small">{t('studio.autoDeliveryHint')}</ThemedText>
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
      <>
      <ImageOwnConceptsCard
        languageLabel={LANGUAGE_LABELS[mediaLanguage]}
        concepts={ownImageConcepts[mediaLanguage] ?? []}
        summary={imageSummary}
        onChange={(concepts) => { void saveOwnImageConcepts(mediaLanguage, concepts).then(setOwnImageConcepts); }}
      />
      <GeneratorCard
        blocked={running} managedKeys onManageKeys={() => setSection('keys')} onRunningChange={setRunning}
        heading="Generator: Bilder"
        description="Ein Bild je Begriff — alle Lernsprachen nutzen es gemeinsam; Begriffe mit Bild (auch aus anderen Sprachen) werden übersprungen. Prüfung: dekodierbar und prompt-konform (ohne Text im Bild gebaut); ob das Bild zum Wort passt, prüfst du in der Vorschau."
        group="images"
        choice={generators.images}
        onChoiceChange={(change) => changeGenerator('images', change)}
        language={mediaLanguage}
        onLanguageChange={setMediaLanguage}
        statusLine={`Im Speicher: ${images === null ? '…' : `${images} Bilder insgesamt`} · Ablage ${blobBackend ?? '…'}`}
        counts={sprachZaehler(imagesByLanguage, mediaLanguage)}
        runOptions={imageRunOptions(mediaLanguage, imageSummary)}
        onStart={startImages}
        onDelete={async (languages) => { await clearContentSelection('images', languages); await refreshImages(); }}
        deleteLabel="Alle Bilder löschen"
        canDelete={Boolean(images && images > 0)}
        onFinished={refreshStock}
        allRun={{ label: 'Alle Sprachen', steps: ALLE_SPRACHEN }}
      />
      </>
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
        description="Erst Wörter und Kernsätze vertonen — Dialog-Turns laufen standardmäßig über die Laufzeit-Stimme. Alle Clips eines Laufs sprechen mit der eingestellten Stimme (leer = Vorschlag des Anbieters); Thai-Töne werden automatisch geprüft (ungeprüft/aussortiert sieht du im Prüfbericht)."
        language={mediaLanguage}
        onLanguageChange={setMediaLanguage}
        group="audio"
        choice={generators.audio}
        onChoiceChange={(change) => changeGenerator('audio', change)}
        statusLine={`Im Speicher: ${clips === null ? '…' : `${clips.count} Clips, ${formatBytes(clips.bytes)}`} · Ablage ${clipBackend ?? '…'} · mehrere Clips gleichzeitig, bremst bei „zu vielen Anfragen“ selbst${generators.audio.provider === 'chatgpt-helper' ? ' · Helper höchstens 30 Aufrufe pro Minute · Schlüssel serverseitig' : ''}`}
        counts={sprachZaehler(clipsByLanguage, mediaLanguage)}
        runOptions={clipRunOptions(storedSituations, generators.audio.provider, mediaLanguage).options}
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
