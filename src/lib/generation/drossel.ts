import type { ProviderCapability, ProviderId } from '../providers/types';

/**
 * Die Drossel für parallele Anbieter-Aufrufe (Turbo, 23.10.2026).
 *
 * Vorher lief jede Erzeugung streng nacheinander und mit fester Pause
 * (Gemini-Audio 6,5 s je Clip) — sicher, aber für den frischen Gesamtlauf
 * (rund 8.000 Wörter, 944 Dialoge, 15.000 Clips) eine Sache von Tagen.
 * Jetzt dürfen mehrere Aufrufe gleichzeitig laufen, und der Anbieter selbst
 * sagt, wann es zu viel ist:
 *
 * - **429 oder Überlastung (503):** Die Drossel halbiert die erlaubte
 *   Gleichzeitigkeit, hält ALLE Arbeiter an, bis die Wartezeit um ist
 *   (Retry-After/`retryDelay` des Anbieters, sonst 2 s, 4 s, 8 s … bis 60 s),
 *   und wiederholt denselben Aufruf. Abgelehnte Aufrufe kosten nichts.
 * - **Erfolg:** Nach so vielen Erfolgen in Folge, wie gerade gleichzeitig
 *   laufen dürfen, darf einer mehr laufen — bis zum eingestellten Höchstwert.
 *
 * Das ist das bekannte „additiv rauf, multiplikativ runter“ aus der
 * Netzwerktechnik: Der Lauf pendelt sich knapp unter dem Ratenlimit des
 * eigenen Kontos ein, ohne dass jemand es kennen muss.
 */

export type DrosselOptionen = {
  /** Höchstens so viele Aufrufe gleichzeitig. */
  max: number;
  /** Wie oft EIN Aufruf nach einem Ratenlimit wiederholt wird. */
  maxVersuche?: number;
  /** Obergrenze einer einzelnen Wartezeit. */
  maxWarteMs?: number;
  jetzt?: () => number;
  warte?: (ms: number) => Promise<void>;
};

const STANDARD_VERSUCHE = 8;
const STANDARD_MAX_WARTE_MS = 60_000;
const ERSTE_WARTE_MS = 2_000;

/** Ist das ein Ratenlimit oder eine vorübergehende Überlastung? */
export function istRatenlimit(fehler: unknown): boolean {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  // Ein aufgebrauchtes TAGES-Kontingent (Gemini: Quota-ID „…PerDay…“) kommt
  // auch als 429 — Warten hilft dort nicht bis morgen. Sofort melden statt
  // je Eintrag minutenlang zu wiederholen.
  if (/PerDay|per.?day|daily/i.test(text)) return false;
  const status = (fehler as { status?: unknown } | null)?.status;
  if (status === 429 || status === 503) return true;
  return /HTTP (429|503)\b|RESOURCE_EXHAUSTED|rate.?limit|too many requests|overloaded|überlastet/i.test(text);
}

/** Die Wartezeit, die der Anbieter selbst nennt (Retry-After, retryDelay). */
function genannteWartezeit(fehler: unknown): number | undefined {
  const ms = (fehler as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) return ms;
  // Der Helper nennt seine Wartezeit im Text („In 12s wiederholen“).
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  const helper = text.match(/In (\d+)s wiederholen/);
  return helper ? Number(helper[1]) * 1000 : undefined;
}

export class Drossel {
  readonly max: number;
  private grenze: number;
  private laufend = 0;
  private pauseBis = 0;
  private erfolgeInFolge = 0;
  private wartende: (() => void)[] = [];
  private readonly maxVersuche: number;
  private readonly maxWarteMs: number;
  private readonly jetzt: () => number;
  private readonly warte: (ms: number) => Promise<void>;
  /** Wie oft gebremst wurde — für die Anzeige im Lauf. */
  gebremst = 0;

  constructor(optionen: DrosselOptionen) {
    this.max = Math.max(1, Math.floor(optionen.max));
    this.grenze = this.max;
    this.maxVersuche = optionen.maxVersuche ?? STANDARD_VERSUCHE;
    this.maxWarteMs = optionen.maxWarteMs ?? STANDARD_MAX_WARTE_MS;
    this.jetzt = optionen.jetzt ?? Date.now;
    this.warte = optionen.warte ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Wie viele Aufrufe gerade gleichzeitig laufen dürfen. */
  get erlaubt(): number {
    return this.grenze;
  }

  /** Führt `aufgabe` in einem freien Platz aus; Ratenlimits werden wiederholt. */
  async lauf<T>(aufgabe: () => Promise<T>): Promise<T> {
    for (let versuch = 1; ; versuch++) {
      await this.platz();
      try {
        const ergebnis = await aufgabe();
        this.erfolg();
        return ergebnis;
      } catch (fehler) {
        if (!istRatenlimit(fehler) || versuch >= this.maxVersuche) throw fehler;
        this.bremse(fehler, versuch);
      } finally {
        this.frei();
      }
    }
  }

  private async platz(): Promise<void> {
    for (;;) {
      const rest = this.pauseBis - this.jetzt();
      if (rest > 0) {
        await this.warte(rest);
        continue;
      }
      if (this.laufend < this.grenze) {
        this.laufend += 1;
        return;
      }
      await new Promise<void>((resolve) => this.wartende.push(resolve));
    }
  }

  private frei(): void {
    this.laufend -= 1;
    // Alle Wartenden prüfen neu — die Grenze kann gestiegen sein.
    const wecken = this.wartende;
    this.wartende = [];
    for (const weiter of wecken) weiter();
  }

  private erfolg(): void {
    this.erfolgeInFolge += 1;
    if (this.grenze < this.max && this.erfolgeInFolge >= this.grenze) {
      this.grenze += 1;
      this.erfolgeInFolge = 0;
    }
  }

  private bremse(fehler: unknown, versuch: number): void {
    this.gebremst += 1;
    this.grenze = Math.max(1, Math.floor(this.grenze / 2));
    this.erfolgeInFolge = 0;
    const eigene = Math.min(this.maxWarteMs, ERSTE_WARTE_MS * 2 ** (versuch - 1));
    const wartezeit = Math.min(this.maxWarteMs, genannteWartezeit(fehler) ?? eigene);
    this.pauseBis = Math.max(this.pauseBis, this.jetzt() + wartezeit);
  }
}

/** Leitet jeden `generate`-Aufruf eines Clients durch die Drossel. */
export function gedrosselt<S, E>(
  client: { generate(spec: S): Promise<E> },
  drossel: Drossel
): { generate(spec: S): Promise<E> } {
  return { generate: (spec) => drossel.lauf(() => client.generate(spec)) };
}

/**
 * Wie viele Aufrufe ein Anbieter ab Werk gleichzeitig bekommt. Die Drossel
 * bremst bei 429 ohnehin selbst — die Werte sind Obergrenzen, keine Zusagen.
 * Lokale Modelle teilen sich eine Grafikkarte: dort bleibt es bei 1.
 */
export function standardParallel(provider: ProviderId, aufgabe: ProviderCapability): number {
  if (provider === 'comfyui' || provider === 'local-qwen' || provider === 'local-gemma') return 1;
  if (provider === 'deepseek') return 8;
  if (provider === 'chatgpt-helper') return 3;
  if (provider === 'chatgpt') return aufgabe === 'image' ? 2 : 4;
  return 4;
}

export const MAX_PARALLEL = 32;

/** Die eingestellte Zahl, sonst der Werkswert — immer zwischen 1 und 32. */
export function parallelFuer(
  wahl: { provider: ProviderId; parallel?: number },
  aufgabe: ProviderCapability
): number {
  const wert = wahl.parallel;
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    return Math.min(MAX_PARALLEL, Math.max(1, Math.floor(wert)));
  }
  return standardParallel(wahl.provider, aufgabe);
}
