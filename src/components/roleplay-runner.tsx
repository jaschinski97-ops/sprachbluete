import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

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
import { type Rating } from '@/lib/fsrs/types';
import { TranslationKey, useLocale } from '@/lib/i18n';
import { targetLanguageOf, type LanguageCode, type PairDirection } from '@/lib/languages/types';
import { loadSituations } from '@/lib/repository';
import {
  bewertungFuerErgebnis,
  vergleicheProduktion,
  type ProduktionsErgebnis,
} from '@/lib/production/compare';
import { spracherkennung, type ErkennungsNaht } from '@/lib/speaking/recognition';

/**
 * Rollenspiel aus den vorhandenen Situationen (Schritt 3, Lern-Reiter-Ausbau).
 *
 * DIE ROLLENVERTEILUNG: Die App spricht die Partnerrolle (Text + Ton), die
 * lernende Person übernimmt ihre eigenen Zeilen — angezeigt nur die deutsche
 * Bedeutung, produziert wird selbst: getippt (tolerant geprüft, wie in
 * „Sag es auf …"), gesprochen mit Erkennung, wenn das Gerät sie hat, oder
 * nach der Musterlösung selbst bewertet. Die Szenen stammen wörtlich aus
 * dem erzeugten Bestand (`loadSituations`), nichts wird neu geschrieben.
 *
 * KEIN FSRS: Das Rollenspiel ist Szenenübung, keine Kartenarbeit — die
 * Vokabelwiederholung läuft über Karteikarte, Diktat und „Sag es auf …“.
 * Die Zusammenfassung zählt nur die eigenen Zeilen.
 */

const SELBST_RATINGS: { rating: Rating; key: TranslationKey }[] = [
  { rating: 3, key: 'rating.good' },
  { rating: 2, key: 'rating.hard' },
  { rating: 1, key: 'rating.again' },
];

export function RoleplayRunner({
  direction,
  situationId,
  onExit,
}: {
  direction: PairDirection;
  situationId?: string;
  onExit: () => void;
}) {
  const { t, uiLanguage } = useLocale();
  const colors = useTheme();
  const sprache = targetLanguageOf(direction);
  const naht = useMemo(() => spracherkennung(), []);

  const [szenen, setSzenen] = useState<ConversationSituation[] | null>(null);
  const [szene, setSzene] = useState<ConversationSituation | null>(null);
  const [stufe, setStufe] = useState(0);
  const [eigene, setEigene] = useState(0);
  const [sichere, setSichere] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSzene(null);
    loadSituations()
      .then((alle) => {
        if (cancelled) return;
        const matching = alle.filter((s) => s.direction.endsWith(`_to_${sprache}`))
          .filter((s) => !situationId || s.id === situationId)
          .map((s) => localizedSituation(s, uiLanguage));
        setSzenen(matching);
        if (situationId) setSzene(matching[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setSzenen([]);
      });
    return () => {
      cancelled = true;
      void stopPronunciation();
    };
  }, [sprache, uiLanguage, situationId]);

  if (szenen === null) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.assembling')}
      </ThemedText>
    );
  }

  if (szenen.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('mode.rollenspiel')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('conversation.noneForDirection')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  if (!szene) {
    return (
      <>
        <View style={styles.headerRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('roleplay.pick')}
          </ThemedText>
          <Pressable
            onPress={() => {
              setSzene(szenen[Math.floor(Math.random() * szenen.length)]);
              setStufe(0);
              setEigene(0);
              setSichere(0);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('roleplay.random')}
            style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
            <ThemedText type="small" style={{ color: colors.accent }}>
              {t('roleplay.random')}
            </ThemedText>
          </Pressable>
        </View>
        {/* Verlassen auch hier: Die Szenenliste war der einzige Runner-Zweig
            ohne Rückweg (Nutzerbefund 21.09.2026). */}
        <View style={styles.actions}>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
        <View style={styles.szeneListe}>
          {szenen.slice(0, 40).map((situation) => (
            <Pressable
              key={situation.id}
              onPress={() => {
                setSzene(situation);
                setStufe(0);
                setEigene(0);
                setSichere(0);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.cta', { direction: situation.title })}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <ThemedView type="backgroundElement" style={styles.szeneZeile}>
                <ThemedText type="smallBold" style={styles.szeneTitel}>
                  {situation.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {situation.level} · {situation.setting}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      </>
    );
  }

  const zeile = szene.scriptTurns[stufe];

  if (!zeile) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('roleplay.done')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('roleplay.summary', { done: eigene, correct: sichere })}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton
            label={t('roleplay.otherScene')}
            onPress={() => {
              if (situationId) onExit();
              else setSzene(null);
              void stopPronunciation();
            }}
          />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {szene.title} · {t('roleplay.progress', { index: stufe + 1, total: szene.scriptTurns.length })} ·{' '}
        {t('roleplay.score', { done: eigene, correct: sichere })}
      </ThemedText>
      <SzeneZeile
        key={`${szene.id}:${stufe}`}
        zeile={zeile}
        sprache={sprache}
        erkenne={naht.erkennen}
        hatErkennung={naht.verfuegbar}
        onWeiter={(sicher2) => {
          if (zeile.speaker === 'learner') {
            setEigene((v) => v + 1);
            if (sicher2 !== null && sicher2 >= 2) setSichere((v) => v + 1);
          }
          setStufe((v) => v + 1);
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('roleplay.note')}
      </ThemedText>
      {/* Abbrechen mitten in der Szene — vorher gab es hier keinen Rückweg
          (Nutzerbefund 21.09.2026). */}
      <View style={styles.actions}>
        <ThemedButton label={t('common.back')} onPress={() => { void stopPronunciation(); onExit(); }} />
      </View>
    </>
  );
}

function SzeneZeile({
  zeile,
  sprache,
  erkenne,
  hatErkennung,
  onWeiter,
}: {
  zeile: ConversationTurn;
  sprache: LanguageCode;
  erkenne?: ErkennungsNaht['erkennen'];
  hatErkennung: boolean;
  onWeiter: (sicher: Rating | null) => void;
}) {
  const { t } = useLocale();
  const colors = useTheme();
  const anDerReihe = zeile.speaker === 'learner';
  const [eingabe, setEingabe] = useState('');
  const [ergebnis, setErgebnis] = useState<ProduktionsErgebnis | null>(null);
  const [selbstOffen, setSelbstOffen] = useState(false);
  const [hoert, setHoert] = useState(false);

  const spiele = useCallback(() => {
    void (async () => {
      try {
        const request = {
          text: zeile.thai,
          language: sprache,
          purpose: 'sentence' as const,
        };
        if (!await hasPronunciationClip(request) && await isLanguageAvailable(sprache) === false) {
          return;
        }
        await playPronunciationWithStatus(request);
      } catch {
        // Ohne Ton bleibt der Text sichtbar — die Szene läuft weiter.
      }
    })();
  }, [zeile.thai, sprache]);

  useEffect(() => {
    if (!anDerReihe) spiele();
  }, [anDerReihe, spiele]);

  const sprechenStarten = () => {
    if (!erkenne) return;
    void (async () => {
      const text = await erkenne({ language: { th: 'th-TH', en: 'en-US', es: 'es-ES', de: 'de-DE' }[sprache], onHoeren: setHoert });
      if (text) setErgebnis(vergleicheProduktion(text, zeile.thai, sprache));
      else setHoert(false);
    })();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {anDerReihe ? t('roleplay.yourTurn') : t('conversation.partner')}
      </ThemedText>
      {!anDerReihe ? (
        <>
          <ThemedText type="subtitle">{zeile.thai}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {zeile.roman} · {zeile.german}
          </ThemedText>
          <View style={styles.actions}>
            <Pressable
              onPress={spiele}
              accessibilityRole="button"
              accessibilityLabel={t('conversation.listenA11y', { text: zeile.thai })}
              style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
              <ThemedText type="small" style={{ color: colors.accent }}>
                {t('drill.playAgain')}
              </ThemedText>
            </Pressable>
            <ThemedButton label={t('common.next')} onPress={() => onWeiter(null)} />
          </View>
        </>
      ) : (
        <>
          <ThemedText type="subtitle" maxFontSizeMultiplier={2}>
            {zeile.german}
          </ThemedText>
          {ergebnis === null && !selbstOffen ? (
            <>
              <TextInput
                value={eingabe}
                onChangeText={setEingabe}
                multiline
                accessibilityLabel={t('production.inputA11y')}
                style={[styles.input, { color: colors.text, borderColor: colors.borderSubtle }]}
              />
              <View style={styles.actions}>
                <ThemedButton
                  label={t('dictation.check')}
                  onPress={() => setErgebnis(vergleicheProduktion(eingabe, zeile.thai, sprache))}
                />
                {hatErkennung ? (
                  <ThemedButton
                    label={hoert ? t('production.listening') : t('production.speakA11y')}
                    onPress={sprechenStarten}
                  />
                ) : null}
                <Pressable
                  onPress={() => setSelbstOffen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('production.selfRate')}
                  style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('production.selfRate')}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : null}
          {ergebnis !== null ? (
            <>
              <ThemedText type="smallBold">
                {ergebnis.bewertung === 'wrong'
                  ? t('drill.wrong')
                  : ergebnis.bewertung === 'accent'
                    ? t('production.accentHint', { target: ergebnis.ziel })
                    : t('drill.exact')}
              </ThemedText>
              <ThemedText type="subtitle">{zeile.thai}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {zeile.roman}
              </ThemedText>
              <ThemedButton
                label={t('common.next')}
                onPress={() => onWeiter(bewertungFuerErgebnis(ergebnis.bewertung))}
              />
            </>
          ) : null}
          {selbstOffen && ergebnis === null ? (
            <>
              <ThemedText type="subtitle">{zeile.thai}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {zeile.roman}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('production.selfRatingTitle')}
              </ThemedText>
              <View style={styles.actions}>
                {SELBST_RATINGS.map(({ rating, key }) => (
                  <Pressable
                    key={rating}
                    onPress={() => onWeiter(rating)}
                    accessibilityRole="button"
                    accessibilityLabel={t('rating.a11y', { label: t(key) })}
                    style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t(key)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
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
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 48,
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
  szeneTitel: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
