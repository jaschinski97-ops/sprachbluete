import { levelLabelKey } from '@/lib/learning-stages';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  hasPronunciationClip,
  isLanguageAvailable,
  playPronunciationWithStatus,
  stopPronunciation,
} from '@/lib/audio';
import { localizedSituation, type ConversationSituation, type ConversationTurn } from '@/lib/conversation/types';
import { useLocale } from '@/lib/i18n';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { loadCardStatesForDirection, loadSituations } from '@/lib/repository';
import {
  lesestoffeFuerRichtung,
  tokenisiereFuerAntippen,
  verstaendnisFragen,
  type LeseStoff,
  type TextToken,
  type VerstaendnisFrage,
} from '@/lib/reading-texts';
import { activeVocabularyFor } from '@/data/active-vocabulary';

/**
 * Längere Hör- und Lesetexte (Schritt 4, Lern-Reiter-Ausbau): Die
 * vorhandenen Situationen als ganze Dialoge — Lesen mit Wörter-Antippen
 * (Bestandswörter zeigen beim Antippen ihre Bedeutung) und zeilenweisem
 * Vorlesen, am Ende Verständnisfragen, die mechanisch aus der Szene
 * abgeleitet sind.
 *
 * FREISCHALTUNG am Wortschatzstand (`lib/reading-texts`): Eine Szene öffnet,
 * wenn ihr eigener Bestands-Wortschatz im Kartenstand der Richtung begonnen
 * ist — gesperrte Szenen nennen ihren Stand, statt still zu fehlen. Kein
 * FSRS-Schreiben: Der Text übt das Lesen und Hören, die Karten laufen in
 * Karteikarte, Diktat und „Sag es auf …“.
 */
export function ReadingTextsRunner({
  direction,
  situationId,
  onExit,
}: {
  direction: PairDirection;
  situationId?: string;
  onExit: () => void;
}) {
  const { t, uiLanguage } = useLocale();
  const [stoff, setStoff] = useState<LeseStoff[] | null>(null);
  const [gewaehlt, setGewaehlt] = useState<ConversationSituation | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGewaehlt(null);
    void (async () => {
      try {
        const [situationen, cards] = await Promise.all([
          loadSituations(),
          loadCardStatesForDirection(direction),
        ]);
        if (cancelled) return;
        const all = lesestoffeFuerRichtung({
            direction,
            situationen: situationen.map(s => localizedSituation(s, uiLanguage)),
            pool: activeVocabularyFor(targetLanguageOf(direction)),
            cards,
            latin: targetLanguageOf(direction) !== 'th',
          });
        const selected = situationId ? all.filter((entry) => entry.situation.id === situationId).map(entry => ({ ...entry, offen: true })) : all;
        setStoff(selected);
        if (situationId && selected[0]) setGewaehlt(selected[0].situation);
      } catch {
        if (!cancelled) setStoff([]);
      }
    })();
    return () => {
      cancelled = true;
      void stopPronunciation();
    };
  }, [direction, uiLanguage, situationId]);

  if (stoff === null) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.assembling')}
      </ThemedText>
    );
  }

  if (gewaehlt) {
    return (
      <TextAnsicht
        situation={gewaehlt}
        onExit={() => {
          void stopPronunciation();
          if (situationId) onExit();
          else setGewaehlt(null);
        }}
        onBeenden={onExit}
      />
    );
  }

  if (stoff.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('mode.lesestoffe')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('conversation.noneForDirection')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  return (
    <>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('texts.pick')}
        </ThemedText>
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={t('drill.exit')}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('drill.exit')}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.szeneListe}>
        {stoff.slice(0, 40).map((eintrag) => (
          <Pressable
            key={eintrag.situation.id}
            disabled={!eintrag.offen}
            onPress={() => setGewaehlt(eintrag.situation)}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.cta', { direction: eintrag.situation.title })}
            style={({ pressed }) => [pressed && eintrag.offen && styles.pressed]}>
            <ThemedView
              type={eintrag.offen ? 'backgroundElement' : 'backgroundSelected'}
              style={styles.szeneZeile}>
              <ThemedText
                type="smallBold"
                style={eintrag.offen ? undefined : { opacity: 0.6 }}>
                {eintrag.situation.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {eintrag.offen
                  ? `${t(levelLabelKey(eintrag.situation.level))} · ${t('texts.knownOf', {
                      known: eintrag.bekannt,
                      total: eintrag.poolWoerter,
                    })}`
                  : t('texts.lockedBody', {
                      known: eintrag.gesamtBegonnen,
                      needed: eintrag.schwellwert,
                    })}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>
    </>
  );
}

/** Eine geöffnete Szene: Zeilen mit Antipp-Wörtern, Vorlesen, Fragen. */
function TextAnsicht({
  situation,
  onExit,
  onBeenden,
}: {
  situation: ConversationSituation;
  onExit: () => void;
  onBeenden: () => void;
}) {
  const { t, uiLanguage } = useLocale();
  const colors = useTheme();
  const sprache = targetLanguageOf(situation.direction);
  // Nur der Wortschatz der Lernsprache (sonst trifft ein deutscher Text auf
  // englische Einträge), Bedeutung in der App-Sprache wie die Zeilen selbst.
  const zeilenTokens = useMemo(() => {
    const pool = activeVocabularyFor(sprache);
    return situation.scriptTurns.map((zeile) =>
      tokenisiereFuerAntippen(zeile.thai, pool, sprache !== 'th', uiLanguage)
    );
  }, [situation, sprache, uiLanguage]);
  const [woerter, setWoerter] = useState<{ text: string; roman: string; german: string }[]>([]);
  const [uebersetzt, setUebersetzt] = useState<Set<number>>(new Set());
  const [fragenStufe, setFragenStufe] = useState<number | null>(null);

  const fragen = useMemo(() => verstaendnisFragen(situation, situation.title.length + 5), [situation]);

  const spiele = useCallback((zeile: ConversationTurn) => {
    void (async () => {
      try {
        const request = { text: zeile.thai, language: sprache, purpose: 'sentence' as const };
        if (!await hasPronunciationClip(request) && await isLanguageAvailable(sprache) === false) return;
        await playPronunciationWithStatus(request);
      } catch {
        // Ohne Ton bleibt der Text — Lesen funktioniert unabhängig.
      }
    })();
  }, [sprache]);

  const antippen = (token: TextToken) => {
    if (!token.entry) return;
    setWoerter((liste) => {
      const ohne = liste.filter((w) => w.text !== token.text);
      return [{ text: token.text, roman: token.entry!.roman, german: token.entry!.german }, ...ohne].slice(0, 3);
    });
  };

  const zeileUebersetzen = (i: number) => {
    setUebersetzt((alt) => {
      const neu = new Set(alt);
      if (neu.has(i)) neu.delete(i);
      else neu.add(i);
      return neu;
    });
  };

  // Fragen-Phase?
  if (fragenStufe !== null) {
    const frage = fragen[fragenStufe];
    if (!frage) {
      return (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{t('texts.done')}</ThemedText>
            <View style={styles.actions}>
              <ThemedButton label={t('roleplay.otherScene')} onPress={onExit} />
              <ThemedButton label={t('common.back')} onPress={onBeenden} />
            </View>
          </ThemedView>
        </>
      );
    }
    return <FrageAnsicht key={frage.id} showRoman={sprache === 'th'} frage={frage} weiter={() => setFragenStufe((v) => (v ?? 0) + 1)} />;
  }

  return (
    <>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {situation.title}
        </ThemedText>
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('common.back')}
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {situation.setting}
      </ThemedText>

      {situation.scriptTurns.map((zeile, i) => {
        const tokens = zeilenTokens[i];
        return (
          <ThemedView
            key={`${i}`}
            type={zeile.speaker === 'learner' ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.zeile}>
            <View style={styles.zeileKopf}>
              <ThemedText type="small" themeColor="textSecondary">
                {zeile.speaker === 'learner' ? t('conversation.you') : t('conversation.partner')}
              </ThemedText>
              <Pressable
                onPress={() => spiele(zeile)}
                accessibilityRole="button"
                accessibilityLabel={t('conversation.listenA11y', { text: zeile.thai })}
                style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                <ThemedText type="small" style={{ color: colors.accent }}>
                  {t('drill.playAgain')}
                </ThemedText>
              </Pressable>
            </View>
            {/* Der Text: tippbare Bestandswörter hervorgehoben. */}
            <View style={styles.textZeile}>
              {tokens.map((token, j) =>
                token.entry ? (
                  <Pressable
                    key={`${j}`}
                    onPress={() => antippen(token)}
                    accessibilityRole="button"
                    accessibilityLabel={`${token.text}: ${token.entry.german}`}
                    style={({ pressed }) => [pressed && styles.pressed]}>
                    <ThemedText
                      type="default"
                      style={[styles.tippbar, { color: colors.accent, borderColor: colors.accent }]}>
                      {token.text}
                    </ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText key={`${j}`} type="default">
                    {token.text}
                  </ThemedText>
                )
              )}
            </View>
            {sprache === 'th' ? <ThemedText type="small" themeColor="textSecondary">
              {zeile.roman}
            </ThemedText> : null}

            {woerter.filter((w) => zeile.thai.includes(w.text)).length > 0 ? (
              <View style={styles.wortKasten}>
                {woerter
                  .filter((w) => zeile.thai.includes(w.text))
                  .map((w) => (
                    <ThemedText key={w.text} type="small">
                      {w.text}{sprache === 'th' && w.roman ? ` · ${w.roman}` : ''} — {w.german}
                    </ThemedText>
                  ))}
              </View>
            ) : null}

            {uebersetzt.has(i) ? (
              <ThemedText type="small" themeColor="textSecondary">
                {zeile.german}
              </ThemedText>
            ) : (
              <Pressable
                onPress={() => zeileUebersetzen(i)}
                accessibilityRole="button"
                accessibilityLabel={t('texts.showTranslation')}
                style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('texts.showTranslation')}
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>
        );
      })}

      {situation.corrections.map((hint, index) => <ThemedView key={index} type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{hint.issue}</ThemedText>
        <ThemedText type="small">{hint.explanation}</ThemedText>
      </ThemedView>)}
      {fragen.length > 0 ? (
        <ThemedButton
          label={t('texts.questionsTitle')}
          onPress={() => {
            void stopPronunciation();
            setFragenStufe(0);
          }}
          variant="primary"
        />
      ) : null}
    </>
  );
}

function FrageAnsicht({ frage, weiter, showRoman }: { frage: VerstaendnisFrage; weiter: () => void; showRoman: boolean }) {
  const { t } = useLocale();
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);

  const optionenMitLabels: { label: string }[] =
    frage.art === 'sprecher'
      ? [{ label: t('conversation.you') }, { label: t('conversation.partner') }]
      : frage.optionen.map((label) => ({ label }));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {frage.art === 'bedeutung' ? t('texts.questionMeaning') : t('texts.questionSpeaker')}
      </ThemedText>
      <ThemedText type="subtitle" maxFontSizeMultiplier={2}>
        {frage.frage}
      </ThemedText>
      {showRoman && frage.frageRoman && frage.frageRoman !== frage.frage ? (
        <ThemedText type="small" themeColor="textSecondary">{frage.frageRoman}</ThemedText>
      ) : null}
      <View style={styles.options}>
        {optionenMitLabels.map((option, i) => (
          <Pressable
            key={`${option.label}:${i}`}
            onPress={() => {
              if (gewaehlt !== null) return;
              setGewaehlt(i);
            }}
            disabled={gewaehlt !== null}
            accessibilityRole="button"
            style={({ pressed }) => [pressed && styles.pressed]}>
            <ThemedView
              type={
                gewaehlt === null
                  ? 'backgroundSelected'
                  : i === frage.correctIndex
                    ? 'accent'
                    : 'backgroundSelected'
              }
              style={styles.optionButton}>
              <ThemedText
                type="small"
                themeColor={gewaehlt !== null && i === frage.correctIndex ? 'accentText' : 'text'}
                numberOfLines={2}>
                {option.label}
              </ThemedText>
              {showRoman && frage.optionenRoman?.[i] && frage.optionenRoman[i] !== option.label ? (
                <ThemedText type="small" themeColor="textSecondary">{frage.optionenRoman[i]}</ThemedText>
              ) : null}
            </ThemedView>
          </Pressable>
        ))}
      </View>
      {gewaehlt !== null ? (
        <>
          <ThemedText type="smallBold">
            {gewaehlt === frage.correctIndex ? t('sentence.correct') : t('drill.wrong')}
          </ThemedText>
          <ThemedButton label={t('common.next')} onPress={weiter} />
        </>
      ) : null}
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
  szeneListe: {
    gap: Spacing.two,
  },
  szeneZeile: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    minHeight: 44,
    justifyContent: 'center',
  },
  zeile: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  zeileKopf: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textZeile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  tippbar: {
    textDecorationLine: 'underline',
    borderWidth: 0,
    borderBottomWidth: 1,
  },
  wortKasten: {
    gap: Spacing.one,
    opacity: 0.9,
  },
  options: {
    gap: Spacing.two,
  },
  optionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
