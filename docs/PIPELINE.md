# Pipeline: Inhalte erzeugen, prüfen, ausliefern (Admin-Ablauf)

Nutzer brauchen keinen KI-Zugang. Der Admin erzeugt Inhalte zu Hause im
Entwicklerstudio, die Pipeline prüft sie automatisch, und sie gehen mit dem
App-Build oder als Sprachpaket über GitHub Releases an die Nutzer.

## 1. Studio starten

```bash
npx expo start --web --port 8081 --max-workers 2   # App + Studio: localhost:8081/settings
node scripts/content/studio.cjs                      # Helper auf 8082, liest .env.local
```

Das Studio gibt es nur im Debug-Web-Build auf localhost:8081; Release-Builds
enthalten weder Studio noch Anbieterclients noch Schlüsselfelder. Schlüssel je
Anbieter stehen unter „Anbieter & Schlüssel“; der OpenAI-Helper nutzt
`OPENAI_API_KEY` aus `.env.local`. Lokale Modelle: `docs/lokale-bilder.md`
(ComfyUI/FLUX) und `docs/lokale-texte.md` (Qwen/Gemma).

## 2. Erzeugen

Wortschatz, Dialoge (alle Stufen A1–C2), Bilder oder Hörclips wählen,
Anbieter und Umfang einstellen, **Start**. Es gibt bewusst keinen
Kostendialog. Während eines Laufs nicht am Code arbeiten: Ein HMR-Reload
stoppt ihn.

Jeder fertige Eintrag geht sofort durch die Prüfungen und wird automatisch
übernommen (`/delivery/item`): Schema, Integrität, Dekodierbarkeit, bei Thai
die silbenweise Tonmessung (`src/lib/content/tone-gate.ts`). Durchgefallene
Clips werden verworfen und beim nächsten Lauf neu erzeugt; ab 6 von 10
Verwürfen stoppt der Lauf. Medien und Live-Katalog stehen sofort bereit,
`src/content/catalog.json` und der Asset-Index werden am Laufende geschrieben.

Prüfberichte stehen im Studio unter „Berichte“, Laufprotokolle unter
`pipeline/logs/` (lokal), das Fehlerprotokoll in
`pipeline/logs/studio-failures.ndjson`.

## 3. Prüfen vor dem Release

```bash
npx tsc --noEmit && npx jest       # App-Tests
npm run test:scripts               # Tests der Skripte (Pipeline, Pakete, Helper)
npm run content:integrity          # Katalog ↔ Medien, Ton-Gate je Clip (~1 h); errors muss leer sein
npm run content:check              # zusätzlich Vollständigkeit (meldet fehlende Clips/Bilder)
npm run pipeline:release           # Messkern-Check, Integrität, Gegenmessung, Tests
```

`content:check` darf rot sein, solange Inhalte bewusst fehlen; der EAS-Hook
(`scripts/content/eas-gate.cjs`) sperrt nur Builds, bei denen Katalog und
Medien auseinanderliegen. Verwaiste Medien entfernt
`node scripts/content/prune-orphans.cjs --apply`.

Gegenmessung der Töne über alle Clips:

```bash
npm run content:measure-tones                          # Katalog + Referenzstimmen
node scripts/content/measure-speaker-reference.cjs     # Sprecherreferenz ableiten
```

Ergebnisse landen in `pipeline/reports/` (lokal).

## 4. Ausliefern

Der Katalog ist immer im App-Build. Die Medien (Hörclips, Bilder) kommen je
Lernsprache als Sprachpaket von GitHub Releases; der Ablauf steht in
Abschnitt 5. Native Builds: `eas build --profile rc-ios` (Checkliste
`docs/release-candidate-2026-09-30.md`) bzw. `--profile production`.

## 5. Sprachpakete

Wird im nächsten Schritt fertig verdrahtet; der Abschnitt folgt mit den
endgültigen Befehlen.

## Grenzen

Die Tonmessung ist eine Konturprüfung, kein Hörtest: Sie erkennt, ob die
Tonhöhe die erwartete Richtung nimmt, nicht ob Muttersprachler zustimmen.
Mittlerer und tiefer Ton einzelner Einsilber sind allein nicht beweisbar.
Bilder und Texte gelten als „automatisch geprüft“ nur technisch (Schema,
Integrität, Dekodierung), nicht inhaltlich.
