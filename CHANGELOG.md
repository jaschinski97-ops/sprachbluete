# Changelog

## 24.10.2026

- Neue Übung „Wortliste“ unter Lernen → Wortschatz (Nutzerwunsch): 20 Wörter links, Bedeutungen rechts. „Start“ verdeckt eine Seite, man trägt alles ein, „Alle prüfen“ wertet aus, dann kommen die nächsten 20. Zwei Richtungen: „Bedeutung eintragen“ (Vorgabe) und „Wort eintragen“ (gleiche Prüfung wie die Schreibübung, mit Zeichenpalette für Thai, Deutsch, Spanisch).
  - Auswahl: erst wacklige Wörter (fällig oder zuletzt falsch), dann neue in Häufigkeitsreihenfolge, zuletzt sichere zum Auffüllen. Keine Neu-Grenze, die Liste ist zum Lernen neuer Wörter da.
  - Jede Antwort schreibt dieselbe Karte fort wie Karteikarte und Schreibübung und zählt als Wiederholung; dazu das Übungsgedächtnis, damit Falsches in der nächsten Liste vorn steht. „Wort eintragen“ bewertet wie die Schreibübung (Gut/Schwer/Nochmal). „Bedeutung eintragen“ gibt höchstens „Schwer“, weil die Karte das Bilden des Worts abfragt und Wiedererkennen deren Abstand sonst zu weit streckt.
  - Bedeutungen werden großzügig geprüft (Groß/klein, Artikel, Klammern, fehlende Akzente, kleiner Vertipper bei längeren Wörtern). Für Synonyme, die der Katalog nicht kennt, gibt es „Zählt doch“ (zählt als „Schwer“). Gespeichert wird beim Weitergehen oder Verlassen.
  - Logik in `src/lib/word-list.ts` (mit Tests), Oberfläche `src/components/word-list-runner.tsx`.
- Einführung beim ersten Start (Nutzerwunsch): vier kurze Seiten zu Lernsprache, Kapitelweg, kurzer Runde und den fünf Bereichen. Danach jederzeit unter Einstellungen → „Einführung“ (`src/lib/intro.ts`, `src/components/intro-guide.tsx`, Merker `meta/intro-seen`).
- Texte in allen 20 App-Sprachen; die Bereichsbeschreibung „Wortschatz“ nennt jetzt Karteikarten und Wortliste.
- Telugu: Der Reiter „Lernen“ hieß „కలవరం“ (Unruhe), jetzt „నేర్చుకోండి“.

## 23.10.2026

- Neue Optik „Kirschblüte“ (Nutzerwahl aus zwei Entwürfen), ersetzt „Nachtflug“. Tag und Nacht folgen der Systemeinstellung: tagsüber Frühlingshimmel mit Sonne, nachts Anime-Nachthimmel mit Mondschein. Karten als Glas, Hauptknöpfe in Jade (翡翠) statt Pink, Sprach-Abzeichen als rosa Mon, Pinselstrich unter den Seitentiteln. Alle Kontrasttests gelten weiter.
  - Jeder Reiter hat sein eigenes, bewegtes Motiv (`src/components/sakura-scenes.tsx`): Übersicht Blütenzweige, die sich im Wind wiegen; Lernen Trauerkirsche mit wehenden Blütenvorhängen; Gespräch schwingende Papierlaternen; Fortschritt Fluss mit Holzbrücke zwischen Kirschbäumen (nah am Vorbild des Nutzers), Glitzern und treibenden Blättern auf dem Wasser; Einstellungen Fuji am See mit ziehendem Dunst. Überall fallen Blütenblätter mit 3D-Taumeln. Unsichtbare Reiter und „Bewegung reduzieren“ halten alles an.
  - Fluss und Fuji sind gemalte Hintergründe, lokal mit FLUX.2 klein über ComfyUI erzeugt (Tag und Nacht, zusammen 620 KB WebP unter `assets/images/szenen/`), mit langsamem Zoom.
- Hell/Dunkel im laufenden Betrieb umschalten mischte die Farben: Ein verdeckter Reiter verpasste den Wechsel und blieb im alten Modus (helle Fläche, helle Schrift). Der Web-Hook `useColorScheme` liest den Modus jetzt bei jedem Rendern (`useSyncExternalStore`) statt ihn je Komponente zu speichern; das Wurzel-Layout nutzt denselben Hook.
- Einstellungen → „Tag & Nacht“ (Nutzerwunsch): „Wie das Gerät“ (Vorgabe), „Tag“ oder „Nacht“. Die Wahl gilt sofort in allen Reitern, auch für die gemalten Hintergründe, und bleibt nach Neustart erhalten (Sammlung `meta`, Schlüssel `appearance`, `src/lib/appearance.ts`). Nativ zieht `Appearance.setColorScheme` Statusleiste, Tastatur und Systemdialoge mit; im Web folgt die Seitenfläche über `data-erscheinung` in `global.css`. Texte in allen 20 App-Sprachen.
- Leuchten um Schrift fehlte im Web ganz (Seitentitel, Untertitel, Thai-Gruß): Farbe und Radius standen in zwei Stilobjekten, react-native-web baut den Schatten aber je Objekt. Neuer Baustein `textGlow()` in `fx.tsx` hält beides zusammen. Die Abschnittsnamen der Einstellungen („Allgemein“, „Entwicklung“) leuchten jetzt ebenso und sind nachts über dem Fuji-Bild lesbar.
- Studio „Turbo“ (Nutzerwunsch: sehr viel frisch erzeugen). Vorher lief jede Erzeugung streng nacheinander mit festen Pausen (Gemini-Audio 6,5 s je Clip, Dialoge 0,4 s, Bilder 0,8 s), der Wortschatz eine Sprache und ein Prüfpaket nach dem anderen.
  - Parallele Aufrufe über eine Drossel (`src/lib/generation/drossel.ts`): Jeder Generator hat unter „Erweitert“ das Feld „Gleichzeitige Anfragen“ (Werkswerte DeepSeek 8, Gemini/OpenAI 4, OpenAI-Bilder 2, Helper 3, ComfyUI und lokale Texte 1). Meldet der Anbieter 429 oder Überlastung (503), halbiert die Drossel die Zahl, hält alle Aufrufe an, bis die genannte Wartezeit (Retry-After, Geminis `retryDelay`, sonst 2–60 s) um ist, und wiederholt denselben Aufruf; nach Erfolgen in Folge darf wieder einer mehr laufen. Ein aufgebrauchtes Tageskontingent wird sofort gemeldet statt wiederholt. HTTP-Fehler tragen dafür Status und Wartezeit (`HttpStatusError`).
  - Wortschatz: alle Sprachen gleichzeitig (jede arbeitet ihre Pakete weiter nacheinander ab), die Prüfpakete eines Wortpakets ebenfalls; Erzeuger und Prüfer desselben Anbieters teilen sich eine Drossel. Eigenes Feld „Gleichzeitige Anfragen (Erzeuger)“.
  - Helper: Die automatische Übernahme liest je Eintrag nicht mehr Katalog und Stage von der Platte (zusammen rund 85 MB), leitet keinen Prüfbericht mehr ab und schreibt die 42-MB-Stage nicht neu. Die Sicherung ist ein Journal `.content-studio/automatic-delivery.ndjson` (eine Zeile je Eintrag) statt einer bei jedem Eintrag komplett neu geschriebenen Datei; eine alte `automatic-delivery.json` wird beim Start weiter übernommen.
  - Die Wortschatz-Karte holt je Paket nur noch `GET /vocabulary` (Sprache, Wort, Stufe; 0,45 MB) statt zweimal `/state` (73 MB samt Prüfbericht).
  - Nicht gegen echte Anbieter gemessen (kein bezahlter Lauf); wie weit die Gleichzeitigkeit trägt, hängt am Ratenlimit des eigenen Kontos.
- Studio: DeepSeek als Textanbieter für Wortschatz (Erzeuger und Prüfer) und Dialoge, mit eigenem Schlüssel unter „Anbieter & Schlüssel“ (Nutzerwunsch). OpenAI-Format an `api.deepseek.com/chat/completions`, direkt aus dem Browser (CORS-Preflight von localhost:8081 am 23.10.2026 gemessen). `deepseek-flash` läuft ohne Denken (schnell, für die Erzeugung), jedes andere Modell wie `deepseek-v4-pro` mit Denken (gründlich, als Prüfer, mindestens 32.768 Ausgabe-Tokens). Zeitlimit 20 Minuten. Das Wortschatz-Budget rechnet mit dem oberen Ende der gemeldeten Preise. Nicht gegen die echte API geprüft (kein bezahlter Lauf).
- Studio, Hörclips: Der Anbieter sprang beim Öffnen still auf „ChatGPT (Helper)“, sobald der Helper antwortete und Audio auf Gemini stand — auch wenn Gemini bewusst gewählt war, und die Umstellung wurde gespeichert. Bisher fiel das nur nicht auf, weil `/state` beim großen Katalog (73 MB) länger als das 1,5-s-Zeitlimit brauchte; nach dem Löschen für den frischen Lauf hätte es gegriffen. Die gespeicherte Wahl gilt jetzt unverändert (`helperAudioAvailable` und `HELPER_AUDIO_PROVIDER` entfernt).
- Studio, Hörclips: Ein Lauf spricht mit genau einer Stimme, der eingetragenen oder dem Vorschlag des Anbieters (Gemini: Kore). Die Karte versprach „Stimmen wechseln im Lauf abwechselnd durch“; die Rotation griff aber nie, weil ein leeres Feld immer mit dem Vorschlag gefüllt wird. Toter Rotationscode entfernt, Text korrigiert. Beim Helper stand „Pause je Aufruf: 2,2 Sekunden“, tatsächlich fragt der Lauf alle 0,5 s und der Helper hält selbst 30 Aufrufe pro Minute ein; so steht es jetzt da.
- ComfyUI unter Linux: `scripts/content/setup-local-images.sh` richtet ComfyUI, PyTorch mit CUDA und die drei FLUX-Dateien unter `_Local/comfy/` ein (Prüfsumme des Bildmodells wird geprüft), `start-local-images.sh` startet es auf 127.0.0.1:8188.

## 22.10.2026

- Neue Optik „Nachtflug“ (Nutzerwunsch: letzte Politur vor der Veröffentlichung):
  - Palette: Nachtblau-Violett statt Schwarz (hell: kühles Weiß mit violettem Stich), Karten als Glas mit feiner Kante über einer langsam wandernden Aurora (drei Farbschleier, 22 s je Schleife; pausiert auf unsichtbaren Reitern und bei „Bewegung reduzieren“). Alle Kontrasttests gelten weiter; neu geprüft wird die Schrift an beiden Enden des Knopf-Verlaufs.
  - Effekt-Bausteine in einer Datei `src/components/fx.tsx`: Aurora, Verlaufsfläche, Glanzlicht, federnder Druck, gestaffeltes Einblenden, Karteikarten-Übergang (neue Karte gleitet herein, Aufdecken dreht sie um), Fortschrittsbalken mit Verlauf, hochzählende Kennzahlen.
  - Hauptknöpfe mit Verlauf Violett → Türkis und Leuchten; „Weiter lernen“ zusätzlich mit wanderndem Glanzlicht. Sprachen als Glas-Karten mit Sprach-Abzeichen, Lernbereiche und Gesprächsthemen mit Symbolen, Seitentitel mit Leuchtstrich, Thai-Gruß federt Silbe für Silbe herein und leuchtet in der Tonfarbe. Web-Leiste unten schwebend als Glas mit Verlaufspille; native Reiterleiste in den neuen Farben.
  - „100 %“ brach in der Fortschritts-Kachel um (geschütztes Leerzeichen).
- Eigenes App-Icon statt Expo-Vorlage: glänzende 3D-Sprechblase (Violett → Türkis, drei Punkte) auf nachtblauem Grund, in Blender gerendert. Dazu Android-Ebenen (Vordergrund im sicheren Bereich, Hintergrund, einfarbig), Splash und Favicon; nativer Splash und Startüberblendung in Nachtblau mit der Sprechblase. Vorlagenreste `assets/expo.icon` und `expo-logo.png` entfernt.
- Aufgeräumt: Zwei Datendateien (`german-verb-forms.json`, `english-grapheme-groups.json`), die nur ein eigener Test las, entfernt. Zwei alte Typfehler in `i18n/index.test.ts` behoben (tsc jetzt fehlerfrei). Jest kennt Reanimated/Worklets über deren Attrappen.

- Übersicht: Im Sprachpaket-Build (App für Handy) steht neben „Lernen“ jetzt ein eigener „Download · Größe“-Knopf je Sprache (Nutzerwunsch); vorher ersetzte „Laden“ den Lernen-Knopf, bis das Paket da war. Lernen geht auch ohne Paket (Texte liegen in der App, nur Ton und Bilder fehlen). Während des Ladens zeigt der Knopf den Fortschritt, bei neuer Version „Aktualisieren · Größe“; ist das Paket aktuell oder noch keins veröffentlicht, verschwindet er. Deutsche Beschriftung „Download“ statt „Laden“. Im Web gibt es keinen Knopf, dort kommen die Medien vom Server.
- Paket-Repo in `app.json` eingetragen: `jaschinski97-ops/nico_sprachApp_Linguistik` (öffentlich). Noch keine Pakete veröffentlicht.
- Studio, Anbieter Gemini: Vorgabemodelle laut Google-Doku jetzt `gemini-4-argon` (Texte), `gemini-3.8-flash-tts` (Hörclips), `gemini-nano-banana-2.1` (Bilder); die 2.5-Modelle gibt Google seit 18.09.2026 nur noch bisherigen Nutzern frei. Für Gemini 4 Zeitlimit 20 statt 5 Minuten und mindestens 32.768 Ausgabe-Tokens, weil die Denk-Tokens in die Grenze zählen (die Kreuzprüfung mit 4.000 wäre sonst leer geblieben). Gedanken-Teile einer Antwort werden nicht als Text übernommen. Nicht gegen die echte API geprüft (kein bezahlter Lauf).

- Freie Übungen wählen nach dem Lernstand (Nutzerentscheidung): gelernte, wacklige Wörter zuerst, je Runde nur wenige neue (20 %, mindestens eins), danach gut Sitzendes, erst dann weitere neue. Vorher zählte ein nie gelerntes Wort als „am wackligsten“; bei 2.000 Wörtern kamen in Hören, Schreiben, Sprechen, Artikel, Tönen und „Sag es“ fast nur nie gelernte Wörter dran, gelernte wacklige praktisch nie (Probe: 0 von 40 Aufgaben). Wer noch nichts gelernt hat, bekommt eine Runde aus den häufigsten neuen Wörtern. Kapitel und Heutige Runde (feste Wortlisten) behalten ihre Auswahl ohne Neu-Grenze. Gemeinsamer Baustein `src/lib/practice-selection.ts`.
  - Übungsgedächtnis je Wort (`src/lib/word-practice.ts`, neue Sammlung `practice`): Auswahlübungen, Heutige Runde und Diktat speichern jede Antwort je Wort. Was in den letzten 12 Stunden richtig war, pausiert; mehrmals richtig in Folge macht ein Wort einige Tage weniger dringlich, eine falsche Antwort holt es nach vorn (Halbwertszeit 3 Tage). Die Abstände der Karteikarten bleiben unberührt (AE-16). Vorher zogen Auswahlübungen ohne Kartenfortschritt Runde für Runde dieselben rund 30 Wörter.
  - Das Diktat wählt jetzt ebenso statt rein zufällig; ein nicht bestandenes Diktat holt den Satz bald zurück, ohne die Karte zu bewegen.
  - Die Thai-Sprechübung gewichtet nach der Lernrichtung der Oberfläche statt immer nach `de_to_th`.
  - Die Sicherung enthält das Übungsgedächtnis (optional, gleiche Formatversion); ältere Sicherungen setzen es beim Einspielen zurück, kaputte Einzeleinträge werden übergangen.
  - Grammatik-Kleinstübungen, Lesetexte und Satzübungen wählen weiter zufällig.

## 18.10.2026

- Übersetzungen je App-Sprache (Schritt 1b aus `docs/katalog-je-lernsprache-konzept.md`): Jede Lernsprache hat eine Basisdatei ohne die Übersetzungen der 20 App-Sprachen und je App-Sprache einen eigenen Teil (`<lang>-<ui>.catalog`). Geladen werden nur App-Sprache und Englisch, auf das die Bedeutungen ohnehin zurückfallen. Hörclips stehen in der Basis als kompakte Tabelle.
  - Wechselt die App-Sprache, lädt die App zuerst die passenden Teile der geladenen Lernsprachen und schaltet dann um; ein Fehler hält die Umstellung nicht auf.
  - Gemessen auf dem Android-Emulator (API 36, Release-APK mit Sprachpaket-Medien, Thai-Profil, Median aus 12 Kaltstarts, alle Stände im selben Emulator-Start) und im Web (frischer Tab, je eine Messung). „Zukunft“ ist ein synthetischer Katalog mit je Lernsprache 250 weiteren Dialogen, 2.000 Wörtern Fortgeschritten/Profi und 7.000 Clip-Einträgen (schlank 65 statt 14 MB):

    | | Start | Speicher (PSS) | JS-Heap | Bytecode | Web-Heap | Web bis DOMContentLoaded |
    |---|---|---|---|---|---|---|
    | vorher | 1.741 ms | 268 MB | 43,9 MB | 83,2 MB | 59,5 MB | 303 ms |
    | Schritt 1 | 1.109 ms | 219 MB | 38,8 MB | 75,6 MB | | |
    | Schritt 1 + 1b | 1.074 ms | 218 MB | 37,2 MB | 75,3 MB | 27,4 MB | 124 ms |
    | Zukunft, vorher | 2.732 ms | 404 MB | 121,1 MB | 129,7 MB | 204,6 MB | 895 ms |
    | Zukunft, Schritt 1 | 1.505 ms | 275 MB | 54,6 MB | 75,4 MB | | |
    | Zukunft, 1 + 1b | 1.298 ms | 259 MB | 45,2 MB | 75,5 MB | 31,3 MB | 129 ms |

  - Die absoluten Startzeiten schwanken stark zwischen Emulator-Starts (in einem anderen Start lag Schritt 1 bei ~620 ms); verglichen wird nur innerhalb eines Starts. Thai lädt beim Start 2,2 statt 3,4 Mio. Zeichen (Ladetor nach 50 ms, Parsen 11 ms), mit dem Zukunftskatalog 5,5 statt 12,6 Mio. (Ladetor 119 statt 271 ms). Sprachwechsel Thai → Spanisch in der Übersicht: 66 ms.
  - JS-Bundle Android (Sprachpaket-Build) 13,3 → 5,3 MB, Web-JS 19,8 → 4,1 MB (Zukunft: 60,9 bzw. 91,3 MB auf heutigem Weg, 5,4 bzw. 4,2 MB jetzt). `expo export` für alle drei Plattformen (eingebettete Medien): Bytecode Android 18,2 → 11,4 MB, iOS 18,0 → 11,2 MB, Dauer 8:28 → 8:18. Geprüft im Web-Export: Thai ↔ Spanisch, Karteikarten, Thai-Clip, Gesprächs-Reiter mit eigener Sprache, App-Sprache Japanisch (Teile in 17 ms nachgeladen).
  - Übersicht und Gesprächs-Reiter laden ihre Sprache erst mit gelesenem Profil; vorher lud ein Spanisch-Profil beim Start Thai mit.
  - `npm run verify:production` prüft, dass alle Sprachdateien eines Exports aus einem Katalogstand stammen und zu `catalog.json` passen.
  - Ein Ladetest brauchte 3,3 GB je Jest-Worker, weil jeder Modulsatz die 19.000 Asset-Einträge neu lud; jetzt 0,4 GB. Die volle Suite mit vielen Workern neben Emulator und Gradle hatte den Rechner zweimal in den Speicherüberlauf getrieben.

- Inhaltskatalog je Lernsprache (Schritt 1 aus `docs/katalog-je-lernsprache-konzept.md`): App-Builds tragen den Inhalt nicht mehr als JS-Modul, sondern je Lernsprache als eingebettete Datei (`assets/catalog/<lang>.catalog`, beim Metro-Start von `scripts/app-catalog-files.cjs` erzeugt, gitignored). Im Bundle bleibt ein kleiner Index (Wort-IDs je Sprache, gelöschte Entwürfe). Beim Start lädt ein Ladetor hinter dem Splash nur die Lernsprache des vorgewählten Ziels; scheitert das (Datei fehlt, kaputt, länger als 10 s), erscheint ein Fehler mit „Erneut versuchen“ statt eines ewigen Splashs.
  - Übersicht, Lern-, Gesprächs- und Fortschritts-Reiter laden ihre Sprache selbst nach; höchstens zwei Lernsprachen bleiben geladen, was ein offener Bildschirm braucht, wird nie entladen. Der Gesprächs-Reiter behält seine eigene Sprachwahl. Die deutschen Bedeutungs-Clips der Karteikarten liegen in jeder Sprachdatei, die sie braucht.
  - Wortzahlen und Fällig-Zahlen ungeladener Sprachen kommen aus dem Index und den gespeicherten Karten, ohne Karten anzulegen. Die Datenpflege im Vokabelspeicher löscht keine Wörter ungeladener Sprachen mehr. Kartenstände bleiben unberührt.
  - Ein Stempel bindet Sprachdateien und Index an genau diese `catalog.json`; passt er nicht, bricht der App-Build ab. `catalog.json`, Studio und Entwicklungsbau (8081) behalten den vollen Katalog.
  - Messwerte stehen beim Eintrag zu Schritt 1b (beide Schritte im selben Emulator-Start gemessen). Messskript `scripts/measure-android-start.sh`.

- Schlanker Inhaltskatalog im App-Build: Jeder Nicht-Entwicklungsbau (`expo export`, EAS-Builds inklusive `testflight` und `production`, Gradle-Release) bekommt `catalog.json` ohne die Daten, die nur Studio, Pipeline und `content:integrity` brauchen (Tonmessung, Digests, Bytezahlen, Prüfzeit und -grund, Anbieter, Modell, Stimme, Bild-Prompts, Clip-Texte). Erhalten bleiben alle Wörter und Dialoge vollständig, Dateinamen, Prüfstatus und Ton-Gate-Status; Auslieferungsregel und Thai-Wiedergabe-Gate arbeiten unverändert. Ein Test vergleicht die App-Sicht von vollem und schlankem echtem Katalog. `catalog.json` selbst und der Entwicklungsbau mit Studio (8081) bleiben vollständig. Umgesetzt im Metro-Worker (`scripts/metro-app-catalog.cjs`), unabhängig von `THAISPEAKER_MEDIA`.
  - Katalog 28,0 → 12,5 Mio. Zeichen. `expo export`: Bytecode Android 24,7 → 18,2 MB, iOS 24,5 → 18,0 MB, Web-JS 34,8 → 19,7 MB.
  - Android-Emulator (API 36, 2 GB RAM, Release-APK mit Sprachpaket-Medien, Median aus 12 Kaltstarts): Start bis erstes Bild 843 → 798 ms, Speicher 275 → 254 MB (PSS), davon JS-Heap 53 → 43 MB. Web: JS-Heap 89 → 68 MB.
  - Die Suche nach Hörclips, Bildern und Dokumenten läuft über einen Index nach Art und ID, der je Katalogstand einmal entsteht (auch nach Studio-Änderungen). Vorher ging jeder Tipp auf „Anhören“ viermal durch alle 26.469 Einträge.

- Lern-Reiter: Die Stufe eines Wortes (Anfänger, Fortgeschritten, Profi) wirkt jetzt im ganzen Lern-Reiter, nicht nur bei den Kapiteln (Nutzerentscheidung). Vorher wären Profi-Wörter aus einem Studio-Lauf Anfängern als neue Karteikarten vorgelegt worden.
  - Neue Karteikarten und alle freien Übungen (Auswahlübungen, Schreiben, Sprechen, „Sag es“, Satz verstehen, Satz wiederholen, Shadowing, Diktat) nehmen nur Wörter der gewählten Stufe. Fällige Wiederholungen schon gelernter Karten bleiben unabhängig von der Stufe fällig; Gelerntes verschwindet nicht. Kapitelübungen üben weiter genau ihre Dialogwörter.
  - Die Heutige Runde nimmt neue Karten nur aus der Stufe. Ihre Mischbereiche üben die Wörter der Kartenrunde, ohne Karten den Stoff der Stufe.
  - Der Stufenschalter gilt jetzt für alle Übungen und bleibt je Lernsprache gespeichert, auch nach einem Neustart (Nutzerentscheidung). Ohne eigene Wahl gilt weiter die Stufe des nächsten offenen Kapitels, auch wenn eine Übung über eine Adresse startet. Unter dem Schalter steht die Wortzahl der Stufe bzw. ein Hinweis, wenn es noch keine Wörter gibt (2 neue Texte in allen 20 Wörterbüchern).
  - Studio: Das Wortschatz-Ziel gilt je Sprache und Stufe (`vocabZiel-<sprache>-<stufe>`). Gezählt wurde schon je Stufe; 2.000 Anfänger-Wörter hätten das Profi-Ziel sonst als erreicht gemeldet. Anfänger behält den alten Schlüssel `vocabZiel-<sprache>`, gesetzte Ziele gelten weiter.
  - Heute sind alle Katalogwörter Anfänger; für sie ändert sich nichts.
- Keine GER-Kürzel mehr sichtbar (Nutzerentscheidung): Sichtbar sind nur noch Anfänger, Fortgeschritten und Profi (mit Einstieg/Aufbau). Der Vertiefungs-Hinweis nennt keine GER-/CEFR-Stufe mehr (20 Sprachen), die Studio-Hinweise zum Dialoglauf sprechen von Stufe und Teil, und die Studio-Fortschrittsanzeige und Fehlerliste zeigen Situationen als „Markt & Einkaufen · Fortgeschritten Einstieg · de_to_th · Variante 3“ statt der internen ID. Intern bleiben A1–C2 als Kennung und als Schwierigkeitsangabe im KI-Auftrag; vorhandene IDs ändern sich nicht.
- Gesprächsthemen für alle Stufen (Nutzerentscheidung): 12 statt 4 Themen, damit Fortgeschritten und Profi nicht nur Markt-, Restaurant-, Weg- und Kennenlern-Szenen bekommen. Neu: Uhrzeit & Termine (A1–B2), Familie & Wohnen (A1–C2), Freizeit & Wetter (A1–B2), Gesundheit & Arzt (A2–C2), Arbeit & Beruf (A2–C2), Behörden & Bank (B1–C2), Meinung & Diskussion (B1–C2), Nachrichten & Gesellschaft (B2–C2).
  - Der Planer plant jedes Thema nur auf seinen Stufen (`TOPICS[].levels`). Der Prompt nennt zu jedem Thema typische Szenen.
  - Studio-Gesprächslauf: Probelauf 59 Situationen je Sprache (Anfänger 16, Fortgeschritten 23, Profi 20) statt 24; der volle Lauf hat 4 Varianten statt 11, also 236 statt 264 je Sprache. Die Hinweistexte rechnen die Zahlen aus dem Plan.
  - Die vorhandenen 28 Dialoge und ihre IDs bleiben gültig; ein Lauf überspringt sie. `content:integrity` zählt fehlende Situationen jetzt gegen den Studio-Plan (alle Stufen, 4 Varianten): 916 statt 996 gegen den alten A1/A2-Plan mit 32 Varianten.
  - Die Pipeline nimmt die Themen aus `TOPICS`. Vorher waren die vier alten Themen fest eingetragen, neue Dialoge wären bei der Übernahme abgelehnt worden. Studio-Helper nach dem Update neu starten.
  - Kapitel sortieren je Niveau nach der neuen Themenreihenfolge; die Themen-Labels stehen in allen 20 Wörterbüchern.

- Lern-Reiter: neues Kapitel 0 „Grundlagen“ vor Kapitel 1, für alle vier Lernsprachen (Anfänger-Stufe, eigene Häkchen und eigener Abschluss).
  - Zahlen 0–20, Zehner, 100, 1000 und zusammengesetzte Beispiele (21 = 20 + 1 …), antippbar zum Anhören, danach eine Runde aus Hör- und Lesefragen. Preise in der Währung des Marktdialogs (Baht, Pfund, Euro). Die Grundwörter stehen als geprüfte Daten in `src/data/numbers.ts` (Wikipedia-Rohtext, abgerufen 18.10.2026); alles darüber wird nach den Regeln der Quelle zusammengesetzt (Thai: เอ็ด für die Eins, ยี่ für die Zwanzig; Spanisch gegen die Quellliste 10–99 abgeglichen). Thai-Umschrift im Paiboon-Stil, durch den Umschrift-Wächter geprüft; die Regeln des Wächters liegen jetzt in `src/lib/content/thai-romanization.ts`.
  - Thai-Schrift: alle 44 Konsonanten nach Klasse mit hergeleitetem Namen (ก gɔɔ gài), danach die vorhandene Klassenübung; Vokalzeichen als Paare kurz/lang mit Beispielwörtern aus dem Katalog (über die Silbenanalyse gefunden); die fünf Töne mit Tonlegende und je einem Beispielwort, das nur mit tongeprüftem Clip abspielt; danach „Töne hören“.
  - Englisch, Spanisch, Deutsch: das ABC mit Buchstabennamen und Lautschrift (`src/data/latin-alphabet.ts`: OED-Namen, ASALE-Namen, deutsche IPA mit Jot/Ypsilon/Zett/Eszett) und eine Buchstabier-Runde mit kurzen Wörtern aus dem Wortschatz — besonders für Thai-Oberflächen.
  - Ohne Clip spricht die Systemstimme mit Quellen-Zeile; ohne Stimme werden Hörfragen zu Lesefragen. 33 neue Texte in allen 20 Wörterbüchern.
  - Fehlende Hörclips (Nutzer, Studio): Thai 42 Zahl-/Preistexte (nur ศูนย์ und ยี่สิบ haben einen Clip) und die 44 Konsonantennamen; Englisch 33, Spanisch 29, Deutsch 29. Zahlwörter bekommen Clips, sobald sie als Wortschatz im Katalog stehen (Thai: „Dialogwörter ohne Eintrag übernehmen“); die Wiedergabe sucht nach Text und findet sie dann von selbst.
- Übung „Konsonantenklassen“ (Thai, auch Schritt 4 von Kapitel 0): Umschrift jetzt im Paiboon-Stil wie in Kapitel 0 (ถ ถุง thɔ̌ɔ thǔng statt RTGS „tho thung“). Die Konsonantensilbe ist hergeleitet, das Merkwort kommt aus dem Katalog-Wortschatz; fehlt es dort (21 von 44, z. B. งู, ช้าง, ธง), steht nur die Silbe.
- Kapitelschritte in neuer Reihenfolge (Nutzerentscheidung): Satz verstehen → Lesetexte → Karteikarten → Grammatik → Schreiben → Satz wiederholen → Rollenspiel. Vorher war die Regel Schritt 1, und Anfänger lasen „fallender Ton“, bevor sie den Dialog kannten. Die Kurzbeschreibung lautet jetzt „Dialog hören → Wörter → Regel → selbst anwenden“ (20 Sprachen).
- TestFlight-Vorbereitung (iPhone ohne Mac, Builds über EAS): Neue Anleitung `docs/testflight.md` für Apple Developer Program, Expo-Konto, `eas build`/`eas submit`, App-Store-Connect-Eintrag, interne und externe Tester, Gerätetest-Checkliste und Android-Tester (APK über `preview`, Google Play intern).
  - Neues EAS-Profil `testflight`: Store-Verteilung mit eingebetteten Medien (≈ 411 MiB), damit die erste TestFlight-Runde ohne veröffentlichte Sprachpakete Ton und Bilder hat. `production` lädt die Medien weiter als Sprachpaket; dafür fehlen noch Paket-Repo in `app.json` und die ersten Releases. Passendes Submit-Profil `testflight`.
  - `app.json`: `ITSAppUsesNonExemptEncryption: false` (nur System-HTTPS), damit App Store Connect nicht bei jedem Build nach der Exportangabe fragt.
  - Mikrofon-Hinweis ohne den Namen „Thai Lernbegleiter“ und nicht mehr nur Deutsch: Grundtext Englisch, übersetzt für Deutsch, Spanisch und Thai (`locales`, `CFBundleAllowMixedLocalizations`). Andere App-Sprachen zeigen den englischen Text. Per Prebuild geprüft: vier `InfoPlist.strings`.
  - Offen (Nutzer): Weg wählen (eingebettet oder Sprachpakete), Apple Developer Program, `eas login`/`eas init`, Apple-Anmeldung beim ersten Build, App-Name.

## 17.10.2026

- Thai-Tonhöhe, Messung und Erzeugung:
  - Messkern: Die Grundfrequenz folgt jetzt einem stetigen Kandidatenpfad (Viterbi wie Praat) statt dem globalen Maximum der Autokorrelation. Vorher sprang die Kurve in 65 % der Clips für einige Fenster auf die halbe Frequenz (มา: 211 → 107 → 216 Hz) und täuschte Täler und „Anstiege“ von bis zu 12 Halbtönen vor; jetzt in 4 %. Die Oktavkorrektur greift nur noch bei echtem Sprung zum Nachbarfenster — vorher klappte sie das tiefe Ende großer Fälle nach oben (กลั้น 242 → 121 Hz). Gilt auch für die Sprechübung.
  - Ton-Gate `f0-syllables-5`: Verschmolzene und sehr kurze Züge gelten als geratene Silbengrenze, ein Fall im Nachlauf der Silbe zählt mit, lange Sätze mit geratener Grenze verwerfen erst ab drei Widersprüchen. Neu gerechnet über alle 3.970 Thai-Clips: 101 jetzt geprüft, 42 nicht mehr prüfbar; geprüft 1.976 → 2.034, ungeprüft ausgeliefert 1.994 → 1.933. Drei Clips sind nach Rückfrage entfernt und werden beim nächsten Audiolauf neu erzeugt: ค้อน und ซ้อม (hoch, gesprochen fallend) und ดอกไม้สวย (ไม้ deutlich unter ดอก).
  - Befund zur Stimme (coral, ohne Anweisung): Einsilbige mittlere Wörter fallen im Median um 5,7 Halbtöne (Microsoft-Referenz 2,6/4,2), mittel und tief enden fast gleich hoch. Deshalb besteht kein mittlerer oder tiefer Einsilber das Gate — das ist die Stimme, nicht die Prüfung.
  - Erzeugung: Thai-Clips gehen mit einer Sprechanweisung an gpt-4o-…-tts (Zitierform, mittlere Töne eben, keine Aussagemelodie; `src/lib/clips/tts-instructions.ts`). Jeder Clip merkt sich die Fassung (`instructionsId: th-ton-1`). Ältere Modelle (tts-1) und andere Sprachen bekommen keine Anweisung. Die Wirkung ist noch ungemessen.
  - Neu `npm run content:tone-report`: Kennzahlen je Stimme × Anweisung (Abfall mittel, Trennschärfe tief/mittel und fallend/mittel) für den Vergleich nach einem Probelauf.
- Nutzertest (Web, 375 px; Deutsch → Thai, Thai → Deutsch, Arabisch), behoben:
  - „Sag es“ und Rollenspiel: Thai-Höflichkeitspartikeln (ครับ, ค่ะ, คะ) zählen beim Vergleich nicht mehr. „ผมมาจากเยอรมนีครับ“ galt gegen das Muster ohne ครับ als falsch, obwohl die App ครับ als Pflicht lehrt. คะ in Wörtern (คะแนน) bleibt Inhalt.
  - Heutige Runde: Die Hörfragen haben „Noch einmal anhören“. Nach der Wahl ist die richtige Antwort grün und eine falsche rot markiert, mit „✓ Richtig“/„✗ Nicht ganz“ und dem Ton („Ton: Hoch“); vorher wurde jede Wahl blau markiert und der Ton nicht genannt. Satz bilden ebenso, die Umschrift auf der markierten Antwort ist lesbar. Das Diktat zeigt Lösung, Umschrift und Bedeutung. Alle drei warten auf „Weiter“ statt nach 0,9 bzw. 1,6 s weiterzuspringen.
  - „Antwort sprechen“: Scheitert die Spracherkennung (Mikrofon gesperrt, kein Netz, nichts verstanden), steht jetzt ein Satz dazu da; vorher sprang der Knopf stumm zurück. Ein Hinweis sagt, dass der Browser den Ton dafür an seinen Anbieter senden kann (Chrome: Google).
  - Karteikarten: „Nochmal“-Karten kommen am Ende derselben Runde noch einmal („Wiederholung aus dieser Runde“), ohne FSRS ein zweites Mal fortzuschreiben. „Erneut prüfen“ setzt die Zähler zurück und zeigt „Nichts fällig“, statt denselben Abschluss zu wiederholen. Nach dem Aufdecken scrollt die Seite zu den Bewertungsknöpfen.
  - Schreiben: Der Abschlusstext nannte in allen 20 Sprachen den internen Verweis „(AE-40)“ und „Kartenzustand fortschreiben“; jetzt „… bestimmt dein Ergebnis, wann die Wörter wiederkommen.“
  - Kapitel: Schritt 1 übt die Regel der Szene (Höflichkeitspartikeln, Zählwörter, Ton herleiten bei ไกล/ใกล้, Perfekt, Artikel/Kasus) statt das Rollenspiel aus Schritt 7 zu wiederholen. Geöffnete Schritte tragen ein Häkchen (auf dem Gerät gemerkt). In jeder Übung führt „Weiter: n. Schritt“ zum nächsten Schritt; Kopfzeile kompakter. Die vermeintlich doppelten Kapitel sind die A1- und A2-Fassung eines Themas: Kapitel und Gespräche zeigen jetzt „Anfänger · Einstieg“ bzw. „· Aufbau“ (10 neue Texte in allen 20 Sprachen).
  - Offen (Entscheidung Nutzer): „Töne hören“ fragt nie mittel/tief ab, weil das Ton-Gate einsilbige Clips dieser Töne nicht bestätigen kann.
- Mikrofon (Emulator-Test Android 16): Der System-Dialog „Aufnahme erlauben?“ pausiert die App kurz (iOS: „inactive“). Der Satz-Runner wertete das als Unterbrechung und verwarf die erste Aufnahme jedes neuen Nutzers samt Vorbereitungszeit. Während der Mikrofon-Abfrage zählt ein AppState-Wechsel jetzt nicht mehr; Aufnahme, 12-Sekunden-Fenster und lokale Auswertung liefen im Emulator durch. Die App selbst lief dort erstmals vollständig (Debug-Build über Metro).
- ไหม in Sätzen jetzt einheitlich „mái“ wie gesprochen (49 Beispielsätze, 5 Dialogzeilen, B1-Vertiefung); der Wörterbucheintrag ไหม und ใช่ไหม/สบายดีไหม bleiben schriftgemäß „mǎi“, Seide (ผ้าไหม, ไหมขัดฟัน, ไหมพรม) ohnehin. Ton-Gate der 70 ไหม-Clips neu gerechnet: 11 jetzt geprüft, 4 nicht mehr prüfbar, kein Verwurf; ungeprüfte Thai-Clips 2.001 → 1.994.
- „Satz verstehen“, „Satz wiederholen“, Shadowing und das eigenständige Diktat ziehen ohne Kapitel aus dem Grundwortschatz (die 400 ersten Wörter in Erzeugungsreihenfolge) statt aus allen 2.000 Sätzen. Die Heutige Runde und Kapitel nutzen weiter ihre eigenen Wörter.
- Pluralformen auch für ar (one/two/few/many), ur, hi, mr, te, ta; ta „Silbenkerne“ war „மந்திரக்கருகள்“, hi „स्वरक“.
- Studio: Der Prüfbericht fragt vor „Neu erzeugen“ nicht mehr mit Kostenangabe nach (Regel „keine Kostendialoge“). Neuer Knopf „Dialogwörter ohne Eintrag übernehmen“ in der Wortschatz-Karte (Thai): schreibt die 55 Dialogwörter ohne Wortschatzeintrag (Zahlen, บาท, คะ, ชื่อ, ประเทศ, ไหน, จาก …) als Pflichtwörter ins Thema; der Lauf selbst startet wie immer von Hand.
- Aufgeräumt (Modulgraph, Referenzsuche je Export, `tsc --noUnusedLocals`, ESLint): nichts davon war in der App erreichbar.
  - Tote Funktionen und Konstanten entfernt, u. a. `loadSituation`/`clearSituations`, `retrievabilityPercent`, `DRILL_PROMPTS`, `pairLabel`, `isPackManifest`, `packAssetUri`, `clipLanguageOf`, `packInstallState`, `latestVersion` und nie aufgerufene Test-Rücksetzer. Nur noch von Tests genutzte Altteile ebenso: Monatsnamen-Tabelle (der Fortschritt nutzt längst `Intl`), `LERNZIELE`, `DIRECTIONS`, `SPEAKING_PRIVACY_NOTICE`, die Einzel-Kreuzprüfung neben der Paket-Kreuzprüfung (Tests laufen jetzt über `pruefeVocabKreuzBatch`).
  - Sprachmodell: Alias-Namen aus der Paarmatrix-Zeit (`TARGET_LANGUAGES`, `BRIDGE_LOCALES`, `TargetLanguage`, `TargetDirection`, `TargetVocabEntry`, `pairLanguageOf`, `languageOfDirection`, `languageOfTargetDirection`, `pairsFor`, `producesTargetLanguage`) durch die eigentlichen Namen ersetzt; Kopfkommentar ohne Französisch und 20-Paare-Stand.
  - 17 unbenutzte Texte aus allen 20 Wörterbüchern (alter Lernpfad-Satzbau `path.*`, `feature.*`, `texts.note`, `roleplay.summary`, `chapter.all`, `skill.schreiben` …), drei leere Abschnittsüberschriften.
  - Expo-Vorlage: `AnimatedIcon` (nativ und Web) mit CSS-Modul und `logo-glow.png`, ungenutzte Bilder (react-logo, expo-badge, tutorial-web, tabIcons) und die Abhängigkeit `expo-web-browser` samt Plugin.
  - Kleinkram: ungenutzte Importe und Variablen, doppelte Importe, ein Import mitten in `manifest.ts`; ESLint ignoriert das erzeugte `scripts/tone-analysis.js` und erlaubt Node-Skripten dynamische `process.env`-Zugriffe. Ein Brücken-Test prüfte seinen Fall nicht (Variable ungenutzt), jetzt schon.
  - Offen gelassen: 20 Meldungen `react-hooks/set-state-in-effect` und 4 `react-hooks/refs` (React-Compiler-Regeln, Ladeeffekte mit Zurücksetzen); ein Umbau ändert Verhalten und gehört in eine eigene Runde.

## 16.10.2026

- Linux-Mint-Einrichtung: Node 24 (nvm), JDK 17, Android SDK 36/NDK 27.1 und Emulator im Benutzerkonto; Debug-APK gebaut und im Emulator installiert. Die Windows-Kopie brachte 190 Dateien mit CRLF; zurück auf LF, neue `.gitattributes` erzwingt LF.
- Durchlauf Deutsch → Thai und Thai → Deutsch (Web): Karteikarten, Schreiben, Töne hören, Satz verstehen, Diktat, Ton herleiten, Lesetexte, Sag es, Grammatik, Kapitel-Rollenspiel, Gespräch. Behoben:
  - Grammatikübungen mit gelöstem Beispiel zählten das Beispiel mit („Aufgabe 2 von 5“ als erste Aufgabe, Ergebnis „von 4“).
  - Thai-Lautschrift der Vokale เ-ือ, เ-ือย, เ-ือะ: /ɯa/ statt /ɪa/.
  - Schreiben: Substantive verlangen den Artikel jetzt wirklich („Haus“ galt als „genau richtig“, entgegen Auftrag und Abnahmekriterium 14). Ein großgeschriebener Satzanfang („Oder“, „Das Haus“) und kleingeschriebene Grußformeln („hallo“) gelten als richtig. Die Groß-/Kleinschreibungs-Meldung passt zum Wort (Nomen, groß, klein); vorher hieß es auch beim Englischlernen „im Deutschen werden Substantive großgeschrieben“.
  - Enter prüft in Diktat, „Sag es“, Rollenspiel und dem Diktat der Heutigen Runde, statt eine Zeile einzufügen; leeres Diktat lässt sich nicht mehr prüfen.
  - Perfekt-Übung: Verben mit beiden Hilfsverben (reiten, sitzen/stehen/liegen, brechen, ziehen, treten …) bieten die andere Form nicht mehr als falsche Antwort an; die Erklärung nennt sie als „auch richtig“.
  - Pluralformen in Texten: `{{count, plural, one {…} other {…}}}` über `Intl.PluralRules` („1 Wort“, „1 Tag Lernprotokoll“, russisch 1 слово/3 слова/5 слов); de, en, es, fr, pt, ru für Wortzahlen, Situationen, Silbenkerne, Kapitel und Datensicherung. Der Wörterbuch-Generator kennt die Blöcke.
  - Datensicherung: Fehlermeldungen in allen 20 Sprachen statt fest deutsch; „Übernommen: … (Sicherung vom …)“ klebte in 16 Sprachen ohne Leerzeichen zusammen.
  - Wörterbücher: „Artikel“ als Zeitungsartikel übersetzt (ar, bn, hi, mr, ta, tr, ur; ta sogar „Lehrer“); „schon ist nicht schön“ wörtlich übersetzt (pt, bn, ar, te, ur, hi, ta, ja, mr, tr, ko „우음“); pt „im Portugiesischen werden Substantive großgeschrieben“; ru „Тонкий знак“ und „Дифтоны“; ko/te/mr Akzent-Meldung verdreht; id viermal unübersetzt „Sicherung“; tr fragte „Willst du diesen Schritt überspringen?“ statt „fortfahren?“; ta nannte die Sicherung „Schutz“; te „బాకప్“ → „బ్యాకప్“; ar Startseiten-Untertitel umgangssprachlich.
  - Schreiben: Der Knopf zur Zeichentafel hieß „Antwort eingeben · +“, jetzt „Zeichen einfügen · +“.
  - Lern-Reiter: Der zuletzt geöffnete Lernbereich bleibt nach einer Übung aufgeklappt.
  - Katalog: Plural „die Obst“, „die Müll“, „die Zimt“, „die Hackfleisch“ usw. (11 Nomen) → „—“, „das Wasser“ ohne „die Wässer“; ห้อง einheitlich hɔ̂ng (vorher 15× hɔ̂ɔng); B1-Vertiefung dâi → dâai, ไหม dort mǎi wie überwiegend im Katalog. Thai-Bedeutungen ohne ขอรับ in Frauensätzen; „สี่แผงห้าสิบเซนต์“ → „สี่ยูโรห้าสิบเซนต์“. Keine Audioänderung: Clips hängen am Thai-Text. ไหม bleibt im Katalog gemischt (67× mǎi, 9× mái): Das Ton-Gate liest den Sollton von Sätzen aus der Umschrift, die Clips sprechen mái, und mit mǎi kippten drei Clips in der Integritätsprüfung („geprüft“ → „nicht prüfbar“). Eine Vereinheitlichung braucht eine Entscheidung (mái wie gesprochen oder mǎi wie geschrieben) und eine neue Tonprüfung der betroffenen Clips.
  - Studio: Der „schlaue Export“ verglich lokale Clips mit der komprimierten Stage-Fassung und lud deshalb jeden Clip bei jedem Lauf neu hoch; jetzt ohne `format`/`byteSize`/`blobKey`, mit Originalgröße, auch gegen den Katalog. „Neu erzeugen“ im Prüfbericht übersprang den vorhandenen Clip; jetzt überschreibt der Lauf ihn.
- Offen: siehe 17.10.2026 (dort erledigt bis auf den Wortschatzlauf für die fehlenden Thai-Grundwörter).

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
