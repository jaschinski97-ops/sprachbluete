# iPhone-App über TestFlight an Tester geben

Stand 18.10.2026. Für alle, die auf Linux arbeiten und **keinen Mac** haben.
Alles, was einen Mac bräuchte (Kompilieren, Signieren), erledigt Expo in der
Cloud (EAS). Du brauchst nur das Terminal, einen Browser und ein iPhone zum
Selbsttesten.

**TestFlight** ist Apples offizieller Weg für Testversionen: Tester laden die
App „TestFlight“ aus dem App Store und installieren darüber deine App, ohne
dass sie öffentlich im App Store steht.

## Überblick

| Schritt | Wer | Dauer |
| --- | --- | --- |
| 1. Entscheiden: Medien eingebettet oder Sprachpakete | du | 1 Minute |
| 2. Apple Developer Program beitreten | du | 1–2 Tage Wartezeit |
| 3. Expo-Konto anlegen, Werkzeug installieren, Projekt verknüpfen | du | 15 Minuten |
| 4. App in der Cloud bauen (`eas build`) | Expo | 30–60 Minuten |
| 5. App in App Store Connect anlegen | du | 10 Minuten |
| 6. Build zu Apple hochladen (`eas submit`) | Expo | 15–30 Minuten |
| 7. Tester einladen | du | 5 Minuten (externe: plus Beta-Prüfung, meist ≤ 1 Tag) |

**Kosten:** Apple Developer Program 99 € pro Jahr (USA: 99 US-$). Das Expo-Konto
ist kostenlos; der kostenlose Plan hat ein monatliches Kontingent an
Cloud-Builds und eine langsamere Warteschlange (aktuelle Grenzen:
[expo.dev/pricing](https://expo.dev/pricing)). Für Android über Google Play
kommen einmalig 25 US-$ dazu (siehe unten).

**Wichtig:** Passwörter und Bestätigungscodes gibst du immer selbst ein, direkt
im Terminal oder im Browser. Claude darf und soll das nicht für dich tun.

## 1. Entscheidung vorab: Woher kommen Ton und Bilder?

Die App enthält rund 15.000 Hörclips und 3.800 Bilder (zusammen etwa 350 MB). Es gibt
zwei Wege, sie auf das iPhone zu bringen:

| | **A) Eingebettet** (Profil `testflight`) | **B) Sprachpakete** (Profil `production`) |
| --- | --- | --- |
| Was steckt in der App? | alles, ca. 411 MiB | nur Texte und Übungen, Medien fehlen |
| Was tun Tester nach der Installation? | nichts, sofort offline nutzbar | je Lernsprache auf „Laden“ tippen (rund 100 MB), danach offline |
| Vorarbeit für dich | keine | Pakete bauen und auf GitHub veröffentlichen, Repo in `app.json` eintragen |
| Neue Hörclips/Bilder | neuer Build nötig | neues Paket genügt, kein neuer Build |
| Geprüft? | derselbe Medienweg wie beim lokal geprüften Quellkandidaten vom 30.09. | Download-Weg wurde noch nie auf einem echten Gerät getestet |
| Google Play | für Google Play zu groß | nötig für Google Play |

**Empfehlung für die erste TestFlight-Runde: A (`testflight`).** Weniger
bewegliche Teile, die App funktioniert ab dem ersten Start ohne Netz, und die
Medien kommen auf demselben Weg wie beim lokal abgenommenen Kandidaten. Der Store-Weg mit
Sprachpaketen (Entscheidung vom 08.10.) bleibt bestehen und kann in einer
zweiten Runde getestet werden.

Die Größe ist für Apple kein Problem (Grenze 4 GB). Über Mobilfunk fragt das
iPhone bei Apps über 200 MB nach; Tester installieren am besten im WLAN.

### Falls du B wählst: Sprachpakete veröffentlichen

Die GitHub-Anmeldung (`gh`) ist auf diesem Rechner bereits eingerichtet.

Zuerst in `app.json` unter `expo.extra.pack.repo` den Platzhalter `OWNER/REPO`
durch `jaschinski97-ops/jaschinski97-ops-LanguageApp` ersetzen. Dorthin lädt
`pack:publish` hoch, und von dort lädt die App. Das Repo muss öffentlich sein
(ist es). Dann im Projektordner die Pakete bauen:

```bash
npm run pack:build -- --lang all
```

Danach jede Sprache einzeln hochladen (legt je ein öffentliches GitHub-Release
`pack-<sprache>-v<N>` an):

```bash
npm run pack:publish -- --lang th
```

```bash
npm run pack:publish -- --lang en
```

```bash
npm run pack:publish -- --lang es
```

```bash
npm run pack:publish -- --lang de
```

Einzelheiten: `docs/PIPELINE.md` §5. In allen folgenden Befehlen steht dann
`--profile production` statt `--profile testflight`; die App selbst ist dann
nur rund 21 MB groß.

## 2. Apple Developer Program

1. Ein Apple-Account mit Zwei-Faktor-Authentifizierung ist Voraussetzung (den
   hast du, wenn du ein iPhone nutzt).
2. Am einfachsten auf dem iPhone die App **Apple Developer** aus dem App Store
   laden und dort „Jetzt registrieren“ wählen. Alternativ im Browser:
   [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/).
3. Als **Einzelperson** anmelden. Dein echter Name erscheint dann später im
   App Store als Anbieter. (Als Organisation bräuchtest du eine D-U-N-S-Nummer;
   das dauert deutlich länger.)
4. 99 € bezahlen. Die Freischaltung kann bis zu zwei Tage dauern; du bekommst
   eine E-Mail.
5. Danach kannst du dich auf [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   anmelden.

## 3. Expo-Konto und Werkzeug

1. Auf [expo.dev/signup](https://expo.dev/signup) ein kostenloses Konto anlegen.
2. Terminal öffnen und in den Projektordner wechseln:

   ```bash
   cd ~/Schreibtisch/ThaiSpeaker-Linux-Mint
   ```

3. Das Expo-Werkzeug installieren (einmalig, kein sudo nötig):

   ```bash
   npm install -g eas-cli
   ```

4. Anmelden (fragt nach Expo-Benutzername und Passwort):

   ```bash
   eas login
   ```

5. Projekt mit deinem Expo-Konto verknüpfen (einmalig; bestätige die Frage, ob
   ein neues Projekt angelegt werden soll):

   ```bash
   eas init
   ```

   Das trägt `owner` und `extra.eas.projectId` in `app.json` ein. Diese
   Änderung bitte committen (oder Claude bitten, sie zu committen).

## 4. App in der Cloud bauen

Vorher kurz prüfen, dass kein anderer Chat gerade halbfertige Änderungen im
Ordner hat (`git status` zeigt nur erwartete Dateien). EAS lädt den aktuellen
Ordnerstand hoch, rund 400 MB; das dauert je nach Upload-Geschwindigkeit einige
Minuten.

```bash
eas build -p ios --profile testflight
```

Beim **ersten** Build fragt das Werkzeug:

- „Do you want to log in to your Apple account?“ → **Yes**, dann Apple-ID,
  Passwort und den Code, der auf deinem iPhone erscheint.
- Team auswählen (dein Name).
- Falls gefragt wird, ob die Bundle-ID `com.thailernbegleiter.app` registriert
  werden soll → **Yes**.
- „Generate a new Apple Distribution Certificate?“ → **Yes**.
- „Generate a new Apple Provisioning Profile?“ → **Yes**.
- Falls nach Push-Benachrichtigungen gefragt wird → **No** (die App nutzt keine).

Die Frage zur Verschlüsselung kommt nicht: `app.json` erklärt bereits, dass die
App keine eigene Verschlüsselung enthält (`ITSAppUsesNonExemptEncryption:
false`). Expo speichert Zertifikat und Profil sicher in deinem Konto; bei
späteren Builds wird nichts mehr gefragt.

Der Build läuft dann auf einem Mac in der Cloud. Den Fortschritt siehst du im
Terminal oder auf [expo.dev](https://expo.dev) unter deinem Projekt → Builds.
Du kannst das Terminal schließen; der Build läuft weiter.

## 5. App in App Store Connect anlegen

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **Neue App**.
2. Plattform **iOS**.
3. **Name:** der Name im App Store (höchstens 30 Zeichen, muss im ganzen App
   Store frei sein). In `app.json` steht derzeit „Thai Lernbegleiter“; die App
   lehrt aber vier Sprachen. Der Name ist deine Entscheidung (siehe „Offene
   Punkte“). Für TestFlight kannst du ihn später noch ändern.
4. **Primäre Sprache:** z. B. Deutsch.
5. **Bundle-ID:** `com.thailernbegleiter.app` auswählen (sie erscheint, sobald
   der erste Build sie registriert hat).
6. **SKU:** ein beliebiges eigenes Kürzel, z. B. `thaispeaker-1`.
7. **Benutzerzugriff:** Vollständiger Zugriff.

Falls `eas submit` im nächsten Schritt anbietet, den Eintrag selbst anzulegen,
kannst du das stattdessen annehmen.

## 6. Build zu Apple hochladen

Sobald der Build fertig ist:

```bash
eas submit -p ios --profile testflight --latest
```

Beim ersten Mal: Apple-Anmeldung wie oben, dann „Generate a new App Store
Connect API Key?“ → **Yes**. Danach geht es ohne Rückfragen.

Apple verarbeitet den Build danach noch 10–30 Minuten und schickt eine E-Mail,
sobald er in TestFlight bereitsteht.

**Abkürzung für später:** Bauen und Hochladen in einem Befehl:

```bash
eas build -p ios --profile testflight --auto-submit
```

Jeder neue Build bekommt automatisch eine höhere Build-Nummer. Die Versionsnummer
`1.0.0` in `app.json` bleibt, bis du sie für eine neue Version erhöhst.

## 7. Tester einladen

In App Store Connect: deine App → Reiter **TestFlight**.

### Interne Tester (bis 100, ohne Prüfung)

Gut für dich selbst und wenige Vertraute.

1. Interne Tester müssen Mitglied deines App-Store-Connect-Teams sein:
   **Benutzer und Zugriff** → **+** → Name und E-Mail, Rolle z. B. „Entwickler“
   oder „Marketing“. Die Person bekommt eine Einladung und muss sie annehmen.
2. TestFlight → **Interne Tests** → **+** → Gruppe anlegen (z. B. „Team“).
3. **Tester einladen** → Personen auswählen.
4. Build zur Gruppe hinzufügen. Er ist sofort verfügbar, ohne Apple-Prüfung.

Für dich selbst: Du bist als Kontoinhaber schon Teammitglied; lege die Gruppe
an und füge dich hinzu.

### Externe Tester per öffentlichem Link (bis 10.000, kurze Beta-Prüfung)

Gut für Freunde, Lernende, Bekannte, ohne sie ins Team aufzunehmen.

1. Zuerst muss es eine interne Gruppe geben (siehe oben).
2. TestFlight → **Testinformationen** ausfüllen: Beta-App-Beschreibung
   (Pflicht, z. B. „Offline-Sprachlern-App für Thai, Englisch, Spanisch und
   Deutsch. Bitte Sprechübungen und Flugmodus testen.“), Feedback-E-Mail,
   Kontaktdaten für Apples Prüfer. Eine Anmeldung in der App gibt es nicht.
   Apple kann zusätzlich eine Datenschutz-URL verlangen; für den App Store
   brauchst du sie ohnehin.
3. TestFlight → **Externe Tests** → **+** → Gruppe anlegen (z. B. „Beta“).
4. Build hinzufügen → **Zur Prüfung einreichen**. Die erste Beta-Prüfung dauert
   meist bis zu einem Tag; weitere Builds derselben Version gehen oft ohne
   volle Prüfung durch.
5. Nach der Freigabe in der Gruppe **Öffentlichen Link aktivieren** (optional
   mit Höchstzahl an Testern). Den Link kannst du per Messenger oder E-Mail
   teilen. Achtung: Wer den Link hat, kann ihn weitergeben. Du kannst ihn
   jederzeit abschalten.

Jeder Build läuft 90 Tage nach dem Hochladen ab. Für längere Tests einfach
einen neuen Build hochladen.

## Was Tester tun müssen

1. iPhone mit iOS 16.4 oder neuer (die App ist nur für iPhone; auf dem iPad
   läuft sie im iPhone-Format).
2. Die App **TestFlight** aus dem App Store installieren.
3. Die Einladungs-E-Mail auf dem iPhone öffnen und „In TestFlight ansehen“
   tippen, oder den öffentlichen Link auf dem iPhone öffnen.
4. **Annehmen** und **Installieren** (am besten im WLAN, die App ist groß).
5. Rückmeldung: In der TestFlight-App „Feedback senden“, oder in der App einen
   Screenshot machen und „Feedback an Entwickler“ wählen. Die Rückmeldungen
   erscheinen in App Store Connect unter TestFlight → Feedback.

## Checkliste für den ersten Gerätetest

Aus `docs/release-candidate-2026-09-30.md`. Erst selbst durchgehen, bevor du
externe Tester einlädst. Ergebnisse bitte notieren (oder Claude geben, damit
sie in die Release-Doku kommen).

**Installation und offline**

- [ ] App mit Internet installieren und einmal öffnen.
- [ ] Nur bei Sprachpaketen (Weg B): alle vier Sprachen laden, Fortschritt und
      Größe plausibel, danach Neustart.
- [ ] Flugmodus einschalten, App ganz schließen und neu starten.
- [ ] Alle vier Lernsprachen (Thai, Englisch, Spanisch, Deutsch): Dialogclips
      abspielen, Karteikarten, Bilder sichtbar.
- [ ] Thai → Deutsch (Oberfläche Thai, Lernsprache Deutsch) stichprobenartig.
- [ ] Fortschritt bleibt nach Neustart erhalten.

**Mikrofon**

- [ ] Erste Sprechübung: Systemdialog erscheint in der Gerätesprache (Deutsch,
      Englisch, Spanisch oder Thai; andere Sprachen zeigen den englischen
      Text).
- [ ] „Erlauben“: Aufnahme starten und stoppen, lokale Auswertung erscheint.
- [ ] „Nicht erlauben“: App erklärt, wie man es in den Einstellungen freigibt,
      und stürzt nicht ab.
- [ ] Eigene Aufnahme wiedergeben.

**Shadowing und Audiokategorie** (`src/lib/audio-mode.ts`, wichtigster offener
iOS-Punkt)

- [ ] Shadowing: Hörclip läuft, gleichzeitig wird aufgenommen. Clip bleibt
      hörbar und wird nicht plötzlich leiser oder bricht ab.
- [ ] Danach normale Wiedergabe: Lautstärke wieder normal, Ton kommt aus dem
      Lautsprecher (nicht aus der Hörmuschel).
- [ ] Dasselbe mit Kopfhörern (Kabel oder Bluetooth).
- [ ] Unterbrechungen: Anruf, Wecker oder Siri während einer Aufnahme; danach
      funktioniert die Übung wieder.
- [ ] App in den Hintergrund und zurück, während ein Clip läuft und während
      einer Aufnahme.

Erst nach dieser Abnahme die Store-Unterlagen angehen (siehe „Offene Punkte“).

## Android-Tester

Zwei Wege:

**APK direkt (einfach, ohne Google-Konto)** über das vorhandene Profil
`preview` (Medien eingebettet):

```bash
eas build -p android --profile preview
```

Am Ende zeigt das Terminal einen Link und QR-Code zur Build-Seite. Diesen Link
an Tester schicken. Sie öffnen ihn auf dem Android-Handy, laden die APK (gut
400 MB) und erlauben beim Installieren „Apps aus unbekannten Quellen“ für
ihren Browser. Updates: neuen Build bauen, neuen Link schicken; die App wird
darüber installiert, der Lernstand bleibt.

**Google Play interner Test (bis 100 Tester)**

- Google-Play-Console-Konto: einmalig 25 US$, mit Identitätsprüfung.
- Dafür ist **Weg B (Sprachpakete)** Pflicht: Google Play begrenzt die
  Downloadgröße des App-Grundpakets (je nach Stand der Google-Hilfe 200 bzw.
  500 MB); eine App mit allen eingebetteten Medien passt nicht sicher hinein.
  Das Profil `production` baut das nötige App-Bundle (AAB) ohne Medien.
- Den ersten Build musst du in der Play Console von Hand hochladen
  (Internes Testen → Neuer Release). Für spätere Uploads mit
  `eas submit -p android` braucht es einen Google-Dienstkonto-Schlüssel.
- Neue private Entwicklerkonten müssen vor der Veröffentlichung im Play Store
  einen geschlossenen Test mit mindestens 12 Testern über 14 Tage machen. Für
  den internen Test gilt das nicht.

## Offene Punkte für dich

Vor dem ersten TestFlight-Build:

1. **Weg wählen:** A (`testflight`, empfohlen) oder B (Sprachpakete).
2. **Apple Developer Program** beitreten (99 €/Jahr).
3. **Expo-Konto** anlegen, `npm install -g eas-cli`, `eas login`, `eas init`,
   die Änderung an `app.json` committen.
4. `eas build -p ios --profile testflight` (Apple-Anmeldung im Terminal).
5. App in App Store Connect anlegen, dann
   `eas submit -p ios --profile testflight --latest`.
6. Interne Gruppe anlegen, selbst installieren, Checkliste oben durchgehen.

Vor externen Testern bzw. dem öffentlichen App Store:

- **App-Name** entscheiden. „Thai Lernbegleiter“ passt nicht mehr zu vier
  Lernsprachen und erscheint als Name unter dem App-Symbol. Vorschläge: ein
  neutraler Name wie „ThaiSpeaker“ (der Projektname) oder ein Name ohne
  Sprachbezug. Ändern heißt `expo.name` in `app.json`; Bundle-ID und Schema
  bleiben besser, wie sie sind.
- **Datenschutzerklärung** als Webseite (Pflicht für den App Store). Inhalt im
  Kern: keine Konten, keine Analyse, Aufnahmen bleiben auf dem Gerät, bei
  Sprachpaketen Download von GitHub.
- **App-Datenschutz** in App Store Connect: „Keine Daten erfasst“ passt nach
  heutigem Stand; bitte vor dem Absenden noch einmal gemeinsam prüfen.
- Für den App Store: Screenshots (6,9-Zoll-iPhone), Beschreibung,
  Altersfreigabe-Fragebogen, Händlerstatus für die EU (als Händler werden
  Adresse und Telefon öffentlich angezeigt).
- Der Mikrofontext ist auf Deutsch, Englisch, Spanisch und Thai übersetzt. Die
  anderen 16 App-Sprachen zeigen den englischen Text; weitere Übersetzungen
  kommen in `app.json` unter `locales`.
