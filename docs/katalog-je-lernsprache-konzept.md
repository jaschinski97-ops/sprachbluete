# Inhaltskatalog je Lernsprache: Konzept (18.10.2026)

Stand 18.10.2026 (abends): **Schritt 1 und 1b sind gebaut** (E1–E4 wie empfohlen; Ergebnisse und Messwerte in
Abschnitt 12 und in `CHANGELOG.md`). Ursprünglich: Entwurf zur Entscheidung. Grundlage ist der schlanke App-Katalog vom 18.10.2026
(`scripts/metro-app-catalog.cjs`, Commit `ec1516fc`), die Messwerte dazu in `CHANGELOG.md` (18.10.2026, „Schlanker
Inhaltskatalog im App-Build“) und eine
Auswertung des echten Katalogs mit diesem Stand. Gebaut wird erst nach Zustimmung und nach der TestFlight-Runde.

## 1. Kurzfassung

- **Problem:** Der schlanke Katalog (14,0 MB kompaktes JSON) steckt als JS-Modul im Bundle und liegt beim Start
  komplett im Hermes-Heap, für alle 4 Lernsprachen und alle 20 App-Sprachen. Mit ~1.000 weiteren Dialogen für
  Fortgeschritten und Profi wächst er auf etwa **60 MB** (Hochrechnung in Abschnitt 7).
- **Empfehlung in vier Stufen:**
  1. **Schritt 1:** Der Katalog wird je Lernsprache eine eingebettete Datei. Die App lädt beim Start nur die
     aktive Lernsprache, mit Ladetor hinter dem Splash. Ein kleiner Index für alle Sprachen bleibt im Bundle.
     Geparst werden dann heute ~3,8 statt 14 MB JSON, nach dem großen Lauf ~15 statt ~60 MB.
  2. **Schritt 1b (neu vorgeschlagen, vor Schritt 2):** Übersetzungen je App-Sprache trennen. Bei den Dialogen
     machen sie 89 % der Größe aus (27,4 von 30,7 KB), deshalb ist das der größte Hebel für den geplanten
     Dialog-Lauf: ~7 statt ~15 MB je Lernsprache.
  3. **Schritt 2a:** Anfänger, Fortgeschritten und Profi werden je Lernsprache eigene Teile. Der Anfänger-Teil wird
     immer geladen, die anderen beiden erst, wenn sie gebraucht werden. Alles bleibt eingebettet.
  4. **Schritt 2b (Entscheidung offen):** Die Teile für Fortgeschritten und Profi wandern in die Sprachpakete.
     Für den Speicher bringt das nach 2a kaum noch etwas. Der Nutzen ist ein kleinerer Store-Build und die
     Möglichkeit, Inhalte ohne App-Update nachzuliefern. Dafür kostet es Paketversionierung und einen Netzweg.
- **Reihenfolge:** TestFlight → Messbasis plus synthetischer Zukunftskatalog → Schritt 1 → 1b → großer Studio-Lauf
  → 2a → (2b nach Entscheidung). Schritt 1 und 1b sollten **vor** dem großen Studio-Lauf stehen.
- **Aufwand:** Schritt 1 ≈ 4–5 Arbeitstage, 1b ≈ 1,5–2, 2a ≈ 2, 2b ≈ 3–4 (Details in Abschnitt 9).

### Entscheidungen für den Nutzer

| Nr. | Frage | Empfehlung |
|---|---|---|
| E1 | Schritt 1 nach der TestFlight-Runde bauen? | Ja |
| E2 | Schritt 1b (Übersetzungen je App-Sprache) direkt anschließen, vor dem großen Studio-Lauf? | Ja |
| E3 | Gesprächs-Reiter: eigene Sprachwahl behalten (dann bis zu 2 geladene Sprachen) oder fest an die Lernsprache koppeln? | Behalten, kostet wenig |
| E4 | Fortgeschritten/Profi-Texte über Sprachpakete ausliefern (2b) oder eingebettet lassen (nur 2a)? | Erst 2a; 2b, sobald Inhalte ohne Store-Update kommen sollen |

## 2. Ausgangslage

Gemessen am 18.10.2026 mit dem echten Katalog (`src/content/catalog.json`, 26.469 Einträge), schlank wie im
App-Build, als kompaktes UTF-8-JSON:

| Lernsprache | Einträge | schlank | davon Übersetzungen | ohne Übersetzungen | komprimiert (deflate) |
|---|---|---|---|---|---|
| th | 7.167 | 3,78 MB | 1,14 MB | 2,64 MB | 0,96 MB |
| en | 6.926 | 3,55 MB | 1,05 MB | 2,50 MB | 0,87 MB |
| es | 5.380 | 2,93 MB | 0,88 MB | 2,05 MB | 0,72 MB |
| de | 6.996 | 3,71 MB | 1,13 MB | 2,58 MB | 0,96 MB |
| **alle** | 26.469 | **14,04 MB** | 4,08 MB | | |

- Je Lernsprache: Wortschatz 1,75–2,42 MB, Clip-Einträge 0,74–0,98 MB, Bild-Einträge ~0,2 MB, Situationen 0,18–0,26 MB.
- Eine Situation wiegt im Mittel 30,7 KB, davon 27,4 KB Übersetzungen in die App-Sprachen. Je App-Sprache trägt
  eine Lernsprache heute 49–63 KB Übersetzungen (höchstens 94 KB).
- Ein Clip-Eintrag braucht ~235 B. Die ID steht darin doppelt, und der 64-stellige Hash dominiert. Als Tupel
  `[id, hash, tonStatus, status]` sind es etwa 50 % weniger.
- Index aller Vokabel-IDs mit Erzeugungszeit und Stufe, alle 4 Sprachen: 0,28 MB. `deleted` und `clearedBefore`: 0,07 MB.
- JSON.parse einer Sprachdatei dauert in Node auf dem Desktop 11–22 ms. Hermes auf dem Emulator ist langsamer;
  den Wert liefert der Messplan.

Aus der Messnotiz (Emulator, Release-APK mit Paketen, Median aus 12 Läufen): Start 798 ms, PSS 254 MB, davon
Hermes-Heap („Unknown“) 43 MB und Bytecode („Code“) 73 MB. Die Verschlankung von 28 auf 12,5 Mio. Zeichen brachte
−10 MB Heap und −6 MB Code. Grob gilt also: 1 MB JSON weniger ≈ 0,65 MB Heap + 0,4 MB Code weniger.

## 3. Befunde aus dem Code: wo die App mehrere Sprachen zugleich braucht

Die meisten Aufrufer arbeiten mit genau einer Lernsprache, nämlich der Zielsprache der Richtung
(`targetLanguageOf`). Für Schritt 1 entscheidend sind die Ausnahmen:

1. **Übersicht, Fällig-Zahlen aller Ziele:** `src/app/index.tsx` ruft `useDirectionSummariesFor` für **alle**
   Ziele der Oberfläche auf. `summarizeDirection` → `ensureCardStates` (`src/lib/review-session.ts:70`) lädt dafür
   den Wortschatz jeder Zielsprache und **legt fehlende Karten an**.
2. **Anzahlen beim Modul-Import:** `src/lib/languages/registry.ts` berechnet `LANGUAGE_ORDER` schon beim Import aus
   `entryCount` (also aus `activeVocabularyFor(code)` für alle Sprachen). Ebenso brauchen `hasContent`
   (→ `loadProfile` in `src/lib/profile.ts:94`), `wortschatzFuerZiel` (Sprachauswahl) und die Gesamtzahl in
   `src/app/settings/about.tsx` alle Sprachen.
3. **Gesprächs-Reiter mit eigener Sprachwahl:** `src/app/conversation.tsx:56-75` merkt sich `profile.conversation`
   unabhängig von der Lernsprache der Karten. Er lädt bereits asynchron (`loadSituations`).
4. **Deutsche Bedeutungs-Clips:** Karteikarten spielen `entry.german` mit `language="de"`
   (`src/components/flashcard.tsx`). `planDeliveryAudio` plant diese Clips ausdrücklich ein. Ein th-Lerner braucht
   511 de-Clip-Einträge, ein en-Lerner 827, ein es-Lerner 612. Alle sind zugleich Clips des deutschen Wortschatzes.
5. **Vorsicht, Datenpflege:** `loadVocabulary` (`src/lib/repository.ts:70-83`) löscht Zeilen im lokalen
   Vokabelspeicher, deren ID nicht in `activeVocabularyIds()` steht. Mit einem Teilkatalog würde es die Wörter der
   anderen Sprachen löschen. Kartenstände (`cards`) bleiben unberührt, die Stelle muss aber trotzdem umgestellt
   werden. Dasselbe gilt für das erneute Einspielen in `src/lib/storage/migration.ts:78`.

Unkritisch: Thai-Sonderwege (`foundations-runner.tsx`, `drills/grammar.ts` mit `'th'`) sind nur mit Thai-Ziel
erreichbar. `FeatureLegend` (Spanisch-Beispiele) zeigt nur das aktive Ziel. `ambiguity.ts` und `bundled.ts`
cachen schon über die Objektidentität des Katalogs und bauen ihren Index bei neuem Katalogobjekt selbst neu.
Studio-Aufrufer (`images/plan.ts`, `tone-gate.ts`, `audio-plan.ts`, `delivery-preview.ts`, `src/dev/*`) laufen nur
im Entwicklungsbau, und der behält den vollen Katalog.

## 4. Schritt 1: Katalog je Lernsprache als eingebettete Datei

### 4.1 Bau

- **Aufteilungsregel** (eine Funktion, die Bau und Tests teilen):
  - Wortschatz nach `document.language`, Situationen nach `targetLanguageOf(direction)` (also `th_to_de` → de),
    Bilder nach der Sprache ihrer `vocabId`.
  - Clip-Einträge: alle IDs aus `planDeliveryAudio(situationen, L, wortschatz)`. Das sind die eigenen Clips plus
    die deutschen Bedeutungs-Clips. Ein de-Clip steht also in mehreren Dateien; beim Laden zweier Sprachen gewinnt
    der erste Eintrag (wie heute in `bundled.ts`).
  - Unbekannte Inhaltsarten kommen in jede Datei (heute gibt es keine).
- **Dateien:** `assets/catalog/<lang>.catalog`, also schlanke Einträge im heutigen Format, plus Kopf
  `{ format: 1, language, sourceCatalogSha256 }`. Eigene Endung, damit Metro die Datei als Asset und nicht als
  Quellcode behandelt (Expo „Customizing Metro“: `config.resolver.assetExts.push('catalog')`).
- **Erzeugung:** `metro.config.js` ruft beim Laden ein neues `scripts/app-catalog-files.cjs` auf. Das läuft im
  Hauptprozess, einmal je Metro-Start, vor jeder Auflösung, und zwar bei `expo export`, EAS und Gradle-Release
  gleichermaßen. Ein Stempel (`stamp.json` mit sha256 des Katalogs und Hash des Erzeugers) spart unnötige Läufe.
  Die Dateien stehen in `.gitignore`, damit nicht jeder Publish 15 MB Git-Verlauf erzeugt. EAS erzeugt sie auf der
  Baumaschine selbst.
- **Index statt Katalogmodul:** Der bestehende Transformer (`wrapTransform`) ersetzt `catalog.json` im
  Nicht-Entwicklungsbau künftig durch den **Index**. Er enthält `version`, `vocabularySource`, `deleted`,
  `clearedBefore`, `entries: []` und je Sprache die Vokabel-Liste `[id, generatedAt, stage]` sowie die Anzahlen je
  Stufe und Richtung, zusammen ~0,35 MB. Der Transformer **prüft** dabei, ob der Stempel zum Katalog passt, und
  bricht den Bau sonst ab. So wird nie ein alter Text ausgeliefert. `CACHE_KEY` nimmt den Hash des Erzeugers mit auf.
- **Statische Zuordnung:** Ein festes, eingechecktes `src/content/catalog-files.ts` enthält die vier `require`s, so
  wie heute `assets.ts`. Android legt die Dateien unter `res/raw` ab und komprimiert die unbekannte Endung im APK
  (3,8 → ~1 MB je Sprache).

### 4.2 Laufzeit: geladene Sprachen als Menge

`src/lib/content/catalog-state.ts` bekommt im Release-Bau ein neues Innenleben. Die Schnittstelle nach außen bleibt
synchron:

| Funktion | Verhalten |
|---|---|
| `currentCatalog()` | wie bisher synchron: Vereinigung der **geladenen** Sprachen, neues Objekt bei jeder Änderung (die vorhandenen Identitäts-Caches bauen dann von selbst neu) |
| `catalogIndex()` | synchron, immer vollständig für alle Sprachen (aus dem Modul) |
| `ensureLanguages(langs)` | lädt fehlende Sprachen; höchstens **2** geladen, nie entladen werden Lern- und Gesprächssprache |
| `isLanguageLoaded(lang)` | für Wächter; `activeVocabularyFor` warnt im Dev-Bau bei ungeladener Sprache |
| `useCatalogStamp()` | `useSyncExternalStore`, damit Bildschirme nach dem Laden neu zeichnen |

Laden einer Sprache auf iOS und Android:
`Asset.fromModule(require(...)).downloadAsync()` → `localUri` → `new File(localUri).text()` → `JSON.parse`.
- Laut expo-asset-Doku (v57) speichert `downloadAsync` in den Cache und überspringt den Schritt, wenn die Datei
  schon dort liegt. Ob sie über App-Sitzungen hinweg erhalten bleibt, ist nicht garantiert. Deshalb wird bei
  **jedem** Start aufgerufen, nicht der Pfad gemerkt.
- Android hält eingebettete Ressourcen unter `file:///android_res/` und kopiert sie beim ersten Mal in den Cache
  (Quelle: `expo-asset` 57.0.18, `Asset.js`). iOS liest direkt aus dem App-Bundle.
- `expo-file-system` v57: `File#text()` (asynchron). Die alte `FileSystem.*`-API wirft zur Laufzeit.
- Der Weg ist im Projekt schon erprobt: `bundledAssetUri` lädt eingebettete mp3 genauso.
- Das Konfig-Plugin von `expo-asset` (`assets`) wird **nicht** genutzt. Laut Doku unterstützt es nur Bilder,
  Medien, `.db` und `.glb`.

Web: `downloadAsync` liefert eine URL, gelesen wird mit `fetch(uri).then(r => r.text())`. Der Web-Export ist
statisch gerendert (`web.output: "static"`). Die vorgerenderten Seiten zeigen dann nur den Ladezustand. Die Prüfung
der Einstellungen-Seite in `scripts/content/verify-production.cjs` muss deshalb auf das Gerüst angepasst werden.

### 4.3 Ladetor beim Start

- `src/app/_layout.tsx` ruft schon `SplashScreen.preventAutoHideAsync()` auf. `AnimatedSplashOverlay` blendet den
  nativen Splash im ersten `onLayout` aus. Neu: Ein `CatalogGate` umschließt Overlay und `AppTabs`. Solange es lädt,
  rendert es `null`, und der native Splash bleibt stehen.
- Das Startprogramm (rein, testbar):
  1. Profil lesen (`loadProfile`, nutzt künftig den Index für `hasContent`) und gespeicherte App-Sprache lesen,
     beides parallel.
  2. Lernsprache bestimmen: `targetLanguageOf(profile.review.direction)` → `profile.language` → Vorgabe-Ziel der
     Oberfläche. Die heutige Logik in `index.tsx:55-63` wird dafür als reine Funktion `defaultGoal(ui, profile)`
     herausgezogen, die Übersicht und Ladetor teilen.
  3. `ensureLanguages([lernsprache])`. Die Gesprächssprache wird erst im Gesprächs-Reiter geladen.
- Fehlerweg: Fehlt die Datei oder ist sie kaputt, oder dauert es länger als 10 s, wird der Splash ausgeblendet und
  ein Fehlerbildschirm mit „Erneut versuchen“ gezeigt. Nie ein ewiger Splash, nie eine still leere App. Die neuen
  Texte kommen in alle 20 Wörterbücher.
- Im Entwicklungsbau (voller Katalog im Modul) ist das Tor sofort offen. Für Studio und Port 8081 ändert sich nichts.
- Jede Phase wird gemessen und protokolliert: `[catalog] th: asset X ms, read Y ms, parse Z ms, N MB`. Daraus
  liest der Messplan.

### 4.4 Sprachwechsel und Gesprächs-Reiter

- **Übersicht** (`chooseGoal`/`startGoal` in `src/app/index.tsx`): Die Zeile zeigt „lädt…“, dann folgen
  `await ensureLanguages([neu])` → `chooseLanguage` → `setReviewSpot` → Navigation. Die alte Sprache bleibt geladen,
  bis eine dritte gebraucht wird. Bereits gemountete Reiter sehen also nie einen leeren Katalog. Ein Neuaufbau des
  ganzen Baums ist nicht nötig, weil die Einträge der geladenen Sprachen beim Hinzuladen dieselben Objekte bleiben.
- **Fällig-Zahlen ungeladener Ziele:** `summarizeDirection` rechnet für eine nicht geladene Sprache **nur lesend**
  aus dem Index (IDs, Reihenfolge) und den gespeicherten Kartenständen. Fehlende Karten zählen als neu, höchstens
  `NEW_CARDS_PER_SESSION`, aber es werden keine Karten angelegt. Das holt `ensureCardStates` nach, sobald die
  Sprache aktiv ist. Ein Test vergleicht beide Wege auf dem Testkatalog.
- **Lern-Reiter mit `?direction=`** (Direkteinstieg): Vor dem Aufbau der Sitzung läuft
  `await ensureLanguages([targetLanguageOf(direction)])` im vorhandenen Ladezustand. Dasselbe gilt für alle
  Sitzungen (heutige Runde, Satz-, Wort-, Diktat-, Produktions-, Lese- und Schreibübungen). Sie bekommen ihre
  Sprache über die Richtung und laufen danach unverändert synchron.
- **Gesprächs-Reiter (E3):** Aus `loadSituations()` wird `loadSituations(sprache)` mit `ensureLanguages([sprache])`
  davor. Der Reiter hat schon den Zustand „conversation.loading“. Weil die Clip-Einträge mitkommen, funktionieren
  Wiedergabe und Thai-Tongate (`allowsThaiPlayback` braucht den Ton-Status) wie heute.

### 4.5 Synchrone Aufrufer: was sich ändert

| Aufrufer | braucht | Lösung |
|---|---|---|
| `active-vocabulary.ts` (`activeVocabulary`, `…For`, `…Ids`) | Wörter | bleibt; `…Ids` für das Aussortieren kommt aus dem Index |
| `registry.ts` (`entryCount`, `LANGUAGE_ORDER` beim Import), `goals.ts`, `language-picker.tsx`, `profile.ts` (`hasContent`), `settings/about.tsx` | Anzahlen aller Sprachen | Index |
| `ambiguity.ts` | Pool der Lernsprache | bleibt (Identitäts-Cache) |
| `bundled.ts` (`bundledEntry`, `bundledDocuments`, `preferBundled`, `isDeletedDraft`, `bundledAssetUri`) | geladene Sprachen, `deleted`/`clearedBefore` | bleibt; `deleted`/`clearedBefore` aus dem Index |
| `clips/lookup.ts`, `packs/loader.ts` | Clip-Einträge inkl. de-Bedeutung | Aufteilungsregel über `planDeliveryAudio` |
| `repository.ts` `loadVocabulary`, `storage/migration.ts` | IDs aller Sprachen | Index-IDs, damit keine Vokabelzeilen anderer Sprachen verschwinden |
| `review-session.ts` `summarizeDirection` (Übersicht) | alle Ziele | ungeladen: lesend aus Index plus Kartenständen |
| `ensureCardStates` und alle Sitzungen | aktive Sprache | Sprache vorher laden (Ladetor, Wechsel, Direkteinstieg) |
| `conversation.tsx`, `learning-example.ts`, `speaking/sentence-session.ts` | Situationen einer Sprache | `ensureLanguages` im vorhandenen async-Laden |
| Studio und `src/dev/*` | voller Katalog | nur Entwicklungsbau, unverändert |

### 4.6 Studio, Entwicklung, Tests

- Entwicklungsbau und Studio behalten den vollen Katalog als Modul. `setLiveCatalog` bleibt, wie es ist.
- Jest läuft weiter gegen `fixture-catalog.ts` (voller Katalog, Tor offen). Neue Tests:
  - Aufteilung: Die Vereinigung aller Sprachdateien ergibt die App-Sicht des schlanken Katalogs, und jede ID aus
    `planDeliveryAudio(·, L)` findet sich in Datei L.
  - Index gegen vollen Katalog.
  - `summarizeDirection` lesend gegen anlegend.
  - Ladetor-Programm (Profil, App-Sprache, Vorgabe-Ziel).
  - `loadVocabulary` behält Wörter ungeladener Sprachen.
  - Fehlerweg bei kaputter Datei.
  - `node --test` für Erzeuger und Stempelprüfung.
- `content:integrity` bleibt unverändert, weil es den vollen Katalog prüft.

## 5. Schritt 1b: Übersetzungen je App-Sprache trennen

- Jede Lernsprachen-Datei teilt sich in eine Basis ohne `translations` und einen Teil je App-Sprache:
  `assets/catalog/<lang>.base.catalog` und `<lang>.tr-<ui>.catalog`, mit 4 × 20 Teilen von je 49–94 KB.
- Beim Laden setzt die App `entry.document.translations = { [ui]: …, en: … }` zusammen. Englisch wird immer
  mitgeladen, weil `bridgeText` auf `translations.en` zurückfällt. Die Aufrufer (`bridgeText`, `promptText`,
  Gesprächs-Reiter) bleiben unverändert.
- Ein Wechsel der App-Sprache lädt die Übersetzungsteile der geladenen Lernsprachen nach. `I18nProvider` wartet
  darauf; das kommt selten vor und dauert kurz.
- Zu prüfen: Gibt es Richtungen, deren Anker (`anchorOf`) nicht die App-Sprache ist? Falls ja, wird der Teil des
  Ankers mitgeladen.
- Kleine Zusatzersparnis im selben Schritt: Clip-Einträge als kompakte Tabelle `[id, hash, tonStatus, status]`
  ablegen (−50 % am Clip-Anteil). `bundledEntry` baut daraus beim Index-Aufbau den gewohnten `ContentEntry`.
- Nutzen heute klein (−1,1 MB je Lernsprache), nach dem Dialog-Lauf groß (siehe Abschnitt 7).

## 6. Schritt 2: Fortgeschritten und Profi aus dem eingebetteten Anfänger-Text

### 2a: Stufen-Teile, eingebettet, bei Bedarf geladen

- Je Lernsprache drei Teile: `beginner` (Situationen A1/A2, Wörter ohne oder mit Stufe `beginner`),
  `experienced` (B1/B2) und `pro` (C1/C2) (`src/lib/learning-stages.ts`).
- Ein Clip-Eintrag gehört zum Anfänger-Teil, wenn Anfänger-Inhalt ihn braucht (Prüfung über `planDeliveryAudio`
  je Teil). Sonst gehört er zu dem Teil, der ihn braucht. Jeder Teil ist selbsttragend: eigene Wörter, Clips und
  Bilder, nie Verweise in einen fremden Stufen-Teil.
- Der Anfänger-Teil wird immer geladen. `experienced` und `pro` kommen über `ensureStage(lang, stage)`, sobald
  der Lern- oder Gesprächs-Reiter diese Stufe zeigt (beide haben schon eine Stufenwahl). Die Anzahlen für
  „gesperrte“ Stufen kommen aus dem Index.
- Ergebnis: Ein Anfänger hat dauerhaft nur den Anfänger-Teil im Heap, egal wie groß der Profi-Bestand wird.

### 2b: Stufen-Teile über die Sprachpakete

- `scripts/content/build-pack.cjs` legt `text/experienced.catalog` und `text/pro.catalog` ins Zip, im selben
  Format wie 2a. Die Textdateien werden mit DEFLATE gepackt (Node `zlib`, keine neue Abhängigkeit). Medien bleiben
  STORE. `react-native-zip-archive` entpackt beides.
- Manifest: Es kommt nur ein Feld hinzu, `text: { format: 1, parts: [...], counts: {...} }`. `schemaVersion` bleibt
  1. Ältere App-Builds akzeptieren neue Pakete also weiter, weil `manifestProblem` unbekannte Felder nicht
  verwirft und `text/…` die Pfadregel erfüllt. Die Textdateien stehen in `files` mit sha256 und laufen damit durch
  die vorhandene Prüfung.
- **Eine Version:** Text und Medien entstehen aus demselben Katalog (`sourceCatalogSha256` gibt es schon), also
  gilt eine Paketversion für beides.
- Herkunft je Bau: Im Paketbau (`THAISPEAKER_MEDIA=packs`) kommen Fortgeschritten und Profi nur aus dem
  installierten Paket. Im eingebetteten Bau (`testflight`, Vorschau) und auf Web bleiben sie eingebettet wie in 2a.
  Die Regel lautet: **Der Fortgeschrittenen-Text liegt dort, wo die Medien liegen.**
- Oberfläche: Ohne Paket zeigt die Stufe „Mit Sprachpaket verfügbar“ mit dem vorhandenen Download-Knopf
  (`language-packs-section.tsx`). Unbekanntes `text.format` heißt „App-Update nötig“ statt Absturz.
- Anfänger-Text bleibt eingebettet, damit der erste Start offline klappt. Im Paketbau gibt es auch Anfänger-Medien
  nur aus dem Paket, so wie heute.
- Veröffentlichen der Pakete bleibt Sache des Nutzers (`pack:publish` je Sprache).

## 7. Größen je Variante

Annahmen für die Hochrechnung: Je Lernsprache kommen +250 Dialoge zu 30,7 KB hinzu (davon 27,4 KB
Übersetzungen), +2.000 Wörter für Fortgeschritten/Profi zu 1,24 KB (davon 0,46 KB Übersetzungen) und +7.000
Clip-Einträge zu 235 B. Die Werte bezeichnen das JSON, das beim Nutzer geparst im Heap liegt (Mittel je
Lernsprache).

| Variante | heute | nach dem großen Lauf |
|---|---|---|
| heutiger Weg (alles im Bundle) | 14,0 MB | ~61 MB |
| Schritt 1 (eine Lernsprache) | 2,9–3,8 MB | ~15 MB |
| + 1b (eine App-Sprache + en) | ~2,7 MB | ~7,4 MB |
| + kompakte Clip-Tabelle | ~2,3 MB | ~6,1 MB |
| + 2a, Anfänger-Nutzer | ~2,3 MB | ~2,5 MB |
| + 2a, Profi-Nutzer (Anfänger + eine Stufe) | – | ~4,2 MB |

Dazu kommt immer der Index mit ~0,35 MB heute und ~0,7 MB nach dem Lauf. Der Katalog-Anteil am Bytecode fällt
ab Schritt 1 ganz weg; wie viel „Code“ im PSS das spart, zeigt Punkt 5 des Messplans. Alle Zahlen hier sind
Rechnungen über die JSON-Größe; der Messplan prüft sie.

## 8. Risiken

| Risiko | Folge | Gegenmaßnahme |
|---|---|---|
| Start wird langsamer: JSON.parse in Hermes plus Kopie aus `res/raw` beim ersten Start oder nach Cache-Leerung | längerer Splash | Phasen protokollieren; Abbruchkriterium im Messplan; nur eine Sprache parsen |
| Spitzenspeicher beim Parsen (Text plus Objektgraph gleichzeitig) | kurzzeitig höherer Heap | messen (Abschnitt 10); Datei in Teilen laden (1b/2a) senkt die Spitze |
| `loadVocabulary` löscht Wörter ungeladener Sprachen | Vokabelzeilen weg (Karten bleiben) | Index-IDs; eigener Test |
| Übersicht zählt Fällige falsch für ungeladene Ziele | falsche Badges | lesende Zusammenfassung aus Index plus Kartenständen; Vergleichstest |
| `LANGUAGE_ORDER` und `hasContent` laufen beim Import bzw. vor dem Laden | leere Sprachauswahl, Profil fällt auf Vorgabe zurück | ausschließlich Index |
| Sitzung startet für eine ungeladene Sprache (Direkteinstieg, Gesprächs-Reiter) | leere Übung | `ensureLanguages` vor jeder Sitzung; Dev-Warnung in `activeVocabularyFor` |
| de-Bedeutungs-Clips fehlen in th/en/es | Sprachausgabe statt Clip | Aufteilung über `planDeliveryAudio`; Test „jede geplante ID in Datei L“ |
| Generierte Dateien veraltet gegenüber `catalog.json` | alter Text im Build | Stempel, Transformer bricht ab; Nachprüfung in `verify-production.cjs` |
| Fehlende oder kaputte Datei auf dem Gerät | App ohne Inhalt | Fehlerbildschirm mit Wiederholen, nie stiller Leerzustand; Test |
| Web statisch gerendert | vorgerenderte Seiten zeigen nur den Ladezustand | akzeptieren; Prüfung in `verify-production.cjs` anpassen |
| iOS lässt sich unter Linux nicht messen | Unsicherheit bei iOS-Zahlen | Android-Emulator und Web als Maß; iOS nur Funktionstest über TestFlight |
| 2b: Paket und App-Version passen nicht zusammen | Fortgeschrittenen-Stufe fehlt oder ist zu neu | additive Manifestfelder, `text.format`, selbsttragende Teile |
| Parallel-Sitzungen am selben Code | Konflikte | pfadgenau committen; Schritt 1 als eigener Zweig nach TestFlight |

## 9. Aufwand und Reihenfolge

| Reihenfolge | Arbeit | Aufwand |
|---|---|---|
| 0 | TestFlight-Runde (unverändert zuerst) | – |
| 1 | Messbasis neu aufnehmen; synthetischen Zukunftskatalog bauen und mit dem heutigen Weg messen | 0,5 Tag |
| 2 | **Schritt 1:** Erzeuger, Stempel, Index-Transformer (1 Tag); Laufzeit-Menge und Laden inkl. Web (0,5); Index-Umstellung der Anzahl-Aufrufer (0,5); Ladetor mit Fehlerweg und 20 Wörterbüchern (0,5); Sprachwechsel, Direkteinstieg, Gesprächs-Reiter (0,5–1); lesende Zusammenfassung, `loadVocabulary` (0,5); Tests und Messung (1) | 4–5 Tage |
| 3 | **Schritt 1b:** Übersetzungsteile, Zusammensetzen beim Laden, Nachladen beim App-Sprachwechsel, kompakte Clip-Tabelle | 1,5–2 Tage |
| 4 | großer Studio-Lauf (Nutzer) | – |
| 5 | **Schritt 2a:** Stufen-Teile, `ensureStage` in Lern- und Gesprächs-Reiter, Index je Stufe | 2 Tage |
| 6 | **Schritt 2b** (nach E4): Text im Paket, DEFLATE, Manifestfeld, Loader, Oberfläche „mit Sprachpaket“, Tests; Veröffentlichung durch den Nutzer | 3–4 Tage |

Schritt 1 und 1b sollten vor dem großen Studio-Lauf fertig sein. Sonst wächst das Bundle erst auf ~60 MB und
jeder Bau dazwischen wird langsam (`expo export` dauert heute schon 8:28).

## 10. Messplan

Gleiche Umgebung wie in der Messnotiz: AVD `ThaiSpeaker_API36`, 2 GB RAM, 4 Kerne, Release-APK x86_64 mit
`THAISPEAKER_MEDIA=packs`, Daten der vorhandenen Installation, 12 Läufe, Median. Skript in Anhang A (erweitert um
die Zeilen „Unknown“ und „Code“ aus `dumpsys meminfo` und um die `[catalog]`-Zeilen aus dem JS-Log).

1. **Basis:** Stand `ec1516fc` (798 ms, 254 MB PSS, 43 MB Unknown, 73 MB Code) neu aufnehmen, falls der Emulator
   sich verändert hat.
2. **Zukunftskatalog, synthetisch:** Ein Skript (Scratch-Kopie, nie committen, keine KI) vervielfacht je Lernsprache
   Situationen auf +250 und Wörter auf +2.000, mit neuen IDs. Gemessen werden (a) der heutige Weg, (b) Schritt 1,
   (c) Schritt 1 + 1b. Diese Messung entscheidet, ob 2a/2b für den Speicher überhaupt nötig sind.
3. **Je Schritt:** Startzeit (`am start -W`, schließt das Ladetor ein, weil der Splash den ersten Frame zurückhält),
   PSS / Unknown / Code nach 15 s, `[catalog]`-Phasen (Asset, Lesen, Parsen), Dauer eines Sprachwechsels in der
   Übersicht (JS-Log, 5 Wechsel), Erststart nach Installation getrennt (Kopie aus `res/raw`).
4. **Spitze beim Parsen:** `dumpsys meminfo` im Sekundentakt während der ersten 5 s, Maximum notieren.
5. **Größen:** `index.android.bundle` und `.hbc` aus `expo export`, APK-Größe, Dauer von `expo export`.
6. **Web:** frischer Tab, JS-Heap (`performance.memory`), DOMContentLoaded, Ladezeit der Katalogdatei (Netzwerk).
7. **Funktion:** tsc, jest, `npm run test:content-pipeline`, `node --test scripts/*.test.cjs`,
   `content:integrity`; im Emulator Sprachwechsel th → es → de → th, Gesprächs-Reiter mit anderer Sprache,
   deutsche Bedeutung auf einer th-Karte anhören, Neustart im Flugmodus.

Ziele und Abbruchkriterien für Schritt 1 (echter Katalog):
- Start ≤ 840 ms (Basis + 5 %). Bei mehr als 880 ms (+10 %) mit Parsen als Hauptanteil: anhalten und erst 1b
  (kleinere Dateien) oder SQLite prüfen (Abschnitt 11).
- Unknown + Code zusammen mindestens 10 MB unter der Basis.
- Sprachwechsel ≤ 300 ms auf dem Emulator.
- Keine Änderung an Kartenständen: ein Vorher/Nachher-Abzug der Sammlung `cards` ist identisch.

## 11. Verworfene Alternativen

- **Je Sprache ein eigenes JS-Bundle:** Expo 57 und Hermes laden native keine nachgelagerten Bundles
  (Bundle-Splitting gibt es nur auf Web). Verworfen.
- **SQLite als Inhaltsspeicher** (`expo-sqlite` ist im Projekt; `.db` ist ein offiziell unterstützter Asset-Typ;
  es gibt eine synchrone API): skaliert am besten, weil nur abgefragt wird, was ein Bildschirm zeigt. Alle Aufrufer
  arbeiten aber heute mit ganzen Listen, das wäre ein Umbau aller Bildschirme. Das ist die Reserve, falls eine
  Lernsprache trotz 1b/2a über ~20 MB wächst oder das Parsen den Start sprengt.
- **Konfig-Plugin von `expo-asset`:** unterstützt laut v57-Doku kein JSON und keine eigenen Textformate. Nicht nötig.
- **Generierte Dateien einchecken:** jeder Publish brächte ~15 MB neue Git-Objekte. Stattdessen werden sie beim
  Bau erzeugt und per Stempel geprüft.

## 12. Umsetzung (18.10.2026)

Gebaut wie in Abschnitt 4 und 5 beschrieben, mit E1–E4 wie empfohlen (Gesprächs-Reiter mit eigener Sprachwahl,
Fortgeschritten/Profi eingebettet, kein 2b). Abweichungen und Befunde:

- **Dateien:** `assets/catalog/<lang>.catalog` (Basis ohne die Übersetzungen der 20 App-Sprachen, Hörclips als
  Tabelle `[id, Sprache, Datei, Status, Tonstatus]`) und `<lang>-<ui>.catalog` je App-Sprache, zusammen 84 Dateien.
  Bindestrich statt Punkt im Namen, damit Metro keinen Plattform- oder Skalierungszusatz herausliest.
  `src/content/catalog-files.ts` ist erzeugt (`--write-map`), ein Test vergleicht sie mit dem Erzeuger.
- **Zuordnung der Clips:** Jede Lernsprache bekommt alle eigenen Clips plus die fremden aus `planDeliveryAudio`
  (deutsche Bedeutungen). So bleiben auch Clips erreichbar, die heute kein Plan nennt (etwa künftige Zahlwörter).
- **Laufzeit:** `catalog-state.ts` bleibt frei von Expo/React Native (die Node-Werkzeuge laden es über
  `domain.cjs`); Laden und Halten liegen in `catalog-languages.ts`, die Ein-/Ausgabe in `catalog-loader.ts`.
  Zwischenspeicher hängen an `catalogRevision()` statt an der Objektidentität.
- **Höchstens zwei Sprachen** bleiben geladen; was ein Bildschirm hält oder gerade angefragt wird, wird nie
  entladen (ein Test fand den Fall, dass sonst ausgerechnet die angefragte dritte Sprache entladen wurde).
- **Anker:** Alle Sitzungen laufen über `directionForBridge(App-Sprache, …)`, der Anker ist also immer die
  App-Sprache. Geladen werden deshalb App-Sprache und Englisch; ein Anker-Teil zusätzlich ist nicht nötig.
- **App-Sprachwechsel:** `I18nProvider` bekommt `prepare`; `_layout.tsx` gibt `setCatalogUiLanguage` hinein. Die
  Oberfläche schaltet erst um, wenn die Übersetzungsteile der geladenen Sprachen da sind (an Ort und Stelle in die
  Dokumente gelegt, danach neuer Katalogstand).
- **Fortschritts-Reiter** wartet jetzt auf das Profil, statt mit `de_to_th` vorzuladen (lud sonst kurz Thai).
- **`ensureCardStates`** lädt seine Sprache selbst nach — ein Netz für jeden Weg, der vor einer Sitzung nicht lädt.
- **verify-production** prüft, dass alle Sprachdateien eines Exports aus einem Katalogstand stammen und zu
  `catalog.json` passen.
- **Messbedingungen:** Die absoluten Startzeiten schwankten zwischen Emulator-Starts um fast den Faktor 2, und die
  ersten Minuten nach einem Boot sind langsamer. Gültig sind nur Vergleiche innerhalb eines Starts; die Basis wurde
  am Ende der Reihe wiederholt (1.741 → 1.735 ms, keine Drift). Der Vorher-Stand wurde mit einer vorübergehenden,
  nicht eingecheckten Umleitung im Transformer gebaut (schlanker Katalog als Modul wie bis 03d229e4).

### Ergebnis gegen die Ziele aus Abschnitt 10

| Ziel (Schritt 1, echter Katalog) | Ergebnis |
|---|---|
| Start ≤ Basis + 5 % | 1.741 → 1.109 ms (−36 %), mit 1b 1.074 ms |
| Unknown + Code ≥ 10 MB unter der Basis | 127,1 → 114,4 MB (−12,7 MB), mit 1b 112,5 MB (−14,6 MB) |
| Sprachwechsel ≤ 300 ms | th → es 66 ms |
| Kartenstände unverändert | lesende Fällig-Zahlen legen keine Karten an (Test); Ladeweg berührt `cards` nicht |

Zukunftskatalog (synthetisch, ~65 MB schlank): Start 2.732 → 1.298 ms, PSS 404 → 259 MB, Heap 121 → 45 MB, Code
130 → 76 MB; Web-Heap 205 → 31 MB. Nach 1b liegt der Heap einer Lernsprache mit dem großen Lauf nur 8 MB über
dem heutigen. Schritt 2a ist für den Speicher damit nicht dringend; sinnvoll wird er, wenn der Profi-Bestand weit
über die Annahmen wächst. Die Spitze beim Start (dumpsys im Sekundentakt) liegt in den geteilten Fassungen etwas
höher als der eingeschwungene Wert (Text und Objektgraph gleichzeitig), mit 1b synthetisch 379 MB gegen 410 MB
auf dem heutigen Weg.

## Anhang A: Messskript

Aus der Messnotiz übernommen (`measure.sh <apk> <label> [runs]`) und um Unknown/Code und die `[catalog]`-Zeilen
erweitert. Beim Bau von Schritt 1 als `scripts/measure-android-start.sh` einchecken.

```bash
#!/usr/bin/env bash
# measure-android-start.sh <apk> <label> [runs]
# Kaltstart (Prozess neu, Seitencache warm) und Speicher der App im Emulator.
set -u
APK=$1; LABEL=$2; RUNS=${3:-12}
ADB="$HOME/Android/Sdk/platform-tools/adb"
PKG=com.thailernbegleiter.app
ACT=$PKG/.MainActivity
DIR=${OUT_DIR:-$(dirname "$0")/../measurements}
mkdir -p "$DIR"; OUT=$DIR/measure-$LABEL.txt
: > "$OUT"
$ADB install -r "$APK" >/dev/null || { echo "install failed"; exit 1; }
$ADB logcat -c
# Aufwärmen: erster Start nach Installation (Dex-Optimierung, Datenbank, Kopie aus res/raw)
$ADB shell am force-stop $PKG; sleep 2
$ADB shell am start -W -n $ACT >/dev/null; sleep 20
$ADB logcat -d -s 'ReactNativeJS:*' | grep '\[catalog\]' | sed 's/^/first-start /' >> "$OUT"
for i in $(seq 1 "$RUNS"); do
  $ADB shell am force-stop $PKG; sleep 3
  $ADB logcat -c
  T=$($ADB shell am start -W -n $ACT | tr -d '\r' | awk -F': ' '/TotalTime/{print $2}')
  sleep 15
  M=$($ADB shell dumpsys meminfo $PKG | tr -d '\r')
  PSS=$(echo "$M" | awk '/TOTAL PSS:/{print $3; exit} /^ *TOTAL /{print $2; exit}')
  UNK=$(echo "$M" | awk '/^ *Unknown/{print $2; exit}')
  CODE=$(echo "$M" | awk '/^ *Code:/{print $2; exit}')
  CAT=$($ADB logcat -d -s 'ReactNativeJS:*' | grep -o '\[catalog\].*' | tr '\n' ' ')
  echo "run=$i totalTimeMs=$T pssKB=$PSS unknownKB=$UNK codeKB=$CODE $CAT" | tee -a "$OUT"
done
echo "$M" > "$DIR/meminfo-$LABEL.txt"
$ADB logcat -d -b crash | tail -20 > "$DIR/crash-$LABEL.txt"
grep '^run=' "$OUT" | awk -F'[ =]' '{t[NR]=$4; p[NR]=$6; u[NR]=$8; c[NR]=$10}
  END {n=asort(t); asort(p); asort(u); asort(c); m=int((n+1)/2);
  print "median totalTimeMs=" t[m] " pssKB=" p[m] " unknownKB=" u[m] " codeKB=" c[m] " (n=" n ")"}' | tee -a "$OUT"
```
