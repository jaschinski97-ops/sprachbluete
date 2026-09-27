# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# ThaiSpeaker — Kurzstand für die nächste KI (25.09.2026)

Vollständiger Verlauf aller Runden: `docs/arbeitsverlauf-bis-2026-09-25.md` (nur bei Bedarf per grep lesen), dazu `docs/PROGRESS.md` und das Git-Log. Neue Ergebnisse hier KURZ eintragen. Diese Datei wird bei jedem Chat geladen, deshalb nur Dauerhaftes, keine Laufberichte.

## Produkt

- Offline-Sprachlern-App (Expo SDK 57, React Native, Web + Android/iOS). Inhalte kommen komplett mit dem Build; KI-Anbieter nutzt nur der Admin im Entwicklerstudio.
- **4 Lernsprachen:** `LANGUAGE_CODES = ['th','en','es','de']` (`src/lib/languages/types.ts`), zentral definiert in `src/lib/languages/definitions.ts`. Anleitung für neue Lernsprachen: `docs/neue-lernsprache.md`, die Checkliste ist als Test `definitions.test.ts` festgehalten.
- **20 App-Sprachen** (`UI_LANGUAGES`, Wörterbücher `src/lib/i18n/`) sind NUR Oberflächen- und Bedeutungssprachen, **niemals Lernziele** (Nutzerentscheidung). Unbekannte Systemsprache → Englisch.
- Lernrichtung: Die Lernsprache ist die rechte Seite (`targetLanguageOf`); Inhalte liegen je Sprache in `contentDirectionOf(code)`. Das Deutsch-Ziel ist auf deutscher Oberfläche ausgeblendet.
- Lern-Reiter: Startseite mit Satzbau-Einstieg und 5 getrennten, aufklappbaren Kategorien (Wortschatz · Hören · Lesen & Schreiben · Sprechen · Grammatik), Logik in `src/lib/exercise-catalog.ts`; Karteikartenrunden maximal 20. Die Goethe-Prüfung ist ein Eintrag im Lern-Reiter, nur bei Deutsch-Zielen.
- Nutzervision: Lernsprache in der Übersicht wählen; neue Lernsprache = Vorlage kopieren + KI-Erzeugung im Studio.

## Inhaltsbestand (Katalog `src/content/catalog.json`)

Vokabeln th/en/de je 2.000, es 1.502. Hörclips th 3.974, en 4.047, es 3.063, de 4.035. Dazu 78 Bilder und 28 Situationen. Der erzeugte Wortschatz IST der Grundstock (`vocabularySource: 'generated'`); alte feste Vokabeln gibt es nur noch als Test-Fixtures (`src/test-fixtures/`). Jest läuft gegen den festen Testkatalog `fixture-catalog.ts`.

## Befehle

```bash
npx expo start --web --port 8081 --max-workers 2   # App + Studio (Studio nur auf 8081 sichtbar)
node scripts/content/studio.cjs                      # Studio-Helper auf 8082, liest .env.local
npx tsc --noEmit && npx jest                         # Typen + Tests (~1234 Tests)
npm run test:content-pipeline                        # Pipeline-Tests
npm run content:integrity                            # Katalog-Integrität (errors muss leer sein)
```

Der erste Web-Bundle-Aufbau dauert ~2 Minuten (großer Katalog).

## Arbeitsregeln

- **Keine bezahlten KI-Läufe starten.** Erzeugung startet der Nutzer selbst im Studio. Es gibt bewusst KEINE Kostenbestätigungs-Dialoge; nicht wieder einbauen.
- **Pfad-genau committen.** Parallel-Chats sind möglich; fremdes WIP nicht mitnehmen.
- Nicht arbeiten, während im Browser ein Generierungs- oder Audio-Lauf läuft: Ein HMR-Reload stoppt ihn.
- Nach Änderungen an `scripts/content/pipeline.cjs`, `studio.cjs` oder den vom Helper geladenen TS-Modulen (tone-gate usw.) **den Helper neu starten**. Er lädt den Code nur beim Start.
- Neue UI-Texte in **allen 20 Wörterbüchern** eintragen (Paritätstest). Beim Einfügen in `en.ts` als Anker `};\n\nexport default en;` nehmen, nicht `};`.
- Nach einer Session-Grenze sterben die Server oft: Ports 8081/8082 prüfen.
- Verifikation gehört zum Auftrag: tsc, jest, bei UI-Änderungen der Browser.

## Inhalts-Pipeline (Studio)

- Ablauf: Studio erzeugt → `/stage` → `/publish` in den Katalog. Die Medien liegen unter `assets/content/` (sha256-Namen) und werden per `npm run web:content` nach `public/` gespiegelt.
- `publish()` merged die Stage nur HINZU. Löschen läuft über die Studio-Routen (`/catalog/delete`, `/catalog/clear-selection`), die Katalog, Stage und verwaiste Medien gemeinsam bereinigen.
- Direkter Helper-Aufruf: `POST /publish` mit Body `{}` und Header `Origin: http://localhost:8081` (ohne Origin kommt 403). Bei großem Katalog reißt die HTTP-Antwort ab, der Publish läuft trotzdem durch; die Wahrheit steht in `pipeline/logs/…publish-N.json`.
- Laufprotokolle und das Fehlerprotokoll `pipeline/logs/studio-failures.ndjson` sind nur lokal (gitignored).
- Versandbudget 512 MiB. Das OpenAI-TTS-Limit von 30 Aufrufen/min ist der Flaschenhals; der Helper wartet selbst.
- Kreuzprüfung: Erzeuger und Prüfer sind wählbar; `sourceVerified` bleibt bei KI-Einträgen immer false, der Nachweis steht in der `verificationNote` („KI-…“).

## Thai-Ton-Gate (`src/lib/content/tone-gate.ts`, Stand `f0-syllables-4`)

- Prüft silbenweise gegen den Sollton; bei Sätzen kommt der Soll aus der Roman-Umschrift (`roman-tone.ts`). Der Vorlagenabgleich (`tone-template.ts`) stuft nur hoch, verwirft nie.
- Ein Verwurf kostet Geld: Das Audio ist weg und wird beim nächsten Lauf neu erzeugt. Deshalb gilt: Geratene Silbengrenzen verwerfen nie über die Ordnung. Tiefere Silbe vorn wird nicht gewertet. Ein steigender Ton in einer nicht-letzten Silbe gilt als „knapp“.
- Grenze: Einsilber mit mittlerem oder tiefem Ton sind einzeln nicht beweisbar; dafür gibt es die Register-Laufprobe im Batch. Der Ton-Notstopp beendet einen Lauf bei ≥6/10 Verwürfen.
- Stimmen: coral ist bei fallend/steigend schwach, onyx war in der Diagnose besser. Nutzer will kein Gemini für Audio.

## Offene Punkte

- Nicht store-fertig: Android-Release lokal möglich, iOS über EAS. Checkliste: `docs/release-candidate-2026-09-21.md`.
- iOS am Gerät prüfen: Shadowing stellt die Audiokategorie während laufender Aufnahme um (`src/lib/audio-mode.ts`).
- Nutzerentscheidungen offen: Goethe-Teilbeschreibungen übersetzen? en-Beispielsatz-Roman (Pseudo-IPA) regenerieren? 498 es-Vokabeln bis 2.000 fehlen.
- Testrunde 26.09.: Behobenes steht in `CHANGELOG.md` (dort auch die Liste „Bekannt, noch offen“). Noch OFFEN: Stammformen mit beiden Hilfsverben (ist/hat geritten) gelten als falsch; ar „مقال“ für Artikel + Untertitel umgangssprachlich; „Plural:“ und Backup-Fehler fest deutsch; `audio.ts` unavailable-Label ohne Schlüssel; keine Pluralregeln; Studio-Export vergleicht Clips nie gleich (blobKey/byteSize), „Neu erzeugen“ überspringt vorhandene Clips. Änderungen immer auch in `CHANGELOG.md` eintragen.
