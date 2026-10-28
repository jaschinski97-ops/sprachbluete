import { useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { ThemedButton } from '@/components/themed-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { findePronunciationClip } from '@/lib/audio';
import { useLocale } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/keys';
import { LEARNING_LANGUAGES } from '@/lib/languages/definitions';
import type { LanguageCode } from '@/lib/languages/types';
import { tonfolgeAusRoman } from '@/lib/content/roman-tone';
import { analyzeToneContour, type F0Frame } from '@/lib/speaking/analysis';
import { speichereAufnahme } from '@/lib/speaking/eigene-aufnahme';
import type { CapturedPcm } from '@/lib/speaking/microphone-capture';
import { spracherkennung, type Bereitschaft } from '@/lib/speaking/recognition';
import { vergleiche, type MelodieUrteil, type TempoUrteil, type TippArt, type VergleichsErgebnis } from '@/lib/speaking/vergleich';
import { kurveAusFrames, romanSilben, type Kurve, type SilbenSpannen } from '@/lib/speaking/vorbild-kurve';
import { vorbildKurve } from '@/lib/speaking/vorbild-kurven';
import { hoere, stoppeHoeren, type HoerArt } from '@/lib/speaking/wiedergabe';
import { pruefeWoerter, type WortBefund } from '@/lib/speaking/woerter-pruefen';

/**
 * Ergebnis einer Sprechaufnahme im Vergleich zum Vorbild (28.10.2026).
 *
 * Shadowing, Satz nachsprechen und die Heutige Runde zeigen nach der
 * Aufnahme dasselbe: drei Hörknöpfe (Vorbild, ich, im Wechsel), beide
 * Melodiekurven übereinander, EINEN Tipp zur auffälligsten Stelle, Melodie
 * und Tempo als Worte und — wo das Gerät offline erkennen kann — welche
 * Wörter erkannt wurden. Bewertet wird nichts in FSRS; das bleibt beim
 * Übungsablauf.
 */

const MELODIE_KEY: Record<MelodieUrteil, TranslationKey> = {
  'sehr-nah': 'vergleich.melodieSehrNah',
  nah: 'vergleich.melodieNah',
  abweichend: 'vergleich.melodieAbweichend',
};
const TEMPO_KEY: Record<TempoUrteil, TranslationKey> = {
  schneller: 'vergleich.tempoSchneller',
  passt: 'vergleich.tempoPasst',
  langsamer: 'vergleich.tempoLangsamer',
};
const TIPP_KEY: Record<TippArt, TranslationKey> = {
  'ton-falling': 'vergleich.tippTonFalling',
  'ton-rising': 'vergleich.tippTonRising',
  'ton-high': 'vergleich.tippTonHigh',
  'ton-low': 'vergleich.tippTonLow',
  'ton-mid': 'vergleich.tippTonMid',
  'frage-hoch': 'vergleich.tippFrageHoch',
  'ende-runter': 'vergleich.tippEndeRunter',
  'mehr-melodie': 'vergleich.tippMehrMelodie',
  stelle: 'vergleich.tippStelle',
};

type Vorbild = { kurve: Kurve; silben: SilbenSpannen | null } | 'ohne' | 'laedt';
type Woerter =
  | { art: 'aus' }
  | { art: 'laeuft' }
  | { art: 'fertig'; befunde: WortBefund[] }
  | { art: 'nichts' }
  | { art: 'sprache'; bereitschaft: Bereitschaft; laedt?: boolean };

export function AufnahmeVergleich({
  text,
  roman,
  sprache,
  aufnahme,
  frames,
  kompakt = false,
}: {
  text: string;
  roman?: string;
  sprache: LanguageCode;
  aufnahme: CapturedPcm;
  /** Fertige Messung der Aufnahme, falls der Runner sie schon hat. */
  frames?: F0Frame[];
  /** Heutige Runde: ohne Kurve, nur Hören und Wörter. */
  kompakt?: boolean;
}) {
  const { t, languageName } = useLocale();
  const theme = useTheme();
  const locale = LEARNING_LANGUAGES[sprache].speechLocale;

  // Eine Datei für Anhören und Worterkennung; beim nächsten Satz freigegeben.
  const datei = useMemo(() => {
    try {
      return speichereAufnahme(aufnahme);
    } catch {
      return null;
    }
  }, [aufnahme]);
  useEffect(() => () => datei?.freigeben(), [datei]);
  useEffect(() => () => void stoppeHoeren(), []);

  const eigeneKurve = useMemo(() => {
    try {
      return kurveAusFrames(frames ?? analyzeToneContour(aufnahme.samples, aufnahme.sampleRate).frames);
    } catch {
      return null;
    }
  }, [aufnahme, frames]);

  // Vorbild-Kurve über den Clip, den die Übung auch abspielt.
  const [vorbild, setVorbild] = useState<Vorbild>('laedt');
  useEffect(() => {
    if (kompakt) return;
    let aktuell = true;
    setVorbild('laedt');
    void (async () => {
      const clip = await Promise.resolve()
        .then(() => findePronunciationClip({ text, language: sprache, purpose: 'sentence' }))
        .catch(() => null);
      const eintrag = clip?.id ? await vorbildKurve(sprache, clip.id) : null;
      if (aktuell) setVorbild(eintrag ?? 'ohne');
    })();
    return () => {
      aktuell = false;
    };
  }, [text, sprache, kompakt]);

  const silbenRoman = useMemo(() => (sprache === 'th' && roman ? romanSilben(roman) : null), [sprache, roman]);
  const ergebnis: VergleichsErgebnis | null = useMemo(() => {
    if (typeof vorbild !== 'object' || !eigeneKurve) return null;
    const toene = silbenRoman ? tonfolgeAusRoman(silbenRoman.join(' ')) : null;
    const passend = vorbild.silben && toene && toene.length === vorbild.silben.length;
    return vergleiche(vorbild.kurve, eigeneKurve, passend ? { silben: vorbild.silben, toene } : {});
  }, [vorbild, eigeneKurve, silbenRoman]);

  // Wörter: nur mit Offline-Erkennung auf dem Gerät.
  const naht = useMemo(() => spracherkennung(), []);
  const [woerter, setWoerter] = useState<Woerter>({ art: naht.erkenneDatei ? 'laeuft' : 'aus' });
  const [nochmalErkennen, setNochmalErkennen] = useState(0);
  useEffect(() => {
    if (!naht.erkenneDatei || !naht.bereitschaft || !datei) return;
    let aktuell = true;
    void (async () => {
      const bereit = await naht.bereitschaft!(locale);
      if (!aktuell) return;
      if (bereit !== 'bereit') {
        setWoerter({ art: 'sprache', bereitschaft: bereit });
        return;
      }
      setWoerter({ art: 'laeuft' });
      const varianten = await naht.erkenneDatei!({ uri: datei.uri, language: locale, hinweise: [text] }).catch(() => null);
      if (!aktuell) return;
      setWoerter(varianten?.length ? { art: 'fertig', befunde: pruefeWoerter(text, varianten, sprache) } : { art: 'nichts' });
    })();
    return () => {
      aktuell = false;
    };
  }, [naht, datei, locale, text, sprache, nochmalErkennen]);

  const [spielt, setSpielt] = useState<HoerArt | null>(null);
  const hoeren = (art: HoerArt) => {
    setSpielt(art);
    void hoere(art, text, sprache, datei?.uri ?? null).finally(() => setSpielt((jetzt) => (jetzt === art ? null : jetzt)));
  };

  const spracheLaden = async () => {
    if (!naht.ladeSprache) return;
    setWoerter({ art: 'sprache', bereitschaft: 'laden-moeglich', laedt: true });
    await naht.ladeSprache(locale);
    setNochmalErkennen((n) => n + 1);
  };

  return (
    <View style={styles.wurzel}>
      <View style={styles.knopfReihe}>
        {(['vorbild', 'ich', 'wechsel'] as const).map((art) => (
          <Pressable
            key={art}
            onPress={() => hoeren(art)}
            disabled={art !== 'vorbild' && !datei}
            accessibilityRole="button"
            accessibilityState={{ selected: spielt === art, disabled: art !== 'vorbild' && !datei }}
            style={({ pressed }) => [
              styles.hoerKnopf,
              { borderColor: theme.cardBorder, backgroundColor: spielt === art ? theme.rateGoodBg : theme.glass },
              pressed && styles.gedrueckt,
            ]}>
            <ThemedText type="smallBold" style={{ color: spielt === art ? theme.rateGoodText : theme.text, textAlign: 'center' }}>
              {t(art === 'vorbild' ? 'vergleich.hoerenVorbild' : art === 'ich' ? 'vergleich.hoerenIch' : 'vergleich.hoerenWechsel')}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {!kompakt && vorbild === 'ohne' && (
        <ThemedText type="small" themeColor="textSecondary">{t('vergleich.ohneVorbild')}</ThemedText>
      )}
      {!kompakt && !eigeneKurve && vorbild !== 'laedt' && (
        <ThemedText type="small" themeColor="textSecondary">{t('vergleich.unpassendKurz')}</ThemedText>
      )}
      {!kompakt && ergebnis?.status === 'unpassend' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t(ergebnis.grund === 'zu-kurz' ? 'vergleich.unpassendKurz' : 'vergleich.unpassendLaenge')}
        </ThemedText>
      )}
      {!kompakt && ergebnis?.status === 'ok' && typeof vorbild === 'object' && (
        <>
          <Kurven
            vorbild={vorbild.kurve}
            ich={ergebnis.ichAngeglichen}
            stelle={ergebnis.stelle}
            silben={vorbild.silben}
            silbenRoman={silbenRoman}
            hervorheben={spielt}
          />
          <ThemedView style={[styles.tipp, { backgroundColor: theme.rateEasyBg }]}>
            <ThemedText type="small" style={{ color: theme.rateEasyText }}>
              {ergebnis.stelle
                ? t(TIPP_KEY[ergebnis.stelle.tipp], {
                    silbe: ergebnis.stelle.silbe !== undefined && silbenRoman ? silbenRoman[ergebnis.stelle.silbe] ?? '' : '',
                  })
                : t('vergleich.tippKeine')}
            </ThemedText>
          </ThemedView>
          <View style={styles.knopfReihe}>
            <Kennzahl titel={t('vergleich.melodie')} wert={t(MELODIE_KEY[ergebnis.melodie.urteil])} />
            <Kennzahl titel={t('vergleich.tempo')} wert={t(TEMPO_KEY[ergebnis.tempo.urteil])} />
          </View>
        </>
      )}

      {woerter.art !== 'aus' && (
        <View style={styles.woerter}>
          <ThemedText type="small" themeColor="textSecondary">{t('vergleich.woerter')}</ThemedText>
          {woerter.art === 'laeuft' && <ThemedText type="small">{t('vergleich.woerterLaeuft')}</ThemedText>}
          {woerter.art === 'nichts' && <ThemedText type="small">{t('vergleich.woerterNichts')}</ThemedText>}
          {woerter.art === 'sprache' && (
            <>
              <ThemedText type="small">{t('vergleich.spracheFehlt', { language: languageName(sprache) })}</ThemedText>
              {woerter.bereitschaft === 'laden-moeglich' &&
                (woerter.laedt ? (
                  <ThemedText type="small" themeColor="textSecondary">{t('vergleich.spracheLaedt')}</ThemedText>
                ) : (
                  <ThemedButton label={t('vergleich.spracheLaden')} onPress={() => void spracheLaden()} />
                ))}
            </>
          )}
          {woerter.art === 'fertig' && (
            <>
              <View style={styles.chips}>
                {woerter.befunde.map((befund, i) => (
                  <View
                    key={`${befund.wort}-${i}`}
                    accessible
                    accessibilityLabel={befund.erkannt ? befund.wort : t('vergleich.woerterUnsicher', { wort: befund.wort })}
                    style={[styles.chip, { backgroundColor: befund.erkannt ? theme.rateGoodBg : theme.rateEasyBg }]}>
                    <ThemedText type="small" style={{ color: befund.erkannt ? theme.rateGoodText : theme.rateEasyText }}>
                      {befund.erkannt ? befund.wort : `${befund.wort} ?`}
                    </ThemedText>
                  </View>
                ))}
              </View>
              <ThemedText type="small" themeColor="textSecondary">{t('vergleich.woerterHinweis')}</ThemedText>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Kennzahl({ titel, wert }: { titel: string; wert: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.kennzahl, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary">{titel}</ThemedText>
      <ThemedText type="smallBold">{wert}</ThemedText>
    </View>
  );
}

const HOEHE = 132;
const UNTEN = 22;

/** Pfad aus Werten; Lücken (null) unterbrechen die Linie. */
function pfad(werte: readonly (number | null)[], x: (i: number) => number, y: (w: number) => number): string {
  let d = '';
  let offen = false;
  werte.forEach((wert, i) => {
    if (wert === null) {
      offen = false;
      return;
    }
    d += `${offen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(wert).toFixed(1)} `;
    offen = true;
  });
  return d.trim();
}

function Kurven({
  vorbild,
  ich,
  stelle,
  silben,
  silbenRoman,
  hervorheben,
}: {
  vorbild: Kurve;
  ich: (number | null)[];
  stelle: { von: number; bis: number; silbe?: number } | null;
  silben: SilbenSpannen | null;
  silbenRoman: string[] | null;
  hervorheben: HoerArt | null;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const [breite, setBreite] = useState(300);
  const n = Math.max(2, vorbild.length);
  const alle = [...vorbild, ...ich].filter((w): w is number => w !== null);
  const oben = Math.max(4, ...alle);
  const unten = Math.min(-4, ...alle);
  const x = (i: number) => 6 + (i / (n - 1)) * (breite - 12);
  const y = (w: number) => 8 + ((oben - w) / (oben - unten)) * (HOEHE - UNTEN - 16);
  const zeigeSilben = silben && silbenRoman && silbenRoman.length === silben.length;
  const genugPlatz = zeigeSilben && breite / silben!.length >= 30;
  const vorbildAus = hervorheben === 'ich';
  const ichAus = hervorheben === 'vorbild';

  return (
    <View onLayout={(e: LayoutChangeEvent) => setBreite(Math.max(120, e.nativeEvent.layout.width))}>
      <Svg width="100%" height={HOEHE} accessibilityRole="image" accessibilityLabel={t('vergleich.kurveA11y')}>
        {stelle && (
          <Rect
            x={x(stelle.von) - 3}
            y={2}
            width={Math.max(8, x(stelle.bis) - x(stelle.von) + 6)}
            height={HOEHE - UNTEN}
            rx={6}
            fill={theme.rateEasyBg}
          />
        )}
        <Line x1={6} x2={breite - 6} y1={y(0)} y2={y(0)} stroke={theme.borderSubtle} strokeWidth={0.5} strokeDasharray="4 4" />
        <Path d={pfad(vorbild, x, y)} fill="none" stroke={theme.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={vorbildAus ? 0.3 : 1} />
        <Path d={pfad(ich, x, y)} fill="none" stroke={theme.link} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={ichAus ? 0.3 : 1} />
        {zeigeSilben &&
          silben!.map(([von, bis], i) =>
            genugPlatz || stelle?.silbe === i ? (
              <SvgText
                key={i}
                x={x((von + bis) / 2)}
                y={HOEHE - 6}
                fontSize={11}
                textAnchor="middle"
                fill={stelle?.silbe === i ? theme.rateEasyText : theme.textSecondary}>
                {silbenRoman![i]}
              </SvgText>
            ) : null
          )}
      </Svg>
      <View style={styles.legende}>
        <View style={[styles.strich, { backgroundColor: theme.accent }]} />
        <ThemedText type="small" themeColor="textSecondary">{t('vergleich.legendeVorbild')}</ThemedText>
        <View style={[styles.strich, { backgroundColor: theme.link, marginLeft: Spacing.three }]} />
        <ThemedText type="small" themeColor="textSecondary">{t('vergleich.legendeIch')}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wurzel: { gap: Spacing.two },
  knopfReihe: { flexDirection: 'row', gap: Spacing.two },
  hoerKnopf: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingHorizontal: Spacing.one },
  gedrueckt: { opacity: 0.7 },
  tipp: { borderRadius: Spacing.two, padding: Spacing.two },
  kennzahl: { flex: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: 2 },
  woerter: { gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  legende: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  strich: { width: 14, height: 3, borderRadius: 2 },
});
