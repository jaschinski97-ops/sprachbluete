import { LEARNING_STAGES, levelLabelKey, levelPartKey, STAGE_KEYS, stageForLevel, type LearningStage } from '@/lib/learning-stages';
import { LearningStagePicker } from '@/components/learning-stage-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientFill, Reveal } from '@/components/fx';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { ThemedButton } from '@/components/themed-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCatalogLanguages, useCatalogRevision } from '@/hooks/use-catalog-languages';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import { PlaybackKind, playPronunciation } from '@/lib/audio';
import {
  spokenText,
  situationTranslation,
  ConversationSituation,
  situationSprachenFuerBruecke,
  Situationssprache,
  TopicId,
} from '@/lib/conversation/types';
import { loadSituations } from '@/lib/repository';
import { useLearnerLanguage } from '@/hooks/use-learner-language';
import { setConversationDirection } from '@/lib/profile';
import { TranslationKey, useLocale } from '@/lib/i18n';

/** Gesprächsthemen als Übersetzungsschlüssel statt als deutsche Konstante. */
/** Ein Symbol je Gesprächsthema (22.10.2026) — im Verlaufs-Abzeichen der Themenkarte. */
const TOPIC_ICONS: Record<ConversationSituation['topic'], React.ComponentProps<typeof Ionicons>['name']> = {
  greeting: 'hand-left',
  appointments: 'calendar',
  home: 'home',
  market: 'basket',
  restaurant: 'restaurant',
  leisure: 'musical-notes',
  travel: 'airplane',
  health: 'medkit',
  work: 'briefcase',
  services: 'construct',
  opinion: 'chatbubble-ellipses',
  society: 'people',
};

const TOPIC_KEYS: Record<ConversationSituation['topic'], TranslationKey> = {
  greeting: 'topic.greeting',
  appointments: 'topic.appointments',
  home: 'topic.home',
  market: 'topic.market',
  restaurant: 'topic.restaurant',
  leisure: 'topic.leisure',
  travel: 'topic.travel',
  health: 'topic.health',
  work: 'topic.work',
  services: 'topic.services',
  opinion: 'topic.opinion',
  society: 'topic.society',
};

export default function ConversationScreen() {
  const { t, languageName, uiLanguage } = useLocale();
  const theme = useTheme();
  // Mit dem Katalogstand, aus dem die Liste kam (Katalog je Lernsprache).
  const [geladen, setGeladen] = useState<{ revision: number; list: ConversationSituation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Der Reiter listet Sprachen, keine Richtungen (14.09.): Jeder Eintrag
  // öffnet die Menge, in der diese Sprache die Dialogseite ist. Vorgabe ist
  // der Stoff, den man gerade lernt; die Wahl merkt sich im Profil — im
  // selben conversation-Spot wie vorher, nur sprachbenannt statt als zweite
  // Button-Reihe unterhalb.
  const { language, profile } = useLearnerLanguage();
  const [gewaehlt, setGewaehlt] = useState<Situationssprache | null>(null);
  // Wie im Lern-Reiter: Der zuletzt geöffnete Eintrag bleibt offen. Der Spot
  // trägt eine Richtung; gehört sie zu einem Eintrag der Liste, übernimmt
  // der Reiter ihn.
  const sprachen = useMemo(() => situationSprachenFuerBruecke(uiLanguage), [uiLanguage]);
  const lernsprache = profile?.review?.direction.endsWith('_to_de') ? 'de' : language;
  const gemerkt = profile?.conversation ?? null;
  const gemerkterEintrag = gemerkt
    ? sprachen.find((eintrag) => eintrag.direction === gemerkt)
    : undefined;
  const eintrag =
    (gewaehlt && sprachen.find((e) => e.sprache === gewaehlt)) ??
    gemerkterEintrag ??
    sprachen.find((e) => e.sprache === lernsprache) ??
    sprachen[0];
  const sprache = eintrag.sprache;
  const direction = eintrag.direction;
  const waehlen = (code: Situationssprache) => {
    const eintrag = sprachen.find((e) => e.sprache === code);
    if (!eintrag) return;
    setGewaehlt(code);
    // Feuer-und-vergessen ist hier gewollt, aber ein Speicherfehler darf
    // keine unbehandelte Promise-Rejection werden.
    void setConversationDirection(eintrag.direction).catch(() => {});
  };
  const [openId, setOpenId] = useState<string | null>(null);
  // WHY einklappbar: Je Richtung liegen ~243 Situationen an — die volle Liste
  // war eine Scrollwüste. Standard ist deshalb JEDES Thema zugeklappt; der
  // Kopf öffnet nur die Liste seines Themas. `openId` bleibt vom Zuklappen
  // unberührt: Eine offene Karte steht beim Wiederöffnen noch offen.
  const [offeneThemen, setOffeneThemen] = useState<ReadonlySet<TopicId>>(new Set());
  const toggleThema = (topic: TopicId) =>
    setOffeneThemen((vorher) => {
      const folge = new Set(vorher);
      if (folge.has(topic)) folge.delete(topic);
      else folge.add(topic);
      return folge;
    });

  // Katalog je Lernsprache (E3): Der Reiter behält seine eigene Sprachwahl
  // und hält deren Sprachdatei geladen — neben der Lernsprache der Karten.
  // Mit den Clip-Einträgen kommen Wiedergabe und Thai-Ton-Gate wie bisher.
  // Erst mit gelesenem Profil, sonst lüde die Vorgabe Thai kurz mit.
  const katalog = useCatalogLanguages(profile ? [sprache] : []);
  const revision = useCatalogRevision();
  useEffect(() => {
    if (!profile || !katalog.ready) return;
    let cancelled = false;
    loadSituations()
      .then((all) => {
        if (!cancelled) setGeladen({ revision, list: all });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [profile, katalog.ready, revision]);
  const situations = geladen?.list ?? null;
  const laedt = !profile || !katalog.ready || geladen?.revision !== revision;

  const imRichtung = useMemo(
    () => (situations ?? []).filter((s) => s.direction === direction),
    [situations, direction]
  );
  // Anfänger · Fortgeschritten · Profi (Nutzerwunsch 04.10.2026).
  const [stage, setStage] = useState<LearningStage>('beginner');
  const stageCounts = useMemo(
    () => Object.fromEntries(LEARNING_STAGES.map((value) => [
      value, imRichtung.filter((s) => stageForLevel(s.level) === value).length,
    ])) as Record<LearningStage, number>,
    [imRichtung]
  );
  const visible = useMemo(
    () => imRichtung.filter((s) => stageForLevel(s.level) === stage),
    [imRichtung, stage]
  );

  // Gleiche Titel sind beabsichtigte Dialogvarianten (gleiche Situation,
  // andere Gesprächsführung) — ohne Kennzeichnung wirken sie wie Duplikate.
  // Anzeige-Reihenfolge entscheidet: der erste bleibt ohne Anhang.
  const variantSuffix = useMemo(() => {
    const counts = new Map<string, number>();
    const suffix = new Map<string, string>();
    for (const situation of visible) {
      // Gleicher Titel auf Einstieg und Aufbau ist keine Variante.
      const key = `${situation.title}|${situation.level}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      suffix.set(situation.id, count === 1 ? '' : t('conversation.variant', { count }));
    }
    return suffix;
  }, [visible, t]);

  // WHY: Das Thema steht einmal am Abschnittslabel, nicht zehnmal in der
  // Liste. Zusammenziehen ohne Umsortieren — die Themen erscheinen in der
  // Reihenfolge ihres ersten Auftretens, innerhalb eines Themas bleibt die
  // Anzeige-Reihenfolge des Arrays unverändert.
  const groups = useMemo(() => {
    const nachThema = new Map<TopicId, ConversationSituation[]>();
    for (const situation of visible) {
      const liste = nachThema.get(situation.topic);
      if (liste) liste.push(situation);
      else nachThema.set(situation.topic, [situation]);
    }
    return [...nachThema.entries()];
  }, [visible]);

  if (error) {
    return (
      <ScreenScaffold title={t('tabs.conversation')} subtitle={t('conversation.subtitle')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.loadFailed', { message: error })}
        </ThemedText>
      </ScreenScaffold>
    );
  }

  if (!situations && !katalog.error) {
    return (
      <ScreenScaffold title={t('tabs.conversation')} subtitle={t('conversation.subtitle')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('conversation.loading')}
        </ThemedText>
      </ScreenScaffold>
    );
  }

  // Eine Sprache ohne eigene Situationen (heute Englisch/Spanisch) zeigt
  // ihren ehrlichen Leerzustand; sonst zählen die Untertitel den Bestand.
  const subtitle =
    imRichtung.length === 0
      ? t('conversation.subtitleLanguage', { language: languageName(sprache) })
      : t('conversation.subtitleCount', { count: imRichtung.length });

  return (
    <ScreenScaffold title={t('tabs.conversation')} subtitle={subtitle}>
      {/* Die Sprachliste des Reiters (14.09.): Deutsch als eigene Sprache
          oben — die Richtung steckt im Eintrag, es gibt keine zweite Reihe
          von Sprach-Buttons mehr. */}
      <View
        style={styles.row}
        role="radiogroup"
        accessibilityLabel={t('common.switchLanguageA11y')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.languageLabel')}
        </ThemedText>
        {sprachen.map(({ sprache: code }) => {
          const aktiv = code === sprache;
          return (
            <Pressable
              key={code}
              onPress={() => waehlen(code)}
              accessibilityRole="radio"
              accessibilityLabel={t('common.learnGoal', { language: languageName(code) })}
              aria-checked={aktiv}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={aktiv ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.chip}>
                <ThemedText type="small" themeColor={aktiv ? 'text' : 'textSecondary'}>
                  {languageName(code)}
                </ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}
      </View>
      {/* Die Gegenseite der Dialoge ist keine Wahl, sondern die App-Sprache —
          solange Bedeutungen nur auf Deutsch erzeugt sind, steht das hier. */}
      <ThemedText type="small" themeColor="textSecondary">
        {t('conversation.meaningLanguage', { language: languageName(imRichtung.every(s => s.translations?.[uiLanguage]) ? uiLanguage : 'de') })}
      </ThemedText>

      {katalog.error ? (
        <View style={styles.failed}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('catalog.loadFailed')}
          </ThemedText>
          <ThemedButton label={t('common.retry')} onPress={katalog.retry} />
        </View>
      ) : laedt ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('catalog.loading')}
        </ThemedText>
      ) : imRichtung.length > 0 ? (
        <LearningStagePicker value={stage} counts={stageCounts} onChange={setStage} />
      ) : null}

      {laedt || katalog.error ? null : imRichtung.length > 0 && visible.length === 0 ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('conversation.stageEmpty', { stage: t(STAGE_KEYS[stage]) })}
          </ThemedText>
        </ThemedView>
      ) : imRichtung.length === 0 ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">
            {t('conversation.noneFor', { language: languageName(sprache) })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('conversation.noneForBody', { language: languageName(sprache) })}
          </ThemedText>
        </ThemedView>
      ) : (
        groups.map(([topic, gruppe], gruppenIndex) => {
          const offen = offeneThemen.has(topic);
          return (
            <Reveal key={topic} index={gruppenIndex} style={styles.topicGroup}>
              <Pressable
                onPress={() => toggleThema(topic)}
                accessibilityRole="button"
                accessibilityState={{ expanded: offen }}
                accessibilityLabel={`${t(TOPIC_KEYS[topic])}, ${t(
                  gruppe.length === 1 ? 'conversation.topicCountOne' : 'conversation.topicCount',
                  { count: gruppe.length }
                )}`}
                style={({ pressed }) => pressed && styles.pressed}>
                {/* Seit 22.10.2026 eine Glas-Karte mit Themen-Symbol. */}
                <ThemedView type="backgroundElement" style={[styles.topicHead, offen && { borderColor: theme.gradientStart }]}>
                  <View style={styles.topicIcon}>
                    <GradientFill radius={12} />
                    <Ionicons name={TOPIC_ICONS[topic] ?? 'chatbubbles'} size={20} color={theme.gradientText} />
                  </View>
                  <ThemedText type="smallBold" style={styles.topicTitle}>
                    {t(TOPIC_KEYS[topic])}
                  </ThemedText>
                  <View style={styles.topicMeta}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t(gruppe.length === 1 ? 'conversation.topicCountOne' : 'conversation.topicCount', { count: gruppe.length })}
                    </ThemedText>
                    <Ionicons name={offen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
                  </View>
                </ThemedView>
              </Pressable>
              {offen
                ? gruppe.map((situation) => (
                    <SituationCard
                      key={situation.id}
                      situation={situation}
                      variantSuffix={variantSuffix.get(situation.id) ?? ''}
                      // Deutsch-Eintrag: die deutschen Zeilen klingen und
                      // sind die Übungsseite. Sonst die Dialogsprache —
                      // heute nur Thai, weitere folgen mit ihrem Grundstoff.
                      sprechSprache={sprache}
                      open={openId === situation.id}
                      onToggle={() => setOpenId(openId === situation.id ? null : situation.id)}
                    />
                  ))
                : null}
            </Reveal>
          );
        })
      )}
    </ScreenScaffold>
  );
}

function SituationCard({
  situation,
  variantSuffix,
  sprechSprache,
  open,
  onToggle,
}: {
  situation: ConversationSituation;
  variantSuffix: string;
  /** Welche Zeilen-Seite gesprochen wird: beim Deutsch-Eintrag die deutschen
      Zeilen (Gerätestimme), sonst die Dialogsprache — heute Thai, mit Clip
      (Nutzerentscheidung 10.09., sprachbenannt seit 14.09.). */
  sprechSprache: Situationssprache;
  open: boolean;
  onToggle: () => void;
}) {
  const toneColor = useToneColor();
  const { t, uiLanguage } = useLocale();
  const translated = situationTranslation(situation, uiLanguage);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="smallBold">{translated.title}</ThemedText>
            {/* WHY: Das Thema steht einmal am Abschnittslabel — die Karte
                trägt nur noch Stufe und Varianten-Anhang. */}
            <ThemedText type="small" themeColor="textSecondary">
              {t(levelLabelKey(situation.level))} · {t(levelPartKey(situation.level))}
              {variantSuffix}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {open ? '▲' : '▼'}
          </ThemedText>
        </View>
      </Pressable>

      {open ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {translated.setting}
          </ThemedText>

          {situation.scriptTurns.map((turn, index) => (
            <View
              key={index}
              style={[
                styles.turn,
                turn.speaker === 'learner' && { borderLeftColor: toneColor('mid') },
              ]}>
              <View style={styles.turnHeader}>
                <ThemedText type="small" themeColor="textSecondary">
                  {turn.speaker === 'learner' ? t('conversation.you') : t('conversation.partner')}
                </ThemedText>
                <TurnSpeakButton
                  text={spokenText(situation, turn)}
                  sprechSprache={sprechSprache}
                />
              </View>
              <ThemedText>{spokenText(situation, turn)}</ThemedText>
              {sprechSprache === 'th' ? <ThemedText type="small" themeColor="textSecondary">
                {turn.roman}
              </ThemedText> : null}
              <ThemedText type="small">{translated.turns[index]}</ThemedText>
            </View>
          ))}

          <ThemedView type="backgroundSelected" style={styles.corrections}>
            <ThemedText type="smallBold">{t('conversation.mistakesTitle')}</ThemedText>
            {translated.corrections.map((hint, index) => (
              <View key={index}>
                <ThemedText type="small">{hint.issue}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {hint.explanation}
                </ThemedText>
              </View>
            ))}
          </ThemedView>

        </>
      ) : null}
    </ThemedView>
  );
}

/**
 * Vorlesetaste eines Zugs. Seit Phase 11 kann dahinter ein Clip stecken
 * (`lib/clips`, gefunden ueber Text und Sprache - deshalb ohne ID). Spielt
 * einer, steht „KI-Stimme" daneben: eine synthetische Aufnahme, keine
 * Muttersprachler-Aufnahme (Pflicht 4).
 */
function TurnSpeakButton({ text, sprechSprache }: { text: string; sprechSprache: Situationssprache }) {
  const [played, setPlayed] = useState<PlaybackKind | null>(null);
  const { t } = useLocale();
  // WHY Icon statt Emoji: Das 🔊-Schriftzeichen sieht je Plattform anders aus
  // und ließ sich nicht über das Theme tönen; das Icon folgt textSecondary.
  const theme = useTheme();
  return (
    <View style={styles.turnSpeak}>
      {played === 'asset' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('conversation.aiVoice')}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={() => {
          // purpose 'sentence': Gesprächszüge sind Satzmaterial — die
          // Auslieferungs-Politik gestattet ungeprüfte Thai-Clips für Vokabel-
          // und Satzzwecke (audio-policy). Ohne Purpose liefe hier fast jeder
          // Zug auf System-TTS statt auf den erzeugten Clip. Die Sprache
          // folgt dem Eintrag: Bei „Deutsch“ klingt die deutsche Zeile
          // (Gerätestimme), sonst die Thai-Zeile mit Clip.
          playPronunciation({ text, language: sprechSprache, purpose: 'sentence' })
            .then(setPlayed)
            .catch(() => {});
        }}
        accessibilityRole="button"
        accessibilityLabel={`${t('conversation.listenA11y', { text })}${
          played === 'asset' ? t('conversation.syntheticNote') : ''
        }`}
        style={({ pressed }) => pressed && styles.pressed}
        hitSlop={12}>
        <Ionicons
          name="volume-medium-outline"
          size={17}
          color={theme.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  failed: {
    gap: Spacing.two,
  },
  turnSpeak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  topicGroup: {
    // Kopf sitzt nah an seiner Gruppe; der Abstand nach oben liefert der
    // Spalten-Gap des Scaffolds — wie das Abschnittslabel im Mockup.
    gap: Spacing.two,
  },
  topicHead: {
    // Der Themenkopf ist ein Knopf wie jede Karte: volle 44 Punkte
    // Trefferfläche, der Inneninhalt sitzt zentriert darin.
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 18,
  },
  topicTitle: {
    flex: 1,
  },
  topicIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    // Richtungswahl wie überall: mindestens 44 Punkte Trefferfläche
    // (war ~36 und damit das kleinste Ziel im Gesprächs-Tab).
    minHeight: 44,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerText: {
    flexShrink: 1,
  },
  turn: {
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    paddingLeft: Spacing.two,
    gap: 2,
  },
  turnLearner: {
    // Die eigenen Zeilen sind die zu uebenden - sie bekommen die Markierung.
    // Die Farbe kommt zur Laufzeit aus dem Anzeigemodus (AE-24).
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  corrections: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
