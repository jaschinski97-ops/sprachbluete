import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { SettingsRow } from './settings-row';
import { useTheme } from '@/hooks/use-theme';
import { clearApiKey, getKeyStorageMode, loadApiKey, looksLikeApiKey, saveApiKey, type KeyStorageMode } from '@/lib/api-key';
import { PROVIDERS, PROVIDER_INFO, type ProviderId } from '@/lib/providers/types';

/** One stored credential per provider; generation choices remain with each generator.
 *
 * Nur im Entwicklerstudio sichtbar (`__DEV__`, sonst `null`). Liste aller Anbieter mit Schlüssel, Auswahl öffnet
 * die Eingabe für genau einen Anbieter. Gespeichert wird über `@/lib/api-key` (Ablage je nach Plattform, siehe `mode`).
 */
export function ApiKeysCard() {
  const theme = useTheme();
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [stored, setStored] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [mode, setMode] = useState<KeyStorageMode | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Beim Öffnen vorhandene Schlüssel je Anbieter lesen; `cancelled` verhindert State-Updates nach dem Schließen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keyMode = await getKeyStorageMode();
      const entries = await Promise.all(PROVIDERS.map(async id => [id, await loadApiKey(id) ?? ''] as const));
      if (cancelled) return;
      setMode(keyMode);
      setDrafts(Object.fromEntries(entries));
      setStored(Object.fromEntries(entries.map(([id, key]) => [id, Boolean(key)])));
      setLoaded(true);
    })().catch(() => { if (!cancelled) setStatus('Schlüssel konnten nicht geladen werden. Bitte erneut öffnen.'); });
    return () => { cancelled = true; };
  }, []);

  // Speichert den Entwurf des gewählten Anbieters bzw. löscht den Schlüssel (`remove`). `busy` sperrt Doppelklicks,
  // vor dem Speichern prüft `looksLikeApiKey` nur die Form, nicht ob der Schlüssel beim Anbieter gültig ist.
  async function save(remove = false) {
    if (!selected || busy || !loaded) return;
    const value = (drafts[selected] ?? '').trim();
    if (!remove && !looksLikeApiKey(value)) { setStatus('Bitte einen gültigen Schlüssel eintragen.'); return; }
    setBusy(true);
    try {
      if (remove) await clearApiKey(selected); else await saveApiKey(value, selected);
      setStored(prev => ({ ...prev, [selected]: !remove }));
      setDrafts(prev => ({ ...prev, [selected]: remove ? '' : value }));
      setStatus(remove ? 'Schlüssel gelöscht.' : 'Schlüssel gespeichert. Er gilt für alle Generatoren dieses Anbieters.');
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  // Hooks laufen oben unbedingt; erst hier wird ausgeblendet, weil Schlüssel nur im Entwicklerstudio gepflegt werden.
  if (!__DEV__) return null;
  return <View style={styles.column}>
    <ThemedText type="small" themeColor="textSecondary">Ein Schlüssel je Anbieter. Den Anbieter wählst du beim jeweiligen Generator.</ThemedText>
    {selected ? <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedButton label="Alle Anbieter" disabled={busy} onPress={() => { setSelected(null); setStatus(''); }} />
      <ThemedText type="smallBold">{PROVIDER_INFO[selected].vendor}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Schlüssel von {PROVIDER_INFO[selected].keySource}</ThemedText>
      <TextInput value={drafts[selected] ?? ''} onChangeText={value => setDrafts(prev => ({ ...prev, [selected]: value }))}
        accessibilityLabel={`API-Schlüssel für ${PROVIDER_INFO[selected].vendor}`}
        placeholder={PROVIDER_INFO[selected].keyPlaceholder} placeholderTextColor={theme.textSecondary}
        autoCapitalize="none" autoCorrect={false} editable={loaded && !busy}
        style={[styles.input, { color: theme.text, borderColor: theme.borderSubtle }]} />
      <ThemedText type="small" themeColor="textSecondary">{mode === 'local-dev'
        ? 'Im lokalen Entwicklerstudio im Browser gespeichert und nach dem Neuladen sichtbar.'
        : mode === 'secure-store' ? 'Verschlüsselt auf diesem Gerät gespeichert.'
        : mode === 'session-only' ? 'Nur für diese Sitzung gespeichert.' : 'Ablage wird geprüft …'}</ThemedText>
      <ThemedButton label="Schlüssel speichern" variant="primary" disabled={busy || !loaded} onPress={() => { void save(); }} />
      {stored[selected] ? <ThemedButton label="Schlüssel löschen" disabled={busy} onPress={() => { void save(true); }} /> : null}
    </ThemedView> : <View style={styles.group}>
      {PROVIDERS.filter(id => PROVIDER_INFO[id].needsKey !== false).map(id => <SettingsRow key={id}
        title={PROVIDER_INFO[id].vendor} detail={!loaded ? 'Wird geladen …' : stored[id] ? 'Schlüssel gespeichert' : 'Noch kein Schlüssel'}
        icon="key-outline" disabled={!loaded} onPress={() => { setSelected(id); setStatus(''); }} />)}
    </View>}
    <ThemedText type="small" themeColor="textSecondary">OpenAI über den lokalen Helper verwendet den serverseitigen Schlüssel.</ThemedText>
    {status ? <ThemedText accessibilityLiveRegion="polite" type="small">{status}</ThemedText> : null}
  </View>;
}
const styles = StyleSheet.create({
  column: { gap: 16 }, card: { padding: 16, borderRadius: 16, gap: 12 },
  group: { borderRadius: 16, overflow: 'hidden', gap: 1 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 8, padding: 12 },
});
