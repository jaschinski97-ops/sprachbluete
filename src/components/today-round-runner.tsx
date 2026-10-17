import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Flashcard } from './flashcard';
import { ENTER_PRUEFT } from './sentence-input';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  hasPronunciationClip,
  isLanguageAvailable,
  playPronunciationWithStatus,
  stopPronunciation,
} from '@/lib/audio';
import { dictationConfigFor } from '@/data/dictation-config';
import { dictationTasksFor } from '@/lib/dictation/tasks';
import { satzaufgabenFuer, type SatzSprache, type SentenceTask } from '@/data/sentence-tasks';
import { buildDrillSession } from '@/lib/drills/session';
import { seededRandom, shuffled } from '@/lib/drills/random';
import { type DrillId, type DrillQuestion } from '@/lib/drills/types';
import { type Rating } from '@/lib/fsrs/types';
import { TranslationKey, useLocale, type UiLanguage } from '@/lib/i18n';
import { anchorOf, targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { hoerDrillFuer } from '@/lib/languages/definitions';
import { loadOrCreateCardState, rateCard } from '@/lib/repository';
import { recordDrill } from '@/lib/review-log';
import {
  buildTodayRound,
  type RoundKind,
  type TodayRound,
} from '@/lib/today-round';
import { ratingForScore, scoreDictation } from '@/lib/dictation/scoring';

/**
 * Der Läufer der Heutigen Runde (`lib/today-round` entscheidet, hier wird
 * ausgeführt). Je Segment eine schlanke Übung mit demselben Unterbau wie die
 * Einzelübungen: Karteikarte mit den vier FSRS-Bewertungen, Hör-Quiz über
 * die Drill-Aufgaben, Satz bilden als Zuordnung (Bedeutung → geprüfter
 * Satz), Diktat über Diktat-Aufgaben und -Toleranzen, Shadowing als
 * Mitsprechen ohne Messung.
 *
 * positionierT wird über einen FLACHEN Zeiger (`erledigt`) gerechnet —
 * Segmente sind Abschnitte eines Strangs, und „nächste Aufgabe“ ist immer
 * derselbe Schritt. Segmente ohne Stoff auf dem Gerät (etwa Thai-Hörclips,
 * wenn weder Clip noch Stimme greift) werden ehrlich übersprungen und in
 * der Zusammenfassung genannt. Bewertet wird NUR, wo es immer schon
 * bewertet wurde: Karteikarten und bestandene Diktate.
 */

const RATING_KEYS: Record<Rating, TranslationKey> = {
  1: 'rating.again',
  2: 'rating.hard',
  3: 'rating.good',
  4: 'rating.easy',
};

const RATING_COLORS: Record<Rating, { bg: ThemeColor; text: ThemeColor }> = {
  1: { bg: 'rateAgainBg', text: 'rateAgainText' },
  2: { bg: 'rateHardBg', text: 'rateHardText' },
  3: { bg: 'rateGoodBg', text: 'rateGoodText' },
  4: { bg: 'rateEasyBg', text: 'rateEasyText' },
};

const RATINGS: Rating[] = [1, 2, 3, 4];

/** Der Hör-Drill je Sprache — derselbe Stoff wie in der Einzelübung. */

const PROMPT_KEYS: Record<DrillId, TranslationKey> = {
  tone: 'drill.prompt.tone',
  stressHear: 'drill.prompt.stressHear',
  soundSpelling: 'drill.prompt.soundSpelling',
  toneRule: 'drill.prompt.toneRule',
  article: 'drill.prompt.article',
  verbForms: 'drill.prompt.verbForms',
  stressRule: 'drill.prompt.stressRule',
  spelling: 'drill.prompt.spelling',
  deutschLesen: 'drill.prompt.deutschLesen',
  polite: 'drill.prompt.polite',
  irregularPast: 'drill.prompt.irregularPast',
  serEstar: 'drill.prompt.serEstar',
  zaehlerwort: 'drill.prompt.zaehlerwort',
  konsonantenklasse: 'drill.prompt.konsonantenklasse',
  praesensEndung: 'drill.prompt.praesensEndung',
  partizip: 'drill.prompt.partizip',
};

const DIKTAT_PROMPT_KEYS: Record<SatzSprache, TranslationKey> = {
  th: 'dictation.promptTh',
  en: 'dictation.promptEn',
  es: 'dictation.promptEs',
  de: 'dictation.promptDe',
};

const SEGMENT_NAMEN: Record<RoundKind, TranslationKey> = {
  cards: 'mode.cards',
  hoeren: 'skill.hoeren',
  satz: 'round.satz',
  diktat: 'mode.dictation',
  shadowing: 'mode.shadowing',
};

type SatzAufgabe = { id: string; vocabId: string; german: string; text: string; roman: string };

function satzAufgaben(tasks: SentenceTask[], anzahl: number, seed: number): SatzAufgabe[] {
  return shuffled(tasks, seededRandom(seed))
    .slice(0, anzahl)
    .map((task) => ({ id: task.id, vocabId: task.vocabId, german: task.german, text: task.text, roman: task.roman }));
}

export function TodayRoundRunner({
  direction,
  onExit,
}: {
  direction: PairDirection;
  onExit: () => void;
}) {
  const { t } = useLocale();
  // Die produzierte Sprache des Paars — im Deutsch-Ziel (th_to_de) werden
  // deutsche Sätze gebildet, diktiert und mitgesprochen, nicht thailändische.
  const sprache = targetLanguageOf(direction);

  const [runde, setRunde] = useState<TodayRound | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(0);
  const [uebersprungen, setUebersprungen] = useState<RoundKind[]>([]);

  useEffect(() => {
    let cancelled = false;
    buildTodayRound(direction)
      .then((neu) => {
        if (!cancelled) setRunde(neu);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      void stopPronunciation();
    };
  }, [direction]);

  const restart = useCallback(() => {
    setRunde(null);
    setErledigt(0);
    setUebersprungen([]);
    setLoadError(null);
    buildTodayRound(direction)
      .then(setRunde)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [direction]);

  // Die aktuelle Stelle im Strang: Segmente abarbeiten, bis der Zeiger passt.
  const { segment, position, segIndex } = (() => {
    if (!runde) return { segment: undefined, position: 0, segIndex: 0 };
    let rest = erledigt;
    for (let i = 0; i < runde.plan.length; i++) {
      const seg = runde.plan[i];
      if (rest < seg.items) return { segment: seg, position: rest, segIndex: i };
      rest -= seg.items;
    }
    return { segment: undefined, position: 0, segIndex: runde.plan.length };
  })();
  const roundWordIds = useMemo(
    () => new Set(runde?.due.slice(0, runde.plan.find((part) => part.kind === 'cards')?.items ?? 0)
      .map((item) => item.entry.id) ?? []),
    [runde]
  );

  if (loadError) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('round.loadFailedTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('cards.assembleFailed', { message: loadError })}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.retry')} onPress={restart} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  if (!runde) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.assembling')}
      </ThemedText>
    );
  }

  if (!segment) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('round.done')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {/* Nur die Bereiche, die wirklich geübt wurden — übersprungene
              zählen nicht als erledigte Aufgaben. */}
          {t('round.summary', {
            items: runde.plan
              .filter((p) => !uebersprungen.includes(p.kind))
              .reduce((s, p) => s + p.items, 0),
            segments: runde.plan.filter((p) => !uebersprungen.includes(p.kind)).length,
          })}
        </ThemedText>
        {uebersprungen.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('round.skippedNote', {
              areas: [...new Set(uebersprungen)]
                .map((kind) => t(SEGMENT_NAMEN[kind]))
                .join(', '),
            })}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {t(runde.plan.some(p => !uebersprungen.includes(p.kind) && ['cards', 'diktat'].includes(p.kind)) ? 'round.note' : 'learning.noReviews')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('drill.newRound')} onPress={restart} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  const springeWeiter = () => {
    setUebersprungen((liste) => [...liste, segment.kind]);
    setErledigt(erledigt + (segment.items - position));
  };

  return (
    <>
      {/* Verlassen mitten in der Runde — die laufende Ansicht hatte nur
          „Bereich überspringen“, aber keinen Rückweg (en-UI-Befund 21.09.). */}
      <View style={styles.actions}>
        <ThemedButton label={t('common.back')} onPress={onExit} />
      </View>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('round.segment', { index: segIndex + 1, total: runde.plan.length })} ·{' '}
          {t(SEGMENT_NAMEN[segment.kind])} ·{' '}
          {t('drill.questionProgress', { index: position + 1, total: segment.items })}
        </ThemedText>
        <Pressable
          onPress={springeWeiter}
          accessibilityRole="button"
          accessibilityLabel={t('round.skipA11y')}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('round.skip')}
          </ThemedText>
        </Pressable>
      </View>

      {segment.kind === 'cards' ? (
        <KartenSegment
          direction={direction}
          items={runde.due.slice(0, runde.plan[segIndex].items)}
          position={position}
          onRated={() => setErledigt((value) => value + 1)}
        />
      ) : segment.kind === 'hoeren' ? (
        <HoerenSegment
          sprache={sprache}
          direction={direction}
          onlyVocabIds={roundWordIds.size > 0 ? roundWordIds : undefined}
          anzahl={segment.items}
          position={position}
          onAnswered={() => setErledigt((value) => value + 1)}
        />
      ) : segment.kind === 'satz' ? (
        <SatzSegment
          sprache={sprache}
          anchor={anchorOf(direction)}
          onlyVocabIds={roundWordIds.size > 0 ? roundWordIds : undefined}
          anzahl={segment.items}
          position={position}
          onAnswered={() => setErledigt((value) => value + 1)}
        />
      ) : segment.kind === 'diktat' ? (
        <DiktatSegment
          sprache={sprache}
          direction={direction}
          onlyVocabIds={roundWordIds.size > 0 ? roundWordIds : undefined}
          anzahl={segment.items}
          position={position}
          onAnswered={() => setErledigt((value) => value + 1)}
        />
      ) : (
        <ShadowingSegment
          key={`shadowing:${position}`}
          sprache={sprache}
          anchor={anchorOf(direction)}
          onlyVocabIds={roundWordIds.size > 0 ? roundWordIds : undefined}
          anzahl={segment.items}
          position={position}
          onDone={() => setErledigt((value) => value + 1)}
        />
      )}
    </>
  );
}

/* ---------- Karten ---------- */

function KartenSegment({
  direction,
  items,
  position,
  onRated,
}: {
  direction: PairDirection;
  items: TodayRound['due'];
  position: number;
  onRated: () => void;
}) {
  const { t } = useLocale();
  const themeColors = useTheme();
  const item = items[position];
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setRevealed(false), [position]);

  if (!item) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('cards.summaryIdle')}
      </ThemedText>
    );
  }

  const rate = async (rating: Rating) => {
    if (busy) return;
    setBusy(true);
    await rateCard(item.card, rating).catch(() => {});
    setBusy(false);
    onRated();
  };

  return (
    <>
      <Flashcard
        entry={item.entry}
        direction={direction}
        revealed={revealed}
        bridgeEntry={item.bridgeEntry}
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
              <View
                style={[
                  styles.ratingButton,
                  { backgroundColor: themeColors[RATING_COLORS[rating].bg] },
                ]}>
                <ThemedText
                  type="small"
                  style={{ color: themeColors[RATING_COLORS[rating].text] }}>
                  {t(RATING_KEYS[rating])}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <ThemedButton
          label={t('card.reveal')}
          onPress={() => setRevealed(true)}
          variant="primary"
        />
      )}
    </>
  );
}

/* ---------- Hören (Drill-Aufgaben derselben Engine) ---------- */

function HoerenSegment({
  sprache,
  direction,
  onlyVocabIds,
  anzahl,
  position,
  onAnswered,
}: {
  sprache: SatzSprache;
  /** Die Lernrichtung der Runde — die Hörübung schreibt dieselben Karten fort. */
  direction: PairDirection;
  onlyVocabIds?: ReadonlySet<string>;
  anzahl: number;
  position: number;
  onAnswered: () => void;
}) {
  const { t } = useLocale();
  const [fragen, setFragen] = useState<DrillQuestion[] | null>(null);
  const [leer, setLeer] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  // Sprachen ohne Wort-Hörübung (Definition) plant der Planer gar nicht erst;
  // ohne Drill wird unten ehrlich übersprungen.
  const drill = hoerDrillFuer(sprache);

  useEffect(() => {
    let cancelled = false;
    if (!drill) return;
    buildDrillSession({
      drill,
      language: sprache,
      direction,
      size: anzahl,
      onlyVocabIds,
      isEligible:
        drill === 'tone'
          ? (entry) => hasPronunciationClip({ text: entry.term, language: 'th', purpose: 'tone' })
          : undefined,
    })
      .then((session) => {
        if (cancelled) return;
        if (session.questions.length === 0) setLeer(true);
        else setFragen(session.questions);
      })
      .catch(() => {
        if (!cancelled) setLeer(true);
      });
    return () => {
      cancelled = true;
    };
  }, [drill, sprache, direction, anzahl, onlyVocabIds]);

  const frage = fragen && fragen.length > 0 ? fragen[position % fragen.length] : null;
  useEffect(() => setChosen(null), [position]);

  const spiele = useCallback(() => {
    if (!frage?.speak) return;
    const speak = frage.speak;
    // Dieselbe Quelle wie die Einzelübung: Ton-Fragen nur mit tongeprüftem Clip.
    const request = { text: speak.text, language: speak.language, purpose: frage.drill === 'tone' ? 'tone' as const : 'general' as const };
    void (async () => {
      try {
        if (!await hasPronunciationClip(request) && await isLanguageAvailable(speak.language) === false) {
          return;
        }
        await playPronunciationWithStatus(request);
      } catch {
        // Ohne Ton bleibt die Frage sichtbar — die Auswahl funktioniert.
      }
    })();
  }, [frage]);

  useEffect(() => {
    spiele();
  }, [spiele]);

  if (!drill || leer || !frage) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.emptySkip')}
      </ThemedText>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t(PROMPT_KEYS[frage.drill])}</ThemedText>
      {/* Töne hört man selten beim ersten Mal (Nutzertest 17.10.2026: die
          Runde spielte das Wort nur einmal ab). */}
      {frage.speak ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('drill.playAgainA11y')}
          onPress={spiele}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="smallBold" themeColor="accent">{t('drill.playAgain')}</ThemedText>
        </Pressable>
      ) : null}
      {frage.visible ? <ThemedText type="subtitle">{frage.visible}</ThemedText> : null}
      {frage.visibleRoman ? (
        <ThemedText type="small" themeColor="textSecondary">{frage.visibleRoman}</ThemedText>
      ) : null}
      {frage.visibleHint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {frage.visibleHint}
        </ThemedText>
      ) : null}
      {frage.visibleHintRoman ? (
        <ThemedText type="small" themeColor="textSecondary">{frage.visibleHintRoman}</ThemedText>
      ) : null}
      <View style={styles.options}>
        {frage.options.map((option, i) => (
          <Pressable
            key={`${option.label}:${i}`}
            onPress={() => {
              if (chosen !== null) return;
              setChosen(i);
              void recordDrill(i === frage.correctIndex, Date.now(), undefined, frage.drill, direction).catch(() => {});
            }}
            disabled={chosen !== null}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen === i, disabled: chosen !== null }}
            style={({ pressed }) => [styles.optionWrap, pressed && styles.pressed]}>
            <ThemedView type={optionFlaeche(chosen, i, frage.correctIndex)} style={styles.optionButton}>
              <ThemedText type="small" themeColor={optionSchrift(chosen, i, frage.correctIndex)}>
                {option.label}
              </ThemedText>
              {option.roman ? <ThemedText type="small" themeColor="textSecondary">{option.roman}</ThemedText> : null}
            </ThemedView>
          </Pressable>
        ))}
      </View>
      {chosen !== null ? <View style={styles.feedback}>
        <ThemedText type="smallBold" themeColor={chosen === frage.correctIndex ? 'success' : 'error'}>
          {chosen === frage.correctIndex ? t('drill.correct') : t('drill.wrong')}
        </ThemedText>
        <ThemedText type="small">{frage.solution}</ThemedText>
        {frage.solutionRoman && frage.solutionRoman !== frage.solution ? (
          <ThemedText type="small" themeColor="textSecondary">{frage.solutionRoman}</ThemedText>
        ) : null}
        {/* Bei der Ton-Frage steht hier „Ton: Fallend“ — die Lösung allein
            nannte den Ton nicht. */}
        {frage.explanation ? <ThemedText type="small" themeColor="textSecondary">{frage.explanation}</ThemedText> : null}
        <ThemedButton label={t('common.next')} onPress={onAnswered} variant="primary" />
      </View> : null}
    </ThemedView>
  );
}

/**
 * Antwortflächen nach der Wahl: die richtige grün, eine falsche Wahl rot —
 * vorher wurde jede Wahl blau markiert, auch eine falsche (Nutzertest
 * 17.10.2026). Die Farbpaare sind die AA-geprüften der Bewertungsknöpfe.
 */
function optionFlaeche<T>(chosen: T | null, option: T, correct: T): ThemeColor {
  if (chosen === null) return 'backgroundSelected';
  if (option === correct) return 'rateGoodBg';
  return option === chosen ? 'rateAgainBg' : 'backgroundElement';
}

function optionSchrift<T>(chosen: T | null, option: T, correct: T): ThemeColor {
  if (chosen === null) return 'text';
  if (option === correct) return 'rateGoodText';
  return option === chosen ? 'rateAgainText' : 'textSecondary';
}

/* ---------- Satz bilden (Bedeutung → geprüfter Satz) ---------- */

function SatzSegment({
  sprache,
  anchor,
  onlyVocabIds,
  anzahl,
  position,
  onAnswered,
}: {
  sprache: SatzSprache;
  /** Anker-/Bedeutungsseite der Richtung (21.09.2026). */
  anchor: UiLanguage;
  onlyVocabIds?: ReadonlySet<string>;
  anzahl: number;
  position: number;
  onAnswered: () => void;
}) {
  const { t } = useLocale();
  const stoff = useMemo(() => anchor === 'de'
    ? satzaufgabenFuer(sprache, anchor).filter((task) => !onlyVocabIds || onlyVocabIds.has(task.vocabId))
    : [], [sprache, anchor, onlyVocabIds]);
  const aufgaben = useMemo(
    () => satzAufgaben(stoff, anzahl, anzahl + sprache.length),
    [stoff, anzahl, sprache]
  );
  const aufgabe = aufgaben.length > 0 ? aufgaben[position % aufgaben.length] : null;
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => setChosen(null), [position]);

  const optionen = useMemo(() => {
    if (!aufgabe) return [];
    const fremde = shuffled(
      aufgaben.filter((other) => other.id !== aufgabe.id).map((other) => other.text),
      seededRandom(position + aufgabe.id.length)
    ).slice(0, 3);
    return shuffled([aufgabe.text, ...fremde], seededRandom(position + 7)).map((label) => ({
      label,
      roman: aufgaben.find((task) => task.text === label)?.roman ?? '',
      correct: label === aufgabe.text,
    }));
  }, [aufgabe, aufgaben, position]);

  if (!aufgabe || optionen.length < 2) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.emptySkip')}
      </ThemedText>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('round.satzPrompt')}</ThemedText>
      <ThemedText type="subtitle">{aufgabe.german}</ThemedText>
      <View style={styles.options}>
        {optionen.map((option, i) => (
          <Pressable
            key={`${option.label}:${i}`}
            onPress={() => {
              if (chosen !== null) return;
              setChosen(option.label);
            }}
            disabled={chosen !== null}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen === option.label, disabled: chosen !== null }}
            style={({ pressed }) => [styles.optionWrap, pressed && styles.pressed]}>
            <ThemedView type={optionFlaeche(chosen, option.label, aufgabe.text)} style={styles.optionButton}>
              <ThemedText type="small" themeColor={optionSchrift(chosen, option.label, aufgabe.text)}>
                {option.label}
              </ThemedText>
              {/* Die Umschrift in derselben Farbe wie der Satz: grau auf der
                  hervorgehobenen Fläche war kaum lesbar. */}
              {sprache === 'th' && option.roman ? (
                <ThemedText type="small" themeColor={chosen === null ? 'textSecondary' : optionSchrift(chosen, option.label, aufgabe.text)}>
                  {option.roman}
                </ThemedText>
              ) : null}
            </ThemedView>
          </Pressable>
        ))}
      </View>
      {chosen !== null ? <View style={styles.feedback}>
        <ThemedText type="smallBold" themeColor={chosen === aufgabe.text ? 'success' : 'error'}>
          {chosen === aufgabe.text ? t('drill.correct') : t('drill.wrong')}
        </ThemedText>
        <ThemedButton label={t('common.next')} onPress={onAnswered} variant="primary" />
      </View> : null}
    </ThemedView>
  );
}

/* ---------- Diktat ---------- */

function DiktatSegment({
  sprache,
  direction,
  onlyVocabIds,
  anzahl,
  position,
  onAnswered,
}: {
  sprache: SatzSprache;
  direction: PairDirection;
  onlyVocabIds?: ReadonlySet<string>;
  anzahl: number;
  position: number;
  onAnswered: () => void;
}) {
  const { t } = useLocale();
  const colors = useTheme();
  const tasks = useMemo(() => {
    try {
      return dictationTasksFor(sprache, direction)
        .filter((task) => !onlyVocabIds || onlyVocabIds.has(task.vocabId))
        .slice(0, Math.max(anzahl, 1));
    } catch {
      return [];
    }
  }, [sprache, direction, anzahl, onlyVocabIds]);
  const task = tasks.length > 0 ? tasks[position % tasks.length] : null;
  const [draft, setDraft] = useState('');
  const [ergebnis, setErgebnis] = useState<'passed' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft('');
    setErgebnis(null);
  }, [position]);

  // Leer prüfen wertete als „nicht bestanden“ — wie im Rollenspiel gesperrt.
  const pruefen = () => {
    if (busy || ergebnis !== null || !task || !draft.trim()) return;
    setBusy(true);
    void (async () => {
      try {
        const config = dictationConfigFor(task.language);
        const score = scoreDictation(draft, task.text, config);
        setErgebnis(score.passed ? 'passed' : 'failed');
        await recordDrill(score.passed, Date.now(), undefined, 'dictation', direction).catch(() => {});
        if (score.passed) {
          try {
            const card = await loadOrCreateCardState(task.vocabId, task.direction);
            // ratingForScore liefert bei `passed` immer 2 oder 3 — nie null.
            await rateCard(card, ratingForScore(score)!);
          } catch {
            // Kartenschreiben darf die Runde nicht stoppen.
          }
        }
      } finally {
        setBusy(false);
      }
    })();
  };

  if (!task) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.emptySkip')}
      </ThemedText>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t(DIKTAT_PROMPT_KEYS[sprache])}</ThemedText>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('dictation.play')}
          onPress={() => {
            void playPronunciationWithStatus({
              text: task.text,
              language: task.language,
              purpose: 'sentence',
            }).catch(() => {});
          }}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" style={{ color: colors.accent }}>
            {t('dictation.play')}
          </ThemedText>
        </Pressable>
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={pruefen}
        {...ENTER_PRUEFT}
        editable={ergebnis === null && !busy}
        multiline
        accessibilityLabel={t('dictation.inputA11y')}
        style={[styles.input, { color: colors.text, borderColor: colors.borderSubtle }]}
      />
      {ergebnis === null ? (
        <ThemedButton label={t('dictation.check')} disabled={!draft.trim()} onPress={pruefen} />
      ) : (
        // Die eigene Eingabe bleibt oben im Feld stehen; darunter Lösung,
        // Umschrift und Bedeutung wie im eigenständigen Diktat. Vorher sprang
        // die Runde nach 1,6 s weiter (Nutzertest 17.10.2026).
        <View style={styles.feedback}>
          <ThemedText type="smallBold" themeColor={ergebnis === 'passed' ? 'success' : 'error'}>
            {ergebnis === 'passed' ? t('dictation.passed') : t('dictation.failed')}
          </ThemedText>
          <ThemedText type="small">{task.text}</ThemedText>
          {sprache === 'th' && task.roman ? (
            <ThemedText type="small" themeColor="textSecondary">{task.roman}</ThemedText>
          ) : null}
          {/* Die deutsche Bedeutung nur auf der de-Brücke, wie im Diktat. */}
          {anchorOf(direction) === 'de' && task.german ? (
            <ThemedText type="small" themeColor="textSecondary">{task.german}</ThemedText>
          ) : null}
          <ThemedButton label={t('common.next')} onPress={onAnswered} variant="primary" />
        </View>
      )}
    </ThemedView>
  );
}

/* ---------- Shadowing (Mitsprechen ohne Messung) ---------- */

function ShadowingSegment({
  sprache,
  anchor,
  onlyVocabIds,
  anzahl,
  position,
  onDone,
}: {
  sprache: SatzSprache;
  /** Anker-/Bedeutungsseite der Richtung (21.09.2026). */
  anchor: UiLanguage;
  onlyVocabIds?: ReadonlySet<string>;
  anzahl: number;
  position: number;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const stoff = useMemo(() => anchor === 'de'
    ? satzaufgabenFuer(sprache, anchor).filter((task) => !onlyVocabIds || onlyVocabIds.has(task.vocabId))
    : [], [sprache, anchor, onlyVocabIds]);
  const aufgaben = useMemo(
    () => satzAufgaben(stoff, anzahl, anzahl * 2 + 31),
    [stoff, anzahl]
  );
  const aufgabe = aufgaben.length > 0 ? aufgaben[position % aufgaben.length] : null;
  const [fehlt, setFehlt] = useState(false);

  const spiele = useCallback(async (): Promise<boolean> => {
    if (!aufgabe) return false;
    try {
      const request = { text: aufgabe.text, language: sprache, purpose: 'sentence' as const };
      if (!await hasPronunciationClip(request) && await isLanguageAvailable(sprache) === false) {
        return false;
      }
      await playPronunciationWithStatus(request);
      return true;
    } catch {
      return false;
    }
  }, [aufgabe, sprache]);

  useEffect(() => {
    if (!aufgabe) return;
    void spiele().then((played) => { if (!played) setFehlt(true); });
  }, [aufgabe, spiele]);

  if (!aufgabe || fehlt) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.emptySkip')}
      </ThemedText>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('mode.shadowing')}</ThemedText>
      <ThemedText type="subtitle">{aufgabe.text}</ThemedText>
      {sprache === 'th' && aufgabe.roman ? (
        <ThemedText type="small" themeColor="textSecondary">{aufgabe.roman}</ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.shadowNote')}
      </ThemedText>
      <ThemedButton label={t('dictation.play')} onPress={() => { void spiele().then((played) => { if (!played) setFehlt(true); }); }} />
      <ThemedButton label={t('common.next')} onPress={onDone} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tapTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  ratingWrap: {
    flexGrow: 1,
    flexBasis: 0,
  },
  ratingButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  options: {
    gap: Spacing.two,
  },
  feedback: {
    gap: Spacing.one,
  },
  optionWrap: {
    flexShrink: 1,
  },
  optionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.7,
  },
});
