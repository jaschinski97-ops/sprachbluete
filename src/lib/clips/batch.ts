import { BatchProgress, missingFrom, runBatch } from '../generation/batch';
import { bundledEntry, isDeletedDraft } from '../content/bundled';
import { BatchTask } from '../generation/types';
import { base64ByteLength } from '../images/types';
import {
  beurteileRegisterProbe,
  checkThaiTone,
  leereRegisterProbe,
  sammleRegisterProbe,
  type RegisterProbe,
  type ToneWort,
} from '../content/tone-gate';
import { DataStore, getStore } from '../storage';

import { getAudioBlobStore } from './blob-store';
import { decodeClipAsync } from './decode-clip';
import { ClipGenerationClient } from './generator';
import { invalidateClipIndex } from './lookup';
import { AudioBlobStore, AudioClip, AudioClipSpec, clipBlobKey } from './types';

/**
 * Der Lauf für Hörclips — vierter Nutzer desselben Läufers
 * (`lib/generation/batch.ts`): sofort speichern, Fehler überleben,
 * fortsetzbar, abbrechbar. Hier steht nur, was Clips ausmacht: die
 * zweiteilige Ablage nach dem Muster der Bilder (AE-14, AE-30).
 */

export type ClipRunOptions = {
  specs: AudioClipSpec[];
  client: ClipGenerationClient;
  store?: DataStore;
  blobStore?: AudioBlobStore;
  /**
   * Der Wortschatz, aus dem die Tonprüfung die Solltöne je Silbe liest
   * (18.09.): Wörter über `syllables[].tone`, Beispielsätze über die
   * Tonfolge ihrer Roman-Umschrift. Ohne Angabe greift das Tor nur auf den
   * mitgebündelten Altbestand zu — der Studio-Lauf reicht deshalb den
   * selben aktiven Thai-Bestand durch, aus dem auch der Plan gebaut wurde.
   */
  toneWortschatz?: readonly ToneWort[];
  onProgress?: (progress: BatchProgress) => void;
  shouldCancel?: () => boolean;
  delayMs?: number;
  /**
   * Wie viele Clips gleichzeitig entstehen (Turbo, 23.10.2026). Ohne Angabe
   * bleibt es bei `CLIP_CONCURRENCY`; das Studio reicht die Zahl seiner
   * Drossel durch, die bei 429 selbst bremst.
   */
  concurrency?: number;
  now?: () => number;
  onProduced?: (document: AudioClip, base64: string) => Promise<void>;
  /**
   * Vorhandene Clips trotzdem neu erzeugen („Neu erzeugen“ im Prüfbericht).
   * Ohne das übersprang der Lauf genau den Clip, um den es ging (Testrunde 26.09.).
   */
  overwrite?: boolean;
  /**
   * Die Stimme hat schon viele bestandene Thai-Clips im Katalog: kein
   * Ton-Notstopp (25.10.2026). Beim Fortsetzen stehen die Wörter vorn, die
   * im letzten Lauf durchfielen; die Stichprobe der ersten zehn traf so fast
   * nur Problemfälle und stoppte Thai, obwohl die Stimme 564 Clips bestanden
   * hatte. Die Register-Probe und die Prüfung jedes Clips bleiben.
   */
  bewaehrteStimme?: boolean;
};

/** Vorhanden heißt: Dokument **und** Datei — sonst Karteileiche (AE-14). */
function clipExists(db: DataStore, blobs: AudioBlobStore) {
  return {
    async exists(spec: AudioClipSpec) {
      if (bundledEntry('audio', spec.id)?.asset) return true;
      const doc = await db.get<AudioClip>('audio', spec.id);
      if (!doc || isDeletedDraft('audio', doc)) return false;
      return blobs.has(doc.blobKey);
    },
  };
}

/**
 * Tonprüfung des frisch generierten Clips, noch vor dem Ablegen. WAV-Klipse
 * (Gemini) tragen rohes PCM; mp3 (ChatGPT) wird im Web-Studio über
 * `decodeAudioData` dekodiert — nativ gibt es keinen Decoder, dort bleibt
 * die Prüfung beim Stage/Publish im Studio-Node (ffmpeg). Derselbe Messkern
 * wie im Messwerkzeug. Ein Clip, der klar widerspricht, wird nicht
 * abgelegt — der Lauf zählt ihn als fehlgeschlagen mit Grund, und der
 * nächste Lauf erzeugt ihn neu. Ein interner Messfehler darf die Erzeugung
 * nie blockieren — dann eben ungeprüft statt gar nicht.
 */
async function measureFreshClip(
  spec: AudioClipSpec,
  clip: { format: string; base64: string },
  toneWortschatz?: readonly ToneWort[]
) {
  try {
    const decoded = await decodeClipAsync(clip.base64, clip.format);
    if (!decoded) return null;
    return checkThaiTone(
      spec,
      decoded.pcm,
      decoded.sampleRate,
      toneWortschatz ? { woerter: toneWortschatz } : undefined
    );
  } catch {
    return null;
  }
}

function clipTask(
  client: ClipGenerationClient,
  db: DataStore,
  blobs: AudioBlobStore,
  tone: { passed: number; failed: number; other: number },
  now: () => number,
  toneWortschatz?: readonly ToneWort[],
  frueh: { geprueft: number; failed: number; notstopp: boolean; aus?: boolean } = { geprueft: 0, failed: 0, notstopp: false },
  register: { probe: RegisterProbe; gestoppt: boolean } = { probe: leereRegisterProbe(), gestoppt: false },
  onProduced?: ClipRunOptions['onProduced']
): BatchTask<AudioClipSpec> {
  return {
    ...clipExists(db, blobs),
    async produce(spec) {
      const clip = await client.generate(spec);

      // Automatische Tonprüfung (Debug-Ablauf): Ein Clip, dessen Kontur dem
      // verifizierten Sollton klar widerspricht, wird gar nicht erst
      // abgelegt — der Lauf zählt ihn als fehlgeschlagen mit Grund, und der
      // nächste Lauf erzeugt ihn neu. Speichern wir ihn trotzdem, bliebe er
      // lokal abspielbar und würde nur beim Publish aussortiert.
      const toneCheck = await measureFreshClip(spec, clip, toneWortschatz);
      if (toneCheck) {
        // Register-Laufprobe: sammelt die Silbenlagen ALLER geprüften
        // Mehrsilber und urteilt über die STIMME, nie über diesen Clip.
        sammleRegisterProbe(register.probe, toneCheck);
        const urteil = beurteileRegisterProbe(register.probe);
        if (urteil.genug && !urteil.getrennt) register.gestoppt = true;
        if (toneCheck.status === 'passed') tone.passed += 1;
        else if (toneCheck.status === 'failed') tone.failed += 1;
        else tone.other += 1;
        // Notstopp-Stichprobe: nur Aussagen zählen, nur am Anfang.
        if (toneCheck.status === 'passed' || toneCheck.status === 'failed') {
          frueh.geprueft += 1;
          if (toneCheck.status === 'failed') frueh.failed += 1;
          if (!frueh.aus && frueh.geprueft === TON_NOTSTOPP_STICHPROBE && frueh.failed >= TON_NOTSTOPP_FEHLGRENZE) {
            frueh.notstopp = true;
          }
        }
      }
      if (toneCheck?.status === 'failed') {
        throw new Error(`Ton-Check fehlgeschlagen (${spec.text}): ${toneCheck.reason}`);
      }

      const blobKey = clipBlobKey(spec.id, clip.format);

      // Erst die Datei, dann das Dokument - bricht es dazwischen ab, gilt der
      // Clip als fehlend und wird beim naechsten Lauf sauber neu erzeugt.

      const doc: AudioClip = {
        id: spec.id,
        language: spec.language,
        text: spec.text,
        kind: spec.kind,
        sourceId: spec.sourceId,
        format: clip.format,
        byteSize: base64ByteLength(clip.base64),
        durationMs: clip.durationMs,
        blobKey,
        provider: clip.provider,
        model: clip.model,
        voice: clip.voice,
        ...(clip.instructionsId ? { instructionsId: clip.instructionsId } : {}),
        generatedAt: now(),
        synthetic: true,
      };
      if (onProduced) { await onProduced(doc, clip.base64); return; }
      await blobs.put(blobKey, clip.base64);
      await db.put('audio', spec.id, doc);
      invalidateClipIndex();
    },
  };
}

/**
 * Wie viele Clips GLEICHZEITIG erzeugt werden, wenn der Aufrufer nichts
 * angibt. Seit dem Turbo (23.10.2026) gibt das Studio die Zahl seiner Drossel
 * mit, die bei 429 selbst bremst — der feste Wert gilt nur noch für Läufe
 * ohne Drossel. Am 17.09. nachts gemessen:
 * OpenAI begrenzt TTS auf EXAKT 30 Aufrufe/Minute (Helper-Log: „Rate-Limit:
 * maximal 30 Aufrufe pro Minute") — bei 3 parallelen Arbeitern fielen 78 %
 * der Aufrufe durchs Limit. Deshalb wieder seriell (1); die Pause von
 * 1400 ms im Studio-Start liegt mit ~24/min sicher unter dem Limit. Die
 * Worker-Pool-Fähigkeit in runBatch bleibt für künftige Anbieter ohne
 * solches Limit erhalten.
 */
export const CLIP_CONCURRENCY = 1;

/**
 * NOTSTOPP BEI MASSEN-FEHLPRODUKTION (18.09., Thai-Lauf): Ein durchgefallener
 * Clip wird verworfen und beim nächsten Lauf NEU BEZAHLT erzeugt — eine Stimme,
 * die Thai-Töne systematisch falsch spricht, würde sonst einen Massenlauf
 * komplett bezahlt und verworfen durchlaufen. Von den ERSTEN messbar
 * geprüften Thai-Clips (passed/failed; Ungeprüftes sagt nichts) müssen
 * mindestens so viele bestehen, sonst stoppt der Lauf von selbst. Das ist
 * kein Budget-Dialog (bewusst nie wieder, 17.09.), sondern derselbe
 * „kein Fortschritt"-Schutz wie im Wortschatz-Loop.
 */
export const TON_NOTSTOPP_STICHPROBE = 10;
export const TON_NOTSTOPP_FEHLGRENZE = 6;

export async function runClipBatch(options: ClipRunOptions): Promise<BatchProgress> {
  const db = options.store ?? (await getStore());
  const blobs = options.blobStore ?? (await getAudioBlobStore());
  const tone = { passed: 0, failed: 0, other: 0 };
  const frueh = { geprueft: 0, failed: 0, notstopp: false, aus: options.bewaehrteStimme === true };
  const register = { probe: leereRegisterProbe(), gestoppt: false };
  const registerStand = () => {
    const urteil = beurteileRegisterProbe(register.probe);
    return {
      ...urteil.mittelwerte,
      abstand: urteil.abstand,
      silben: register.probe.low.length + register.probe.mid.length + register.probe.high.length,
      genug: urteil.genug,
    };
  };
  const onProgress = options.onProgress
    ? (progress: BatchProgress) => options.onProgress?.({ ...progress, tone: { ...tone, register: registerStand() } })
    : undefined;
  const basisCancel = options.shouldCancel;
  const task = clipTask(options.client, db, blobs, tone, options.now ?? Date.now, options.toneWortschatz, frueh, register, options.onProduced);
  if (options.overwrite) task.exists = async () => false;
  const result = await runBatch({
    specs: options.specs,
    task,
    onProgress,
    shouldCancel: () => basisCancel?.() || frueh.notstopp || register.gestoppt,
    delayMs: options.delayMs,
    concurrency: options.concurrency ?? CLIP_CONCURRENCY,
  });
  if (frueh.notstopp) {
    result.errors.push({
      id: 'ton-notstopp',
      message: `Ton-Notstopp: ${frueh.failed} von ${frueh.geprueft} der ersten geprüften Thai-Clips verworfen — die Stimme trifft die Thai-Töne nicht. Lauf gestoppt; Stimme oder Anbieter wechseln (z. B. Gemini-Stimme) und neu starten.`,
    });
  }
  if (register.gestoppt) {
    const stand = registerStand();
    result.errors.push({
      id: 'ton-registerprobe',
      message: `Register-Probe: die Stimme trennt die Tonlagen nicht — hoch ${stand.high.toFixed(1)}, mittel ${stand.mid.toFixed(1)}, tief ${stand.low.toFixed(1)} Halbtöne (Abstand ${stand.abstand.toFixed(1)} über ${stand.silben} Silben). Einsilbige Wörter mit mittel/tief/hoch sind einzeln nicht prüfbar; diese Stimme spricht sie hörbar falsch. Lauf gestoppt; Stimme oder Anbieter wechseln.`,
    });
  }
  return { ...result, tone: { ...tone, register: registerStand() } };
}

/** Welche Clips aus dem Plan noch fehlen. */
export async function missingClipSpecs(
  specs: AudioClipSpec[],
  store?: DataStore,
  blobStore?: AudioBlobStore
): Promise<AudioClipSpec[]> {
  const db = store ?? (await getStore());
  const blobs = blobStore ?? (await getAudioBlobStore());
  return missingFrom(specs, clipExists(db, blobs));
}
