# Geschützte Bereiche

Stand 25.10.2026. Diese Bereiche laufen, sind durch Tests und Messungen
abgesichert und wurden mit dem Nutzer abgestimmt. Bei Updates und
Erweiterungen bleiben sie unangetastet.

## Regeln für jede KI und jeden Menschen

1. **Nicht ändern ohne ausdrückliche Freigabe.** Eine geschützte Datei wird
   nur geändert, wenn der Nutzer es im laufenden Chat verlangt und dabei den
   Bereich nennt („ändere die Tonregeln“). Ein allgemeiner Auftrag wie
   „räum auf“, „mach schneller“ oder „bau Übung X“ ist keine Freigabe.
2. **Anschließen statt umbauen.** Neue Funktionen nutzen die Schnittstellen
   unten. Passt eine Schnittstelle nicht, zuerst den Nutzer fragen.
3. **Der Test wacht.** `scripts/schutz.test.cjs` (läuft in
   `npm run test:scripts`) schlägt fehl, sobald eine geschützte Datei vom
   eingetragenen Stand abweicht. Nach einer freigegebenen Änderung:
   Tests grün, dann `node scripts/schutz.cjs freigeben <datei>`, dann
   CHANGELOG-Eintrag mit Grund.
4. **Nur Kommentare** sind auch nur mit Freigabe zu ändern: Der Test zählt
   jede Änderung, und die Kommentare halten dort Messwerte und Entscheidungen
   fest.

## Die Bereiche

### Lernplanung (FSRS, Auswahl der Übungswörter)

`src/lib/fsrs/fsrs.ts`, `src/lib/fsrs/types.ts`, `src/lib/practice-selection.ts`,
`src/lib/word-practice.ts`

Warum: Bestimmt, wann welches Wort wiederkommt. Ein Fehler wirkt erst nach
Tagen und zerstört Lernstände, ohne dass es sofort auffällt.
Anschließen: Neue Wort-Übungen wählen über `selectPracticeWords` und
bewerten über `rateCard` bzw. `recordWordPractice`.

### Thai-Töne und Umschrift

`src/lib/thai/tone-rules.ts`, `src/lib/thai/tone-exceptions.ts`,
`src/lib/content/tone-gate.ts`, `src/lib/content/tone-template.ts`,
`src/lib/content/silben-ausrichtung.ts`, `src/lib/content/silbenbau.ts`,
`src/lib/content/roman-tone.ts`, `src/lib/content/soll-toene-schrift.ts`,
`src/lib/content/thai-romanization.ts`, `src/lib/speaking/analysis.ts`

Warum: Tonregeln mit 99,8 % auf Wiktionary-Gold, Ton-Gate `f0-syllables-6`
mit 2,3 % falschen Freigaben (gemessen mit `npm run content:tone-eval`).
Jede „kleine Verbesserung“ muss diese Messungen wiederholen. Ein Verwurf
kostet Geld, weil der Clip neu erzeugt wird.
Anschließen: `sollToeneAusSchrift`, `pruefeThaiTon`, `checkThaiTone(…, { sollToene, sollRoman })`.
Neue Ausnahmen in `tone-exceptions.ts` nur mit Grund und Freigabe.

### Speicherung der Lernstände

`src/lib/storage/backend.ts`, `src/lib/storage/backend.web.ts`,
`src/lib/storage/document-persistence.web.ts`, `src/lib/storage/index.ts`,
`src/lib/storage/memory-store.ts`, `src/lib/storage/migration.ts`,
`src/lib/storage/types.ts`, `src/lib/backup.ts`

Warum: Ein Fehler hier löscht Lernfortschritt echter Nutzer. Die Übernahme
alter localStorage-Daten ist atomar mit Sicherung gebaut.
Anschließen: über `getStore()` und neue Sammlungen; nie das Format
bestehender Sammlungen ändern.

### Katalog je Lernsprache und App-Build

`metro.config.js`, `scripts/metro-app-catalog.cjs`, `scripts/app-catalog-files.cjs`,
`src/lib/content/catalog-languages.ts`, `src/lib/content/catalog-loader.ts`,
`src/components/catalog-gate.tsx`

Warum: Teilt den großen Katalog in Dateien je Lernsprache und App-Sprache
(Startzeit, Speicher). Fehler zeigen sich erst im Store-Build.
Anschließen: Liest App-Code ein neues Katalogfeld, nur dieses Feld in
`slimEntry` ergänzen (mit Freigabe); synchron für alle Sprachen
`vocabularyCountFor`/`vocabularyIdsFor` nutzen.

### Inhalts-Pipeline

`scripts/content/pipeline.cjs`, `scripts/content/automatic-delivery.cjs`,
`src/lib/content/vocab-schema.ts`, `src/lib/content/audio-policy.ts`,
`src/lib/generation/drossel.ts`

Warum: Prüft jeden Eintrag, bevor er in den Katalog kommt, und schützt
laufende, bezahlte Läufe (Journal, Budget, Drossel bei 429).
Anschließen: neue Generatoren über `gedrosselt(client, drossel)` und die
Routen `/delivery/start|item|finish`.

### Sprachpakete

`src/lib/packs/store.ts`, `src/lib/packs/manifest.ts`, `src/lib/packs/config.ts`,
`scripts/content/build-pack.cjs`

Warum: Download und Installation beim Nutzer; Fehler sind dort nicht
reparierbar, ohne dass Nutzer neu laden.

### Feste, quellengeprüfte Lerndaten

`src/data/numbers.ts`, `src/data/latin-alphabet.ts`, `src/data/thai-script.ts`

Warum: Von Hand aus Quellen übernommen (Quelle steht in der Datei), nicht per
KI. Anzeige-Verbesserungen gehören in die Komponenten, nicht in die Daten.

## Inhalte (kein Code, trotzdem geschützt)

- `src/content/catalog.json` und `assets/content/` nie von Hand bearbeiten.
  Neues und Korrekturen gehen über das Studio bzw. die Helper-Routen
  (`content-plan/liefere-woerter.cjs`, `content-plan/dialoge.cjs liefere`),
  Löschen nur über `/catalog/delete` und `/catalog/clear-selection`.
- Während ein Studio-Lauf läuft, keine Dateien im Projekt ändern: Das
  Neuladen der Entwicklungs-App bricht den Lauf ab.

## Bewusste Entscheidungen des Nutzers (nicht rückgängig machen)

- Keine Kostenbestätigungs-Dialoge vor KI-Läufen.
- Keine Motiv-Vorschau für Bilder durch den Admin.
- Stufen heißen sichtbar Anfänger, Fortgeschritten, Profi; A1–C2 nie sichtbar.
- Die App-Sprache ist nie Lernziel; 10 App-Sprachen, 4 Lernsprachen.
- Prüfvermerke beginnen mit „KI-…“, Lernende sehen nicht, welches Modell was erzeugt hat.
- Optik „Kirschblüte“ mit Tag und Nacht; Farben immer über `@/hooks/use-color-scheme`.
- Bilder je Begriff (ein Bild für alle Lernsprachen), keine alten Bilder oder Clips wiederverwenden.
- Lizenz: Code PolyForm Noncommercial 1.0.0, Inhalte CC BY-NC-SA 4.0 (Nico Jaschinski).
