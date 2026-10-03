# Changelog

Alle nennenswerten Änderungen an ThaiSpeaker (Lernbegleiter). Neueste oben.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).
Die ausführliche Entwicklungsgeschichte bis zum 25.09.2026 steht in
[`docs/arbeitsverlauf-bis-2026-09-25.md`](docs/arbeitsverlauf-bis-2026-09-25.md).

## [Unveröffentlicht] – 03.10.2026

### Endnutzerkorrekturen und lokale Bilder

- Lesequiz zeigt Umschrift ausschließlich bei Thai, auch in Sprecherfragen und Auswahlantworten. Kapitel zeigen ihre sieben Übungsschritte ohne doppelte Beispiele und Regeln oberhalb der Übungen.
- Rollenspiel hält getippte und erkannte Antworten beim Mustervergleich und der Selbsteinschätzung sichtbar; Beschriftung in allen 20 App-Sprachen.
- B1-Verständnisfragen zählen im Tagesfortschritt, ohne FSRS-Wiederholung oder Bewertung freier Antworten. Doppelte Weiter-Klicks zählen nicht doppelt. App-Informationen nennen alle vier Lernsprachen aus der zentralen Liste.
- ComfyUI als Bildanbieter ohne Schlüssel, mit lokalem FLUX.2 klein 4B distilled FP8, CPU-Textencoder und kompakten 512×512-WebP-Karten. Kein Cloud-Fallback. Lokale Bildläufe exportieren ausschließlich Bildentwürfe in den Stage; der bestehende, übergroße Stage wird nicht automatisch veröffentlicht. Text- und Audioauswahl bleiben unverändert.
- Drei lokale Motivproben und zwei einzelne Studio-Läufe ausgeführt; Start- und Probeskript sowie Einrichtung unter `docs/lokale-bilder.md`. Goethe B2 bleibt ausdrücklich zurückgestellt.

## [Unveröffentlicht] – 30.09.2026

### Lernen und iPhone-Kandidat

- Geführte Kapitel verwenden ausschließlich passende Szenenwörter (bis zu 20). Grammatik erklärt die tatsächlichen Regeln der Szene mit übersetzten Beispielen und führt anschließend ins Rollenspiel. Kapiteltexte sind ohne vorgeschaltete Karteikarten-Sperre lesbar.
- Karteikarten und Satzübungen verwenden vollständig gelieferte Dialogübersetzungen statt einzelner Wortbedeutungen als Satzübersetzung. Nicht übersetzte fremdsprachige Beispielsätze werden ausgeblendet. Thai behält Schrift und Umschrift; lateinische Dialoge zeigen keine irreführende Pseudo-Umschrift.
- Schreiben bietet eine Muster- und Zeichenhilfe; unterstützte Antworten schreiben keine FSRS-Wiederholung. Vollständig übersprungene Tagesrunden behaupten keine gespeicherten Wiederholungen.
- Rollenspiele akzeptieren ausdrücklich geprüfte deutsche Namensvarianten und die englische Kurzantwort „Yes, my name is …“. Andere Formulierungen erhalten einen neutralen Vergleich mit dem Muster und können selbst eingeschätzt werden.
- Goethe-Anweisungen, Lösungserklärungen und freie Aufgaben unterstützen Thai; deutsche Prüfungsstimuli bleiben deutsch. Teilübersichten haben thailändische und englische Lernhilfen.
- B1 zeigt bei fehlenden gebündelten Clips unmittelbar den Lesetext und kennzeichnet die optionale Systemstimme. Geprüfte B1-Hörclips bleiben offen.
- Neue Lernhilfen sind in allen 20 Oberflächensprachen vorhanden. Pluralbeschriftungen und das Audio-nicht-verfügbar-Label verwenden Übersetzungsschlüssel.
- Expo-SDK-57-Pakete wurden auf kompatible Patchstände aktualisiert; der hohe npm-Audit-Befund wurde durch ein kompatibles Dependency-Update beseitigt. 15 moderate Befunde bleiben offen.
- Lokale Produktionsprüfung für iOS, Android und Web; Freigabestatus und offene Geräte-, Inhalts- und Signierungsschritte stehen in `docs/release-candidate-2026-09-30.md`.

## [Unveröffentlicht] – 29.09.2026

### Lernen

- Das Lesequiz setzt die Auswahl bei jeder neuen Frage zurück. Thai-Worthilfen markieren nur noch Treffer an Wortgrenzen; zufällige Teiltreffer in Namen und längeren Wörtern verschwinden.
- Das Rollenspiel zählt getippte und gesprochene eigene Zeilen neutral als „Eigene Zeilen“.
- Die geführten Thai-Kapitel wechseln bei Markt- und Unterwegs-Szenen die Grammatikübung; die Höflichkeitspartikel-Runde umfasst fünf statt zehn gleichartige Fragen.
- Die Tagesrunde nutzt für Hören, Satzbildung, Diktat und Shadowing vorrangig die Wörter ihrer Karten. Shadowing bietet einen sichtbaren Knopf zum erneuten Hören.
- „Sag es“ zieht Sätze zuerst aus begonnenen und häufigen Wörtern statt zufällig aus dem gesamten Satzbestand.
- „Sag es“ zeigt nach der letzten Antwort wieder den echten Rundenabschluss statt „Kein Wortmaterial“. Übersprungene Nachsprech-Sätze werden nicht mehr als bearbeitet gezählt.

## [Unveröffentlicht] – 28.09.2026

### Lernen

- Thai-Wörter, Sätze und Antwortmöglichkeiten zeigen in den Lernübungen die vorhandene Umschrift mit Tonzeichen direkt unter der Thai-Schrift; das gilt auch für Karteikarten, Satz- und Grammatikübungen, Lesefragen, Tagesrunde und die neue B1-Einheit. Verdeckte Lösungen in Hör- und Schreibaufgaben bleiben bis zur Auswertung verdeckt. Die Umschrift der neuen B1-Texte ist neu ergänzt und benötigt wie die Texte noch eine unabhängige Sprachprüfung.
- Die App-Sprachwahl in den Einstellungen zeigt neben jedem Eigennamen auch den englischen Sprachnamen. Übersetzungen innerhalb der Aufgaben bleiben unverändert.
- Je eine erste B1-Vertiefung ist für Thai, Englisch, Spanisch und Deutsch verfügbar: längerer Text in drei Abschnitten, Hörversuch ohne eingeblendeten Text, drei Verständnisfragen, anschließendes Lesen, freie Schreibaufgabe und mündliche Antwort. Das Zielniveau ist eine Übungsorientierung und keine GER-Zertifizierung; die neuen Texte benötigen noch eine unabhängige Sprachprüfung.
- Freie Antworten bleiben lokal auf dem Gerät. Die App zeigt eine Beispielantwort und Kriterien zur Selbstprüfung, vergibt dafür aber keine vorgetäuschte automatische Punktzahl. Die Hörfunktion verwendet nur eine verfügbare Systemstimme; ohne Stimme erscheint der jeweilige Abschnitt als Text. Für diese neuen Texte sind noch keine geprüften Audioclips gebündelt.
- Eine fehlerhafte Formulierung im bestehenden deutschen B1-Lesetext wurde korrigiert.

## [Unveröffentlicht] – 27.09.2026

### Lernen

- Der Lernpfad zeigt echte A1/A2-Kapitel aus den mitgelieferten Dialogsituationen. Das nächste offene Kapitel wird hervorgehoben; jedes Kapitel bietet einen thematischen Dialog, bis zu 20 passende Karteikarten, Sätze zum Hören und Nachsprechen, Lesen, Schreiben, Grammatik und Rollenspiel. Der manuelle Kapitelabschluss wird lokal pro Lernrichtung gespeichert. Fehlende Themen werden nicht als fertige Kapitel angezeigt.
- Der Lern-Reiter öffnet jetzt eine ruhige Startseite mit einer Satzbau-Erklärung und einer geführten Folge aus Grammatik, Wortschatz, Hören, Lesen, Schreiben und Sprechen. Die Beispielwörter passen zur gewählten Lernsprache.
- Wortschatz, Hören, Lesen & Schreiben, Sprechen und Grammatik stehen in eigenen, aufklappbaren Zeilen statt in einer gemeinsamen Chip-Leiste. Alle bisherigen Übungen bleiben erreichbar.
- Eine Karteikartenrunde enthält höchstens 20 Wörter; bei genügend Stoff werden bis zu 20 neue Karten zugelassen, fällige Wiederholungen zuerst. Danach kann man schreibgeeignete Wörter aus derselben Runde eintippen. Die tägliche gemischte Runde bleibt erreichbar.
- Hörverständnis, Shadowing und Satzwiederholung enden nach acht Sätzen statt den gesamten Satzbestand als eine Runde anzuzeigen.
- Neue Texte für die Lernübersicht sind in allen 20 Oberflächensprachen enthalten.

## [Unveröffentlicht] – 26.09.2026

Ergebnis einer Testrunde über mehrere App-Sprachen (Deutsch, Englisch, Thai,
Arabisch, Urdu) plus drei Code-Prüfungen durch KI-Agenten.

### Lernen – behoben

- **Neue Karteikarten kommen in Häufigkeitsreihenfolge.** Vorher entschied die
  Speicherreihenfolge, Anfänger bekamen „Zehennagel“ vor „Hallo“.
- **Lesetexte schalten sich wieder frei.** Maßgeblich ist jetzt der gesamte
  Wortschatzstand der Sprache (A1 ab 20, A2 ab 50 begonnenen Karten). Vorher
  zählten nur die Wörter der jeweiligen Szene, und die Texte blieben praktisch
  für immer gesperrt.
- **Lesetexte: angetippte Wörter** zeigen ihre Bedeutung in der App-Sprache
  (vorher immer Deutsch) und werden nur noch gegen den Wortschatz der
  Lernsprache gesucht.
- **Schreiben: Synonyme zählen als richtig.** Wer „easy“ statt „simple“ tippt
  (beides „einfach“), bekommt kein „Nochmal“ mehr.
- **Englisch-Übungen ohne feste deutsche Texte.** „Gleiche Schreibung, anderer
  Laut“, „Wort hören“, „Unregelmäßige Verben“ und „Dritte Form“ zeigen
  Bedeutung und Erklärung in der App-Sprache. Neue Übersetzungen in allen
  20 Sprachen.
- **„Wort hören“ verrät die Antwort nicht mehr.** Die Lautschrift an jeder
  Antwortoption ist weg; sie steht erst in der Auflösung.
- **Ohne Mikrofon geht es weiter.** „Sprechen“, „Shadowing“ und „Satz
  wiederholen“ haben immer einen Weiter-Knopf. Vorher hing man ohne
  Mikrofonfreigabe beim ersten Wort fest.
- **Goethe-Module für Englischsprachige:** Prüfungstexte und Antworten sind
  jetzt deutsch wie in der echten Prüfung. Englisch bleibt nur als Hilfe an
  Frage und Erklärung.
- **Zählwörter (Thai):** Die Erklärung „zwischen Zahl und Nomen“ war falsch.
  Richtig ist Nomen + Zahl + Zählwort. Korrigiert in allen 20 Sprachen,
  dazu der Hinweis und die Lösung („ein Katze“ → „1 × Katze“).
- **ser/estar:** Die Lösung war immer in der 3. Person („Yo está“). Jetzt
  „Yo estoy“ und „Los niños están“.
- **Präsens-Endungen (Spanisch):** Antworten standen doppelt zur Wahl, und
  Verben mit Akzent- oder Schreibwechsel (evaluar, proteger …) bekamen falsche
  Lösungen. Diese Verben sind ausgenommen; 240 von 254 bleiben.
- **Unregelmäßige Verben / Dritte Form:** doppelte Antwortoptionen entfernt.
- **„Sag es“:** Die Musterlösung steht als Text vor der Selbstbewertung; das
  erfundene „✓ Genau richtig“ danach ist weg. Thai-Eingaben ohne Leerzeichen
  gelten als richtig.
- **Heutige Runde:** Die Zusammenfassung zählt übersprungene Bereiche nicht
  mehr als erledigt.
- **Englische Lautschrift** einheitlich mit einem Schrägstrich („/fiːd/“
  statt „//fiːd//“).

### Mehrsprachigkeit – behoben

- **Urdu** läuft wie Arabisch von rechts nach links; die Seite trägt die
  richtige Sprachangabe (`lang`).
- **Fehlende Übersetzung** fällt auf Englisch statt auf Deutsch zurück, außer
  auf der deutschen Oberfläche.

### Entwicklerstudio – behoben

- **Wartungskarte entfernt.** Ihr Knopf „alles Generierte löschen“ hätte den
  gesamten Katalog gelöscht, obwohl der Text das Gegenteil versprach. Die
  zugehörige Helper-Route gibt es nicht mehr.
- **Gelöschtes bleibt gelöscht.** Löschen im Prüfbericht (Katalog und Stage)
  trägt den Eintrag in `catalog.deleted` ein. Vorher kam er beim nächsten
  Export aus dem Browser-Speicher zurück.
- **Vokabeln löschen nimmt ihre Bilder mit.** Vorher blieb das Bild verwaist,
  und jeder folgende Publish scheiterte am Bild-Vertrag.
- **Fehlerprotokoll** legt `pipeline/logs` bei Bedarf selbst an (frischer Klon).

### Release

- **Cloud-Build (EAS) blockiert nur noch bei echten Fehlern.** Fehlende Bilder,
  Hörclips oder Dialoge sind eine Warnung. Integritätsfehler (kaputte oder
  verwaiste Dateien, Budget) blockieren weiterhin.

### Aufgeräumt

- Einmal-Skripte, veraltete Dokumente und 16.700 Laufprotokolle aus dem
  Repository entfernt; AGENTS.md von 110 KB auf einen Kurzstand gekürzt.
- Großen Altbericht (188 MB) aus dem Git-Verlauf getilgt, damit das Repository
  auf GitHub passt.

### Tests

- 1242 Jest-Tests, 57 Skript-Tests. Neu: Regressionstests für alle Punkte oben
  (Kartenreihenfolge, Lesetext-Freischaltung, Synonyme, Englisch ohne Deutsch,
  ser/estar, Präsens-Endungen, Thai-Leerzeichen, Löschen mit Bildern,
  `deleted`-Vermerk, entfernte Route, EAS-Warnung).

### Bekannt, noch offen

- Stammformen (Deutsch): Verben mit beiden Hilfsverben („ist/hat geritten“)
  werten eine richtige Antwort als falsch.
- Arabisch: „مقال“ für die Artikel-Übung, Untertitel in Umgangssprache.
- Fest deutsch: „Plural:“ beim Schreiben, Fehlermeldungen der Datensicherung.
- Keine Pluralregeln („1 Wörter“).
- Studio: Der „schlaue Export“ lädt Clips immer neu hoch; „Neu erzeugen“ im
  Prüfbericht überspringt vorhandene Clips.
