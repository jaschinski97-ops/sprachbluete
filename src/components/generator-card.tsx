import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/i18n';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, Spacing } from '@/constants/theme';

import { useTheme, useToneColor } from '@/hooks/use-theme';
import {
  clearApiKey,
  getKeyStorageMode,
  KeyStorageMode,
  loadApiKey,
  looksLikeApiKey,
  saveApiKey,
} from '@/lib/api-key';
import { lesbareLaufkennung } from '@/lib/conversation/types';
import { BatchProgress } from '@/lib/generation/batch';
import {
  GeneratorChoice,
  GeneratorGroupId,
  GENERATOR_GROUP_INFO,
  providersForGroup,
} from '@/lib/providers/settings';
import { PROVIDER_INFO, ProviderId } from '@/lib/providers/types';
import {
  defaultVoiceForGender,
  describeVoice,
  documentsGender,
  findVoice,
  VOICE_SOURCES,
} from '@/data/tts-voices';
import { LANGUAGE_LABELS } from '@/lib/languages/registry';
import { Lang, LANGUAGE_CODES } from '@/lib/languages/types';
import type { RunEstimate } from '@/dev/run-cost';

/**
 * Eine Generator-Karte: Anbieterwahl, Modellfeld, Schlüsselfeld, Umfangwahl,
 * Start/Anhalten, Fortschritt, Fehlerliste, Löschen.
 *
 * Seit Phase 5 gibt es mehrere Generatoren mit unterschiedlichen Anbietern,
 * aber demselben Ablauf. Die Karte ist deshalb hier einmal gebaut und wird
 * dreimal benutzt — genauso, wie der Batch-Läufer darunter nur einmal
 * existiert.
 *
 * WARUM DIE ANBIETERWAHL EINE KNOPFREIHE IST UND KEIN AUFKLAPPFELD: Die
 * Vorgabe von Phase 10 sagt „Dropdown". React Native hat kein plattformweites
 * Aufklappfeld — ein echtes bräuchte eine zusätzliche Abhängigkeit oder eine
 * eigene Umsetzung je Plattform, und `@expo/ui` ist nativ-only, also im
 * Web-Build (der einzigen bisher prüfbaren Umgebung, B-2) nicht zu gebrauchen.
 * Bei drei bis vier Möglichkeiten ist eine Reihe ohnehin die bessere Bedienung:
 * alles ist gleichzeitig sichtbar, es braucht einen Tipp statt zwei, und es
 * ist genau das Muster, das in dieser App schon für Umfang und Lernrichtung
 * benutzt und in Phase 9 auf Tippziele, Fokus und Beschriftung geprüft wurde.
 *
 * DER SCHLÜSSEL HÄNGT AM ANBIETER, nicht an der Karte: Wer von ChatGPT auf
 * Gemini umstellt, sieht sofort das Schlüsselfeld für Gemini — und der
 * ChatGPT-Schlüssel bleibt liegen, wo er war (AE-10, jetzt je Anbieter).
 */

/**
 * Die Generator-Zielsprachen — Thai, Englisch, Spanisch UND Deutsch
 * (Nutzerentscheidung 10.09., „Füge noch Deutsch zum Generieren hinzu").
 *
 * WHY HIER EIGENE LISTE STATT `LANGUAGE_ORDER`: Deutsch ist kein
 * `LanguageCode` mit eigenem Grundstoff, aber Lernziel (`X_to_de`) — Clips
 * und Bilder für die deutschen Rückseiten sind seit dem 10.09. generierbar.
 * Die Beschriftung kommt aus `LANGUAGE_LABELS`, damit kein zweites
 * Namensverzeichnis entsteht.
 */
export const GENERATOR_LANGUAGES: { code: Lang; label: string }[] = LANGUAGE_CODES.map(
  (code) => ({ code, label: LANGUAGE_LABELS[code] })
);

export type RunOption = {
  id: string;
  label: string;
  hint: string;
  localHint?: string;
};

/**
 * Ein Bestandszähler im Kopf der Karte — je Zielsprache (Bilder, Hörclips),
 * je Lernrichtung (Dialoge) oder je Stufe (Prüfungsaufgaben). `count: null`
 * heißt: noch nicht geladen.
 */
export type CountItem = {
  key: string;
  label: string;
  count: number | null;
  /** Ergänzender Text, etwa „3 erzeugt“ bei Prüfungsaufgaben. */
  detail?: string;
  /** Hervorgehoben ist die gerade gewählte Sprache. */
  highlighted?: boolean;
};

export type StartArgs = {
  optionId: string;
  /** Für welche Sprache der Lauf gilt — nur bei Gruppen, die eine Wahl anbieten. */
  language: Lang;
  /**
   * Aus dem Feld „Max. neue erzeugen“: der Lauf erzeugt höchstens so viele
   * **neue** Einheiten; leer/0 heißt alles Fehlende. Angewendet wird die Zahl
   * im Studio-Start, weil nur der den Bauplan kennt — die Karte reicht sie
   * als Start-Argument durch.
   */
  maxNew?: number;
  /**
   * Der „Alle Sprachen“/„Alle Richtungen“/„Alle Levels“-Kettenlauf: dieselben
   * Start-Argumente je Schritt. Fehlt es, ist es der eine Lauf der gewählten
   * Sprache. Die kombinierte Vorschau und die EINE Bestätigung berechnet der
   * Studio-Start über alle Schritte hinweg — die Karte fragt nicht zweimal.
   */
  chain?: { key: string; label: string }[];
  /** Meldet den laufenden Schritt für die Anzeige „2/3 · Spanisch“. */
  onChainStep?: (step: { index: number; total: number; label: string }) => void;
  apiKey: string;
  provider: ProviderId;
  /** Freitext aus dem Modellfeld — ungeprüft, siehe Pflicht 5. */
  model: string;
  /** Nur bei Sprachausgabe: die Stimme, ebenfalls Freitext. Sonst leer. */
  voice: string;
  onProgress: (progress: BatchProgress) => void;
  shouldCancel: () => boolean;
  confirmRun: (estimate: RunEstimate) => Promise<boolean>;
};

type Props = {
  managedKeys?: boolean;
  onManageKeys?: () => void;
  blocked?: boolean;
  onRunningChange?: (running: boolean) => void;
  /**
   * Für welche Sprache erzeugt wird (Phase 18). Fehlt die Angabe, bietet die
   * Karte keine Wahl an — so bei Prüfungsaufgaben (die prüfen Deutsch) und
   * Sprachsituationen (deren Aufgabentext bisher nur Thai kennt, AE-48).
   *
   * SEIT DEM 10.09. VOM TYP `Lang`: Deutsch ist als Generier-Ziel dabei
   * (`X_to_de`-Rückseiten), siehe `GENERATOR_LANGUAGES`.
   */
  language?: Lang;
  onLanguageChange?: (language: Lang) => void;
  heading: string;
  description: string;
  /** Welche Generator-Gruppe — bestimmt, welche Anbieter überhaupt taugen. */
  group: GeneratorGroupId;
  /** Aktuell gewählter Anbieter und Modellname. */
  choice: GeneratorChoice;
  /** Wird beim Umstellen aufgerufen und legt die Wahl dauerhaft ab. */
  onChoiceChange: (change: Partial<GeneratorChoice>) => void | Promise<void>;
  /** Eine Zeile mit Bestand. */
  statusLine: string;
  /** Bestandszähler je Zielsprache/Richtung/Stufe — die Zeile unter dem Status. */
  counts?: CountItem[];
  runOptions: RunOption[];
  onStart: (args: StartArgs) => Promise<void>;
  onDelete: (languages: Lang[]) => Promise<void>;
  deleteLabel: string;
  /** Löschen nur anbieten, wenn es etwas zu löschen gibt. */
  canDelete: boolean;
  /** Nach Lauf und Löschen aufgerufen, damit der Bestand neu gezählt wird. */
  onFinished: () => void | Promise<void>;
  /**
   * Der „Alle …“-Kettenlauf: ein Knopf, der denselben Umfang für alle
   * Schritte fährt (Sprachen, Richtungen oder Stufen). Die Beschriftung sagt
   * ehrlich, was „alle“ hier heißt. Fehlt der Eintrag, gibt es nur den
   * normalen Start. Der Knopf steht nur im Leerlauf zur Verfügung — während
   * eines Laufs ist die ganze Reihe blockiert.
   */
  allRun?: { label: string; steps: { key: string; label: string }[] };
};

/**
 * Lokaler Eingabepuffer für Freitextfelder, deren Wert async gespeichert wird.
 *
 * 17.09. (im Browser gemessen): Bindest du das Feld direkt an den gespeicherten
 * Stand, feuert JEDE Taste einen Speicher-Roundtrip — kommt dessen Antwort als
 * controlled value zurück, während noch getippt wird, überschreibt sie die
 * laufende Eingabe („ggpt-4o-miniemini-3.8-flash"), und am Ende steht statt
 * des getippten Modellnamens ein zerschossener Zwischenstand im Speicher. Der
 * Puffer hält die Eingabe lokal stabil; gespeichert wird bei Blur und nach
 * 600 ms Tipp-Ruhe. Äußere Wert-Änderungen (Anbieterwechsel setzt das
 * Default-Modell ein) übernehmen den Puffer mit.
 */
function useEingabePuffer(wert: string, commit: (neu: string) => void) {
  const [puffer, setPuffer] = useState(wert);
  const [letzterAeusserer, setLetzterAeusserer] = useState(wert);
  // Äußere Wert-Änderungen (Anbieterwechsel setzt das Default-Modell ein)
  // während des Renders übernehmen — das dokumentierte Muster statt eines
  // synchronisierenden Effects (react-hooks/set-state-in-effect).
  if (wert !== letzterAeusserer) {
    setLetzterAeusserer(wert);
    setPuffer(wert);
  }
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });
  useEffect(() => {
    if (puffer === wert) return;
    const timer = setTimeout(() => commitRef.current(puffer), 600);
    return () => clearTimeout(timer);
  }, [puffer, wert]);
  const beiBlur = useCallback(() => {
    if (puffer !== wert) commitRef.current(puffer);
  }, [puffer, wert]);
  return { puffer, setPuffer, beiBlur };
}

export function GeneratorCard({
  managedKeys = false,
  onManageKeys,
  onRunningChange,
  blocked = false,
  language,
  onLanguageChange,
  heading,
  description,
  group,
  choice,
  onChoiceChange,
  statusLine,
  counts,
  runOptions,
  onStart,
  onDelete,
  deleteLabel,
  canDelete,
  onFinished,
  allRun,
}: Props) {
  const { t } = useLocale();
  const theme = useTheme();

  const [advanced, setAdvanced] = useState(false);
  const [key, setKey] = useState('');
  const [keyStored, setKeyStored] = useState(false);
  const [mode, setMode] = useState<KeyStorageMode | null>(null);
  const [runOption, setRunOption] = useState(runOptions[0].id);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Das Feld „Max. neue erzeugen“ — als Text; leer heißt: alles Fehlende. */
  const [maxNewText, setMaxNewText] = useState('');
  /** Der laufende Schritt eines „Alle …“-Kettenlaufs — für die Anzeige. */
  const [chainStep, setChainStep] = useState<{ index: number; total: number; label: string } | null>(
    null
  );
  /** Phase 2, Schritt 2: „Alle Sprachen“ als Teil der Sprachwahl gewählt. */
  const [alleSprachen, setAlleSprachen] = useState(false);

  // Modell und Stimme tippen gegen den Puffer, nicht gegen den Speicherstand
  // (siehe useEingabePuffer) — der Lauf startet mit dem, was im Feld steht.
  const modell = useEingabePuffer(choice.model, (neu) => onChoiceChange({ model: neu }));
  const stimme = useEingabePuffer(choice.voice ?? '', (neu) => onChoiceChange({ voice: neu }));

  useEffect(() => { onRunningChange?.(running); }, [running, onRunningChange]);

  const cancelRef = useRef(false);
  /** Letzter Progress-Stand — für die Ergebnis-Zeile nach dem Lauf. */

  const startingRef = useRef(false);

  useEffect(() => () => { cancelRef.current = true; }, []);

  const groupInfo = GENERATOR_GROUP_INFO[group];
  const provider = choice.provider;
  const providerInfo = PROVIDER_INFO[provider];
  const choices = providersForGroup(group);

  useEffect(() => {
    (async () => {
      setMode(await getKeyStorageMode());
      // Nutzerentscheidung 09.09.2026: Der gespeicherte Schlüssel wird ins
      // Feld geladen und im Klartext angezeigt — es steht eh nur im lokalen
      // Debug-Studio, und nach einem Neuladen soll nichts neu getippt werden.
      const stored = await loadApiKey(provider);
      setKeyStored(Boolean(stored));
      setKey(stored ?? '');
    })();
  }, [provider]);

  const onSaveKey = useCallback(async () => {
    if (!looksLikeApiKey(key)) {
      setNotice('Das sieht nicht wie ein Schlüssel aus (zu kurz oder mit Leerzeichen).');
      return;
    }
    await saveApiKey(key, provider);
    setKeyStored(true);
    // Feld bleibt gefüllt — der Klartext-Anzeige ist hier ausdrücklich
    // gewollt (Nutzerentscheidung 09.09.2026).
    setNotice('Schlüssel übernommen und gespeichert.');
  }, [key, provider]);

  const onClearKey = useCallback(async () => {
    await clearApiKey(provider);
    setKeyStored(false);
    setKey('');
    setNotice('Schlüssel gelöscht.');
  }, [provider]);

  // Nur Ziffern landen im Feld (onChangeText filtert) — negativ kann gar
  // nicht entstehen, und 0 bedeuted wie leer „keine Begrenzung“.
  const maxNew = maxNewText.trim() ? Number.parseInt(maxNewText, 10) || undefined : undefined;

  const start = useCallback(async (mitKette = false) => {
    if (startingRef.current || blocked) return;
    startingRef.current = true;
    setNotice(null);
    // Phase 2, Schritt 2: „Alle Sprachen“ in der Sprachwahl schaltet denselben
    // Kettenlauf frei wie der frühere separate Knopf — eine Auswahl, ein Start.
    const kette = mitKette || alleSprachen;
    const apiKey = managedKeys ? (await loadApiKey(provider)) || '' : key.trim() || (await loadApiKey(provider)) || '';
    // Der Helper (needsKey: false) zieht seinen Schlüssel serverseitig aus
    // der Umgebung — ihm fehlt einer hier nicht.
    if (!apiKey && providerInfo.needsKey !== false) {
      setNotice(managedKeys ? 'Bitte unter Anbieter & Schlüssel einen Schlüssel hinterlegen.' : 'Erst einen API-Schlüssel eintragen.');
      startingRef.current = false;
      return;
    }

    cancelRef.current = false;
    setRunning(true);
    setShowErrors(false);
    setProgress({ total: 0, processed: 0, ok: 0, failed: 0, skipped: 0,
      current: 'Lauf wird vorbereitet …', errors: [], done: false, cancelled: false });
    try {
      await onStart({
        optionId: runOption,
        language: language ?? 'th',
        maxNew,
        // „Alle Sprachen“/„Alle Richtungen“/„Alle Levels“: die Schritte der
        // Kette gehen an den Studio-Start, der für ALLE Schritte gemeinsam
        // plant.
        chain: kette ? allRun?.steps : undefined,
        onChainStep: kette ? setChainStep : undefined,
        apiKey,
        provider,
        // Leeres Feld heisst „nimm den Vorschlag" - kein Grund fuer eine
        // Fehlermeldung, und geprueft wird der Name ohnehin nicht (Pflicht 5).
        model: modell.puffer.trim() || providerInfo.modelPlaceholder[groupInfo.needs],
        voice:
          groupInfo.needs === 'audio'
            ? stimme.puffer.trim() || providerInfo.voicePlaceholder
            : '',
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
        // Nutzerwunsch 17.09.: die Kostenbestätigung ist GÄNZLICH raus (wie
        // seit 16.09. beim Wortschatz) — die Verantwortung für bezahlte Läufe
        // liegt bei der nutzenden Person. Der Vertrag bleibt, der Lauf startet
        // sofort.
        confirmRun: () => Promise.resolve(true),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(value => value ? { ...value, done: true, cancelled: value.cancelled || cancelRef.current, current: null } : value);
      setRunning(false);
      startingRef.current = false;
      setChainStep(null);
      await onFinished();
    }
  }, [blocked, managedKeys, key, language, provider, providerInfo, groupInfo, modell.puffer, stimme.puffer, runOption, onStart, onFinished, maxNew, allRun, alleSprachen]);

  const stop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const remove = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (blocked) return;
    setRunning(true);
    try {
      await onDelete(alleSprachen ? GENERATOR_LANGUAGES.map(item => item.code) : [language ?? 'th']);
      setConfirmDelete(false);
      setProgress(null);
      await onFinished();
      setNotice('Bestand der Auswahl gelöscht.');
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  }, [blocked, confirmDelete, onDelete, onFinished, alleSprachen, language]);

  const activeOption = runOptions.find((option) => option.id === runOption) ?? runOptions[0];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{heading}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {statusLine}
      </ThemedText>

      {/* Bestand je Zielsprache (bzw. Richtung/Stufe) — mit Blick darauf, was
          der nächste Lauf überhaupt noch zu tun hat. Die Hervorhebung folgt
          der Sprachwahl sofort, denn die Zähler sind ohnehin alle geladen. */}
      {counts ? (
        <View style={styles.buttonRow} accessibilityLiveRegion="polite">
          {counts.map((item) => (
            <ThemedView
              key={item.key}
              type={item.highlighted ? 'backgroundSelected' : 'backgroundElement'}
              style={[
                styles.countChip,
                item.highlighted && { borderWidth: 1, borderColor: theme.borderSubtle },
              ]}>
              <ThemedText type="small" themeColor={item.highlighted ? 'text' : 'textSecondary'}>
                {`${item.label}: ${item.count === null ? '…' : item.count}${item.detail ? ` · ${item.detail}` : ''}`}
              </ThemedText>
            </ThemedView>
          ))}
        </View>
      ) : null}

      {language && onLanguageChange ? (
        <View style={styles.field}>
          <ThemedText type="small">Sprache</ThemedText>
          <ChoiceRow label={`Sprache für ${heading}`}>
            {GENERATOR_LANGUAGES.map(({ code, label }) => (
              <Button
                key={code}
                label={label}
                onPress={() => { setConfirmDelete(false); setAlleSprachen(false); onLanguageChange(code); }}
                selected={!alleSprachen && language === code}
                disabled={running || blocked}
              />
            ))}
            {/* Phase 2, Schritt 2: „Alle Sprachen“ gehört IN die Sprachwahl —
                Auswahl hier heißt: der Start-Knopf fährt die Kette über alle
                vier Sprachen mit EINER gemeinsamen Vorschau und EINER
                Bestätigung. */}
            {allRun ? (
              <Button
                label="Alle Sprachen"
                onPress={() => { setConfirmDelete(false); setAlleSprachen(true); }}
                selected={alleSprachen}
                disabled={running || blocked}
              />
            ) : null}
          </ChoiceRow>
          <ThemedText type="small" themeColor="textSecondary">
            {alleSprachen
              ? 'Alle Sprachen in Kette (Thai → Englisch → Spanisch → Deutsch). Was schon erzeugt wurde, bleibt liegen — der Lauf nimmt nichts weg.'
              : 'Erzeugt wird immer für genau eine Sprache. Was schon erzeugt wurde, bleibt liegen — ein zweiter Lauf für eine andere Sprache nimmt nichts weg.'}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.field}>
        <ThemedText type="small">Anbieter</ThemedText>
        <ChoiceRow label={`Anbieter für ${heading}`}>
          {choices.map((info) => (
            <Button
              key={info.id}
              label={info.label}
              onPress={() => onChoiceChange({ provider: info.id })}
              selected={provider === info.id}
              disabled={running || blocked}
            />
          ))}
        </ChoiceRow>
        {/* Nur im Web: nativ gibt es kein CORS, dort gilt der Hinweis nicht. */}
        {Platform.OS === 'web' && providerInfo.webWarning ? (
          <ThemedView type="backgroundSelected" style={styles.warning}>
            <ThemedText type="small">⚠ {providerInfo.webWarning}</ThemedText>
          </ThemedView>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }}
        onPress={() => setAdvanced(value => !value)} style={styles.tapTarget}>
        <ThemedText type="small" themeColor="link">{advanced ? '▾' : '▸'} Erweitert · Modell{groupInfo.needs === 'audio' ? ' & Stimme' : ''}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{modell.puffer || providerInfo.modelPlaceholder[groupInfo.needs]}{groupInfo.needs === 'audio' ? ` · ${stimme.puffer || providerInfo.voicePlaceholder}` : ''}</ThemedText>
      </Pressable>
      {advanced ? <>
      <View style={styles.field}>
        <ThemedText type="small">Modell</ThemedText>
        <TextInput
          value={modell.puffer}
          onChangeText={modell.setPuffer}
          onBlur={modell.beiBlur}
          placeholder={providerInfo.modelPlaceholder[groupInfo.needs]}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!running}
          accessibilityLabel={`Modellname für ${heading}`}
          style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Freitext, bewusst ohne Prüfung: Modellnamen wechseln zu oft, um sie in
          der App festzuschreiben. Leer lassen nimmt „
          {providerInfo.modelPlaceholder[groupInfo.needs]}“.
          {provider === 'gemini'
            ? ' Bei Gemini ist ein Tippfehler im Namen nicht vom falschen Schlüssel zu unterscheiden — die API meldet beides als „API key not valid" (gemessen, AE-26).'
            : ''}
        </ThemedText>
      </View>

      {groupInfo.needs === 'audio' ? (
        <View style={styles.field}>
          <ThemedText type="small">Stimme</ThemedText>
          {documentsGender(provider) ? (
            <>
              <ChoiceRow label={`Stimmlage für ${heading}`}>
                {(['female', 'male'] as const).map((gender) => {
                  const name = defaultVoiceForGender(provider, gender);
                  const current = findVoice(provider, choice.voice ?? '');
                  return (
                    <Button
                      key={gender}
                      label={gender === 'female' ? 'Weiblich' : 'Männlich'}
                      onPress={() => name && onChoiceChange({ voice: name })}
                      selected={current?.gender === gender}
                      disabled={running || blocked || !name}
                    />
                  );
                })}
              </ChoiceRow>
              <ThemedText type="small" themeColor="textSecondary">
                Google nennt das Geschlecht seiner Stimmen nicht auf der
                Gemini-Seite, sondern in der Tabelle „Voice options“ der
                Cloud-Text-to-Speech-Unterlagen — dieselben dreißig Namen,
                abgerufen am {VOICE_SOURCES.geminiGender.retrieved}. Die Knöpfe
                setzen eine belegte Stimme dieser Lage; im Feld darunter geht
                jede andere.
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {providerInfo.vendor} macht zum Geschlecht seiner Stimmen keine
              Angabe (abgerufen am {VOICE_SOURCES.openaiVoices.retrieved}).
              Eine Auswahl „weiblich/männlich“ wäre hier geraten, deshalb gibt
              es nur die Namen.
            </ThemedText>
          )}
          <TextInput
            value={stimme.puffer}
            onChangeText={stimme.setPuffer}
            onBlur={stimme.beiBlur}
            placeholder={providerInfo.voicePlaceholder}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
            accessibilityLabel={`Stimme für ${heading}`}
            style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {choice.voice
              ? `${choice.voice}: ${describeVoice(provider, choice.voice)}. `
              : `Leer lassen nimmt „${providerInfo.voicePlaceholder}". `}
            Alle Stimmen sind synthetisch, keine Muttersprachler-Aufnahmen — welche die
            Thai-Töne trifft, ist gemessen (AE-31), nicht versprochen.
          </ThemedText>
        </View>
      ) : null}

      </> : null}
      {managedKeys ? <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">{providerInfo.needsKey === false
          ? provider === 'comfyui' ? 'Lokales FLUX-Modell · kein API-Schlüssel' : provider.startsWith('local-') ? t('studio.localText') : 'Schlüssel wird vom lokalen Helper bereitgestellt.'
          : keyStored ? `${providerInfo.vendor} · Schlüssel gespeichert` : `${providerInfo.vendor} · Noch kein Schlüssel`}</ThemedText>
        {providerInfo.needsKey !== false && onManageKeys ? <Button label="Anbieter & Schlüssel" onPress={() => onManageKeys?.()} disabled={running || blocked} /> : null}
      </View> : (
      <View style={styles.field}>
        <ThemedText type="small">
          {providerInfo.needsKey === false
            ? `Schlüssel für ${providerInfo.label}`
            : `API-Schlüssel für ${providerInfo.vendor}`}
        </ThemedText>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder={providerInfo.keyPlaceholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          // Klartext statt Maskierung — ausdrückliche Nutzerentscheidung für
          // das lokale Debug-Studio (09.09.2026): „steht eh nur im Debugprogramm".
          editable={!running}
          style={[
            styles.input,
            { color: theme.text, borderColor: Colors.dark.backgroundSelected },
          ]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {providerInfo.needsKey === false ? (
            `${providerInfo.keySource}. Ein hier eingetragener Schlüssel wird nicht verschickt — das Feld kann leer bleiben.`
          ) : mode === 'secure-store' ? (
            `Wird verschlüsselt auf dem Gerät abgelegt (Keychain/Keystore), im Klartext angezeigt und beim Start ins Feld geladen. Jeder Anbieter hat seinen eigenen Platz — der Wechsel hierüber löscht keinen anderen Schlüssel.`
          ) : mode === 'local-dev' ? (
            'Wird lokal im Browser (localStorage, Klartext) gespeichert, übersteht das Neuladen und wird beim Start ins Feld geladen — nur im Entwickler-Studio (Nutzerentscheidung 09.09.2026).'
          ) : mode === 'session-only' ? (
            'Im Browser gibt es keine sichere Ablage — der Schlüssel bleibt nur für diese Sitzung im Arbeitsspeicher und ist nach dem Neuladen weg. Das ist Absicht (AE-10).'
          ) : (
            '…'
          )}
        </ThemedText>
        <View style={styles.buttonRow}>
          <Button label="Schlüssel übernehmen" onPress={onSaveKey} disabled={running || blocked} />
          {keyStored ? <Button label="Löschen" onPress={onClearKey} disabled={running || blocked} /> : null}
        </View>
      </View>

      )}

      <View style={styles.field}>
        <ThemedText type="small">Umfang</ThemedText>
        <ChoiceRow label={`Umfang für ${heading}`}>
          {runOptions.map((option) => (
            <Button
              key={option.id}
              label={option.label}
              onPress={() => setRunOption(option.id)}
              selected={runOption === option.id}
              disabled={running || blocked}
            />
          ))}
        </ChoiceRow>
        <ThemedText type="small" themeColor="textSecondary">
          {provider === 'comfyui' ? activeOption.localHint ?? activeOption.hint : activeOption.hint}
          {maxNew ? ` — begrenzt auf max. ${maxNew} neue` : ''}
        </ThemedText>
        <ThemedText type="small">Max. neue erzeugen</ThemedText>
        <TextInput
          value={maxNewText}
          // Nur Ziffern: negative Zahlen können gar nicht entstehen, und „0“
          // ist erlaubt, weil sie wie leer „alles Fehlende“ heißt.
          onChangeText={(value) => setMaxNewText(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="leer = alles Fehlende"
          placeholderTextColor={theme.textSecondary}
          editable={!running}
          accessibilityLabel={`Max. neue erzeugen für ${heading}`}
          style={[styles.input, styles.capInput, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Begrenzt den Lauf auf höchstens so viele NEUE Einheiten (Bilder, Clips,
          Aufgaben), die es noch nicht gibt. Leer lassen erzeugt alles Fehlende.
        </ThemedText>
      </View>

      {progress ? <ProgressPanel progress={progress} active={running} /> : null}

      <View style={styles.buttonRow}>
        {running ? (
          <Button label="Anhalten" onPress={stop} />
        ) : (
          <>
            <Button
              label={alleSprachen && allRun ? `${allRun.label} erzeugen` : 'Start'}
              onPress={() => start(false)}
              disabled={blocked}
            />
            {/* Der Kettenlauf läuft über die Sprachwahl („Alle“). Nur Karten
                ohne Sprachzeile — Richtungen, Stufen — behalten den Knopf hier.
                Nur im Leerlauf: Ein Kettenlauf darf nie neben einem anderen
                Lauf stehen — „Anhalten“ bricht die ganze Kette ab. */}
            {allRun && !(language && onLanguageChange) ? (
              <Button label={allRun.label} onPress={() => start(true)} disabled={blocked} />
            ) : null}
          </>
        )}
      </View>

      {/* Kettenlauf („Alle Sprachen“ & Co.): welcher Schritt von wie vielen
          gerade läuft. Der Balken darunter summiert über die Kette. */}
      {chainStep ? (
        <ThemedText type="smallBold" accessibilityLiveRegion="polite">
          {`Schritt ${chainStep.index} / ${chainStep.total} · ${chainStep.label}`}
        </ThemedText>
      ) : null}

      {/* Phase 2, Schritt 2: das Ende-Ergebnis — verarbeitet, geprüft,
          aussortiert. Der progress-State bleibt nach dem Lauf stehen, die
          Zeile erscheint also genau einmal pro beendetem Lauf. Duplikate
          verworfen kommt mit dem Duplikat-Schutz als eigenes Feld dazu. */}
      {!running && progress && (progress.done || progress.cancelled) ? (
        <ThemedText type="smallBold" accessibilityLiveRegion="polite">
          {`Ergebnis: ${progress.processed} von ${progress.total} verarbeitet${progress.cancelled ? ' (angehalten)' : ''}.`}
          {tonZusammenfassung(progress)}
        </ThemedText>
      ) : null}

      {progress && progress.errors.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowErrors((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={`${progress.errors.length} Fehlschläge anzeigen`}
            accessibilityState={{ expanded: showErrors }}
            style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              {showErrors ? '▲' : '▼'} {progress.errors.length} Fehlschläge anzeigen
            </ThemedText>
          </Pressable>
          {showErrors
            ? progress.errors.slice(0, 20).map((error) => (
                <ThemedText key={error.id} type="small" themeColor="textSecondary">
                  {lesbareLaufkennung(error.id)}: {error.message}
                </ThemedText>
              ))
            : null}
        </>
      ) : null}

      {notice ? (
        <ThemedText type="small" themeColor="textSecondary">
          {notice}
        </ThemedText>
      ) : null}

      {
        <View style={styles.buttonRow}>
          <Button
            label={confirmDelete ? `Wirklich löschen: ${alleSprachen ? 'Alle Sprachen' : LANGUAGE_LABELS[language ?? 'th']}?` : deleteLabel}
            onPress={remove}
            disabled={running || blocked || !canDelete}
          />
          {confirmDelete ? <Button label="Abbrechen" onPress={() => setConfirmDelete(false)} disabled={running || blocked} /> : null}
        </View>
      }
    </ThemedView>
  );
}

/**
 * Die Ton-Zeile des Ende-Ergebnis — nur Clip-Läufe reichen `tone` im
 * Progress mit; alle anderen Übungen haben keine automatische Messung.
 */
function tonZusammenfassung(progress: BatchProgress): string {
  const tone = progress.tone;
  if (!tone) return '';
  // Die Registerlage einzelner Clips ist nicht prüfbar — über den Lauf hinweg
  // schon (20.09.): trennt die Stimme hohe von tiefen Silben?
  const register = tone.register?.genug
    ? ` Registerprobe: hoch/tief ${tone.register.abstand.toFixed(1)} Halbtöne auseinander über ${tone.register.silben} Silben${tone.register.abstand >= 2 ? ' — die Stimme trennt die Tonlagen' : ' — die Stimme trennt die Tonlagen NICHT'}.`
    : '';
  return ` Tonprüfung: ${tone.passed} geprüft · ${tone.failed} aussortiert · ${tone.other} ungeprüft.${register}`;
}

function ElapsedTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <ThemedText type="small" themeColor="textSecondary">{`Läuft seit ${elapsed}`}</ThemedText>;
}

/** Exportiert für die Wortschatz-Karte — derselbe Fortschritt, dieselbe Optik. */
export function ProgressPanel({ progress, active = !progress.done && !progress.cancelled }: { progress: BatchProgress; active?: boolean }) {
  const toneColor = useToneColor();
  const theme = useTheme();
  const pct = progress.total === 0 ? 0 : Math.min(100, Math.round((progress.processed / progress.total) * 100));

  return (
    <View style={styles.field}>
      <View style={styles.counter}>
        {active ? <ActivityIndicator size="small" color={toneColor('mid')} accessibilityLabel="Generierung läuft" /> : null}
        <ThemedText type="smallBold" accessibilityLiveRegion="polite">
          {active ? (progress.current ? lesbareLaufkennung(progress.current) : 'Ergebnisse werden übernommen …') : progress.cancelled ? 'Lauf angehalten' : progress.done ? 'Lauf beendet' : 'Lauf vorbereitet'}
        </ThemedText>
      </View>
      {active ? <ElapsedTime /> : null}
      <ThemedText type="small">
        {progress.total > 0 ? `${progress.processed} / ${progress.total} verarbeitet · ${pct} %` : active ? 'Umfang wird ermittelt …' : `${progress.processed} Einträge verarbeitet`}
      </ThemedText>

      {/* Schiene über das `decorGrey`-Token statt hart codiertem rgba():
          damit gibt es auch im Dunkelmodus eine abgestimmte Fassung
          (UI-Review 2026-09-07, nur Farbe — keine Strukturänderung). */}
      <View accessibilityRole="progressbar" accessibilityLabel="Verarbeitete Einträge"
        accessibilityValue={{ min: 0, max: progress.total || 1, now: progress.processed }}
        style={[styles.track, { backgroundColor: theme.decorGrey }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: toneColor('mid') }]} />
      </View>

      {/* Erfolge und Fehler bewusst getrennt: eine Gesamtzahl würde einen
          teilweise misslungenen Lauf wie einen gelungenen aussehen lassen. */}
      <View style={styles.counters}>
        <Counter label="Erzeugt" value={progress.ok} color={toneColor('mid')} />
        <Counter label="Fehlgeschlagen" value={progress.failed} color={toneColor('falling')} />
        <Counter label="Übersprungen" value={progress.skipped} color={toneColor('low')} />
      </View>

      {/* Automatische Tonprüfung — nur der Hörclip-Lauf liefert diese Zahlen.
          Abgelehnte Clips stehen mit Grund in der Fehlerliste und wurden nicht
          abgelegt; ungeprüft heißt: kein Thai-Einsilbler, oder mp3 nativ ohne
          Decoder — die verbindliche Prüfung macht dann das Studio beim
          Stage/Publish. */}
      {progress.tone ? (
        <View style={styles.counters}>
          <Counter label="Ton bestanden" value={progress.tone.passed} color={toneColor('high')} />
          <Counter label="Ton abgelehnt" value={progress.tone.failed} color={toneColor('falling')} />
          <Counter label="Ton ungeprüft" value={progress.tone.other} color={toneColor('low')} />
        </View>
      ) : null}
      {/* Register-Laufprobe: was einzeln unprüfbar ist (mittel/tief/hoch),
          verrät die Stimme über viele Clips hinweg. Erst ab genug Silben. */}
      {progress.tone?.register?.genug ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`Registerprobe über ${progress.tone.register.silben} Silben: hoch ${progress.tone.register.high.toFixed(1)} · mittel ${progress.tone.register.mid.toFixed(1)} · tief ${progress.tone.register.low.toFixed(1)} Halbtöne` +
            (progress.tone.register.abstand >= 2
              ? ' — die Stimme trennt die Tonlagen.'
              : ' — die Stimme trennt die Tonlagen NICHT; Lauf wird gestoppt.')}
        </ThemedText>
      ) : null}

    </View>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.counter}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

/**
 * Eine Reihe, in der genau eine Möglichkeit gewählt ist.
 *
 * Sie trägt `radiogroup`, damit ein Screenreader die Knöpfe darin als
 * **zusammengehörige Auswahl** ansagt („1 von 3") statt als drei einzelne
 * Knöpfe, zwischen denen kein Zusammenhang erkennbar wäre.
 */
export function ChoiceRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.buttonRow}>
      {children}
    </View>
  );
}

/**
 * Knopf — als Aktion, oder als eine Möglichkeit unter mehreren.
 *
 * IM WEB-BUILD NACHGEMESSEN (Phase 10): `accessibilityState={{ selected }}`
 * erzeugt in dieser React-Native-Web-Fassung **gar kein** ARIA-Attribut. Die
 * gewählte Möglichkeit war also nur an ihrer Umrandung zu erkennen — für
 * Sehende sichtbar, für einen Screenreader unsichtbar. Betroffen war nicht nur
 * die neue Anbieterwahl, sondern auch Umfang und Standard-Lernrichtung, die
 * seit Phase 4 bzw. 6 bestehen; die Prüfung in Phase 9 hat Beschriftung,
 * Tippziel und Fokus gemessen, aber nicht den Zustand.
 *
 * `radio` + `checked` wird dagegen zu `role="radio"` und `aria-checked`
 * übersetzt — nachgemessen, nicht angenommen. Ein Knopf **ohne** `selected`
 * bleibt eine gewöhnliche Aktion (Start, Löschen) und behält `role="button"`;
 * ein Aktionsknopf als Radiobutton wäre die falsche Auskunft.
 */
export function Button({
  label,
  onPress,
  disabled,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Gesetzt heißt: eine Möglichkeit unter mehreren, nicht eine Aktion. */
  selected?: boolean;
}) {
  const toneColor = useToneColor();
  const istWahl = selected !== undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={istWahl ? 'radio' : 'button'}
      accessibilityLabel={label}
      // `aria-checked` DIREKT, nicht ueber accessibilityState: im Web-Build
      // gemessen, dass React Native Web weder `selected` noch `checked` aus
      // accessibilityState in ein ARIA-Attribut uebersetzt. Ein `role="radio"`
      // ohne `aria-checked` waere schlechter als gar keins - die Rolle
      // verspricht einen Zustand, den niemand abfragen kann.
      aria-checked={istWahl ? Boolean(selected) : undefined}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={[
          styles.button,
          selected && styles.buttonSelected,
          selected && { borderColor: toneColor('mid') },
        ]}>
        <ThemedText type="small">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  warning: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  /**
   * Das Zahleneingabefeld als vollwertiges Tippziel: Die reine Eingabehöhe
   * läge unter dem 44-Punkte-Maß, das dieselbe Regel wie bei den Knöpfen
   * verlangt (siehe `tapTarget`).
   */
  capInput: {
    minHeight: 44,
  },
  countChip: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  buttonSelected: {
    borderWidth: 1,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  counters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
