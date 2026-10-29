# Store-Unterlagen Sprachblüte (Stand 29.10.2026)

Alles, was App Store und Google Play für die erste Veröffentlichung brauchen.
Texte für Apple stehen in `store.config.json` (Projektwurzel) und gehen mit
`npx eas metadata:push` direkt zu App Store Connect. Screenshots und Google-Play-Angaben
lädst du selbst hoch (Apple und Google bieten dafür keinen Weg ohne deine Anmeldung).

## Inhalt

| Datei / Ordner | Wofür |
| --- | --- |
| `screenshots/ios/de-DE`, `en-US` | iPhone 6,9″ (1290 × 2796), je 6 Bilder |
| `screenshots/android/de-DE`, `en-US` | Google Play Telefon (1290 × 2580, Seitenverhältnis 2:1), je 6 Bilder |
| `google-play/icon-512.png` | Play-Symbol 512 × 512 |
| `google-play/feature-graphic.png` | Play-Kopfgrafik 1024 × 500 |
| `google-play/<sprache>/title.txt`, `short-description.txt`, `full-description.txt` | Play-Eintrag (de-DE, en-US, es-ES, th) |
| `../store.config.json` | Apple: Texte in de/en/es/th, Kategorie Bildung, Altersfreigabe |
| `app-review-notes.txt` | Hinweise für Apples Prüfer (englisch), zum Einfügen in App Store Connect |

Screenshots zeigen die echte App (Android-Emulator in iPhone-Größe, Statusleiste bereinigt).
Den Shadowing-Vergleich nach einer Aufnahme zeigen sie noch nicht; ein echter iPhone-Screenshot
davon kann später als siebtes Bild dazu.

## App Store (iPhone)

1. Texte übertragen: im Projektordner `npx eas metadata:push` ausführen. Es fragt nach deiner Apple-ID,
   dem Passwort und dem Code auf dem iPhone (das kann nur du eingeben).
2. App Store Connect → Sprachblüte → Version 1.0:
   - Screenshots „iPhone 6,9″“: Bilder aus `screenshots/ios/de-DE` (Deutsch) und `en-US` (Englisch) hineinziehen.
     Spanisch und Thai übernehmen sonst die deutschen.
   - Build: **9** auswählen (enthält Shadowing und Worterkennung).
   - Informationen zur App-Prüfung: Vorname Nico, Nachname Jaschinski, E-Mail jaschinski97@gmail.com,
     deine **Telefonnummer**, „Anmeldung erforderlich“ aus. Den Text aus `app-review-notes.txt` ins Feld
     „Anmerkungen“ kopieren. (`eas metadata` überträgt diesen Block nur mit Telefonnummer.)
3. App-Datenschutz: „Daten werden nicht erfasst“. Datenschutz-URL ist gesetzt.
4. Preise und Verfügbarkeit: kostenlos, alle Länder.
5. Altersfreigabe: Fragebogen kurz ansehen; alles „Nein/Keine“ (wird von `metadata:push` vorbefüllt).
6. EU (Digital Services Act): Händlerstatus angeben. Ohne Einnahmen und als Privatperson in der Regel
   „kein Händler“; als Händler würden Adresse und Telefon öffentlich angezeigt. Deine Entscheidung.
7. „Zur Prüfung einreichen“. Veröffentlichung nach der Freigabe ist auf „manuell“ gestellt.

## Google Play (Android)

1. Play Console: Entwicklerkonto (einmalig 25 US-$) und Identitätsprüfung.
2. „App erstellen“: Name Sprachblüte, Standardsprache Deutsch, App, kostenlos.
3. Haupteintrag im Store: Texte aus `google-play/<sprache>/`, Symbol, Kopfgrafik und
   Telefon-Screenshots aus `screenshots/android/<sprache>/`. Kategorie: Bildung.
   Kontakt-E-Mail: jaschinski97@gmail.com, Website: https://jaschinski97-ops.github.io/sprachbluete/
4. App-Inhalte:
   - Datenschutzerklärung: https://jaschinski97-ops.github.io/sprachbluete/datenschutz.html
   - Werbung: Nein. App-Zugriff: alles ohne Anmeldung.
   - Inhaltsbewertung (IARC): Kategorie „Bildung/Referenz“, alle Fragen Nein.
   - Zielgruppe: ab 13 Jahren (sonst gelten die strengeren Regeln für Kinder-Apps).
   - Datensicherheit: keine Daten erhoben, keine geteilt. Mikrofon-Aufnahmen und Worterkennung
     bleiben auf dem Gerät (zählt bei Google nicht als Erhebung).
5. Neue private Entwicklerkonten müssen vor der Produktion einen **geschlossenen Test mit mindestens
   12 Testern über 14 Tage** laufen lassen. Erst danach lässt Google „Produktion“ zu.
6. App-Bundle (`.aab`) aus dem EAS-Build herunterladen und unter „Test → Geschlossener Test“
   hochladen; „Play App-Signatur“ annehmen. Spätere Builds können mit `eas submit -p android`
   automatisch hochgehen, sobald ein Dienstkonto-Schlüssel eingerichtet ist.
