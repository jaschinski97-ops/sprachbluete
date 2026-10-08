import type { TextClient, ProviderId } from '../providers/types';
import type { VocabEntry } from '@/data/vocab-types';
import { LEARNING_LANGUAGES } from '../languages/definitions';
import { isLanguageCode } from '../languages/types';

/** Prüfpunkt 3 (Umschrift/Ton/Betonung) je Sprache — aus `definitions.ts`. */
function pruefPunktDrei(language: string): string {
  return isLanguageCode(language) ? LEARNING_LANGUAGES[language].checkPoint3 : 'ist die Lautschrift plausibel?';
}


/** Der gewählte Anbieter prüft Übersetzung, Grammatik und Natürlichkeit.
 * Ein anderer Anbieter ergibt eine Kreuzprüfung; beim selben Anbieter
 * bestehen Einträge zwei getrennte Prüfrunden. Fehler werden verworfen.
 */

export type KreuzUrteil = { bestanden: boolean; gruende: string[] };

/** Ohne gespeicherte Prüferwahl gilt der Erzeuger. Kein stiller Anbieterwechsel. */
export function gegenStueck(
  erzeuger: ProviderId,
  hatSchluessel: (anbieter: ProviderId) => boolean,
  wahl?: ProviderId
): { anbieter: ProviderId; selbstpruefung: boolean } {
  const anbieter = wahl ?? erzeuger;
  if (!hatSchluessel(anbieter)) throw Error(`Schlüssel für den Prüfer ${anbieter} fehlt.`);
  const familie = (p: ProviderId) => p === 'chatgpt-helper' ? 'chatgpt' : p;
  return { anbieter, selbstpruefung: familie(anbieter) === familie(erzeuger) };
}

const URTEILS_FORMAT = [
  'Antworte NUR mit JSON:',
  '{ "urteil": "bestehen" | "mangel", "gruende": ["…"] }',
  '"bestehen" nur, wenn ALLE Punkte stimmen. Jeder Mangel bekommt einen kurzen Grund.',
].join('\n');

/**
 * Wie viele Einträge EIN Prüfaufruf auf einmal bekommt (15.09.: die
 * Einzelprüfung machte aus 200 Wörtern 200 nacheinander laufende Aufrufe
 * an ein Reasoning-Modell — das war der Zeitfresser des ersten Kettenlaufs).
 */
export const PRUEF_BATCH_GROESSE = 10;

/** Prüfprompt für EINEN Eintrag (Einzelfall/Tests — der Lauf nutzt den Batch). */
export function baueVocabPruefPrompt(eintrag: VocabEntry, stufe?: string): string {
  return [
    'Prüfe diesen Lern-Vokabeleintrag kritisch in fünf Punkten:',
    '1. Übersetzung: stimmen die deutsche Bedeutung und alle vorhandenen translations zum Begriff (und umgekehrt)? Es genügt EINE korrekte Hauptbedeutung — nicht alle Bedeutungsnuancen.',
    '2. Grammatik/Rechtschreibung in der Zielsprache und im Deutschen.',
    `3. Umschrift/Ton/Betonung: ${pruefPunktDrei(String(eintrag.language))}`,
    '4. Natürlichkeit: klingt der Beispielsatz wie ein echter Satz der Zielsprache?',
    stufe
      ? `5. Stufe ${stufe}: ist das Wort für diese Stufe typisch und häufig genug?`
      : '5. Passung: ist das Wort ein grundlegender, hochfrequenter Alltagsbegriff (ohne feste Niveaustufe)? Mehrdeutigkeit schließt hohe Frequenz nicht aus.',
    '',
    'Eintrag:',
    JSON.stringify(eintrag, null, 2),
    '',
    URTEILS_FORMAT,
  ].join('\n');
}

/** Prüfprompt für ein GANZES Paket — ein Aufruf, ein Urteil je Eintrag. */
export function baueVocabBatchPruefPrompt(eintraege: VocabEntry[], stufe?: string): string {
  const punkte = [
    'Prüfe diese Lern-Vokabeleinträge kritisch — JEDEN in denselben fünf Punkten:',
    '1. Übersetzung: stimmt die deutsche Bedeutung zum Begriff (und umgekehrt)? Es genügt EINE korrekte Hauptbedeutung — nicht alle Bedeutungsnuancen.',
    `2. Grammatik/Rechtschreibung in der Zielsprache und im Deutschen.`,
    `3. Umschrift/Ton/Betonung: ${pruefPunktDrei(String(eintraege[0]?.language ?? ''))}`,
    '4. Natürlichkeit: klingt der Beispielsatz wie ein echter Satz der Zielsprache?',
    stufe
      ? `5. Stufe ${stufe}: ist das Wort für diese Stufe typisch und häufig genug?`
      : '5. Passung: ist das Wort ein grundlegender, hochfrequenter Alltagsbegriff (ohne feste Niveaustufe)? Mehrdeutigkeit schließt hohe Frequenz nicht aus.',
  ];
  return [
    ...punkte,
    '',
    'Die Einträge (nummeriert):',
    JSON.stringify(eintraege.map((eintrag, index) => ({ index, eintrag })), null, 2),
    '',
    'Antworte NUR mit JSON — GENAU EIN Urteil je index, in derselben Reihenfolge:',
    '{ "urteile": [ { "index": 0, "urteil": "bestehen" | "mangel", "gruende": ["…"] }, … ] }',
    '"bestehen" nur, wenn ALLE Punkte für diesen Eintrag stimmen. Jeder Mangel bekommt einen kurzen Grund.',
  ].join('\n');
}

/** Urteils-JSON lesen — toleriert Code-Zäune, sonst Fehler. */
export function parseUrteil(roh: string): KreuzUrteil {
  const json = roh.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const geparst = JSON.parse(json) as { urteil?: unknown; gruende?: unknown };
  if (
    typeof geparst !== 'object' ||
    geparst === null ||
    (geparst.urteil !== 'bestehen' && geparst.urteil !== 'mangel')
  ) {
    throw Error('Prüfer-Antwort ist kein gültiges Urteils-JSON.');
  }
  const gruende = Array.isArray(geparst.gruende)
    ? geparst.gruende.filter((g): g is string => typeof g === 'string')
    : [];
  return { bestanden: geparst.urteil === 'bestehen', gruende };
}

const KEIN_URTEIL: KreuzUrteil = {
  bestanden: false,
  gruende: ['Kein Urteil für diesen Eintrag erhalten.'],
};

/**
 * Rettung für verkürzte Prüfer-Antworten: vom letzten vollständigen Urteil-
 * Objekt aus das Array schließen und parsen. Liefert die geretteten Roh-
 * Urteile oder null, wenn nichts Vergleichbares übrig bleibt.
 */
function retteUrteile(text: string): unknown[] | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let versuche = 0;
  for (
    let ende = text.lastIndexOf('}');
    ende > start && versuche < 40;
    ende = text.lastIndexOf('}', ende - 1)
  ) {
    versuche += 1;
    try {
      const geparst = JSON.parse(
        text.slice(start, ende + 1).trimEnd().replace(/,\s*$/, '') + ']'
      ) as unknown;
      if (Array.isArray(geparst) && geparst.length > 0) return geparst;
    } catch {
      // Das '}' gehörte wohl in ein halbes Urteil — das vorherige versuchen.
    }
  }
  return null;
}

/**
 * Urteile für ein GANZES Paket lesen. Versteht das Batch-Format
 * (`{ "urteile": [ … ] }`) und — tolerant, etwa wenn ein Modell bei einem
 * Eintrag in die Einzelform rutscht — das Einzelurteil. Kaputte/abgebrochene
 * Antworten werden am letzten vollständigen Urteil GERETTET (dieselbe Regel
 * wie bei der Erzeugung — bezahlte Antworten nicht wegwerfen). Fehlende
 * Indizes werden NICHT erraten: Sie gelten als Mangel (fail-closed).
 */
export function parseUrteile(roh: string, anzahl: number): KreuzUrteil[] {
  const json = roh.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let geparst: { urteile?: unknown };
  try {
    geparst = JSON.parse(json) as { urteile?: unknown };
  } catch (fehler) {
    const gerettet = retteUrteile(json);
    if (!gerettet) throw fehler;
    geparst = { urteile: gerettet };
  }
  if (!Array.isArray(geparst.urteile)) {
    // Einzelform: ein Eintrag im Paket, das Modell antwortete wie gehabt.
    if (anzahl === 1) return [parseUrteil(json)];
    throw Error('Prüfer-Antwort enthält keine "urteile"-Liste.');
  }
  const jeIndex = new Map<number, KreuzUrteil>();
  let position = 0;
  for (const rohUrteil of geparst.urteile) {
    if (typeof rohUrteil !== 'object' || rohUrteil === null) continue;
    const eintrag = rohUrteil as Record<string, unknown>;
    const index = typeof eintrag.index === 'number' ? eintrag.index : position;
    if (index < 0 || index >= anzahl || jeIndex.has(index)) continue;
    jeIndex.set(index, {
      bestanden: eintrag.urteil === 'bestehen',
      gruende: Array.isArray(eintrag.gruende)
        ? eintrag.gruende.filter((g): g is string => typeof g === 'string')
        : [],
    });
    position += 1;
  }
  return Array.from({ length: anzahl }, (_, index) => jeIndex.get(index) ?? { ...KEIN_URTEIL });
}

/** Ein Prüf-Durchlauf für ein Paket: Prompt an einen Client, Urteile parsen. */
async function einmalPaket(client: TextClient, prompt: string, anzahl: number): Promise<KreuzUrteil[]> {
  const antwort = await client.complete({
    system:
      'Du bist ein strenger Lektor für Lernmaterialien. Du prüfst inhaltlich und sprachlich und antwortest ausschließlich mit dem geforderten Urteils-JSON.',
    user: prompt,
    maxTokens: 4000,
  });
  return parseUrteile(antwort.text, anzahl);
}

/** Durchlauf mit EINER Wiederholung — kaputte Antworten (abgebrochenes JSON) passieren. */
async function einmalPaketMitWiederholung(
  client: TextClient,
  prompt: string,
  anzahl: number
): Promise<KreuzUrteil[]> {
  try {
    return await einmalPaket(client, prompt, anzahl);
  } catch {
    return await einmalPaket(client, prompt, anzahl);
  }
}

export type KreuzResultat = {
  geprueft: boolean;
  /** true = echte Kreuzprüfung (zweiter Anbieter), false = Selbstprüfung. */
  kreuz: boolean;
  urteile: KreuzUrteil[];
  gruende: string[];
};

/**
 * Ein GANZES Paket kreuzprüfen — ein Prüfaufruf je Runde statt einem je
 * Eintrag. Semantik je Eintrag identisch zum früheren Einzelweg: echte
 * Kreuzprüfung genügt ein Durchlauf; bei der Selbstprüfung (gleicher
 * Anbieter) bekommen die Bestandenen eine ZWEITE Runde — und zwar nur
 * sie, nicht das ganze Paket noch einmal.
 */
export async function pruefeVocabKreuzBatch(
  eintraege: VocabEntry[],
  stufe: string | undefined,
  erzeuger: ProviderId,
  hatSchluessel: (anbieter: ProviderId) => boolean,
  clientFuer: (anbieter: ProviderId) => TextClient,
  prueferWahl?: ProviderId
): Promise<KreuzResultat[]> {
  if (eintraege.length === 0) return [];
  const { anbieter, selbstpruefung } = gegenStueck(erzeuger, hatSchluessel, prueferWahl);
  const prompt = baueVocabBatchPruefPrompt(eintraege, stufe);
  const erst = await einmalPaketMitWiederholung(clientFuer(anbieter), prompt, eintraege.length);

  const resultate: KreuzResultat[] = eintraege.map((_, index) => {
    const urteil = erst[index];
    if (urteil.bestanden) {
      return { geprueft: !selbstpruefung, kreuz: !selbstpruefung, urteile: [urteil], gruende: [] };
    }
    return { geprueft: false, kreuz: !selbstpruefung, urteile: [urteil], gruende: urteil.gruende };
  });

  // Selbstprüfung: nur die Bestandenen der ersten Runde laufen noch einmal.
  const durchgelassen = resultate
    .map((resultat, index) => ({ resultat, index }))
    .filter(({ resultat }) => resultat.urteile[0].bestanden);
  if (selbstpruefung && durchgelassen.length > 0) {
    const wiederholung = await einmalPaketMitWiederholung(
      clientFuer(anbieter),
      baueVocabBatchPruefPrompt(durchgelassen.map(({ index }) => eintraege[index]), stufe),
      durchgelassen.length
    );
    for (const [position, { resultat }] of durchgelassen.entries()) {
      const zweites = wiederholung[position];
      resultat.urteile = [resultat.urteile[0], zweites];
      if (!zweites.bestanden) {
        resultat.gruende = zweites.gruende;
      }
    }
  }
  return resultate;
}

/** Vokabel-Eintrag kreuzprüfen (Einzelfall — der Lauf nutzt die Batch-Funktion). */
export async function pruefeVocabKreuz(
  eintrag: VocabEntry,
  stufe: string | undefined,
  erzeuger: ProviderId,
  hatSchluessel: (anbieter: ProviderId) => boolean,
  clientFuer: (anbieter: ProviderId) => TextClient,
  prueferWahl?: ProviderId
): Promise<KreuzResultat> {
  const [resultat] = await pruefeVocabKreuzBatch(
    [eintrag],
    stufe,
    erzeuger,
    hatSchluessel,
    clientFuer,
    prueferWahl
  );
  return resultat;
}
