# Thai-Ton-Engine (24.10.2026)

Die Engine berechnet den Ton jeder Thai-Silbe aus der **Schrift** und vergleicht ihn mit dem Ton der **Paiboon-Umschrift**. Sie prüft Wörter, Beispielsätze und Dialogzeilen, bevor Hörclips erzeugt werden. Ein falscher Soll-Ton in der Umschrift lässt sonst das Audio-Ton-Gate gute Clips verwerfen.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `src/lib/thai/tone-rules.ts` | Engine: Silbenlesungen, Ausrichtung an der Umschrift, Tonregel, `pruefeThaiTon`, `sollToeneAusSchrift`, `ergaenzeTonzeichen` |
| `src/lib/thai/tone-exceptions.ts` | Ausnahmeliste (Wörter, deren Aussprache von der Schrift abweicht), je Eintrag mit Grund |
| `src/lib/thai/tone-check.ts` | Prüfung von Wort-Einträgen (`pruefeThaiWortToene`) und Dialogen (`pruefeThaiDialogToene`) |
| `scripts/content/thai-tones.cjs` | Werkzeug `npm run content:thai-tones` |
| `src/test-fixtures/thai-tone-gold.ts` | Goldstandard: 539 Wörter (Wiktionary), 55 Sätze |

Regeln und Daten kommen aus `src/data/thai-script.ts`: Konsonantenklassen, Tonregeltabelle, Vokalmuster, Cluster, ห นำ, อ นำ.

## Werkzeug

```bash
npm run content:thai-tones -- woerter.json
npm run content:thai-tones -- woerter.json --nur-fehler
npm run content:thai-tones -- woerter.json --json
```

Die Datei darf enthalten: eine Liste von Wörtern im Format `VocabEntry`, einen Katalog oder Stage (`{ entries: [{ kind, document }] }`), Dialoge (`{ scriptTurns }`) oder Satzpaare (`{ thai, roman, kontext? }`). Nicht-Thai-Einträge werden übersprungen.

Ausgabe je Widerspruch:

```
WIDERSPRUCH  ki-th-1234  Wort „สบาย“: Silbe 1 „ส“ (sá)
   Soll (Schrift): tief   Ist (Umschrift): hoch
   Begründung: ส: hohe Klasse (implizites a), tote Silbe, kurzer Vokal → tief
   Vorschlag: sà-baai
```

`UNSICHER`-Zeilen sind Hinweise (mit `--nur-fehler` ausgeblendet). Exit-Code 1, sobald es einen Widerspruch gibt.

Geprüft werden `romanization` gegen `term`, `syllables[].roman` gegen `term`, das Ton-Feld jeder Silbe gegen ihre Umschrift, `tone` gegen die erste Silbe und `exampleRoman` gegen `exampleTerm` (Satzkontext).

## Ergebnisarten

- **ok**: Schrift und Umschrift ergeben denselben Ton.
- **widerspruch** (Fehler): Die Umschrift trägt einen anderen Ton als die Schrift. `pruefeVocabDoc` lehnt das Wort ab, `content:integrity` meldet einen Fehler.
- **unsicher** (Hinweis): Die Schrift legt den Ton nicht sicher fest, oder die Laute passen nicht. Kein Fehler, aber vor dem Audio-Lauf ansehen. Fälle:
  - Klassenübertragung in der Wortmitte oder nach einer Bindesilbe (Pali/Sanskrit lassen sie oft weg: นิตยสาร nít-dtà-yá-sǎan).
  - Englisches Lehnwort-Merkmal (stummes ร์/ล์ oder Lehn-Cluster wie ดร) ohne Eintrag in der Ausnahmeliste.
  - Laut passt nicht: „Umschrift „khâap“ passt lautlich nicht zur Schrift แคบ (Schrift liest khɛɛp)“.
  - Keine Ausrichtung möglich (Silbenzahl passt nicht, Ziffern über 100, lateinische Buchstaben).
  - ไหม in der falschen Form für den Kontext (Stichwort mǎi, im Satz mái).

## Wie die Engine arbeitet

1. Die Umschrift wird in Silben zerlegt (Bindestrich, Leerzeichen); je Silbe Anlaut, Vokal, Auslaut und Ton.
2. Für jede Stelle der Schrift werden alle möglichen Silbenlesungen gebildet: Vokalmuster, implizites a/o/ɔɔ, รร, ฤ, ห นำ, อ นำ (nur die vier Wörter), echte, unechte (ทร, จร, สร, ศร, ซร) und Lehn-Cluster, stumme Zeichen mit ์, stummes ร und stummer Pali-Vokal hinter dem Auslaut, Bindesilben (Auslaut zugleich Anlaut: ผลไม้ phǒn-lá-máai), vorangestellter Vokal über zwei Konsonanten (เสมอ sà-mə̌ə), ๆ und Ziffern bis 100 und 1000.
3. Die Ausrichtung sucht die Lesungen, die **lautlich** zu den Umschrift-Silben passen. Der Ton spielt dabei keine Rolle, damit die Prüfung unabhängig bleibt. Vokallänge wird beim Abgleich nicht verlangt (ได้ dâai, น้ำ nám).
4. Der Ton kommt aus Klasse, Silbenart und Tonzeichen (`TONE_RULES`). Nach einer Vorsilbe mit implizitem a übernimmt ein tiefer Sonorant die Klasse (ขนม khà-nǒm, ตลาด dtà-làat).
5. Ergeben mehrere gleich gute Lesungen verschiedene Töne, heißt das „unsicher“. Die Engine rät nie.

## Ausnahmeliste

`tone-exceptions.ts` gilt auch mitten in Sätzen und längeren Wörtern (กิโลเมตร nutzt เมตร). Neue Einträge: Thai-Schreibung, Lesarten in Paiboon (die übliche zuerst, `nur: 'wort' | 'satz'` für kontextabhängige) und ein Grund. Der Test „jede Ausnahme passt zu ihrer eigenen Lesart“ prüft jeden Eintrag.

Wenn die Engine bei einem Lehnwort einen Widerspruch meldet und die Umschrift sicher stimmt (z. B. aus Wiktionary), gehört das Wort in die Ausnahmeliste.

## Schnittstelle für das Audio-Ton-Gate

```ts
import { sollToeneAusSchrift } from '@/lib/thai/tone-rules';

sollToeneAusSchrift('ใช่ไหม', 'châi mái', 'satz'); // ['falling', 'high']
```

Rückgabe je Umschrift-Silbe der Ton laut Schrift, `null` an Stellen, die die Schrift nicht sicher festlegt; `null` insgesamt, wenn keine Ausrichtung möglich ist. Die Silben sind die Buchstabenfolgen der Umschrift zwischen Bindestrich, Leerzeichen und Satzzeichen; ohne Satzzeichen entspricht das `tonfolgeAusRoman(roman)` aus `roman-tone.ts`. Ausführlich: `pruefeThaiTon(thai, roman, { kontext })` mit `silben[].sollSchrift`, `istUmschrift`, `status`, `eindeutig`, `begruendung`.

## Messung (24.10.2026)

- Goldstandard 539 Wörter (Wiktionary, Paiboon): 538 bestätigt, 0 Widersprüche, 1 unsicher (ไปรษณีย์). Ohne die Wörter der Ausnahmeliste: 490 von 491.
- Verfälschte Töne (jede Silbe jedes Gold-Worts einmal verschoben, 830 Fälle): 825 Widersprüche, 5 unsicher, 0 übersehen.
- 55 Gold-Sätze: alle bestätigt. Zahlen 0–100 und 1000 aus `data/numbers.ts`: alle bestätigt.
- Alter Katalog (`_Local/reuse/`, 2000 KI-Wörter): Stichwörter 1963 ok, 10 Widersprüche (fast alle englische Lehnwörter, bei denen die alte KI anders betont als Wiktionary), 27 unsicher (meist Laut-Fehler der Umschrift wie แคบ „khâap“). Beispielsätze 1914 ok, 28 Widersprüche, überwiegend echte Tonfehler der KI (วันนี้ „wan-nii“, ไม้ „mâai“, หลัง „lang“, ค่ะ statt คะ nach นะ).

## Grenzen

- Lehnwörter aus dem Englischen folgen oft nicht der Tonregel. Nur die Wörter der Ausnahmeliste sind abgedeckt; andere melden einen Widerspruch (ohne Lehnwort-Merkmal) oder „unsicher“ (mit ร์/ล์/Lehn-Cluster).
- Pali/Sanskrit-Wörter mit abweichender Lesung (wie ประวัติ, ตำรวจ) brauchen einen Eintrag; die Klassenübertragung in der Wortmitte meldet die Engine nur als „unsicher“.
- Umgangssprachliche Töne (ฉัน chán, เขา kháo, หรือ rʉ́ʉ) sind als zweite Lesart erlaubt und erzeugen einen Hinweis.
- Ziffern werden nur für 0–100 und 1000 ausgeschrieben; größere Zahlen in Ziffern ergeben „unsicher“.
