# Eine neue Lernsprache hinzufügen

Stand: Sprach-Umbau vom 23.09.2026. Seitdem steht alles, was die App über eine
Lernsprache wissen muss, an **einer** Stelle. Deutsch ist dabei eine Lernsprache
wie jede andere, ohne Sonderregeln.

Beispiel: Französisch (`fr`, seit 04.11.2026 so eingebaut). Seit Italienisch
(07.11.2026) muss eine Lernsprache keine App-Sprache mehr sein; dann braucht
jeder Beispielsatz und jeder Dialogzug eine eigene Zeile in der Lernsprache
(siehe unten).

## 1. Code eintragen

`src/lib/languages/types.ts`:

```ts
export const LANGUAGE_CODES = ['th', 'en', 'es', 'de', 'fr'] as const;
```

Danach meldet `npx tsc --noEmit` jede Stelle, die für `fr` noch etwas braucht.
Normalerweise ist das nur die Definition aus Schritt 2.

## 2. Definition anlegen

`src/lib/languages/definitions.ts` bekommt in `LEARNING_LANGUAGES` einen
Eintrag `fr` mit diesen Feldern:

| Feld | Bedeutung | Französisch z. B. |
| --- | --- | --- |
| `label`, `endonym` | Name auf Deutsch (Studio) und Eigenname | `'Französisch'`, `'français'` |
| `speechLocale`, `speechRate` | Gerätestimme | `'fr-FR'`, `0.95` |
| `script` | `'thai'` oder `'latin'` | `'latin'` |
| `palette` | Zeichenleiste für Diktat/Schreiben (`null` = keine) | `null` oder eine neue Leiste |
| `nearMiss` | was beim Schreiben als „fast richtig“ gilt | `'accent'` |
| `legend` | Merkhilfe in der Übersicht (`null` = keine) | `null` |
| `wordSpeaking` | Wortübung: `'repeat'` (Nachsprechen), `'tone-contour'`, `null` | `'repeat'` |
| `drills` | sprachspezifische Übungen (leer ist erlaubt) | `[]` |
| `greeting` | Gruß im Kopf der Übersicht | `{ word: 'Bonjour', hint: null }` |
| `dictation` | Diktat-Regeln | `{ foldCase: true, eszettEquivalence: false, strictDiacritics: true }` |
| `prompts` | eigene Aufgabentexte oder `null` für die allgemeinen | `{ writing: null, dictation: null }` |
| `placeholders` | Platzhalter im Eingabefeld (in der Zielsprache) | `{ word: 'ta réponse', sentence: 'ta phrase' }` |
| `challenge`, `feature` | Texte und Quelle des Sprachmerkmals | `'language.fr.description'` … |
| `generatorRules` | sprachspezifische Pflichtfelder für den Wortschatz-Erzeuger | z. B. Genus bei Nomen |
| `checkPoint3` | Prüfpunkt 3 der KI-Kreuzprüfung | `'ist die Lautschrift plausibel?'` |
| `dialogRules` | Sprachhinweis für den Dialog-Erzeuger | `'Natürliches Französisch …'` |

`feature.source` braucht einen Beleg mit Link und wörtlichem Zitat. Ein Test
prüft das.

## 3. Zwei Texte übersetzen

In allen 10 Wörterbüchern (`src/lib/i18n/dictionaries/*.ts`):

- `language.fr.feature`: Kurzname des Merkmals
- `language.fr.description`: ein Satz, was die Sprache besonders macht

Der Paritätstest und `src/lib/languages/definitions.test.ts` melden fehlende Texte.

## 4. Prüfen

```bash
npx tsc --noEmit
npx jest src/lib/languages
node --test scripts/content/pipeline.test.cjs
```

`definitions.test.ts` ist die Checkliste als Test. Er prüft für jede Sprache
die Definition, alle Texte in den 10 App-Sprachen, die Inhalts-Richtung und die
Quelle.

## 5. Inhalte erzeugen

Im Entwicklerstudio erscheint die neue Sprache automatisch in allen Karten:
Wortschatz, Gespräche, Audio und Bilder. Reihenfolge wie immer:

1. Wortschatz (die Pflichtfelder kommen aus `generatorRules`)
2. Gespräche
3. Audio
4. Bilder

Danach veröffentlichen.

## Was die neue Sprache damit automatisch bekommt

- Ein Lernziel in jeder App-Sprache außer ihrer eigenen.
- Karteikarten mit Vorderseite in der App-Sprache (`translations[anker]`).
- Satz verstehen, Shadowing, Satz wiederholen, Diktat, Schreiben, „Sag es“,
  Rollenspiel, Lesetexte und die Heutige Runde.
- Fortschritt: Fälligkeiten, Trefferquote je Übung und Wortschatz-Meilensteine.
- Gesprächs-Reiter, Studio-Auswahl und Pipeline-Vertrag (`LANGUAGE_CODES`).

## Was optional ist

Eigene Übungen wie die Thai-Töne oder die spanische Betonung sind Zusatzmodule:

- neue Drill-ID in `src/lib/drills/types.ts` mit `feature: 'fr'`
- Fragenbau in `src/lib/drills/questions.ts`
- ID in `drills` der Definition eintragen

Ohne eigene Übungen ist die Sprache trotzdem vollständig lernbar.

## Gespeicherte Richtungen

Inhalte einer Sprache liegen unter `contentDirectionOf(code)`:

- für neue Sprachen `de_to_<code>`
- für Deutsch historisch `th_to_de`

Karten liegen je Lernziel unter `vocabId:anker_to_ziel`. Diese Schlüssel sind
gespeicherte Daten und dürfen sich nicht ändern.

## Was der Französisch-Einbau (04.11.2026) zusätzlich gebraucht hat

Die Schritte oben reichen nicht ganz. Beim echten Einbau kamen dazu:

- **Kompilierfehler (13):** Sprachkarten mit allen Lernsprachen in
  `language-picker.tsx` (Abzeichen), `production-runner.tsx` und
  `roleplay-runner.tsx` (Locale der Worterkennung), `today-round-runner.tsx`
  (Diktat-Text), `repository.ts` (Clip-Zähler), `advanced-lessons.ts`
  (B1-Einheit schreiben), `numbers.ts` und `latin-alphabet.ts` (Kapitel 0).
- **Geschützte Dateien, nur mit Freigabe:** Zahlen und ABC aus einer
  Wikipedia-Quelle eintragen, das Medienbudget in `pipeline.cjs` prüfen
  (rund 100 MiB Clips je lateinische Sprache, Thai 173 MiB), danach
  `node scripts/schutz.cjs freigeben <datei>`. Achtung: `numberWord` und
  `priceText` fallen ohne eigenen Zweig still auf Deutsch zurück.
- **Erzeugte Dateien:** `node scripts/app-catalog-files.cjs --write-map`
  (`catalog-files.ts`) und `node scripts/content/vorbild-kurven.cjs`
  (legt `assets/kurven/<code>.kurven.yml` an, `kurven-dateien.ts` von Hand).
- **Kategorie Grammatik:** `exercise-catalog.test.ts` verlangt in jeder
  Kategorie eine Übung. Ohne sprachspezifische Grammatikübung bleibt
  „Grammatik“ leer, deshalb gibt es für Französisch `genre` („un oder une?“).
- **Zeichenleiste:** neue `palette` in `definitions.ts` und
  `character-palette.tsx`, Tastennamen in allen Wörterbüchern.
- **Genus:** `frenchNoun` in `vocab-types.ts`; Karte und Wortliste zeigen
  den Artikel über `termWithArticle` (`vocab-helpers.ts`).
- **Testdaten:** ein kleiner Wortsatz in `src/test-fixtures/` (hier
  `vocabulary-fr.ts`), sonst scheitern die Tests, die jede Sprache mit Stoff
  erwarten. Dazu alle Tests, die die Liste der Lernsprachen wörtlich prüfen.
- **App-Sprache wird Lernsprache:** Ist der Code schon App-Sprache (wie
  `fr`), wechselt er von der Fremd-Brücke zum Lernpaar. Gespeicherte
  Richtungen (`fr_to_th`) bleiben gleich; nur die Zielreihenfolge folgt jetzt
  `LANGUAGE_CODES` statt „Deutsch zuerst“.
- **Sichtbarkeit:** Eine Lernsprache ohne Wortschatz erscheint nicht als
  Lernziel (`zieleFuerBruecke`). Code und Inhalte können also getrennt
  ausgeliefert werden.

## Was Portugiesisch, Italienisch und Chinesisch (07.11.2026) gebraucht haben

- **Lernsprache ohne App-Oberfläche (Italienisch):** Bedeutungen und
  Satzübersetzungen kommen aus den 10 App-Sprachen; den Satz in der
  Lernsprache übersetzt Claude aus einem vorhandenen Beispielsatz
  (`content-plan/romanische-woerter.cjs`, Spalte „#n Satz“). Dialogquellen
  brauchen je Zug eine Zeile in der Lernsprache plus alle 10 App-Sprachen;
  Titel und Hinweise nur in App-Sprachen (`baue-dialoge.cjs`).
- **Eigene Schrift ohne Wortabstand (Chinesisch):** `script: 'han'` in
  `definitions.ts`. Fragen nach der Schrift gehen über `eigeneSchrift`,
  `ohneWortabstand`, `zeigtUmschrift` und `passtZurSchrift`, nie über
  `=== 'th'`. Diktat wertet je Schriftzeichen, Schreiben ohne
  Tippfehler-Fenster, Clip-Schlüssel ohne Leerzeichen.
- **Pinyin statt Lautschrift:** `romanization` in Wörterbuchform mit
  Tonzeichen (`pruefePinyin` in `vocab-schema.ts`), Silben je Schriftzeichen.
  Wörter: `content-plan/chinesische-woerter.cjs` (prüft Silben, Tonzeichen
  und Silbenzahl); Dialoge: `dialoge.cjs pruefe zh` prüft das Pinyin je Zug.
- **Lesung gegen ein Wörterbuch:** Anders als bei Thai lässt sich der Ton nicht
  aus der Schrift berechnen. `content-plan/pinyin-woerterbuch.cjs` gleicht das
  Pinyin jedes Zeichens mit CC-CEDICT ab (Laden steht im Dateikopf; nur unter
  `_Local/`, nie in der App). Falsche Silben und Töne sind Fehler und halten
  `baue` und `dialoge.cjs pruefe zh` an. Mehrfach-Lesungen im falschen Wort
  (还有 huán yǒu) kommen als „Verdacht“ zum Ansehen. 一/不 mit Tonänderung und
  das Erhua-r sind erlaubt. `… katalog` prüft den ganzen Bestand.
  Ein Audio-Ton-Gate wie bei Thai gibt es für Chinesisch bewusst nicht. Gemini
  spricht Mandarin sicher, die Töne ändern sich im Satz (Tonsandhi, neutraler
  Ton), und jeder Verwurf kostet Geld.
- **Grammatikübung je Sprache:** `genero` („um oder uma?“), `articolo`
  („un, uno, una?“), `liangci` („个, 本 oder 杯?“, Zählwort aus
  `chineseNoun.measureWord`, Liste `src/data/chinese-measure-words.ts`).
- **Kapitel 0:** Zahlen und Preise je Sprache in `numbers.ts`; Chinesisch hat
  statt ABC die Töne (`src/data/chinese-tones.ts`, geschützt wie
  `thai-script.ts`).
- **Dialoge schneller:** Die spanischen Dialoge haben schon alle 10
  Übersetzungen und teilen 16–20 von 20 Zielwörtern mit dem Plan einer neuen
  Sprache. Eine Vorlage aus dem spanischen Dialog gleicher ID spart den
  größten Teil der Übersetzungsarbeit.

## Japanisch vorbereiten (07.11.2026)

Japanisch ist noch keine Lernsprache und seit dem 24.10.2026 auch keine
App-Sprache. Dialogquellen bräuchten also wie bei Italienisch eine eigene
Zeile je Zug. Das größte Risiko ist nicht der Tonhöhenakzent, sondern die
Lesung der Kanji (今日 きょう/こんにち, 三本 さんぼん, 六本 ろっぽん). Dafür gibt es schon
den Lesungsprüfer:

- `content-plan/japanisch-lesung.cjs`, Tests in
  `scripts/content/japanisch-lesung.test.cjs`. Er braucht einmalig JMdict und
  KANJIDIC2 der EDRDG (CC BY-SA 4.0) unter `_Local/woerterbuch/`. Fehlen
  sie, nennt das Werkzeug die Ladebefehle. Die Wörterbücher dienen nur zum Prüfen und kommen nie
  in App oder Git. `… lade` baut daraus einen Zwischenspeicher.
- Claude schreibt je Begriff eine TSV-Zeile `begriff|wort|kana|satz|satzkana`.
  Die Satzlesung steht mit Leerzeichen zwischen den Wörtern, Partikeln wie
  geschrieben (は, へ, を). `… pruefe <datei.tsv>` meldet falsche Lesungen mit
  Stelle und den bekannten Lesungen.
- Romaji wird nie von Hand geschrieben, sondern aus der Kana-Lesung gerechnet
  (modifiziertes Hepburn: kyō, gakkō, kin'en, matcha; im Satz は/へ/を als
  wa/e/o).
- Erkennt nicht: Lesungen, die nur im Zusammenhang falsch sind (一日 いちにち statt
  ついたち, 今日 こんにち), Namen ohne さん/様 o. ä., den Tonhöhenakzent. Diese
  Fälle brauchen eine Durchsicht.
