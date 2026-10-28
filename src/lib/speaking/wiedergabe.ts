import type { AudioPlayer } from 'expo-audio';

import { findePronunciationClip, sprichBisEnde, stopPronunciation, type SpeechLanguage } from '../audio';

/**
 * Hören im Shadowing-Vergleich (28.10.2026): Vorbild, eigene Aufnahme, und
 * beides im Wechsel. Anders als `playPronunciation` wartet jede Wiedergabe
 * hier bis zum Ende — nur so laufen „Vorbild → ich → Vorbild“ nacheinander.
 * Ein neuer Knopfdruck bricht die laufende Folge ab (`Lauf`-Zähler).
 */

let aktiverPlayer: AudioPlayer | null = null;
let lauf = 0;

function gibFrei(): void {
  const player = aktiverPlayer;
  aktiverPlayer = null;
  if (!player) return;
  try {
    player.pause();
  } catch {}
  try {
    player.remove();
  } catch {}
}

/** Spielt eine Datei (URI) und kehrt erst nach ihrem Ende zurück. */
export function spieleDateiBisEnde(uri: string, maxMs = 20_000): Promise<void> {
  gibFrei();
  return new Promise((fertig) => {
    const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    let erledigt = false;
    const ende = () => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(uhr);
      if (aktiverPlayer === player) gibFrei();
      fertig();
    };
    const uhr = setTimeout(ende, maxMs);
    let player: AudioPlayer;
    try {
      player = createAudioPlayer({ uri });
    } catch {
      clearTimeout(uhr);
      fertig();
      return;
    }
    aktiverPlayer = player;
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || status.error !== null) ende();
    });
    try {
      player.play();
    } catch {
      ende();
    }
  });
}

/** Vorbild bis zum Ende: Clip wie überall, sonst die Gerätestimme. */
export async function spieleVorbildBisEnde(text: string, sprache: SpeechLanguage): Promise<void> {
  const clip = await findePronunciationClip({ text, language: sprache, purpose: 'sentence' });
  if (clip) await spieleDateiBisEnde(clip.uri);
  else await sprichBisEnde(text, sprache);
}

export type HoerArt = 'vorbild' | 'ich' | 'wechsel';

/**
 * Startet eine Hörfolge. `aufnahmeUri` fehlt → nur das Vorbild ist hörbar.
 * Liefert `true`, wenn die Folge zu Ende lief (nicht abgebrochen wurde).
 */
export async function hoere(art: HoerArt, text: string, sprache: SpeechLanguage, aufnahmeUri: string | null): Promise<boolean> {
  const meinLauf = ++lauf;
  await stoppeHoeren(false);
  const noch = () => meinLauf === lauf;
  const schritte: (() => Promise<void>)[] =
    art === 'vorbild' || !aufnahmeUri
      ? [() => spieleVorbildBisEnde(text, sprache)]
      : art === 'ich'
        ? [() => spieleDateiBisEnde(aufnahmeUri)]
        : [
            () => spieleVorbildBisEnde(text, sprache),
            () => spieleDateiBisEnde(aufnahmeUri),
            () => spieleVorbildBisEnde(text, sprache),
          ];
  for (const [nr, schritt] of schritte.entries()) {
    if (!noch()) return false;
    if (nr > 0) await new Promise((weiter) => setTimeout(weiter, 350));
    if (!noch()) return false;
    await schritt();
  }
  return noch();
}

/** Bricht jede laufende Hörfolge ab. */
export async function stoppeHoeren(neuerLauf = true): Promise<void> {
  if (neuerLauf) lauf++;
  gibFrei();
  await stopPronunciation().catch(() => {});
}
