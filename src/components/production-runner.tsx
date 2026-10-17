import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ENTER_PRUEFT } from './sentence-input';
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
import { type Rating } from '@/lib/fsrs/types';
import { TranslationKey, useLocale } from '@/lib/i18n';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { loadOrCreateCardState, rateCard } from '@/lib/repository';
import { recordDrill } from '@/lib/review-log';
import {
  bewertungFuerErgebnis,
  vergleicheProduktion,
  type ProduktionsErgebnis,
} from '@/lib/production/compare';
import {
  produktionsAufgaben,
  type ProduktionsAufgabe,
} from '@/lib/production/tasks';
import { ERKENNUNGS_FEHLER_KEYS, spracherkennung, type ErkennungsFehler } from '@/lib/speaking/recognition';

/**
 * „Sag es auf …“ (Schritt 3, Lern-Reiter-Ausbau): Die App zeigt die
 * Bedeutung, die lernende Person bildet die Form selbst — gesprochen oder
 * getippt.
 *
 * DREI WEGE ZUR ANTWORT:
 *   1. Sprechen mit Spracherkennung, WENN das Gerät sie hat (Web-Browser).
 *      Der erkannte Text läuft durch denselben toleranten Vergleich wie das
 *      Getippte.
 *   2. Tippen — tolerant geprüft: Groß-/Kleinschreibung und Satzzeichen
 *      zählen nicht, Akzente/Tonzeichen als Hinweis statt Fehler.
 *   3. Selbst bewerten nach der Musterlösung — wenn keine Erkennung zur
 *      Verfügung steht oder der eigene Weg der ehrlichere ist.
 *
 * DAS ERGEBNIS FLIESST IN DIE WIEDERHOLUNG EIN: dieselbe FSRS-Karte wie
 * Karteikarte und Diktat. Genau richtig → „Gut"; richtig mit Hinweis
 * (Akzent/Tonzeichen) → „Schwer"; falsch bewertet die lernende Person
 * selbst — „Nochmal" oder ohne Bewertung weiter.
 */

const SR_LOCALE: Record<'th' | 'en' | 'es' | 'de', string> = {
  th: 'th-TH',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
};

const SELBST_RATINGS: { rating: Rating; key: TranslationKey }[] = [
  { rating: 3, key: 'rating.good' },
  { rating: 2, key: 'rating.hard' },
  { rating: 1, key: 'rating.again' },
];

export function ProductionRunner({
  direction,
  onExit,
}: {
  direction: PairDirection;
  onExit: () => void;
}) {
  const { t, languageName } = useLocale();
  const colors = useTheme();
  const sprache = targetLanguageOf(direction);
  const naht = useMemo(() => spracherkennung(), []);

  const [aufgaben, setAufgaben] = useState<ProduktionsAufgabe[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [eingabe, setEingabe] = useState('');
  const [ergebnis, setErgebnis] = useState<ProduktionsErgebnis | null>(null);
  const [selbstOffen, setSelbstOffen] = useState(false);
  const [hoert, setHoert] = useState(false);
  const [erkennungsFehler, setErkennungsFehler] = useState<ErkennungsFehler | null>(null);
  const [falschBewertung, setFalschBewertung] = useState<Rating | null>(null);

  const laden = useCallback(() => {
    setAufgaben(null);
    setLoadError(null);
    setIndex(0);
    produktionsAufgaben({ direction })
      .then((aufgaben) => {
        setAufgaben(aufgaben.length > 0 ? aufgaben : []);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [direction]);

  useEffect(() => {
    laden();
    return () => void stopPronunciation();
  }, [laden]);

  const aufgabe = aufgaben && aufgaben.length > 0 ? aufgaben[index] : null;

  useEffect(() => {
    setEingabe('');
    setErgebnis(null);
    setSelbstOffen(false);
    setFalschBewertung(null);
  }, [index]);

  /** Schreibt die Karte mit der Bewertung fort — der Kern von „fließt ein“. */
  const schreiben = useCallback(
    async (rating: Rating) => {
      if (!aufgabe) return;
      try {
        const card = await loadOrCreateCardState(aufgabe.vocabId, direction);
        await rateCard(card, rating);
      } catch {
        // Ein fehlgeschlagenes Kartenschreiben darf die Runde nicht stoppen.
      }
      await recordDrill(rating !== 1, Date.now(), undefined, 'produktion', direction).catch(() => {});
    },
    [aufgabe, direction]
  );

  const pruefen = useCallback(
    (text: string) => {
      if (!aufgabe || text.trim().length === 0) return;
      const ergebnis = vergleicheProduktion(text, aufgabe.ziel, sprache);
      setErgebnis(ergebnis);
      const rating = bewertungFuerErgebnis(ergebnis.bewertung);
      if (rating) void schreiben(rating);
      else setFalschBewertung(null);
    },
    [aufgabe, sprache, schreiben]
  );

  const sprechenStarten = useCallback(() => {
    if (!naht.erkennen) return;
    setErkennungsFehler(null);
    void (async () => {
      const text = await naht.erkennen!({
        language: SR_LOCALE[sprache],
        onHoeren: setHoert,
        onFehler: setErkennungsFehler,
      });
      if (text) pruefen(text);
      else setHoert(false);
    })();
  }, [naht, sprache, pruefen]);

  /** Musterlösung abspielen — nach der Antwort oder für die Selbstbewertung. */
  const musterAbspielen = useCallback(() => {
    if (!aufgabe) return;
    void (async () => {
      try {
        const request = {
          text: aufgabe.ziel,
          language: sprache,
          purpose: 'vocabulary' as const,
        };
        if (!await hasPronunciationClip(request) && await isLanguageAvailable(sprache) === false) return;
        await playPronunciationWithStatus(request);
      } catch {
        // Ohne Ton bleibt die Lösung sichtbar.
      }
    })();
  }, [aufgabe, sprache]);

  const weiter = useCallback(() => {
    setErkennungsFehler(null);
    setIndex((value) => value + 1);
  }, []);

  if (loadError) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('production.loadFailedTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('cards.assembleFailed', { message: loadError })}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  if (!aufgabe) {
    if (aufgaben && aufgaben.length > 0 && index >= aufgaben.length) {
      return <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('production.done')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('production.doneNote')}</ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('drill.newRound')} onPress={laden} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>;
    }
    const leer = aufgaben !== null;
    return leer ? (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">
          {t('production.title', { language: languageName(sprache) })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('wordSpeaking.noneFor', { language: languageName(sprache) })}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    ) : (
      <ThemedText type="small" themeColor="textSecondary">
        {t('round.assembling')}
      </ThemedText>
    );
  }

  const kopf = (
    <View style={styles.headerRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('drill.questionProgress', { index: index + 1, total: Math.max(aufgaben?.length ?? 0, 1) })}
      </ThemedText>
      <Pressable
        onPress={() => {
          void stopPronunciation();
          onExit();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('drill.exit')}
        style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('drill.exit')}
        </ThemedText>
      </Pressable>
    </View>
  );

  return (
    <>
      {kopf}
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('production.prompt', { language: languageName(sprache) })}
        </ThemedText>
        {/* Die Bedeutung — groß, wie die Karten-Vorderseite. */}
        <ThemedText type="subtitle" maxFontSizeMultiplier={2}>
          {aufgabe.bedeutung}
        </ThemedText>

        {ergebnis === null && !selbstOffen ? (
          <>
            <TextInput
              value={eingabe}
              onChangeText={setEingabe}
              onSubmitEditing={() => { if (eingabe.trim()) pruefen(eingabe); }}
              {...ENTER_PRUEFT}
              multiline
              accessibilityLabel={t('production.inputA11y')}
              style={[styles.input, { color: colors.text, borderColor: colors.borderSubtle }]}
            />
            <View style={styles.actions}>
              {/* Leer prüfen tat nichts — der Knopf ist erst mit Eingabe aktiv (Testlauf 08.10.2026). */}
              <ThemedButton label={t('dictation.check')} disabled={!eingabe.trim()} onPress={() => pruefen(eingabe)} />
              {naht.verfuegbar ? (
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
            {erkennungsFehler ? (
              <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">
                {t(ERKENNUNGS_FEHLER_KEYS[erkennungsFehler])}
              </ThemedText>
            ) : null}
            {naht.verfuegbar ? (
              <ThemedText type="small" themeColor="textSecondary">{t('production.recognitionPrivacy')}</ThemedText>
            ) : null}
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
            <ThemedText type="subtitle">{ergebnis.ziel}</ThemedText>
            {aufgabe.roman && aufgabe.roman !== ergebnis.ziel ? (
              <ThemedText type="small" themeColor="textSecondary">
                {aufgabe.roman}
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                onPress={musterAbspielen}
                accessibilityRole="button"
                accessibilityLabel={t('answer.listenModel')}
                style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                <ThemedText type="small" style={{ color: colors.accent }}>
                  {t('answer.listenModel')}
                </ThemedText>
              </Pressable>
              {ergebnis.bewertung === 'wrong' && falschBewertung === null ? (
                SELBST_RATINGS.map(({ rating, key }) => (
                  <Pressable
                    key={rating}
                    onPress={() => {
                      setFalschBewertung(rating);
                      void schreiben(rating);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('rating.a11y', { label: t(key) })}
                    style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t(key)}
                    </ThemedText>
                  </Pressable>
                ))
              ) : null}
            </View>
            <ThemedButton label={t('common.next')} onPress={weiter} />
          </>
        ) : null}

        {selbstOffen && ergebnis === null ? (
          <>
            {/* Die Musterlösung steht VOR der Bewertung da — sonst bewertet
                man sich gegen etwas, das man nur gehört hat. */}
            <ThemedText type="subtitle">{aufgabe.ziel}</ThemedText>
            {aufgabe.roman && aufgabe.roman !== aufgabe.ziel ? (
              <ThemedText type="small" themeColor="textSecondary">
                {aufgabe.roman}
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                onPress={musterAbspielen}
                accessibilityRole="button"
                accessibilityLabel={t('answer.listenModel')}
                style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
                <ThemedText type="small" style={{ color: colors.accent }}>
                  {t('answer.listenModel')}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('production.selfRatingTitle')}
            </ThemedText>
            <View style={styles.actions}>
              {SELBST_RATINGS.map(({ rating, key }) => (
                <Pressable
                  key={rating}
                  onPress={() => {
                    // Die Lösung stand schon da; ein „✓ Genau richtig“ wäre
                    // hier erfunden — die Bewertung ist die eigene.
                    void schreiben(rating);
                    weiter();
                  }}
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
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {t('production.note')}
      </ThemedText>
    </>
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
  pressed: {
    opacity: 0.7,
  },
});
