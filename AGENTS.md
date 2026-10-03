# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# ThaiSpeaker — Kurzstand für die nächste KI (25.09.2026)

Vollständiger Verlauf aller Runden: `docs/arbeitsverlauf-bis-2026-09-25.md` (nur bei Bedarf per grep lesen), dazu `docs/PROGRESS.md` und das Git-Log. Neue Ergebnisse hier KURZ eintragen. Diese Datei wird bei jedem Chat geladen, deshalb nur Dauerhaftes, keine Laufberichte.

## Produkt

- Offline-Sprachlern-App (Expo SDK 57, React Native, Web + Android/iOS). Inhalte kommen komplett mit dem Build; KI-Anbieter nutzt nur der Admin im Entwicklerstudio.
- **4 Lernsprachen:** `LANGUAGE_CODES = ['th','en','es','de']` (`src/lib/languages/types.ts`), zentral definiert in `src/lib/languages/definitions.ts`. Anleitung für neue Lernsprachen: `docs/neue-lernsprache.md`, die Checkliste ist als Test `definitions.test.ts` festgehalten.
- **20 App-Sprachen** (`UI_LANGUAGES`, Wörterbücher `src/lib/i18n/`) sind NUR Oberflächen- und Bedeutungssprachen, **niemals Lernziele** (Nutzerentscheidung). Unbekannte Systemsprache → Englisch.
- Lernrichtung: Die Lernsprache ist die rechte Seite (`targetLanguageOf`); Inhalte liegen je Sprache in `contentDirectionOf(code)`. Das Deutsch-Ziel ist auf deutscher Oberfläche ausgeblendet.
- Lern-Reiter: A1/A2-Kapitel aus vorhandenen Dialogsituationen (`src/lib/learning-path.ts`), lokal gespeicherter manueller Abschluss, Satzbau-Einstieg und 5 getrennte Kategorien (Wortschatz · Hören · Lesen & Schreiben · Sprechen · Grammatik); Karteikartenrunden maximal 20. Die Goethe-Prüfung ist ein Eintrag im Lern-Reiter, nur bei Deutsch-Zielen.
- Thai-Zieltexte und Antworten in Übungen zeigen Thai-Schrift plus Umschrift; verdeckte Hör-/Schreibantworten erst nach der Auswertung. Die App-Sprachwahl zeigt Eigennamen plus englische Namen, ohne die Aufgabenübersetzungen zu ändern.
- Erste B1-Vertiefung mit je einer Einheit in allen 4 Lernsprachen: Texte/Fragen in `src/data/advanced-lessons.ts`, Ablauf in `src/components/advanced-lesson-runner.tsx`. Texte noch ohne unabhängige Sprachprüfung. Freie Antworten werden lokal gespeichert und nur selbst geprüft; System-TTS ersetzt keine geprüften Hörclips und die Übung bescheinigt keine GER-Stufe.
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

## Lokale Bilder

- Lokale Textanbieter `local-qwen`/`local-gemma`: Setup/Start unter `scripts/content/*local-text*`, Einrichtung `docs/lokale-texte.md`. llama.cpp-Router auf 127.0.0.1:8090, höchstens ein Modell geladen. Textserver erst nach Bildlauf und Freigabe des GPU-Speichers starten; Audio bleibt unverändert.
- Sichtbare Inhaltsgruppen Anfänger/Erfahren/Profi entsprechen intern A1/A2, B1/B2, C1/C2. Neue Vokabeln tragen `learningStage`; ältere ohne Feld bleiben Anfänger. Goethe-Prüfungsnamen behalten ihre offiziellen Stufen.

- Bildanbieter `comfyui`: FLUX.2 klein 4B distilled FP8, ComfyUI nur auf 127.0.0.1:8188, Helper 8082. Encoder-Gerät `default` (GPU mit ComfyUI-Auslagerung), 768-Pixel-Erzeugung → 512-WebP, vier Schritte, seriell ohne Cloud-Pause. Start: `scripts/content/start-local-images.ps1`; Einrichtung/Probelauf: `docs/lokale-bilder.md`. Runtime/Modelle unter `_Local/` sind gitignored.
- Lokale Bildläufe legen nur Bildentwürfe im Stage ab; vor Veröffentlichung Motiv und 512-MiB-Gesamtbudget prüfen. Text und Audio behalten ihre bisherigen Anbieter. Goethe B2 ist bis nach der Bilderrunde zurückgestellt.

## Thai-Ton-Gate (`src/lib/content/tone-gate.ts`, Stand `f0-syllables-4`)

- Prüft silbenweise gegen den Sollton; bei Sätzen kommt der Soll aus der Roman-Umschrift (`roman-tone.ts`). Der Vorlagenabgleich (`tone-template.ts`) stuft nur hoch, verwirft nie.
- Ein Verwurf kostet Geld: Das Audio ist weg und wird beim nächsten Lauf neu erzeugt. Deshalb gilt: Geratene Silbengrenzen verwerfen nie über die Ordnung. Tiefere Silbe vorn wird nicht gewertet. Ein steigender Ton in einer nicht-letzten Silbe gilt als „knapp“.
- Grenze: Einsilber mit mittlerem oder tiefem Ton sind einzeln nicht beweisbar; dafür gibt es die Register-Laufprobe im Batch. Der Ton-Notstopp beendet einen Lauf bei ≥6/10 Verwürfen.
- Stimmen: coral ist bei fallend/steigend schwach, onyx war in der Diagnose besser. Nutzer will kein Gemini für Audio.

## Offene Punkte

- iPhone zuerst: lokaler Quellkandidat und Produktions-Export; native Signierung/Geräteabnahme offen. Aktuelle Checkliste: `docs/release-candidate-2026-09-30.md`.
- iOS am Gerät prüfen: Shadowing stellt die Audiokategorie während laufender Aufnahme um (`src/lib/audio-mode.ts`).
- Offen: 498 es-Vokabeln bis 2.000 fehlen; vorhandene en-Beispielsatz-Roman-Felder bleiben im Datenbestand, werden in lateinischen Dialog-/Satzansichten ausgeblendet.
- Testrunde 26.09.: Behobenes steht in `CHANGELOG.md`. Noch OFFEN: Stammformen mit beiden Hilfsverben (ist/hat geritten) gelten als falsch; ar „مقال“ für Artikel + Untertitel umgangssprachlich; Backup-Fehler fest deutsch; keine Pluralregeln; Studio-Export vergleicht Clips nie gleich (blobKey/byteSize), „Neu erzeugen“ überspringt vorhandene Clips. Änderungen immer auch in `CHANGELOG.md` eintragen.
- Testrunde 29.09.: Lesequiz-Auswahl, Thai-Wortgrenzen, Rollenspiel-Zähltext und Anfänger-Stoffauswahl korrigiert (siehe `CHANGELOG.md`). B1-Hörtexte bleiben ohne gebündelte Clips; eine physische Mikrofonprüfung steht weiter aus.
- Kapitelgrammatik nutzt Szenenregeln und Dialogbeispiele; vollständige gelieferte Satzübersetzungen sind Pflicht für fremdsprachige Satzbedeutungen. Musterhilfe beim Schreiben zählt nie als FSRS-Wiederholung. Goethe-Hilfen für Thai liegen in `src/data/exam-thai-support.ts`; deutsche Prüfungsstimuli bleiben unverändert.
