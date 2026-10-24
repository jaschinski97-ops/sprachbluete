import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedButton } from '@/components/themed-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { type Tone, TONE_KEYS } from '@/constants/tones';
import { GEMINI_VOICES, KALIBRIER_STIMMEN_VORSCHLAG, MAX_KALIBRIER_STIMMEN } from '@/data/tts-voices';
import { KALIBRIER_WOERTER } from '@/data/tone-calibration-words';
import { useTheme } from '@/hooks/use-theme';
import { loadApiKey } from '@/lib/api-key';
import { createClipGenerationClient } from '@/lib/clips/generator';
import type { KalibrierBericht, StimmBericht } from '@/lib/content/tone-calibration';
import { Drossel, gedrosselt } from '@/lib/generation/drossel';
import { PROVIDER_INFO } from '@/lib/providers/types';

import { studioRequest } from './content-client';
import { fahreKalibrierung, type KalibrierAblage } from './tone-calibration-run';

/**
 * Studio-Karte „Thai-Töne kalibrieren“ (24.10.2026): 1–3 Gemini-Stimmen
 * sprechen den festen Kalibriersatz, der Helper misst mit dem Ton-Gate und
 * empfiehlt eine Stimme. Clips gehen nicht in den Katalog.
 */

const TON_NAME: Record<Tone, string> = { mid: 'mittel', low: 'tief', falling: 'fallend', high: 'hoch', rising: 'steigend' };

const helperAblage: KalibrierAblage = {
  async start(voice, model, instructionsId) {
    await studioRequest('/tone-calibration/start', { voice, model, ...(instructionsId ? { instructionsId } : {}) });
  },
  async clip(voice, wort, clip) {
    await studioRequest('/tone-calibration/clip', {
      voice, wordId: wort.id, base64: clip.base64, format: clip.format, model: clip.model,
      ...(clip.instructionsId ? { instructionsId: clip.instructionsId } : {}),
    });
  },
};

/** Zeilen je Stimme — rein, damit sie testbar sind. */
export function stimmZeilen(stimme: StimmBericht): string[] {
  const g = stimme.gesamt;
  const lage = stimme.stimmlage
    ? `Stimmlage: Median ${stimme.stimmlage.medianHz} Hz, ${stimme.stimmlage.p10Hz}–${stimme.stimmlage.p90Hz} Hz (${stimme.stimmlage.spannweiteHalbtoene} Halbtöne)`
    : 'Stimmlage: nicht messbar';
  const trenn = (wert: number | null) => (wert === null ? '–' : wert.toFixed(2).replace('.', ','));
  return [
    `${g.bestanden}/${g.n} bestanden · ${g.verworfen} verworfen · ${g.ungeprueft} ungeprüft${g.fehlt ? ` · ${g.fehlt} fehlen` : ''}`,
    ...TONE_KEYS.map((ton) => {
      const z = stimme.jeTon[ton];
      return `${TON_NAME[ton]}: ${z.bestanden}/${z.n} bestanden, ${z.verworfen} verworfen, ${z.ungeprueft} ungeprüft`;
    }),
    `Mehrsilber: ${stimme.mehrsilber.bestanden}/${stimme.mehrsilber.n} bestanden, ${stimme.mehrsilber.verworfen} verworfen`,
    lage,
    `Trennschärfe tief < mittel ${trenn(stimme.trennung.tiefUnterMittel)}, fallend ≠ mittel ${trenn(stimme.trennung.fallendGegenMittel)} (0,5 = Zufall, 1 = sauber)`,
    ...stimme.hinweise.map((hinweis) => `⚠ ${hinweis}`),
  ];
}

type Props = { blocked?: boolean; onRunningChange?: (running: boolean) => void };

export function ToneCalibrationCard({ blocked = false, onRunningChange }: Props) {
  const theme = useTheme();
  const [stimmen, setStimmen] = useState<string[]>([...KALIBRIER_STIMMEN_VORSCHLAG]);
  const [model, setModel] = useState(PROVIDER_INFO.gemini.modelPlaceholder.audio);
  const [running, setRunning] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [bericht, setBericht] = useState<KalibrierBericht | null>(null);
  const abbrechen = useRef(false);

  useEffect(() => {
    studioRequest<{ report: KalibrierBericht | null }>('/tone-calibration')
      .then((stand) => setBericht(stand.report))
      .catch(() => { /* Helper aus: die Karte bleibt bedienbar, der Start meldet es. */ });
  }, []);

  const laeuft = (wert: boolean) => { setRunning(wert); onRunningChange?.(wert); };

  const umschalten = (name: string) => setStimmen((alt) =>
    alt.includes(name) ? alt.filter((s) => s !== name) : alt.length >= MAX_KALIBRIER_STIMMEN ? alt : [...alt, name]);

  const messen = useCallback(async () => {
    setMeldung('Ton-Gate misst die Kalibrierclips …');
    const neu = await studioRequest<KalibrierBericht>('/tone-calibration/report', {});
    setBericht(neu);
    setMeldung(neu.empfehlung.text);
  }, []);

  const starten = useCallback(async () => {
    const apiKey = await loadApiKey('gemini');
    if (!apiKey) { setMeldung('Kein Gemini-Schlüssel — unter „Anbieter & Schlüssel“ eintragen.'); return; }
    abbrechen.current = false;
    laeuft(true);
    try {
      const drossel = new Drossel({ max: 4 });
      const ergebnis = await fahreKalibrierung({
        voices: stimmen,
        model: model.trim(),
        makeClient: (voice) => gedrosselt(createClipGenerationClient('gemini', apiKey, model.trim(), voice), drossel),
        ablage: helperAblage,
        parallel: 4,
        shouldCancel: () => abbrechen.current,
        onProgress: ({ voice, fertig, gesamt, fehler }) =>
          setMeldung(`${voice}: ${fertig}/${gesamt} Wörter${fehler ? `, ${fehler} fehlgeschlagen` : ''}`),
      });
      if (ergebnis.abgebrochen.length) {
        setMeldung(`Abgebrochen bei ${ergebnis.abgebrochen.join(', ')}: ${ergebnis.fehler[0]?.message ?? 'Fehler'}`);
      }
      await messen();
    } catch (error) {
      setMeldung(error instanceof Error ? error.message : String(error));
    } finally {
      laeuft(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stimmen, model, messen]);

  const gesperrt = running || blocked;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Thai-Töne kalibrieren (vor dem großen Lauf)</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {`Bis zu ${MAX_KALIBRIER_STIMMEN} Gemini-Stimmen sprechen ${KALIBRIER_WOERTER.length} feste Thai-Wörter (alle fünf Töne, Minimalpaare, Mehrsilber). Das Ton-Gate misst jeden Clip; danach steht hier die Empfehlung für den großen Lauf. Die Clips bleiben lokal unter _Local/tone-calibration/ und kommen nicht in den Katalog.`}
      </ThemedText>
      <View style={styles.zeile}>
        {GEMINI_VOICES.map((voice) => {
          const an = stimmen.includes(voice.name);
          return (
            <Pressable
              key={voice.name}
              accessibilityRole="button"
              accessibilityLabel={`Stimme ${voice.name}`}
              accessibilityState={{ selected: an }}
              disabled={gesperrt}
              onPress={() => umschalten(voice.name)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed, an && { borderColor: theme.accent }]}>
              <ThemedText type="small" themeColor={an ? 'text' : 'textSecondary'}>
                {`${voice.name}${voice.style ? ` · ${voice.style}` : ''}`}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={model}
        onChangeText={setModel}
        editable={!gesperrt}
        autoCapitalize="none"
        accessibilityLabel="Gemini-Sprachmodell"
        style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
      />
      <View style={styles.zeile}>
        <ThemedButton
          variant="primary"
          label={`Kalibrierlauf starten (${stimmen.length} ${stimmen.length === 1 ? 'Stimme' : 'Stimmen'})`}
          disabled={gesperrt || stimmen.length === 0 || !model.trim()}
          onPress={() => { void starten(); }}
        />
        {running ? <ThemedButton label="Abbrechen" onPress={() => { abbrechen.current = true; }} /> : null}
        <ThemedButton label="Bericht neu messen" disabled={gesperrt} onPress={() => { void messen().catch((e: Error) => setMeldung(e.message)); }} />
      </View>
      {meldung ? <ThemedText accessibilityLiveRegion="polite" type="small">{meldung}</ThemedText> : null}
      {bericht ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">{bericht.empfehlung.text}</ThemedText>
          {bericht.stimmen.map((stimme) => (
            <View key={stimme.stimme} style={{ gap: 2 }}>
              <ThemedText type="small">{`${stimme.stimme}${stimme.instructionsId ? ` · ${stimme.instructionsId}` : ''}${stimme.model ? ` · ${stimme.model}` : ''}`}</ThemedText>
              {stimmZeilen(stimme).map((zeile) => (
                <ThemedText key={zeile} type="small" themeColor="textSecondary">{zeile}</ThemedText>
              ))}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {`Gemessen ${new Date(bericht.erstelltAm).toLocaleString('de-DE')} · Satz ${bericht.satzVersion}${bericht.toneGateVersion ? ` · Gate ${bericht.toneGateVersion}` : ''}`}
          </ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  zeile: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: Colors.dark.backgroundSelected,
  },
  pressed: { opacity: 0.7 },
  input: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, fontSize: 13 },
});
