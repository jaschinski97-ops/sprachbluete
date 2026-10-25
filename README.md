# ThaiLernbegleiter

Offline-Lern-App für **Thai, Englisch, Spanisch und Deutsch**: Karteikarten mit
Bild und Hörclip, Hören und Diktat, Lesen und Schreiben, Sprechen mit
Tonmessung, Rollenspiele und Grammatik, eingeteilt in Anfänger,
Fortgeschritten und Profi. Die Oberfläche gibt es in 10 Sprachen (Deutsch,
Englisch, Spanisch, Thai, Arabisch, Chinesisch, Hindi, Französisch, Bengalisch,
Portugiesisch); sie sind nur Oberflächen- und Bedeutungssprachen, keine
Lernziele.

Die Inhalte erzeugt der Admin selbst mit KI im Entwicklerstudio (Debug-Web-Build).
Nutzer brauchen keinen KI-Zugang: Sie bekommen die fertigen Inhalte mit der App
oder als Sprachpaket von GitHub Releases.

Gebaut mit Expo SDK 57 / React Native. Expo Go funktioniert nicht (native
Audio- und SQLite-Module), siehe „Entwicklung“.

## Ordnerstruktur

```
ThaiSpeaker/
├── src/
│   ├── app/              Bildschirme (Expo Router): Übersicht, Lernen,
│   │                     Fortschritt, Einstellungen (+ Studio)
│   ├── content/          Inhaltskatalog (catalog.json) + Asset-Bindings
│   ├── data/             Handgepflegte Lerndaten (Grammatik, Schrift, Vertiefung)
│   ├── lib/              Fachlogik: FSRS, Tonmessung, Ton-Gate, Speicher,
│   │                     Übungen, Sprachpakete (lib/packs), i18n
│   ├── components/       UI-Bausteine und Übungsläufe
│   ├── dev/              Entwicklerstudio (nur Debug-Web)
│   └── test-fixtures/    Fester Testkatalog für Jest
├── assets/
│   ├── content/          Ausgelieferte Medien (Bilder + Hörclips, sha256-Namen)
│   └── images/           App-Icon, Splash
├── scripts/              Inhalts-Pipeline, Studio-Helper, Pakete, Tonmessung,
│                         Release-Pipeline
├── docs/                 PIPELINE.md (Admin-Ablauf), Anleitungen,
│                         Projektgeschichte (PROGRESS.md), archiv/
└── _Local/, pipeline/, … Nur lokal, nie auf GitHub (siehe unten)
```

## Auf GitHub vs. nur lokal

**Auf GitHub:** `src/`, `assets/`, `scripts/`, `docs/` und die
Konfigurationsdateien. Sprachpakete hängen als Release-Assets am Repo.

**Nur lokal (ignoriert):** `_Local/` und alles auf `*_Local` (lokale Modelle,
Arbeitsreste), `.content-studio/` (Studio-Arbeitsstand), `pipeline/reports/`
und `pipeline/logs/` (Prüfberichte, Laufprotokolle), `public/` (Web-Spiegel,
`npm run web:content`), `build-verification/`, `android/`, `ios/`, `.expo/`,
`node_modules/`.

## Entwicklung

```bash
npm install
npx expo start --web --port 8081 --max-workers 2   # App + Studio im Browser
node scripts/content/studio.cjs                      # Studio-Helper (Port 8082)
npx tsc --noEmit && npx jest --maxWorkers=6 --testPathIgnorePatterns=/.claude/   # Typen + App-Tests
npm run test:scripts                                 # Tests der Skripte
```

Native Builds: `npm run ios` / `npm run android` oder `eas build`
(Profile in `eas.json`).

## Inhalte erzeugen und ausliefern

Ablauf vom Studio bis zum Release und zu den Sprachpaketen:
[docs/PIPELINE.md](docs/PIPELINE.md). Neue Lernsprache:
[docs/neue-lernsprache.md](docs/neue-lernsprache.md). Lokale Bild- und
Textmodelle: [docs/lokale-bilder.md](docs/lokale-bilder.md),
[docs/lokale-texte.md](docs/lokale-texte.md).

## Qualität der Sprachausgabe

Thai-Clips werden silbenweise gegen den Sollton gemessen
(`src/lib/content/tone-gate.ts`, F0-Kontur aus `src/lib/speaking/analysis.ts`,
dieselbe Messung wie im Werkzeug `scripts/tone-contour.html`). Das ist ein
Filter gegen grobe Tonfehler, kein Hörtest durch Muttersprachler.

## Weiterlesen

- `docs/ordnerstruktur-einstieg.md`: die Ordner für Einsteiger erklärt
- `docs/geschuetzte-bereiche.md`: was fertig ist und nur mit ausdrücklicher Freigabe geändert wird
- `docs/PIPELINE.md`: wie Inhalte entstehen und ausgeliefert werden

## Lizenz

ThaiLernbegleiter ist kostenlos und nicht kommerziell. © 2026 Nico Jaschinski.

- **Code:** [PolyForm Noncommercial 1.0.0](LICENSE.md). Nutzen, ändern und weitergeben für nicht-kommerzielle Zwecke ist erlaubt, verkaufen oder anderweitig damit Geld verdienen nicht.
- **Inhalte** (Wortschatz, Beispielsätze, Dialoge, Bilder, Hörclips, Sprachpakete): [CC BY-NC-SA 4.0](LICENSE-CONTENT.md). Teilen und bearbeiten mit Namensnennung, nicht kommerziell, nur unter derselben Lizenz.

Beide Lizenzen schließen jede Gewährleistung und Haftung aus („ohne Gewähr“).
