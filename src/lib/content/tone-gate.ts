import { activeVocabulary } from '@/data/active-vocabulary';
import type { AudioClip } from '../clips/types';
import { normalizeClipText } from '../clips/types';
import {
  analyzeToneContour,
  konturBewegung,
  longestRun,
  medianReferenceHz,
  octaveCorrect,
  semitones,
  summarizeContour,
  trimEdges,
  voicedRuns,
  type F0Frame,
  type ToneContourMeasurement,
  type ToneContourSummary,
} from '../speaking/analysis';
import { TONE_KEYS, type Tone } from '@/constants/tones';
import { tonfolgeAusRoman } from './roman-tone';
import { hoherTonSteigtAn, vorlagenUrteil, VORLAGE_P_MAX } from './tone-template';
import { richteSilbenAus } from './silben-ausrichtung';
import { silbenbauFolge } from './silbenbau';

export const TONE_GATE_VERSION = 'f0-syllables-6';
export const TONE_GATE_LIMITS =
  'Filter gegen grobe Tonhöhenfehler je Silbe, kein Qualitätsnachweis. Konsonanten, Vokallänge und Aspiration werden nicht geprüft. Wörter werden silbenweise gegen syllables[].tone geprüft, Beispielsätze gegen die Tonfolge ihrer Roman-Umschrift; Aufrufer können Solltöne auch direkt übergeben, sonst bleiben Dialogzüge ungeprüft. Silbengrenzen kommen aus einer Ausrichtung der stimmhaften Stücke auf die Soll-Silben, die aus der Umschrift weiß, wo stimmlose Lücken zu erwarten sind; nur Grenzen an einer deutlichen Lücke gelten als gemessen, geratene Grenzen verwerfen nie. Fallend gilt nur mit spätem, steilem Abfall (ein lineares Absinken spricht die Stimme auch bei mittel und tief), steigend nur mit Senke vor dem Anstieg; ein Widerspruch ist nur die GEGENLÄUFIGE Bewegung an einer sicher zugeschnittenen Silbe. Freigegeben wird ein Mehrsilber nur, wenn JEDE fallende und steigende Silbe klar erkennbar ist. Die Registerlage von mittel, tief und hoch bleibt ohne Sprecherreferenz ungeprüft; innerhalb eines Clips wird nur die Ordnung benachbarter Silben geprüft (AE-7/AE-8), und allein trägt sie eine Freigabe erst ab 3 Halbtönen. Einsilber mit mittlerem oder tiefem Ton sind einzeln nicht prüfbar; ein einzelner hoher Ton gilt nur bei deutlichem Anstieg zum Ende als geprüft. Lassen sich Silben nicht sicher prüfen, vergleicht ein Vorlagenabgleich die ganze Tonkurve mit gelernten Tonformen und mit zufälligen Tonfolgen — er stuft nur hoch (ungeprüft → bestanden), verwirft nie. Vertauschte Registertöne (mittel/tief/hoch) bleiben die größte Lücke. System-TTS wird durch diesen Filter nicht geprüft.';

export type ToneCheck = {
  status: 'passed' | 'failed' | 'unchecked' | 'not-applicable';
  reason: string;
  version: string;
  /** Sollton der einzigen Silbe (Einsilber; Kompatibilität zu Berichten). */
  targetTone?: Tone;
  /** Solltonfolge aller Silben (Mehrsilber und Sätze). */
  targetTones?: Tone[];
  /** Woher die Solltöne stammen — Fehlertexte und Berichte lesen das ab. */
  quelle?: 'wort-silben' | 'satz-roman' | 'aufrufer';
  sourceId?: string;
  source?: string;
  voicedMs?: number;
  summary?: ToneContourSummary;
  /** Urteil je Soll-Silbe, parallel zu targetTones (nur die FORM). */
  silben?: { tone: Tone; form: SilbenForm }[];
  /** Register-Ordnung zwischen Silben desselben Clips (seit 18.09. Nachmittag). */
  ordnung?: { erfuellt: number; widerspruch?: { von: number; bis: number } };
  /**
   * Lage jeder Silbe in Halbtoenen zur CLIP-eigenen Referenz — das Rohmaterial
   * der Register-Laufprobe (20.09.). Nur Mehrsilber liefern hier etwas:
   * ein Einsilber IST seine eigene Referenz und stuende zwangslaeufig auf 0.
   */
  lagen?: { tone: Tone; halbtoene: number }[];
  track?: { seconds: number; hz: number; correlation: number }[];
  /** Nur mit `optionen.diagnose`: Sechs-Punkt-Kontur, Nachlauf und Fensterzahl je Silbe. */
  diagnose?: { pts: number[]; nachlauf: number; fenster: number }[];
};

/**
 * Nur die Felder, die die Pruefung liest. Frisch generierte Clips liegen
 * als `AudioClipSpec` vor, noch ohne Format, Groesse und Ablageschluessel —
 * die Pruefung soll vor dem Ablegen laufen koennen, nicht erst danach.
 */
export type ToneCheckClip = Pick<AudioClip, 'language' | 'text' | 'kind' | 'sourceId'>;

/**
 * Der Wortschatz, aus dem das Tor die Solltoene liest. Strukturell erfuellt
 * von `VocabEntry` (Grundstock UND Erzeugungs-Prompt-Daten) und von den
 * Katalog-Dokumenten der Node-Pipeline — absichtlich kein Volltyp, damit
 * Browser-Store, Helper und Tests dieselbe Funktion fuettern koennen.
 *
 * SEIT 18.09. ohnehin Pflicht fuer den echten Lauf: der alte Default griff
 * nur auf den 84-Eintraege-Altbestand zu und verlangte `sourceVerified`,
 * das KI-Woerter bewusst nie tragen — alle 2000 Woerter des Thai-Laufs
 * waeren ungeprueft durchgerutscht.
 */
export type ToneWort = {
  id: string;
  term: string;
  syllables?: readonly { tone?: Tone; roman?: string }[];
  exampleTerm?: string;
  exampleRoman?: string;
  /**
   * Quellengeprüfter Grundstock ODER KI-geprüfte Erzeugung: Seit dem
   * Publish-Fix 16.09. tragen KI-Wörter bewusst nie `sourceVerified`, ihre
   * Prüfung steht in `verificationNote` („KI-Kreuzprüfung bestanden …" /
   * „KI-Erzeugung, einfach geprüft …"). Die zwei Altbestand-Wörter mit
   * „UNSICHER:"-Notiz (raan, noon) bleiben vom Tor ausgeschlossen — ihre
   * Notiz ist eine Warnung, kein Prüf-Nachweis.
   */
  sourceVerified?: boolean;
  verificationNote?: string;
  source?: string;
};

export type ToneKontext = { woerter: readonly ToneWort[] };

/**
 * Register-Rang der fuenf Toene fuer die paarweise Ordnungspruefung.
 *
 * Ohne kalibrierte Sprecherreferenz ist die ABSOLUTE Lage von mittel/tief/hoch
 * nicht pruefbar — aber INNERHALB eines Clips sind die Silben untereinander
 * vergleichbar (derselbe Sprecher, dieselbe Aufnahme): hoch endet oben,
 * steigend endet oben, fallend startet oben, mittel liegt mittig, tief unten.
 * Die drei „oberen" Toene stehen deshalb auf EINEM Rang: zwischen ihnen ist
 * die Lagendifferenz zu klein und vor allem uebergangsanfaellig (eine hoch-
 * Silbe faellt zum tief startenden steigenden Ton der Naechsten ab —
 * ซีอิ๊วขาว, 18.09.), das waere kein Sprechfehler. Ordnung gibt es nur
 * zwischen den Lagenklassen oben/mittel/tief.
 */
const REGISTER_RANG: Record<Tone, number> = { high: 3, rising: 3, falling: 3, mid: 1, low: 0 };
const ORDNUNG_ERFUELLT_HALBTOENE = 1.5;
/**
 * Trägt die Ordnung eine Freigabe ALLEIN (keine Silbe mit geprüfter Form),
 * muss der Abstand größer sein. Am Korpus gab eine einzige erfüllte Ordnung
 * mit 1,5 Halbtönen bei vertauschten Registertönen 11 % falsche Freigaben.
 */
const ORDNUNG_ALLEIN_HALBTOENE = 3;
const ORDNUNG_WIDERSPRUCH_HALBTOENE = -2.5;
/**
 * Nur BENACHBARTE Silben werden in der Lage verglichen (20.09.).
 *
 * Gesprochene Aeusserungen sacken zum Ende hin ab (Deklination). Bei
 * zwei- und dreisilbigen Woertern faellt das nicht ins Gewicht — dort
 * aendert die Grenze nichts, alle Paare bleiben nah. Ein SATZ traegt aber
 * bis zu 15 Silben: zwischen Silbe 1 und Silbe 12 stammt der Lagenabstand
 * dann ueberwiegend aus dem Absacken der Stimme und nicht aus dem Ton — so
 * ein Vergleich wuerde korrekt gesprochene Saetze verwerfen. Schon zwei
 * Schritte reichen dafuer aus (nachgerechnet: eine hohe Silbe am Satzende
 * liegt gegen eine mittlere zwei Plaetze davor rechnerisch im Widerspruch,
 * obwohl nichts falsch gesprochen ist). Benachbarte Silben teilen dieselbe
 * Sprechlage und sind der belastbare Teil.
 */
const MAX_ORDNUNG_ABSTAND = 1;

function tonalgGeprueft(wort: ToneWort): boolean {
  return wort.sourceVerified === true || wort.verificationNote?.startsWith('KI-') === true;
}

/**
 * Solltöne eines Clips. `roman` (eine Umschrift je Silbe, falls bekannt)
 * liefert den Silbenbau für die Ausrichtung — Grenzerwartung und Dauer.
 */
export type SollToene = {
  toene: Tone[];
  quelle: 'wort-silben' | 'satz-roman' | 'aufrufer';
  wortId: string;
  roman?: string[];
};

/** Solltonfolge eines Clips aus dem Wortschatz — oder null, wenn es keinen Soll gibt. */
export function sollToneFuerClip(
  clip: ToneCheckClip,
  woerter: readonly ToneWort[]
): SollToene | null {
  if (clip.kind === 'vocab') {
    const wort = woerter.find((w) => w.id === clip.sourceId && w.term === clip.text);
    if (!wort?.syllables?.length || !tonalgGeprueft(wort)) return null;
    const toene: Tone[] = [];
    for (const silbe of wort.syllables) {
      if (!silbe.tone || !TONE_KEYS.includes(silbe.tone)) return null;
      toene.push(silbe.tone);
    }
    const roman = wort.syllables.every((silbe) => silbe.roman) ? wort.syllables.map((silbe) => silbe.roman!) : undefined;
    return { toene, quelle: 'wort-silben', wortId: wort.id, ...(roman ? { roman } : {}) };
  }
  if (clip.kind === 'example') {
    const wort = woerter.find((w) => w.id === clip.sourceId);
    if (!wort?.exampleRoman || !wort.exampleTerm || !tonalgGeprueft(wort)) return null;
    // Clip-Texte laufen normalisiert (Leerzeichen kollabiert) durch den Plan;
    // derselbe Vergleich auf beiden Seiten, sonst lehnt das Tor den Bezug ab.
    if (normalizeClipText(clip.text) !== normalizeClipText(wort.exampleTerm)) return null;
    const toene = tonfolgeAusRoman(wort.exampleRoman);
    const roman = wort.exampleRoman.split(/[-\s]+/).filter(Boolean);
    return toene ? { toene, quelle: 'satz-roman', wortId: wort.id, ...(roman.length === toene.length ? { roman } : {}) } : null;
  }
  return null;
}

/**
 * Wie viel Bewegung eine Silbe zeigen muss, um als fallend/steigend zu
 * GELTEN — und ab wann die Gegenbewegung ein echter Widerspruch ist.
 *
 * Gemessen am echten Lauf (20.09., alle 31 Thai-Clips des Nutzers plus die
 * Diagnose-Stimmen): korrekt gesprochene fallende Silben bringen 4 bis 9
 * Halbtoene Abfall nach dem Gipfel, steigende 4,5 bis 6 Halbtoene Anstieg
 * nach dem Tal. Unter 1,5 Halbtoenen ist ueberhaupt keine Bewegung da.
 */
const FORM_KLAR_HALBTOENE = 3;
/**
 * Darunter ist ueberhaupt keine Bewegung da — eine ebene Silbe ist kein
 * fallender und kein steigender Ton, und das ist ohne Sprecherreferenz
 * belastbar messbar. Zwischen Spur und „klar" liegt das neutrale 'knapp'.
 */
const FORM_SPUR_HALBTOENE = 1.5;
/**
 * Wo der Wendepunkt liegen darf. Der fallende Ton setzt oft tief an, steigt
 * kurz und faellt dann (เจ้าสาว: Gipfel bei 40 %) — der Gipfel darf also
 * wandern, nur nicht ans Ende, sonst ist es eine steigende Silbe.
 */
const WENDEPUNKT_FRUEH = 0.6;

export type SilbenForm = 'geprueft' | 'widerspruch' | 'gegen' | 'knapp' | 'register';

/**
 * FORM DES FALLENDEN TONS (24.10.2026, f0-syllables-6): Ein Fall nach dem
 * Gipfel allein reicht nicht. coral spricht mittel und tief als LINEARES
 * Absinken (Einsilber im Median 1,9 → −4,3 Halbtöne über die Silbe) — die
 * alte Regel (Fall ≥ 3 nach dem Gipfel) hielt 85 % der mittleren Einsilber
 * für fallend. Der gesprochene fallende Ton bleibt in der ersten Hälfte eben
 * oder steigt und stürzt erst im letzten Drittel. Geprüft ist er deshalb
 * nur, wenn der späte Abfall (60 % → Ende) mindestens 3 Halbtöne beträgt
 * und deutlich steiler ist als ein frühes Absinken (0 → 60 %).
 */
function fallIstSpaet(pts: readonly number[], mindestens: number): boolean {
  const spaet = pts[3] - pts[5];
  const frueh = Math.max(0, pts[0] - pts[3]);
  return spaet >= mindestens && spaet >= 2 * frueh + 1;
}
/**
 * Mindestens so viel später Abfall: Einsilber 5, letzte Silbe 4, innere 3
 * Halbtöne. Am Korpus (coral) hält das falsche Fälle bei mittel/tief unter
 * 13 % (Einsilber) bzw. 8 % (Mehrsilber) — Einsilber fallend 54 %, letzte
 * Silbe 65 %, innere 41 % geprüft.
 */
function spaeterFallMindestens(einzeln: boolean, amEnde: boolean): number {
  return einzeln ? 5 : amEnde ? 4 : FORM_KLAR_HALBTOENE;
}

/**
 * FORM DES STEIGENDEN TONS (24.10.2026): Der hohe Ton steigt bei coral oft
 * zum Ende hin an (Einsilber: 55 % mit Anstieg ≥ 3). Der steigende Ton hat
 * davor eine SENKE unter den Ansatz. Mit Senke ≥ 1,5 Halbtöne: steigend
 * 78 %, hoch 9 %, mittel/tief 1 %.
 */
const SENKE_HALBTOENE = 1.5;
function hatSenke(pts: readonly number[]): boolean {
  return pts[0] - Math.min(...pts) >= SENKE_HALBTOENE;
}

/**
 * Formurteil einer Silbe. 'register' heisst: ohne Sprecherreferenz keine
 * Aussage moeglich; 'knapp' heisst: Bewegung da, aber nicht klar genug.
 * 'gegen' (seit f0-syllables-6): eine Registersilbe zeigt klar die Form
 * eines Konturtons (mittel/tief mit Senke und Anstieg, hoch mit Sturz) —
 * kein Verwurf, aber auch keine Freigabe. 'knapp' an einer hohen Silbe vor
 * einer tief ansetzenden (Übergang) hält die Freigabe nicht auf.
 *
 * WARUM NUR DIE GEGENBEWEGUNG VERWIRFT (20.09., Nutzerwunsch „verbesser die
 * Thai-Audio-Ueberpruefung"): Die alten Schwellen massen `slope` =
 * Ende−Anfang und verwarfen alles darunter. Nachgemessen an den echten
 * Clips traf das korrekt gesprochene Silben — เจ้าสาว (jâao, fallend) faellt
 * nach seinem Gipfel um 4,1 Halbtoene, hat wegen des tiefen Ansatzes aber
 * nur `slope` −1,65 und wurde VERWORFEN; ebenso ลูกสาว bei zwei von drei
 * Stimmen und ด้าน bei alloy. Jeder Verwurf kostet beim naechsten Lauf
 * erneut Geld und laesst den Clip dauerhaft fehlen, wenn die Stimme
 * reproduzierbar so spricht. Ein Ton ist deshalb nur dann widerlegt, wenn
 * die Kontur klar das GEGENTEIL tut (fallend gefordert, Silbe steigt klar
 * und faellt nirgends) — genau das, was ohne Sprecherreferenz ueberhaupt
 * belastbar messbar ist. Alles dazwischen zaehlt neutral.
 */
function formurteil(
  ton: Tone,
  summary: ToneContourSummary,
  einzeln: boolean,
  amEnde = true,
  /** Wie tief es direkt NACH dem Zug noch hinuntergeht (Halbtöne, siehe `nachlaufTiefe`). */
  nachlauf = 0,
  /** Sollton der nächsten Silbe im Mehrsilber. */
  naechster?: Tone
): SilbenForm {
  const bewegung = konturBewegung(summary);
  const pts = summary.pts;
  const steigtKlar = bewegung.stieg >= FORM_KLAR_HALBTOENE && bewegung.talBei <= WENDEPUNKT_FRUEH && hatSenke(pts);
  if (ton === 'falling') {
    if (bewegung.fall >= FORM_KLAR_HALBTOENE && bewegung.gipfelBei <= WENDEPUNKT_FRUEH && fallIstSpaet(pts, spaeterFallMindestens(einzeln, amEnde))) return 'geprueft';
    // Kein nennenswerter Abfall IRGENDWO in der Silbe: der fallende Ton ist
    // nicht gesprochen worden — egal ob die Silbe steigt oder eben bleibt.
    // AUSSER der Fall steht im Nachlauf: Seit dem stetigen Tonhöhenpfad
    // (17.10.2026) reißt das steile Ende eines Falls ins Knarren oft als
    // eigener, zu kurzer Zug ab (สุภาพ, อย่างมาก, ทอดไข่) — die Silbe selbst
    // wirkt eben, gesprochen ist der Fall trotzdem. Dann kein Verwurf.
    if (bewegung.fall < FORM_SPUR_HALBTOENE) return nachlauf >= FORM_KLAR_HALBTOENE ? 'knapp' : 'widerspruch';
    return 'knapp';
  }
  if (ton === 'rising') {
    if (steigtKlar) return 'geprueft';
    // NICHT-LETZTE Silbe (23.09.2026): Im Fluss wird der steigende Ton vor
    // der nächsten Silbe abgeschnitten und steigt kaum — am Bestand gemessen
    // „widersprach" er davor bei 24 % der angenommenen Clips, als letzte
    // Silbe bei 0 %. Ein fehlender Anstieg ist dort kein Beweis.
    if (bewegung.stieg < FORM_SPUR_HALBTOENE) return amEnde ? 'widerspruch' : 'knapp';
    return 'knapp';
  }
  // mittel, tief, hoch: die LAGE unterscheidet sie, und die ist ohne
  // Sprecherreferenz nicht pruefbar (die Ordnungspruefung deckt sie ab).
  // Einzige Ausnahme bleibt der ISOLIERTE hohe Ton, der deutlich faellt —
  // im Mehrsilber ist derselbe Abfall meist der Uebergang zur naechsten
  // (oft tief startenden) Silbe und darf nicht verwerfen (ซีอิ๊วขาว, 18.09.).
  // Beim hohen Ton bleibt es bei der an den AE-31-Referenzaufnahmen
  // kalibrierten Anfang-Ende-Schwelle: `edge_Niwat_maa_high` faellt nach
  // seinem Gipfel um 3,2 Halbtoene und ist trotzdem korrekt gesprochen —
  // ein hoher Ton DARF am Ende absacken, er muss nur oben ANFANGEN. Nur der
  // durchgehende Fall (Anfang−Ende) widerspricht ihm.
  if (ton === 'high' && summary.slope < -FORM_KLAR_HALBTOENE && bewegung.stieg < FORM_SPUR_HALBTOENE) {
    // Fällt die hohe Silbe in eine TIEF ansetzende nächste (steigend, tief),
    // ist das der Übergang (ซีอิ๊วขาว) — sonst spricht der Sturz gegen hoch:
    // am Korpus hielt das vertauschte Registertöne von 19 % auf 12 %.
    if (einzeln) return 'widerspruch';
    return naechster === 'rising' || naechster === 'low' ? 'knapp' : 'gegen';
  }
  // Klare Konturform an einer Registersilbe: Senke und Anstieg (mittel/tief
  // zeigen das am Korpus bei 1 %) — spricht gegen den Sollton, verwirft aber
  // nicht (Satzmelodie, Übergänge).
  if ((ton === 'mid' || ton === 'low') && steigtKlar) return 'gegen';
  return 'register';
}

/** Kürzer (in 10-ms-Fenstern) ist eine eigene Silbe kaum je stimmhaft. */
const KURZER_ZUG_FENSTER = 8;

/** Höchstens so weit hinter einem Zug zählt der Nachlauf (15 Fenster). */
const NACHLAUF_FENSTER = 15;

/**
 * Wie tief die stimmhaften Fenster direkt NACH einem Zug unter dessen
 * Gipfel liegen — auch Bruchstücke unter der Mindestlänge eines Zugs. Nur
 * bis zum nächsten Zug und höchstens 150 ms; Werte unter der halben
 * Gipfelfrequenz bleiben als mögliche Oktavfehler außen vor.
 */
function nachlaufTiefe(frames: readonly F0Frame[], zug: readonly F0Frame[], naechster?: readonly F0Frame[]): number {
  const ende = frames.indexOf(zug[zug.length - 1]);
  if (ende < 0) return 0;
  const grenze = naechster ? frames.indexOf(naechster[0]) : frames.length;
  const gipfel = Math.max(...zug.map((frame) => frame.f0));
  let tiefste = 0;
  for (let i = ende + 1; i < Math.min(grenze, ende + 1 + NACHLAUF_FENSTER); i++) {
    const f0 = frames[i].f0;
    if (f0 > 0 && f0 >= gipfel / 2) tiefste = Math.max(tiefste, semitones(gipfel, f0));
  }
  // Seit f0-syllables-6: auch der ANSATZ der direkt folgenden Silbe (erste
  // drei Fenster, höchstens 150 ms später). Im Satz läuft der Fall einer
  // inneren Silbe oft erst in die nächste hinein — am Korpus zeigten 20 %
  // der inneren fallenden Silben in sich gar keinen Fall.
  if (naechster && naechster.length >= 3 && grenze >= 0 && grenze - ende <= NACHLAUF_FENSTER) {
    const ansatz = medianVonZahlen(naechster.slice(0, 3).map((frame) => frame.f0));
    if (ansatz >= gipfel / 2) tiefste = Math.max(tiefste, semitones(gipfel, ansatz));
  }
  return tiefste;
}

function medianVonZahlen(werte: number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.floor(sortiert.length / 2)];
}

/**
 * Lagekennwert einer Silbe in Hz, passend zum Sollton: die drei oberen Toene
 * (hoch bleibt oben, steigend ENDET oben, fallend STARTET oben) zaehlen ihr
 * MAXIMUM — das bleibt vom Abfall zum Uebergang in die naechste Silbe
 * unberuehrt (Enddrittel wurde bei ซีอิ๊วขาว nach unten gezogen, 18.09.);
 * mittel und tief zaehlen den Median der ganzen Silbe.
 */
function lageFuer(ton: Tone, span: readonly F0Frame[]): number {
  if (ton === 'high' || ton === 'rising' || ton === 'falling') {
    return Math.max(...span.map((frame) => frame.f0));
  }
  return medianVonZahlen(span.map((frame) => frame.f0));
}

/** Paarweise Register-Ordnung der Silben untereinander, gegen EINE gemeinsame Clip-Referenz. */
function ordnungsUrteile(
  silbenToene: Tone[],
  spans: readonly (readonly F0Frame[])[],
  clipReferenzHz: number
): { erfuellt: number; stark: number; offen: number; widerspruch?: { von: number; bis: number }; lagen: { tone: Tone; halbtoene: number }[] } {
  const lagen = spans.map((span, i) => ({ nr: i, rang: REGISTER_RANG[silbenToene[i]], lage: semitones(lageFuer(silbenToene[i], span), clipReferenzHz) }));
  let erfuellt = 0;
  let stark = 0;
  let offen = 0;
  let widerspruch: { von: number; bis: number } | undefined;
  for (let i = 0; i < lagen.length && !widerspruch; i++) {
    for (let j = i + 1; j < lagen.length; j++) {
      if (j - i > MAX_ORDNUNG_ABSTAND) break;
      const richtung = Math.sign(lagen[i].rang - lagen[j].rang);
      if (richtung === 0) continue;
      // Steht die TIEFERE Silbe vorn und ist die spätere mittel oder
      // steigend, arbeitet die Satzmelodie (vorn hoch, hinten abgesenkt)
      // gegen den Ton: am Bestand lag tief vor mittel im Median sogar
      // DARÜBER (−0,8 Halbtöne am Wortanfang), mittel/tief vor steigend
      // trennten kaum (Median 0 bis 1,8). Solche Paare werden nicht gewertet
      // — weder als Beleg noch als Widerspruch (23.09.2026).
      if (richtung < 0 && (silbenToene[j] === 'mid' || silbenToene[j] === 'rising')) continue;
      // Die erwartete Richtung haengt am RANG-Unterschied, nicht an der
      // Reihenfolge: bei [tief, mittel] soll Silbe i UNTER Silbe j liegen —
      // genau das war am 18.09. Abend als Widerspruch verworfen worden und
      // hat im Nutzer-Lauf korrekt gesprochene Clips kostenpflichtig gekillt.
      const diff = richtung * (lagen[i].lage - lagen[j].lage);
      if (diff <= ORDNUNG_WIDERSPRUCH_HALBTOENE) {
        widerspruch = { von: i + 1, bis: j + 1 };
        break;
      }
      if (diff >= ORDNUNG_ERFUELLT_HALBTOENE) erfuellt += 1;
      else offen += 1;
      if (diff >= ORDNUNG_ALLEIN_HALBTOENE) stark += 1;
    }
  }
  return {
    erfuellt,
    stark,
    offen,
    ...(widerspruch ? { widerspruch } : {}),
    lagen: lagen.map((eintrag) => ({ tone: silbenToene[eintrag.nr], halbtoene: eintrag.lage })),
  };
}

/**
 * REGISTER-LAUFPROBE (20.09.): Was einzeln nicht geht, geht ueber den Lauf.
 *
 * Die ABSOLUTE Lage von mittel/tief/hoch ist in EINEM Clip nicht pruefbar —
 * nachgemessen am Bestand des Nutzers streut die Sprechlage von Clip zu Clip
 * um rund fuenf Halbtoene, also genauso weit, wie die Register selbst
 * auseinanderliegen. Rechnet man die Lage jeder Silbe aber gegen die
 * Referenz IHRES Clips, faellt dieser Versatz heraus, und ueber viele Clips
 * bleibt die Systematik der Stimme uebrig: an den 31 echten Clips lagen tiefe
 * Silben im Mittel −2,0, mittlere −0,0 und hohe +4,6 Halbtoene.
 *
 * Eine Stimme, die die Register gar nicht markiert, faellt hier auf — und
 * genau dieser Fall ist der teure: Einsilber mit mittel/tief/hoch sind 64 %
 * des Wortschatzes und einzeln unbeweisbar. Die Probe verwirft nie einen
 * einzelnen Clip; sie urteilt nur ueber die STIMME.
 */
export type RegisterProbe = { low: number[]; mid: number[]; high: number[] };
export const REGISTER_PROBE_MIN = 25;
/** Mindestabstand hoch−tief im Mittel; gemessen waren es 6,6 Halbtoene. */
export const REGISTER_PROBE_ABSTAND = 2;

export function leereRegisterProbe(): RegisterProbe {
  return { low: [], mid: [], high: [] };
}

export function sammleRegisterProbe(probe: RegisterProbe, check: ToneCheck): void {
  for (const lage of check.lagen ?? []) {
    if (lage.tone === 'low' || lage.tone === 'mid' || lage.tone === 'high') probe[lage.tone].push(lage.halbtoene);
  }
}

function mittel(werte: readonly number[]): number {
  return werte.reduce((summe, wert) => summe + wert, 0) / werte.length;
}

export function beurteileRegisterProbe(probe: RegisterProbe): {
  genug: boolean;
  getrennt: boolean;
  abstand: number;
  mittelwerte: { low: number; mid: number; high: number };
} {
  const genug = probe.low.length >= REGISTER_PROBE_MIN && probe.high.length >= REGISTER_PROBE_MIN;
  const mittelwerte = {
    low: probe.low.length ? mittel(probe.low) : 0,
    mid: probe.mid.length ? mittel(probe.mid) : 0,
    high: probe.high.length ? mittel(probe.high) : 0,
  };
  const abstand = mittelwerte.high - mittelwerte.low;
  return { genug, getrennt: abstand >= REGISTER_PROBE_ABSTAND, abstand, mittelwerte };
}

/**
 * Optionen der Tonprüfung.
 * `sollToene`: Solltöne direkt vom Aufrufer (z. B. aus einer Regel-Engine
 * über die Thai-Schrift). Dann wird der Wortschatz nicht gelesen; die Folge
 * muss genau eine Silbe je Ton haben. Ungültige Töne → ungeprüft.
 */
export type ToneCheckOptionen = {
  track?: boolean;
  /** Kontur je Silbe mitliefern (nur für Auswertungen, z. B. tone-eval.cjs). */
  diagnose?: boolean;
  sollToene?: readonly Tone[];
  /** Umschrift je Silbe zu `sollToene` (gleich lang), z. B. „khâo“; nur für die Ausrichtung. */
  sollRoman?: readonly string[];
};

export function checkThaiTone(
  clip: ToneCheckClip,
  pcm: Float32Array,
  sampleRate: number,
  kontext?: ToneKontext,
  optionen?: ToneCheckOptionen
): ToneCheck {
  if (clip.language !== 'th') return { version: TONE_GATE_VERSION, status: 'not-applicable', reason: 'Kein Thai-Ton; nur technische Integritätsprüfung.' };
  return pruefeThaiTonMessung(clip, analyzeToneContour(pcm, sampleRate), kontext, optionen);
}

/** Solltöne aus den Optionen oder dem Wortschatz. */
function sollAusQuelle(
  clip: ToneCheckClip,
  kontext: ToneKontext | undefined,
  optionen: ToneCheckOptionen | undefined
): SollToene | null {
  if (optionen?.sollToene) {
    const toene = [...optionen.sollToene];
    if (!toene.length || toene.some((ton) => !TONE_KEYS.includes(ton))) return null;
    const roman = optionen.sollRoman?.length === toene.length ? [...optionen.sollRoman] : undefined;
    return { toene, quelle: 'aufrufer', wortId: clip.sourceId, ...(roman ? { roman } : {}) };
  }
  return sollToneFuerClip(clip, kontext?.woerter ?? activeVocabulary());
}

/**
 * Urteil über eine fertige Messung — dieselbe Prüfung wie `checkThaiTone`,
 * nur ohne PCM. Für Werkzeuge, die die Messung einmal machen und gegen
 * mehrere Soll-Folgen prüfen (scripts/content/tone-eval.cjs).
 */
export function pruefeThaiTonMessung(
  clip: ToneCheckClip,
  measurement: ToneContourMeasurement,
  kontext?: ToneKontext,
  optionen?: ToneCheckOptionen
): ToneCheck {
  const base = { version: TONE_GATE_VERSION };
  if (clip.language !== 'th') return { ...base, status: 'not-applicable', reason: 'Kein Thai-Ton; nur technische Integritätsprüfung.' };
  const track = optionen?.track
    ? measurement.frames.map((frame) => ({ seconds: frame.t, hz: frame.f0, correlation: frame.correlation ?? 0 }))
    : undefined;
  const soll = sollAusQuelle(clip, kontext, optionen);
  if (!soll) {
    const grund = optionen?.sollToene
      ? 'Übergebene Solltöne sind leer oder ungültig.'
      : clip.kind === 'vocab'
        ? 'Kein Wortbezug mit geprüften Silbentönen im übergebenen Wortschatz.'
        : clip.kind === 'example'
          ? 'Beispielsatz ohne auswertbare Ton-Umschrift (exampleRoman).'
          : 'Dialogzug ohne hinterlegte Silbentöne.';
    return { ...base, ...(track ? { track } : {}), voicedMs: measurement.voicedMs, status: 'unchecked', reason: grund };
  }
  const bezug = { sourceId: soll.wortId, quelle: soll.quelle };

  // EINSILBER: unverändert die längste stimmhafte Strecke als die eine Silbe.
  if (soll.toene.length === 1) {
    const targetTone = soll.toene[0];
    const target = { ...base, ...bezug, targetTone, targetTones: soll.toene, ...(track ? { track } : {}) };
    const metrics = { voicedMs: measurement.voicedMs, ...(measurement.status === 'measured' ? { summary: measurement.summary } : {}) };
    if (measurement.status !== 'measured') return { ...target, ...metrics, status: 'unchecked', reason: 'Keine ausreichend zusammenhängende stimmhafte Strecke.' };
    // Dasselbe Formurteil wie im Mehrsilber, nur als ISOLIERTE Silbe
    // (`einzeln`): hier gibt es keine Nachbarsilbe, in die ein hoher Ton
    // hinunterziehen könnte, also verwirft der deutliche Fall weiterhin.
    const zug = longestRun(measurement.frames);
    const urteil = formurteil(targetTone, measurement.summary, true, true, zug ? nachlaufTiefe(measurement.frames, zug) : 0);
    const silben = [{ tone: targetTone, form: urteil }];
    if (urteil === 'geprueft') {
      return { ...target, ...metrics, silben, status: 'passed',
        reason: 'Relative Konturform mit verifiziertem Sollton vereinbar; nur Tonhöhe geprüft.' };
    }
    if (urteil === 'widerspruch') {
      return { ...target, ...metrics, silben, status: 'failed',
        reason: targetTone === 'high'
          ? 'Deutlicher Fall widerspricht dem hohen Ton.'
          : 'Relative Konturform widerspricht dem verifizierten Sollton.' };
    }
    // HOHER TON (23.09.2026): Die ausgelieferte Stimme spricht ihn mit
    // deutlichem Anstieg zum Ende — mittel/tief/fallend tun das fast nie
    // (Messung in tone-template.ts). Nur hochstufen, nie verwerfen: ein hoher
    // Ton darf am Ende auch absacken (AE-31-Referenz).
    if (urteil === 'register' && targetTone === 'high' && hoherTonSteigtAn(measurement.frames)) {
      return { ...target, ...metrics, silben, status: 'passed',
        reason: 'Hoher Ton mit deutlichem Anstieg zum Ende; mittel/tief/fallend zeigen diese Form fast nie. Nur Tonhöhe geprüft.' };
    }
    return { ...target, ...metrics, silben, status: 'unchecked',
      reason: urteil === 'knapp'
        ? 'Konturbewegung zu knapp für ein Urteil — nicht verworfen.'
        : urteil === 'gegen'
          ? 'Silbe zeigt die Form eines steigenden Tons — nicht verworfen, aber nicht freigegeben.'
          : 'Registerlage mittel/tief/hoch ohne Sprecherreferenz nicht prüfbar.' };
  }

  // MEHRSILBER: jeder Soll-Silbe genau ein stimmhafter Zug, der Reihe nach.
  const metrics = { voicedMs: measurement.voicedMs, ...(track ? { track } : {}) };
  const zuege = voicedRuns(measurement.frames);
  if (!zuege.length) {
    return { ...base, ...bezug, ...metrics, targetTones: soll.toene, status: 'unchecked', reason: 'Keine ausreichend zusammenhängende stimmhafte Strecke.' };
  }
  // AUSRICHTUNG (f0-syllables-6): Stücke der stimmhaften Züge per
  // dynamischer Programmierung auf die Soll-Silben verteilen, mit Lücken-
  // und Dauererwartung aus dem Silbenbau der Umschrift (silben-ausrichtung.ts).
  const bau = soll.roman ? silbenbauFolge(soll.roman) : null;
  const ausrichtung = richteSilbenAus(zuege, soll.toene.length, bau);
  if (!ausrichtung) {
    // Ohne Grenzen: Vorlagenabgleich über die ganze Kurve (stuft nur hoch).
    const vorlage = vorlagenUrteil(measurement.frames, soll.toene, clip.text);
    if (vorlage?.bestanden) {
      return { ...base, ...bezug, ...metrics, targetTones: soll.toene, status: 'passed',
        reason: vorlagenGrund(vorlage.p, soll.toene.length) };
    }
    return { ...base, ...bezug, ...metrics, targetTones: soll.toene, status: 'unchecked',
      reason: `${soll.toene.length} Soll-Silben, aber weniger trennbare Stücke — verbundene Silben ohne erkennbare Grenze nicht prüfbar; auch der Vorlagenabgleich ist nicht eindeutig.` };
  }
  const segmente = ausrichtung.segmente;
  const geteilt = ausrichtung.grenzen.filter((grenze) => !grenze.gemessen).length;
  const spans = segmente.map((segment) => trimEdges(octaveCorrect(segment)));
  const summaries = spans.map((span) => summarizeContour(span, medianReferenceHz(span)));
  const nachlaeufe = segmente.map((segment, i) => nachlaufTiefe(measurement.frames, segment, segmente[i + 1]));
  const silben = spans.map((_, i) => ({
    tone: soll.toene[i],
    form: formurteil(soll.toene[i], summaries[i], false, i === spans.length - 1, nachlaeufe[i], soll.toene[i + 1]),
  }));
  const diagnose = optionen?.diagnose
    ? { diagnose: summaries.map((summary, i) => ({ pts: summary.pts.map((x) => Math.round(x * 10) / 10), nachlauf: Math.round(nachlaeufe[i] * 10) / 10, fenster: segmente[i].length })) }
    : {};
  // Die Clip-Referenz aus den OKTAVKORRIGIERTEN Silben: ein einzelner
  // Oktavsprung der Autokorrelation verschöbe sonst den Median, an dem alle
  // Silbenlagen gemessen werden (die Silben selbst laufen längst korrigiert).
  const ordnung = ordnungsUrteile(soll.toene, spans, medianReferenceHz(spans.flat()));
  const ordnungFeld = {
    ordnung: { erfuellt: ordnung.erfuellt, ...(ordnung.widerspruch ? { widerspruch: ordnung.widerspruch } : {}) },
    lagen: ordnung.lagen,
  };
  const m = soll.toene.length;
  // Eine Silbe ist SICHER zugeschnitten, wenn beide Grenzen an einer
  // gemessenen stimmlosen Lücke liegen (Clip-Rand zählt als gemessen) und
  // sie nicht nur ein kurzer Rest ist (unter 80 ms meist der abgerissene
  // Knarr-Rest eines Falls: ผ้าแห้งแล้ว, ชอบ ว่ายน้ำ).
  const sicher = segmente.map((segment, i) =>
    (i === 0 || ausrichtung.grenzen[i - 1].gemessen)
    && (i === m - 1 || ausrichtung.grenzen[i].gemessen)
    && segment.length >= KURZER_ZUG_FENSTER);
  const widersprueche = silben.flatMap((silbe, i) => (silbe.form === 'widerspruch' ? [i + 1] : []));
  // WIE VIELE WIDERSPRÜCHE VERWERFEN (20.09., seit f0-syllables-6 lokal):
  // Nur Widersprüche an SICHER zugeschnittenen Silben zählen — eine geratene
  // Grenze kann die Kontur der Nachbarsilbe in die Silbe ziehen, und der
  // Verwurf kostet beim nächsten Lauf erneut Geld. Ab fünf Silben (praktisch
  // jeder Satz) zählt erst der ZWEITE Widerspruch; liegt irgendwo im Clip
  // eine geratene Grenze, einer mehr. Eine Stimme, die die Töne wirklich
  // nicht trifft, trifft mehrere.
  const geraten = geteilt > 0 || sicher.some((ok) => !ok);
  const sichereWidersprueche = widersprueche.filter((nr) => sicher[nr - 1]);
  const noetigeWidersprueche = (m >= 5 ? 2 : 1) + (geraten ? 1 : 0);
  const formWiderspruch = sichereWidersprueche.length >= noetigeWidersprueche ? sichereWidersprueche[0] - 1 : -1;
  // Dieselbe Vorsicht für die Lage: eine aus dem Lautstärkeverlauf GERATENE
  // Grenze verschiebt den Zuschnitt beider Nachbarsilben und damit direkt
  // deren gemessene Lage. อธิบาย (à-thí-baai) wurde am 20.09. genau so
  // verworfen, nachdem die Trennung die dritte Silbe überhaupt erst sichtbar
  // gemacht hatte. Geratene Grenzen dürfen Abdeckung bringen, aber nie Geld
  // kosten — sie zählen dann nur noch positiv oder gar nicht.
  const ordnungVerwirft = ordnung.widerspruch !== undefined && !geraten;
  if (formWiderspruch >= 0 || ordnungVerwirft) {
    let grund: string;
    if (formWiderspruch >= 0) {
      grund = sichereWidersprueche.length > 1
        ? `Silben ${sichereWidersprueche.join(', ')} von ${silben.length} (Solltöne ${sichereWidersprueche.map((nr) => silben[nr - 1].tone).join(', ')}) widersprechen der gemessenen Kontur.`
        : `Silbe ${formWiderspruch + 1} von ${silben.length} (Sollton ${silben[formWiderspruch].tone}) widerspricht der gemessenen Kontur.`;
    } else {
      const von = ordnung.widerspruch!;
      const hochTiefer = REGISTER_RANG[soll.toene[von.von - 1]] > REGISTER_RANG[soll.toene[von.bis - 1]];
      grund = `Register-Ordnung widersprochen: Silbe ${von.von} (Sollton ${soll.toene[von.von - 1]}) sollte ${hochTiefer ? 'über' : 'unter'} Silbe ${von.bis} (Sollton ${soll.toene[von.bis - 1]}) liegen, liegt aber deutlich ${hochTiefer ? 'darunter' : 'darüber'}.`;
    }
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'failed', reason: grund };
  }
  // Ein Widerspruch UNTER der Verwurfsschwelle verwirft nicht, darf den Clip
  // aber auch nicht als geprüft ausweisen — er bleibt ehrlich ungeprüft.
  if (ordnung.widerspruch) {
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'unchecked',
      reason: `Register-Ordnung von Silbe ${ordnung.widerspruch.von} zu Silbe ${ordnung.widerspruch.bis} passt nicht — bei geratener Silbengrenze nicht beweiskräftig, deshalb nicht verworfen.` };
  }
  if (widersprueche.length > 0) {
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'unchecked',
      reason: `Silbe ${widersprueche[0]} von ${silben.length} (Sollton ${silben[widersprueche[0] - 1].tone}) passt nicht zur gemessenen Kontur — ${sicher[widersprueche[0] - 1] ? 'als einzelner Widerspruch' : 'bei geratener Silbengrenze'} nicht beweiskräftig, deshalb nicht verworfen.` };
  }
  const gegen = silben.findIndex((silbe) => silbe.form === 'gegen');
  if (gegen >= 0) {
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'unchecked',
      reason: `Silbe ${gegen + 1} von ${silben.length} (Sollton ${silben[gegen].tone}) zeigt die Form eines Konturtons — nicht verworfen, aber nicht freigegeben.` };
  }
  // FREIGABE NUR VOLLSTÄNDIG (f0-syllables-6): Jede fallende und steigende
  // Silbe muss ihre Form klar zeigen. Vorher reichte EINE geprüfte Silbe
  // oder EINE erfüllte Ordnung — am Korpus bestand so ein Clip, an dem genau
  // eine Kontur-Silbe absichtlich falsch gesetzt war, zu 35 %.
  const formGeprueft = silben.filter((silbe) => silbe.form === 'geprueft').length;
  const konturOffen = silben.findIndex((silbe) => (silbe.tone === 'falling' || silbe.tone === 'rising') && silbe.form !== 'geprueft');
  if (konturOffen < 0 && (formGeprueft > 0 || ordnung.stark > 0)) {
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'passed',
      reason: `Silbenform ${formGeprueft} von ${silben.length} plus ${ordnung.erfuellt} Register-Ordnung(en) mit dem Soll vereinbar; jede fallende/steigende Silbe klar erkennbar, absolute Registerlage bleibt ungeprüft${geteilt > 0 ? `, ${geteilt} Silbengrenze(n) geraten` : ''}.` };
  }
  // Sonst trägt der Vorlagenabgleich über die ganze Kurve (stuft nur hoch).
  const vorlage = vorlagenUrteil(measurement.frames, soll.toene, clip.text);
  if (vorlage?.bestanden) {
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'passed',
      reason: vorlagenGrund(vorlage.p, soll.toene.length) };
  }
  if (konturOffen >= 0) {
    return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'unchecked',
      reason: `Silbe ${konturOffen + 1} von ${silben.length} (Sollton ${silben[konturOffen].tone}) zeigt ihre Kontur nicht klar genug — nicht verworfen.` };
  }
  return { ...base, ...bezug, ...metrics, ...diagnose, targetTones: soll.toene, silben, ...ordnungFeld, status: 'unchecked',
    reason: `Registerlage mittel/tief/hoch ohne Sprecherreferenz nicht prüfbar (${silben.length} Silben).` };
}

function vorlagenGrund(p: number, silben: number): string {
  return `Vorlagenabgleich: Die Tonkurve passt zur Soll-Tonfolge (${silben} Silben) besser als ${Math.round((1 - p) * 100)} % zufälliger Tonfolgen (Schwelle p ≤ ${VORLAGE_P_MAX}), jede fallende/steigende Silbe besser als jeder andere Ton. Filter gegen grobe Tonfehler, kein Nachweis jeder einzelnen Silbe.`;
}
