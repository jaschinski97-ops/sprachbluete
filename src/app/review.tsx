import { LEARNING_STAGES, levelLabelKey, levelPartKey, STAGE_KEYS, stageForLevel, type LearningStage } from '@/lib/learning-stages';
import { LearningStagePicker } from '@/components/learning-stage-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { VocabEntry } from '@/data/vocab-types';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DrillRunner } from '@/components/drill-runner';
import { DictationRunner } from '@/components/dictation-runner';
import { Flashcard } from '@/components/flashcard';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SpeakingRunner } from '@/components/speaking-runner';
import { SentenceRunner } from '@/components/sentence-runner';
import { ThemedButton } from '@/components/themed-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WritingRunner } from '@/components/writing-runner';
import { Spacing, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DrillId } from '@/lib/drills/types';
import { Rating } from '@/lib/fsrs/types';
import { TranslationKey, useLocale } from '@/lib/i18n';
import {
  directionForBridge,
  goalEndonym,
  goalLanguage,
  zielFuerDirection,
  zieleFuerBruecke,
  type Lernziel,
} from '@/lib/languages/goals';
import { learningLanguage } from '@/lib/languages/definitions';
import {
  anchorOf,
  isDeAnchored,
  isPairDirection,
  targetLanguageOf,
  type PairDirection,
} from '@/lib/languages/types';
import { LearnerProfile, loadProfile, setLanguage, setReviewSpot } from '@/lib/profile';
import { loadSituations, rateCard } from '@/lib/repository';
import { buildReviewQueue, directionLabel, ReviewItem } from '@/lib/review-session';
import {
  groupsForDirection,
  modeKey,
  modeLabel,
  modesForDirection,
  type Mode,
} from '@/lib/exercise-catalog';
import { WordSpeakingRunner } from '@/components/word-speaking-runner';
import { TodayRoundRunner } from '@/components/today-round-runner';
import { ProductionRunner } from '@/components/production-runner';
import { RoleplayRunner } from '@/components/roleplay-runner';
import { ReadingTextsRunner } from '@/components/reading-texts-runner';
import { AdvancedLessonRunner } from '@/components/advanced-lesson-runner';
import { ChapterGrammarRunner } from '@/components/chapter-grammar-runner';
import { FoundationsRunner } from '@/components/foundations-runner';
import { ROUND_MINUTES } from '@/lib/today-round';
import { FOUNDATIONS_ID, foundationModesFor, foundationSteps, isFoundationMode } from '@/lib/foundations';
import { activeVocabularyFor } from '@/data/active-vocabulary';
import {
  chapterGrammarDrill,
  chaptersForDirection,
  finishChapter,
  finishedChapterIds,
  markStepPractised,
  practisedSteps,
  type LearningChapter,
} from '@/lib/learning-path';
import { situationTranslation, spokenText, type ConversationSituation } from '@/lib/conversation/types';

const RATINGS: Rating[] = [1, 2, 3, 4];

/** Bewertungsstufen als Übersetzungsschlüssel statt als deutsche Konstante. */
const RATING_KEYS: Record<Rating, TranslationKey> = {
  1: 'rating.again',
  2: 'rating.hard',
  3: 'rating.good',
  4: 'rating.easy',
};

/**
 * Fläche und Schriftfarbe je Bewertungsstufe als Theme-Token-Paar.
 *
 * WARUML ALS PAAR AUS DEM THEME: Die vier Farben sind als Paar auf AA
 * gerechnet (`rating-colors.test.ts`) — Fläche und Schrift allein eingesetzt
 * gelten die Kontraste nicht. Und WARUM ÜBERHAUPT FARBE: Alle vier Knöpfe in
 * einem Grau machten die häufigste Handlung der App unlesbar langsam zu
 * erfassen (UI-Review 2026-09-07); die Stufenfarbe ist die zweite, neben dem
 * Wort, Lesespur.
 */
const RATING_COLORS: Record<Rating, { bg: ThemeColor; text: ThemeColor }> = {
  1: { bg: 'rateAgainBg', text: 'rateAgainText' },
  2: { bg: 'rateHardBg', text: 'rateHardText' },
  3: { bg: 'rateGoodBg', text: 'rateGoodText' },
  4: { bg: 'rateEasyBg', text: 'rateEasyText' },
};

/**
 * Ist das eine Richtung, die es wirklich gibt?
 *
 * SEIT STUFE 1 ÜBER `isPairDirection`: Der Lern-Reiter validiert alle zwölf
 * Paare — Kreuzziele (etwa „Spanisch“ hinter `en_to_es`) sind über Adressen
 * und gemerkte Wahlen genauso erreichbar wie die de-geankerten Bestands-
 * richtungen. Die Laufzeitprüfung sitzt im Sprachmodell (`lib/languages/
 * types`), damit Profil, Auswahl und Screens dieselbe Schranke lesen.
 */

/** Die Übungen, die ein Kapitel als Schritt 1 (Grammatik) öffnen kann. */
const CHAPTER_GRAMMAR_MODES: readonly Mode[] = ['article', 'irregularPast', 'serEstar', 'polite', 'zaehlerwort', 'konsonantenklasse', 'toneRule'];

type ChapterStep = readonly [Mode, TranslationKey];

/**
 * Die sieben Schritte eines Kapitels. Schrittliste und „Weiter: …“ in der
 * Übung lesen dieselbe Reihenfolge. Die Grammatik übt die Regel, die die
 * Szene erklärt (Nutzertest 17.10.2026).
 *
 * SEIT 18.10.2026 DIALOG ZUERST (Nutzerentscheidung): Vorher war die Regel
 * Schritt 1 — ein Anfänger las „fallender Ton“, bevor er Töne oder den
 * Dialog kannte. Jetzt: Dialog hören, lesen, die Wörter auf Karten, dann die
 * Regel aus dem Dialog, und erst danach selbst schreiben, sprechen, spielen.
 */
function chapterSteps(direction: PairDirection, chapter: LearningChapter): ChapterStep[] {
  const grammar: Mode = chapterGrammarDrill(chapter.situation, modesForDirection(direction))
    ?? (targetLanguageOf(direction) === 'th' ? 'polite' : groupsForDirection(direction)[4].modes[0]);
  return [
    ['sentenceListening', 'mode.sentenceListening'],
    ['lesestoffe', 'mode.lesestoffe'],
    ['cards', 'mode.cards'],
    [grammar, 'skill.grammatik'],
    ['writing', 'mode.writing'],
    ['sentenceRepeat', 'mode.sentenceRepeat'],
    ['rollenspiel', 'mode.rollenspiel'],
  ];
}

/** Fehlertext eines gescheiterten Ladevorgangs — wie im Fortschritts-Reiter. */
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseMode(value: unknown, direction: PairDirection): Mode {
  // SEIT AE-66 ÜBER DIE MODESLISTE STATT EINZELNER LITERALE: `?mode=shadowing`
  // ist für jede Richtung gültig oder fällt auf Karteikarten zurück — auch ein
  // Alte oder ungültige Modus-Adressen landen auf der Lernübersicht. 'heute'
  // ist als Sammelmodus überall gültig.
  const modes: string[] = [...modesForDirection(direction), ...foundationModesFor(direction), 'heute', 'path'];
  return typeof value === 'string' && modes.includes(value) ? (value as Mode) : 'path';
}

function ZurueckZurUebersicht() {
  const { t } = useLocale();
  const theme = useTheme();
  return (
    <Link href="/" asChild>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [styles.backLink, pressed && styles.backPressed]}>
        <Ionicons name="arrow-back" size={15} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {t('review.backToOverview')}
        </ThemedText>
      </Pressable>
    </Link>
  );
}

export default function ReviewScreen() {
  const { t, uiLanguage } = useLocale();
  const params = useLocalSearchParams<{ direction?: string; mode?: string; waehlen?: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch((e) => {
        if (!cancelled) setProfileError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Jede Wahl im Lernen-Reiter wird gemerkt (Phase 18).
   *
   * Nicht als „Standard", den man setzt und wieder aufhebt, sondern als
   * Lesezeichen: Beim nächsten Öffnen steht man wieder dort. Zurückgesetzt
   * wird es nur durch eine Zielwahl — die Geste „von vorn".
   *
   * Seit dem Sprach-Umbau JEDE Richtung — auch auf nicht-deutschen
   * Oberflächen bleibt der Stand über einen Neustart erhalten.
   */
  const remember = useCallback(async (direction: PairDirection | null, mode?: Mode) => {
    setProfile(await setReviewSpot(direction ? { direction, mode: mode ?? 'path' } : null));
  }, []);

  const open = useCallback(
    (direction: PairDirection, mode: Mode) => {
      router.setParams({
        direction,
        mode,
        waehlen: undefined,
      });
    },
    [router]
  );

  if (profileError) {
    return (
      <ScreenScaffold title={t('tabs.learn')} subtitle={t('review.subtitle')} headerAction={<ZurueckZurUebersicht />}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.loadFailed', { message: profileError })}
        </ThemedText>
      </ScreenScaffold>
    );
  }

  if (!profile) {
    return (
      <ScreenScaffold title={t('tabs.learn')} subtitle={t('review.subtitle')} headerAction={<ZurueckZurUebersicht />}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('review.loadingProfile')}
        </ThemedText>
      </ScreenScaffold>
    );
  }

  const explicit = isPairDirection(params.direction) ? params.direction : null;
  // `waehlen=1` setzt der Wechsel-Knopf: die Auswahl muss auch dann erreichbar
  // bleiben, wenn ein Stand gemerkt ist - sonst waere er eine Einbahnstrasse.
  // `profile.review` traegt nur einen Stand der AKTUELLEN Sprache; darum
  // kuemmert sich `loadProfile`.
  const requested = explicit ?? profile.review?.direction ?? null;
  const direction = params.waehlen === '1' || !requested ? null : directionForBridge(uiLanguage, requested);

  if (!direction) {
    return (
      <DirectionPicker
        profile={profile}
        onPick={(picked) => {
          // Lernziel gewählt: Die Paarsprache gehört zum Ziel — `setLanguage`
          // wirft den alten gemerkten Stand weg, und der ReviewBody-Effekt
          // schreibt die neue Richtung sofort als Lesezeichen zurück (bei
          // Kreuzzielen verzichtet `remember` bewusst auf das Schreiben).
          // Ein Speicherfehler ändert nichts an der Adresse, die schon stimmt.
          void setLanguage(targetLanguageOf(picked))
            .then(setProfile)
            .catch(() => {});
          router.setParams({ direction: picked, waehlen: undefined, mode: undefined });
        }}
      />
    );
  }

  // Ohne ausdrücklichen Übungsmodus beginnt Lernen immer auf dem Lernpfad.
  const mode = parseMode(params.mode, direction);

  return (
    <ReviewBody
      direction={direction}
      mode={mode}
      onOpen={open}
      onSwitch={() => {
        remember(null);
        router.setParams({ direction: undefined, mode: undefined, waehlen: '1' });
      }}
      onRemember={remember}
      onExit={() => {
        // Ein expliziter Pfadmodus schließt auch direkte Übungsadressen.
        router.setParams({ direction, mode: 'path' });
      }}
    />
  );
}

/**
 * Der eigentliche Lernbereich — als eigene Komponente, damit der gemerkte
 * Stand in einem Effekt geschrieben werden kann.
 *
 * WARUM EIN EFFEKT UND NICHT DER KNOPFDRUCK: Man kommt auf drei Wegen hierher
 * — über die Übungsleiste, über eine Zielwahl in der Auswahl (auch die
 * Übersicht wählt Sprache und Richtung; der „Lernen"-Knopf ihrer Zeilen
 * navigiert mit der Richtung als Adresse direkt hierher) und über
 * eine Adresse mit `?direction=`. Am Knopf zu merken hätte nur den ersten Weg
 * erwischt; im Web-Build fiel genau das auf. Der Effekt hängt an dem, was
 * wirklich offen ist, und trifft damit alle drei.
 */
function ReviewBody({
  direction,
  mode,
  onOpen,
  onSwitch,
  onRemember,
  onExit,
}: {
  direction: PairDirection;
  mode: Mode;
  onOpen: (direction: PairDirection, mode: Mode) => void;
  onSwitch: () => void;
  onRemember: (direction: PairDirection | null, mode?: Mode) => void;
  onExit: () => void;
}) {
  const { t, languageName, uiLanguage } = useLocale();
  const [lessonOpen, setLessonOpen] = useState(false);
  const [openArea, setOpenArea] = useState<TranslationKey | null>(null);
  const [writingPack, setWritingPack] = useState<VocabEntry[] | null>(null);
  const [chapters, setChapters] = useState<LearningChapter[] | null>(null);
  const [finished, setFinished] = useState<string[]>([]);
  const [practised, setPractised] = useState<Record<string, string[]>>({});
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [practiceChapter, setPracticeChapter] = useState<LearningChapter | null>(null);
  // Kapitel 0 ist kein Dialogkapitel — eigener Merker für „Weiter: …“.
  const [foundationsPractice, setFoundationsPractice] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const chapterWordIds = useMemo(
    () => practiceChapter ? new Set(practiceChapter.vocabulary.map((word) => word.id)) : undefined,
    [practiceChapter]
  );

  useEffect(() => {
    if (mode !== 'path') return;
    let cancelled = false;
    setChapters(null);
    setChapterError(null);
    void (async () => {
      try {
        const situations = await loadSituations();
        const next = chaptersForDirection(direction, situations, activeVocabularyFor(targetLanguageOf(direction)));
        // Kapitel 0 teilt Abschluss und Häkchen mit den Dialogkapiteln.
        const ids = [FOUNDATIONS_ID, ...next.map((item) => item.id)];
        const done = await finishedChapterIds(direction, ids.map((id) => ({ id })));
        const steps = await Promise.all(ids.map((id) => practisedSteps(direction, id)));
        if (!cancelled) {
          setChapters(next);
          setFinished(done);
          setPractised(Object.fromEntries(ids.map((id, index) => [id, steps[index]])));
        }
      } catch (error) {
        if (!cancelled) {
          setChapters([]);
          setChapterError(messageOf(error));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [direction, mode]);
  useEffect(() => {
    // Die Heutige Runde ist ein Sammelmodus ohne gemerkten Stand — als
    // Lesezeichen bleibt die Lernübersicht, statt eine abgebrochene Runde.
    onRemember(direction, mode === 'heute' ? 'path' : mode);
    // `onRemember` ist bewusst nicht in der Liste: Es schreibt das Profil und
    // erzeugt dadurch eine neue Identitaet - mit ihm liefe der Effekt endlos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, mode]);

  // Zielname statt Richtungslabel (Nutzerentscheidung 2026-09-10). Für
  // Richtungen ohne Lernziel — en_to_de/es_to_de aus gemerkten Profilen oder
  // alten Adressen — fällt der ehrliche Richtungstext zurück.
  const ziel = zielFuerDirection(direction);

  // Einen Kapitelschritt öffnen und als geübt merken (Häkchen in der Liste).
  const openChapterStep = (picked: Mode, chapter: LearningChapter) => {
    void markStepPractised(direction, chapter.id, picked)
      .then((steps) => setPractised((current) => ({ ...current, [chapter.id]: steps })))
      .catch(() => {});
    setWritingPack(null);
    setPracticeChapter(chapter);
    setFoundationsPractice(false);
    onOpen(direction, picked);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const openFoundationStep = (picked: Mode) => {
    void markStepPractised(direction, FOUNDATIONS_ID, picked)
      .then((steps) => setPractised((current) => ({ ...current, [FOUNDATIONS_ID]: steps })))
      .catch(() => {});
    setWritingPack(null);
    setPracticeChapter(null);
    setFoundationsPractice(true);
    onOpen(direction, picked);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  // Auch über eine Adresse (`?mode=zahlen`) gehört ein Kapitel-0-Modus zu Kapitel 0.
  const inFoundations = !practiceChapter && (foundationsPractice || isFoundationMode(mode));
  const steps = practiceChapter
    ? chapterSteps(direction, practiceChapter)
    : inFoundations ? foundationSteps(direction) : [];
  const stepIndex = steps.findIndex(([candidate]) => candidate === mode);
  const nextStep = stepIndex >= 0 ? steps[stepIndex + 1] : undefined;
  const chapterGrammar = Boolean(practiceChapter && CHAPTER_GRAMMAR_MODES.includes(mode));

  return (
    <ScreenScaffold
      title={t('tabs.learn')}
      scrollRef={scrollRef}
      headerAction={<ZurueckZurUebersicht />}
      subtitle={
        ziel
          ? languageName(goalLanguage(ziel))
          : isDeAnchored(direction)
            ? directionLabel(direction, uiLanguage)
            : direction
      }>
      {mode === 'heute' ? (
        <TodayRoundRunner key={direction} direction={direction} onExit={onExit} />
      ) : mode === 'path' ? (
        <>
          <LearnPath
            openArea={openArea}
            setOpenArea={setOpenArea}
            direction={direction}
            chapters={chapters}
            finished={finished}
            selectedChapterId={selectedChapterId}
            chapterError={chapterError}
            finishing={finishing}
            lessonOpen={lessonOpen}
            setLessonOpen={setLessonOpen}
            onSelect={(id) => {
              setSelectedChapterId(id);
              setLessonOpen(false);
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            onFinish={(chapterId) => {
              setFinishing(true);
              void finishChapter(direction, chapterId)
                .then(() => {
                  const done = [...new Set([...finished, chapterId])];
                  setFinished(done);
                  setSelectedChapterId(chapters?.find((item) => !done.includes(item.id))?.id ?? chapterId);
                  setLessonOpen(false);
                })
                .catch((error) => setChapterError(messageOf(error)))
                .finally(() => setFinishing(false));
            }}
            practised={practised}
            onOpenFoundation={openFoundationStep}
            onOpen={(picked, chapter) => {
              if (chapter) {
                openChapterStep(picked, chapter);
                return;
              }
              setWritingPack(null);
              setPracticeChapter(null);
              setFoundationsPractice(false);
              onOpen(direction, picked);
            }}
          />
          <DirectionBar onSwitch={onSwitch} />
        </>
      ) : (
        <>
          {/* Ein Block statt drei Zeilen mit je eigenem Abstand: Auf 375 px lagen
              die Bewertungsknöpfe der Karteikarten sonst unter dem Rand
              (Nutzertest 17.10.2026). */}
          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseActions}>
              <ThemedButton label={t('common.back')} onPress={onExit} />
              {nextStep && (practiceChapter || inFoundations) ? (
                <ThemedButton
                  label={t('path.nextStep', { step: `${stepIndex + 2}. ${t(nextStep[1])}` })}
                  onPress={() => practiceChapter ? openChapterStep(nextStep[0], practiceChapter) : openFoundationStep(nextStep[0])}
                />
              ) : null}
            </View>
            <ThemedText type="smallBold">
              {t(chapterGrammar ? 'skill.grammatik' : modeKey(mode))}
              {practiceChapter ? ` · ${situationTranslation(practiceChapter.situation, uiLanguage).title}` : ''}
              {inFoundations ? ` · ${t('foundations.title')}` : ''}
            </ThemedText>
          </View>

          {isFoundationMode(mode) ? (
        <FoundationsRunner key={`${direction}:${mode}`} mode={mode} direction={direction} onExit={onExit} />
      ) : practiceChapter && chapterGrammar ? (
        <ChapterGrammarRunner
          key={`${practiceChapter.id}:${mode}`}
          situation={practiceChapter.situation}
          direction={direction}
          // CHAPTER_GRAMMAR_MODES sind ausnahmslos Drill-Kennungen.
          drill={mode as DrillId}
          onExit={onExit}
        />
      ) : mode === 'cards' ? (
        <CardSession
          direction={direction}
          onlyVocabIds={chapterWordIds}
          situation={practiceChapter?.situation}
          onWrite={(entries) => {
            setWritingPack(entries);
            onOpen(direction, 'writing');
          }}
          onReveal={() => scrollRef.current?.scrollToEnd({ animated: true })}
          key={direction}
        />
      ) : mode === 'writing' ? (
        <WritingRunner
          key={`${direction}:writing`}
          direction={direction}
          entries={writingPack ?? practiceChapter?.vocabulary}
          size={writingPack || practiceChapter ? 20 : undefined}
          onExit={onExit}
        />
      ) : mode === 'advanced' ? (
        <AdvancedLessonRunner key={`${direction}:advanced`} direction={direction} onExit={onExit} />
      ) : mode === 'dictation' ? (
        <DictationRunner
          key={`${direction}:dictation`}
          language={targetLanguageOf(direction)}
          direction={direction}
          onExit={onExit}
        />
      ) : mode === 'shadowing' || mode === 'sentenceRepeat' || mode === 'sentenceListening' ? (
        <SentenceRunner
          key={`${direction}:${mode}`}
          mode={mode}
          language={targetLanguageOf(direction)}
          anchor={anchorOf(direction)}
          words={practiceChapter?.vocabulary}
          situation={practiceChapter?.situation}
          onExit={onExit}
        />
      ) : mode === 'lesestoffe' ? (
        <ReadingTextsRunner key={direction} direction={direction} situationId={practiceChapter?.id} onExit={onExit} />
      ) : mode === 'sagen' ? (
        <ProductionRunner key={direction} direction={direction} onExit={onExit} />
      ) : mode === 'rollenspiel' ? (
        <RoleplayRunner key={direction} direction={direction} situationId={practiceChapter?.id} onExit={onExit} />
      ) : mode === 'speaking' ? (
        // Thai: die gemessene Tonkontur-Übung (AE-48). Englisch/Spanisch:
        // Nachsprechen mit Musterlösung und ehrlicher Selbst-Einschätzung —
        // eine Kontur-Messung gibt es dort nicht, und behauptet wird keine.
        learningLanguage(targetLanguageOf(direction)).wordSpeaking === 'tone-contour' ? (
          <SpeakingRunner key={`${direction}:speaking`} direction={direction} onExit={onExit} />
        ) : (
          <WordSpeakingRunner key={`${direction}:speaking`} direction={direction} onExit={onExit} />
        )
      ) : (
        <DrillRunner
          drill={mode}
          direction={direction}
          language={targetLanguageOf(direction)}
          key={`${direction}:${mode}`}
          onExit={onExit}
        />
      )}
          </>
      )}

      {/* Die Merkmal-Legende (Tonfarben etc.) ist hier bewusst ENTFERNT
          (Nutzerentscheidung 10.09.): Die Töne stehen bereits farbig an der
          Umschrift jeder Karte — der Extra-Kasten wiederholte sie nur. */}
    </ScreenScaffold>
  );
}

/**
 * Der Hauptknopf der Heutigen Runde (Schritt 2, 13.09.): gemischtes Üben —
 * fällige Karten, Hören, Satz bilden, Diktat, Shadowing in ~10 Minuten. Er
 * steht ÜBER der Übungsleiste, weil die Mischung der empfohlene Weg ist;
 * die Einzelübungen bleiben darunter voll erreichbar.
 */
function HeutigeRundeKnopf({ onPress }: { onPress: () => void }) {
  const { t } = useLocale();
  return (
    <ThemedButton
      label={t('round.cta', { minutes: ROUND_MINUTES })}
      accessibilityLabel={t('round.ctaA11y', { minutes: ROUND_MINUTES })}
      onPress={onPress}
    />
  );
}

function LearnPath({
  direction,
  chapters,
  finished,
  selectedChapterId,
  chapterError,
  finishing,
  lessonOpen,
  setLessonOpen,
  onSelect,
  onFinish,
  onOpen,
  onOpenFoundation,
  openArea,
  setOpenArea,
  practised,
}: {
  direction: PairDirection;
  chapters: LearningChapter[] | null;
  finished: string[];
  practised: Record<string, string[]>;
  selectedChapterId: string | null;
  chapterError: string | null;
  finishing: boolean;
  lessonOpen: boolean;
  setLessonOpen: (value: boolean) => void;
  onSelect: (chapterId: string) => void;
  onFinish: (chapterId: string) => void;
  onOpen: (mode: Mode, chapter?: LearningChapter) => void;
  onOpenFoundation: (mode: Mode) => void;
  openArea: TranslationKey | null;
  setOpenArea: (label: TranslationKey | null) => void;
}) {
  const { t, uiLanguage } = useLocale();
  const colors = useTheme();
  // Anfänger · Fortgeschritten · Profi (Nutzerwunsch 04.10.2026): Ohne eigene
  // Wahl gilt die Stufe des nächsten offenen Kapitels.
  const [pickedStage, setPickedStage] = useState<LearningStage | null>(null);
  const naechstes = chapters?.find((item) => !finished.includes(item.id)) ?? chapters?.[0];
  const stage: LearningStage = pickedStage ?? (naechstes ? stageForLevel(naechstes.situation.level) : 'beginner');
  const stageChapters = (chapters ?? []).filter((item) => stageForLevel(item.situation.level) === stage);
  const stageCounts = Object.fromEntries(LEARNING_STAGES.map((value) => [
    value, (chapters ?? []).filter((item) => stageForLevel(item.situation.level) === value).length,
  ])) as Record<LearningStage, number>;
  // Gleichnamige Kapitel (zweimal „Auf dem Wochenmarkt“) als Varianten kennzeichnen.
  const titelZaehler = new Map<string, number>();
  const titelVon = new Map(stageChapters.map((item) => {
    const titel = situationTranslation(item.situation, uiLanguage).title;
    // Einstieg und Aufbau stehen am Kapitel — gleicher Titel dort ist keine Variante.
    const schluessel = `${titel}|${item.situation.level}`;
    const nr = (titelZaehler.get(schluessel) ?? 0) + 1;
    titelZaehler.set(schluessel, nr);
    return [item.id, nr === 1 ? titel : `${titel}${t('conversation.variant', { count: nr })}`];
  }));
  const chapter = stageChapters.find((item) => item.id === selectedChapterId)
    ?? stageChapters.find((item) => !finished.includes(item.id))
    ?? stageChapters[0];
  const stufenText = (level: string) => `${t(levelLabelKey(level))} · ${t(levelPartKey(level))}`;
  const position = chapter ? stageChapters.findIndex((item) => item.id === chapter.id) + 1 : 0;
  const translated = chapter ? situationTranslation(chapter.situation, uiLanguage) : null;
  const turnIndex = chapter?.situation.scriptTurns.findIndex((turn) => turn.speaker === 'learner') ?? -1;
  const turn = turnIndex >= 0 ? chapter?.situation.scriptTurns[turnIndex] : null;
  // Kapitel 0 „Grundlagen“ steht bei den Anfängern vor Kapitel 1 und ist das
  // nächste Kapitel, solange es nicht abgeschlossen und nichts anderes gewählt ist.
  const foundationsShown = stage === 'beginner';
  const foundationsDone = finished.includes(FOUNDATIONS_ID);
  const foundationsActive = foundationsShown && (selectedChapterId === FOUNDATIONS_ID
    || (!foundationsDone && !stageChapters.some((item) => item.id === selectedChapterId)));
  const foundationsIntro = t(targetLanguageOf(direction) === 'th' ? 'foundations.introThai' : 'foundations.introLatin');
  const stepRow = ([candidate, key]: readonly [Mode, TranslationKey], index: number, chapterId: string, open: () => void) => {
    const geuebt = (practised[chapterId] ?? []).includes(candidate);
    const label = `${index + 1}. ${t(key)}`;
    return (
      <Pressable
        key={`${candidate}:${index}`}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={geuebt ? t('path.stepPractisedA11y', { step: label }) : label}
        style={({ pressed }) => [styles.pathStep, pressed && styles.pressed]}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {geuebt
          ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          : <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
      </Pressable>
    );
  };

  return (
    <View style={styles.learnHome}>
      <LearningStagePicker
        value={stage}
        counts={stageCounts}
        onChange={(value) => { setPickedStage(value); setLessonOpen(false); }}
      />
      {chapters === null ? <ThemedText type="small" themeColor="textSecondary">
        {t('round.assembling')}
      </ThemedText> : foundationsActive ? (lessonOpen ? null : (
        <ThemedView type="backgroundElement" style={styles.pathHero}>
          <ThemedText type="smallBold" themeColor="accent">
            {foundationsDone ? t('chapter.completed') : t('path.next')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t('foundations.chapter')}</ThemedText>
          <ThemedText type="subtitle">{t('foundations.title')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{foundationsIntro}</ThemedText>
          <ThemedButton label={t('path.open')} onPress={() => setLessonOpen(true)} variant="primary" />
        </ThemedView>
      )) : chapter && translated ? (lessonOpen ? null : (
        <ThemedView type="backgroundElement" style={styles.pathHero}>
          <ThemedText type="smallBold" themeColor="accent">
            {finished.includes(chapter.id) ? t('chapter.completed') : t('path.next')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('chapter.position', { index: position, total: stageChapters.length, level: stufenText(chapter.situation.level) })}
          </ThemedText>
          <ThemedText type="subtitle">{titelVon.get(chapter.id) ?? translated.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{translated.setting}</ThemedText>
          {turn ? <ThemedView type="background" style={styles.chapterExample}>
            <ThemedText type="smallBold">{spokenText(chapter.situation, turn)}</ThemedText>
            {targetLanguageOf(direction) === 'th' && turn.roman ? (
              <ThemedText type="small" themeColor="textSecondary">{turn.roman}</ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">{translated.turns[turnIndex]}</ThemedText>
          </ThemedView> : null}
          <ThemedText type="small" themeColor="textSecondary">{t('path.sequence')}</ThemedText>
          <ThemedButton
            label={lessonOpen ? t('common.back') : t('path.open')}
            onPress={() => setLessonOpen(!lessonOpen)}
            variant="primary"
          />
        </ThemedView>
      )) : <ThemedText type="small" themeColor="textSecondary">
        {chapters && chapters.length > 0 ? t('path.stageEmpty', { stage: t(STAGE_KEYS[stage]) }) : t('conversation.noneForDirection')}
      </ThemedText>}

      {chapterError ? <ThemedText type="small" themeColor="textSecondary">
        {t('common.loadFailed', { message: chapterError })}
      </ThemedText> : null}

      {lessonOpen && foundationsActive ? (
        <ThemedView type="backgroundElement" style={styles.lessonPanel}>
          <ThemedText type="smallBold">{t('foundations.chapter')} · {t('foundations.title')}</ThemedText>
          <ThemedText type="small">{foundationsIntro}</ThemedText>
          <ThemedButton label={t('common.back')} onPress={() => setLessonOpen(false)} />
          {foundationSteps(direction).map((step, index) =>
            stepRow(step, index, FOUNDATIONS_ID, () => onOpenFoundation(step[0])))}
          <ThemedButton
            label={foundationsDone ? t('chapter.completed') : t('chapter.finish')}
            disabled={finishing || foundationsDone}
            onPress={() => onFinish(FOUNDATIONS_ID)}
          />
        </ThemedView>
      ) : lessonOpen && chapter ? (
        <ThemedView type="backgroundElement" style={styles.lessonPanel}>
          <ThemedText type="smallBold">{stufenText(chapter.situation.level)} · {translated?.title}</ThemedText>
          <ThemedText type="small">{translated?.setting}</ThemedText>
          <ThemedButton label={t('common.back')} onPress={() => setLessonOpen(false)} />
          <ThemedText type="smallBold">
            {t('chapter.words', { count: chapter.vocabulary.length })}
          </ThemedText>
          {chapterSteps(direction, chapter).map((step, index) =>
            stepRow(step, index, chapter.id, () => onOpen(step[0], chapter)))}
          <ThemedButton
            label={finished.includes(chapter.id) ? t('chapter.completed') : t('chapter.finish')}
            disabled={finishing || finished.includes(chapter.id)}
            onPress={() => onFinish(chapter.id)}
          />
        </ThemedView>
      ) : null}

      <HeutigeRundeKnopf onPress={() => onOpen('heute')} />
      <ThemedText type="smallBold" themeColor="textSecondary">{t('path.areas')}</ThemedText>
      <ModeBar direction={direction} onPick={onOpen} expanded={openArea} setExpanded={setOpenArea} />
      {stageChapters.length > 0 ? <>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t(STAGE_KEYS[stage])} · {t('chapter.doneCount', {
            done: stageChapters.filter((item) => finished.includes(item.id)).length,
            total: stageChapters.length,
          })}
        </ThemedText>
        <View style={styles.chapterList}>
          {foundationsShown ? <Pressable
            onPress={() => onSelect(FOUNDATIONS_ID)}
            accessibilityRole="button"
            accessibilityState={{ selected: foundationsActive }}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type={foundationsActive ? 'backgroundSelected' : 'backgroundElement'} style={styles.chapterRow}>
              <View style={styles.skillText}>
                <ThemedText type="smallBold">{t('foundations.chapter')}</ThemedText>
                <ThemedText type="default">{t('foundations.title')}</ThemedText>
              </View>
              {foundationsDone
                ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
            </ThemedView>
          </Pressable> : null}
          {stageChapters.map((item, index) => {
            const label = titelVon.get(item.id) ?? situationTranslation(item.situation, uiLanguage).title;
            const current = !foundationsActive && item.id === chapter?.id;
            return <Pressable
              key={item.id}
              onPress={() => onSelect(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type={current ? 'backgroundSelected' : 'backgroundElement'} style={styles.chapterRow}>
                <View style={styles.skillText}>
                  <ThemedText type="smallBold">
                    {t('chapter.position', { index: index + 1, total: stageChapters.length, level: stufenText(item.situation.level) })}
                  </ThemedText>
                  <ThemedText type="default">{label}</ThemedText>
                </View>
                {finished.includes(item.id)
                  ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
              </ThemedView>
            </Pressable>;
          })}
        </View>
      </> : null}
      {/* Die B1-Vertiefung gehört zu „Fortgeschritten“. */}
      {stage === 'experienced' ? <ThemedView type="backgroundElement" style={styles.pathHero}>
        <ThemedText type="smallBold" themeColor="accent">{t('advanced.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('advanced.intro')}</ThemedText>
        <ThemedButton label={t('path.open')} onPress={() => onOpen('advanced')} />
      </ThemedView> : null}
    </View>
  );
}

/**
 * Ohne gewähltes Ziel wird nicht gelernt. Die Lernziele folgen seit Stufe 1
 * der BRÜCKE (Nutzerentscheidung 2026-09-10): Die App-/Oberflächensprache
 * bestimmt, welche Ziele hier stehen — Brücke Deutsch sieht die vier
 * Bestandsziele, Brücken th/en/es ihre jeweiligen Paare. Jede Wahl setzt
 * Sprache UND Richtung in einem (`lib/languages/goals`); die internen Abläufe
 * bleiben richtungsbasiert — nur die Beschriftung zeigt das Ziel.
 */
function DirectionPicker({
  profile,
  onPick,
}: {
  profile: LearnerProfile;
  onPick: (direction: PairDirection) => void;
}) {
  const { t, languageName, uiLanguage } = useLocale();
  // Hervorheben, wo man gerade war — der gemerkte Stand, nicht der (hier
  // leere) Adressparameter. Gehört die gemerkte Richtung zu keinem Ziel
  // (en_to_de/es_to_de), bleibt keine Zeile hervorgehoben.
  const aktuell = profile.review?.direction ?? null;
  return (
    <ScreenScaffold title={t('tabs.learn')} subtitle={t('review.pickSubtitle')} headerAction={<ZurueckZurUebersicht />}>
      <View role="radiogroup" accessibilityLabel={t('picker.chooseA11y')}>
        {zieleFuerBruecke(uiLanguage).map((ziel: Lernziel) => {
          const name = languageName(goalLanguage(ziel));
          const endonym = goalEndonym(ziel);
          const active = ziel.direction === aktuell;
          return (
            <Pressable
              key={ziel.direction}
              onPress={() => onPick(ziel.direction)}
              accessibilityRole="radio"
              accessibilityLabel={t('dashboard.cta', { direction: name })}
              aria-checked={active}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={active ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.goalRow}>
                <ThemedText type="default" style={styles.goalName}>
                  {name}
                </ThemedText>
                {/* Bei Deutsch fallen Name und Endonym zusammen. */}
                {endonym !== name ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {endonym}
                  </ThemedText>
                ) : null}
              </ThemedView>
            </Pressable>
          );
        })}
      </View>
      {/* Merkmal-Legende ebenfalls entfernt (Nutzerentscheidung 10.09.) —
          sie erscheint weiterhin auf der Übersicht. */}
    </ScreenScaffold>
  );
}

/**
 * Fünf eigenständige Lernbereiche mit Übungen hinter einer kurzen Beschreibung.
 * Der aufgeklappte Bereich liegt im Lern-Bildschirm: Diese Leiste wird beim
 * Öffnen einer Übung abgebaut und war danach jedes Mal wieder zugeklappt
 * (Testlauf 16.10.2026).
 */
function ModeBar({ direction, onPick, expanded, setExpanded }: {
  direction: PairDirection;
  onPick: (mode: Mode) => void;
  expanded: TranslationKey | null;
  setExpanded: (label: TranslationKey | null) => void;
}) {
  const { t } = useLocale();
  const colors = useTheme();
  const descriptions = [
    'path.vocabulary',
    'path.listening',
    'path.literacy',
    'path.speaking',
    'path.grammar',
  ] as const;

  return (
    <View style={styles.modeBar}>
      {groupsForDirection(direction).map((group, index) => {
        const open = expanded === group.label;
        return (
          <ThemedView key={group.label} type="backgroundElement" style={styles.skillCard}>
            <Pressable
              onPress={() => setExpanded(open ? null : group.label)}
              accessibilityRole="button"
              accessibilityLabel={t(group.label)}
              accessibilityState={{ expanded: open }}
              style={({ pressed }) => [styles.skillHeader, pressed && styles.pressed]}>
              <View style={styles.skillText}>
                <ThemedText type="smallBold">{t(group.label)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{t(descriptions[index])}</ThemedText>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            </Pressable>
            {open ? (
              <View style={styles.skillModes}>
                {group.modes.map((candidate) => (
                  <ThemedButton key={candidate} label={modeLabel(candidate, t)} onPress={() => onPick(candidate)} />
                ))}
              </View>
            ) : null}
            {index === 0 && !open ? (
              <ThemedButton label={t('mode.cards')} onPress={() => onPick('cards')} />
            ) : null}
          </ThemedView>
        );
      })}
    </View>
  );
}

/**
 * Zurück zur Sprach- und Richtungsauswahl.
 *
 * SEIT PHASE 18 NUR NOCH EIN KNOPF. Daneben stand „☆ Als Standard merken" —
 * das Gegenstück zur Standard-Lernrichtung aus AE-17. Seit der Reiter sich
 * ohnehin merkt, wo man war, gibt es nichts mehr zu setzen; geblieben ist der
 * Weg zurück, damit der gemerkte Stand keine Einbahnstraße wird.
 */
function DirectionBar({ onSwitch }: { onSwitch: () => void }) {
  const { t } = useLocale();
  return (
    <View style={styles.directionBar}>
      <Pressable
        onPress={onSwitch}
        accessibilityRole="button"
        accessibilityLabel={t('review.switchA11y')}
        style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('review.switch')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function CardSession({
  direction,
  onlyVocabIds,
  situation,
  onWrite,
  onReveal,
}: {
  direction: PairDirection;
  onlyVocabIds?: ReadonlySet<string>;
  situation?: ConversationSituation;
  onWrite: (entries: VocabEntry[]) => void;
  /** Nach dem Aufdecken: die Bewertungsknöpfe in Sicht holen (375 px). */
  onReveal?: () => void;
}) {
  const { t } = useLocale();
  const colors = useTheme();
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ratingInFlight = useRef(false);
  const [rated, setRated] = useState(0);
  const [again, setAgain] = useState(0);
  // Karten bis zu dieser Stelle sind die fällige Runde; dahinter hängen die
  // „Nochmal“-Karten zur Wiederholung in derselben Runde (Nutzertest
  // 17.10.2026: sie kamen erst am nächsten Tag wieder). Die Wiederholung
  // schreibt FSRS NICHT ein zweites Mal fort — die Karte ist schon bewertet.
  const [runde, setRunde] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setQueueError(null);
    buildReviewQueue(direction, undefined, undefined, onlyVocabIds)
      .then((items) => {
        if (cancelled) return;
        const due = items.slice(0, 20);
        setQueue(due);
        setRunde(due.length);
      })
      .catch((e) => {
        if (!cancelled) setQueueError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, [direction, onlyVocabIds]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (ratingInFlight.current || !queue) return;
      const item = queue[index];
      if (!item) return;
      const wiederholung = index >= runde;

      ratingInFlight.current = true;
      setBusy(true);
      setSaveError(null);
      try {
        if (!wiederholung) {
          await rateCard(item.card, rating);
          setRated((value) => value + 1);
          if (rating === 1) setAgain((value) => value + 1);
        }
        if (rating === 1) setQueue((current) => (current ? [...current, item] : current));
        setIndex((value) => value + 1);
        setRevealed(false);
      } catch (error) {
        setSaveError(messageOf(error));
      } finally {
        ratingInFlight.current = false;
        setBusy(false);
      }
    },
    [queue, index, runde]
  );

  const restart = useCallback(() => {
    setSaveError(null);
    setQueue(null);
    setQueueError(null);
    setIndex(0);
    setRevealed(false);
    // Zähler zurück: Sonst stand nach „Erneut prüfen“ ohne fällige Karten
    // wieder „Sitzung beendet“ mit den alten Zahlen — als täte der Knopf nichts.
    setRated(0);
    setAgain(0);
    buildReviewQueue(direction, undefined, undefined, onlyVocabIds)
      .then((items) => {
        const due = items.slice(0, 20);
        setQueue(due);
        setRunde(due.length);
      })
      .catch((e) => setQueueError(messageOf(e)));
  }, [direction, onlyVocabIds]);

  if (queueError) {
    return (
      <ThemedView type="backgroundElement" style={styles.summary}>
        <ThemedText type="smallBold">{t('cards.loadFailedTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('cards.assembleFailed', { message: queueError })}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.retry')} onPress={restart} />
        </View>
      </ThemedView>
    );
  }

  if (!queue) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('cards.assembling')}
      </ThemedText>
    );
  }

  const item = queue[index];

  if (!item) {
    return (
      <ThemedView type="backgroundElement" style={styles.summary}>
        <ThemedText type="smallBold">{rated > 0 ? t('cards.done') : t('cards.nothingDue')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {rated > 0
            ? t('cards.summaryRated', { rated, again })
            : t('cards.summaryIdle')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.recheck')} onPress={restart} />
          {rated > 0 ? <ThemedButton
            label={t('mode.writing')}
            onPress={() => onWrite([...new Map(queue.map((item) => [item.entry.id, item.entry])).values()])}
            variant="primary"
          /> : null}
        </View>
      </ThemedView>
    );
  }

  return (
    <>
      <View style={styles.progressBlock}>
        {/* Schiene vor Text (UI-Review 2026-09-07): Fortschritt ist eine
            Fläche, die man im Augenblick erfasst, kein Satz, den man liest.
            Füllstand VOR der Bewertung — `index` Karten sind geschafft, die
            aktuelle zählt erst, wenn sie bewertet ist. */}
        <ThemedView type="backgroundSelected" style={styles.progressTrack}>
          <ThemedView
            type="accent"
            style={[styles.progressFill, { width: `${(index / queue.length) * 100}%` }]}
          />
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          {t('cards.progress', { index: index + 1, total: queue.length })}
        </ThemedText>
        {index >= runde ? (
          <ThemedText type="small" themeColor="textSecondary">{t('cards.repeatNote')}</ThemedText>
        ) : null}
      </View>

      <Flashcard
        entry={item.entry}
        direction={direction}
        revealed={revealed}
        bridgeEntry={item.bridgeEntry}
        situation={situation}
      />

      {revealed ? (
        <View style={styles.ratings}>
          {RATINGS.map((rating) => (
            <Pressable
              key={rating}
              onPress={() => rate(rating)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('rating.a11y', { label: t(RATING_KEYS[rating]) })}
              style={({ pressed }) => [styles.ratingWrap, pressed && styles.pressed]}>
              {/* Fläche und Schrift als Token-PAAR aus dem Theme — die
                  Kontraste gelten nur als Paar (siehe RATING_COLORS). */}
              <View
                style={[
                  styles.ratingButton,
                  { backgroundColor: colors[RATING_COLORS[rating].bg] },
                ]}>
                <ThemedText type="small" style={{ color: colors[RATING_COLORS[rating].text] }}>
                  {t(RATING_KEYS[rating])}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <ThemedButton
          label={t('card.reveal')}
          accessibilityLabel={t('card.revealA11y')}
          onPress={() => {
            setRevealed(true);
            // Erst nach dem Layout der Bewertungsreihe scrollen.
            setTimeout(() => onReveal?.(), 50);
          }}
          variant="primary"
        />
      )}
      {saveError ? <ThemedText type="small" themeColor="textSecondary">
        {t('common.loadFailed', { message: saveError })}
      </ThemedText> : null}
    </>
  );
}

const styles = StyleSheet.create({
  learnHome: {
    gap: Spacing.three,
  },
  exerciseHeader: {
    gap: Spacing.two,
  },
  exerciseActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pathHero: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  chapterExample: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  chapterList: {
    gap: Spacing.one,
  },
  chapterRow: {
    minHeight: 64,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lessonPanel: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sentenceParts: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  sentencePart: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    gap: Spacing.half,
  },
  exampleWord: {
    fontWeight: '700',
    textAlign: 'center',
  },
  pathStep: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  skillCard: {
    borderRadius: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  skillHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    gap: Spacing.two,
  },
  skillText: {
    flex: 1,
    gap: Spacing.half,
  },
  skillModes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    padding: Spacing.one,
  },
  /**
   * Mindestgroesse eines Tippziels. WCAG 2.2 verlangt in 2.5.8 (AA) 24x24
   * CSS-Pixel; Apple und Google empfehlen 44 bzw. 48. Gemessen wurde im
   * Web-Build, dass reine Textknoepfe nur 20 Pixel hoch waren - also unter der
   * Norm. 44 ist der bequeme Wert und kostet hier nichts.
   */
  tapTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  /** Rückweg zur Übersicht — dezente Zeile über dem Titel, volle Tipphöhe. */
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  backPressed: {
    opacity: 0.7,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  goalName: {
    fontWeight: '700',
    flexShrink: 1,
  },
  modeBar: {
    flexDirection: 'column',
    gap: Spacing.two,
  },
  directionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  /**
   * Schiene und Kartezaehler eng beieinander (8 statt der Spaltenluecke von
   * 24): Sie sind zusammen die Fortschrittszeile des Mockups — erst die
   * Fläche, darunter die kleine Zahl.
   */
  progressBlock: {
    gap: Spacing.two,
  },
  /**
   * Hauchduenne Schiene mit pillfoermiger Fuellung (Mockup „Lernen /
   * Karteikarten“): `overflow` + Radius schneiden die Fuellung an den
   * Rundungen sauber ab, auch bei fuellendem oder leerem Stand.
   */
  progressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    borderRadius: 999,
  },
  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  ratingWrap: {
    // Vier gleiche Viertel statt flexBasis 110: auf einem 360-dp-Telefon
    // brachen 4×110 + Lücken die Zeile in ein 2×2-Raster um.
    flexGrow: 1,
    flexBasis: 0,
  },
  ratingButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  summary: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
