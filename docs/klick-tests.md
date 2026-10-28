# Klick-Tests am Android-Emulator

Seit 28.10.2026. Die Jest-Tests prüfen Bausteine einzeln. Die Klick-Tests
bedienen die **installierte App** wie ein Nutzer: Reiter wechseln, Sprache
wählen, jede Übung öffnen, Karten aufdecken. So fallen Fehler auf, die nur auf
dem Gerät auftreten (zum Beispiel der Entpacker-Fehler `extractor.native.ts`
vom 28.10.).

Kein zusätzliches Werkzeug nötig: Node + `adb` aus dem Android-SDK.
Jedes Auslesen des Bildschirms (`uiautomator dump`) kostet fest ~2 s; die
Abläufe lesen deshalb sparsam (`g.letzteKnoten` wiederverwenden). Gedacht
für den Lauf vor einem Build, nicht nebenbei.

## Ablauf

```bash
emulator -avd ThaiSpeaker_API36 -no-audio -gpu swiftshader_indirect -memory 4096 -cores 4
npm run e2e:android                    # schonend, Übungen nur Thai (~6 min)
npm run e2e:android -- --alle          # dazu Übungen Spanisch + Deutsch (~+8 min)
npm run e2e:android -- --nur Karte     # nur passende Abläufe
npm run e2e:android -- --frisch        # alles, inkl. Einführung und Bewerten
```

- **Emulator mit 4 GB starten.** Mit den 2 GB der AVD lagert er aus, die App
  braucht dann ~50 s bis zur Übersicht und Reiter reagieren erst nach
  Sekunden. Mit `-gpu host` stürzte der Emulator am 28.10. einmal im
  Grafikteil (`gfxstream`) ab; `swiftshader_indirect` lief stabil.
- Die App muss installiert sein (z. B. `adb install -r android/app/build/outputs/apk/release/app-release.apk`).
- Der Läufer schaltet die Emulator-Animationen für die Dauer des Laufs ab
  (`animator_duration_scale` usw.) und stellt den alten Wert danach wieder
  her. Die App hält ihre Deko dann still (`useReducedMotion`); sonst wird der
  Bildschirm nie „ruhig“ und `uiautomator dump` schlägt fehl.
- `--frisch` speichert vorher einen Emulator-Schnappschuss
  (`vor-klicktests`), löscht die App-Daten, läuft alles durch und lädt den
  Schnappschuss danach zurück. Lernstände und geladene Sprachpakete sind
  danach wie vorher.
- Fehler: Bildschirmfoto + Elementliste unter `measurements/e2e/<Zeit>/`
  (gitignored), Kurzansicht des Bildschirms in der Ausgabe.
- Zum Erkunden: `node scripts/e2e/geraet.cjs` listet den aktuellen Bildschirm
  (`*` = antippbar, mit Koordinaten).

## Aufbau

| Datei | Inhalt |
|---|---|
| `scripts/e2e/geraet.cjs` | adb-Steuerung: Bildschirm lesen, finden, tippen, scrollen, Reiter |
| `scripts/e2e/texte.cjs` | UI-Texte aus `src/lib/i18n/dictionaries/en.ts` (Emulator läuft Englisch) |
| `scripts/e2e/ablaeufe.cjs` | die Abläufe; `schonend: false` nur mit `--frisch` |
| `scripts/e2e/lauf.cjs` | Läufer: Start je Ablauf, Log-Prüfung, Fehlerbilder, Schnappschuss |
| `scripts/e2e/geraet.test.cjs` | Unit-Test ohne Gerät (in `npm run test:scripts`) |

Texte immer über Wörterbuchschlüssel (`t('tabs.learn')`), nicht als
festen String: dann überlebt der Test eine Umformulierung. Jeder Ablauf
prüft am Ende das Log auf `ReactNativeJS`-Fehler und Abstürze.

Neue Übung im Lern-Reiter: Sie wird automatisch mitgeprüft („Jede Übung
öffnet“ liest die Knöpfe jedes Bereichs vom Bildschirm).
