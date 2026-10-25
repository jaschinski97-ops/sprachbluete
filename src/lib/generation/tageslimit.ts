/**
 * Tageslimit eines KI-Anbieters (25.10.2026).
 *
 * Gemini begrenzt Anfragen je Modell und Tag (Tier 2 bei
 * `gemini-3.8-flash-tts`: 10.000). Ist das Limit erreicht, antwortet jede
 * weitere Anfrage mit 429 „…requests per day limit exceeded… Please retry in
 * 19h25m…“ — Guthaben hilft nicht, erst der neue Tag. Die Drossel wiederholt
 * so etwas bewusst nicht (`istRatenlimit`), der Lauf versuchte aber jeden
 * restlichen Eintrag einzeln und sammelte tausendfach denselben Fehler.
 * `mitTageslimit` merkt sich den ersten Treffer; die Studio-Läufe brechen
 * dann sofort ab und nennen, ab wann es weitergeht.
 */

export type TageslimitStand = { erreicht: boolean; wiederAbMs: number | null };

export function neuerTageslimitStand(): TageslimitStand {
  return { erreicht: false, wiederAbMs: null };
}

/** Ist dieser Fehler ein aufgebrauchtes Tageskontingent (nicht nur eine kurze Bremse)? */
export function istTageslimit(fehler: unknown): boolean {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  return /PerDay|per.?day|daily/i.test(text) && /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text);
}

/** Wartezeit aus „Please retry in 19h25m0.02s“ bzw. „retryDelay: 3600s“, sonst `null`. */
export function genannteWartezeitMs(text: string): number | null {
  const m = /retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(text);
  if (m && (m[1] || m[2] || m[3])) {
    return Math.round(((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000);
  }
  const d = /retryDelay["']?\s*[:=]\s*["']?([\d.]+)s/i.exec(text);
  return d ? Math.round(Number(d[1]) * 1000) : null;
}

/** Hüllt einen Erzeuger ein: Der erste Tageslimit-Fehler setzt `stand.erreicht`. */
export function mitTageslimit<S, E>(
  client: { generate(spec: S): Promise<E> },
  stand: TageslimitStand,
  jetzt: () => number = Date.now
): { generate(spec: S): Promise<E> } {
  return {
    async generate(spec) {
      try {
        return await client.generate(spec);
      } catch (fehler) {
        if (istTageslimit(fehler) && !stand.erreicht) {
          stand.erreicht = true;
          const warten = genannteWartezeitMs(fehler instanceof Error ? fehler.message : String(fehler));
          stand.wiederAbMs = warten === null ? null : jetzt() + warten;
        }
        throw fehler;
      }
    },
  };
}

/** Die Zeile für die Endmeldung des Laufs. */
export function tageslimitMeldung(stand: TageslimitStand): string {
  const ab = stand.wiederAbMs === null
    ? 'morgen'
    : `ab etwa ${new Date(stand.wiederAbMs).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} Uhr`;
  return `Tageslimit des Anbieters erreicht (Anfragen pro Tag) — Lauf gestoppt. Guthaben hilft hier nicht; weiter ${ab}. Fertiges bleibt, der nächste Lauf macht dort weiter.`;
}
