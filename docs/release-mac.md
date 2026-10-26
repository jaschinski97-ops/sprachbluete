# Release von Sprachblüte (MacBook)

Stand 26.10.2026. Für Claude Code auf dem Mac und für Nico. Die App heißt
**Sprachblüte**, Bundle-ID `com.sprachbluete.app`, Version 1.0.0.

## Was schon erledigt ist

- Code, Katalog und Medien auf GitHub (`main`), Lizenz PolyForm NC + CC BY-NC-SA.
- Sprachpakete als Releases veröffentlicht: `pack-th-v1`, `pack-en-v1`, `pack-es-v1`,
  `pack-de-v1` (Repo `jaschinski97-ops/sprachbluete`, öffentlich).
  Die Store-App lädt Hörclips und Bilder je Lernsprache daraus nach.
- Webseite (GitHub Pages, Branch `gh-pages`):
  - Support/Marketing: https://jaschinski97-ops.github.io/sprachbluete/
  - Datenschutz (de): https://jaschinski97-ops.github.io/sprachbluete/datenschutz.html
  - Privacy (en): https://jaschinski97-ops.github.io/sprachbluete/privacy.html
- Logo: `assets/images/logo.svg` (Quelle), erzeugt mit `scripts/logo.cjs`.

## Ablauf auf dem Mac

1. Klonen und einrichten: `git clone https://github.com/jaschinski97-ops/sprachbluete.git`,
   Node 24 (nvm), `npm install`, dann `npx tsc --noEmit` und
   `npx jest --maxWorkers=6 --testPathIgnorePatterns=/.claude/`.
2. Expo: Konto auf expo.dev (Nico), `npm install -g eas-cli`, `eas login`,
   `eas init` (trägt `owner` und `extra.eas.projectId` in `app.json` ein, committen).
3. Store-Build mit Sprachpaketen (Profil `production`, `THAISPEAKER_MEDIA=packs`):
   `eas build -p ios --profile production`. Erstes Mal: Apple-ID-Anmeldung durch
   Nico, Zertifikat und Profil erzeugen lassen (Yes), Push-Benachrichtigungen No.
4. App Store Connect: neue App, Bundle-ID `com.sprachbluete.app`, Name „Sprachblüte“,
   SKU z. B. `sprachbluete-1`, Primärsprache Deutsch.
5. Hochladen: `eas submit -p ios --profile production --latest`. Nach 10–30 min in TestFlight.
6. Auf dem iPhone testen (Pflicht vor dem Einreichen): Sprachpaket-Download je Sprache,
   Hörclips, Bilder, Mikrofon/Sprechübung, Tag/Nacht, App-Sprache wechseln.
   Der Download-Weg wurde noch nie auf einem echten Gerät getestet.
7. Store-Eintrag: Beschreibung, Untertitel (z. B. „Thai, Englisch, Spanisch, Deutsch“),
   Schlüsselwörter, Screenshots (6,9″ iPhone), Altersfreigabe, Kategorie Bildung,
   Preis kostenlos, Datenschutz-URL und Support-URL (oben),
   App-Datenschutz „Keine Daten erfasst“. Dann „Zur Prüfung einreichen“ (Nico).

## Was nur Nico machen kann

Anmeldungen (Expo, Apple) und Zwei-Faktor-Codes, Vereinbarungen in App Store
Connect akzeptieren, „Zur Prüfung einreichen“.

## Hinweise

- Neue Hörclips oder Bilder später: neues Paket bauen (`npm run pack:build -- --lang <l>`)
  und veröffentlichen (`npm run pack:publish -- --lang <l>`, nur mit Nicos Ja); kein neuer
  App-Build nötig.
- Für Google Play gilt dasselbe Profil (`production`, App Bundle).
