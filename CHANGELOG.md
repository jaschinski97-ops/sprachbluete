# Changelog

## 08.10.2026

- Sprachpakete fertig verdrahtet: Store-Builds (`production`, neues `rc-ios-packs`) betten keine Hörclips und Bilder mehr ein (`THAISPEAKER_MEDIA=packs`, App-Bundle ≈ 21 MB statt ≈ 410 MB). In der Übersicht steht dann je Lernsprache „Laden · Größe“ mit Fortschritt statt „Lernen“, unter Einstellungen → Sprachpakete Laden, Aktualisieren und Entfernen (15 neue Texte in allen 20 Sprachen). `pack:publish` lud bisher nur die Zip unter falschem Namen hoch und hätte jeden Download scheitern lassen; jetzt Zip und Manifest mit den Namen, die die App erwartet, ins Repo aus `app.json`. `pack:build -- --lang all` baut alle vier Sprachen. Offen: öffentliches Paket-Repo eintragen, erste Pakete hochladen, Download auf dem Gerät testen.
- Aufgeräumt: drei verwaiste Vorlagen-Komponenten, `developer-content`, sieben ungenutzte Exporte, drei erledigte Einmal-Skripte (fill-english-verb, fill-exercise-data, repair-audit-2026-10-04) samt nur von ihnen genutzter Verbtabelle, der Ordner `content/` mit alten Laufberichten, der überholte RC-Bericht vom 21.09., das Audit Lernwirksamkeit und die Expo-Vorlagenlizenz entfernt. `@expo/ui` und `expo-glass-effect` aus den direkten Abhängigkeiten genommen, `globals` und `@types/node` ergänzt. Neues `npm run test:scripts` führt alle 74 Skript-Tests aus (11 liefen vorher nie). README und `docs/PIPELINE.md` neu geschrieben (keine Prüfung, kein Kostendialog, 512 MiB, aktuelle Befehle). Lokal rund 3,8 GB Arbeitsreste in den Papierkorb (alte Prüfbuilds, ComfyUI-Installationsarchiv, Sicherungen, Logs).
- Goethe-Prüfung komplett entfernt (Nutzerentscheidung): Eintrag im Lern-Reiter, Route `/exam`, Aufgabenmodule, Thai-Hilfen, Prüfungsspeicher, Inhaltsart `exam` in Katalog-Pipeline und Studio, 13 geplante deutsche Prüfungs-Hörclips (keiner war erzeugt) und die Prüfungstexte aller 20 Wörterbücher. Musterlösung im Rollenspiel und „Sag es“ bleiben, ihre Texte heißen jetzt `answer.modelTitle`/`answer.listenModel`. Gesicherte Lernstände sind nicht betroffen.
- Komplett-Durchlauf als Deutscher (Thai), Thailänder (Deutsch) und Spanier (Deutsch, Thai) mit frischen Testdaten: Lernpfad mit allen 7 Lektionsschritten, Heutige Runde, alle Übungsformen, Goethe, Gespräch, Fortschritt, Datensicherung. Behoben: Sprachzeilen der Übersicht überlappten auf 375 px („20 fällig“ unter „Lernen“); eine neue Thai-Oberfläche wählte Thai als Lernziel vor (jetzt die erste Fremdsprache); Grammatik-Beispiele ohne Thai-Umschrift; Prüfen ohne Eingabe in Rollenspiel („Andere Formulierung“) und „Sag es“ (keine Reaktion) jetzt gesperrt; „Gut"-Anführungszeichen in 8 Wörterbüchern; Übersetzungen „Die sind sehr süß!“ und „bahts“; Vertiefungs-Umschrift (rian statt riian, dtɔɔn, sà-nə̌ə). Web-Speicher fällt auf localStorage zurück, wenn IndexedDB nicht öffnet.
- Offen aus dem Durchlauf: Mikrofon/Aufnahme nur am Gerät prüfbar; Goethe-Hörtexte laufen über die Systemstimme; Goethe-Formular ist Ankreuzen statt Schreiben; Stammformen mit sein/haben (ist gestanden) gelten als falsch; Thai-Wortgrenzen in Lesetexten teils grob.
- „Ton herleiten“ zeigt in der Frage nur noch die Thai-Schrift; die Umschrift mit Tonzeichen verriet die Lösung und steht jetzt in der Auflösung. Thai-Oberfläche ohne Ziel „Thai (von Deutsch)“, auch im Gesprächs-Reiter: Die Bedeutung war dort identisch mit dem Thai-Text. Die App-Sprache ist damit überall kein Lernziel; ein gemerktes de_to_th fällt auf das erste Ziel zurück, Karten bleiben gespeichert. Baustein `goal.fromSource` aus allen 20 Wörterbüchern entfernt.

## 04.10.2026

- Inhalte korrigiert: Thai-Umschrift vereinheitlicht (Paiboon-Stil der Dialoge). 524 Vokabeln, 990 Beispielsätze und Dialogzeilen bereinigt: fehlende Behauchung (kǎo→khǎo, tîi→thîi), k/t/p für g/dt/bp, ae/ue/oe/aw-Schreibungen, falsche Tonzeichen und 23 falsch hinterlegte Töne (z. B. ต้อนรับ dtɔ̂ɔn, แตะ dtɛ̀, เผื่อ phʉ̀a, นี้ níi), Fremdzeichen (griech. ε, æ, Breve). Längen vereinheitlicht (ได้ dâai, น้ำ nám, เช้า cháo). Abgleich gegen die Thai-Schrift mit tltk, Tonfälle von Hand entschieden. Handdaten (Partikel-, Zählwort-, Vertiefungstexte) ebenso; Kommentar zu ค่ะ/คะ-Tönen korrigiert. Deutsche Pluralangaben einheitlich „die …“ bzw. „—“.
- Lautschrift-Anzeige: Deutsch und Englisch einheitlich /…/ (89 deutsche Einträge standen in [ ]). 497 deutsche Pseudo-Umschriften („Tas-se“, „dahs DOOSH-gehl“) und 26 spanische („pyel“, „PLAN“) werden nicht mehr gezeigt; echte IPA fehlt damit für 724 deutsche Wörter (offen, braucht einen Inhaltslauf — gruut war mit 66/150 Treffern ungeeignet). Ton-Gate für die 25 Clips der umgestellten Töne neu berechnet: 8 Prüfvermerke aktualisiert, der Clip คว้าน fiel mit dem korrekten Sollton (hoch) durch, weil coral fallend spricht. Nach der Satz-Umschrift-Korrektur alle 2.233 betroffenen Thai-Clips neu geprüft: 10 Statuswechsel, drei Satzclips (สวัสดีค่ะ, เหนื่อยมาก, คนเยอะมาก) sprechen das fallende ค่ะ/มาก nicht fallend. Diese vier Clips sind aus dem Katalog genommen; der nächste Audiolauf erzeugt sie neu. `check.cjs` erkennt jetzt den redaktionellen Bildvermerk (4 handgeprüfte Bilder meldeten „Prüfung fehlt“); solche Bilder ersetzt auch der neue Prompt-Austausch nicht. Zwei verwaiste, bereits ersetzte Fehlbilder mit prune-orphans entfernt.
- Mehrdeutige Vorderseiten (gehen = ir/caminar, ไม่ = nein/nicht): Karte zeigt „Mehrere Wörter passen – gesucht: pe… (3)“; die Schreibübung akzeptiert Synonyme aus dem ganzen Wortschatz statt nur aus dem Kapitelpool.
- Fehler: Artikelübung fragte bei 939 von 986 deutschen Nomen die Erklärung („___ Trinkgefäß mit Henkel“ statt „___ Tasse“), Stammformen ebenso („sich zu Fuß fortbewegen“ statt „gehen“). Doppelter Artikel bei Wörtern mit Artikel im Stichwort verhindert. „Systemsprache“-Zeile nur noch, wenn die App-Sprache ihr folgt. Aufnahmehinweis nicht mehr im reinen Hörverstehen. Gleichnamige Kapitel als Variante gekennzeichnet.
- Lernen und Gespräch: Stufenschalter Anfänger · Fortgeschritten · Profi (vorher „Erfahren“) mit Anzahl je Stufe, Kapitel je Stufe nummeriert, leere Stufen mit Hinweis; B1-Vertiefung unter „Fortgeschritten“. Studio-Gesprächslauf erzeugt alle Niveaus A1–C2 (Probelauf 24, voll 264 je Sprache); Lesetext-Schwellen für B/C ergänzt. Kein Lauf gestartet.

- Browser-Durchlauf (Thai/Englisch/Spanisch, Deutsch mit Thai-Oberfläche): Karteikarten zeigten unter dem neuen Bild noch das Bild der vorigen Karte (expo-image-Überblendung; sichtbar, solange das neue lädt). Bild jetzt an die Vokabel gebunden und je Karte neu aufgebaut. Deutsche und spanische Nomen stehen auf Karten jetzt mit Artikel und Plural („die Familie“, Plural „die Familien“); die Schreibübung verlangte den Artikel bereits, die Karte zeigte ihn nie. Metro-Start in `.claude/launch.json` mit 8 GB Heap (4 GB lief beim großen Katalog voll).

- Ursache der falschen Kartenbilder behoben: Alle 3.825 FLUX-Bilder entstanden aus dem Ersatz-Prompt „depiction of <deutsche Bedeutung> (<Zielwort>)“ (z. B. „Bett (เตียง)“ → Gesicht). KI-Vokabeln bekommen jetzt ein englisches Motiv je Wortart (Ding/Szene, Handlung mit Personen, Eigenschaft an einem Gegenstand), ohne Anführungszeichen, weil FLUX zitierte Wörter als Schrift malt. Der Rahmen verlangt nicht mehr „one single subject“. Bilder mit veraltetem Prompt oder gesperrtem Hash gelten im Bildlauf als fehlend und werden beim nächsten lokalen Lauf ersetzt (≈3 s/Bild, ganzer Bestand ≈3,5 h). Die 61 als ungeeignet befundenen Motive sind nach Dateihash gesperrt. Lokaler Probelauf mit 8 Fehlwörtern (nicht übernommen): Bett, Wörterbuch, Pinsel, umarmen, Stau jetzt passend; Rechnung, Ausgang, rau bleiben schwach. Kein Lauf gestartet.

- Erneute Karteikarten-Bildprüfung: 3.825 Zuordnungen technisch ohne Fehler, 80 Browserkarten mit 28 geladenen Bildern. In 256 Motivvorschauen 61 weitere ungeeignete und 50 unklare/unvollständige Motive dokumentiert; noch keine zusätzlichen Bildänderungen. Befunde: `docs/karteikarten-bildpruefung-2026-10-04.md`.

- Fehler aus dem Endnutzer-Durchlauf behoben: Web-Daten mit Sicherung von localStorage nach IndexedDB übernehmen, fehlgeschlagene Kartenbewertungen erneut ermöglichen, Kapitel-Plurale erkennen und konkrete Wörter vor der 20er-Grenze priorisieren. Apfel/manzana im Katalog ergänzt; falsche Thai-Geld-/Krugmotive durch geprüfte vorhandene Bilder ersetzt, neun weitere Fehlmotive nach Dateihash im Lernbereich ausgeblendet. Mehrdeutiges Sie/sie und nominales help im verbalen Kontext ohne irreführenden Wortlink; vollständige Satzübersetzungen bleiben erreichbar. B1 zeigt ohne geprüften Clip den Lesetext, bei fehlender Audioausgabe keine toten Hörbuttons. Keine neue KI-Erzeugung. Nachprüfung und Grenzen: `docs/endnutzer-audit-2026-10-04.md`.

- Studio übernimmt Bilder, Dialoge, Vokabeln und Audio einzeln automatisch nach den bestehenden Prüfungen. Die Übernahme kann mit der nächsten Generierung überlappen; Medien und Live-Katalog werden sofort verfügbar. Build-Dateien werden erst am Laufende aktualisiert. Dauerhafte Sicherung und automatische Wiederherstellung bei Browser-Abbruch/Helper-Neustart; keine erneute Prüfung des gesamten Altbestands. Neue Studio-Medien umgehen die Browser-Speicherquote, Anbieter bleiben unverändert.

- Bilder können gezielt über `imageIds` in den Katalog übernommen werden; andere Stage-Entwürfe bleiben erhalten. `learningStage` ist auch im Exportvertrag für Vokabeln zugelassen.

- Lokale Textmodelle und drei Lernstufen nach beendetem Bildlauf aktiviert; Qwen/Gemma mit echten Vokabel- und Dialogproben geprüft. Windows-PowerShell-Preset ohne UTF-8-BOM korrigiert. Audio sowie vorhandene Bildentwürfe unverändert; Testinhalte nicht veröffentlicht.

Alle nennenswerten Änderungen an ThaiSpeaker (Lernbegleiter). Neueste oben.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).
Die ausführliche Entwicklungsgeschichte bis zum 25.09.2026 steht in
[`docs/arbeitsverlauf-bis-2026-09-25.md`](docs/arbeitsverlauf-bis-2026-09-25.md).

## [Unveröffentlicht] – 03.10.2026

### Lokale Textanbieter und verständliche Lernstufen — separat vorbereitet

- Qwen3.5-9B Q5_K_M und Gemma 4 12B IT Q4_K_M als zusätzliche lokale Anbieter für Wortschatz, Prüfung und Gespräche. Loopback-Helper, begrenzte JSON-Ausgaben und Fehler bei falschem Modell/abgeschnittener Antwort; keine Cloud-Ausweichlogik. Setup mit geprüften Modelldateien und Start mit höchstens einem geladenen Textmodell. Audio unverändert.
- Anfänger, Erfahren und Profi in allen 20 App-Sprachen, mit interner A/B/C-Zuordnung. Vokabeln tragen die neue Gruppe; Ziele zählen gruppenweise. Gesprächspläne und Prompts passen zur Gruppe. Kapitel, Dialoge, Lesetexte und Vertiefung zeigen verständliche Namen. Alte Inhalte/IDs bleiben kompatibel; offizielle Goethe-Namen unverändert, B2 weiter zuletzt.
- Während des aktiven Bildlaufs ausschließlich im separaten Worktree vorbereitet. Aktivierung und echte Modellproben erst nach dem Bildlauf; keine Änderung am laufenden App-/Helper-Prozess.

### Endnutzerkorrekturen und lokale Bilder

- Lokale Bildgenerierung beschleunigt: ComfyUI verwaltet den Bild-Prompt-Encoder auf GPU mit Speicher-Auslagerung; 768×768 statt 1024×1024 vor der unveränderten 512-WebP-Ausgabe. Nur lokal entfällt die 800-ms-Pause; fertige Aufträge werden alle 250 ms abgeholt. Gemessene Motivproben etwa 3 s statt 14 s; Text- und Audiogenerierung unverändert.
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
