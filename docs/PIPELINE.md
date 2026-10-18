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
npm run content:tone-report                            # Thai-Einsilber je Stimme × Sprechanweisung
node scripts/content/measure-speaker-reference.cjs     # Sprecherreferenz ableiten
```

Ergebnisse landen in `pipeline/reports/` (lokal).

## 4. Ausliefern

Der Katalog (Texte, Übungen) ist immer im App-Build. Die Medien (Hörclips,
Bilder, zusammen rund 390 MB) kommen im Store-Build je Lernsprache als
Sprachpaket von GitHub Releases (Abschnitt 5).

| EAS-Profil | Medien | Zweck |
|---|---|---|
| `development`, `preview`, `rc-ios` | eingebettet | Entwicklung, Gerätetest ohne Paketserver |
| `rc-ios-packs` | aus Paketen | Gerätetest des Download-Wegs |
| `production` | aus Paketen | Store |

Gesteuert wird das über `THAISPEAKER_MEDIA=packs` (`metro.config.js` ersetzt
dann `src/content/assets.ts` durch die leere `assets.packs.ts`). Checkliste
für das iPhone: `docs/release-candidate-2026-09-30.md`.

Unabhängig vom Medienweg bekommt jeder Nicht-Entwicklungsbau (`expo export`,
EAS, Gradle-Release) den Katalog als schlanke App-Fassung: ohne Tonmessung,
Digests, Bytezahlen, Anbieter, Stimme und Prompts, aber mit allen Texten,
Dateinamen, Prüfstatus und Ton-Gate-Status (`scripts/metro-app-catalog.cjs`,
Stand 18.10.2026 28 → 12,5 MB). `catalog.json` selbst und der
Entwicklungsbau mit Studio bleiben vollständig.

## 5. Sprachpakete

Ablauf: Inhalte zu Hause erzeugen → Paket bauen → als GitHub-Release
hochladen → Nutzer tippen in der Übersicht auf **Laden · 98 MB** (oder unter
Einstellungen → Sprachpakete). Danach ist die Sprache offline vollständig.

```bash
npm run pack:build -- --lang th        # oder --lang all; Version = letzte + 1
npm run pack:publish -- --lang th      # lädt Zip + Manifest als Release pack-th-v<N> hoch
```

- Ausgabe: `dist/packs/<lang>/thai-pack-<lang>-v<N>.zip` plus
  `….manifest.json` (Dateiliste mit sha256, Größen, `zipBytes`). Beide
  Dateien müssen am Release hängen; die App liest zuerst das Manifest.
- Ziel-Repo: `app.json` → `expo.extra.pack.repo` („owner/name“). Das Repo muss
  **öffentlich** sein, sonst bekommen Nutzer HTTP 404. Der Code darf in einem
  privaten Repo bleiben, wenn die Pakete in einem eigenen öffentlichen Repo
  liegen.
- Upload braucht die GitHub CLI (`gh auth login`); ohne `gh` druckt
  `pack:publish` die Schritte für den Browser.
- Auf dem Gerät: Größenprüfung vor dem Entpacken, danach Dateianzahl und
  Gesamtgröße gegen das Manifest; erst dann wird die neue Version aktiv und
  die alte entfernt. Neue Inhalte = neues Paket mit höherer Version; die App
  bietet dann „Aktualisieren“ an.
- Lokaler Test ohne GitHub: `python -m http.server 8090 --directory dist/packs`
  starten und `expo.extra.pack.baseUrlOverride` auf `http://<PC-IP>:8090`
  setzen (Handy im selben WLAN). Die App liest dann `<lang>/index.json`.

## Grenzen

Die Tonmessung ist eine Konturprüfung, kein Hörtest: Sie erkennt, ob die
Tonhöhe die erwartete Richtung nimmt, nicht ob Muttersprachler zustimmen.
Mittlerer und tiefer Ton einzelner Einsilber sind allein nicht beweisbar.
Bilder und Texte gelten als „automatisch geprüft“ nur technisch (Schema,
Integrität, Dekodierung), nicht inhaltlich.
