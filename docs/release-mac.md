# Release von Sprachblüte (MacBook)

Stand 26.10.2026, Update-Abschnitt 08.11.2026. Für Claude Code auf dem Mac und für Nico.
Die App heißt **Sprachblüte**, Bundle-ID `com.sprachbluete.app`. Version 1.0.0 (Build 9)
liegt im Store, 1.1.0 ist vorbereitet.

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

## Neuen Build hochladen (Update)

Auf dem Mac im Projektordner:

1. Lokale Änderungen von `eas init` (owner/projectId in `app.json`) sichern:
   `git add app.json && git commit -m "Link EAS project"`.
2. `git pull --rebase origin main` (holt die Fixes), dann `git push origin HEAD:main`,
   damit die Projekt-Verknüpfung auch auf GitHub liegt.
3. `eas build -p ios --profile production --auto-submit` — baut mit höherer
   Build-Nummer und lädt direkt zu TestFlight hoch.
4. Nach 10–30 min in TestFlight testen: Sprachpaket laden, Animationen.

## Welche Lernsprachen der Store-Build zeigt (seit 08.11.2026)

Der Store-Build lädt Hörclips und Bilder aus Sprachpaketen. Eine Lernsprache ohne
veröffentlichtes Paket hätte dort weder Clips noch Bilder. Deshalb zeigt er nur die Sprachen
aus `EXPO_PUBLIC_LERNSPRACHEN` in `eas.json` (Profile `production` und `rc-ios-packs`,
derzeit `th,en,es,de`; Code `src/lib/languages/released.ts`). Ohne die Variable
(Entwicklung, Studio, Tests, Profil `testflight`) gibt es alle Lernsprachen. Die übrigen
Sprachen bleiben App-Sprachen, ihr Katalog bleibt im Build.

Eine weitere Lernsprache freigeben:

1. Clips vollständig? `node -e` über den Katalog oder Studio-Bericht.
2. `npm run pack:build -- --lang <l>`, dann `npm run pack:publish -- --lang <l>` (nur mit Nicos Ja).
3. Code in `EXPO_PUBLIC_LERNSPRACHEN` eintragen (beide Profile), Test `released.test.ts`
   anpassen, neuen Build hochladen. Store-Texte in `store.config.json` nennen die Sprachen
   in der Beschreibung.

Stand 09.11.2026 (Update 1.2.0): Alle neun Lernsprachen sind vertont und freigegeben.
Die Pakete `pack-fr/pt/it/zh/ja-v1` und `pack-th-v2` sind gebaut. `pack-th-v2` liefert die
Thai-Clips nach, die nach dem 26.10. entstanden sind. Alle sechs Pakete sind veröffentlicht.
1.2.0 (Build 11) ist am 09.11.2026 zur Prüfung eingereicht. Der erste Klick auf
„Zur Prüfung hinzufügen“ brach mit einem Apple-Serverfehler ab, nach Neuladen ging es.

## Update 1.1.0

- Version in `app.json`, `package.json` und `store.config.json` (`apple.version`) auf 1.1.0.
  Die Build-Nummer zählt EAS selbst hoch (`appVersionSource: remote`).
- „Neu in dieser Version“ steht je Sprache als `releaseNotes` in `store.config.json`
  und geht mit `npx eas metadata:push` zu App Store Connect (Apple-Anmeldung durch Nico).
- Bauen und hochladen: `eas build -p ios --profile production --auto-submit`
  (läuft in der Expo-Cloud, geht auch von Linux aus).
- In TestFlight auf dem iPhone prüfen: nur Thai, Englisch, Spanisch, Deutsch als
  Lernsprache; Update über die alte Version installieren und schauen, dass der Lernstand
  bleibt; Einstellungen → Datensicherung → „Jetzt sichern“ und „Zurückholen“; Heute-Karte,
  Kapitel-Check, Tempo-Runde; Sprachpaket schon geladen bzw. neu laden.
- Dann in App Store Connect Version 1.1.0 anlegen (macht `eas metadata:push` mit), Build
  wählen, „Zur Prüfung einreichen“ (Nico).
