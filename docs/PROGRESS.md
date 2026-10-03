# Thai ↔ Deutsch Lernbegleiter — Fortschrittsprotokoll

> **Dieses Dokument ist die Übergabe zwischen Sessions.**
> Zu Beginn JEDER Session zuerst vollständig lesen, dann den tatsächlichen
> Repo-Zustand gegen den hier protokollierten Stand prüfen (siehe
> „Verifikationsbefehle"), Abweichungen dokumentieren — erst danach
> weiterarbeiten. Einträge werden **angehängt**, nie überschrieben.
> Maschinenlesbarer Kurzstand: `.agent/state.json`.

---

## Schnellstart — aktuellen Stand ansehen

```bash
npx expo start
```

Danach im Terminal:

| Taste / Aktion | Ergebnis |
| --- | --- |
| `w` | Öffnet die App im Browser (http://localhost:8081) |
| QR-Code scannen | Öffnet die App in **Expo Go** auf dem Handy (PC und Handy müssen im selben WLAN sein) |
| `a` | Startet den Android-Emulator (falls installiert) |
| `r` | Neu laden |

Nur Web, ohne Menü:

```bash
npx expo start --web
```

## Verifikationsbefehle (Ist-Zustand prüfen)

```bash
npx tsc --noEmit
```

```bash
npm test
```

> **Hinweis:** `expo-env.d.ts` steht (wie im Expo-Template vorgesehen) in
> `.gitignore` und wird von Expo generiert. In einem frisch geklonten
> Arbeitsverzeichnis meldet `npx tsc --noEmit` deshalb zwei Fehler zu
> `*.module.css` und `@/global.css`, bis der Dev-Server einmal gelaufen ist.
> Erst `npx expo start` ausführen, dann typprüfen.

---

## Architekturentscheidungen

### AE-1 — Expo (React Native) + TypeScript

**Entscheidung:** Expo SDK 57, TypeScript, `expo-router` (dateibasiertes Routing).

**Begründung:** Eine Codebasis für Web, iOS und Android; Entwicklung und Test
vollständig unter Windows möglich (Browser + Expo Go); iOS-Builds später über
EAS Build auf Expos Mac-Cloud, kein eigener Mac nötig. Die bereits geprüfte
FSRS-Logik aus dem Referenzprototyp lässt sich unverändert in TypeScript
weiterverwenden.

### AE-2 — Vorhandenes Git-Repo weiterverwendet statt neu angelegt

**Entscheidung:** Das Verzeichnis `my-app/` enthielt einen abgebrochenen
`create-expo-app`-Lauf: ein Git-Repo **ohne einen einzigen Commit**, dessen
Template-Dateien alle im Index als gelöscht markiert waren, und keine einzige
Datei auf der Platte. Das `.git`-Verzeichnis wurde in den Projekt-Root
verschoben, der Index mit `git reset` geleert, das leere `my-app/` entfernt.

**Begründung:** Es ging keine Arbeit verloren (keine Commits, keine Dateien);
gleichzeitig wurde ein verschachteltes zweites Repo im Projekt vermieden.
Das Scaffold liegt jetzt direkt im Projekt-Root, `PROGRESS.md` also ebenfalls.

### AE-3 — `expo-sqlite` ist auf Web **nicht** verlässlich → Persistenz-Abstraktion

**Entscheidung:** Persistenz wird hinter eine eigene Abstraktionsschicht
gekapselt. Nativ (iOS/Android) → `expo-sqlite`. Web → JSON-Blobs über
`@react-native-async-storage/async-storage`. Die Geschäftslogik kennt nur die
Abstraktion und erfährt vom Unterschied nichts.

**Begründung — selbst geprüft, nicht aus Trainingswissen übernommen:** Der
Web-Pfad von `expo-sqlite@57.0.2` läuft über wa-sqlite in einem Web Worker.
`node_modules/expo-sqlite/web/WorkerChannel.ts` legt dafür `new SharedArrayBuffer(4)`
und `new SharedArrayBuffer(1024 * 1024)` an und synchronisiert über
`Atomics.wait` / `Atomics.load`. `SharedArrayBuffer` ist im Browser nur bei
**Cross-Origin-Isolation** verfügbar, also nur mit den Response-Headern
`Cross-Origin-Opener-Policy: same-origin` und
`Cross-Origin-Embedder-Policy: require-corp`. Der Dev-Server von
`expo start --web` setzt diese Header nicht, und ein statischer Web-Export
(Phase 8) hätte sie auf fremdem Hosting erst recht nicht — in einem
WordPress-`iframe` schon gar nicht. Damit ist der SQLite-Web-Pfad für dieses
Projekt untauglich.

### AE-4 — Navigation als Plattform-Split statt eines gemeinsamen Layouts

**Entscheidung:** `src/components/app-tabs.tsx` (nativ) rendert eine
Bottom-Tab-Leiste, `src/components/app-tabs.web.tsx` eine Top-Navigationsleiste.
Metro wählt die Datei automatisch nach Plattform.

**Begründung:** Phase 3 verlangt ausdrücklich ein Layout, das auch im breiten
Browser-Fenster gut aussieht und kein reines Phone-Layout ist. Eine
Bottom-Tab-Leiste am unteren Rand eines 1920px-Desktops wirkt fehl am Platz.
Das Muster stammt aus dem Expo-Default-Template und wurde auf fünf Bereiche
erweitert. Nativ wurde dabei vom `NativeTabs` des Templates (in `expo-router`
als *unstable* markiert) auf das stabile `Tabs` gewechselt.

### AE-5 — `expo-audio` statt `expo-av`

**Entscheidung:** Für vorproduzierte Audioclips wird `expo-audio` verwendet.

**Begründung:** `expo-av` ist in aktuellen SDKs zugunsten von `expo-audio` und
`expo-video` abgelöst; `npx expo install expo-audio` liefert unter SDK 57 die
passende Version (57.0.4). `expo-speech` bleibt der plattformübergreifende
TTS-Fallback.

### AE-6 — Dokumentspeicher statt relationalem Schema

**Entscheidung:** Die Persistenz-Abstraktion arbeitet mit `Sammlung + ID +
JSON-Wert` statt mit Tabellen je Datentyp.

**Begründung:** Dieselbe schmale Schnittstelle lässt sich verlustfrei auf eine
SQLite-Tabelle **und** auf JSON-Blobs in AsyncStorage abbilden. Eine gemeinsame
Vertragsprüfung läuft gegen beide Backends, damit sie sich nicht
auseinanderentwickeln.

### AE-7 — `syllables` ergänzt, weil ein einzelnes `tone`-Feld mehrsilbige Wörter nicht abbildet

**Entscheidung:** `VocabEntry` bekommt zusätzlich
`syllables: { roman: string; tone: Tone }[]`. Das Feld `tone` aus der
Datenmodell-Skizze bleibt erhalten und trägt den Ton der **ersten** Silbe — bei
einsilbigen Wörtern also den Ton des Wortes.

**Begründung:** Thai vergibt den Ton **je Silbe**, nicht je Wort. Ein einzelnes
`tone`-Feld zwingt bei mehrsilbigen Wörtern zu einer Angabe, die schlicht falsch
ist. สวัสดี ist der Beleg: der Referenzprototyp führte es pauschal als „mid",
tatsächlich ist es `sà-wàt-dii` — **tief-tief-mittel**. Ohne `syllables` könnte
die Tonfarbcodierung in Phase 3 mehrsilbige Wörter nur falsch einfärben, und
genau die Farbcodierung ist ein Kernversprechen der App. Die Struktur der
Skizze bleibt gewahrt, sie wird nur dort präzisiert, wo sie die Sprache nicht
abbildet.

### AE-8 — Silbenfarben stehen an der Umschrift, die Thai-Schrift wird nur einfarbig gefärbt

**Entscheidung:** Jede Silbe der **Umschrift** bekommt die Farbe ihres eigenen
Tons plus die passende Konturglyphe. Die **Thai-Schrift** wird nur dann
eingefärbt, wenn alle Silben denselben Ton haben; sonst bleibt sie in der
normalen Textfarbe.

**Begründung:** Die Daten kennen den Ton je Silbe, aber keine verlässliche
**Silbengrenze in der Thai-Schrift** — Thai setzt zwischen Silben keine
Trennzeichen. Ein naives Aufteilen wäre geraten, und ผลไม้ (`pǒn-lá-máai`)
zeigt, warum das schiefgeht: das Wort hat drei Silben, aber die mittlere
entsteht aus einem Bindekonsonanten, den beide Nachbarn teilen — eine
Zeichenkette lässt sich hier gar nicht in drei saubere Stücke schneiden. Eine
Einfärbung der Thai-Schrift nach dem Ton der ersten Silbe würde bei สวัสดี über
zwei Drittel des Wortes die Unwahrheit sagen. Lieber neutral als falsch.

Wer die Thai-Schrift später doch silbenweise färben will, braucht ein
zusätzliches, **geprüftes** Feld mit den Schriftsilben — nicht eine Heuristik
zur Laufzeit.

### AE-9 — Tagesprotokoll statt Näherung aus `lastReview`

**Entscheidung:** Neue Sammlung `reviewLog` mit **einem Dokument je
Kalendertag** (nicht je Ereignis), fortgeschrieben von `rateCard`.

**Begründung:** `FSRSCardState` hält nur `lastReview` — den *letzten*
Zeitpunkt je Karte. Wer eine Karte heute zum zehnten Mal wiederholt,
überschreibt jede Spur der neun vorherigen Male. Eine „Wiederholungen pro
Tag"-Statistik aus `lastReview` wäre deshalb keine Historie, sondern nur eine
Momentaufnahme — und würde als Historie gelesen. Ein Dokument je Tag hält den
Speicher beschränkt (365 im Jahr statt beliebig vieler Ereignisse) und reicht
für die Auswertung nach Tagen genau aus. Einzelereignisse mit Zeitstempel
gehen verloren; für eine Tagesauswertung ist das kein Verlust.

**Einschränkung, die im UI steht und nicht nur hier:** Die Historie beginnt
mit der Einführung des Protokolls. Frühere Wiederholungen fehlen, weil sie nie
festgehalten wurden. Beim Testen war das direkt zu sehen — 8 bewertete Karten,
aber nur 5 protokolliert; die drei anderen stammten aus Phase-3-Tests.

Tagesschlüssel bewusst in **lokaler** Zeit: mit `toISOString()` läge der
Tageswechsel in Thailand (UTC+7) mitten am Abend.

### AE-10 — API-Schlüssel: Keychain nativ, nur Arbeitsspeicher im Browser

**Entscheidung:** Nativ über `expo-secure-store`; im Web wird der Schlüssel
**nur für die laufende Sitzung im Arbeitsspeicher** gehalten und nach dem
Neuladen erneut abgefragt. Die Weiche stellt `isAvailableAsync()` zur
Laufzeit, nicht `Platform.OS`.

**Begründung — im Paket nachgesehen, nicht angenommen:** Die Web-Variante von
`expo-secure-store@57.0.2` ist `src/ExpoSecureStore.web.ts` mit dem
vollständigen Inhalt `export default {}`. Es gibt dort also **keinerlei**
Implementierung; `isAvailableAsync()` prüft `!!ExpoSecureStore.getValueWithKeyAsync`
und liefert im Browser `false`, ein `setItemAsync` liefe in „is not a
function". Die naheliegende Notlösung `localStorage` wurde verworfen: sie wäre
für jedes Skript derselben Herkunft lesbar und bliebe dauerhaft liegen — für
einen Schlüssel, der echtes Geld ausgibt, ein schlechter Tausch gegen etwas
Bequemlichkeit, und beim späteren WordPress-Einbau (Phase 8) noch schlechter.
Erneutes Eintippen bei Bedarf ist zumutbar: der Schlüssel wird nur für
Generierungsläufe gebraucht, nicht zum Lernen.

### AE-11 — `direction` benennt die Sprache, die aktiv produziert wird

**Entscheidung:** `direction` einer `ConversationSituation` sagt, welche
Sprache die lernende Person **hervorbringt** — deckungsgleich mit der schon
etablierten `Direction` aus dem FSRS-Modul (`de_to_th` = Deutsch verstehen,
Thai produzieren). Es gibt daher **zwei getrennte Sätze** von Situationen, je
Richtung eigene. Innerhalb eines Dialogs markiert `speaker: 'learner'` die zu
übenden Zeilen, `partner` die vorgegebene Gegenseite.

**Begründung:** Die Alternative — ein Satz Dialoge, bei dem je nach Richtung
die andere Seite verdeckt wird — spart Generierungskosten und macht das
Material für eine der beiden Zielgruppen unbrauchbar. Ein Deutscher, der Thai
lernt, übt auf einem Markt in Bangkok; ein Thailänder, der Deutsch lernt, übt
beim Bäcker oder auf dem Amt. Vor allem aber sind die **Korrektur-Hinweise**
richtungsspezifisch: Töne, Vokallänge und Klassifikatoren auf der einen Seite,
Artikel, Kasus und Verbstellung auf der anderen. Ein gespiegelter Dialog
könnte höchstens einen der beiden Sätze Hinweise tragen — der andere fiele weg
oder wäre falsch. Das ist dieselbe Überlegung wie in Phase 6 des Plans:
Bidirektionalität ist kein Karten-Flip.

### AE-12 — Offizieller Anthropic-SDK statt eigenem `fetch`, mit angepasster Metro-Auflösung

**Entscheidung:** `@anthropic-ai/sdk` mit `dangerouslyAllowBrowser: true`,
dazu eine `metro.config.js`, die `unstable_enablePackageExports` und die
Bedingungsnamen `require`/`import`/`default`/`browser` setzt.

**Begründung:** Ohne diese Konfiguration bricht der Web-Build mit
`Unable to resolve module ./lib/credentials/types.js` ab — die `exports`-Map
des SDK führt für `./lib/*` nur die Bedingungen `import` und `require`, kein
`default`, und Metros Standardauflösung greift daneben. Die Datei existiert
sehr wohl; es war reines Auflösungsverhalten. Mit der Anpassung bündelt der
SDK sauber, was einen handgeschriebenen HTTP-Client überflüssig macht.
`dangerouslyAllowBrowser: true` setzt dabei **genau** den Header
`anthropic-dangerous-direct-browser-access: true` — im SDK-Quelltext
nachgesehen (`client.js`), nicht angenommen.

### AE-13 — Bildanbieter: Stability AI, weil OpenAI im Browser gar nicht erst antwortet

**Entscheidung:** Bilder kommen von **Stability AI**
(`POST https://api.stability.ai/v2beta/stable-image/generate/core`), angesprochen
mit einem selbst geschriebenen `fetch` statt mit einem SDK.

**Begründung — im Browser gemessen, nicht angenommen:** Die Anthropic-API aus
Phase 4 erzeugt keine Bilder, es musste also ein zweiter Anbieter her. Gesetzt
war zuerst OpenAI Images, dem Muster von AE-12 folgend: offizieller SDK,
`dangerouslyAllowBrowser: true`. Im installierten Paket `openai@7.8.0` zeigte
sich der entscheidende Unterschied — dieser Schalter setzt **keinen Header**.
In `client.js` steht nur

```js
if (!options.dangerouslyAllowBrowser && isRunningInBrowserOrBrowserWorker())
    throw new Errors.OpenAIError("It looks like you're running in a browser…")
```

Es ist also eine reine Selbstsperre des SDK, keine Gegenstelle wie
`anthropic-dangerous-direct-browser-access`. Ob der Browser durchkommt,
entscheidet damit allein CORS auf Anbieterseite. Aus dem laufenden Web-Build
gemessen:

| Anfrage | Ergebnis |
| --- | --- |
| `GET api.openai.com/v1/models` | HTTP 401, lesbar |
| `POST api.openai.com/v1/images/generations` | `TypeError: Failed to fetch` |
| `POST api.openai.com/v1/chat/completions` | `TypeError: Failed to fetch` |
| `POST api.stability.ai/v2beta/stable-image/generate/core` | HTTP 401, lesbar |
| `POST generativelanguage.googleapis.com/…:generateContent` | HTTP 400, lesbar |

Die Konsole nennt den Grund beim Namen: *„blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present on the requested resource."*
Zur Kontrolle lief in derselben Sitzung die Messung aus Phase 4 noch einmal:
`api.anthropic.com` antwortete **mit** dem Header aus AE-12 mit 401 und **ohne**
ihn mit „Failed to fetch". Das Netz war also offen und die Messung
aussagekräftig; OpenAI lässt Browsern **GET** durch, **POST** nicht. Damit ist
OpenAI Images für den Web-Build unbrauchbar — und der Web-Build ist derzeit die
einzige Umgebung, in der überhaupt geprüft werden kann, weil der Gerätecheck
(B-2) aussteht.

**Warum Stability und nicht Google:** Beide kommen durch CORS. Der Unterschied
liegt darin, was sich **ohne gültigen Schlüssel** noch belegen lässt. Google
antwortet auf ein erfundenes Modell mit derselben Meldung wie auf einen
falschen Schlüssel (`API key not valid`) — ob der Modellname stimmt, bliebe
also bis zum ersten bezahlten Aufruf offen. Genau dieses Risiko hat Phase 4
beim Antwortformat bewusst vermieden. Stability prüft dagegen Pflichtfelder und
Aufzählungswerte **vor** der Authentifizierung und verrät die erlaubten Werte
selbst:

| Gesendet | Antwort der API |
| --- | --- |
| `output_format: "tiff"` | 400 — „Expected 'png' \| 'jpeg' \| 'webp'" |
| `aspect_ratio: "3:7"` | 400 — „Expected '21:9' \| '16:9' \| '3:2' \| '5:4' \| '1:1' \| …" |
| ohne `prompt` | 400 — „prompt: required" |
| `seed: "abc"` | 400 — „expected number, received string" |
| vollständige, gültige Anfrage | 401 — „authorization: invalid or missing header value" |
| falscher Pfad | 404 |

Die Anfrageform steht damit vollständig fest, und das 401 belegt zugleich, dass
es den Endpunkt gibt. Offen bleibt allein der Schlüssel — dieselbe Lage wie am
Ende von Phase 4.

**Warum kein SDK, anders als in AE-12:** Für Stability gibt es **keinen**
offiziellen JavaScript-SDK — nachgesehen: `stability-sdk` ist Python, auf npm
findet sich nur ein Paket eines Einzelentwicklers von 2024. Eine
multipart-Anfrage von zwanzig Zeilen selbst zu schreiben ist die kleinere
Abhängigkeit als ein fremdgepflegter Node-SDK im Browser-Bundle. Der zunächst
installierte `openai`-SDK wurde wieder entfernt.

**Was sich nicht ohne Schlüssel belegen ließ:** die **Antwort**form. Der Parser
verlangt deshalb streng ein Feld `image` und nennt im Fehlerfall die
tatsächlich gelieferten Feldnamen — heißt das Feld eines Tages anders, steht
das sofort in der Fehlerliste des Laufs, statt als Rätsel zu enden.

**Schlüsselablage** folgt unverändert AE-10: nativ Keychain, im Web nur
Arbeitsspeicher für die Sitzung. Neu ist lediglich, dass `api-key.ts` jetzt
**zwei** Schlüssel getrennt hält (`anthropic`, `stability`) — die beiden Läufe
sind unabhängig, und niemand soll einen Schlüssel eintippen, den er nicht
braucht.

### AE-14 — Bilder: Metadaten in den Dokumentspeicher, Bytes in eine eigene Ablage

**Entscheidung:** Der Dokumentspeicher aus AE-6 bekommt eine neue Sammlung
`images`, die aber **nur Metadaten** trägt (Format, Größe, Modell, Prompt,
Zeitpunkt, `blobKey`). Die Bilddaten liegen in einer eigenen, ebenfalls
plattformgeteilten Ablage: nativ eine Datei je Bild über `expo-file-system`,
im Web ein Eintrag je Bild in **IndexedDB**.

**Begründung — in den installierten Paketen nachgesehen:**

Base64 im JSON-Wert wäre der einfachere Weg gewesen und scheitert an einer
harten Grenze. Das Web-Backend des Dokumentspeichers schreibt über
`@react-native-async-storage/async-storage`, und dessen Web-Umsetzung ist
`window.localStorage` — in `lib/module/AsyncStorage.js` steht wörtlich
`window.localStorage.setItem(key, value)`. localStorage hat je Herkunft rund
**5 MB, und zwar für alle Sammlungen zusammen**: Vokabeln, Kartenzustände,
Sprachsituationen, Tagesprotokoll. Ein einziges Bild wiegt selbst als
komprimiertes WebP oft über 50 KB, als Base64 ein Drittel mehr. 25 Bilder
sprengen das Budget, die später geplanten ~1000 Vokabeln erst recht. Dazu
kommt: eine Sammlung wird bei jedem Schreibvorgang **komplett** neu
serialisiert, und `getAll('images')` würde jedes Bild in den Speicher holen,
nur um sie zu zählen.

Auf der nativen Seite war die Wahl ähnlich klar: eine SQLite-Zeile je Bild
ginge, aber eine Datei ist das natürliche Format für Bilddaten, und `file.uri`
lässt sich direkt an `<Image>` reichen, ohne dass Base64 durch den
JavaScript-Thread muss. `File.write(inhalt, { encoding: 'base64' })` nimmt die
Antwort der API unverändert entgegen und dekodiert nativ — ein eigener
Base64-Dekodierer in JavaScript ist damit überflüssig. Abgelegt wird unter
`Paths.document`, nicht `Paths.cache`: erzeugte Bilder kosten Geld und gehören
nicht in ein Verzeichnis, das das System bei Speichermangel leeren darf.

**Warum trotzdem eine eigene Abstraktion und nicht einfach `expo-file-system`
überall:** `expo-file-system@57.0.6` hat auf Web **keine** Umsetzung. Die Datei
`src/ExpoFileSystem.web.ts` besteht aus Klassen, deren Konstruktor
`console.warn('expo-file-system is not supported on web')` ruft und die
ansonsten leere Werte liefern; die Expo-Dokumentation zu SDK 57 nennt als
Plattformen nur „Android, iOS, tvOS". Also dasselbe Muster wie bei AE-3: eine
schmale Schnittstelle (`ImageBlobStore`), je Plattform eine Umsetzung, dazu
eine im Arbeitsspeicher für Tests und als Notnagel. Im Web gemessen: die
Anzeige nennt `Ablage indexeddb`, die fünf Testbilder lagen als `nam.webp`,
`khaao.webp`, … in der IndexedDB, und `localStorage` blieb dabei bei 78 KB —
die Bilder landen also nachweislich nicht dort.

Im Web wird der **Base64-String** abgelegt, nicht ein `Blob`: `<Image>` nimmt
eine `data:`-URL direkt entgegen, während ein Objekt-URL wieder freigegeben
werden müsste und ein vergessenes `revokeObjectURL` die Daten für die ganze
Sitzung im Speicher hielte.

**Reihenfolge beim Schreiben, mit Absicht:** erst die Bilddatei, dann das
Metadaten-Dokument. Bricht es dazwischen ab, fehlt das Dokument, der Eintrag
gilt als „nicht vorhanden" und wird sauber neu erzeugt. Andersherum entstünde
eine Karteileiche: ein Dokument ohne Datei, das jeder weitere Lauf überspringen
würde, während die Karte für immer leer bliebe. Deshalb prüft `exists` auch
**beides** — Dokument *und* Datei. Beim Löschen gilt die umgekehrte
Reihenfolge, aus demselben Grund.

### AE-15 — Das isConcrete-Tor ist dreifach, nicht einfach

**Entscheidung:** Ob eine Vokabel ein Bild bekommt, wird an drei Stellen
geprüft: beim Bauen des Auftrags (`imageSpecFor`), im Batch-Lauf vor dem
Netzaufruf (`imageTask.produce`) und im API-Client selbst
(`createStabilityImageClient`). Dazu ist `isConcrete` im Auftragstyp ein
**Literaltyp** (`isConcrete: true`), sodass schon der Übersetzer keinen Auftrag
aus einem abstrakten Eintrag bauen lässt.

**Begründung:** Der Nutzen von Bildern beim Vokabellernen (Dual-Coding,
Picture-Superiority) hängt daran, dass das Bild den Begriff **trifft**. Für
„nicht", „ครับ" oder „vielleicht" gibt es kein solches Bild; was ein Modell
dazu malt, ist bestenfalls Dekoration und schlimmstenfalls eine falsche
Merkhilfe neben sorgfältig geprüften Vokabeln. Eine einzelne Sperre wird
irgendwann durch einen neuen Aufrufer umgangen — deshalb liegt sie auch
unmittelbar vor dem Aufruf, der Geld kostet. Der Laufzeitcheck holt sich den
Eintrag dabei **neu aus dem Grundstock**, weil ein Auftrag aus dem Speicher
oder aus altem Code seinen Literaltyp längst verloren hat.

**Dazu gehört die Motivliste:** `src/lib/images/motifs.ts` hält je konkreter
Vokabel eine **englische** Motivbeschreibung. Zwei Gründe. Erstens die Sprache:
Bildmodelle sind auf englischen Bildunterschriften trainiert, „das Huhn" als
Prompt wäre ein Glücksspiel. Zweitens — und wichtiger — die Eindeutigkeit: ไก่
ist das *Tier* Huhn, ein Teller Brathähnchen würde als „Hühnerfleisch"
gemerkt; ปลา ist der Fisch im Wasser, nicht das Filet; ร้าน ist laut Quelle
„Stand, Bude" (der Eintrag trägt deshalb `sourceVerified: false`), also ein
Straßenstand und kein Ladengeschäft. Solche Festlegungen gehören ausformuliert
und nachlesbar, nicht in einen Prompt hineingeraten. Die Liste liegt beim
Generator und **nicht** im Vokabel-Grundstock — der bleibt unangetastet, wie im
Skalierungsplan festgehalten. Ein Test hält beide Seiten zusammen: jede
konkrete Vokabel braucht ein Motiv, und ein Motiv ohne passende Vokabel fliegt
auf.

### AE-16 — Übungen laufen **nicht** durch FSRS, wählen ihre Aufgaben aber daraus

**Entscheidung:** Die Übungstypen aus Phase 6 legen **keine** eigenen
FSRS-Karten an und schreiben **keine** Bewertung zurück. Sie sind ein
Übungsmodus ohne Wiederholungsplanung. Aber sie sind auch nicht blind: welche
Vokabeln drankommen, entscheidet der **vorhandene** FSRS-Zustand derselben
Richtung — am schwächsten Sitzendes zuerst, dieselbe Sortierung, die auch
`buildReviewQueue` benutzt. Beantwortete Aufgaben werden im Tagesprotokoll
**getrennt** mitgezählt (`drills`, `drillsCorrect`).

**Begründung — drei Gründe, der zweite ist der wichtigste:**

1. **FSRS modelliert eine Erinnerungsspur je Item.** Der Artikel von „das
   Haus" ist keine eigene Erinnerung neben der Vokabel — er steht schon auf
   der `th_to_de`-Karte im deutschen Stichwort. Zwei getrennte Zeitpläne für
   dieselbe Tatsache anzulegen, hieße dieselbe Sache zweimal mit
   auseinanderlaufenden Intervallen abzufragen. Genau das will Spaced
   Repetition vermeiden.
2. **Die Bewertungsskala passt nicht zum Aufgabentyp.** „Nochmal / Schwer /
   Gut / Leicht" ist eine **Selbsteinschätzung des Abrufs**. Eine
   Auswahlübung liefert nur richtig/falsch — und dazu eine Ratequote von 33 %
   (drei Artikel) bzw. 20 % (fünf Töne). Ein geratenes Richtig als „Gut" in die
   Stabilitätsformel zu geben, verlängert das Intervall für etwas, das gar
   nicht abgerufen wurde. Der Schaden wäre unsichtbar und würde sich über
   Monate aufbauen — dieselbe Überlegung, aus der in Phase 2 ein falscher Ton
   als „teuer" eingestuft wurde.
3. **Der Kartenschlüssel ist `vocabId:direction`.** Ein dritter Schlüsselteil
   für den Übungstyp würde `cardKey`, `loadCardStatesForDirection`, das
   Dashboard und die Statistik anfassen. Im Dashboard stünde dann „252 Karten
   fällig", ohne dass erkennbar wäre, was davon Vokabeln sind.

**Was die Übungen dafür sehr wohl tun:** Sie ziehen aus einem **Fenster** der
schwächsten Kandidaten (dreimal so groß wie die Runde) zufällig. Stur die
schwächsten zu nehmen ginge nicht, denn eine Übungsantwort ändert den
Kartenzustand ja bewusst nicht — bei jedem Start käme dieselbe Liste heraus.
So bleibt der Schwerpunkt auf dem Wackligen, ohne dass sich die Sitzung
wörtlich wiederholt.

**Folge für die Statistik:** Übungen zählen **nicht** in `total` — das Feld
heißt im UI „Wiederholungen", und eine Auswahlübung ist keine. Das Diagramm
stapelt beide Reihen in zwei Farben mit Legende. Für die **Lernserie** zählen
Übungen dagegen mit: Wer einen Abend lang Töne gehört hat, hat gelernt; die
Serie über eine Rechenentscheidung zur Wiederholungsplanung zerbrechen zu
lassen, wäre nicht nachvollziehbar.

**Wenn sich das ändern soll:** Der saubere Weg wäre nicht ein zweiter
Kartensatz, sondern ein Aufgabentyp mit **freier Eingabe** statt Auswahl (Wort
tippen, Artikel schreiben). Dann gäbe es kein Rateproblem, und die Antwort
wäre ein echter Abruf. Das ist eine eigene Entscheidung für später, keine
Nachlässigkeit hier.

### AE-17 — Standard-Lernrichtung im Profil, ausdrücklich gesetzt und jederzeit änderbar

**Entscheidung:** Es gibt eine Standard-Lernrichtung im Lernprofil (Sammlung
`meta`, Dokument `profile`). Sie wird **nur auf ausdrückliche Anweisung**
gesetzt („☆ Als Standard merken" im Lernen-Reiter, oder in den Einstellungen),
ist überall sichtbar, wo sie wirkt, und lässt sich an derselben Stelle wieder
aufheben. Ohne Standard fragt die App wie bisher bei jeder Sitzung.

**Begründung:** Die App bedient zwei getrennte Zielgruppen. Für die meisten
Menschen ist die Lernrichtung eine Eigenschaft der Person und keine
Entscheidung je Sitzung — wer Thai lernt, lernt beim nächsten Mal wieder Thai.
Jedes Mal neu zu wählen ist Reibung mit vorhersehbarer Antwort.

**Warum nicht automatisch aus der letzten Wahl:** Bidirektionalität ist ein
Kernversprechen (AE-11) — dieselbe Person kann beide Richtungen lernen, und
ein Gerät kann von zwei Menschen geteilt werden. Die zuletzt gewählte Richtung
still festzuschreiben, würde die App nach einem einzigen Tippen festlegen,
ohne dass jemand das gewollt hätte, und wäre für den Betroffenen kaum als
Ursache erkennbar. Die Auswahl bleibt deshalb auch mit gesetztem Standard über
„Richtung wechseln" erreichbar — sonst wäre der Standard eine Einbahnstraße;
dafür sorgt ein eigener Parameter, nicht das bloße Fehlen der Richtung.

Die Sammlung `meta` ist seit Phase 1 genau dafür vorgesehen („Einstellungen,
Lernprofil, Zähler") und war bis jetzt ungenutzt. Ein Profil aus einer älteren
Version wird nachsichtig gelesen: ein unbekannter Wert ergibt „immer fragen"
statt eines Absturzes oder einer Sperre.

### AE-18 — Die Prüfungsstruktur ist erhoben, nicht erinnert

**Entscheidung:** Das `ExamModule`-Schema bildet ab, was auf den Seiten des
Goethe-Instituts steht — Fertigkeiten, Textsorten, Dauern, Alters- und
Stundenempfehlungen — und trägt an jedem Zertifikat **Quelle und Abrufdatum**,
sichtbar auch im UI.

**Begründung:** Prüfungsformate ändern sich, und aus dem Gedächtnis
aufgeschriebene Formate klingen plausibel, auch wenn sie falsch sind. Zwei
Punkte, die die Recherche gegen die naheliegende Vermutung entschieden hat:

1. **A1 und A2 haben „Prüfungsteile", B1 hat „Module".** Und der Unterschied
   ist keine Wortklauberei: bei B1 „können die vier Module einzeln oder in
   Kombination abgelegt werden", und „die Einzelzeugnisse über vier Module
   entsprechen einem Gesamtzeugnis". Die Seiten benennen das selbst
   unterschiedlich — Überschrift bei A1/A2: „Gar nicht so schwer: die
   Prüfungsteile", bei B1: „Ihr Auftritt, bitte! Die Module". Ein Schema, das
   überall „Module" schreibt, hätte für A1 etwas versprochen, das es dort nicht
   gibt.
2. **Die Dauern folgen keiner Regel.** Lesen dauert bei A1 25 Minuten, bei A2
   „etwa 30", bei B1 65. Schreiben: 20 / „etwa 30" / 60. Das „etwa" steht bei
   A2 an drei von vier Teilen und bei A1 an keinem — deshalb hat `ExamPart` ein
   eigenes Feld `approximate`, statt eine Zahl zu behaupten, wo die Quelle
   ungefähr sagt.

Auch die **Aufgabenformate** sind nicht ausgedacht, sondern im Einstufungstest
(`goethe.de/lrn/pro/30-item/`) Aufgabe für Aufgabe durchgeklickt: Auswahl mit
drei Möglichkeiten, Richtig/Falsch, Zuordnung, Lückentext. Die vollständige
Beobachtung steht im Protokolleintrag zu Phase 7.

### AE-19 — Das Prüfungsmodul ist einseitig, und das steht in der App

**Entscheidung:** Das Modul richtet sich ausschließlich an `th_to_de` —
Thai-Muttersprachler, die Deutsch lernen. Für `de_to_th` ist **nichts**
hinterlegt. Das Feld `direction` steht trotzdem im Schema.

**Begründung:** Das Goethe-Institut zertifiziert Deutsch. Ein Thai-Gegenstück
gibt es durchaus — die Suche führte auf den **CU-TFL** des Sirindhorn Thai
Language Institute der Chulalongkorn-Universität, der ebenfalls Hören,
Sprechen, Lesen und Schreiben prüft. Gebaut wurde er hier trotzdem nicht, und
zwar aus genau dem Grund, aus dem diese Phase überhaupt mit Recherche beginnt:

- Die **Primärquelle war aus dieser Sitzung nicht erreichbar** (die Navigation
  zu `sti.chula.ac.th` wurde abgelehnt).
- Die Sekundärquellen widersprechen sich in einem Kernpunkt, der ins Schema
  gehört: die eine nennt die fünf Stufen *Basic, Intermediate, Good,
  Excellent, Superior*, die andere *Novice, Intermediate, Advanced, Superior,
  Distinguished*.

Eine Stufenskala aus zwei einander widersprechenden Sekundärquellen
zusammenzusetzen, wäre dasselbe Raten, das die Phasenvorgabe ausdrücklich
verbietet — nur diesmal auf der anderen Seite der App. Also: nichts bauen, den
Grund benennen, und das Schema so lassen, dass ein **recherchierter** CU-TFL
später danebenpasst, ohne dass etwas umgebaut werden muss. Die Einseitigkeit
steht auch im UI, damit niemand sie für ein Versehen hält.

### AE-20 — Lesen und Hören werden bewertet, Schreiben und Sprechen nicht

**Entscheidung:** Aufgaben zu Lesen und Hören werden automatisch ausgewertet.
Schreiben und Sprechen sind Aufgaben mit **Musterlösung und Selbstkontrolle**
(Typ `production`) — sie bekommen keine Punktzahl. Es gibt außerdem
**nirgends eine Bestehensgrenze**.

**Begründung:** Ein freier Text oder eine gesprochene Antwort ließe sich nur
von einem Sprachmodell beurteilen. Dessen Urteil wäre eine ungeprüfte Aussage
über die eigene Prüfungsreife — und die Prüfung kostet Geld, Zeit und hängt in
manchen Fällen an einem Visum. „Deine Antwort reicht für A1" ist eine Auskunft,
für die dieses Projekt keine Grundlage hat. Musterlösung plus Prüfliste sagt
dagegen genau so viel, wie belegbar ist.

Dieselbe Überlegung führt zur fehlenden Bestehensgrenze: wie viele Punkte zum
Bestehen nötig sind, steht in den Durchführungsbestimmungen des
Goethe-Instituts, die hier **nicht** erhoben wurden. Eine ausgedachte Grenze
(„60 % — bestanden!") wäre die plausibel klingende Erfindung, gegen die diese
ganze Phase gerichtet ist. Angezeigt wird deshalb nur, wie viel richtig war,
mit dem Hinweis, dass es eine Übung ist und keine Prüfung.

Aus derselben Entscheidung folgt, was der Generator **nicht** erzeugt: Lese-
und Hörtexte ja, Schreib- und Sprechaufgaben nein — dort wäre die Musterlösung
selbst ungeprüfter Text, an dem sich jemand ausrichtet.

### AE-21 — APK für Testbuilds, AAB nur für den Play Store

**Entscheidung:** Die Profile `development` und `preview` bauen ein **APK**
(`android.buildType: "apk"`), `production` ein **AAB** (`app-bundle`).

**Begründung — in der EAS-Dokumentation nachgesehen:** „AABs can't be installed
directly on your device." Ein AAB ist ein Bündel, aus dem der Play Store erst
gerätespezifische APKs schneidet; auf ein Handy laden lässt es sich nicht. Da
das erklärte Ziel dieser Phase ein **installierbarer** Testbuild ist — und
zwar einer, der den Umweg über Expo Go und damit den Blocker B-2 umgeht —,
wäre ein AAB hier genau das Falsche. Umgekehrt verlangt Google Play für neue
Apps ein AAB, deshalb bleibt `production` dabei.

Beide Testprofile tragen zusätzlich `distribution: "internal"`. Das erzeugt
laut Dokumentation eine teilbare Installationsadresse — der Nutzer bekommt
einen Link aufs Handy statt einer Datei, die er erst irgendwie übertragen muss.

### AE-22 — iOS zuerst als Simulator-Build, weil das ohne Apple-Konto geht

**Entscheidung:** Die Profile `development` und `preview` setzen für iOS
`simulator: true`.

**Begründung:** Der Apple-Signierweg war dem Nutzer schon in Phase 3 zu
aufwendig (B-2), und die Mitgliedschaft im Apple Developer Program kostet
laufend Geld. Die EAS-Dokumentation zu Simulator-Builds sagt dazu wörtlich, ein
solcher Build laufe „without needing to deploy to TestFlight or even having an
**Apple Developer account**". Damit ist genau ein iOS-Weg offen, der ohne
Apple-Konto durch die Mac-Cloud läuft — und das ist der, der in dieser Phase
verlangt war („mindestens ein Durchlauf über EAS").

Was das **nicht** ist: ein Build fürs echte Gerät oder für TestFlight. Dafür
braucht es das Apple Developer Program (99 USD/Jahr laut EAS-Setup-Seite) und
Signierschlüssel, die EAS zwar selbst erzeugen kann, aber erst nach Anmeldung
mit einer Apple-ID. Das bleibt offen und ist als solches benannt.

### AE-23 — Der Web-Export bleibt an der Wurzel; die WordPress-Einbettung ist bewusst nicht gebaut

**Entscheidung:** `npx expo export --platform web` erzeugt einen statischen
Export, der an der **Wurzel** einer Domain oder Subdomain liegt. Eine
WordPress-Einbettung ist **nicht** gebaut — aber der Hebel dafür ist benannt
und der Export so gelassen, dass er ihn nicht verstellt.

**Begründung — im Export nachgemessen, nicht vermutet:** Die erzeugte
`dist/index.html` verweist auf ihre Bündel **absolut**:

```
src="/_expo/static/js/web/entry-367a768a954092aad27cf9af094d407c.js"
href="/favicon.ico"
```

Unter `example.com/lernbegleiter/` abgelegt, würde der Browser diese Dateien
also unter `example.com/_expo/…` suchen und nicht finden. Wer den Export später
in ein Unterverzeichnis legen will, braucht deshalb `experiments.baseUrl` in
`app.json` (z. B. `"baseUrl": "/lernbegleiter"`) und einen **neuen Export** —
die Angabe wirkt zur Exportzeit, nicht zur Laufzeit. Die Dokumentation nennt
dazu einen Haken, der später zählt: `Link` und die `router`-API setzen den
Basispfad selbst davor, ein rohes `<a>` oder die `Linking`-API dagegen nicht.

Warum jetzt trotzdem nichts davon gesetzt wird: Ein `baseUrl` festzulegen,
ohne den Zielpfad zu kennen, macht den Export an jeder anderen Stelle kaputt —
inklusive dem lokalen Ausprobieren. Die Entscheidung „eigene Subdomain oder
Unterverzeichnis" gehört zum Hosting und liegt beim Nutzer. Der Export
funktioniert heute ohne jede Sonderbehandlung; die Umstellung ist später eine
Zeile plus ein erneuter Export.

**Geprüft, nicht angenommen:** Der Export wurde aus einem gewöhnlichen
statischen Server ausgeliefert (kein Dev-Server, kein Metro) und die App lief
vollständig — inklusive Prüfungsmodul und Artikel-Übung, ohne einen einzigen
Konsolenfehler.

### AE-24 — Tonfarben je Anzeigemodus statt einer Farbe je Ton

**Entscheidung:** Jeder Ton hat zwei Farben — eine für den hellen, eine für
den dunklen Modus. Das Feld heißt `colors: { light, dark }` statt `color`, und
die Farbe kommt über `useToneColor()` aus dem aktiven Modus.

**Begründung — gerechnet, nicht geschätzt:** Die einzelne Farbe je Ton stammte
aus dem Referenzprototyp. Nach WCAG 2.1 nachgerechnet verfehlt sie die Stufe AA
**in beiden Modi**:

| Ton | hell: bg / element / selected | dunkel: bg / element / selected |
| --- | --- | --- |
| mittel | 3,80 / 3,35 / 2,91 ✗ | 5,52 / 4,18 / 3,43 ✗ |
| tief | 6,43 / 5,65 / 4,92 ✓ | 3,27 / 2,47 / 2,03 ✗ |
| fallend | 5,67 / 4,98 / 4,34 ✗ | 3,71 / 2,81 / 2,31 ✗ |
| hoch | 3,20 / 2,81 / 2,45 ✗ | 6,56 / 4,97 / 4,09 ✗ |
| steigend | 4,49 / 3,95 / 3,44 ✗ | 4,67 / 3,54 / 2,91 ✗ |

Von 30 Kombinationen bestanden 6. Das ist kein Randfall: Die Umschrift ist
**normaler Text** (also 4,5:1, nicht 3:1), sie ist der Kern der Tonanzeige aus
Phase 3, und sie steht auf drei verschiedenen Untergründen, weil Karten in
Karten liegen. „steigend" im hellen Modus lag mit 4,49 knapp darunter — genau
der Fall, den Schätzen nicht findet.

**Was geändert wurde und was nicht:** Farbton und Sättigung bleiben, nur die
Helligkeit ist je Modus gelöst — sonst wäre „tief" im Dunkelmodus plötzlich
grün und die Tonlegende, die sich jemand eingeprägt hat, hinfällig. Ein Test
prüft das ausdrücklich mit.

Die Umbenennung von `color` zu `colors` war Absicht: So gibt es **keine Stelle
mehr**, an der sich „die" Tonfarbe abgreifen lässt, ohne den Modus zu nennen.
Der Übersetzer hat daraufhin alle 24 Fundstellen gemeldet — genau der Fehler,
der vorher unbemerkt durch die ganze App ging.

Und die Werte stehen als **Test**, nicht als Tabelle im Protokoll: Farben
ändert man im Vorbeigehen, eine Tabelle altert dann still, und niemand merkt
es, bis sich jemand beschwert, dass er die Umschrift nicht lesen kann.

### AE-25 — Dokumente werden auch beim Lesen geprüft, nicht nur beim Schreiben

**Entscheidung:** `loadSituations` und `loadExamModules` prüfen jedes Dokument
(`isValidSituation`, `isValidExamModule`) und lassen aus, was nicht passt.
Ausgelassenes wird **nicht gelöscht**.

**Begründung:** Die Batch-Läufe prüfen die Antwort des Modells streng, bevor
sie speichern — das ist seit Phase 4 getestet. Beim **Lesen** wurde dagegen
blind vertraut, und das ist eine Annahme, die nur bis zur zweiten Version der
App hält. Nachgestellt, bevor etwas geändert wurde:

```
ABSTURZ im Pruefungs-Runner: Cannot read properties of undefined (reading 'map')
ABSTURZ im Gespraechs-Screen: Cannot read properties of undefined (reading 'map')
```

Ein Dokument aus einem älteren Schema, ein von Hand eingespielter Testdatensatz
(in diesem Projekt zweimal vorgekommen) oder ein halb geschriebener Eintrag
hätte also nicht eine Aufgabe fehlen lassen, sondern den ganzen Reiter mit einer
**weißen Seite** beendet.

**Warum nur auslassen, nicht löschen:** Vielleicht kann eine spätere Version
mehr mit dem Dokument anfangen. Stilles Löschen von Nutzerdaten ist die
schlechtere Voreinstellung — eine Meldung in der Konsole nennt die Zahl, damit
ein Schema-Bruch nicht völlig unbemerkt bleibt.

Bewusst **nicht** angefasst wurde, was schon robust ist: der beschädigte
JSON-Blob im Speicher-Backend (Phase 1), die Teilausfälle der Batch-Läufe
(Phase 4/5/7), die stumme Sprachausgabe (Phase 3/6) und das fehlende Bild
(Phase 5) sind seit ihren Phasen getestet.

### AE-26 — Gemini kommt durch CORS, verrät ohne Schlüssel aber nichts

**Entscheidung:** Gemini wird als Textanbieter **und** als Bildanbieter
angeboten, angesprochen mit einem selbst geschriebenen `fetch` gegen
`generativelanguage.googleapis.com/v1beta/models/{modell}:generateContent`, den
Schlüssel im **Header** `x-goog-api-key`.

**Begründung — am 2026-09-03 aus dem laufenden Web-Build gemessen, nach dem
Muster von AE-3/AE-10/AE-12/AE-13:**

| Anfrage | Ergebnis |
| --- | --- |
| `POST …/gemini-2.5-flash:generateContent`, Schlüssel im Header | HTTP 400, lesbar |
| dieselbe Anfrage, Schlüssel als `?key=` | HTTP 400, lesbar |
| `POST …/gemini-2.5-flash-image:generateContent` | HTTP 400, lesbar |
| `POST …/imagen-4.0-generate-001:predict` | HTTP 400, lesbar |
| `GET …/v1beta/models` | HTTP 400, lesbar |
| `POST` ohne das Pflichtfeld `contents` | HTTP 400, lesbar |

Der Netzweg ist also offen — für Text **und** für Bilder, ohne jeden
Sonderheader. Kontrollen in derselben Sitzung: `api.anthropic.com` antwortete
**mit** dem Header aus AE-12 mit 401 und **ohne** ihn mit „Failed to fetch";
zwei Gegenstellen ohne CORS-Header (`example.com`, `goethe.de`) scheiterten
beide. Die CORS-Prüfung des Browsers war also scharf und die Messung
aussagekräftig.

**Schlüssel im Header statt in der URL.** Beide Wege kommen durch — der Header
löst eine Vorabfrage aus, die Google beantwortet. Genommen wird trotzdem der
Header: eine URL landet in Verlaufslisten, Server-Protokollen und
Fehlermeldungen, ein Header nicht. Für einen Schlüssel, der Geld ausgibt, ist
das kein Detail.

**Der Haken, den AE-13 schon benannt hat, ist bestätigt und größer als
gedacht:** Google antwortet mit ungültigem Schlüssel auf **alles** dasselbe —
`API key not valid. Please pass a valid API key.` Auf ein erfundenes Modell, auf
eine Anfrage ohne Pflichtfeld, sogar auf ein `GET` der Modellliste. Damit lässt
sich vor dem ersten bezahlten Aufruf **nichts** belegen: weder die Anfrageform
noch die Antwortform noch die Frage, ob der eingetippte Modellname existiert.
Bei Stability ging genau das, weil dort Pflichtfelder und Aufzählungswerte vor
der Authentifizierung geprüft werden (AE-13). Folgen im Code:

- Die Parser (`parseGeminiText`, `parseGeminiImage`) nennen im Fehlerfall die
  **tatsächlich gelieferten Feldnamen** — dieselbe Vorsichtsmaßnahme wie beim
  Bild-Parser aus AE-13.
- Am Modellfeld steht im UI, dass ein Tippfehler im Modellnamen bei Gemini
  **nicht** vom falschen Schlüssel zu unterscheiden ist.

### AE-27 — Der OpenAI-Blocker aus AE-13 ist echt, aber die Ursache war eine andere

**Entscheidung:** ChatGPT bleibt wählbar, ist im **Web-Build** aber sichtbar als
eingeschränkt gekennzeichnet; nativ gilt die Kennzeichnung nicht.

**Begründung — nachgemessen statt übernommen.** Pflicht 1 dieser Phase lautete,
den bekannten Blocker nicht noch einmal zu „entdecken". Eine Kontrollmessung lief
trotzdem mit, so wie AE-13 seinerzeit Anthropic gegengeprüft hat. Sie widersprach
dem Protokoll:

| Anfrage | Ergebnis |
| --- | --- |
| `POST api.openai.com/v1/chat/completions`, `Authorization: Bearer ungueltig` | HTTP 401, lesbar |
| `POST api.openai.com/v1/images/generations`, derselbe Schlüssel | HTTP 401, lesbar |

Damit sah es zunächst so aus, als hätte OpenAI seine CORS-Haltung geändert —
und genau das stand hier eine Zeit lang. Der erste Lauf des Bildgenerators über
ChatGPT schlug dann aber fünfmal mit `Failed to fetch` fehl, obwohl derselbe
Aufruf aus der Konsole durchkam. Die Ursache wurde eingekreist, nicht geraten:

1. **Verdacht Anmeldedaten.** `credentials: 'include'` erzeugt genau diesen
   Fehler, weil OpenAI `Access-Control-Allow-Origin: *` schickt und ein
   Wildcard für eine Anfrage mit Anmeldedaten nicht gilt. Auf `'omit'` gestellt
   — **änderte nichts**. Der Verdacht war falsch.
2. **Verdacht Anfragekörper.** Den echten, langen Bild-Prompt gegen einen
   kurzen getauscht — **änderte nichts**.
3. **Der Schlüssel war es.** Derselbe Aufruf, nur der Testschlüssel getauscht:

| `Authorization: Bearer …` | Ergebnis |
| --- | --- |
| `ungueltig` | HTTP 401, lesbar |
| `sk-ungueltig` | `Failed to fetch` |
| `sk-UNGUELTIG` | `Failed to fetch` |
| `sk-abcdefghijklmnopqrstuvwxyz012345` | `Failed to fetch` |
| `SK-UNGUELTIG-nur-zum-Testen-0000000000` (groß geschrieben) | HTTP 401, lesbar |
| `xk-UNGUELTIG-nur-zum-Testen-0000000000` | HTTP 401, lesbar |

**Ein POST an OpenAI mit einem Schlüssel, der mit `sk-` beginnt, bekommt eine
Antwort ohne `Access-Control-Allow-Origin`.** Es hängt buchstäblich an diesen
drei Zeichen. Beim **GET** greift die Regel nicht: `GET /v1/models` mit
demselben `sk-`-Schlüssel lieferte ein lesbares 401.

**Damit stimmt die Tabelle aus AE-13 genau — nur die Deutung war zu grob.**
„OpenAI lässt GET durch, POST nicht" war die richtige Beobachtung mit der
falschen Begründung: es ist keine Methodensperre, sondern eine Schlüsselregel,
die GET und POST verschieden trifft. **An der Konsequenz für die App ändert das
nichts**, denn jeder echte OpenAI-Schlüssel beginnt mit `sk-`. Die Entscheidung
von Phase 5 für Stability war also richtig, auch wenn die Begründung zu
korrigieren war.

**Was offen bleibt und als offen benannt ist:** ob ein **gültiger** `sk-`-
Schlüssel die Ausnahme ist. Das ließe sich nur mit einem solchen prüfen, und
fremde Schlüssel gebe ich nicht ein — dieselbe Linie wie bei B-4. Dazu kommt ein
Risiko, das in der Warnung im UI steht: die Vorabfrage trägt den Schlüssel gar
nicht, die eigentliche Anfrage geht also hinaus. Es ist nicht auszuschließen,
dass ein Bild erzeugt und **berechnet** wird, dessen Antwort der Browser danach
verwirft.

**Warum ChatGPT trotzdem wählbar bleibt:** Nativ gibt es kein CORS. Dieselbe
Codebasis läuft auf Android und iOS, und dort ist der Weg offen — belegen lässt
sich das erst am Gerät (B-2). Den Anbieter im Web-Build zu **sperren** hieße,
eine Web-Eigenheit in die nativen Builds zu tragen. Die Warnung steht deshalb
genau dort, wo sie gemessen ist: hinter `Platform.OS === 'web'`.

### AE-28 — Eine Naht für alle Anbieter, an der Stelle, wo sie anbieterfrei ist

**Entscheidung:** Zwei schmale Verträge in `src/lib/providers/`:
`TextClient` („System- und Nutzertext rein, Text raus") und `ImageClient`
(„Prompt rein, Bilddaten raus"). Die bestehenden Umsetzungen für Anthropic und
Stability hängen **dahinter**, nicht daneben. Die Anbieterwahl liegt **je
Generator-Gruppe** getrennt im Dokument `meta/generators`.

**Begründung:** Vor dieser Phase stand der Netzaufruf in jedem Generator neben
Prompt und Parser — dreimal fast dasselbe. Ein dritter Anbieter hätte entweder
eine dritte Kopie bekommen oder jede Prompt-Datei mit einer Anbieterweiche
durchzogen. Die Naht liegt jetzt dort, wo alle drei Textanbieter gleich
aussehen; Prompts, Parser und der Batch-Läufer aus Phase 5 blieben unangetastet.
Ein vierter Anbieter kostet eine Datei und keine Zeile in den Generatoren.

**Was bewusst nicht in den Vertrag wandert:** Temperatur, Werkzeuge, Streaming,
Bildgrößen jenseits des Seitenverhältnisses. Nichts davon wird hier gebraucht,
und ein Vertrag, der jede Fähigkeit jedes Anbieters abbildet, ist keine
Abstraktion mehr, sondern eine Vereinigungsmenge.

**Drei Einstellungen statt einer**, weil es anders gar nicht ginge: Claude
erzeugt keine Bilder, Stability keinen Text. Eine app-weite Anbieterwahl hätte
die einzige sinnvolle Kombination unmöglich gemacht.

**Stability bleibt für Bilder wählbar**, obwohl die Vorgabe „Gemini/ChatGPT/
Claude, kein Provider darüber hinaus" lautet. Der Grund: Claude fällt für Bilder
ganz aus, ChatGPT ist im Web nachweislich unbrauchbar (AE-27), und von Gemini
ließ sich ohne bezahlten Schlüssel **nichts** belegen (AE-26). Die Bild-Gruppe
hätte dann keinen einzigen Anbieter mehr gehabt, dessen Weg tatsächlich gemessen
ist — ein Rückschritt hinter Phase 5. Stability ist kein vierter *neuer*
Anbieter, sondern der Bestand, und das Abnahmekriterium „bestehende
Stability-Generatoren laufen unverändert weiter" wäre ohne ihn sinnlos.
**Das ist eine bewusste Auslegung der Vorgabe und keine Nachlässigkeit — wer es
strikt will, streicht einen Eintrag in `PROVIDER_INFO`.**

**Modellname als Freitext, ohne jede Prüfung** (Pflicht 5). Kein Katalog im
Code: der wäre beim nächsten Modellwechsel falsch, und zwar auf die schlimmste
Art — indem er ein gültiges Modell ablehnt. Ein leeres Feld nimmt den Vorschlag
des Anbieters. Bei Stability füllt der Name den **Pfad** (`…/generate/core`),
bei Gemini ebenfalls (`…/models/{name}:generateContent`) — dort wird er kodiert,
damit ein Tippfehler mit Schrägstrich keine fremde Adresse baut. Ein
Anbieterwechsel zieht den Modellnamen mit: `claude-opus-5` an Gemini zu
schicken ergäbe nur einen Fehlschlag, den niemand mit dem Wechsel in Verbindung
brächte.

**Die Voreinstellungen bleiben, was bisher lief** — Claude für Text, Stability
für Bilder. Ein Umbau, der die Anbieterwahl bringt und dabei still den Standard
verschiebt, wäre eine Falle für alle, die nichts umstellen. Ein Test prüft das
mit, samt der Endpunktadresse aus AE-13.

**Statt eines Aufklappfeldes eine Knopfreihe.** Die Vorgabe sagt „Dropdown".
React Native hat kein plattformweites Aufklappfeld; ein echtes bräuchte eine
neue Abhängigkeit oder eine eigene Umsetzung je Plattform, und `@expo/ui` ist
nativ-only, also im Web-Build — der einzigen bisher prüfbaren Umgebung (B-2) —
nicht zu gebrauchen. Bei drei bis vier Möglichkeiten ist eine Reihe ohnehin die
bessere Bedienung: alles gleichzeitig sichtbar, ein Tipp statt zwei, und es ist
dasselbe Muster wie bei Umfang und Lernrichtung, das Phase 9 bereits auf
Tippziele und Fokus geprüft hat.

**Schlüsselablage** folgt unverändert AE-10 und gilt jetzt für vier Anbieter
statt für zwei. Der Ablagename für Claude bleibt `anthropic-api-key`: er heißt
seit Phase 4 so und liegt auf den Geräten der Nutzer im Keychain. Ihn zur
Sauberkeit umzubenennen, würde einen dort gespeicherten Schlüssel unauffindbar
machen — die App fragte kommentarlos erneut danach, und der alte Eintrag bliebe
für immer liegen. Ein Test hält den Namen fest.

### AE-29 — `aria-checked` wird direkt gesetzt, weil React Native Web es nicht übersetzt

**Entscheidung:** Auswahlknöpfe tragen `accessibilityRole="radio"` **und**
`aria-checked` als eigenes Attribut; sie stehen in einer `ChoiceRow` mit
`radiogroup`. Ein Knopf ohne `selected` bleibt eine gewöhnliche Aktion mit
`role="button"`.

**Begründung — im Web-Build im DOM nachgemessen:** Der bestehende `Button` gab
seinen Zustand über `accessibilityState={{ selected }}` an. Im gerenderten DOM
stand davon **nichts** — weder `aria-selected` noch sonst ein Attribut. Die
gewählte Möglichkeit war nur an ihrer Umrandung zu erkennen: für Sehende
sichtbar, für einen Screenreader unsichtbar. Der zweite Versuch über
`accessibilityRole="radio"` plus `accessibilityState={{ checked }}` erzeugte zwar
`role="radio"`, aber weiterhin kein `aria-checked` — und ein `radio` ohne
`aria-checked` ist schlechter als gar keins, weil die Rolle einen Zustand
verspricht, den niemand abfragen kann. Erst das direkt gesetzte Attribut kam an:
nachgemessen **18 von 18** Auswahlknöpfen mit `aria-checked`, davon genau sieben
auf `true` — einer je Gruppe. Kein Aktionsknopf hat dabei fälschlich eine
Radio-Rolle bekommen.

**Betroffen war nicht nur das Neue.** Umfang (Phase 4) und Standard-Lernrichtung
(Phase 6) hatten dasselbe Problem, seit es sie gibt. Die Prüfung in Phase 9 hat
Beschriftung, Tippziel und Fokus gemessen — den **Zustand** hat sie nicht
gemessen, und deshalb ist er durchgerutscht. Das ist die Lehre daraus: „Label
vorhanden" ist nicht dasselbe wie „Zustand ablesbar".

### AE-30 — Eine Blob-Ablage für Bilder und Hörclips, und der Speicherpreis von Sprache

**Entscheidung:** Die Bildablage aus AE-14 ist zu `src/lib/blobs/`
verallgemeinert: dieselben fünf Operationen, parametrisiert über einen Namen
(`images`, `audio`) und eine MIME-Zuordnung. Hörclips liegen wie Bilder
zweigeteilt — Metadaten in der neuen Sammlung `audio`, Bytes in der Ablage
(nativ `<Dokumente>/audio/`, Web IndexedDB `thai-lernbegleiter-audio`). Der
Name `images` bleibt unverändert, gespeicherte Bilder bleiben also auffindbar.

**Begründung:** Die Bildablage war von Anfang an eine allgemeine
Datei-je-Eintrag-Ablage, nur mit Bild-MIME-Typen und dem Ordnernamen fest
verdrahtet. Sie ein zweites Mal zu schreiben hieße, IndexedDB-Umsetzung,
Dateisystem-Umsetzung und Notnagel im Arbeitsspeicher dreimal zu pflegen —
dieselbe Überlegung wie beim Batch-Läufer (Phase 5) und der Anbieter-Naht
(Phase 10). Alle 21 Bild-Tests liefen nach dem Umbau unverändert.

**Der Speicherpreis — gemessen, wo es ging (Pflicht 3):**

Gemini liefert Sprachausgabe als **rohes PCM, 24 kHz, 16 Bit, mono** (laut
Doku), also **48 000 Byte je Sekunde**, plus 44 Byte WAV-Kopf. OpenAI liefert
mp3; die Bitrate steht nicht in der Doku, 48 kbit/s (6 000 Byte/s) ist die
Größenordnung und als Schätzung gekennzeichnet. Für die **Dauer** je Text gibt
es keine Gemini-Messung (B-6); gemessen wurde an zwei anderen neuronalen
Thai-Stimmen, Dauer aus der dekodierten Wellenform:

| Text | Zeichen | Microsoft Premwadee | Google (translate) |
| --- | --- | --- | --- |
| eine Silbe (มา, ม้า, …) | 2–4 | 1,27–1,63 s | 0,89–0,98 s |
| ผม ไม่ กิน หมู | 11 | 2,04 s | 1,75 s |
| ขอบคุณ มาก ครับ | 13 | 2,02 s | 1,78 s |
| สวัสดีครับ วันนี้อยากได้อะไรครับ | 31 | 3,10 s | 3,84 s |
| ขอข้าวผัดหนึ่งจานครับ ราคาเท่าไหร่ครับ | 37 | 3,41 s | 4,34 s |

Die beiden Stimmen unterscheiden sich fast um den Faktor zwei im Sprechtempo
(≈ 1,5 s + Zeichen/19 gegen ≈ 0,65 s + Zeichen/10), und beide legen um jeden
Clip Stille. Genommen ist die **langsamere** Rate — 1 s Grundlast plus
10 Zeichen je Sekunde —, weil Überschätzen billiger ist als eine gesprengte
Ablage. Daraus, mit dem Grundstock (84 Wörter, 84 Beispielsätze) und den
Dialogen aus Phase 4 (16 im Probelauf, 512 im vollen Lauf, je ~8 Züge, ~25
Zeichen):

| Umfang | Clips | Dauer | Gemini (WAV) | ChatGPT (mp3, geschätzt) |
| --- | --- | --- | --- | --- |
| Probelauf (5 Wörter + 5 Sätze) | 10 | ~16 s | **~0,8 MB** | ~0,1 MB |
| Alle Vokabeln | 168 | ~4 min | **~11 MB** | ~1,4 MB |
| + Züge des Dialog-Probelaufs | ~+120 | ~+7 min | **~+20 MB** | ~+2,5 MB |
| + Züge des vollen Dialoglaufs | ~+4 000 | ~+4 h | **~+700 MB** | ~+85 MB |

Die letzte Zeile ist der Grund, warum die Schätzung **am Knopf** steht, bevor
jemand startet, und warum die Statuszeile die tatsächlich abgelegte Summe
zeigt. 700 MB WAV sind im Browser theoretisch möglich (IndexedDB vergibt
Anteile des freien Plattenplatzes), aber nichts, was man unbemerkt anhäufen
sollte. Eine Verdichtung von Gemini-PCM zu mp3/opus bräuchte einen Encoder im
JavaScript-Bündel oder ein natives Modul — bewusst nicht gebaut; wer den
vollen Dialoglauf vertonen will, nimmt nativ ChatGPT (mp3) oder wartet auf
einen Encoder. Gemessen im Web: der Probelauf mit zehn mp3-Clips belegt
105 264 Byte in der IndexedDB, `localStorage` wuchs nur um 3 280 Zeichen
Metadaten.

**Dedupliziert über den Text:** Gleicher Text in gleicher Sprache ist ein
Clip. „สวัสดีครับ" in zwanzig Dialogen ist einer, nicht zwanzig. Die Clip-ID
ist ein 64-Bit-Hash (zweimal FNV-1a über Codepunkte) aus Sprache und
normalisiertem Text; ein 32-Bit-Hash hätte bei ~1 500 Texten eine
Kollisionswahrscheinlichkeit im Promillebereich — zu viel für etwas, das still
den falschen Clip abspielen würde.

### AE-31 — Die Thai-Töne der TTS-Stimmen sind gemessen, und die Grenze der Messung ist benannt

**Entscheidung:** Hörclips werden von Gemini oder ChatGPT erzeugt (die
einzigen beiden der vier Anbieter mit Sprachausgabe, beide nennen Thai in
ihrer Doku). Ein Messwerkzeug für die Tonhöhenkontur liegt im Repo
(`scripts/tone-contour.html`). Es wurde an zwei **anderen** neuronalen
Thai-Stimmen angewendet, weil die beiden App-Anbieter ohne bezahlten Schlüssel
kein Audio hergeben (B-6). Die App **verspricht** deshalb nirgends, dass die
Töne stimmen — sie sagt beim Abspielen „KI-Stimme, keine
Muttersprachler-Aufnahme" (Pflicht 4).

**Warum das nicht aus Trainingswissen zu beantworten war:** Ob ein
TTS-Modell die fünf Thai-Töne realisiert, entscheidet sich an der
Grundfrequenz über die Silbe hinweg. Das steht in keiner Doku, und es lässt
sich auch nicht hören, wenn man es nicht messen kann — dieser Rechner hat
keine Thai-Stimme (Windows: nur de-DE und en-US; Browser: nur de-DE), und
Hören wäre ohnehin keine Messung.

**Wie gemessen wurde:** Minimalpaare aus dem verifizierten Grundstock, alle
fünf Töne: มา (mittel), ม้า (hoch), หมา (steigend), ไม่ (fallend), ใหม่ (tief).
Zwei Engines, drei Stimmen: Microsoft neural th-TH-Premwadee und th-TH-Niwat
(über `edge-tts`), Google (translate, `tl=th`). Je Clip F0 über normierte
Autokorrelation (40-ms-Fenster, 10 ms Schritt, 70–400 Hz), Oktavkorrektur,
längste stimmhafte Strecke ohne An- und Ausklang, in Halbtönen relativ zum
Median der Stimme. Erwartete Formen nach der Beschreibung des Bangkok-Thai
(Abramson): mittel eben · tief tief, eben bis fallend · fallend hoch beginnend,
deutlich fallend · hoch mittelhoch beginnend, zum Ende steigend · steigend
tief beginnend, Senke, dann deutlich steigend.

**Ergebnis** (Kontur in Halbtönen bei 0/20/40/60/80/100 % der Silbe):

| Stimme | มา mittel | ม้า hoch | หมา steigend | ไม่ fallend | ใหม่ tief |
| --- | --- | --- | --- | --- | --- |
| Premwadee | +1,4 … −3,1 (fällt) | +0,8 … −1,8 (fällt) | +0,7 → −4,0 → +1,3 ✓ | +2,8 → −6,5 ✓ | +1,9 → −6,6 ✓ |
| Niwat | +1,7 … −0,9 ✓ | +0,8 … −1,0 (eben, keine Steigung) | −2,5 → +1,4 ✓ | +3,9 → −4,6 ✓ | −2,1 → −6,4 ✓ |
| Google | 0 … −3,6 (Fall am Ende) | 0 … +1,8 ✓ | −0,9 → −4,9 → −4,5 (**keine Steigung**) | +4,2 → −5,5 ✓ | −0,4 → −5,7 ✓ |

Schwellenfreie **Ordnungsprüfung** innerhalb jeder Stimme (Ende(hoch) >
Ende(mittel) > Ende(fallend); Ende(steigend) > Ende(tief); Anfang(fallend) >
Anfang(tief); Senke-zu-Ende beim steigenden, Gipfel-zu-Ende beim fallenden Ton
je > 2 Halbtöne): **je 7 von 8** bei allen drei Stimmen.

Lesart: Fallend und tief realisieren alle drei Stimmen klar. Der steigende Ton
ist bei beiden Microsoft-Stimmen sauber (Senke, dann +5 bis +6 Halbtöne), bei
Google dagegen **nicht** — หมา fällt dort und bleibt unten, was einem
Muttersprachler als tiefer Ton erscheinen dürfte. Mittel und hoch sind bei den
Microsoft-Stimmen nur schwach getrennt (Premwadee lässt beide fallen), bei
Google dagegen richtig geordnet (hoch endet oben, mittel fällt am Ende).
**Keine der drei Stimmen realisiert alle fünf Töne überzeugend.** Das ist der
wichtigste Befund dieser Phase: Man darf einem TTS-Anbieter die Thai-Töne
nicht unbesehen glauben — und die beiden Anbieter, die die App benutzt,
konnten gar nicht gemessen werden.

**Grenzen, ausdrücklich:**

- Gemessen sind **nicht** die Anbieter der App. Gemini- und OpenAI-Clips
  brauchen einen Schlüssel; das Werkzeug ist dafür gebaut (Dateien hineinziehen
  oder Manifest) und steht als TODO-Punkt oben.
- Eine Konturmessung ist keine Hörprüfung. Sie sagt, ob die Tonhöhe die
  erwartete Richtung nimmt — nicht, ob ein Muttersprachler die Silbe als
  richtig hört. Vokallänge, Stimmqualität und Silbenendrand bleiben unbewertet.
- Autokorrelation irrt bei Nasalen und sehr kurzen Silben; die
  Oktavkorrektur fängt nur den groben Fall. Die erste Messung ohne sie zeigte
  bei mehreren Clips einen Sprung von +5 Halbtönen am Silbenanfang — ein
  Messfehler, kein Ton. Deshalb steht die Korrektur jetzt im Werkzeug und in
  der Beschreibung.
- Die „erwarteten Formen" sind eine Beschreibung des Bangkok-Standards; die
  Schwellen in der Formzuordnung sind Heuristik.

**Konsequenz im Code:** `synthetic: true` ist ein Literaltyp im Clip-Dokument,
damit keine Fassung behaupten kann, etwas anderes zu sein; die Wiedergabe
meldet `asset` oder `tts`, und die Oberfläche schreibt bei `asset` „KI-Stimme"
daneben — bei Vokabel, Beispielsatz und Gesprächszug. Dieselbe Linie wie
`sourceVerified` bei den Vokabeln: kennzeichnen, was nicht belegt ist.

**Warum kein fünfter Anbieter für Sprachausgabe:** AE-28 hat Stability als
*Bestandsanbieter* behalten, weil die Bild-Gruppe sonst keinen einzigen
gemessenen Weg mehr gehabt hätte. Hier gibt es keinen Bestand, und der Weg von
Gemini ist aus dem Browser gemessen offen; ein Spezialanbieter (ElevenLabs
o. ä.) wäre ein *neuer* fünfter, den Phase 10 ausschließt. Die
Microsoft-Stimmen der Messung sind keine Option: `edge-tts` ist ein
nachgebauter Zugang ohne offizielle API und ohne Schlüssel — gut zum Messen,
untauglich als Grundlage einer App.

**CORS, gemessen wie in AE-26/AE-27:** `POST …/gemini-2.5-flash-preview-tts:
generateContent` mit `responseModalities: ["AUDIO"]` kommt durch (400,
lesbar), ebenso der neue Endpunkt `/v1beta/interactions` aus der aktuellen
Doku. `POST api.openai.com/v1/audio/speech` unterliegt der `sk-`-Regel aus
AE-27: mit `Bearer ungueltig` ein lesbares 401, mit `Bearer sk-…` „Failed to
fetch". ChatGPT ist damit auch für Sprachausgabe im Web-Build gekennzeichnet,
nativ offen. Die Voreinstellung der Gruppe ist Gemini.

### AE-32 — Die Sollkontur kommt aus der verifizierten Silbe, nie aus der Stimme

**Entscheidung:** Eine Sprechaufgabe entsteht nur für einen Eintrag mit
`sourceVerified === true` und genau einer Silbe. Ihr Sollton ist wortwörtlich
`syllables[0].tone`; weder `audioAssetId` noch ein TTS-Clip noch dessen
gemessene Kurve gelangen in den Prompt oder den Vergleich. Das synthetische
Hörbeispiel bleibt ein eigener, ausdrücklich so beschrifteter Knopf.

Das ist absichtlich strenger als nur `entry.tone` zu lesen. Bei mehrsilbigen
Wörtern beschreibt das Feld nur die erste Silbe; ohne geprüfte zeitliche
Silbengrenzen könnte die längste stimmhafte Strecke nicht ehrlich einem der
mehreren Solltöne zugeordnet werden. Solche Wörter bleiben deshalb aus dieser
ersten Sprechübung heraus, statt eine Grenze zu raten.

**Gegenprobe:** Der Test baut einen verifizierten Eintrag mit drei absichtlich
widersprüchlichen Angaben (`tone: falling`, `syllables[0].tone: rising`, ein
Clip mit „falschem Ton"). Der Prompt bleibt `rising`, trägt
`targetSource: verified-vocabulary-syllables` und enthält überhaupt kein
Audiofeld. Damit würde auch ein nachweislich falscher TTS-Ton den Maßstab nicht
verschieben.

### AE-33 — RECORD_AUDIO ist die ausdrücklich begründete Umkehr von Phase 8

Phase 8 schaltete `recordAudioAndroid` und `microphonePermission` bewusst aus:
Die App nahm damals nie auf, also wäre die Berechtigung irreführend gewesen.
Phase 12 ändert genau diese Tatsachengrundlage. `recordAudioAndroid` ist nun
`true`, iOS erhält den Zwecktext „nur für die lokale Sprechübung; keine
Übertragung". `enableBackgroundRecording` und `enableBackgroundPlayback`
bleiben ausdrücklich `false`.

Die statische Berechtigung bedeutet nicht, dass die App beim Start fragt. Vor
dem Aufnahme-Knopf steht die Begründung samt lokaler Verarbeitung; erst dessen
ausdrücklicher Nutzer-Klick ruft nativ
`requestRecordingPermissionsAsync()` beziehungsweise im Web
`getUserMedia()` auf. Ein Hook-Test belegt „Mounten fragt nicht", den
Ablehnungsweg und das Freigeben beim Abbau.

Mit `expo prebuild --platform android --no-install` nachgemessen: Das erzeugte
Manifest enthält `android.permission.RECORD_AUDIO`, aber weder
`FOREGROUND_SERVICE_MICROPHONE` noch den Audio-Aufnahmedienst. Der generierte
Ordner wurde danach wieder entfernt; `package.json` blieb in seiner
vorherigen Form.

### AE-34 — Ein lokaler PCM-Kern, zwei gemessene Aufnahmewege

Das installierte `expo-audio@57.0.4` ist nicht plattformgleich: Die native
Implementierung von `useAudioStream` liefert unter Android/iOS echte
PCM-Puffer samt tatsächlicher Abtastrate und Kanalzahl; die installierte
`AudioStream.web.ts` liefert nur `stream: null`. Deshalb gibt es bewusst zwei
Hooks hinter demselben Vertrag:

- Android/iOS: `useAudioStream`, mono, Int16, gewünschte 16 kHz; das wirklich
  gelieferte little-endian PCM und die echte Rate werden ausgewertet.
- Web: `getUserMedia` + Web Audio; bevorzugt `AudioWorklet`, mit lokalem
  `ScriptProcessor`-Fallback. `MediaRecorder` wird nicht benutzt, weil er nur
  eine codierte Datei und keinen gemeinsamen Echtzeit-PCM-Kern liefert.

Beide Wege halten höchstens vier Sekunden Mono-PCM im Arbeitsspeicher, stoppen
Tracks/Stream danach und behalten im Ergebnis nur Dauer und Kontur. Es gibt in
diesem Pfad keinen `fetch`, Anbieter, Schlüssel, Blob-Speicher oder
Repository-Schreibzugriff. Auch ein noch laufender Hörclip wird vor dem
Mikrofonstart geordnet gestoppt und freigegeben, damit TTS nicht in die
Lernendenmessung überspricht. Die Auswertung bleibt damit offline und auf dem
Gerät.

Der Rechenkern ist aus `scripts/tone-contour.html` übertragen: normierte
Autokorrelation (40/10 ms, 70–400 Hz, Schwellen 0,08/0,6), Medianfilter,
längste stimmhafte Strecke, **einmalige** 1,8-fache Oktavkorrektur, 8 %
Randbeschnitt und sechs Halbton-Stützstellen. Vorher wird PCM nur auf höchstens
8 kHz blockgemittelt, damit vier Sekunden im UI berechenbar bleiben; 400 Hz
liegen weiter weit unter Nyquist. Tests decken den dokumentierten
Oktavsprung, den absichtlich nur einen Korrekturdurchgang, 48→8 kHz und eine
steigende PCM-Kurve durch die gesamte Pipeline ab.

**Gemessene Grenze:** Im laufenden Expo-Web-Build war der vollständige Screen
fehlerfrei sichtbar; der Start wechselte erst nach dem Klick in
„Mikrofonfreigabe wird angefragt". Der einzige verfügbare Codex-In-App-Browser
stellte jedoch keinen bedienbaren Mikrofon-Dialog bereit, sodass dort kein
physisches PCM entstand. Web-API, PCM, Ablehnung und Aufräumen sind daher mit
einem echten Hook plus Browser-API-Doubles geprüft; ein normaler Chrome/Edge-
Mikrofonlauf bleibt ein Geräte-/Browsercheck. Nativ sind Hook, installiertes
Android-/iOS-Paket, Manifest, Typen und Lebenszyklus getestet; echtes
Hardware-PCM bleibt B-2. Das ist die gemessene Grenze, keine Behauptung eines
nicht ausgeführten Gerätetests.

### AE-35 — Die Sprechübung schreibt nicht in den bestehenden FSRS-Karteikasten

Eine gemessene Tonkontur ist weniger zufällig als Multiple Choice aus AE-16,
aber noch keine Bewertung derselben Fähigkeit wie eine Vokabelkarte:
Konsonanten, Aspiration, Vokallänge und lexikalischer Abruf fehlen; F0 kann bei
Rauschen, Nasalen, kurzen Silben und verbleibenden Oktavfehlern irren. Ein
solcher Teilbefund darf das Intervall einer vollständigen Vokabel weder
verlängern noch verkürzen.

FSRS wird deshalb **nur gelesen**, um schwächere Wörter für eine Runde zu
priorisieren. Die Sprechübung erzeugt und bewertet keine Karte und schreibt
auch keinen Ersatz-Score. Die Rückmeldung lautet qualitativ „Kontur
vereinbar", „noch nicht vereinbar", „nicht messbar" oder — bei mittel, tief
und hoch ohne persönliche Mehrfachaufnahme — „Register offen". Nur steigende
und fallende Formen sind aus einer einzelnen medianbezogenen Aufnahme relativ
entscheidbar. Ein eigener Ausspracheplan wäre später ein eigener Skill mit
validierter Skala, nicht ein stiller Schreibzugriff auf `vocabId:direction`.

### AE-36 — Die Schriftregeln sind erhoben, nicht erinnert — und zwar aus dem Rohtext

**Entscheidung:** Konsonanteninventar, Klassenzuordnung, Schlusslaute,
Vokalmuster mit Länge und die Tonregeltabelle stehen in
`src/data/thai-script.ts`, mit Quelle und Abrufdatum im Kopf. Die 44
Konsonantenzeilen sind aus dem **Rohtext der Quelltabelle erzeugt**, nicht
abgetippt.

**Begründung — dasselbe Vorgehen wie in Phase 2 und 7, und aus demselben
Grund.** Der erste Abruf lief über ein zusammenfassendes Werkzeug. Was
zurückkam, sah vollständig aus und war es nicht:

- **28 von 44 Konsonanten**, mit dem Zusatz „(Note: ฃ, ฅ, ฆ, ฌ, ฎ, ฏ, ฐ, ฑ, ฒ,
  ณ are also listed but with various details)" — eine Auslassung, die man nur
  bemerkt, wenn man nachzählt.
- Für ล den Schlusslaut „/n/ or /w/", für ร „/n/" — der zweite Wert bei ล
  stammt aus der Quelle, aber die Zusammenfassung ließ offen, dass es eine
  Mehrdeutigkeit ist und keine Tatsache.

Deshalb der Weg von Phase 2: die **MediaWiki-API** (`action=parse&
prop=wikitext`) und ein eigener Parser über die Tabellenzeilen. Ergebnis: 44
Konsonanten, Verteilung 9 Mittelklasse / 11 Hochklasse / 24 Tiefklasse. Diese
drei Zahlen stehen als Test — sie sind die Kontrolle dafür, dass beim Parsen
keine Zeile verlorenging oder doppelt ankam.

**Quelle:** Englische Wikipedia, „Thai script", abgerufen am **2026-09-03**.
Für die Konsonantenverbindungen zusätzlich „Thai language", Abschnitt
„Syllable structure and consonant clusters", gleiches Datum — warum, steht in
AE-38.

**Der Schlusslaut kommt aus der IPA-Spalte, nicht aus dem Kopf.** Ob eine
Silbe lebend oder tot ist, hängt daran, ob ihr Schlusskonsonant klingt oder
verschließt. Statt das je Buchstabe zu behaupten, liest der Generator die
Spalte „IPA final" der Quelle: /ŋ/, /n/, /m/, /j/, /w/ sind Sonoranten, /k/,
/t/, /p/ Plosive, „–" heißt „kommt am Silbenende nicht vor". Damit ist die
Live/Dead-Entscheidung eine Ableitung aus der Quelle und keine zweite
Wissensquelle im Code.

**Zwei Stellen sind gekennzeichnet statt entschieden** — Muster ร้าน/นอน aus
Phase 2:

1. **ล** trägt in der Quelle „/n/ or /w/". Der Eintrag führt beide Werte und
   eine `uncertainNote`. Für die Tonregel ändert es nichts, weil beide
   Sonoranten sind; das steht in der Notiz mit dabei, damit niemand später
   glaubt, die Frage sei geklärt.
2. **Der implizite Vokal** — zwei Konsonanten ohne Vokalzeichen (คน, รถ). Die
   Quelle führt ihn als kurzes /o/ und nennt in einer Fußnote für dieselbe
   Schreibung auch ein langes /ɔː/. Welche Lesart gilt, ist der Schrift nicht
   anzusehen. Die Herleitung nimmt /o/ und **zeigt die Mehrdeutigkeit im
   UI an**, statt sie zu verschweigen.

**Was hier bewusst nicht steht:** Handschrift und Strichfolge — für eine
Lese-App nicht nötig, und die Vorgabe schließt es ausdrücklich aus.

### AE-37 — Der Ton wird hergeleitet, nicht abgefragt

**Entscheidung:** Neue Übung „Ton herleiten" (`toneRule`, Richtung `de_to_th`).
Sie zeigt die **Thai-Schrift**, fragt den Ton und erklärt danach die
Herleitung in sieben Schritten: Anfangskonsonant → Konsonantenklasse → Vokal →
Schlusslaut → Silbenart → Tonzeichen → Ergebnis.

**Begründung:** Eine Tabelle zum Nachschlagen hätte die Lücke nicht
geschlossen. Der Ton ist im Thai ein **Regelsystem**, und der Unterschied
zwischen „ich weiß, dass หมา steigend ist" und „ich kann den Ton eines Wortes
bestimmen, das ich noch nie gesehen habe" ist genau der Zweck dieser Phase.
Deshalb steht die Herleitung als **Liste von Schritten** im Aufgabentyp
(`derivation`) und nicht als Fließtext in `explanation` — jeder Schritt trägt,
was an dieser Stelle in der Schrift steht **und warum** das so gelesen wird.

**Die Umschrift steht bewusst nicht dabei.** Sie trägt die Tonzeichen (à, á,
â, ǎ) und wäre schlicht die Antwort. Sichtbar ist nur die Thai-Schrift; die
Umschrift erscheint erst in der Auflösung. Das ist dieselbe Überlegung wie bei
der Hör-Übung aus Phase 6, wo umgekehrt die **Schrift** verborgen bleibt, weil
sie dort die halbe Lösung wäre.

**Zwei Ton-Übungen nebeneinander, mit Absicht.** „Töne hören" trainiert das
Ohr, „Ton herleiten" die Schriftregel. Beide führen zum selben Ton, aber über
verschiedene Wege — und wer nur hört, bleibt bei jedem neuen Wort auf das Ohr
angewiesen. Die fünf Antworten stehen in beiden Übungen in **derselben festen
Reihenfolge** (mittel, tief, fallend, hoch, steigend): Wer beide übt, soll
nicht zwei Ordnungen im Kopf behalten müssen.

**Die Gegenprobe ist der eigentliche Beleg (Pflicht 2).** Für jeden
einsilbigen Eintrag des Grundstocks ist der richtige Ton seit Phase 2 bekannt.
Die Herleitung trifft ihn bei **69 von 69** — und, wichtiger, sie leitet bei
**keinem** einen falschen Ton her. Ein Fehlschlag wäre hinnehmbar, die Übung
ließe das Wort dann aus; ein falscher Ton wäre es nicht, weil Lernende die
falsche Regel mitlernen würden. Deshalb baut die Übung eine Aufgabe **nur**,
wenn die Herleitung gelingt *und* mit dem quellengeprüften Ton übereinstimmt.
Alle fünf Töne kommen darin vor.

Die Fälle, an denen die Regel wirklich hängt, stehen einzeln im Test:

| Wort | Was daran hängt | Ohne die Regel |
| --- | --- | --- |
| หมา | ห นำ hebt ม in die Hochklasse | „mittel" statt steigend |
| หก | ห + ก ist **kein** ห นำ, ก ist Schlusslaut | falsche Silbenzerlegung |
| ปลา | Verbindung — die Klasse kommt vom ersten Buchstaben | ล wäre Tiefklasse |
| อยาก | อ นำ, laut Quelle nur in vier Wörtern | „hoch" statt tief |
| รัก / มาก | tot kurz gegen tot lang, sonst gleich | hoch gegen fallend |
| เย็น / เล็ก | kurzer Vokal, klingender gegen verschließenden Schluss | lebend gegen tot |
| ค่ะ | das Tonzeichen überstimmt die Silbenart | „hoch" statt fallend |

**Konsistenz mit Bestehendem (Pflicht 4):** Die Antworten tragen nur den Ton;
Farbe und Konturglyphe holt die Oberfläche aus `constants/tones.ts` — im
Web-Build nachgemessen, es sind exakt die dort hinterlegten Werte
(`#88a083`, `#8a9bb1`, `#c88b7a`, `#ba9443`, `#82a097`) und Konturpfade,
also auch die in Phase 9 kontrastgeprüften Fassungen. Es gibt keine zweite
Darstellung. Die Schritt-Liste trägt `role="list"` und `role="listitem"`,
damit ein Screenreader sie als Folge ansagt und nicht als lose Textfetzen.

### AE-38 — Ohne Verbindungsliste liest eine Analyse ตลาด als eine Silbe

**Entscheidung:** Als Konsonantenverbindung gilt nur, was in der belegten
Liste steht — elf Lautverbindungen, geschrieben mit fünfzehn Paaren. Alles
andere ist keine Verbindung. AE-8 gilt unverändert weiter: mehrsilbige Wörter
werden **abgewiesen**, nicht zerlegt.

**Begründung — in der Gegenprobe gefunden, nicht vorhergesehen.** Der erste
Durchlauf des Tests über den Grundstock meldete einen einzigen Fall:

```
ตลาด (dtà-làat, der Markt) ist 2-silbig, wurde aber als eine Silbe gelesen.
```

Die Ursache war eine stillschweigende Annahme im Code: Wenn ein einzelner
Anfangskonsonant nicht aufging, wurden einfach **zwei** probiert. Damit war
jedes Konsonantenpaar eine Verbindung — auch ตล, das keine ist. ตลาด ist
zweisilbig (ต mit implizitem Vokal, dann ล), und die Analyse hätte ihm einen
Ton zugeschrieben.

Der Artikel „Thai script" enthält **keine** Liste echter Verbindungen. Der
Artikel „Thai language" enthält sie, Abschnitt „Syllable structure and
consonant clusters": „In the core vocabulary (i.e. excluding loanwords), only
clusters of two consonants occur, of which there are 11 combinations" — กร,
กล, กว, ขร/คร, ขล/คล, ขว/คว, ปร, ปล, พร, ผล/พล, ตร. Mit dieser Schranke
scheitert ตลาด richtig, und alle 69 einsilbigen Einträge gehen weiterhin auf.

**Die Liste ist abschließend gemeint.** Die Quelle nennt zusätzlich
Verbindungen in Lehnwörtern (ทร in อินทรา, ฟร in ฟรี). Sie stehen bewusst
nicht dabei: Der Grundstock braucht sie nicht, und eine offene Liste hätte
denselben Fehler wie gar keine — sie würde wieder Paare durchlassen, die keine
Verbindung sind.

**Was das nicht ist: ein Segmentierungsansatz.** Die Vorgabe erlaubte
ausdrücklich, einen solchen Befund zu dokumentieren, aber nicht darauf
aufzubauen. Das hier ist kein Verfahren, um Silbengrenzen zu finden — es ist
das Gegenteil: eine Schranke, die verhindert, dass die Analyse eine Grenze
**errät**, wo sie keine kennt. Ein Test fährt alle 15 mehrsilbigen Einträge
des Grundstocks durch und verlangt, dass jeder einzelne mit benanntem Grund
abgewiesen wird.

**Was daraus für eine spätere Phase folgt:** Die Verbindungsliste ist die
halbe Miete für eine echte Segmentierung — sie sagt, wo eine Silbe *nicht*
endet. Was fehlt, ist die Unterscheidung zwischen Verbindung und
Leitkonsonant (อักษรนำ) bei den Paaren, die beides sein können, und dafür
braucht es eine Quelle, die diese Wörter aufzählt. ผล ist genau so ein Fall:
in der Verbindungsliste als /pʰl/, in ผลไม้ dagegen zweisilbig (pǒn-lá-).

### AE-39 — Thai tippen geht nicht ohne Hilfe, und die App kann nicht einmal fragen

**Entscheidung:** Freies Schreiben auf Thai läuft über ein gewöhnliches
Eingabefeld **plus eine eingebaute Zeichenpalette** aus den in Phase 13
erhobenen Daten. Die Umschrift-Eingabe mit getrennter Tonwahl wurde geprüft
und **verworfen**.

**Begründung — gemessen, nicht angenommen (Muster AE-3/10/13/26/27):**

Auf diesem Rechner ist genau **eine** Tastaturbelegung aktiv:

```
HKCU\Keyboard Layout\Preload → 1: 00000407 → German
Get-WinUserLanguageList      → de-DE, InputMethodTips: 0407:00000407
```

Windows **bringt** vier Thai-Belegungen mit (Kedmanee, Pattachote und deren
non-ShiftLock-Varianten), aber keine davon ist eingeschaltet. Thai zu tippen
setzt also einen Eingriff in die Systemeinstellungen voraus — genau die Hürde,
die die Vorgabe benennt.

Schlimmer: **die App kann es nicht einmal feststellen.** Im laufenden Web-Build
gemessen:

| Messung | Ergebnis |
| --- | --- |
| Eingabefeld nimmt Thai an | ja, สวัสดี als 6 Codepunkte |
| Tonzeichen hängt als eigenes Zeichen an | ja, ก + ่ = 2 Codepunkte |
| Thai wird dargestellt (Schriftart da) | ja, Breite 46 gegen 90 bei Ersatzkästchen |
| `navigator.keyboard.getLayoutMap()` | **leer**, 0 Tasten |
| `navigator.languages` | `de`, `de-DE` — sagt nichts über Belegungen |
| Zeichen an der Schreibmarke einfügen | funktioniert |

Ein leeres `getLayoutMap()` heißt: Es gibt keinen Weg, vorher zu wissen, ob
jemand Thai tippen kann. Also darf die Eingabe nicht davon abhängen. Dieselbe
Lage wie bei der fehlenden Thai-Stimme in Phase 6 — nur dass es hier nicht
reicht, den Mangel zu benennen: Ohne Eingabe gäbe es die Übung nicht.

**Warum die Zeichenpalette und keine Umschrift-Eingabe.** Die Umschrift wäre
der bequemere Weg und scheitert an den Daten. Im Grundstock gemessen: Nach dem
Entfernen aller Tondiakritika (die sich sauber über NFD abtrennen lassen)
bleiben **vier** Buchstaben übrig, die keine Tastatur hat — ɔ (17×), ʉ (9×),
ɛ (8×), ə (1×). Für sie eine ASCII-Ersatzschreibung festzulegen (`ɔ` als „or"?
„aw"? „o"?) hieße, eine **Umschrift zu erfinden**, und genau das verbietet die
Linie seit Phase 2. Der Grundstock hat kein ASCII-Umschriftfeld, das man
stattdessen prüfen könnte.

**Die Palette ist keine Krücke, sondern eine Tastatur.** Wer „Haus" tippt,
sieht die Buchstaben auch vor sich; niemand nennt das Abschreiben. Der
Unterschied zu einer Auswahlaufgabe bleibt bestehen: Hier stehen alle Zeichen,
nicht fünf fertige Antworten — Auswahl **und** Reihenfolge muss die lernende
Person selbst kennen. Im Web-Build durchgespielt: ทำ aus ท und ำ
zusammengesetzt, ohne Systemtastatur, als „genau richtig" gewertet.

Die Zeichen kommen aus `data/thai-script.ts` (Phase 13), nicht aus einer
zweiten Liste. Jede Taste trägt den akrophonischen Namen als Beschriftung
(„ก ไก่, ko kai") — ein Screenreader läse sonst ein einzelnes Zeichen vor, das
niemandem etwas sagt.

**Für Deutsch dieselbe Überlegung im Kleinen:** ä, ö, ü, ß und die großen
Umlaute stehen als sieben Tasten bereit. Sie sind nicht Bequemlichkeit, sondern
Voraussetzung dafür, dass die Strenge aus Pflicht 3 fair ist: Wenn „schon" für
„schön" als Fehler zählt, muss ö erreichbar sein — und eine thailändische
Belegung hat keine Umlaute.

### AE-40 — Freies Schreiben speist FSRS, und zwar dieselbe Karte

**Entscheidung:** Der Übungstyp „Schreiben" schreibt den Kartenzustand fort —
als erster und bisher einziger. Er benutzt **denselben Schlüssel** wie die
Karteikarte (`vocabId:direction`), keinen eigenen. Die Abbildung: genau richtig
→ **Gut (3)**, richtig mit toleriertem Tippfehler → **Schwer (2)**, falsch →
**Nochmal (1)**. **Leicht (4) wird nie vergeben.**

**Das ist die Einlösung von AE-16, nicht dessen Widerruf.** Dort steht
wörtlich, der saubere Weg wäre „ein Aufgabentyp mit **freier Eingabe** statt
Auswahl (Wort tippen, Artikel schreiben). Dann gäbe es kein Rateproblem, und
die Antwort wäre ein echter Abruf." Genau das ist gebaut. Die drei
Auswahlübungen aus Phase 6 und die Tonkonturmessung aus Phase 12 (AE-35)
schreiben unverändert **nichts** — ihre Gründe gelten weiter.

**Warum dieselbe Karte und nicht ein eigener Schlüssel.** Die Frage stellt die
Vorgabe ausdrücklich. Eine Schreibaufgabe in Richtung `de_to_th` fragt
„Deutsch gesehen, Thai hervorbringen" — Wort für Wort dieselbe Tatsache, die
die Karteikarte derselben Richtung abfragt. AE-16 begründet den Kartenschlüssel
damit, dass FSRS „eine Erinnerungsspur je Item" modelliert; ein zweiter
Schlüssel wäre ein zweiter Zeitplan für dieselbe Erinnerung, mit auseinander-
laufenden Intervallen. Das Dashboard zählt weiterhin genau eine Karte je
Vokabel und Richtung. Ein Test prüft, dass kein dritter Schlüsselteil entsteht
und die Gegenrichtung unberührt bleibt.

**Die Schreibaufgabe ist dabei der bessere Messpunkt als die Karteikarte.**
Die fragt hinterher „wie gut saß das?" — eine Selbsteinschätzung, die man sich
schön reden kann. Hier steht vorher fest, was richtig ist, und die Person hat
es getippt oder eben nicht.

**Warum „Leicht" nie vergeben wird.** Die Skala misst nicht Richtigkeit,
sondern **Mühe**: „Leicht" heißt „kam sofort und ohne Anstrengung". Eine
getippte Antwort sagt darüber nichts. Die naheliegende Krücke wäre die
Antwortzeit, und sie wäre falsch: Tippen auf einem Handy dauert länger als auf
einer Tastatur, und die Zeichenpalette dauert noch einmal länger. Ein
automatisches „Leicht" würde also ausgerechnet bei den langsamsten Tippern die
Intervalle strecken. Lieber eine Stufe ungenutzt lassen als sie falsch
vergeben.

**Warum ein Tippfehler „Schwer" ist und nicht „Gut".** Auch das fragt die
Vorgabe. „Gut" würde das Intervall genauso strecken wie eine fehlerfreie
Antwort; dann wäre die Toleranz aus AE-41 keine Nachsicht mehr, sondern eine
stille Gleichsetzung von sicher und unsicher. Ein Test belegt, dass eine
fehlerfreie Antwort die Karte weiter trägt als eine mit Tippfehler.

**Warum ein Lernzielfehler nicht härter zählt als ein anderer Fehler.** Ein
fehlender Artikel und ein völlig anderes Wort ergeben beide „Nochmal". Eine
Stufe unter „Nochmal" gibt es in FSRS nicht, und die Unterscheidung gehört in
die **Rückmeldung**, die sie benennt, nicht in den Wiederholungsplan.

**Folge für die Statistik:** Weil `rateCard` das Tagesprotokoll fortschreibt,
zählt eine beantwortete Schreibaufgabe als **Wiederholung** und nicht als
Übung. Das ist richtig herum — sie ist eine. Doppelt zu zählen würde die
Zahlen aufblähen. Im Web-Build nachgemessen: nach zwei Aufgaben stand
`total: 2` mit `byRating {1: 1, 3: 1}` und `drills` unverändert.

### AE-41 — Toleriert wird der Vertipper, nie das Lernziel

**Entscheidung:** Der Abgleich läuft in drei Stufen: erst **exakt**, dann auf
**geschützte Unterschiede** (die immer als benannter Fehler gelten), und erst
danach **Tippfehler-Toleranz**. Geschützt sind: Groß- und Kleinschreibung,
Umlaute, ß gegen ss, der deutsche Artikel und die thailändischen Tonzeichen.

**Begründung:** Eine Ähnlichkeitsprüfung, die „schon" für „schön" durchwinkt,
ist hier schädlicher als gar keine Toleranz — sie würde ausgerechnet den
Fehler wegräumen, um den es geht. Der Editierabstand zwischen beiden ist
**eins**, läge also genau in der üblichen Toleranz. Deshalb die Reihenfolge:
Was nach dem Entfernen der geschützten Merkmale gleich wird, ist per
Definition ein Lernzielfehler und kommt gar nicht erst zur Toleranzprüfung.

Die Rückmeldung benennt, **welcher** Fehler es war: „Groß- und
Kleinschreibung", „Umlaut", „ß gegen ss", „Der Artikel fehlt" samt richtigem
Artikel, „Tonzeichen". Ein bloßes „falsch" hätte den Lerneffekt verschenkt.

**Der Artikel wird eigenständig geprüft**, und zwar **vor** der Toleranz. Das
kam aus dem Test: „der Haus" gegen „das Haus" hat Abstand zwei, wäre also
ohnehin über der Toleranz gelandet — aber als nichtssagendes „anderes Wort".
Jetzt heißt es „Falscher Artikel. Richtig ist ‚das'."

**Die Toleranzgrenzen, und warum sie so liegen:**

- **Thai: null.** Jedes Zeichen einer Silbe trägt; ein ausgetauschter
  Konsonant ergibt ein anderes Wort, keinen Ausrutscher. Und die Eingabe läuft
  über die Palette (AE-39), wo nichts so verrutscht wie auf einer Tastatur.
- **Deutsch: ein Zeichen, aber erst ab fünf Zeichen Länge.** Bei „gut", „neu"
  oder „acht" ist ein Zeichen Unterschied fast immer ein anderes Wort; bei
  „Höflichkeitspartikel" wäre Nulltoleranz Schikane. 21 der 84 Stichwörter
  liegen unter der Grenze.
- **Vertauschungen zählen als ein Schritt** (Damerau statt reinem
  Levenshtein). „Huas" für „Haus" ist der häufigste Tippfehler überhaupt; ihn
  doppelt zu zählen hieße, ausgerechnet den typischsten Ausrutscher am
  härtesten zu bestrafen.

**Offline-first (Pflicht 2), und das ist im Code verankert.** Der Abgleich ist
reine Rechnung gegen den quellengeprüften Grundstock — kein Netzaufruf, kein
Anbieter, kein Schlüssel. Ein Test **liest den Quelltext** aller fünf Module
des Schreibpfads und schlägt fehl, sobald dort `fetch(`, ein Import aus
`providers/` oder `api-key` auftaucht. Eine Zusicherung über Verhalten ließe
sich mit einem Mock erschleichen; diese hier nicht. Eine KI-Korrektur für
freie Sätze ist damit weiterhin möglich, aber sie wäre eine **Ergänzung** und
liegt außerhalb dieses Pfades.

**Was Klammern angeht:** Der Grundstock schreibt Erläuterungen wie „ich
(männlicher Sprecher)". Die fallen für die Zielform weg — wer sie mittippen
müsste, übte Abschreiben statt Produzieren — und stehen danach vollständig in
der Auflösung. Bei mehreren Bedeutungen („ja, richtig") zählt jede.

### AE-42 — Deutsch ist die Drehscheibe, und das ist eine Entscheidung

**Entscheidung:** Jedes Sprachpaar hat Deutsch auf einer Seite. `Direction` ist
deshalb `de_to_<X>` oder `<X>_to_de` und **kein** freies Kreuzprodukt der
Sprachen. Englisch↔Spanisch ohne Deutsch dazwischen ist damit ausdrücklich
nicht vorgesehen.

**Begründung:** Der Wunsch lautet „Deutschen X beibringen und umgekehrt". Aus
zwei Zielsprachen ein volles Kreuzprodukt zu machen, wäre eine stille
Ausweitung mit spürbaren Folgen:

- **Inhalt.** Jedes Paar braucht seinen eigenen geprüften Grundstock. Bei drei
  Sprachen mit Drehscheibe sind das drei Grundstöcke; als Kreuzprodukt wären
  es sechs — und der Aufwand je Grundstock steht in Phase 2 (siebenstufiger
  Prüfschritt je Eintrag).
- **Die deutschen Module.** Prüfungsmodul (Goethe, Phase 7) und die
  Grammatikübungen (Genus, Stammformen, Phase 6) prüfen **Deutsch**. Mit
  Deutsch auf jeder Seite gelten sie für jedes Paar; in einem Kreuzprodukt
  wären sie für Englisch↔Spanisch sinnlos und müssten ausgeblendet werden.
- **Der Vokabeleintrag.** Er trägt eine fremdsprachige Form und eine deutsche.
  Ein Kreuzprodukt bräuchte je Eintrag beliebig viele Sprachfelder oder eine
  eigene Übersetzungstabelle — ein deutlich größerer Umbau für einen Nutzen,
  den niemand verlangt hat.

**Die Erweiterung ist bewusst additiv und nicht ersetzend.** `'de_to_th'` und
`'th_to_de'` bleiben **wörtlich** gültige Werte des neuen Typs. Das ist der
Grund, warum diese Phase 180 Richtungsliterale im Bestand nicht anfassen
musste und warum gespeicherte Kartenschlüssel (`vocabId:de_to_th`) ohne
Umschreiben weiterleben. AE-11 gilt unverändert: `direction` benennt die
Sprache, die aktiv hervorgebracht wird.

**Was aus einer Tabelle eine Funktion wurde:** `DIRECTION_LABELS`,
`DIRECTION_PROMPTS` und `DRILLS_BY_DIRECTION` waren `Record<Direction, …>` mit
zwei Einträgen. Mit sechs Richtungen müsste jede neue Sprache an drei Stellen
nachgetragen werden, und eine davon würde vergessen. Sie sind jetzt
Funktionen, die aus dem Sprachverzeichnis ableiten.

### AE-43 — Die Migration betrifft die Auslieferungsdaten, nicht den Lernfortschritt

**Entscheidung:** Ein Schemastand in `meta/schemaVersion`. Beim Start läuft
`migrateStore()`: Steht dort eine ältere Version, wird der **Vokabel**-Grundstock
neu eingespielt. Kartenzustände, Tagesprotokoll und Profil werden **nicht
angefasst**.

**Begründung — die Trennung ist der ganze Punkt.** Was der Nutzer erarbeitet
hat, steht in den Karten (Stabilität, Difficulty, Fälligkeit, Wiederholungen),
im Tagesprotokoll und im Profil. Der Vokabel-Grundstock dagegen kommt mit der
App; er ist Auslieferungsdatum und kein Besitz. Deshalb:

- **Karten:** kein Eingriff. Der Schlüssel `vocabId:direction` hat sich nicht
  geändert (AE-42), es gibt also nichts umzuschreiben — und was man nicht
  anfasst, kann man nicht verlieren.
- **Vokabeln:** vollständig ersetzt statt feldweise umgebaut. Ein feldweiser
  Umbau müsste für jede künftige Schemaänderung nachgezogen werden und wäre
  bei jedem Sprung eine neue Fehlerquelle.

**Der Test prüft den Migrationsweg, nicht den Neuzustand.** Er baut einen
Speicher in der **alten** Form: ein Vokabeldokument mit `thai`/`exampleThai`
und ohne `language`, dazu eine Karte mit echtem Lernfortschritt (zweimal
bewertet, Stabilität und Fälligkeit gesetzt). Nach dem Lauf muss die Karte
**Feld für Feld unverändert** sein — `toEqual` gegen den vorherigen Zustand —
und die Vokabeln in der neuen Form vorliegen. Dazu: Idempotenz (ein zweiter
Lauf tut nichts), ein leerer Speicher bekommt nur die Versionsnummer, und der
Lauf meldet `cardsTouched: 0`.

**Was am Datenmodell geändert wurde:** `thai` → `term`, `exampleThai` →
`exampleTerm`, neu `language`. Der alte Name war eine Festlegung auf eine
Sprache, die es nicht mehr gibt — ein Feld `thai` an einem englischen Eintrag
wäre absurd. `tone` und `syllables` bleiben, sind aber im Typ als
**sprachspezifisch** gekennzeichnet und werden nur noch über das Merkmal
gelesen (AE-44).

**Bewusst nicht umbenannt:** `ConversationTurn.thai` (Phase 4),
`ImageSpec.thai` (Phase 5) und die Sprechaufgabe (Phase 12). Das sind
**Inhaltstypen des Thai-Paars**, keine sprachneutralen Strukturen; sie werden
verallgemeinert, wenn das zweite Paar Inhalte bekommt. Sie jetzt umzubenennen
hieße, eine Abstraktion für Daten zu bauen, die es noch nicht gibt.

### AE-44 — Das Merkmal ist einhängbar, und für Englisch und Spanisch entschieden statt geraten

**Entscheidung:** Jede Sprache bringt ein `LanguageFeature` mit — beschrieben
in `lib/languages/types.ts`, ausgeführt in `lib/languages/feature.ts`. Es
liefert genau zweierlei: die **Silbenauszeichnung** eines Eintrags und die
**Übungen**, die zum Merkmal gehören.

**Was bewusst nicht ins Merkmal wandert: die Darstellung.** Tonfarben bleiben
in `constants/tones.ts`, die Schriftregeln in `data/thai-script.ts`. Ein
Merkmal sagt, **welcher** Ton eine Silbe trägt — wie er aussieht, entscheidet
weiterhin die eine geprüfte Stelle. Ein zweites Darstellungssystem hätte die
Kontrastprüfung aus Phase 9 entwertet, und Pflicht 3 verbietet es ausdrücklich.

**Nachweis am Bestand:** `syllablesOf` in `data/vocab-helpers.ts` ruft jetzt
`featureFor(entry).annotate(entry)`. Für Thai kommt genau dasselbe heraus wie
vorher — alle Tests der Phasen 3, 6 und 13 blieben ohne eine einzige Änderung
grün, einschließlich der Aussage, dass สวัสดี tief-tief-mittel ist.

**Die deutschen Module hängen an „X → Deutsch", nicht an Thai (Pflicht 6).**
`drillsForDirection` gibt für **jede** Richtung auf `_to_de` die
Grammatikübungen zurück. Sobald Englisch oder Spanisch Inhalte haben, sind
Artikel- und Stammformen-Übung dort ohne weiteres Zutun verfügbar; ein Test
prüft das für alle drei Sprachen. Die Ton-Übungen bleiben, wo sie hingehören.

**Das Merkmal je neuer Sprache — recherchiert, nicht angenommen (Pflicht 4).**
Beide Quellen am 2026-09-03 über die MediaWiki-API im Rohtext abgerufen, wie
in Phase 13:

**Spanisch → Betonung.** Der Artikel „Spanish orthography" sagt wörtlich:
*„Stress in Spanish is marked **unequivocally** through a series of
orthographic rules. The default stress is on the penultimate (next-to-last)
syllable on words that end in a vowel, [n] or [s] (not preceded by another
consonant) and on the final syllable when the word ends in any consonant other
than [n] or [s] or in a consonant group. Words that do not follow the default
stress have an acute accent over the stressed vowel."* Damit ist die spanische
Betonung strukturell **dasselbe** wie der Thai-Ton aus Phase 13: eine aus der
Schreibung ableitbare Regel, kein Gedächtnisstoff. Die passende Übung ist
folglich eine Herleitungsübung nach demselben Muster. Ein Haken, der schon
jetzt benannt gehört: Die Regel setzt eine Silbenzählung voraus, und die
Quelle beschreibt dafür eigene Diphthong- und ⟨h⟩-Regeln — eine spätere Phase
muss die mitnehmen, sonst zählt sie falsch.

**Englisch → Aussprache je Wort.** Derselbe Zugriff auf „English orthography"
ergibt das **Gegenteil**: *„in unfamiliar words and proper nouns, the
pronunciation of some sequences, ⟨ough⟩ being the prime example, is
**unpredictable even for educated native speakers**."* Der Artikel zählt für
⟨ough⟩ mindestens zehn Aussprachen auf (though, tough, cough, through,
thought, thorough, bough, lough …). Eine Herleitungsübung wäre für Englisch
also nicht nur schwierig, sondern **sachlich falsch** — es gibt die Regel
nicht, die sie lehren würde. Das Merkmal muss deshalb je Wort als Lautschrift
hinterlegt werden, und die sinnvolle Übung ist der Vergleich ähnlicher
Schreibungen mit verschiedener Aussprache, nicht die Ableitung.

Der Unterschied steht als Feld im Modell (`kind: 'derivable' | 'per-word'`),
nicht nur im Fließtext — damit eine spätere Phase nicht versehentlich für
Englisch baut, was nur für Spanisch trägt.

**Beide Merkmale sind entschieden, keines ist gebaut** (`implemented: false`).
Der Inhalt kommt je Sprache in einer eigenen Phase mit eigener Recherche, wie
bei Thai in Phase 2. Die Auswahl sagt das auch so: Englisch und Spanisch
stehen sichtbar als „noch keine Inhalte" da, sind nicht anwählbar und melden
das über `accessibilityState.disabled` auch dem Screenreader (Pflicht 5). Sie
lernbar aussehen zu lassen wäre dieselbe Art Unwahrheit wie ein Bild zu einem
abstrakten Wort oder eine erfundene Bestehensgrenze.

### AE-45 — Die spanische Betonung wird hergeleitet, und die Gegenprobe kommt von außen

**Entscheidung:** `lib/stress` leitet Silbentrennung und Betonung aus der
Schreibung ab; die Regeln stehen als zitierte Daten in
`data/spanish-stress.ts` (Wikipedia, „Spanish orthography", Abschnitte *Stress
and accentuation* und *Syllabification*, abgerufen 2026-09-04). Die
Herleitungsübung folgt dem Muster aus Phase 13: Wort zeigen, bestimmen lassen,
den Weg Schritt für Schritt erklären.

**Warum die Gegenprobe nicht gegen die eigenen Daten laufen darf.** Die
abgelegten Silben stammen aus derselben Regel — sie dagegen zu halten hieße,
die Regel gegen sich selbst zu prüfen. Deshalb trägt jeder spanische Eintrag
zusätzlich die **enge** Lautschrift aus Wiktionary (`ipaSyllables`, etwa
`[ˈme.ð̞i.ko]`). Dort markiert die Quelle die Silbengrenzen selbst, wobei der
Betonungsstrich eine Grenze mitvertritt. Ein Test fährt alle 79 Einträge
dagegen: **79 von 79** stimmen in Silbenzahl *und* betonter Silbe überein —
dieselbe Art Nachweis wie die 69 von 69 in Phase 13. Ein zweiter Test hält
Daten und Regel zusammen, damit sie nicht auseinanderlaufen.

**Der Aufwand steckte in der Silbenzählung, nicht in der Betonungsregel.** AE-44
hatte das schon benannt. Nötig waren: Diphthonge (unbetonter hoher Vokal neben
einem anderen), Hiatus durch einen Akut auf ⟨i⟩ oder ⟨u⟩ (`día` ist zweisilbig,
`dia` wäre einsilbig — genau dafür steht das Zeichen), das stumme ⟨h⟩, das
stumme ⟨u⟩ in que/qui/gue/gui, die unteilbaren Anlautverbindungen
(b,c,d,f,g,k,p,t + r/l) und die Digraphen ⟨ch ll rr⟩. Ohne die
Anlautverbindungen käme `ha-blar` als `hab-lar` heraus: gleiche Silbenzahl,
gleiche Antwort, **falsche Anzeige** — ein Fehler, den nur das Auge und nicht
das Ergebnis gefunden hätte.

**Zwei Stellen sind abgegrenzt statt geraten:**

- ⟨tl⟩ wird zurückgewiesen. Die Quelle lässt dort ausdrücklich zwei Trennungen
  zu (`at-le-ta` / `a-tle-ta`).
- Der **unterscheidende** Akut (`dónde`, `sí`, `té`) gibt die richtige Antwort
  mit der falschen Begründung: `donde` wird auch ohne Zeichen auf `don` betont.
  Solche Wörter tragen einen benannten Vorbehalt (`uncertain`), dieselbe
  Mechanik wie eine unsichere Herleitung in Phase 13.

**Folge fürs Datenmodell:** `tone` am Vokabeleintrag ist seit dieser Phase
optional. Ein spanischer Eintrag mit `tone: 'mid'` wäre eine Behauptung über
eine Sprache ohne Töne, und ein Vorgabewert wäre genau die Art stille Unwahrheit,
die dieses Projekt sonst vermeidet.

### AE-46 — Der gemeinsame Begriff trägt die deutsche Seite und das Bildmotiv

**Entscheidung:** Jeder englische und spanische Eintrag mit einem Gegenstück im
Thai-Grundstock trägt dessen ID im Feld `concept`. Zwei Dinge hängen daran.

**Erstens die deutsche Seite.** Genus, Plural, Stammformen und Steigerung wurden
nicht neu erhoben, sondern aus dem in Phase 2 geprüften Eintrag übernommen; ein
Test vergleicht beide Seiten Feld für Feld. **Das ist der eingelöste Nutzen der
Drehscheibe aus AE-42** — bis hierhin war sie eine Behauptung über einen
künftigen Vorteil. Neu zu prüfen waren nur elf deutsche Wörter, und die gegen
de.wiktionary.

**Zweitens das Bildmotiv.** Ein Motiv gehört zum **Begriff**, nicht zur Sprache:
„a small simple house" passt zu บ้าน, `casa` und `house` gleich gut. Der
Bildgenerator greift deshalb über `concept` auf das bereits formulierte Motiv
zurück, statt es dreimal zu erfinden. Drei Motive nennen Thailand ausdrücklich
(Straßenstand, Thai-Banknoten, Thai-Essen) und tragen für die anderen Sprachen
eine eigene Fassung — eine kulturell gefärbte Beschreibung unter spanischer
Flagge wäre schlechter als gar keine.

**Was `concept` nicht ist:** kein Übersetzungsschlüssel und keine Kreuzprodukt-
Hintertür. Englisch↔Spanisch bleibt nicht vorgesehen (AE-42). Das Feld sagt nur,
wo die deutsche Seite herkommt und welches Motiv gemeint ist.

### AE-47 — Für Englisch wird verglichen, nicht hergeleitet

**Entscheidung:** Das englische Merkmal ist die Lautschrift je Wort, und die
Übung dazu ist ein **Vergleich**: Wörter des Grundstocks, die dasselbe
Schriftstück tragen, es aber verschieden aussprechen, bilden eine Gruppe.
Gefragt wird nach dem Laut; die falschen Antworten sind die **echten** Lesarten
der anderen Wörter derselben Gruppe.

**Begründung:** AE-44 hat belegt, dass die englische Aussprache nicht aus der
Schreibung folgt („unpredictable even for educated native speakers"). Eine
Herleitungsübung wäre hier nicht bloß schwierig, sondern **sachlich falsch** —
sie würde eine Regel lehren, die es nicht gibt. Der Vergleich lehrt stattdessen
genau das, was zutrifft: dass man hinsehen muss.

| Schriftstück | Wörter im Grundstock | Lesarten |
| --- | --- | --- |
| ⟨ough⟩ | enough, through, though, thought | /ʌf/ /uː/ /əʊ/ /ɔː/ |
| ⟨ea⟩ | eat, bread, great, year (+ speak, read, tea, teacher) | /iː/ /ɛ/ /eɪ/ /ɪə/ |
| ⟨oo⟩ | food, book, blood (+ look, good, school) | /uː/ /ʊ/ /ʌ/ |
| ⟨o⟩ | not, who, go, one, love | /ɒ/ /uː/ /əʊ/ /ʌ/ |

**Dass das geht, ist eine Eigenschaft des Grundstocks und kein Zufall.** Die
Gruppen wurden bei der Auswahl der Wörter mit angelegt; ohne sie hätte Englisch
ein entschiedenes Merkmal ohne Übungsstoff. Eine Gruppe mit nur einer Lesart
fliegt raus — sie belegt nichts, und die Frage hätte genau eine mögliche
Antwort.

**Wo die Analyse meine ist und wo die der Quelle:** Die Lautschrift stammt aus
Wiktionary, die Zerlegung („in *enough* klingt ⟨ough⟩ wie /ʌf/") ist meine. Ein
Test prüft sie mechanisch: Der angegebene Laut muss wörtlich in der Lautschrift
dieses Wortes stehen. Genau diese Prüfung hat gemeldet, dass Wiktionary bei
`read` ausgerechnet unter „RP" die **Vergangenheit** /ɹɛd/ führt — die Grundform
/ɹiːd/ steht in der UK/AU/NZ-Zeile.

**Zwei Details, die die Übung sonst entwertet hätten**, und beide fielen erst im
Web-Build auf: Das Wort wird **vor** der Antwort nicht vorgesprochen — es zu
hören *wäre* die Antwort. Und als Beispiel an einer Antwortmöglichkeit steht nie
das gefragte Wort selbst.

### AE-48 — Sprachparametrisiert heißt nicht sprachfähig

**Entscheidung:** `planImages`, `planClips` und `planSituations` nehmen eine
Sprache entgegen (Pflicht 4: nachziehen statt duplizieren). **Aber die
Parametrisierung macht noch keinen Inhalt**, und wo er fehlt, steht es dran.

**Sprachsituationen:** Der Aufgabentext an die KI verlangt ausdrücklich
Paiboon-Umschrift und den konsequenten Gebrauch der thailändischen
Höflichkeitspartikel ครับ/ค่ะ. Für Spanisch oder Englisch braucht es einen
eigenen Text mit eigener Recherche — welche Anredeformen dort verbindlich sind,
ist eine Frage wie die aus Phase 7 und keine Übersetzungsaufgabe. `planSituations`
**lehnt** andere Sprachen deshalb ab, statt thailändische Vorgaben unter
spanischer Flagge zu erzeugen.

**Einstellungen:** Die Laufumfänge tragen sichtbar „(Thai)". Eine Zahl ohne
Sprache wäre dort eine stille Falschaussage, und still falsche Zahlen sind
schlimmer als sichtbar unvollständige.

**Sprechübung:** Das F0-Verfahren aus Phase 12 misst Tonhöhenkonturen. Ob
dasselbe Werkzeug spanische Betonung erkennen kann, ist eine **offene Frage und
keine Selbstverständlichkeit**: Betonung ist im Spanischen über Dauer,
Lautstärke *und* Tonhöhe realisiert, und welcher Anteil messbar durchschlägt,
hat niemand gemessen. Die Übung bleibt deshalb auf Thai beschränkt, statt eine
Bewertung zu liefern, deren Grundlage ungeprüft ist. Das ist der Befund, nicht
ein Versäumnis — er gehört vor einen Umbau, nicht danach.

### AE-49 — Weitermachen statt Standard setzen

**Entscheidung:** Der Lernen-Reiter merkt sich, welche Richtung und welche
Übung zuletzt offen waren, und öffnet sie beim nächsten Mal wieder. Der
Gespräch-Reiter merkt sich seine Richtung. Zurückgesetzt wird beides **nur**
durch eine Sprachwahl auf der Übersicht — auch dann, wenn dieselbe Sprache
noch einmal gewählt wird. Die **Standard-Lernrichtung** aus AE-17 samt „Immer
fragen" und dem Knopf „☆ Als Standard merken" entfällt.

**Begründung.** Der Gedanke von AE-17 war richtig: Die Richtung jedes Mal neu
zu wählen ist Reibung mit vorhersehbarer Antwort. Die Umsetzung war es nicht.
Man musste einen Standard **setzen**, um ihn zu haben, ihn in den Einstellungen
wieder aufheben, und er kannte nur die Richtung — nicht die Übung, in der man
tatsächlich steckte. Ein Lesezeichen leistet dasselbe, ohne dass jemand etwas
einstellt, und es leistet mehr, weil es auch die Übung trägt.

**Die Sorge aus AE-17 bleibt beantwortet:** Ein Standard darf keine
Einbahnstraße werden. Deshalb ist die Sprachwahl auf der Übersicht ausdrücklich
die Geste „von vorn anfangen" — sie setzt zurück, und zwar sichtbar dort, wo
man sie sucht. Zusätzlich bleiben Sprache und Richtung im Lernen-Bereich selbst
jederzeit wechselbar.

**Der gemerkte Stand gehört zur Sprache.** `loadProfile` verwirft einen Stand,
dessen Richtung zu einer anderen Sprache gehört. Ohne das zeigte der Reiter
nach einem Wechsel eine Richtung, die es dort gar nicht gibt.

**Gemerkt wird beim Ankommen, nicht beim Knopfdruck.** Man kommt auf drei Wegen
in den Lernbereich: über die Übungsleiste, über eine Richtungskarte auf der
Übersicht und über eine Adresse mit `?direction=`. Am Knopf zu merken erwischte
nur den ersten — im Web-Build fiel genau das auf. Es hängt jetzt an einem
Effekt auf dem, was wirklich offen ist.

**Folge für die Einstellungen:** Die Karte „Lernprofil" ist ersatzlos
entfallen. Ohne Standard-Lernrichtung gab es dort nichts mehr einzustellen; die
Sprache wechselt man auf der Übersicht und in drei der Reiter.

### AE-50 — Die Stimmlage ist belegt, wo sie belegbar ist — und sonst nicht

**Entscheidung:** Bei Gemini gibt es zwei Knöpfe „Weiblich" / „Männlich", die
eine namentlich belegte Stimme setzen. Bei ChatGPT gibt es sie **nicht**, und
an ihrer Stelle steht, warum.

**Der Weg dorthin.** Gewünscht war eine Auswahl nach Geschlecht. Die
Gemini-Unterlagen, aus denen die Stimmnamen stammen, nennen zu jeder Stimme
einen Stilbegriff („Firm", „Upbeat", „Informative") und **kein Geschlecht**.
Bei OpenAI steht dazu ebenfalls nichts — dort gibt es nur eine Liste von
dreizehn Namen. Damit war der Wunsch aus den naheliegenden Quellen nicht zu
erfüllen, und eine Zuordnung nach dem Klang des Namens („Kore klingt
weiblich") wäre genau die Art Behauptung, die dieses Projekt sonst vermeidet.

**Google veröffentlicht es an anderer Stelle.** Die Seite „Chirp 3: HD voices"
der Cloud-Text-to-Speech-Unterlagen führt **dieselben dreißig Namen** in einer
Tabelle mit den Spalten „Name" und „Gender". Beide Listen wurden am 2026-09-04
abgerufen und Name für Name abgeglichen; sie stimmen vollständig überein. Damit
ist die Angabe für Gemini belegt.

**Für OpenAI bleibt sie unbelegt, und dann steht dort keine.** Die Oberfläche
sagt das ausdrücklich, statt die Knöpfe grau zu zeigen oder still wegzulassen —
ein Nutzer, der sie bei einem Anbieter sieht und beim anderen nicht, hat
Anspruch auf den Grund.

**Vorgabe je Lage:** Kore („Firm") und Charon („Informative"). Bewusst nicht
die erste der Liste: Für Vokabeln und Beispielsätze trägt eine ruhige, deutlich
sprechende Stimme besser als „Excitable". Wer eine andere will, trägt den Namen
ins Feld darunter ein; die Beschreibung darunter nennt dann Geschlecht und
Stilbegriff der eingetragenen Stimme — oder meldet, dass der Anbieter diesen
Namen nicht führt.

**Was damit NICHT belegt ist:** wie die Stimmen klingen. Ohne gültigen
Schlüssel (B-6) wurde kein einziger Clip erzeugt. Belegt ist die Angabe des
Anbieters, nicht das Hörergebnis.

### AE-51 — Jede Sprache hat eine Hör- und eine Leseübung ihres Merkmals

**Entscheidung:** Zu jedem Sprachmerkmal gehören zwei Übungen — eine, die es
aus der Schrift erschließt, und eine, die es hörbar macht. Neu dazugekommen
sind „Betonung hören" (Spanisch) und „Wort hören" (Englisch).

**Begründung — eine Lücke, keine Entscheidung.** Nach Phase 16 hatte nur Thai
beides. Spanisch und Englisch bekamen je eine Leseübung ihres Merkmals, aber
nichts fürs Ohr, und das war kein Befund, sondern schlicht nicht gebaut:
Betonung ist hörbar, und englische Wörter mit gleicher Schreibung
auseinanderzuhalten ist genau die Übung, an der man im Alltag scheitert.

**Die entscheidende Zeile der spanischen Hörübung** ist `withoutAccent`: Die
Silben stehen **ohne Akzentzeichen** in der Auswahl. Stünde „mé" dort, wäre die
Antwort abzulesen statt zu hören, und die Übung prüfte nichts. So sieht man,
welche Silben es gibt, und muss hören, welche getragen wird.

**Die englische Hörübung ist die Umkehrung der Vergleichsübung** aus AE-47:
nicht sehen und den Laut wählen, sondern hören und die Schreibung wählen. Die
Ablenker sind die anderen Wörter derselben Schriftstück-Gruppe — echte Wörter
des Grundstocks, keine erfundenen. Dass eine Aussprache sich nicht **herleiten**
lässt (AE-44), heißt nicht, dass man sie nicht **erkennen** kann.

**Die Übungen stehen jetzt nach Fertigkeit gruppiert:** Wortschatz, Hören,
Lesen, Sprechen, Schreiben, Deutsche Grammatik — in fester Reihenfolge über
alle Sprachen. Eine flache Reihe sagte nicht, dass das verschiedene Dinge sind,
und nach einem Sprachwechsel hätte „Hören" an einer anderen Stelle gestanden.

---

## Protokoll

### 2026-08-30 — Phase 0: Setup

**Gemacht**

- Abgebrochenes Scaffold in `my-app/` bereinigt, Git-Repo in den Projekt-Root
  gehoben (siehe AE-2).
- `npx create-expo-app@latest --template default` → Expo SDK 57, React 19.2,
  React Native 0.86, `expo-router` 57, TypeScript 6. Scaffold in den
  Projekt-Root verschoben.
- App-Identität gesetzt: Name „Thai Lernbegleiter", Slug `thai-lernbegleiter`,
  Scheme `thailernbegleiter`.
- Laufzeit-Abhängigkeiten über `npx expo install` (SDK-passende Versionen):
  `expo-sqlite`, `expo-speech`, `expo-secure-store`, `expo-audio`,
  `@react-native-async-storage/async-storage`, `@expo/vector-icons`.
- Test-Werkzeuge: `jest`, `jest-expo`, `@types/jest`.
- Web-Support von `expo-sqlite` im installierten Paket selbst nachgeprüft →
  AE-3.
- Fünf Platzhalter-Screens unter `src/app/`: `index` (Übersicht), `review`
  (Lernen), `conversation` (Gespräch), `progress` (Fortschritt), `settings`
  (Einstellungen). Template-Screen `explore.tsx` entfernt.
- Navigation auf fünf Bereiche erweitert, Plattform-Split → AE-4.
- Gemeinsame Bausteine: `ScreenScaffold` (zentriert, `maxWidth` 800 → gute
  Figur auf Handy **und** im breiten Browser) und `PlaceholderCard` (zeigt in
  der laufenden App an, welche Phase den jeweiligen Bereich füllen wird).
- Tondaten aus dem Referenzprototyp nach `src/constants/tones.ts` übernommen
  (Labels, Farben, Konturpfade, Tonzeichen). Der Kommentar dort hält fest, dass
  das Tonzeichen allein den Ton nicht bestimmt (Konsonantenklasse und
  Silbentyp zählen mit) — die Angabe ist Lernhilfe für die Legende, keine
  Rechtschreibregel.
- `.claude/launch.json` für den Web-Dev-Server ergänzt.

**Verifiziert**

- `npx tsc --noEmit` läuft fehlerfrei durch.

**Offen / als Nächstes**

- Siehe TODO-Liste am Ende.

### 2026-08-30 — Phase 1: FSRS-Engine & Persistenzschicht

**Gemacht**

- `src/lib/fsrs/` — Typen (`Direction`, `Rating`, `CardState`, `FSRSCardState`)
  und Engine als reine Funktionen: `createCardState`, `retrievability`,
  `nextIntervalDays`, `reviewCard`, `isDue`, `dueCards`. Formeln unverändert
  aus dem Referenzprototyp; der Modulkommentar hält ausdrücklich fest, dass
  `DEFAULT_WEIGHTS` eine **Näherung** an veröffentlichte FSRS-Gewichte ist und
  keine zertifizierte Kopie.
- `src/lib/storage/` — Persistenz-Abstraktion nach AE-3, umgesetzt als
  Dokumentspeicher (`Sammlung` + `ID` + JSON-Wert) über fünf Sammlungen:
  `vocab`, `cards`, `situations`, `exam`, `meta`. Damit sind alle Datentypen
  des Projekts abgedeckt, auch die aus Phase 4, 5 und 7.
  - `backend.ts` (nativ) → eine SQLite-Tabelle, `putMany` in einer Transaktion.
  - `backend.web.ts` (Web) → ein JSON-Blob je Sammlung in AsyncStorage.
  - `memory-store.ts` → für Tests und als Notnagel.
  - `index.ts` → `getStore()` als Singleton. Schlägt die Initialisierung des
    Plattform-Backends fehl, fällt die App auf den Memory-Store zurück und
    startet trotzdem; `getActiveBackend()` sagt, was wirklich läuft.
- `src/lib/repository.ts` — typisierte Zugriffe (`loadOrCreateCardState`,
  `saveCardState`, `loadCardStatesForDirection`, `readMeta`/`writeMeta`), damit
  die Screens weder Sammlungsnamen noch Schlüsselformate kennen müssen.
- Jest eingerichtet (`jest-expo`), `@types/jest` über `types` in der
  `tsconfig.json` aktiviert.
- Auf dem Screen „Lernen" eine Persistenz-Prüfung ergänzt: eine echte
  FSRS-Karte (ไก่ *gài*), Bewertungsknöpfe, alle Kennzahlen und die Anzeige des
  aktiven Speicher-Backends. Phase 3 ersetzt das durch den richtigen
  Karteikarten-Flow.

**Verifiziert**

- `npm test` → **49 Tests grün** in 2 Suites.
  - `fsrs.test.ts` prüft die Retrievability-Kurve gegen die Formel selbst,
    Monotonie über die Zeit, das Verhalten bei `t < 0`, die Zielretention am
    Fälligkeitszeitpunkt, `S = W[rating-1]` bei Erstbewertung, die Ordnung
    Leicht > Gut > Schwer, Lapse-Zählung, die Grenzen 1..10 für Difficulty auch
    nach 50 Lapses, Unveränderlichkeit der Eingabekarte und den Abstandseffekt
    (späte Wiederholung bringt mehr Stabilität als sofortige).
  - `storage.test.ts` fährt **dieselbe Vertragsprüfung gegen beide
    Backends** (Memory und AsyncStorage-Web), damit sich die Plattformen nicht
    auseinanderentwickeln — inklusive Trennung der Sammlungen, `putMany`,
    Kopiersemantik beim Lesen und Neustart-Persistenz. Ein beschädigter
    JSON-Blob führt zu einer leeren Sammlung statt zu einem Absturz.
- `npx tsc --noEmit` fehlerfrei.
- **Web-Persistenz am laufenden Gerät geprüft:** Karte im Browser zweimal
  bewertet (Gut, Leicht) → `reps 2`, `Stabilität 2.40`, `Difficulty 4.07`;
  danach die Seite vollständig neu geladen → identische Werte. Anzeige des
  Backends: `async-storage`, wie nach AE-3 erwartet. Keine Konsolenfehler.

**Beobachtung, die keine Fehlfunktion ist**

Zweimal direkt hintereinander bewerten lässt die Stabilität *nicht* steigen
(hier: 2.40 nach „Gut", danach unverändert 2.40 nach „Leicht"). Das ist so
gewollt: bei Retrievability 1 ist der Wachstumsterm
`exp(W[10] * (1 - R)) - 1` gleich null. Massiertes Wiederholen ohne zeitlichen
Abstand bringt keinen Lernzuwachs — genau der Abstandseffekt, den FSRS abbildet.

**Offen**

- Persistenz **in Expo Go auf dem Handy** (SQLite-Pfad) ist noch nicht
  bestätigt — das kann nur der Nutzer auf seinem Gerät prüfen. Der
  SQLite-Pfad ist deshalb bislang nur typgeprüft, nicht am Gerät verifiziert.

### 2026-08-30 — Blocker B-1 erledigt

Der Nutzer hat den Gerätecheck in Expo Go durchgeführt und bestätigt: alle
fünf Tabs sichtbar, Kartenwerte bleiben nach vollständigem Schließen und
Neuöffnen der App stehen, unter „Speicher:" steht `expo-sqlite`. Damit sind
die beiden offenen Abnahmekriterien aus Phase 0 (Navigation in Expo Go) und
Phase 1 (Kartenzustand übersteht Neustart nativ) erfüllt; **B-1 ist
geschlossen**. Der SQLite-Pfad ist damit nicht mehr nur typgeprüft, sondern am
Gerät verifiziert.

### 2026-08-30 — Phase 2: Vokabular-Grundstock

**Gemacht**

- `src/data/vocabulary.ts` — **84 Einträge**, bidirektional vollständig, nach
  dem `VocabEntry`-Schema.
- `src/lib/repository.ts` um `seedVocabulary`, `loadVocabulary` und
  `loadVocabEntry` erweitert. Das Einspielen ist idempotent und fasst die
  Sammlung `cards` (Nutzerfortschritt) nicht an.
- Auf der Übersicht eine Zusammenfassung ergänzt, die den Grundstock **über
  die Persistenzschicht** lädt — die angezeigten Zahlen kommen also aus dem
  Speicher, nicht direkt aus dem Modul.

**Quelle und Prüfverfahren (Thai-Seite)**

- Geplant war thai-language.com. Die Seite ist über HTTPS **nicht abrufbar**
  (selbstsigniertes Zertifikat), also wurde auf das **englische Wiktionary**
  ausgewichen — pro Eintrag als `source` verlinkt.
- Abgefragt wurde nicht die ganze Seite, sondern über die Sections-API gezielt
  der **Abschnitt „Thai"**. Das war nötig: ein erster Durchlauf, der nur am
  Stichwort „Paiboon" verankert war, hatte bei ดี die IPA eines
  fremdsprachigen Eintrags (`/di/`, „crossbow") gegriffen und bei ไป
  Nordthai-Inhalt eingeblendet. Nach der Umstellung stimmten alle Töne des
  ersten Laufs bis auf น้ำ (`náam` statt `nám`).
- **Töne wurden nicht aus Tonbezeichnungen im Fließtext übernommen**, sondern
  aus der IPA-Tonkontur abgeleitet:
  `˧` mid · `˨˩` low · `˥˩` falling · `˦˥` high · `˩˩˦` rising.
  Das war keine Förmlichkeit: eine Fließtext-Zusammenfassung bezeichnete
  `/kaj˨˩/` (ไก่) fälschlich als „falling" — richtig ist **tief**. Die
  abgeleiteten Töne decken sich mit den Tonregeln, etwa ร้อน (tiefe
  Konsonantenklasse + mai tho → **hoch**, nicht fallend).
- Für alle 84 Einträge stimmt die Silbenzahl der Paiboon-Umschrift mit der der
  IPA überein; daraus entstand das Feld `syllables` (Umschrift + Ton je Silbe).

**Abweichung vom Datenmodell, bewusst — siehe AE-7**

Das skizzierte `tone`-Feld ist nur für einsilbige Wörter eindeutig. Ergänzt
wurde deshalb `syllables: { roman, tone }[]`; `tone` bleibt als Ton der ersten
Silbe erhalten. สวัสดี ist dafür das Musterbeispiel: der Referenzprototyp führte
es pauschal als „mid", tatsächlich ist es **tief-tief-mittel**.

**Zwei Einträge bewusst NICHT als geprüft markiert**

| Eintrag | Warum `sourceVerified: false` |
| --- | --- |
| ร้าน `ráan` | Der Thai-Abschnitt belegt nur „Stand, Bude, Plattform". Die Alltagsbedeutung „Laden, Geschäft" steht dort ausschließlich im Khmer/Lao-Vergleich der Etymologie. |
| นอน `nɔɔn` | Die Thai-Definition lautet nur „to lie or lay down". „schlafen" erscheint bloß in der Proto-Tai-Etymologie; eindeutig „schlafen" ist นอนหลับ. |

Beide tragen den Grund in `verificationNote` und sind damit im Lernbetrieb
erkennbar. Der Rest (82 von 84) ist in Ton, Umschrift **und** Bedeutung
gedeckt.

**Deutsche Seite**

Weil die App auch Thailändern Deutsch beibringt, trägt jeder Eintrag die
Angaben, an denen Thai-Muttersprachler scheitern:

- **Substantive:** Genus und Plural (`germanNoun`), das Genus zusätzlich im
  Stichwort („das Haus"). Hinweise dort, wo es weh tut — n-Deklination bei
  „der Mensch" (den/dem/des Menschen), Umlautplurale, fehlender Plural bei
  „das Obst".
- **Verben:** 3. Person Singular, Präteritum und Perfekt **mit Hilfsverb**
  (`hat`/`ist`) — ein Test erzwingt das, weil „haben" gegen „sein" eine eigene
  Fehlerquelle ist. Vokalwechsel und untrennbare Präfixe stehen als Hinweis
  (z. B. „verstehen" hat kein `ge-` im Partizip).
- **Adjektive:** Steigerung, unregelmäßige ausdrücklich begründet
  (gut/besser, viel/mehr, groß/größer, teuer → teurer).

**Beispielsätze**

Zusammengesetzt ausschließlich aus Wörtern, die in derselben Datei verifiziert
sind — jede Silbe der Beispiel-Umschrift stammt also aus einem geprüften
Eintrag. Die Sätze folgen einfachen Mustern (Subjekt-Verb-Objekt, Substantiv
mit nachgestelltem Adjektiv), sind als **ganze Sätze aber nicht einzeln
gegen eine Quelle geprüft**. Das steht auch im Kopfkommentar der Datendatei.

**`isConcrete`**

25 Einträge sind konkret, ausnahmslos Substantive. Tests stellen sicher, dass
Partikel, Pronomen, Zahlwörter, Adverbien, Interjektionen, Adjektive und
Verben **nie** als konkret markiert werden — die Bild-Pipeline in Phase 5 soll
für „nicht" oder „ครับ" gar nicht erst anlaufen.

**Verifiziert**

- `npm test` → **154 Tests grün** in 3 Suites (vorher 49).
  `vocabulary.test.ts` prüft Anzahl (50–100), eindeutige IDs und Thai-Formen,
  Schema-Konformität jedes Eintrags einzeln, Übereinstimmung von `tone` mit
  `syllables[0]`, verlustfreie Silbenzerlegung, die deutschen Pflichtangaben je
  Wortart, Bidirektionalität, dass jedes Beispiel sein Stichwort enthält, die
  `isConcrete`-Regeln, sowie Round-Trip und Idempotenz über die
  Persistenzschicht.
- Eine Prüfung schlägt bewusst Alarm, wenn **alles** als `sourceVerified: true`
  markiert wäre (Quote muss `>= 0.9` und `< 1` sein) — pauschales Abhaken wäre
  ein Zeichen dafür, dass gar nicht geprüft wurde.
- `npx tsc --noEmit` fehlerfrei.
- Im Browser gegengeprüft: Übersicht zeigt „84 Einträge · 82 von 84
  quellengeprüft · 25 bildfähig", geladen über die Persistenzschicht.

### 2026-08-30 — Phase 3: Lern-UI

**Gemacht**

- `src/lib/audio.ts` — Aussprache-Abstraktion. Aufrufer sagen nur *was* und *in
  welcher Sprache*; das Modul entscheidet: vorproduzierter Clip, falls sich
  `audioAssetId` auflösen lässt, sonst `expo-speech` (`th-TH` bzw. `de-DE`,
  Thai langsamer). Der Content-Schritt hängt später nur einen Auflöser über
  `registerAudioAssetResolver` ein — **kein Umbau an den Screens**. Genau das
  ist als Test abgesichert.
- `src/lib/review-session.ts` — Sitzungslogik: `ensureCardStates` (legt fehlende
  Karten in **einem** `putMany` an), `buildReviewQueue` (fällige Karten über
  `dueCards`, aufsteigend nach Retrievability), `summarizeDirection`.
- `rateCard` in der Repository-Schicht ergänzt: verbindet das bestehende
  `reviewCard` mit der Persistenz. Die Screens fassen weder Formeln noch
  Speicher direkt an.
- Komponenten: `ToneContour` (SVG-Konturglyphen aus dem Referenzprototyp),
  `ToneLegend`, `ThaiWord` (silbenweise Tonfarben), `VerificationBadge`,
  `Flashcard`, `DirectionDashboard`.
- `src/data/vocab-helpers.ts` — `syllablesOf`, `uniformTone`, `isMultiSyllable`.
- `react-native-svg` ergänzt (SDK-passend über `npx expo install`).

**Pflicht 1 — silbenweise Tonfarben**

`ThaiWord` wertet `syllables[]` aus. Das Feld `tone` wird **nur** benutzt, wenn
`syllables` fehlt oder leer ist (Altdatensätze vor AE-7); ein Test hält
ausdrücklich fest, dass der Normalfall nicht über `tone` läuft.
Im Browser gegengeprüft und im DOM nachgemessen: bei สวัสดี hat `sà` die Farbe
`rgb(79,96,118)` (tief), `wàt` dieselbe, `dii` dagegen `rgb(111,138,106)`
(mittel) — tief-tief-mittel, wie gefordert. Alle fünf Konturpfade rendern mit
ihren eigenen Farben.
Zur Grenze bei der Thai-Schrift siehe **AE-8**.

**Pflicht 2 — Bidirektionalität**

Das Dashboard zeigt zwei getrennte Karten mit eigener Fälligkeitszahl,
Gesamtzahl, „neu" und „gemeistert" — keine gemeinsame Summe. Ohne gewählte
Richtung startet keine Sitzung (`/review` zeigt sonst die Richtungsauswahl).
Vorder- und Rückseite tauschen: bei `th_to_de` vorne die Thai-Schrift, bei
`de_to_th` vorne das deutsche Wort samt Grammatik. Ein Test belegt, dass
Bewertungen in einer Richtung die andere unberührt lassen.

Die Tonfarben erscheinen bewusst erst beim Aufdecken — vorher wären sie bei
`th_to_de` die halbe Antwort.

**Pflicht 3 — unverifizierte Einträge**

`VerificationBadge` erscheint ausschließlich bei `sourceVerified: false` und
zeigt „⚠ Bedeutung nicht quellengeprüft"; Antippen klappt die
`verificationNote` auf. Geprüfte Karten bekommen **kein** Abzeichen — sonst
wäre es überall und würde nichts mehr unterscheiden. Im Browser mit นอน
durchgespielt.

**Nebenbei aufgeräumt**

In Phase 2 trug `verificationNote` zweierlei: Grammatikhinweise **und**
benannte Unsicherheiten. Das ist jetzt getrennt — `note` für Lernhinweise,
`verificationNote` nur noch für ungeprüfte Einträge. Ein Test stellt sicher,
dass geprüfte Einträge gar kein `verificationNote` haben.

**Zwei echte Fehler beim Testen gefunden und behoben**

1. *Layout:* Die beiden Richtungskarten waren unterschiedlich breit (im DOM
   gemessen: Container 343 px, Karten 306 px und 290 px). Ursache: `Link asChild`
   macht aus dem `Pressable` ein `<a>`, und das wuchs im Web-Build nicht auf die
   Spaltenbreite, sondern blieb bei seiner Inhaltsbreite. Die Flex-Größe hängt
   jetzt an einem neutralen `View` als Flex-Kind.
2. *Test-Umgebung:* `expo-audio` ließ sich im Jest-Prozess gar nicht
   importieren (natives Modul). Es wird jetzt erst **im** `playAsset`-Zweig
   dynamisch geladen — der bis zum Content-Schritt ohnehin nie betreten wird.

**Verifiziert**

- `npm test` → **187 Tests grün** in 6 Suites (vorher 155). Neu:
  `vocab-helpers.test.ts` (Silbenauswertung inkl. Fallback-Verhalten),
  `review-session.test.ts` (Kartenanlage, Richtungstrennung,
  Retrievability-Sortierung, Fälligkeit), `audio.test.ts` (Locale je Sprache,
  Abbruch vor neuer Ausgabe, Umschalten auf Clips ohne Screen-Änderung).
- `npx tsc --noEmit` fehlerfrei.
- **Im Browser durchgespielt:** vollständige Sitzung in **beiden** Richtungen —
  aufdecken, bewerten, Karte wechselt weiter (Karte 1 → 2), Sitzungsabschluss.
  Bei **1280 px** stehen die Richtungskarten in zwei gleich breiten Spalten,
  bei **375 px** untereinander und die Bewertungsknöpfe brechen auf 2×2 um.

**Offen**

- Der Durchlauf **in Expo Go am Gerät** ist noch nicht bestätigt — das kann nur
  der Nutzer prüfen (Blocker **B-2**). Besonders zu beachten: ob auf dem Gerät
  eine **Thai-Stimme** installiert ist; ohne sie bleibt „Thai anhören" stumm,
  was kein Fehler der App ist, sondern eine Systemeinstellung.

### 2026-08-30 — Zusatz: Lernstatistik (Nachtrag aus Phase 3)

Der Fortschritt-Tab war noch Platzhalter. Er zeigt jetzt echte Daten:
Wiederholungen heute, Tage in Folge, fällige Karten, Kartenzustände als
gestapelter Balken und ein Diagramm der letzten 14 Tage. Datenmodell-Frage
geklärt → **AE-9** (Tagesprotokoll statt Näherung), Einschränkung im UI
benannt. Lücken im Diagramm werden mit Nullen aufgefüllt statt
zusammengeschoben; die Tagesserie bricht nicht ab, nur weil heute noch nichts
gelernt wurde. 19 neue Tests für Tagesschlüssel, Protokollierung, Lücken,
Serienberechnung und Aggregation.

### 2026-08-30 — Phase 4: Content-Generator für Sprachsituationen

**Gemacht**

- `src/lib/conversation/` — `types.ts` (Schema, Themen, Niveaus), `plan.ts`
  (deterministischer Bauplan), `generator.ts` (Prompt, API-Aufruf, strenge
  Prüfung der Antwort), `batch.ts` (robuster Lauf).
- `src/lib/api-key.ts` — Ablage nach AE-10.
- Einstellungs-Screen: Schlüsselfeld, Umfangwahl (Probelauf 16 /
  vollständiger Lauf 512), Start und Anhalten, Fortschrittsbalken mit
  **getrennten** Zählern, aufklappbare Fehlerliste, Löschen des Bestands.
- Gespräch-Screen: Filter nach Richtung, aufklappbare Situationen mit
  Szenenbeschreibung, Zügen (Thai / Umschrift / Deutsch), Sprechtaste je Zug
  und Korrektur-Hinweisen. Eigene Zeilen sind farbig markiert.
- `metro.config.js` ergänzt → AE-12.

**Kein Live-Chat** — bewusst. Die Dialoge entstehen einmalig als
`scriptTurns`, danach braucht das Üben weder Netz noch Schlüssel.

**Robustheit (Pflicht 2), nachweislich geprüft**

Sofort speichern statt am Ende sammeln; Fehler zählen und weitermachen statt
abbrechen; Vorhandenes überspringen; abbrechbar. Belegt durch Tests *und*
einen echten Lauf gegen die API:

- Fehler mitten im Lauf → 14 erzeugt, 2 fehlgeschlagen, alle 16 angefasst.
- Drei Fehler gleich zu Beginn → die übrigen 13 sind trotzdem gespeichert.
- Zweiter Lauf → 12 übersprungen, nur die 4 fehlenden angefragt.
- Dritter Lauf → gar kein API-Aufruf mehr.
- Abbruch nach 5 → die 5 bleiben erhalten.
- Unbrauchbare Antwort → gilt als Fehlschlag, nichts Halbes wird gespeichert.

**CORS (Pflicht 4) — empirisch belegt, nicht angenommen**

Aus dem laufenden Web-Build heraus gegen `api.anthropic.com` geprüft:

| Anfrage | Ergebnis |
| --- | --- |
| **ohne** `anthropic-dangerous-direct-browser-access` | `TypeError: Failed to fetch` — CORS blockt |
| **mit** dem Header | HTTP 401 mit sauberem JSON `authentication_error` |

Der Header ist also tatsächlich nötig, und mit ihm ist der Netzwerkweg frei.

**Durchlauf durch den echten SDK**

Mit einem absichtlich ungültigen Dummy-Schlüssel im Web-Build gestartet:
16/16 verarbeitet, 0 erzeugt, 16 fehlgeschlagen, jeder Fehlschlag mit ID und
Grund (`401 authentication_error`), **0 Einträge gespeichert**. Damit sind
Bündelung, Header, Anfrageform, Fehlerbehandlung und Batch-Verhalten unter
echten Netzwerkbedingungen belegt — nur die Gültigkeit des Schlüssels fehlte.

**Offline-Wiedergabe geprüft**

Zwei Situationen im Schema eingespielt, Gespräch-Screen zeigt sie mit allen
Zügen und Hinweisen; nach vollständigem Neuladen unverändert vorhanden
(„2 Situationen — offline nutzbar"), ohne Schlüssel und ohne Netzanfrage. Die
Testdaten wurden danach wieder entfernt.

**Antwortformat**

JSON im Prompt verlangt und streng geprüft, statt `output_config.format` zu
verwenden. Grund: ohne echten Schlüssel ließ sich das hier nicht gegen die API
testen. Ein Fehler im Schema-Parameter hätte **jeden** Aufruf zum Scheitern
gebracht; eine unerwartete Antwortform zeigt sich dagegen als *ein*
fehlgeschlagener Eintrag, den der Batch übersteht. Strukturierte Ausgaben sind
die natürliche Verbesserung, sobald ein echter Lauf die Basis bestätigt.

**Verifiziert**

- `npm test` → **237 Tests grün** in 9 Suites (vorher 187).
- `npx tsc --noEmit` fehlerfrei.
- Layout bei 375 px und im breiten Fenster geprüft.

**Nachtrag: die letzte Lücke so weit wie möglich geschlossen**

Auf dem Rechner sind keine Zugangsdaten hinterlegt (weder
`ANTHROPIC_API_KEY` noch `ANTHROPIC_AUTH_TOKEN`, kein `ant`-CLI, kein
Profilverzeichnis) — nachgesehen, nicht vermutet. B-3 lässt sich hier also
nicht schließen. Zwei Dinge, die stattdessen gemacht wurden:

1. **Prompt-Vertrag getestet** (`prompt-contract.test.ts`). Der Lauf mit
   ungültigem Schlüssel konnte alles prüfen außer einem: ob eine Antwort, die
   genau der im Prompt verlangten Form folgt, auch durch die Prüfung kommt.
   Zwei ausformulierte Musterantworten — eine je Richtung — decken das jetzt
   ab, inklusive Zuglänge, Sprecherwechsel, Vollständigkeit der drei
   Sprachfassungen und **richtungsspezifischer** Korrektur-Hinweise (Töne und
   Klassifikatoren gegen Artikel, Kasus, Verbstellung — der Kern von AE-11).
   Das ersetzt keinen echten Lauf, fängt aber genau den Fehler ab, der sonst
   erst beim ersten bezahlten Aufruf aufgefallen wäre: dass Prompt und Parser
   auseinandergelaufen sind.
2. **`output_config: { effort: 'low' }`** ergänzt. Ein kurzer A1/A2-Dialog in
   vorgegebenem JSON ist eine einfache Aufgabe; bei 512 Aufrufen im vollen
   Lauf schlägt der Unterschied im Aufwand spürbar auf Kosten und Dauer durch.

**Offen**

- Ein Lauf mit **gültigem** Schlüssel steht aus. Das ist Blocker **B-3** und
  bleibt beim Nutzer: fremde API-Schlüssel gebe ich nicht ein, und auf diesem
  Rechner sind keine hinterlegt. Alles davor ist geprüft — CORS empirisch,
  SDK-Bündelung, Anfrageform, Fehlerverhalten, Batch-Robustheit,
  Offline-Wiedergabe und jetzt auch der Prompt-Vertrag.
- Gerätecheck in Expo Go (**B-2**) bleibt offen, weil der Apple-Signierweg dem
  Nutzer zu aufwendig ist. Damit sind Phase 3 und 4 auf dem Gerät unbestätigt;
  im Web-Build ist beides geprüft.

### 2026-08-31 — Blocker B-3 erledigt

Der Nutzer hat den Probelauf des Sprachsituationen-Generators mit einem
gültigen Anthropic-Schlüssel durchgeführt und bestätigt. Damit ist das letzte
offene Abnahmekriterium aus Phase 4 erfüllt; **B-3 ist geschlossen**. Die
genauen Zahlen des Laufs liegen mir nicht vor — falls sie hier stehen sollen,
bitte nachtragen.

### 2026-08-31 — Phase 5: Content-Generator für Bilder

**Gemacht**

- `src/lib/generation/` — der Batch-Läufer, jetzt tatsächlich anbieter- und
  inhaltsunabhängig: `batch.ts` (`runBatch`, `missingFrom`, `BatchProgress`),
  `types.ts` (`GenerationSpec`, `BatchTask`), `plan.ts` (`limitPlan`,
  `assertUniqueIds`).
- `src/lib/images/` — `types.ts` (Schema, Blob-Schnittstelle), `motifs.ts`
  (25 Motive), `plan.ts` (Bauplan + isConcrete-Tor), `generator.ts` (Prompt,
  API-Aufruf, strenge Antwortprüfung), `batch.ts` (Ablage), `blob-backend.ts`
  / `blob-backend.web.ts` / `blob-memory.ts` / `blob-store.ts`.
- `api-key.ts` hält zwei Schlüssel getrennt (AE-13).
- Sammlung `images` im Dokumentspeicher (AE-14); Repository-Zugriffe
  `loadVocabImage`, `loadVocabImageUri`, `countVocabImages`,
  `clearVocabImages`.
- `components/generator-card.tsx` — die Generator-Karte (Schlüsselfeld,
  Umfang, Start/Anhalten, Fortschritt, Fehlerliste, Löschen) einmal gebaut,
  zweimal benutzt. Der Einstellungs-Screen ist dadurch kürzer als vorher, statt
  eine zweite Kopie derselben Bedienung zu tragen.
- `components/vocab-image.tsx` — das Bild auf der Karteikarte.

**Pflicht 1 — Bestehende Infrastruktur wiederverwendet, und dabei eine
Selbstkorrektur**

Das Protokoll führte `plan.ts` / `batch.ts` aus Phase 4 als „bewusst generisch,
nicht an Sprachsituationen gebunden". Beim Nachsehen stimmte das nicht:
`runGenerationBatch` war fest mit der Sammlung `situations`, dem Typ
`ConversationSituation` und dem Dialog-Client verdrahtet. Der Läufer ist jetzt
wirklich generisch — die vier Robustheitsregeln stehen einmalig in
`lib/generation/batch.ts`, und was ein Eintrag ist, wann er als vorhanden gilt
und wie er abgelegt wird, steckt im `BatchTask`. `conversation/batch.ts` ist
zum dünnen Adapter geschrumpft; **alle 23 Tests aus Phase 4 laufen unverändert
weiter**, was zugleich belegt, dass sich das Verhalten nicht verschoben hat.
`plan.ts` blieb getrennt: Situationen sind ein Kreuzprodukt, Bilder eine
Auswahl aus dem Grundstock — das ist zweierlei Inhalt, keine Doppelung.
Gemeinsam sind nur `limitPlan` und `assertUniqueIds`.

**Pflicht 2 — Anbieter: gemessen statt angenommen → AE-13**

Kurzfassung: OpenAI Images fiel durch, weil `api.openai.com` Browsern zwar GET,
aber **kein POST** erlaubt (`Failed to fetch`, in der Konsole als CORS-Blockade
benannt) und der `dangerouslyAllowBrowser`-Schalter des OpenAI-SDK — anders als
bei Anthropic — gar keinen Header setzt, sondern nur eine Selbstsperre aufhebt.
Stability AI kommt durch und lässt sich zudem ohne Schlüssel vollständig
festklopfen, weil die API Pflichtfelder und Aufzählungswerte vor der
Authentifizierung prüft. Der zunächst installierte `openai`-SDK wurde wieder
entfernt. Volle Messtabellen in AE-13.

**Pflicht 3 — Speicherformat → AE-14**

Metadaten in den Dokumentspeicher, Bilddaten in eine eigene Ablage. Der Grund
ist nachgesehen und nicht geschätzt: das Web-Backend des Dokumentspeichers
landet in `window.localStorage` mit rund 5 MB für **alle** Sammlungen
zusammen. Nativ eine Datei je Bild, im Web IndexedDB — `expo-file-system` hat
auf Web keine Umsetzung.

**Pflicht 4 — isConcrete-Tor, testgesichert → AE-15**

Drei Sperren plus ein Literaltyp. Die Tests decken jede Ebene ab, und der
entscheidende Test fährt einen **gefälschten** Auftrag für einen abstrakten
Eintrag durch den echten Batch-Lauf: der Client wird **kein einziges Mal**
aufgerufen, es wird nichts gespeichert, und der Lauf zählt einen Fehlschlag mit
Begründung. Ein zweiter Test mischt einen gefälschten Auftrag unter vier echte:
die vier laufen durch, der fünfte wird nicht angefragt.

**Verifiziert**

- `npm test` → **275 Tests grün** in 10 Suites (vorher 237). `npx tsc --noEmit`
  fehlerfrei.
- **Echter Lauf durch den echten Netzwerkpfad**, aus dem Web-Build heraus, mit
  absichtlich ungültigem Schlüssel: 5 von 5 verarbeitet, 0 erzeugt, 5
  fehlgeschlagen, jeder Fehlschlag mit ID und Grund
  (`HTTP 401: authorization: invalid or missing header value`), **0 Einträge
  gespeichert**. Damit sind Anfrageform, Header, Fehlerbehandlung und
  Batch-Verhalten unter echten Netzwerkbedingungen belegt — nur die Gültigkeit
  des Schlüssels fehlte. Dieselbe Lage wie am Ende von Phase 4.
- **Kleiner Testlauf über die Ablage:** 5 Bilder durch dieselbe Pipeline, mit
  einem Ersatz-Client, der echte WebP-Bytes liefert. Ergebnis: 5 erzeugt, 0
  fehlgeschlagen; in der IndexedDB lagen `aahaan.webp`, `baan.webp`,
  `khaao.webp`, `nam.webp`, `rot.webp`, im Dokumentspeicher fünf Metadaten;
  `localStorage` blieb bei 78 KB.
- **Offline abrufbar ohne Schlüssel:** danach den Dev-Server neu gestartet und
  die Seite vollständig neu geladen. Anzeige: „Im Speicher: 5 von 25 Bildern ·
  Modell stable-image-core · Ablage indexeddb", beide Schlüsselfelder leer (wie
  nach AE-10 erwartet). Die Bilder erschienen auf den Karteikarten ohne
  Schlüssel und ohne Netzanfrage.
- **Anzeige in beiden Richtungen geprüft:** bei `de_to_th` steht das Bild schon
  auf der Vorderseite (es verrät die gesuchte thailändische Form nicht),
  bei `th_to_de` erst nach dem Aufdecken (vorher wäre es die Antwort). Bei
  einer abstrakten Karte („hallo, guten Tag") erscheint kein Bild und auch kein
  Platzhalter.
- Layout bei 375 px und im breiten Fenster geprüft.
- Die Abnahmedaten (fünf Ersatzbilder, verschobene Kartenzustände) wurden
  danach wieder entfernt.

**Offen**

- Ein Lauf mit **gültigem Stability-Schlüssel** steht aus — Blocker **B-4**.
  Fremde API-Schlüssel gebe ich nicht ein, und auf diesem Rechner sind keine
  hinterlegt. Alles davor ist geprüft: CORS empirisch, Anfrageform gegen die
  laufende API, Fehlerverhalten, Batch-Robustheit, Ablage, Offline-Abruf und
  Anzeige.
- Was sich ohne Schlüssel nicht prüfen ließ, ist die **Antwortform** (heißt das
  Feld wirklich `image`?). Der Parser nennt deshalb im Fehlerfall die
  gelieferten Feldnamen, damit ein Namenswechsel sofort sichtbar wird statt zu
  rätseln.
- Gerätecheck in Expo Go (**B-2**) bleibt offen; damit ist auch der native
  Bildpfad (`expo-file-system`) bislang nur typgeprüft, nicht am Gerät gelaufen.

### 2026-08-31 — Phase 6: Bidirektionalität & Curriculum-Differenzierung

**Ausgangslage, ehrlich benannt**

Ein großer Teil dieser Phase war schon da, ohne dass sie je so hieß: getrennte
Situationssätze je Richtung mit richtungsspezifischen Korrektur-Hinweisen
(AE-11), deutsche Grammatikdaten an jeder Vokabel (Phase 2), richtungsabhängige
Bildanzeige (Phase 5). Die tatsächliche Lücke war eine andere: es gab **nur
Karteikarten**. Die beiden Zielgruppen scheitern an ganz verschiedenen Stellen,
aber geübt wurde für beide dasselbe.

**Gemacht**

- `src/lib/drills/` — `types.ts` (Übungstypen, Zuordnung zur Richtung),
  `questions.ts` (die drei Aufgabenbauer), `session.ts` (Runde
  zusammenstellen, auswerten), `random.ts` (aussaatbarer Zufall).
- `src/lib/profile.ts` — Lernprofil nach AE-17.
- `components/drill-runner.tsx` — die Übungsrunde.
- Lernen-Reiter umgebaut: Umschalter zwischen Karteikarten und den Übungen der
  jeweiligen Richtung, Standard-Richtung setzen und aufheben an Ort und Stelle.
- Einstellungen: Karte „Standard-Lernrichtung".
- Fortschritt: eigene Kachel „Heute geübt", gestapeltes Diagramm mit Legende,
  Übungen in der Gesamtbilanz.
- `review-log.ts` um `drills`/`drillsCorrect` und `dayIsActive` erweitert;
  `audio.ts` um `isLanguageAvailable`.

**Die drei Übungen — je Richtung eine andere Schwachstelle**

| Richtung | Übung | Woher die Daten | Warum gerade das |
| --- | --- | --- | --- |
| `de_to_th` | **Töne hören** | `syllables[0].tone` | Der Ton trägt Bedeutung und ist im Deutschen kein Merkmal. Wer ihn nicht hört, kann ihn nicht sprechen. |
| `th_to_de` | **Artikel** | `germanNoun.article` | Thai hat keine Artikel. Das Genus ist im Deutschen nicht ableitbar, sondern gehört zum Wort. |
| `th_to_de` | **Stammformen** | `germanVerb` | Thai konjugiert nicht. „haben" gegen „sein" im Perfekt ist eine eigene Fehlerquelle. |

Nichts davon braucht neue Inhalte: 69 der 84 Einträge sind einsilbig (alle fünf
Töne kommen vor), 29 sind Substantive, 20 sind Verben.

**Drei Entscheidungen im Detail, die leicht anders hätten ausfallen können**

1. **Die Ton-Übung nimmt nur einsilbige Wörter.** Bei สวัสดี hätte die Frage
   „welchen Ton?" gar keine richtige Antwort — das Wort ist tief-tief-mittel.
   Und nach einer *einzelnen* Silbe zu fragen geht auch nicht, weil sich die
   Silbengrenze in der Thai-Schrift nicht verlässlich bestimmen lässt (AE-8).
   Ein Test hält fest, dass mehrsilbige Wörter gar nicht erst angeboten werden.
2. **Vor der Antwort ist bei der Ton-Übung nichts zu sehen** — weder die
   Thai-Schrift (sie trägt das Tonzeichen) noch die Bedeutung (dann ließe sich
   die Antwort aus dem Gedächtnis holen, statt sie zu hören). Nur Ton, und
   beliebig oft wiederholbar.
3. **Kein Ablenker ist erfunden.** Jede falsche Antwort ist eine echte Form aus
   derselben geprüften Datei oder eine mechanische Ableitung, die garantiert
   falsch ist (vertauschtes Hilfsverb). Ein ausgedachtes Partizip wäre dasselbe
   Problem wie ein ausgedachter Ton: Lernende sehen es, und Falsches prägt sich
   mit ein. Ein Test prüft das für **jedes** Verb im Bestand.
   Das vertauschte Hilfsverb ist dabei immer dabei, weil man die Aufgabe sonst
   lösen könnte, ohne je über „hat" gegen „ist" nachzudenken.

**Fehlende Thai-Stimme: benannt statt stumm**

Die Ton-Übung hängt an der Sprachausgabe des Geräts. `isLanguageAvailable`
liefert deshalb **drei** Antworten, nicht zwei: ja, nein und **„weiß ich
nicht"**. Manche Plattformen geben eine leere Stimmenliste zurück, obwohl TTS
läuft; daraus „keine Thai-Stimme" zu schließen, würde die Übung auf Geräten
sperren, auf denen sie funktioniert. Gewarnt wird nur bei einem eindeutigen
Nein. Im Testbrowser war genau das der Fall — drei Stimmen, alle `de-DE` —, und
der Hinweis erschien korrekt. Sobald der Content-Schritt echte Clips liefert,
verbessert sich die Übung von selbst: `playPronunciation` bevorzugt Clips vor
TTS, ohne dass an der Übung etwas geändert werden muss.

**Die beiden offenen Fragen, entschieden**

- **FSRS?** Nein, bewusst nicht — Begründung in **AE-16**. Die Übungen wählen
  ihre Aufgaben aber über den vorhandenen FSRS-Zustand aus und werden im
  Tagesprotokoll getrennt gezählt.
- **Standard-Richtung im Profil?** Ja, aber nur ausdrücklich gesetzt und
  jederzeit widerrufbar — Begründung in **AE-17**.

**Verifiziert**

- `npm test` → **322 Tests grün** in 11 Suites (vorher 275). `npx tsc --noEmit`
  fehlerfrei.
- **Im Browser durchgespielt:** Ton-Übung (Antwort „Tief" auf สี่ → „✓ Richtig",
  Auflösung `สี่ · sìi — vier`, „Tiefer Ton."), Artikel-Übung mit falscher
  Antwort (`___ Kaffee`, „die" gewählt → „✗ Nicht ganz", richtige Antwort grün
  umrandet, „der Kaffee · Plural: die Kaffees"), Stammformen (`machen` mit den
  Antworten „ist gemacht", „ist gekommen", „hat gemacht", „hat zugehört").
- **Standard-Richtung:** gesetzt, danach vollständig neu geladen → `/review`
  startet direkt in der gemerkten Richtung; „Richtung wechseln" führt trotzdem
  zur Auswahl, die den Standard als solchen markiert; in den Einstellungen
  steht dieselbe Wahl.
- **Fortschritt nach zwei Übungsaufgaben:** „Heute wiederholt 0 · Heute geübt 2
  · Tage in Folge 1", Diagramm mit getrennter Übungsfarbe, Bilanz „0
  Wiederholungen und 2 Übungsaufgaben, davon 1 richtig". Der Tag zählt als
  Lerntag, obwohl keine einzige Karte bewertet wurde — genau die Folge aus
  AE-16.
- Layout bei 375 px geprüft (die fünf Tonknöpfe brechen auf 2+2+1 um).
- Die Abnahmedaten wurden danach wieder entfernt.

**Offen**

- **B-2** (Gerätecheck in Expo Go) und **B-4** (Bilder-Probelauf mit gültigem
  Stability-Schlüssel) sind beide weiterhin offen — vom Nutzer bestätigt.
  Für Phase 6 kommt hinzu: Die Ton-Übung ist **im Browser** nur insoweit
  geprüft, wie es dort geht — dieser Browser hat keine Thai-Stimme, es war also
  der Warnpfad, der lief, nicht der Hörpfad. Ob eine Thai-TTS-Stimme die Töne
  brauchbar wiedergibt, lässt sich erst am Gerät beurteilen und gehört zu B-2.

### 2026-08-31 — Phase 7: Prüfungsmodul

**Zuerst die Recherche — sie hat das Schema bestimmt, nicht umgekehrt**

Beide vorgegebenen Seiten liefern über `WebFetch` **HTTP 403**. Abgerufen wurden
sie deshalb über den echten Browser, am **2026-08-31**:

| Seite | Was sie hergab |
| --- | --- |
| `goethe.de/ins/th/de/spr/prf.html` | Prüfungsangebot A1–C2, dazu TestDaF und Goethe-Test PRO; je Stufe getrennt für Jugendliche und Erwachsene |
| `…/prf/gzsd1/inf.html` | Struktur **A1: Start Deutsch 1** |
| `…/prf/gzsd2/inf.html` | Struktur **A2** |
| `…/prf/gzb1/inf.html` | Struktur **B1** |
| `goethe.de/ins/th/de/spr/tsd.html` | Einstufungstest — der Inhalt steckt in einem `iframe` auf `goethe.de/lrn/pro/30-item/m/de/index.html` |

Die erhobene Struktur (wörtlich übernommen, Belege stehen im Code an jedem
Zertifikat):

| | A1: Start Deutsch 1 | A2 | B1 |
| --- | --- | --- | --- |
| Teile heißen | Prüfungsteile | Prüfungsteile | **Module**, einzeln ablegbar |
| Lesen | 25 Min | etwa 30 Min | 65 Min |
| Hören | 20 Min | etwa 30 Min | 40 Min |
| Schreiben | 20 Min | etwa 30 Min | 60 Min |
| Sprechen | 15 Min, **Gruppenprüfung** | 15 Min | etwa 15 Min, **Paarprüfung** |
| Alter empfohlen | ab 16 | ab 16 | Jugendliche ab 12, Erwachsene ab 16 |
| Unterrichtseinheiten | 80–200 | 200–350 | 350–650 |

**Der Einstufungstest, Aufgabe für Aufgabe durchgeklickt.** Die URL sagt
`30-item`; die Einleitung nennt als Gegenstand „wie gut Sie schriftliche und
mündliche deutsche Texte verstehen und wie gut Ihre Grammatik- und
Wortschatzkenntnisse schon sind". Beobachtet wurden diese Formate, in dieser
Reihenfolge: Zeitungsanzeige mit drei A/B/C-Fragen → Hörgespräch (echte
mp3-Datei) mit Richtig/Falsch → Kaufhaus-Wegweiser als Zuordnung → Radio-Ansage
mit A/B/C → „Welche Anzeige passt zu der Situation?" → Kommentare mit
Zuordnung → Pressetext mit A/B/C → Hörtext mit Richtig/Falsch → **Lückentext**
(„Rekonstruieren Sie den Text, indem Sie die fehlenden Wörter ergänzen"). Die
Schwierigkeit steigt sichtbar von einer Bahn-Anzeige bis zu „Erkenntnisse aus
der Stressforschung". Daraus stammen die vier Aufgabenformate im Schema —
`multipleChoice`, `trueFalse`, `matching`, `gapFill`.

**Gemacht**

- `src/lib/exam/types.ts` — die drei Zertifikate als Daten samt Quelle und
  Abrufdatum, dazu das `ExamModule`-Schema als **unterscheidende Union**:
  bewertbare Aufgaben tragen `items`, freie Aufgaben `production`. Der Typ
  zwingt die Oberfläche, beide Fälle zu behandeln, statt eine Punktzahl für
  einen freien Text zu erfinden.
- `src/data/exam-modules.ts` — **acht mitgelieferte Aufgaben**, alle vier
  Fertigkeiten und alle fünf Formate abgedeckt, auf A1 und A2.
- `src/lib/exam/session.ts` — Übersicht je Stufe und Fertigkeit, Auswertung.
- `src/lib/exam/{plan,generator,batch}.ts` — zusätzliche Lese- und Höraufgaben
  über die **schon vorhandene** Batch-Infrastruktur.
- `src/app/exam.tsx` + `components/exam-runner.tsx`, neuer Reiter **Prüfung**
  in beiden Navigationen.
- Einstellungen: dritte Generator-Karte.

**Inhalt aus Vorhandenem, und wo das aufhört**

Die Texte sind aus dem deutschen Teil des geprüften Vokabel-Grundstocks
zusammengesetzt — Markt, Obst, Gemüse, Fisch, Laden, Schule, Arzt, Auto,
Kaffee, Tee —, ergänzt um elementare Funktionswörter, Uhrzeiten und
Eigennamen, ohne die eine Anzeige keine Anzeige wäre. Dieselbe Ehrlichkeit wie
bei den Beispielsätzen aus Phase 2: die einzelnen Wörter sind gedeckt, die
Sätze als Ganzes sind nicht einzeln gegen eine Quelle geprüft. Und ausdrücklich
im UI: **es sind keine Originalaufgaben und keine Modellsätze** des
Goethe-Instituts.

Für den Hörteil war kein neues Material nötig — die Skripte werden über die
Aussprache-Abstraktion aus Phase 3 vorgelesen (`de-DE`). Das Skript ist vor dem
Auswerten **nicht** zu lesen, danach schon, weil man es zum Nachvollziehen der
eigenen Fehler braucht.

**Batch-Infrastruktur zum dritten Mal benutzt, nicht neu gebaut**

`runExamBatch` ist ein Adapter über demselben Läufer wie Sprachsituationen und
Bilder. Die vier Robustheitsregeln stehen weiterhin an genau einer Stelle. Neu
ist nur die Sammlung `exam` — und die Regel, dass **Löschen die mitgelieferten
Aufgaben nicht anfasst**: sie sind Teil der App und müssen ohne Schlüssel und
ohne Netz da sein.

**Ein echter Fehler, den erst ein Test gefunden hat**

Die mitgelieferten Aufgaben wurden anfangs nur eingespielt, wenn die Sammlung
`exam` **komplett leer** war. Wer auf einem frischen Gerät zuerst Aufgaben
erzeugt und erst danach den Prüfungs-Reiter öffnet, hätte deshalb nie die
mitgelieferten bekommen — dauerhaft. Geprüft wird jetzt, ob die
**mitgelieferten IDs** vorhanden sind, nicht ob die Sammlung leer ist.

**Verifiziert**

- `npm test` → **365 Tests grün** in 12 Suites (vorher 322). `npx tsc --noEmit`
  fehlerfrei. Die Tests prüfen unter anderem, dass jedes Zertifikat eine
  `https`-Quelle und ein Abrufdatum trägt, dass die erhobenen Dauern
  unverändert im Code stehen, dass in **jeder** bewertbaren Aufgabe der
  `correctIndex` auf eine tatsächlich vorhandene Option zeigt (der
  gefährlichste denkbare Fehler: die Aufgabe wäre nie lösbar), und dass der
  Generator eine Antwort mit `correctIndex` außerhalb der Optionen ablehnt.
- **Im Browser durchgespielt:** Hörverstehen A1 (3/3 richtig, Skript erst nach
  dem Auswerten sichtbar, Begründung je Aufgabe), Leseverstehen A1 mit Anzeige,
  Sprechen A1 (Aufgabe, Leitpunkte, Musterlösung mit Vorlesetaste,
  Selbstkontrolle). B1 zeigt korrekt die Modul-Formulierung und für alle vier
  Fertigkeiten „noch keine Aufgabe".
- **Echter Lauf durch den Netzwerkpfad**, aus der Oberfläche heraus mit
  absichtlich ungültigem Schlüssel: 8 von 8 verarbeitet, 0 erzeugt, 8
  fehlgeschlagen, jeder Fehlschlag mit ID und
  `401 … authentication_error … API key is invalid`, **0 Aufgaben gespeichert**
  — der Bestand blieb bei den acht mitgelieferten.
- Layout bei 375 px geprüft.

**Offen**

- **B-2** (Gerätecheck in Expo Go) und **B-4** (Bilder-Probelauf mit gültigem
  Stability-Schlüssel) sind beide weiterhin offen — am selben Tag vom Nutzer
  bestätigt.
- Für **B1** gibt es keine Aufgaben. Das ist kein Versehen: B1-Material
  bräuchte B1-Wortschatz, und der Grundstock trägt A1/A2. Der Reiter sagt das.
- Die **Durchführungsbestimmungen** (Punkteverteilung, Bestehensgrenzen) sind
  nicht erhoben. Solange das so ist, gibt es hier bewusst keine Bewertung
  „bestanden/nicht bestanden" — siehe AE-20.

### 2026-09-01 — Phase 8: Build & Distribution

**Was ich selbst machen konnte — und wo die Wand steht**

Der Web-Export ist fertig und geprüft. Alles, was EAS betrifft, ist vorbereitet,
aber **nicht ausgeführt**: EAS verlangt ein Expo-Konto, und der Nutzer hat
keines. Das ist nicht vermutet, sondern gemessen:

```
$ npx eas-cli@latest whoami
Not logged in

$ npx eas-cli@latest config --platform android --profile preview
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable
```

Bemerkenswert daran: Selbst das bloße **Anzeigen** der Konfiguration verlangt
ein Konto. Es gibt also keinen Teil von EAS, den ich stellvertretend prüfen
könnte. Fremde Konten lege ich nicht an — dieselbe Linie wie bei den
API-Schlüsseln in Phase 4, 5 und 7.

**EAS-Kosten, am 2026-09-01 nachgesehen** (nicht aus altem Wissen), von
`expo.dev/pricing` und der maschinenlesbaren Fassung `expo.dev/pricing.md`:

| Tarif | Preis | Build-Guthaben | Warteschlange |
| --- | --- | --- | --- |
| **Free** | 0 $/Monat | **15 Android- und 15 iOS-Builds** | niedrige Priorität |
| Starter | 19 $/Monat + Nutzung | 45 $ Guthaben | hohe Priorität |
| Production | 199 $/Monat + Nutzung | 225 $ Guthaben | hohe Priorität, 2 Nebenläufigkeiten |
| Enterprise | individuell | 1 000 $ Guthaben | 5 Nebenläufigkeiten |

Der freie Tarif enthält außerdem 60 Minuten CI/CD-Workflows, Einreichung in die
App-Stores und Updates an 1 000 aktive Nutzer im Monat. **Für dieses Projekt
reicht der freie Tarif**: 15 Android- und 15 iOS-Builds sind für ein paar
Testdurchläufe reichlich. Eine Einschränkung, die die Seite nicht ausspricht:
ob die 15 Builds monatlich zurückgesetzt werden oder einmalig sind, steht dort
nicht — sie stehen in der Vergleichstabelle in derselben Zeile wie das
monatliche Guthaben der Bezahltarife („Build credit"). Wer viel bauen will,
sollte das im Konto selbst nachsehen.

**Gemacht**

- `eas.json` mit drei Profilen — `development` (Dev-Client, APK, iOS-Simulator),
  `preview` (APK, iOS-Simulator, interne Verteilung), `production` (AAB,
  `autoIncrement`). `cli.appVersionSource: "remote"`, weil EAS damit
  `versionCode` und `buildNumber` selbst hochzählt und doppelte Uploads
  verhindert. Begründung zu APK/AAB in **AE-21**, zu iOS in **AE-22**.
- `app.json` um die beiden Angaben ergänzt, **ohne die EAS gar nicht baut**:
  `android.package` und `ios.bundleIdentifier`, beide
  `com.thailernbegleiter.app`.
- `expo-dev-client` installiert — ohne das Paket kann das `development`-Profil
  nicht bauen.
- Web-Export erzeugt und aus einem gewöhnlichen statischen Server geprüft.

**Der Web-Export, geprüft**

`npx expo export --platform web` erzeugte **8 statische Routen** (`/`, `/review`,
`/conversation`, `/exam`, `/progress`, `/settings`, `/_sitemap`, `/+not-found`)
und 3,1 MB in `dist/`. Der Haupt-Bundle wiegt 2,5 MB; die Bildablage liegt
erwartungsgemäß als **eigene Datei** daneben
(`blob-backend-….js`, 1,4 KB) — das verzögerte Laden aus Phase 5 funktioniert
also auch im Export und nicht nur im Dev-Server.

Danach aus einem schlichten statischen Server ausgeliefert (kein Metro, kein
Dev-Server): Prüfungsmodul und Artikel-Übung liefen vollständig, **keine
Konsolenfehler**. Zur Wurzel-/Unterverzeichnis-Frage siehe **AE-23**.

**Icons und Splash: noch die Platzhalter aus dem Template**

Nachgesehen statt vermutet. `assets/images/` enthält unverändert den
Bildersatz des Expo-Templates — `icon.png`, `splash-icon.png`,
`android-icon-foreground/background/monochrome.png`, dazu `expo-logo.png`,
`react-logo.png`, `expo-badge.png`. Auch `assets/expo.icon/` (Apples neues
`.icon`-Bündelformat, auf das `ios.icon` zeigt) ist das Expo-Symbol. Der
Splash-Screen läuft über `expo-splash-screen` mit `#208AEF` und demselben
Platzhalterbild.

Das ist **kein Fehler und kein Auftrag dieser Phase**, aber es gehört benannt:
Ein Build mit diesen Dateien trägt das Expo-Logo als App-Symbol. Für einen
Testbuild ist das gleichgültig, für eine Store-Einreichung nicht.

**Bundle-Identifier: einmal gewählt, dann festgenagelt**

`com.thailernbegleiter.app` ist gesetzt, weil ohne ihn gar nichts baut. Er ist
aber eine Entscheidung, die der Nutzer vor dem **ersten Store-Upload**
bestätigen sollte: Nach der Veröffentlichung lässt sich weder der
Android-`package` noch der iOS-`bundleIdentifier` ändern, ohne dass daraus eine
neue App wird. Üblich ist eine Umkehrung einer Domain, die einem selbst gehört.

**Der Weg zum Android-Testbuild — für den Nutzer**

```bash
npm install --global eas-cli
```

```bash
eas login
```

```bash
eas build --platform android --profile preview
```

Der erste Build fragt nach einem Android-Keystore; „Generate new keystore"
bestätigen, EAS verwahrt ihn. Danach liefert EAS eine Adresse mit QR-Code — auf
dem Handy öffnen, APK laden, installieren (Android fragt einmal nach
„Installation aus unbekannten Quellen"). Das ist eine **installierte App**,
kein Expo Go: die SDK-Versionsfrage, an der B-2 hing, stellt sich damit nicht
mehr.

Für iOS im Simulator:

```bash
eas build --platform ios --profile preview
```

Das braucht **kein** Apple-Konto (AE-22), liefert aber ein Simulator-Abbild,
das nur auf einem Mac mit Xcode läuft. Ein Build fürs echte iPhone braucht das
Apple Developer Program.

**Vorab-Prüfung statt Warten — und sie hat zwei echte Fehler gefunden**

Ein Build ließ sich nicht anstoßen, aber die Konfiguration **prüfen** ging sehr
wohl, und zwar ohne jedes Konto. Zuerst wurde erwogen, lokal zu bauen
(`expo prebuild` + Gradle braucht kein EAS): auf diesem Rechner ist aber weder
ein JDK noch das Android-SDK installiert (`java: command not found`,
`ANDROID_HOME` nicht gesetzt), und mehrere Gigabyte Werkzeugkette ungefragt
nachzuinstallieren ist keine Nebensache dieser Phase. Stattdessen zwei
Prüfungen, die beide ohne Konto und ohne SDK laufen:

**1. `npx expo-doctor` — 20 von 21 Prüfungen bestanden.** Die eine, die fiel:

```
✖ Check that required peer dependencies are installed
Missing peer dependency: expo-asset — Required by: expo-audio
Your app may crash outside of Expo Go without this dependency.
```

Das ist genau der Fehler, den ein erster Build gekostet hätte: „outside of Expo
Go" ist die native App, also alles, was diese Phase baut. `expo-asset` ist jetzt
installiert, `expo-doctor` meldet **21 von 21**.

**2. `npx expo prebuild --platform android` — das native Projekt erzeugt sich
sauber.** Damit ließ sich nachsehen, was ein Build tatsächlich enthalten würde:
`applicationId 'com.thailernbegleiter.app'` sitzt richtig, und die
Schlüsselablage aus AE-10 ist nativ verdrahtet
(`android:fullBackupContent="@xml/secure_store_backup_rules"`).

Dabei fiel das Zweite auf: **die App hätte die Mikrofon-Berechtigung verlangt.**
Im Manifest standen `RECORD_AUDIO`, `FOREGROUND_SERVICE` und
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` — alle drei von `expo-audio`, das sie
standardmäßig setzt. Diese App **nimmt nie etwas auf**; sie spricht nur Wörter
vor. Eine Vokabel-App, die beim Start nach dem Mikrofon fragt, ist für Nutzer
ein Warnsignal und für eine Store-Prüfung eine Rückfrage. Im Plugin
nachgesehen (`node_modules/expo-audio/plugin/build/withAudio.js`) gibt es genau
die passenden Schalter; in `app.json` gesetzt:

```json
["expo-audio", {
  "recordAudioAndroid": false,
  "microphonePermission": false,
  "enableBackgroundPlayback": false
}]
```

Danach sind alle drei aus dem Manifest verschwunden. `enableBackgroundPlayback`
ist mit abgeschaltet, weil die App ein Wort vorspricht, während man die Karte
ansieht — sie ist kein Musikspieler, der im Hintergrund weiterlaufen muss. Ein
Schalter, falls sich das je ändert.

**Was übrig bleibt, und woher es kommt** (nachverfolgt, nicht geraten):

| Berechtigung | Herkunft | Bewertung |
| --- | --- | --- |
| `INTERNET` | expo-file-system | nötig — Generatorläufe |
| `MODIFY_AUDIO_SETTINGS` | expo-audio | nötig fürs Vorlesen |
| `READ/WRITE_EXTERNAL_STORAGE` | expo-file-system (Bildablage, AE-14) | trägt `android:maxSdkVersion="32"`, wird ab Android 13 gar nicht mehr angefragt |
| `VIBRATE` | Expo-Vorlage | harmlos |
| `SYSTEM_ALERT_WINDOW` | Expo-Vorlage (`main`-Manifest) | vor einer Store-Einreichung anzusehen |

Das erzeugte `android/`-Verzeichnis wurde danach wieder **entfernt**: EAS
erzeugt es im Build selbst, und der Managed-Workflow soll die Wahrheit bleiben
statt eines eingecheckten Zwischenstands. `/android` und `/ios` standen dafür
schon seit Phase 0 in `.gitignore` (Block „generated native folders" aus der
Expo-Vorlage) — es war also nichts zu ergänzen. Die zwei Skripte, die
`prebuild` in `package.json` auf `expo run:*` umgestellt hatte, sind
zurückgesetzt.

**Verifiziert**

- `npx expo-doctor` → **21 von 21** Prüfungen bestanden.
- `npm test` → **365 Tests grün** in 12 Suites, `npx tsc --noEmit` fehlerfrei
  (Phase 8 hat keine Geschäftslogik angefasst).
- `eas.json` ist gültiges JSON; gegen die EAS-CLI prüfen ließ es sich nicht,
  weil dafür ein Konto nötig ist (siehe oben).
- Web-Export nach allen Konfigurationsänderungen erneut erzeugt, aus statischem
  Server ausgeliefert, App lief fehlerfrei.

**Für iOS gibt es auf diesem Rechner überhaupt keinen Weg — auch keinen lokalen**

Zur Vollständigkeit geprüft, damit die Frage nicht offenbleibt: Der
Android-Prebuild lief unter Windows durch und ließ sich auswerten (siehe oben).
Der iOS-Prebuild lehnt schon die Erzeugung ab:

```
$ npx expo prebuild --platform ios --no-install
⚠️  Skipping generating the iOS native project files.
   Run npx expo prebuild again from macOS or Linux to generate the iOS project.
CommandError: At least one platform must be enabled when syncing
```

Damit ist belegt, was vorher nur plausibel war: Für iOS gibt es keinen lokalen
Ersatzweg, mit dem sich irgendetwas ohne EAS prüfen ließe. Der Mac-Cloud-Weg
über EAS ist die einzige Möglichkeit, und die hängt am Konto.

**Entscheidung des Nutzers: die Phase wird so abgeschlossen**

Zwei der sechs Abnahmekriterien — der installierbare Android-Build und ein
iOS-Durchlauf über EAS — sind **nicht erfüllt**. Das ist kein Versehen und
keine Nachlässigkeit, sondern eine ausdrückliche Entscheidung.

Dem Nutzer wurden am 2026-09-01 drei Wege vorgelegt:

1. Kostenlosen Expo-Account anlegen und `eas login` ausführen (zwei Minuten);
   die Builds hätte ich danach selbst gestartet und verfolgt.
2. JDK und Android-SDK lokal installieren (~4 GB, 30–60 Minuten, mit
   Fehlerrisiko) und das APK ohne EAS mit Gradle bauen — iOS bliebe auch dann
   unmöglich, weil das macOS braucht.
3. Die Phase mit den zwei offenen Kriterien abschließen.

**Gewählt wurde Weg 3.** Damit gilt für die Übergabe: alles Vorbereitende ist
fertig und geprüft, aber **es ist nachweislich kein Build gelaufen**. Wer
später liest „Phase 8 abgeschlossen", muss das mitlesen — deshalb steht es hier
und nicht nur in der Blockerliste.

**Offen**

- **B-5 (neu): EAS-Konto anlegen und die Builds anstoßen.** Der einzige
  verbleibende Schritt dieser Phase; vom Nutzer bewusst zurückgestellt (siehe
  oben). Erst danach lässt sich sagen, dass ein Build tatsächlich durchgelaufen
  ist — ich habe die Konfiguration vorbereitet und vorab validiert, nicht den
  Build bewiesen.
- **B-2** bleibt formal offen, ist aber jetzt anders gelagert: Der
  Android-Weg über ein `preview`-APK umgeht Expo Go vollständig. Sobald B-5
  erledigt ist, schließt derselbe Schritt B-2 für Android mit. Für iOS bleibt
  B-2 offen, solange kein Apple-Konto da ist.
- **B-4** (Bilder mit gültigem Stability-Schlüssel) unverändert offen — am
  selben Tag vom Nutzer bestätigt.
- **App-Symbol und Splash** sind Template-Platzhalter. Vor einer
  Store-Einreichung zu ersetzen; ausdrücklich kein Auftrag dieser Phase.

### 2026-09-01 — Phase 9: QA & Abschluss

**Kein neues Feature. Drei Dinge — und alle drei haben etwas gefunden.**

**1. Barrierefreiheit**

*Kontrast, gerechnet:* Die WCAG-2.1-Formel steht ausgeschrieben in
`src/constants/tones.test.ts` und ist gegen die Normbeispiele geprüft
(Schwarz auf Weiß = 21:1, `#767676` auf Weiß gerade über 4,5). Ergebnis der
Erstmessung: **von 30 Kombinationen aus Tonfarbe und Untergrund bestanden 6.**
Die Tonfarben sind deshalb jetzt modusabhängig — Zahlen und Begründung in
**AE-24**.

*Icon-only-Knöpfe:* Ein Audit über alle 30 `Pressable` ergab genau **einen**
echten Fall — die kompakte Vorlesetaste am Beispielsatz. Ihr Label lautete
`"▶: สวัสดี ครับ"`, begann also mit dem Zeichen selbst; ein Screenreader hätte
„schwarzes rechtsweisendes Dreieck" angesagt. Jetzt
`"Beispielsatz anhören: สวัสดี ครับ"`, im Browser nachgemessen. Alle übrigen
Knöpfe tragen sichtbaren Text, den Screenreader ohnehin vorlesen — ein
zusätzliches Label wäre dort Doppelung, keine Verbesserung.

*Tippziele:* Im Web-Build gemessen. Drei reine Textknöpfe waren **20 Pixel
hoch** und damit unter der Grenze von WCAG 2.2 (2.5.8, 24×24): „Richtung
wechseln", „Als Standard merken", „Übung verlassen". Auf 44 gesetzt; die
Nachmessung findet kein Element mehr unter 24, und die Vorlesetaste misst
jetzt 44×44.

*Tastatur — und eine Fehlmessung, die beinahe zu einer Falschmeldung geführt
hätte:* 15 von 15 Bedienelementen sind fokussierbar, Tab wandert der Reihe nach
durch, der Fokusring ist sichtbar (im Bildschirmfoto belegt), und sie rendern
als native `<button>` mit funktionierendem Klickpfad. Ein echter Enter-Druck
löste jedoch **nicht** aus — was wie ein Verstoß gegen WCAG 2.1.1 (Stufe A)
aussah, also schwerer als alles andere hier. Bevor ich das gemeldet habe, ein
Kontrollversuch: einen **ganz gewöhnlichen HTML-Knopf** ins Dokument gehängt,
fokussiert, denselben Tastendruck geschickt — er reagierte genauso wenig. Die
Grenze liegt also im Automatisierungswerkzeug, nicht in der App. Die
Auslösbarkeit per Tastatur bleibt damit **ungeprüft**, wird aber ausdrücklich
**nicht** als Fehler geführt.

**2. Fehlerbehandlung außerhalb der Batch-Pfade → AE-25**

Die Lücke war die Leserichtung: Beim Schreiben wird streng geprüft, beim Lesen
wurde blind vertraut. Ein leeres Dokument in `exam` oder `situations` beendete
den jeweiligen Reiter mit einer weißen Seite. Vorher nachgestellt, dann
geschlossen; 18 neue Tests decken die Fälle ab. Was schon robust war, wurde
nicht angefasst.

**3. Konsolidierte Abnahme gegen den jetzigen Stand**

Die Tabelle unten ist aus `.agent/state.json` **erzeugt**, nicht abgetippt.
Eigens nachgemessen wurde der Quergriff, den Phase 9 selbst gefährdet hat: Das
Phase-3-Kriterium zu den Silbenfarben war mit den **alten** Farben verifiziert.
Neu gemessen zeigt สวัสดี jetzt `rgb(138,155,177)` · `rgb(138,155,177)` ·
`rgb(136,160,131)` — tief-tief-mittel gilt weiterhin, mit den
Dunkelmodus-Fassungen. Genau dafür war die Anweisung da, gegen den *jetzigen*
Zustand zu prüfen.

**Nebenbei aufgeräumt**

`Collapsible` aus dem Expo-Template war nirgends eingebunden und zugleich das
einzige Bedienelement ganz ohne `accessibilityRole` — entfernt. Damit wurde
`expo-symbols` unbenutzt und ist ebenfalls raus. `expo-doctor` weiterhin 21/21.
Für die Jest-Konfiguration kam ein CSS-Platzhalter dazu, weil `theme.ts` die
`global.css` importiert und Jest sie nicht lesen kann.

**Verifiziert**

- `npm test` → **392 Tests grün** in 14 Suites (vorher 365). `npx tsc --noEmit`
  fehlerfrei. `npx expo-doctor` 21/21.
- Kontraste: als Test hinterlegt, nicht als Momentaufnahme.
- Im Browser nachgemessen: Bedienelemente, Fokus, Tippziele, Silbenfarben.

---

### 2026-09-03 — Phase 10: KI-Anbieter-Auswahl in den Einstellungen

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauberer
Arbeitsbaum auf `main`, 392 Tests grün, `tsc` fehlerfrei — deckungsgleich mit
dem protokollierten Stand). Nach **B-2** (Gerätecheck), **B-4** (Bilder-Probelauf
mit gültigem Stability-Schlüssel) und **B-5** (EAS-Konto und Builds) wurde beim
Nutzer nachgefragt; bis zum Ende dieser Sitzung kam keine Antwort. **Alle drei
gelten deshalb weiterhin als offen**, und diese Phase ist unter dieser Annahme
gearbeitet worden. Das ist an einer Stelle spürbar: der Web-Build bleibt die
einzige Umgebung, in der sich überhaupt etwas messen lässt — die nativen Aussagen
unten sind entsprechend als ungeprüft gekennzeichnet.

**Gemacht**

- `src/lib/providers/` — die gemeinsame Naht (AE-28): `types.ts` (Anbieter,
  Fähigkeiten, Verträge `TextClient`/`ImageClient`), `text.ts` (Claude, ChatGPT,
  Gemini), `image.ts` (Stability, Gemini, ChatGPT), `http.ts` (ein POST mit
  JSON, ein gemeinsamer Fehlerleser für vier Fehlerformen), `settings.ts`
  (Anbieter und Modell je Generator-Gruppe in `meta/generators`).
- Die drei Generatoren rufen jetzt einen Vertrag statt einen Anbieter. Prompts,
  Parser, Bauplan und Batch-Läufer wurden **nicht angefasst**;
  `createAnthropicClient` und `createStabilityImageClient` bleiben als Aufruf
  erhalten, damit der Bestandsweg am Code ablesbar bleibt und nicht nur im
  Protokoll behauptet wird.
- `api-key.ts` von zwei auf vier Anbieter erweitert, Muster aus AE-10
  unverändert. Der Ablagename für Claude bleibt `anthropic-api-key`.
- `GeneratorCard`: Anbieterwahl, Modell-Freitextfeld, anbieterabhängiges
  Schlüsselfeld, Warnung im Web-Build. `ChoiceRow` als `radiogroup`.
- Einstellungs-Screen: drei Karten, drei getrennte Einstellungen, erklärender
  Fußtext mit dem Datum der Messung.

**Pflicht 2 — Gemini gemessen (AE-26)**

Text und **beide** Bildwege (`gemini-2.5-flash-image:generateContent` und
`imagen-4.0-generate-001:predict`) kommen aus dem Browser durch, mit dem
Schlüssel im Header wie als Query-Parameter. Genommen wurde der Header, weil
eine URL in Verlaufslisten und Protokollen landet. Der Preis: mit ungültigem
Schlüssel antwortet Google auf **alles** mit „API key not valid" — erfundenes
Modell, fehlendes Pflichtfeld, sogar ein GET auf die Modellliste. Vor dem ersten
bezahlten Aufruf ist damit weder Anfrage- noch Antwortform belegbar. Das steht
im Code, in den Fehlermeldungen und am Modellfeld im UI.

**Pflicht 1 — der bekannte Blocker, und was die Kontrollmessung ergab (AE-27)**

Nicht neu entdeckt, aber wie in AE-13 gegengeprüft — und die Gegenprobe
widersprach dem Protokoll: `POST` an OpenAI kam mit lesbarem 401 zurück. Der
erste echte Lauf über ChatGPT scheiterte trotzdem fünfmal. Zwei Verdächtige
wurden geprüft und **verworfen** (Anmeldedaten, Anfragekörper), der dritte war
es: Ein POST mit einem Schlüssel, der mit `sk-` beginnt, bekommt eine Antwort
ohne CORS-Header; mit `SK-` oder `xk-` kommt dieselbe Anfrage durch, und beim
GET greift die Regel gar nicht. Damit stimmt die Tabelle aus AE-13 genau, nur
die Deutung war zu grob — und die Konsequenz bleibt dieselbe, weil jeder echte
OpenAI-Schlüssel mit `sk-` beginnt. ChatGPT ist im Web-Build entsprechend
gekennzeichnet, nativ nicht.

**Pflicht 3 bis 5**

Abstraktion statt dritter Kopie (AE-28), Schlüsselablage je Anbieter nach dem
AE-10-Muster, Modellname als Freitext ohne Katalog. Ein leeres Modellfeld nimmt
den Vorschlag des Anbieters; ein Anbieterwechsel zieht den Modellnamen mit.

**Nebenbefund, der nicht Auftrag war (AE-29)**

Beim Nachmessen der neuen Auswahlreihe im DOM stellte sich heraus, dass
`accessibilityState={{ selected }}` in dieser React-Native-Web-Fassung **gar
kein** ARIA-Attribut erzeugt. Die gewählte Möglichkeit war für einen
Screenreader unsichtbar — und zwar nicht nur die neue Anbieterwahl, sondern auch
Umfang (Phase 4) und Standard-Lernrichtung (Phase 6). Behoben durch ein direkt
gesetztes `aria-checked` plus `radiogroup`; nachgemessen 18 von 18
Auswahlknöpfen mit Zustand, davon sieben auf `true`.

**Verifiziert**

- `npm test` → **437 Tests grün** in 15 Suites (vorher 392 in 14). Die 392 alten
  laufen unverändert — das ist der Regressionsnachweis auf Testebene.
- `npx tsc --noEmit` fehlerfrei.
- **Im Web-Build durchgespielt:** Alle drei Karten zeigen Anbieterwahl und
  Modellfeld. Umstellen wirkt sofort auf Modellvorschlag, Schlüsselplatzhalter
  und Beschriftung des Schlüsselfeldes („API-Schlüssel für Google"), und **nur**
  auf die eigene Gruppe. Ein eigener Modellname (`gemini-99-voellig-ausgedacht`)
  wird angenommen, in `meta/generators` abgelegt und übersteht ein vollständiges
  Neuladen. Die ChatGPT-Warnung erscheint genau dann, wenn ChatGPT gewählt ist.
- **Läufe durch den echten Netzwerkpfad, alle mit ungültigem Schlüssel:**

| Gruppe | Anbieter | Ergebnis |
| --- | --- | --- |
| Sprachsituationen | Gemini | 16/16 verarbeitet, 0 erzeugt, 16 × „HTTP 400: API key not valid. — INVALID_ARGUMENT" |
| Prüfungsaufgaben | Gemini | 8/8 verarbeitet, 0 erzeugt, Bestand bleibt bei 8 mitgelieferten |
| Bilder | ChatGPT | 5/5 verarbeitet, 0 erzeugt, 5 × „Keine Antwort von api.openai.com" mit CORS-Erklärung |
| Sprachsituationen | **Claude** (Bestand) | 16/16, 16 × „401 authentication_error — API key is invalid" — **wortgleich Phase 4/7** |
| Bilder | **Stability** (Bestand) | 5/5, 5 × „HTTP 401: authorization: invalid or missing header value" — **wortgleich Phase 5** |

  Nach jedem Lauf war der Bestand unverändert: 0 Situationen, 0 Bilder, 8
  Prüfungsaufgaben (die mitgelieferten), 0 davon erzeugt.
- Alle sechs Reiter nach dem Umbau aufgerufen, alle rendern; keine
  App-Konsolenfehler (die 400/401 in der Konsole stammen aus den Messungen).

**Offen / bewusst nicht gemacht**

- **Ob ein gültiger ChatGPT-Schlüssel im Browser durchkommt** (AE-27). Braucht
  einen echten Schlüssel; fremde gebe ich nicht ein. Ein Versuch könnte zudem
  berechnet werden, ohne dass die Antwort ankommt — das steht in der Warnung.
- **Anfrage- und Antwortform von ChatGPT und Gemini.** Beide prüfen den
  Schlüssel vor dem Rest, deshalb ließ sich nichts festklopfen — anders als bei
  Stability (AE-13). Die Parser nennen im Fehlerfall die gelieferten Feldnamen,
  damit ein Formwechsel sofort in der Fehlerliste steht.
- **Der native Weg** für alle vier Anbieter. Ohne CORS sollte dort mehr
  funktionieren als im Web, insbesondere ChatGPT — geprüft ist das nicht
  (**B-2**).
- **`max_completion_tokens` bei OpenAI.** Nicht messbar ohne gültigen Schlüssel;
  wenn die API sich beschwert, ist es genau diese eine Zeile in
  `providers/text.ts`, und das steht dort auch.

---

### 2026-09-03 — Phase 11: Natives Audio (Hören)

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauber
auf `main` bei `b00dfde`, 437 Tests grün, `tsc` fehlerfrei). Nach **B-2**,
**B-4**, **B-5** und **B-6** wurde beim Nutzer nachgefragt; bis zum Ende der
Sitzung kam keine Antwort. **Alle vier gelten weiterhin als offen.** Für diese
Phase heißt das: die beiden Sprachausgabe-Anbieter der App (Gemini, ChatGPT)
konnten kein Audio hergeben — die Tonmessung lief deshalb an zwei anderen
Stimmen, und der Probelauf in der App mit einem Ersatz-Client (siehe unten).

**Ausgangslage, auf diesem Rechner nachgemessen:** Windows hat als
Sprachausgabe nur de-DE und en-US (SAPI: Hedda, Zira; OneCore: Hedda, Katja,
Stefan), der Browser des Web-Builds nur die drei de-DE-Stimmen. **Keine
Thai-Stimme** — exakt die Lage, die der Nutzer am eigenen Gerät erlebt hat.
„Thai anhören" war hier bis zu dieser Phase stumm.

**Gemacht**

- `src/lib/blobs/` — die Bildablage aus AE-14 verallgemeinert (AE-30); Bilder
  hängen unverändert daran (`images`), Hörclips neu (`audio`). Die alten
  Bild-Backend-Dateien sind weg, die Bild-Tests liefen ohne Änderung weiter.
- `src/lib/clips/` — Typen mit `synthetic: true` als Literaltyp, Bauplan
  (Vokabeln → Beispielsätze → Dialogzüge, dedupliziert über den Text),
  Base64/WAV ohne Abhängigkeiten, Generator-Naht, Batch als **vierter Nutzer**
  von `lib/generation/batch.ts`, Auflöser mit Index im Arbeitsspeicher.
- `src/lib/providers/audio.ts` — `AudioClient` in der Naht aus Phase 10:
  Gemini (`generateContent` mit `responseModalities: AUDIO`, PCM → WAV),
  ChatGPT (`/v1/audio/speech`, mp3 binär). Claude und Stability: „keine
  Sprachausgabe".
- `src/lib/audio.ts` — zweite Stufe vor TTS: Clip zu (Sprache, Text). Die
  Screens rufen weiter `playPronunciation()` — die Gespräch-Seite ohne jede
  ID, und genau so wird der Clip gefunden. Eingehängt einmal in `_layout.tsx`.
- Sammlung `audio` im Dokumentspeicher; Repository-Helfer; vierte
  Generator-Gruppe „Hörclips" in den Einstellungen mit Stimme als Freitext
  und **Speicherschätzung am Knopf**.
- Pflicht 4: `SpeakButton` (Karteikarte, Beispielsatz) und der Zug-Knopf im
  Gespräch schreiben „KI-Stimme — keine Muttersprachler-Aufnahme" daneben,
  sobald ein Clip gespielt hat; auch im Screenreader-Label.
- `scripts/tone-contour.html` — das Messwerkzeug (AE-31), im Repo, damit die
  Messung mit echten Gemini-/OpenAI-Clips wiederholbar ist.

**Pflicht 1 — Tonqualität gemessen (AE-31)**

Fünf Minimalpaar-Wörter aus dem Grundstock (มา ม้า หมา ไม่ ใหม่), drei Stimmen
zweier Engines (Microsoft Premwadee/Niwat, Google), F0-Kontur je Silbe in
Halbtönen, dazu eine schwellenfreie Ordnungsprüfung. Ergebnis: fallend und
tief bei allen dreien klar; steigend bei Microsoft sauber, **bei Google
nicht** (หมา fällt und bleibt unten); mittel/hoch bei Microsoft schwach
getrennt, bei Google richtig geordnet. Ordnungsprüfung je 7 von 8. **Keine
Stimme realisiert alle fünf Töne überzeugend.** Die Anbieter der App sind
nicht darunter — das ist die benannte Grenze, nicht ein Versprechen.

Zwischenfall, festgehalten, weil er die Methode betrifft: Die erste Fassung
des Werkzeugs zeigte bei mehreren Clips +5 Halbtöne am Silbenanfang. Das war
ein Oktavfehler der Autokorrelation, kein Ton. Oktavkorrektur und das
Abschneiden von An- und Ausklang stehen seitdem im Werkzeug und in seiner
Beschreibung.

**Pflicht 2 — CORS gemessen**

Gemini-TTS über `generateContent` und über den neuen Endpunkt
`/v1beta/interactions`: beide 400, lesbar. OpenAI `/v1/audio/speech`: mit
`Bearer ungueltig` 401 lesbar, mit `Bearer sk-…` „Failed to fetch" — die
Regel aus AE-27 gilt auch hier. Google Cloud TTS (`texttospeech.googleapis.com`)
käme ebenfalls durch, ist aber ein anderer Dienst mit anderem Schlüssel und
bleibt außen vor.

**Pflicht 3 — Speicherbedarf (AE-30)**

Gemini-PCM: 48 000 Byte je Sekunde. Sprechraten gemessen (Silbe ~1–1,6 s,
Satz mit 11 Zeichen ~2 s, Zug mit 37 Zeichen ~3,4–4,3 s). Probelauf ~0,8 MB,
alle Vokabeln ~11 MB, voller Dialoglauf **~700 MB** als WAV. Die Schätzung
steht am Knopf, die Ist-Summe in der Statuszeile.

**Verifiziert**

- `npm test` → **469 Tests grün** in 16 Suites (vorher 437 in 15).
- `npx tsc --noEmit` fehlerfrei.
- **Im Web-Build durchgespielt:** Vier Generator-Karten, Hörclips mit
  Anbieterreihe (ChatGPT, Gemini), Modell- und Stimmenfeld, Statuszeile „0 Clips,
  0 B · Ablage indexeddb", Umfänge mit Schätzung („10 Clips … geschätzt
  792 KB").
- **Probelauf durch die echte Pipeline mit Ersatz-Client** — wie in Phase 5
  für die Bilder: zehn echte Thai-Clips (Microsoft th-TH-Premwadee, mp3) für
  genau die zehn Texte des Probelaufs, per `runClipBatch` durch Plan, Batch,
  Ablage. 10/10 erzeugt, 0 fehlgeschlagen; IndexedDB
  `thai-lernbegleiter-audio` enthält zehn `th-<hash>.mp3`, 105 264 Byte;
  `localStorage` wuchs um 3 280 Zeichen Metadaten; jedes Dokument trägt
  `synthetic: true` und den Ersatz-Anbieter im Feld `model`.
- **Danach offline, ohne Schlüssel:** Seite neu geladen, Statuszeile „10 Clips,
  103 KB". Eine von Hand eingespielte Situation (Muster Phase 4) mit drei Zügen:
  Zug „ขอบคุณ มาก ครับ" spielte den Clip — mitgeschnitten `new Audio("data:audio/
  mpeg;base64,…")` und `play()` — und daneben stand „KI-Stimme"; Zug ohne Clip
  blieb bei der Sprachausgabe, ohne Kennzeichnung. Zug „สวัสดีครับ" spielte
  **zunächst TTS**, weil der Grundstock „สวัสดี ครับ" schreibt: daraus wurde die
  Thai-Regel im Schlüssel (Leerraum fällt weg), mit Test.
- **Karteikarte, offline, ohne Schlüssel:** Reiter Lernen, Richtung
  Thai → Deutsch, erste Karte สวัสดี, „Thai anhören" — mitgeschnitten
  `new Audio("data:audio/mpeg;base64,…")` und `play()`, darunter „KI-Stimme
  — keine Muttersprachler-Aufnahme", das Screenreader-Label trägt denselben
  Zusatz. Nach dem Neuladen mit der Thai-Regel: alle drei Züge der
  Demo-Situation verhalten sich wie erwartet — zwei Clips mit Kennzeichnung,
  einer Sprachausgabe ohne.
- **Danach aufgeräumt** wie in Phase 5: Clips gelöscht („Alle Clips
  löschen" → 0 Clips, IndexedDB leer), Demo-Situation entfernt.

**Offen / bewusst nicht gemacht**

- **Tonqualität der App-Anbieter selbst** (Gemini, ChatGPT). Braucht einen
  Schlüssel (B-6); das Werkzeug wartet darauf. Bis dahin steht im UI „KI-Stimme,
  keine Muttersprachler-Aufnahme" und nirgends „richtige Töne".
- **Antwortform** beider Anbieter (B-6): Gemini-`inlineData` mit
  `audio/L16;codec=pcm;rate=24000` ist aus der Doku abgeleitet, nicht gemessen;
  der Parser liest den `mimeType` und nennt im Fehlerfall die gelieferten Teile.
- **Deutsche Clips** (für Thai-Muttersprachler, Prüfungs-Hörtexte) sind im
  Vertrag vorgesehen (`language: 'de'`), aber nicht im Bauplan — deutsche
  Stimmen sind auf Geräten die Regel, Thai-Stimmen die Ausnahme.
- **Verdichtung** von Gemini-PCM (mp3/opus) — bräuchte Encoder oder natives
  Modul. Nicht gebaut; die 700-MB-Zahl ist der Grund, warum die Schätzung vor
  dem Start steht.
- **Nativ** (B-2): Dateiablage unter `Paths.document/audio/` und Wiedergabe
  über `expo-audio` sind nur typgeprüft — dieselbe Lage wie bei den Bildern.

---

### 2026-09-03 — Phase 12: Sprechen (Mikrofon + Aussprachekorrektur)

**Vorbedingung und Rückfragen**

`PROGRESS.md` und `.agent/state.json` vollständig im relevanten Stand gelesen;
Repo zunächst sauber auf `main` bei `2580f39`. Der Ausgangsgate war **469
Tests in 16 Suites**, `npx tsc --noEmit` fehlerfrei. Vor dem ersten Code wurden
die exakten Expo-57-Seiten und danach die Quellen des tatsächlich installierten
`expo-audio@57.0.4` gelesen.

Wie verlangt wurde nicht blockierend nachgefragt:

- **B-2:** Steht ein Android-/iOS-Gerät für Aufnahme und Konturmessung bereit?
- **B-4:** Kann der Bilder-Probelauf mit lokal eingetragenem Stability-Schlüssel
  erfolgen, ohne den Schlüssel zu teilen?
- **B-5:** Soll die zurückgestellte EAS-Anmeldung für Preview-Builds nun
  erfolgen?
- **B-6:** Stehen gültige Gemini-/OpenAI-Schlüssel für die kleinsten lokalen
  Probeläufe bereit, ohne sie zu teilen?

Bis zum Abschluss kam keine Antwort; **B-2/B-4/B-5/B-6 bleiben offen**. B-4
und B-6 sind für die rein lokale Sprechbewertung absichtlich ohne Einfluss.
B-2 umfasst nun zusätzlich physisches Mikrofon-PCM auf Android/iOS; B-5 wäre
ein möglicher Weg zum Android-Preview-Build.

**Gebaut**

- Neuer Modus **Sprechen** in Deutsch → Thai, zehn vollständig verifizierte,
  einsilbige Wörter, nach schwachem FSRS-Zustand ausgewählt, aber ohne
  FSRS-Schreibzugriff.
- Sollform ausschließlich aus `syllables[0].tone` (AE-32). Hörclip/TTS ist
  getrennt beschriftet und wird nie an die Analyse übergeben; vor Aufnahme
  wird jede Wiedergabe gestoppt und ihr Player freigegeben.
- Native Aufnahme über `expo-audio`-PCM; Web-Aufnahme getrennt über
  `getUserMedia`/Web Audio. Vier-Sekunden-Grenze, ausschließlich flüchtiges
  Mono-PCM, kein Netzwerk, keine Datei und kein Anbieter (AE-34).
- F0-Kern aus `scripts/tone-contour.html` samt Autokorrelation,
  Medianfilter, längster Strecke, einmaliger 1,8-facher Oktavkorrektur,
  Randbeschnitt und Halbtonkontur portiert.
- Qualitative Rückmeldung und Kurvengrafik ohne Score. Steigend/fallend können
  als relative Form verglichen werden; mittel/tief/hoch bleiben ohne
  persönliche Referenz ausdrücklich „Register offen". Konsonanten,
  Vokallänge, Aspiration, F0- und Oktavfehler stehen direkt im Ergebnis.
- Phase-8-Entscheidung sichtbar umgekehrt: `RECORD_AUDIO`/iOS-Zwecktext an,
  Hintergrundaufnahme und Hintergrundwiedergabe weiter aus (AE-33).

**Plattformnachweise**

- Installiertes Paket: `useAudioStream` ist nativ implementiert; Android nutzt
  `AudioRecord` mit Raten-Fallback, iOS `AVAudioEngine`/Konvertierung. Der
  Web-Stub liefert dagegen `null` — Grund für den getrennten Browserpfad.
- Android-Prebuild erzeugt und geprüft: `RECORD_AUDIO` vorhanden, keine
  Mikrofon-Foreground-Service-Berechtigung und kein Recording Service. Der
  generierte, ignorierte Ordner wurde danach kontrolliert entfernt.
- Web-Hook-Test mit Web-Audio-Doubles: kein `getUserMedia` beim Mounten,
  lokales PCM nach Start, Ablehnung als eigener Zustand, Tracks und
  `AudioContext` werden beendet. Native Hook-Tests prüfen dieselben
  Lebenszyklusregeln, tatsächliches Int16-Dekodieren und Auto-Stopp.
- Laufender Web-Build: Modus und alle Datenschutz-/Quellen-/FSRS-Texte im DOM,
  keine Konsolenfehler; erst der Start-Klick wechselte in die Freigabe. Der
  In-App-Testbrowser stellte keinen bedienbaren Mikrofon-Prompt bereit und
  blieb dort offen — deshalb kein vorgetäuschter physischer Web-Audiolauf.

**Abschlussgate**

- `npm test -- --runInBand` → **508 Tests in 22 Suites grün** (vorher 469/16).
- `npx tsc --noEmit` → fehlerfrei.
- `npm run export:web` → erfolgreich, acht statische Routen, Web-Bundle baut.
- `git diff --check` → keine Whitespace-Fehler.
- Der optionale `npm run lint` ist weiterhin kein eingerichteter Repo-Gate:
  Expo wollte beim ersten Lauf eine ESLint-Konfiguration nachinstallieren und
  scheiterte am gesperrten Netz (`ECONNREFUSED 127.0.0.1:9`); es entstand
  keine Datei- oder Paketänderung.

**Offen / bewusst nicht als ausgeführt behauptet**

- Physischer Web-Mikrofonlauf in einem normalen Browser und Android/iOS-
  Hardwarelauf. Die Implementierung und API-Lebenszyklen sind getestet; die
  reale Gerätecharakteristik gehört zu B-2 beziehungsweise zum unten
  priorisierten Browsercheck.
- B-4, B-5 und B-6 unverändert. Keine Schlüssel, Konten oder Aufnahmen wurden
  übertragen.

---

### 2026-09-03 — Phase 13: Thai-Schrift (Lesen)

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauber auf
`main` bei `25fd614`, 508 Tests in 22 Suites grün, `npx tsc --noEmit`
fehlerfrei). Nach **B-2**, **B-4**, **B-5** und **B-6** wurde erneut gefragt —
B-2 diesmal mit besonderem Gewicht, weil die F0-Messung aus Phase 12 ohne
echte Stimme unbelegt bleibt. Bis zum Ende der Sitzung kam keine Antwort;
**alle vier bleiben offen**. Für diese Phase ist das ohne Einfluss: Die
Schriftregeln brauchen weder Schlüssel noch Gerät, und die Übung läuft
vollständig offline.

**Die Lücke, um die es ging**

Die App zeigte Thai-Schrift, lehrte sie aber nicht. Keine Konsonanten, keine
Klassen, keine Vokalzeichen, keine Tonregeln — also musste jeder Ton Wort für
Wort auswendig gelernt werden. Dabei ist er weitgehend **ableitbar**, und
genau darauf weist der Kommentar in `constants/tones.ts` seit Phase 0 hin:
„the tone mark alone does not determine the tone".

**Gemacht**

- `src/data/thai-script.ts` — 44 Konsonanten mit Klasse, Anfangs- und
  Schlusslaut, 59 Vokalmuster mit Länge, die vollständige Tonregeltabelle, die
  vier Tonzeichen, ห นำ, อ นำ und die belegten Konsonantenverbindungen.
  Quelle und Abrufdatum im Kopf (AE-36).
- `src/lib/reading/syllable.ts` — die Herleitung: zerlegt eine einsilbige
  Schreibung in Anlaut, Vokal, Schlusslaut und Tonzeichen, bestimmt die
  Silbenart und liest den Ton aus der Tabelle. Liefert **die Schritte mit**,
  nicht nur das Ergebnis. Was sich nicht eindeutig lesen lässt, fällt mit
  benanntem Grund durch — es wird nichts geraten.
- Vierte Übung `toneRule` („Ton herleiten") in der bestehenden
  Übungs-Infrastruktur aus Phase 6; der Übungs-Screen zeigt die Herleitung als
  Liste (AE-37).

**Pflicht 1 — Recherchedisziplin**

Der erste Abruf über ein zusammenfassendes Werkzeug lieferte **28 von 44**
Konsonanten. Deshalb derselbe Weg wie in Phase 2: MediaWiki-API, Rohtext,
eigener Parser. Zwei Stellen sind gekennzeichnet statt entschieden — der
Schlusslaut von ล („/n/ or /w/") und der implizite Vokal, für den die Quelle
zwei Lesarten kennt. Die zweite steht sogar im UI, weil sie eine Aufgabe
betrifft, die Lernende zu sehen bekommen.

**Pflicht 2 — die Gegenprobe**

Für jeden einsilbigen Eintrag ist der richtige Ton seit Phase 2 belegt. Die
Herleitung trifft ihn bei **69 von 69**, und sie leitet bei **keinem** einen
falschen Ton her. Die Übung baut eine Aufgabe nur, wenn beides zusammenfällt.

**Pflicht 3 — Silbengrenzen bleiben ungelöst**

AE-8 gilt unverändert. Die Analyse nimmt genau eine Silbe entgegen; alle 15
mehrsilbigen Einträge werden mit benanntem Grund abgewiesen, per Test. Dabei
kam ein Befund heraus, der ohne die Gegenprobe unbemerkt geblieben wäre:
ตลาด wurde zunächst als **eine** Silbe gelesen, weil jedes Konsonantenpaar als
Verbindung durchging. Die Lösung ist die belegte Verbindungsliste aus einer
zweiten Quelle — ausdrücklich **keine** Segmentierung, sondern eine Schranke
gegen das Raten (AE-38).

**Pflicht 4 — Konsistenz**

Farben und Konturglyphen kommen unverändert aus `constants/tones.ts`; im
Web-Build nachgemessen sind es exakt die dort hinterlegten Dunkelmodus-Werte
und Pfade. Keine zweite Darstellung, keine neuen Farben — damit gilt die
Kontrastprüfung aus Phase 9 unverändert weiter.

**Verifiziert**

- `npm test` → **545 Tests grün** in 23 Suites (vorher 508 in 22).
- `npx tsc --noEmit` fehlerfrei.
- **Im Web-Build durchgespielt:** Die Übung erscheint in der Richtung
  Deutsch → Thai neben „Töne hören". Eine volle Runde über zehn Aufgaben
  gespielt — darunter หนึ่ง (ห นำ), ครับ (Verbindung), หก (gerade **kein**
  ห นำ), ค่ะ und ห้า —, jede Aufgabe zeigte nach der Antwort die
  siebenschrittige Herleitung, die Runde schloss mit Auswertung ab.
  Beispielausgabe für หนึ่ง: „ห ist stumm und hebt น (Tiefklasse) in die
  Hochklasse — ห นำ" → „Hochklasse + mai ek → Tief".
- **Barrierefreiheit:** kein Bedienelement ohne Beschriftung, kein Tippziel
  unter 24 Punkten, die Herleitung als `list` mit sieben `listitem`, keine
  Konsolenfehler.

**Offen / bewusst nicht gemacht**

- **Handschrift und Strichfolge** — kein Ziel dieser Phase.
- **Mehrsilbige Wörter.** Für eine echte Segmentierung fehlt die
  Unterscheidung zwischen Verbindung und Leitkonsanant bei Paaren, die beides
  sein können; ผล ist der Fall im eigenen Grundstock (Verbindung /pʰl/, in
  ผลไม้ aber zweisilbig). Das braucht eine Quelle, die diese Wörter aufzählt.
- **Eine nachschlagbare Konsonantentafel im UI.** Die Daten liegen vollständig
  vor (Namen, Bedeutungen, Klassen); gebaut ist bisher nur die Übung, weil die
  Vorgabe ausdrücklich Regeln lehren und nicht Tabellen abbilden wollte.
- **Lehnwort-Verbindungen** (ทร, ฟร) — bewusst nicht in der Liste, siehe AE-38.

---

### 2026-09-03 — Phase 14: Freies Schreiben und die FSRS-Lücke

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauber auf
`main` bei `555276e`, 545 Tests in 23 Suites grün, `npx tsc --noEmit`
fehlerfrei). Nach **B-2**, **B-4**, **B-5** und **B-6** erneut gefragt, B-2
weiterhin mit besonderem Gewicht, weil die F0-Messung aus Phase 12 ohne echte
Stimme unbelegt bleibt. Keine Antwort bis zum Ende der Sitzung; **alle vier
bleiben offen**. Für diese Phase ohne Einfluss: Der Schreibpfad kommt ohne
Schlüssel und ohne Netz aus, und das ist per Test verankert.

**Damit sind die vier Fertigkeiten geschlossen** — Lesen (Phase 13), Hören
(Phase 11), Sprechen (Phase 12), Schreiben (hier).

**Gemacht**

- `src/lib/writing/` — `compare.ts` (Abgleich in drei Stufen, AE-41),
  `prompt.ts` (Zielformen aus dem Grundstock), `rating.ts` (die
  FSRS-Abbildung, AE-40), `session.ts` (Runde bauen, Antwort bewerten und die
  Karte fortschreiben).
- `src/components/character-palette.tsx` — Thai-Zeichenpalette aus den Daten
  von Phase 13 und die deutschen Umlaute (AE-39).
- `src/components/writing-runner.tsx` — die Übung, in **beiden** Richtungen
  erreichbar. Anders als die Auswahlübungen, die je Richtung verschieden sind.

**Pflicht 1 — der Thai-Eingabeweg, gemessen**

Auf diesem Rechner ist genau eine Belegung aktiv (Deutsch); Windows bringt
vier Thai-Belegungen mit, keine ist eingeschaltet. Und
`navigator.keyboard.getLayoutMap()` liefert im Web-Build **null Tasten** — die
App kann also nicht einmal feststellen, ob jemand Thai tippen kann. Deshalb die
eingebaute Palette. Die Umschrift-Eingabe wurde geprüft und verworfen: Nach dem
Entfernen aller Tondiakritika bleiben vier Buchstaben (ɔ ʉ ɛ ə, 35 Vorkommen),
für die eine ASCII-Ersatzschreibung eine **erfundene Umschrift** wäre.

**Pflicht 2 — offline-first**

Der Abgleich läuft gegen den Grundstock aus Phase 2, ohne Netz. Ein Test liest
den Quelltext aller fünf Module und schlägt fehl, sobald dort `fetch(`, ein
Import aus `providers/` oder `api-key` auftaucht — eine Zusicherung über
Verhalten ließe sich mit einem Mock erschleichen, diese nicht.

**Pflicht 3 — was Lernziel ist, wird nicht wegtoleriert**

Geschützt sind Großschreibung, Umlaute, ß, Artikel und Tonzeichen. Sie kommen
**vor** der Toleranzprüfung und gelten nie als Tippfehler. Getestet wird nicht
nur an Beispielen, sondern am ganzen Bestand: alle Einträge mit Umlaut oder ß
(12) in ihrer entschärften Form, alle Thai-Einträge mit Tonzeichen (28) ohne
Zeichen. Jeder einzelne muss als benannter Fehler durchfallen.

Beim Bauen fand der Test eine Lücke: „der Haus" landete bei „anderes Wort"
statt bei „falscher Artikel", weil der Abstand über der Toleranz lag. Der
Artikel wird seitdem eigenständig geprüft und die Meldung nennt den richtigen.

**Pflicht 4 — die FSRS-Anbindung**

Erstmals schreibt ein Übungstyp den Kartenzustand: genau richtig → Gut,
Tippfehler → Schwer, falsch → Nochmal, **Leicht nie**. Derselbe Schlüssel wie
die Karteikarte, kein eigener. Begründung in AE-40; AE-16 und AE-35 bleiben
unverändert gültig, die Auswahlübungen und die Tonmessung schreiben weiterhin
nichts.

**Verifiziert**

- `npm test` → **582 Tests grün** in 24 Suites (vorher 545 in 23).
- `npx tsc --noEmit` fehlerfrei.
- **Im Web-Build durchgespielt, beide Richtungen:**
  - Thai → Deutsch: หนึ่ง mit „eins" beantwortet → „✓ Genau richtig",
    bewertet als „Gut". Dann ครับ mit „hoflichkeitspartikel" → „✗ Nicht ganz",
    Meldung „Umlaut: ä, ö und ü unterscheiden Bedeutungen — schon ist nicht
    schön", bewertet als „Nochmal".
  - Deutsch → Thai: „machen" über die Palette als ทำ zusammengesetzt (ท aus
    den Konsonanten, ำ aus den Vokalzeichen) → „✓ Genau richtig", darunter die
    Stammformen „macht · machte · hat gemacht".
- **FSRS nachgemessen:** Die Kartenschlüssel heißen unverändert
  `nueng:th_to_de` und `khrap:th_to_de` — kein dritter Bestandteil. Nach der
  falschen Antwort stand `lapses: 1`, `state: 'learning'`. Das Tagesprotokoll
  zeigte `total: 2` mit `byRating {1: 1, 3: 1}`, `drills` unverändert — also
  als Wiederholung gezählt, nicht als Übung.
- **Barrierefreiheit (Pflicht 5):** 63 Bedienelemente auf dem Schreibscreen,
  keines ohne Beschriftung, keines unter 24 Punkten, alle Auswahlknöpfe der
  Palette mit `aria-checked`, das Eingabefeld beschriftet. Jede Zeichentaste
  trägt ihren akrophonischen Namen („ก ไก่, ko kai"). Keine Konsolenfehler.

**Offen / bewusst nicht gemacht**

- **KI-Korrektur für freie Sätze.** Die Vorgabe erlaubt sie als optionale
  Ergänzung mit Schlüssel. Nicht gebaut: Der Grundstock trägt Einzelwörter,
  und für die ist der Abgleich gegen geprüfte Daten die bessere Auskunft als
  das Urteil eines Modells. Für ganze Sätze wäre sie sinnvoll — dann aber als
  eigener Aufgabentyp, nicht als zweiter Weg durch dieselbe Prüfung.
- **Stammformen und Plural als eigene Schreibaufgabe.** Die Daten liegen vor
  (`germanVerb`, `germanNoun`) und stehen bereits in der Auflösung; abgefragt
  wird bisher nur das Stichwort mit Artikel.
- **Die Zeichenpalette kennt keine Schreibmarke.** Ein Zeichen wird ans Ende
  angehängt. Für einsilbige Wörter reicht das; wer mitten im Wort einfügen
  will, muss die Tastatur benutzen. Ausbaufähig, aber nicht nötig für den
  Grundstock.
- **Nativ ungeprüft** (B-2): Ob eine Systemtastatur auf Android/iOS Thai
  anbietet, ließ sich hier nicht messen. Die Palette macht die Übung davon
  unabhängig — genau deshalb gibt es sie.

---

### 2026-09-03 — Phase 15: Mehrsprachigkeit, Fundament und Sprachauswahl

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauber auf
`main` bei `e23c5c7`, 582 Tests in 24 Suites grün, `npx tsc --noEmit`
fehlerfrei). Nach **B-2**, **B-4**, **B-5** und **B-6** erneut gefragt; keine
Antwort bis zum Ende der Sitzung, **alle vier bleiben offen**. Für diese Phase
ohne Einfluss — sie fasst weder Netz noch Gerät an.

**Was diese Phase ist und was nicht**

Nur Fundament und Auswahl. **Kein Inhalt** für Englisch oder Spanisch: Der
kommt je Sprache in einer eigenen Phase mit eigener Recherche, wie bei Thai in
Phase 2. Was hier entschieden wurde, ist das Modell darunter — und für die
beiden neuen Sprachen ihr Merkmal, belegt statt geraten.

**Gemacht**

- `src/lib/languages/` — `types.ts` (Drehscheibe, Richtungen, Merkmalsvertrag),
  `registry.ts` (die drei Sprachen mit Quelle je Merkmal), `feature.ts` (der
  einhängbare Teil).
- **Datenmodell migriert:** `thai` → `term`, `exampleThai` → `exampleTerm`, neu
  `language` an allen 84 Einträgen. `tone` und `syllables` bleiben, sind aber
  als sprachspezifisch gekennzeichnet.
- **`Direction` erweitert statt ersetzt:** `de_to_<X>` / `<X>_to_de`.
  `'de_to_th'` und `'th_to_de'` bleiben wörtlich gültig.
- `src/lib/storage/migration.ts` — Schemastand und Neueinspielen des
  Grundstocks, Kartenzustände unangetastet.
- `src/components/language-picker.tsx` und die neue Übersicht.

**Pflicht 1 — die Migration bricht nichts**

Der entscheidende Kunstgriff steckt im Typ: Die Erweiterung ist **additiv**.
Dadurch mussten von 180 Richtungsliteralen im Bestand **null** angefasst
werden, und gespeicherte Kartenschlüssel bleiben gültig. Nach der kompletten
Umstellung liefen die **582 Tests aus Phase 0–14 unverändert grün** — kein
einziger musste inhaltlich angepasst werden; die einzige Änderung war eine
Zusicherung im Profiltest, weil das Profil jetzt zusätzlich die Sprache trägt.

Der Migrationstest prüft den **Weg**, nicht den Neuzustand: Ein Speicher in der
alten Form, dazu eine Karte mit echtem Lernfortschritt (zweimal bewertet).
Nach dem Lauf ist die Karte Feld für Feld unverändert und die Vokabeln in der
neuen Form. Dazu Idempotenz, leerer Speicher, `cardsTouched: 0`.

**Pflicht 2 — Deutsch als Drehscheibe (AE-42)**

Ausdrücklich entschieden, mit den Folgen: drei Grundstöcke statt sechs, die
deutschen Module gelten für jedes Paar, und der Vokabeleintrag bleibt
zweiseitig. Englisch↔Spanisch ist damit nicht vorgesehen.

**Pflicht 3 — das Merkmal als Baustein (AE-44)**

`syllablesOf` läuft jetzt durch `featureFor(entry).annotate(entry)`. Für Thai
kommt genau dasselbe heraus wie vorher; alle Thai-Tests aus den Phasen 3, 6
und 13 blieben ohne Änderung grün. Farben und Glyphen sind **nicht** ins
Merkmal gewandert — sie bleiben in `constants/tones.ts`, damit kein zweites
Darstellungssystem neben dem kontrastgeprüften entsteht.

**Pflicht 4 — Merkmal je neuer Sprache, recherchiert**

Beide Quellen am 2026-09-03 über die MediaWiki-API im Rohtext. Sie sagen
Gegensätzliches, und genau das ist der Befund:

| Sprache | Merkmal | Quelle sagt | Folge |
| --- | --- | --- | --- |
| Spanisch | Betonung | „marked **unequivocally** through a series of orthographic rules" | ableitbar → Herleitungsübung wie Phase 13 |
| Englisch | Aussprache | „**unpredictable** even for educated native speakers" (⟨ough⟩, ≥ 10 Lesarten) | je Wort hinterlegen → Vergleichsübung, **keine** Herleitung |

Der Unterschied steht als Feld im Modell (`kind`), nicht nur im Fließtext —
damit eine spätere Phase nicht für Englisch baut, was nur für Spanisch trägt.
Für Spanisch ist zusätzlich vermerkt, dass die Regel eine Silbenzählung mit
eigenen Diphthong-Regeln voraussetzt.

**Pflicht 5 — leere Sprachen ehrlich**

Englisch und Spanisch stehen in der Auswahl, tragen sichtbar „Noch keine
Inhalte", sind nicht anwählbar und melden das über `accessibilityState.disabled`
auch dem Screenreader. Dazu steht dort, welches Merkmal für sie entschieden
ist — das ist keine Werbung, sondern die Auskunft, dass die Entscheidung
bereits belegt vorliegt.

**Pflicht 6 — Module richtig zugeordnet**

`drillsForDirection` liefert für **jede** Richtung auf `_to_de` die deutschen
Grammatikübungen; ein Test prüft das für alle drei Sprachen. Damit sind sie
für Englisch und Spanisch verfügbar, sobald es dort Inhalte gibt, ohne dass
jemand daran denken muss.

**Verifiziert**

- `npm test` → **606 Tests grün** in 25 Suites (vorher 582 in 24).
- `npx tsc --noEmit` fehlerfrei.
- **Im Web-Build durchgespielt:** Die Übersicht zeigt die Sprachauswahl an
  erster Stelle. Thai ist gewählt („84 Vokabeln · Merkmal: Töne"), Englisch und
  Spanisch stehen als „Noch keine Inhalte" mit ihrem entschiedenen Merkmal und
  sind abgeblendet. Die Richtungskarten heißen weiterhin „Deutsch → Thai" und
  „Thai → Deutsch", jetzt aus dem Verzeichnis gebaut. Der Fortschritt-Reiter
  rendert unverändert. `meta/schemaVersion` steht nach dem Start auf 2.
- **Barrierefreiheit:** kein Bedienelement ohne Beschriftung, keines unter 24
  Punkten, alle Auswahlknöpfe mit `aria-checked`. In einem frischen Tab keine
  Konsolenfehler — die zunächst sichtbaren stammten aus dem Puffer der
  Umbauphase, was durch Neustart des Servers und einen zweiten Tab
  auseinandergehalten wurde.

**Offen / bewusst nicht gemacht**

- **Inhalt für Englisch und Spanisch.** Ausdrücklich nicht Teil dieser Phase.
- **Merkmale bauen.** Beide sind entschieden und belegt, keines implementiert.
- **`ConversationTurn.thai`, `ImageSpec.thai`, die Sprechaufgabe.** Das sind
  Inhaltstypen des Thai-Paars, keine sprachneutralen Strukturen. Sie werden
  verallgemeinert, wenn das zweite Paar Inhalte bekommt — jetzt wäre es eine
  Abstraktion für Daten, die es nicht gibt.
- **Das Prüfungsmodul** ist im Modell als „gilt für jedes X → Deutsch"
  eingetragen (`hasGermanModules`), aber der Prüfungs-Screen selbst filtert
  noch nicht nach Sprache — er hat auch nur Inhalte für ein Paar.
- **Die Sprachausgabe** je Sprache (`speechLocale` steht im Verzeichnis) ist
  hinterlegt, aber die Audio-Abstraktion liest sie noch nicht; sie kennt
  weiterhin `th` und `de`.


---

### 2026-09-04 — Phase 16: Inhalte für Englisch und Spanisch

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauber auf
`main` bei `64e12cc`, 606 Tests in 25 Suites grün, `npx tsc --noEmit`
fehlerfrei). Phase 15 ist abgeschlossen, die Vorbedingung damit erfüllt. Nach
**B-2**, **B-4**, **B-5** und **B-6** erneut gefragt; keine Antwort bis zum Ende
der Sitzung, **alle vier bleiben offen**. Für diese Phase ohne Einfluss — sie
fasst weder Netz zur Laufzeit noch Gerät an. Die Recherche selbst lief über die
öffentliche MediaWiki-API und brauchte keinen Schlüssel.

**Was diese Phase ist**

Phase 15 hatte das Modell gebaut und für Englisch und Spanisch je ein Merkmal
**entschieden**, aber nichts gefüllt und nichts gebaut. Diese Phase füllt beide
Grundstöcke und setzt beide Merkmale um — und weil die Quellen Gegensätzliches
sagen, sehen die beiden Übungen entsprechend verschieden aus.

**Gemacht**

- `src/data/vocabulary-en.ts` (85 Einträge) und `src/data/vocabulary-es.ts`
  (79 Einträge); `vocabulary.ts` ist jetzt der Thai-Grundstock plus die Stelle,
  an der die drei zusammenkommen. Der Typ steht in `vocab-types.ts`.
- `src/data/spanish-stress.ts` und `src/lib/stress/` — die Betonungsregel als
  zitierte Daten und als Herleitung mit Schritten.
- `src/lib/spelling/` — die Schriftstück-Gruppen für Englisch.
- Zwei neue Übungen: **„Betonung herleiten"** (Spanisch) und **„Gleiche
  Schreibung, anderer Laut"** (Englisch).
- `src/components/term-word.tsx` — die Anzeige je Sprache.
- `ensureCardStates` filtert nach der Sprache der Richtung; `DrillMeta` trägt
  `side` statt einer festen Richtung.

**Pflicht 2 — Verifikationsdisziplin: der Schritt, der den Unterschied macht**

Der Fehler aus Phase 2 (ดี, Bedeutung aus dem falschen Sprachabschnitt) hat
diesmal die **Methode** bestimmt: Jeder Eintrag wurde aus dem abschnittsgenau
geschnittenen Rohtext des jeweiligen Sprachabschnitts gebaut, und die von mir
behauptete Bedeutung musste **wörtlich in einer Definition dieses Abschnitts
vorkommen**. Der Generator hat das geprüft und den Lauf abgebrochen, wenn nicht.

Beim ersten Durchlauf fielen **26 von 85** englischen Behauptungen durch. Das
waren keine Sachfehler, sondern meine Paraphrasen — „In what place" statt „In,
at or to what place". Angepasst wurde jedes Mal **meine Formulierung an die
Quelle**, nicht umgekehrt. Am Ende: 164 von 164 belegt.

Zwei weitere mechanische Prüfungen im Generator haben je einen echten Fehler
gefunden, den ich beim Tippen gemacht hatte:

- Das behauptete Genus wurde gegen `{{es-noun|…}}` der Quelle gehalten.
- Die Konjugationsklasse wurde gegen die Endung des Infinitivs gehalten — und
  meldete `comer` als `-ar`-Verb. Falsch, es ist ein `-er`-Verb.

**Die deutsche Seite musste kein zweites Mal erhoben werden (AE-46)**

Der Grundstock wurde bewusst auf denselben Begriffen aufgebaut wie der
thailändische. Dadurch kommen Genus, Plural, Stammformen und Steigerung aus dem
in Phase 2 geprüften Eintrag; ein Test vergleicht beide Seiten Feld für Feld.
Das ist der **eingelöste** Nutzen der Drehscheibe aus AE-42 — bis hierhin war
sie eine Behauptung über einen künftigen Vorteil. Neu zu prüfen waren nur elf
deutsche Wörter (Brot, Blut, Tür, Gedanke, Entschuldigung, kalt, großartig,
genug, durch, obwohl, danke), und die gegen de.wiktionary.

**Pflicht 3 — Spanisch: die Regel gegen eine Angabe, die nicht aus ihr stammt**

Die Betonungsregel selbst ist kurz. Der Aufwand steckte in der Silbenzählung,
die AE-44 schon als Haken benannt hatte: Diphthonge, Hiatus durch einen Akut
auf ⟨i⟩ oder ⟨u⟩, das stumme ⟨h⟩, das stumme ⟨u⟩ in que/qui/gue/gui, die
unteilbaren Anlautverbindungen und die Digraphen ⟨ch ll rr⟩. Wer die
überspringt, zählt falsch und leitet folglich falsch ab.

**Die Gegenprobe wäre zirkulär gewesen, wenn sie gegen die abgelegten Silben
gelaufen wäre** — die stammen ja aus derselben Regel. Deshalb trägt jeder
spanische Eintrag zusätzlich die **enge** Lautschrift aus Wiktionary
(`[ˈme.ð̞i.ko]`): Dort markiert die Quelle die Silbengrenzen selbst, wobei der
Betonungsstrich eine Grenze mitvertritt. Ergebnis: **79 von 79** stimmen in
Silbenzahl **und** betonter Silbe überein — dieselbe Art Nachweis wie die 69 von
69 in Phase 13. Ein zweiter Test hält Daten und Regel zusammen, damit sie nicht
auseinanderlaufen.

Zwei Stellen sind ehrlich abgegrenzt statt geraten:

- ⟨tl⟩ wird **zurückgewiesen**. Die Quelle lässt dort ausdrücklich zwei
  Trennungen zu (`at-le-ta` / `a-tle-ta`); eine Übung, die eine davon als
  richtig ausgibt, behauptete mehr als der Beleg.
- Der **unterscheidende** Akut (`dónde`, `sí`, `té`) liefert die richtige
  Antwort mit der falschen Begründung — `donde` wird auch ohne Zeichen auf
  `don` betont. Solche Wörter tragen einen benannten Vorbehalt, dieselbe
  Mechanik wie eine unsichere Herleitung in Phase 13.

**Pflicht 3 — Englisch: keine Herleitung, und das ist die Umsetzung (AE-47)**

Für Englisch wäre eine Herleitungsübung nicht schwierig, sondern **sachlich
falsch**: Es gibt die Regel nicht, die sie lehren würde. Gebaut wurde deshalb
der Vergleich. Wörter mit demselben Schriftstück und verschiedener Aussprache
bilden eine Gruppe; gefragt wird nach dem Laut, und die falschen Antworten sind
die **echten** Lesarten der anderen Wörter derselben Gruppe.

| Schriftstück | Wörter im Grundstock | Lesarten |
| --- | --- | --- |
| ⟨ough⟩ | enough, through, though, thought | /ʌf/ /uː/ /əʊ/ /ɔː/ |
| ⟨ea⟩ | eat, bread, great, year (+ speak, read, tea, teacher) | /iː/ /ɛ/ /eɪ/ /ɪə/ |
| ⟨oo⟩ | food, book, blood (+ look, good, school) | /uː/ /ʊ/ /ʌ/ |
| ⟨o⟩ | not, who, go, one, love | /ɒ/ /uː/ /əʊ/ /ʌ/ |

**Dass das überhaupt geht, ist eine Eigenschaft des Grundstocks und kein
Zufall:** Die Gruppen wurden bei der Auswahl der Wörter mit angelegt. Ohne sie
hätte Englisch ein entschiedenes Merkmal ohne Übungsstoff — man kann den Befund
aus AE-44 nicht üben, wenn keine zwei Wörter ihn zeigen.

Zwei Details, die sonst die Übung entwertet hätten: Das Wort wird **vor** der
Antwort nicht vorgesprochen (es zu hören wäre die Antwort), und als Beispiel an
einer Antwortmöglichkeit steht nie das gefragte Wort selbst. Beides fiel erst im
Web-Build auf, nicht im Test.

Der beste Einzelbeleg ist `read`: gleiche Schreibung, /ɹiːd/ und /ɹɛd/, im
selben Verb. Wiktionary führt ausgerechnet unter „RP" die **Vergangenheit** —
darauf bin ich beim automatischen Greifen der Lautschrift hereingefallen, und
die mechanische Prüfung „steht der angegebene Laut in der Lautschrift?" hat es
gemeldet.

**Pflicht 4 — bestehende Übungstypen, und was Parametrisierung nicht ist**

Karteikarten, Artikel, Stammformen und freies Schreiben greifen für beide neuen
Paare. Dafür musste dreierlei aufhören, ein Literal zu sein: die Richtung einer
Übung (`DrillMeta.side` statt `direction`), die Antwortsprache beim Schreiben,
und die Auswahl der Vokabeln.

Der **wichtigste** dieser Punkte ist der letzte und war ein echter Fehler in
Wartestellung: `ensureCardStates` las den ganzen Speicher. Mit drei Grundstöcken
darin hätte eine Thai-Sitzung Karten für spanische Vokabeln bekommen — und
nichts hätte kaputt ausgesehen, nur die Zahlen wären falsch gewesen. Der Filter
hängt jetzt an der Richtung, die die Sprache ohnehin trägt; ein Test belegt, dass
eine spanische Artikelsitzung keine thailändische Vokabel enthält.

Beim Schreiben ist im Spanischen der **Akut geschützt**, aus demselben Grund wie
das Thai-Tonzeichen: „hablo" und „habló" sind verschiedene Zeitformen, „ano" und
„año" verschiedene Wörter. Dazu eine Akzentpalette — wenn es als Fehler zählt,
muss es tippbar sein (dieselbe Überlegung wie bei den Umlauten in Phase 14).

Die Generatoren aus Phase 4/5/11 sind jetzt sprachparametrisiert. **Das macht
sie aber noch nicht sprachfähig** (AE-48): Der Aufgabentext des
Situationsgenerators verlangt Paiboon-Umschrift und die thailändischen
Höflichkeitspartikel ครับ/ค่ะ. Deshalb **lehnt** `planSituations` andere
Sprachen ab, statt thailändische Vorgaben unter spanischer Flagge zu erzeugen,
und die Einstellungen schreiben „(Thai)" an die Laufumfänge.

**Bewusst nicht Ziel, ausdrücklich notiert**

- **Prüfungsmodule** für Englisch und Spanisch: eigene Recherche wie Phase 7,
  eigene Phase. Der Prüfungs-Screen filtert noch nicht nach Sprache.
- **Sprechübung:** Die F0-Messung aus Phase 12 ist auf Tonhöhenkonturen
  ausgelegt. Ob dasselbe Werkzeug spanische Betonung erkennen kann, ist eine
  **offene Frage** — Betonung ist dort über Dauer, Lautstärke *und* Tonhöhe
  realisiert, und welcher Anteil messbar durchschlägt, hat niemand gemessen.
  Die Übung bleibt auf Thai, statt eine Bewertung zu liefern, deren Grundlage
  ungeprüft ist.
- **Beispielsätze** für die neuen Sprachen. Es gibt nur bei spanischen
  Substantiven die Wortgruppe aus Artikel und Wort (`el libro`) — das Genus ist
  quellengeprüft, ein ganzer Satz wäre es nicht. Erfundene Sätze hätten genau
  die „verwässerte Vollmenge" ergeben, vor der Pflicht 1 warnt.

**Pflicht 1 — wo der Umfang geschrumpft ist**

An zwei Stellen, beide oben benannt: keine Beispielsätze, und keine
Sprachsituationen für die neuen Paare. Die Vokabelzahl blieb über der
Untergrenze (85 und 79 statt der geforderten 40), weil die Prüfung mechanisiert
war und deshalb nicht am Umfang scheiterte.

**Regressionsnachweis für Thai (Pflicht: unverändert funktionsfähig)**

Die Tests aus Phase 0–15 zeigen über **eine umbenannte Importzeile** jetzt auf
`VOCABULARY_TH`. Unterhalb dieser Zeile wurde in keiner Datei eine Zusicherung
geändert — das ist die stärkste Form des Nachweises, die hier möglich war. Vier
Aussagen der Phase 15 mussten inhaltlich umgeschrieben werden, und zwar genau
die, deren Sachlage diese Phase geändert hat („nur eine Sprache mit Inhalten",
„kein gebautes Merkmal"). Dazu ein eigener Block: 84 Einträge mit Ton und
Beispielsatz, สวัสดี weiter tief-tief-mittel, kein Thai-Eintrag mit einem Feld
einer anderen Sprache, kein neuer Eintrag mit einem Ton.

**Ein Nebenbefund: die Vorgabesprache darf nicht abgeleitet sein (AE-45)**

In Phase 15 ergab sich die Standardsprache aus „die erste mit Inhalten". Das war
eindeutig, solange es eine gab. Mit dreien lieferte dieselbe Zeile plötzlich
**Englisch** — alphabetisch vor Spanisch und Thai. Ein Test fiel darüber, und
das war gut so: Wer seit Wochen Thai lernt, darf nach einem Update nicht
Englisch vorfinden. Die Vorgabe steht jetzt ausdrücklich da.

**Verifiziert**

- `npm test` → **689 Tests grün** in 30 Suites (vorher 606 in 25).
- `npx tsc --noEmit` fehlerfrei.
- **Im Web-Build durchgespielt:** Sprachauswahl mit drei anwählbaren Sprachen
  und Zahlen aus den Dateien (84 / 85 / 79). Für Spanisch: Übersicht mit beiden
  Richtungen zu je 79 Karten, Karteikarte mit hervorgehobener betonter Silbe
  („**ho** · la", „betont: ho"), „Betonung herleiten" mit richtiger Antwort und
  drei Herleitungsschritten, Schreiben mit Akzentpalette. Für Englisch:
  Karteikarte mit Lautschrift (`hello /həˈləʊ/`), „Gleiche Schreibung, anderer
  Laut" mit vier echten Lesarten und Beispielwörtern. Für „X → Deutsch" stehen
  in beiden neuen Paaren Artikel und Stammformen in der Leiste.
- **Zwei Anzeigefehler dabei gefunden und behoben:** Die Tonlegende erschien bei
  Spanisch (die Bedingung war „ableitbar und gebaut", und das trifft seit dieser
  Phase auch auf die Betonung zu — gemeint waren aber die Töne selbst), und die
  Merkmalsbeschreibung im Verzeichnis stand noch im Konjunktiv aus Phase 15
  („wäre der passende Baustein"). Dazu trug der Kopf der App den Namen eines
  einzelnen Sprachpaars; er heißt jetzt „Lernbegleiter".
- **Barrierefreiheit:** kein Bedienelement ohne Beschriftung, alle
  Auswahlknöpfe mit `aria-checked`, Antwortknöpfe mit Beschriftung samt
  Beispielwort. In einem frischen Tab keine Konsolenfehler — die zunächst
  sichtbaren stammten aus dem Puffer der Umbauphase (ein fehlendes Komma, das
  schon behoben war), was durch einen zweiten Tab auseinandergehalten wurde.
- **Testzustand aufgeräumt:** Der Browserspeicher wurde nach dem Durchspielen
  geleert; die Übersicht zeigt wieder Thai mit 84 fälligen Karten je Richtung.

**Offen / bewusst nicht gemacht**

- Prüfungsmodule, Sprachsituationen, Bilder- und Cliplauf für die neuen
  Sprachen (Motive liegen über den gemeinsamen Begriff vor, die Einstellungen
  bieten die Sprachwahl aber noch nicht an).
- Beispielsätze für Englisch und Spanisch.
- Ob die F0-Messung spanische Betonung erkennt — **nicht geprüft**, siehe AE-48.
- `ConversationTurn.thai` bleibt, was es ist: ein Inhaltstyp des Thai-Paars.


---

### 2026-09-04 — Phase 17: Oberfläche für Endnutzer (reine Darstellung)

**Vorbedingung: die offenen Blocker**

`PROGRESS.md` und `.agent/state.json` gelesen, Repo-Zustand geprüft (sauber auf
`main` bei `c71731b`, 689 Tests in 30 Suites grün, `npx tsc --noEmit`
fehlerfrei). Nach **B-2**, **B-4**, **B-5** und **B-6** erneut gefragt; keine
Antwort bis zum Ende der Sitzung, **alle vier bleiben offen**. Für diese Phase
ohne Einfluss.

**Abgrenzung — und der Beleg dafür**

Keine Logik, kein Datenmodell, keine Übung, kein Generator. Der Nachweis ist
die Testzahl: **689 vorher, 689 nachher, keine Datei unter `src/lib`
angefasst.** Alles, was sich geändert hat, liegt unter `src/app`,
`src/components` und `src/hooks`.

**Zuerst: der Ist-Zustand, durchgeklickt**

Alle fünf Bereiche im Web-Build angesehen, bevor etwas geändert wurde. Das
Vorhaben stammte aus einem älteren Bildschirmfoto, und ein Teil war seit
Phase 15/16 erledigt:

| Bereich | Schon erledigt | Noch offen |
| --- | --- | --- |
| Übersicht | Sprachauswahl steht vorn (Phase 15); Tonlegende nur bei Thai (Phase 16) | Statistikkarte „Vokabel-Grundstock · Phase 2" mit Wortartenzählung; Untertitel nannte das Sprachpaar |
| Lernen | Richtungsauswahl aus dem Sprachmodell (Phase 16) | kein Sprachwechsel |
| Gespräch | — | Richtungen fest auf Thai verdrahtet; kein Sprachwechsel; Leertext ohne Sprache |
| Prüfung | — | Text „richtet sich an Thai-Muttersprachler" |
| Fortschritt | Zahlen je Sprache (Phase 16) | Platzhalterkarte „Prüfungsmodul · Phase 7"; kein Sprachwechsel |
| Einstellungen | Ablage-Backend steht hier, also am richtigen Ort | Standard-Lernrichtung nur für Thai wählbar; keine Sprachwahl |
| Kopfzeile | „Lernbegleiter" statt eines Sprachpaars (Phase 16) | — |

**Gemacht**

- `components/language-switch.tsx` — der kompakte Umschalter, eine Zeile aus
  Auswahlknöpfen. Steht auf **Lernen**, **Gespräch**, **Fortschritt** und in
  den **Einstellungen** (Ziel 4). Nur Sprachen mit Inhalt; die leeren stehen
  auf der Übersicht ehrlich als leer.
- `hooks/use-learner-language.ts` — kapselt `loadProfile`/`setLanguage`,
  damit nicht fünf Screens dieselben Zeilen wiederholen. Was ein Wechsel mit
  der Standard-Lernrichtung macht, entscheidet weiterhin `lib/profile`.
- **Übersicht:** Untertitel „Welche Sprache lernst du heute?", darunter
  „{Sprache} lernen" mit den zwei Richtungskarten. Statistikkarte entfernt.
- **Lernen:** Umschalter in der Richtungsauswahl; ein Wechsel setzt die
  gewählte Richtung zurück, weil sie zur alten Sprache gehörte. Der Link in
  der Sitzung heißt jetzt „Sprache oder Richtung wechseln".
- **Gespräch:** Richtungen aus `directionsFor(sprache)`; Leertext sagt für
  Englisch und Spanisch ehrlich, dass der Generator bisher nur Thai kennt.
- **Fortschritt:** Platzhalterkarte entfernt, Umschalter oben, Untertitel
  mit Sprache.
- **Einstellungen:** Karte „Lernprofil" mit Sprache und Standard-Lernrichtung
  **der gewählten Sprache**; neue Karte **„Diagnose"** — Vokabeln je Sprache
  aus dem Speicher gegen die ausgelieferte Zahl, plus Daten-, Bild- und
  Clipablage. Das ist die alte Startseiten-Statistik am richtigen Ort.
- **Prüfung:** Text nennt jetzt alle, die Deutsch lernen.
- Gelöscht: `placeholder-card.tsx`, `vocab-summary.tsx` — beides
  Entwicklergerüst aus Phase 0 und 2 ohne verbleibenden Aufrufer.

**Ein Layoutfehler, den erst 375 px gezeigt haben (Ziel 5)**

Die Sprachkarten der Übersicht liefen auf 375 px über den rechten Rand und
waren über 200 Punkte hoch. Ursache: `flexBasis: 220` saß am **inneren** View,
dessen Elternelement — das Pressable — eine Spalte ist. In einer Spalte meint
`flexBasis` die **Höhe**. Auf einem breiten Fenster fiel das nicht auf, weil
der Inhalt ohnehin hineinpasste. Die Flex-Maße hängen jetzt am Pressable
selbst, die Karte ist 311 Punkte breit und 122 hoch, `scrollWidth` gleich
`innerWidth`. Ein Fehler aus Phase 15, den die damalige Prüfung nicht
gefunden hat — sie lief nur breit.

**Verifiziert**

- `npm test` → **689 Tests grün**, 30 Suites — identisch zu vorher.
- `npx tsc --noEmit` fehlerfrei.
- **Web-Build, breit:** alle sechs Routen; Übersicht ohne Statistikkarte,
  Fortschritt ohne Platzhalter, Einstellungen mit Lernprofil und Diagnose.
- **Sprachwechsel durchgespielt:** Auf „Gespräch" Spanisch gewählt → Profil
  im Speicher `language: es`, Leertext für Spanisch; danach zeigen **Lernen**
  („Spanisch — welche Richtung", Karteikarten · Betonung herleiten ·
  Schreiben) und **Fortschritt** („Lernverlauf · Spanisch", 79 von 79 je
  Richtung) dieselbe Sprache, ohne dass die Übersicht besucht wurde. Ein
  synthetisches `element.click()` löste den Wechsel **nicht** aus, eine
  Zeiger-Ereignisfolge (pointerdown/up, click) schon — React Native Web hört
  auf den Responder, nicht auf `click` allein. Kein Fehler der App, aber gut
  zu wissen für die nächste Prüfung.
- **375 px:** Übersicht, Lernen, Einstellungen, Prüfung und eine
  Betonungsübung — kein horizontales Scrollen, kein Bedienelement ohne
  Beschriftung, keines unter 24 Punkten, alle Umschalter mit `aria-checked`.
- In einem frischen Tab keine Konsolenfehler. Testzustand danach geleert.

**Bewusst nicht gemacht**

- Die Generatoren in den Einstellungen bieten die Sprachwahl weiterhin nicht
  an und tragen „(Thai)" — das wäre keine Darstellung mehr, sondern die
  Freischaltung von Läufen (AE-48), also außerhalb dieser Phase.
- Die Prüfungsseite filtert nicht nach Sprache; die Module gelten für jedes
  „X → Deutsch", nur der Screen weiß es noch nicht. Eigene Phase (siehe TODO).

---

### 2026-09-04 — Phase 18: Fertigkeiten, Merkfunktion und Stimmen

**Vorbedingung: die offenen Blocker**

Repo-Zustand geprüft (sauber auf `main` bei `3e94da8`, 689 Tests in 30 Suites
grün). **B-2**, **B-4**, **B-5** und **B-6** bleiben offen; keine Antwort. Für
diese Phase teilweise relevant — siehe „Was ungeprüft bleibt".

**Die Gegenprüfung, um die ausdrücklich gebeten wurde**

Frage war, ob die Übungslisten der Sprachen dem entsprechen, was die Recherche
ergeben hat. Antwort: **Sie entsprachen ihr — aber sie waren unvollständig.**

| Sprache | Merkmal laut Quelle (AE-44) | Leseübung | Hörübung |
| --- | --- | --- | --- |
| Thai | Ton aus der Schrift ableitbar | „Ton herleiten" ✓ | „Töne hören" ✓ |
| Spanisch | Betonung „unequivocally" ableitbar | „Betonung herleiten" ✓ | **fehlte** |
| Englisch | Aussprache „unpredictable" | Vergleich statt Herleitung ✓ | **fehlte** |

Die Zuordnung Herleitung/Vergleich war also richtig. Was fehlte, war das Ohr:
Nur Thai hatte eine Hörübung. Betonung ist hörbar, und englische Wörter mit
gleicher Schreibung auseinanderzuhalten ist genau das, woran man im Alltag
scheitert — beides war eine Lücke, keine Entscheidung.

**Zwei neue Hörübungen**

- **„Betonung hören" (Spanisch).** Wort anhören, betonte Silbe wählen. Der
  ganze Punkt hängt an einer Zeile: Die Silben stehen **ohne Akzentzeichen**
  in der Auswahl („me · di · co"). Mit Akut wäre die Antwort abzulesen statt zu
  hören.
- **„Wort hören" (Englisch).** Die Umkehrung der Vergleichsübung: nicht sehen
  und den Laut wählen, sondern hören und die Schreibung wählen — /ðəʊ/ unter
  though, through, thought, enough. Die Ablenker sind echte Wörter des
  Grundstocks mit derselben Buchstabenfolge; erfunden ist nichts.

Damit hat **jede** Zielsprache eine Hör- und eine Leseübung ihres Merkmals; ein
Test hält das fest.

**Die Übungen stehen nach Fertigkeit gruppiert**

Vorher war es eine flache Reihe, und die sagte nicht, dass „Töne hören", „Ton
herleiten", „Artikel" und „Schreiben" vier verschiedene Dinge sind. Jetzt:
Wortschatz · Hören · Lesen · Sprechen · Schreiben · Deutsche Grammatik — feste
Reihenfolge über alle Sprachen, damit „Hören" nach einem Sprachwechsel nicht
woanders steht. Die Richtungsauswahl zeigt dieselbe Gliederung statt des
generischen Satzes.

**Der generische Satz ist weg**

„Deutsch lesen, das Wort auf Thai abrufen" stand auf jeder Richtungskarte — im
Lernen-Reiter **und** auf der Übersicht — und sagte nichts, was „Deutsch → Thai"
nicht schon sagt. `directionPrompt` ist damit ersatzlos entfallen; dass die
Funktion samt Test verschwindet statt ungenutzt liegenzubleiben, ist Absicht.

**Je Sprache ihre eigene Merkhilfe**

Bis hierher gab es nur die Tonfarben, und die gehören zu Thai. Neu:

- **Spanisch** — die Betonungsregel als Silbenmuster: eine Punktreihe, in der
  die betonte Silbe größer und farbig ist, daneben ein Beispielwort aus dem
  Grundstock. Drei Zeilen: Vokal/n/s → vorletzte, anderer Konsonant → letzte,
  Akut → genau dort.
- **Englisch** — die Schriftstück-Gruppen mit ihren Lesarten: ⟨ough⟩, ⟨ea⟩,
  ⟨oo⟩, ⟨o⟩, jeweils mit allen Wörtern und Lauten. Die Überschrift sagt
  ausdrücklich, dass es hier **keine** Regel gibt; das ist der Befund aus
  AE-44 und keine Entschuldigung.

Keine der Darstellungen benutzt eine der fünf Tonfarben — die bedeuten Töne,
und ein Ton ist keine Betonung. Nichts davon ist getippt: Die spanischen
Beispiele werden aus dem Grundstock gesucht, die englischen Gruppen kommen aus
`lib/spelling`.

**Der Lernen-Reiter merkt sich, wo man war (AE-49)**

An die Stelle der Standard-Lernrichtung tritt ein Lesezeichen: Richtung und
Übung bleiben offen, bis auf der Übersicht eine Sprache gewählt wird — auch
dieselbe. Das ist die Geste „von vorn anfangen", und sie ist dort, wo man sie
sucht. Der Gespräch-Reiter merkt sich seine Richtung genauso; **Prüfung bleibt
unverändert**.

Beim Prüfen im Web-Build fiel auf, dass das Merken zunächst nur über die
Übungsleiste griff. Man kommt aber auf drei Wegen hierher — Leiste,
Richtungskarte auf der Übersicht, Adresse mit `?direction=`. Es hängt jetzt an
einem Effekt auf dem, was wirklich offen ist, und trifft damit alle drei.

**Damit fällt die Karte „Lernprofil" in den Einstellungen weg**

Genau so vom Nutzer vermutet, und es stimmt: Ohne Standard-Lernrichtung gibt es
dort nichts mehr einzustellen. Sprache wechselt man auf der Übersicht, im
Lernen-, Gespräch- und Fortschritt-Reiter.

**Bilder und Clips je Sprache**

Die Planer waren seit Phase 16 sprachparametrisiert, die Einstellungen boten
die Wahl nicht an (AE-48). Jetzt tun sie es — je eine Sprachzeile an der
Bilder- und der Cliptkarte, und die Umfänge rechnen mit der gewählten Sprache.

Beim Nachzählen fiel eine stille Lücke auf: **28 konkrete englische Einträge,
aber nur 25 mit Motiv.** `bread`, `blood` und `door` haben kein Thai-Gegenstück
und kamen deshalb nicht über den gemeinsamen Begriff (AE-46) an ein Motiv — sie
hätten stillschweigend kein Bild bekommen, und ein fehlendes Bild ist kein
Fehler, den man sieht. Drei Motive ergänzt, dazu ein Test, der für jede
konkrete Vokabel ein Motiv verlangt.

**Die Stimmenwahl — und warum sie anders aussieht als gewünscht (AE-50)**

Gewünscht war „männlich oder weiblich". Die Gemini-Unterlagen, aus denen die
Stimmnamen stammen, nennen zu jeder Stimme nur einen Stilbegriff („Firm",
„Upbeat") und **kein Geschlecht**; bei OpenAI steht dazu ebenfalls nichts.

Google veröffentlicht es aber an anderer Stelle: Die Cloud-Text-to-Speech-Seite
zu „Chirp 3: HD voices" führt **dieselben dreißig Namen** in einer Tabelle mit
den Spalten „Name" und „Gender". Beide Listen am 2026-09-04 abgerufen und Name
für Name abgeglichen — sie stimmen vollständig überein. Damit ist die Angabe
belegt und nicht aus dem Klang des Namens geschlossen.

Ergebnis: Bei **Gemini** zwei Knöpfe „Weiblich" / „Männlich", die eine belegte
Stimme setzen (Kore bzw. Charon — „Firm" und „Informative" passen zu Vokabeln
besser als „Excitable"), darunter steht die gewählte Stimme mit Geschlecht und
Stilbegriff. Bei **ChatGPT** gibt es die Knöpfe nicht, und dort steht, warum:
Der Anbieter macht dazu keine Angabe, eine Auswahl wäre geraten.

**Der Fortschritt zeigt Erarbeitetes statt Bestand**

- „Fällige Karten je Richtung" ist ersatzlos raus — überall.
- Die Kacheln „Jetzt fällig" und „Karten gesamt" sind durch **„Begonnen"** und
  **„Gemeistert"** ersetzt. 168 Karten im Stapel sagen über den Fortschritt
  nichts.
- Der Zustandsbalken lässt „neu" weg. Er machte am Anfang 100 % aus, und ein
  Balken, der zu hundert Prozent „noch nicht angefangen" anzeigt, ist keine
  Fortschrittsanzeige. Wie viele Karten noch warten, steht darunter als Satz.

**Verifiziert**

- `npm test` → **712 Tests grün** in 31 Suites (vorher 689 in 30).
- `npx tsc --noEmit` fehlerfrei.
- **Web-Build:** beide neuen Hörübungen gespielt; Merkfunktion geprüft
  (Richtung + Übung offen → Prüfung → zurück auf /review → wieder dort), und
  die Rücksetzung geprüft (dieselbe Sprache auf der Übersicht → `review: null`,
  Auswahl erscheint). Stimmwahl umgeschaltet: „Kore: weiblich · „Firm"" →
  „Charon: männlich · „Informative"".
- **375 px und breit:** kein horizontales Scrollen (`scrollWidth ===
  innerWidth`), kein Bedienelement ohne Beschriftung, keines unter 24 Punkten.
  In einem frischen Tab keine Konsolenfehler.
- Nebenbefund aus dem Testbrowser: Dort ist **weder eine spanische noch eine
  englische Stimme** installiert. Die Hörübungen melden das ehrlich — und das
  ist genau das Argument für die erzeugten Clips.

**Was ungeprüft bleibt**

- Ob die erzeugten Bilder und Clips **auf iPhone und Android** laufen. Der
  native Pfad (`expo-file-system`, `expo-audio`) ist typgeprüft und seit Phase
  5/11 gebaut, aber nie auf einem Gerät gelaufen — das ist **B-2** und hängt an
  einer Handlung des Nutzers. Im Web-Build läuft die Ablage über IndexedDB und
  ist geprüft.
- Ob die Stimmen tatsächlich so klingen, wie die Tabelle sie einordnet. Ohne
  Schlüssel (**B-6**) wurde kein einziger Clip erzeugt. Belegt ist die
  **Angabe des Anbieters**, nicht der Klang.
- Sprechübung weiterhin nur Thai (AE-48, F0-Verfahren ungeprüft für Betonung).

---

### 2026-09-05 — Lernwirksamkeits-Audit (Bericht, keine Änderung)

**Ergebnis:** `AUDIT-Lernwirksamkeit.md` im Projekt-Root. **Am Anwendungscode
wurde nichts geändert** — keine Datei unter `src/`, kein Test angepasst.
`npm test` steht vor und nach dem Audit bei **712 grünen Tests in 31 Suiten**.

**Auftrag war**, zu bewerten, wie gut die App den Stand der
Spracherwerbsforschung umsetzt, mit sechs Pflichten: Belege extern holen;
Gerüst und Inhalt strikt trennen; gegen die eigene App argumentieren; bekannte
Grenzen nicht unterschlagen; die vier Fertigkeiten einzeln bewerten; erheben,
was ganz fehlt.

**Das Urteil in einem Satz:** Die Mechanismen sind da und sauber gebaut, der
Inhalt trägt sie nicht — 248 Vokabeln, 84 Beispielsätze, 20 automatisch
bewertete Prüfungsaufgaben, **null** Sprachsituationen, **null** Bilder,
**null** Hörclips. Die 100 verschiedenen deutschen Stichwörter stehen gegen
~650 Einträge der Goethe-A1-Wortliste und gegen 6.000–9.000 Wortfamilien, die
Nation (2006) für selbstständiges Lesen und Hören veranschlagt.

**Vierundzwanzig Quellen** mit Abrufdatum 2026-09-05, jede mit
gekennzeichneter Zugriffstiefe: `[V]` im Wortlaut gelesen, `[Z]` nur über die
Zusammenfassung eines Suchindex erreicht (Bezahlschranke, oder das PDF ließ
sich hier nicht in Text wandeln — `pdftoppm`, `pypdf` und `pymupdf` fehlen).
Dieselbe Linie wie `sourceVerified` im Grundstock: kennzeichnen, was nicht mit
eigenen Augen belegt ist.

**Zur Krashen-Frage** steht ausdrücklich beides da: Dass Input notwendig ist,
ist unstrittig (VanPatten & Williams führen es als Beobachtung, die jede
Theorie erklären muss). Krashens Hypothesen **als Theorie** gelten seit Gregg
(1984) und McLaughlin (1987) als unfalsifizierbar, und die Kritik ist bis
heute nicht ausgeräumt. Eine Seite als Konsens auszugeben wäre falsch gewesen.

**Drei Korrekturen am Auftragstext**, zwei davon zuungunsten der App:

1. **„15 Sprachsituationen" stimmt nicht — es sind null.**
   `.agent/state.json → situations.generated: 0`; es gibt keinen Seed-Pfad und
   keine Datei mit Situationen. Zwei wurden zum Prüfen der Offline-Wiedergabe
   eingespielt und wieder entfernt. Der Testlauf des Nutzers vom 2026-08-31 ist
   bestätigt, aber ohne Zahlen und ohne Artefakt im Repo. Woher die 15 stammen,
   ist hier nicht belegbar.
2. **Die FSRS-Gewichte sind keine „Näherung".** Die 17 Werte in
   `fsrs.ts:29-31` sind **exakt die veröffentlichten Vorgabewerte von FSRS v4**;
   die Vergessenskurve daneben (`19/81`, Exponent `-0.5`) ist die von
   **FSRS-4.5**. Die Kombination ist keine einzelne veröffentlichte Fassung.
   Praktisch: „Leicht" auf einer neuen Karte ergibt ~6 Tage statt ~14
   (FSRS-4.5) bzw. ~16 (FSRS-5) — die App plant durchgehend **enger** als der
   aktuelle Stand. Nie an eigenen Logs optimiert: bestätigt.
3. **„Keine Beispielsätze für EN/ES" ist für Spanisch zu grob.** Englisch: 0,
   bestätigt. Spanisch: 30 Einträge tragen `exampleTerm`, aber das sind
   Wortgruppen aus Artikel und Substantiv (`el libro`), keine Sätze. Für
   „Sätze" hat der Auftrag recht.

**Nicht im Auftrag genannt und im Audit ergänzt:** null Bilder ausgeliefert —
der ganze Dual-Coding-Pfad ist Mechanismus ohne Inhalt.

**Acht Befunde aufgeschrieben, keiner behoben** (F-1 bis F-8 im Bericht). Die
drei, die über das oben Genannte hinausgehen:

- **F-3:** Der Prüfungs-Screen filtert nicht nach Sprache; alle Module tragen
  `direction: 'th_to_de'`, obwohl ihr Inhalt für jedes X→Deutsch gilt.
- **F-5:** Im Testbrowser — der einzigen vollständig geprüften Plattform — ist
  **keine** der drei Zielstimmen installiert. Zusammen mit null Clips heißt
  das: der komplette Hörpfad ist nirgends im Betrieb belegt.
- **F-6:** Die englische Merkmalsübung hat 23 Kandidaten, die
  Verbformen-Übungen 18–20. Bei 10 Aufgaben je Runde ist der Bestand nach
  **zwei Runden** vollständig gesehen.

**Der unbequemste Befund der Recherche:** Wayland & Guion (2004) trainierten
englische und chinesische Muttersprachler auf den Thai-Kontrast **mittel gegen
tief**. Die chinesische Gruppe verbesserte sich signifikant, die englische
**nicht**. Genau bei mittel und hoch liegt zugleich die gemessene Schwäche der
TTS-Stimmen aus AE-31. Dazu verlangt HVPT (Uchihara, Karas & Thomson 2025:
g = 0,92 über 79 Studien) **mehrere Sprecher** — die App hat immer einen. Die
Tonhörübung ist damit das didaktische Herz der Thai-Seite und zugleich die
Stelle mit der schwächsten Beleglage.

**Die Gegenrede fällt eindeutig aus:** Ein Lernender wäre heute mit **Anki plus
wöchentlichem Tandempartner besser dran**. Anki bringt denselben Mechanismus in
besser (FSRS-6, an eigenen Logs optimierbar, gemessen an 350 Millionen
Wiederholungen) plus fertige Decks mit Muttersprachler-Aufnahmen; der Tandem
liefert Interaktion, die diese App strukturell nicht kann. Was die App dagegen
hat und die Kombination nicht: die Tonherleitung aus der Schrift mit sieben
Schritten und 69/69-Gegenprobe, die spanische Betonungsregel mit unabhängiger
IPA-Gegenprobe, und die durchgehende Kennzeichnung des Unbelegten. Das sind
drei gute Bausteine, kein Kurs.

**Priorisiert nach Lernzuwachs pro Aufwand** (vollständig im Bericht):

1. **Wortschatz auf ~650–1.000 je Sprache, frequenzsortiert.** Der einzige
   Punkt, der die Kernaussage ändert; alles andere ist ein Multiplikator auf
   die Inhaltsmenge. Der Plan steht fertig im Skalierungsplan.
2. **Freie Eingabe für Artikel und Stammformen.** Die ganze Maschinerie aus
   Phase 14 existiert; danach tragen drei bis vier statt einer Übung zur
   Wiederholungsplanung bei, und das Rateproblem aus AE-16 verschwindet dort
   von selbst.
3. **Hörclips erzeugen — mit mehreren Stimmen.** Erweitert den bestehenden
   TODO-Punkt um die HVPT-Bedingung: nicht eine Stimme, sondern mehrere. Danach
   die Töne wie in AE-31 messen, bevor irgendwo steht, dass sie stimmen.

Ausdrücklich **nicht** empfohlen: die Sprechübung auf Spanisch ausweiten, bevor
gemessen ist, ob das F0-Verfahren Betonung erkennt (AE-48) — und die
Auswahlübungen an FSRS anschließen, ohne sie auf freie Eingabe umzustellen.

**Zehn Punkte, die aus dieser Position nicht beurteilbar sind**, stehen als
eigener Abschnitt im Bericht — der erste ist der aus dem Auftrag: ob eine
Thai-Stimme für ein menschliches Ohr richtig klingt. Eine Konturmessung sagt,
ob die Tonhöhe die erwartete Richtung nimmt, nicht ob ein Muttersprachler die
Silbe als richtig hört. Dazu: kein Lernender wurde getestet, keine Retention
gemessen. Das Audit vergleicht Bauweise mit Literatur — mehr nicht.

---

## Konsolidierte Abnahme (Stand 2026-09-04)

Jedes „Fertig, wenn“ aus Phase 0–18 gegen den **jetzigen** Repo-Zustand.
**138 von 145 erfüllt; 7 offen, und alle 7 hängen an einer Handlung des
Nutzers** — an einem gültigen API-Schlüssel (B-4, B-6), einem Expo-Konto (B-5)
oder einem Gerät (B-2). Diese Tabelle ist **aus `.agent/state.json` erzeugt**,
nicht abgetippt; sie kann deshalb nicht still von der maschinenlesbaren
Fassung abweichen.

| Phase | Kriterium | Stand | Wie geprüft |
| --- | --- | --- | --- |
| 0 | npx expo start liefert klickbare Navigation zwischen Platzhalter-Screens im Browser | **erfüllt** | Alle fuenf Routen im Browser angeklickt und gerendert; zusaetzlich bei 375px Breite geprueft. |
| 0 | Gleiche Navigation in Expo Go auf dem Handy sichtbar | **erfüllt** | Vom Nutzer am Geraet bestaetigt (2026-08-30). |
| 0 | Git-Repo und PROGRESS.md angelegt | **erfüllt** | PROGRESS.md und .agent/state.json im Projekt-Root, Commits auf Branch main. |
| 1 | Unit-Tests fuer Retrievability und Review-Update gruen | **erfüllt** | npm test gruen; fsrs.test.ts prueft Formel, Monotonie, Grenzen, Lapses, Abstandseffekt. |
| 1 | Persistenz-Abstraktion fuer alle Datentypen | **erfüllt** | DataStore ueber vocab, cards, situations, exam, meta; Backends SQLite / AsyncStorage / Memory; gemeinsame Vertragspruefung. |
| 1 | Kartenzustand uebersteht App-Neustart auf Web | **erfüllt** | Im Browser bewertet, Seite neu geladen, Werte unveraendert. Backend: async-storage. |
| 1 | Kartenzustand uebersteht App-Neustart in Expo Go (SQLite-Pfad) | **erfüllt** | Vom Nutzer am Geraet bestaetigt (2026-08-30); Anzeige 'Speicher: expo-sqlite'. |
| 2 | 50-100 Eintraege, bidirektional vollstaendig, schema-konform | **erfüllt** | 84 Eintraege; vocabulary.test.ts prueft Anzahl, eindeutige IDs, Schema je Eintrag, Silbenzerlegung, deutsche Pflichtangaben je Wortart und Bidirektionalitaet. |
| 2 | Jeder Eintrag hat einen nachvollziehbaren sourceVerified-Stand, nicht pauschal true | **erfüllt** | 82 von 84 geprueft; die zwei Ausnahmen tragen den Grund in verificationNote. Ein Test erzwingt eine Quote >= 0.9 UND < 1, damit pauschales Abhaken auffliegt. |
| 2 | Skalierungsplan auf 1000 ausformuliert in PROGRESS.md | **erfüllt** | Abschnitt 'Skalierungsplan auf ~1000 Eintraege': Frequenzliste als Wortquelle, siebenstufiger Pruefschritt, bewusste Trennung vom Content-Generator aus Phase 4/5. |
| 2 | Tests und tsc weiterhin gruen | **erfüllt** | 154 Tests in 3 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 3 | Vollstaendige Review-Session in beide Richtungen durchspielbar (Browser) | **erfüllt** | Im Browser beide Richtungen durchgespielt: aufdecken, bewerten, Karte wechselt weiter, Sitzungsabschluss. |
| 3 | Vollstaendige Review-Session am Geraet in Expo Go | **offen** |  |
| 3 | Mehrsilbige Woerter zeigen unterschiedliche Tonfarben je Silbe | **erfüllt** | สวัสดี im DOM nachgemessen: sa=rgb(79,96,118) tief, wat=rgb(79,96,118) tief, dii=rgb(111,138,106) mittel. ThaiWord wertet syllables[] aus, tone nur als Fallback (per Test abgesichert). |
| 3 | Unverifizierte Eintraege sind erkennbar gekennzeichnet | **erfüllt** | VerificationBadge nur bei sourceVerified:false; im Browser mit นอน geprueft, Antippen klappt die verificationNote auf. |
| 3 | Dashboard zeigt beide Richtungen getrennt | **erfüllt** | Zwei Karten mit eigener Faelligkeitszahl; Test belegt, dass Bewertungen einer Richtung die andere nicht beeinflussen. |
| 3 | Layout auf Handy UND breitem Browser geprueft | **erfüllt** | 1280px: zwei gleich breite Spalten. 375px: untereinander, Bewertungsknoepfe brechen auf 2x2 um. Ungleiche Kartenbreiten (306/290 statt 343) gefunden und behoben. |
| 3 | Tests und tsc gruen | **erfüllt** | 187 Tests in 6 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 4 | Lernstatistik-Screen zeigt echte Daten statt Platzhalter | **erfüllt** | Wiederholungen heute, Tagesserie, faellige Karten, Kartenzustaende und 14-Tage-Diagramm aus der Persistenzschicht; im Browser mit echten Bewertungen geprueft. |
| 4 | Einschraenkung der Statistik-Methode dokumentiert | **erfüllt** | AE-9; Hinweis steht im UI selbst ('Protokolliert seit ... Fruehere Sitzungen sind nicht enthalten'). |
| 4 | Teilausfall-Verhalten nachweislich getestet | **erfüllt** | Tests: Fehler mitten im Lauf (14 ok / 2 fehlgeschlagen, alle 16 angefasst), drei Fehler zu Beginn (13 bleiben gespeichert), Fortsetzen (12 uebersprungen), Abbruch (5 bleiben). Zusaetzlich echter Lauf mit ungueltigem Dummy-Schluessel: 16 Fehlschlaege, Batch lief durch, 0 gespeichert. |
| 4 | CORS-Header im Web-Build | **erfüllt** | Direkt gemessen: ohne Header 'TypeError: Failed to fetch', mit Header HTTP 401 mit JSON-Fehlerobjekt. dangerouslyAllowBrowser setzt genau diesen Header (im SDK-Quelltext nachgesehen). |
| 4 | Key-Speicherung plattformgerecht geloest und begruendet | **erfüllt** | AE-10: expo-secure-store hat auf Web die Implementierung 'export default {}'. Nativ Keychain, Web nur Arbeitsspeicher fuer die Sitzung; Weiche ueber isAvailableAsync() zur Laufzeit. |
| 4 | Situationen offline abspielbar (Neustart-Test) | **erfüllt** | Zwei Situationen im Schema eingespielt, Gespraech-Screen zeigt sie vollstaendig; nach komplettem Neuladen unveraendert vorhanden, ohne Schluessel und ohne Netzanfrage. |
| 4 | Testlauf mit echtem Schluessel (10-20 Situationen) | **erfüllt** | Vom Nutzer mit gueltigem Anthropic-Schluessel durchgefuehrt und bestaetigt (2026-08-31); die Zahlen des Laufs liegen nicht vor. |
| 4 | Tests und tsc gruen | **erfüllt** | 237 Tests in 9 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 4 | Prompt-Vertrag geprueft (Antwortform passt zum Parser) | **erfüllt** | prompt-contract.test.ts: zwei ausformulierte Musterantworten je Richtung; prueft Zuglaenge, Sprecherwechsel, alle drei Sprachfassungen und richtungsspezifische Korrektur-Hinweise. Schliesst die einzige Luecke, die der Lauf mit ungueltigem Schluessel offenliess. |
| 5 | Bild-Pipeline nutzt die Batch-Infrastruktur aus Phase 4 statt einer Kopie | **erfüllt** | Der Laeufer steht jetzt einmalig in lib/generation/batch.ts (runBatch + BatchTask); conversation/batch.ts und images/batch.ts sind duenne Adapter. Alle 23 Tests aus Phase 4 laufen unveraendert weiter. Anmerkung: das Protokoll fuehrte plan.ts/batch.ts frueher als generisch - sie waren es nicht, sie sind es jetzt. |
| 5 | Anbieter gewaehlt und Browser-/CORS-Verhalten empirisch belegt | **erfüllt** | AE-13. Gemessen: POST an api.openai.com wird von CORS geblockt (GET nicht), POST an api.stability.ai kommt durch (401). Kontrollmessung an api.anthropic.com mit/ohne Header wie in Phase 4. dangerouslyAllowBrowser des openai-SDK setzt keinen Header - im Paket nachgesehen. |
| 5 | Anfrageform gegen die laufende API belegt, nicht geraten | **erfüllt** | Stability prueft Pflichtfelder und Enums vor der Authentifizierung; die API nannte die erlaubten Werte fuer output_format, aspect_ratio, seed und prompt selbst. Die vollstaendige gueltige Anfrage lief bis 401 durch, ein falscher Pfad gibt 404. |
| 5 | Speicherformat fuer Bilder begruendet geloest | **erfüllt** | AE-14: Metadaten in der Sammlung images, Bytes in eigener Ablage (nativ expo-file-system, Web IndexedDB). Grund nachgesehen: AsyncStorage-Web ist window.localStorage (~5 MB fuer alle Sammlungen zusammen); expo-file-system hat auf Web keine Umsetzung. |
| 5 | isConcrete-Gate testgesichert - Pipeline laeuft fuer abstrakte Eintraege gar nicht erst an | **erfüllt** | AE-15: drei Sperren plus Literaltyp isConcrete: true. Ein Test faehrt einen gefaelschten Auftrag durch den echten Batch: 0 Client-Aufrufe, 0 gespeichert, 1 Fehlschlag mit Begruendung. Ein zweiter mischt ihn unter vier echte - die vier laufen durch. |
| 5 | Kleiner Testlauf erfolgreich, danach offline abrufbar ohne Schluessel | **erfüllt** | 5 Bilder durch dieselbe Pipeline mit einem Ersatz-Client (echte WebP-Bytes): 5 erzeugt, 0 fehlgeschlagen; die IndexedDB enthielt die fuenf .webp-Eintraege, localStorage blieb bei 78 KB. Danach Dev-Server neu gestartet und Seite neu geladen: '5 von 25 Bildern', Schluesselfelder leer, Bilder auf den Karteikarten sichtbar. |
| 5 | Lauf durch den echten Netzwerkpfad (ungueltiger Schluessel) | **erfüllt** | Aus dem Web-Build: 5/5 verarbeitet, 0 erzeugt, 5 fehlgeschlagen mit 'HTTP 401: authorization: invalid or missing header value', 0 gespeichert. |
| 5 | Bild auf der Karteikarte, richtungsabhaengig | **erfüllt** | de_to_th: Bild schon auf der Vorderseite (verraet die thailaendische Form nicht). th_to_de: erst nach dem Aufdecken (waere sonst die Antwort). Eine abstrakte Karte zeigt kein Bild und keinen Platzhalter. Bei 375 px und im breiten Fenster geprueft. |
| 5 | Testlauf mit gueltigem Stability-Schluessel | **offen** |  |
| 5 | Tests und tsc gruen | **erfüllt** | 275 Tests in 10 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 6 | Je Richtung mindestens ein eigener Uebungstyp aus vorhandenen Daten | **erfüllt** | de_to_th: Ton-Erkennung aus syllables[0].tone (69 einsilbige Eintraege, alle fuenf Toene vertreten). th_to_de: Artikel aus germanNoun.article (29 Substantive) und Stammformen aus germanVerb (20 Verben). Keine neue Content-Generierung noetig. |
| 6 | Uebungen im Browser spielbar | **erfüllt** | Alle drei durchgespielt: Ton (Antwort 'Tief' auf สี่ -> richtig, Aufloesung 'sìi - vier'), Artikel (falsche Antwort -> richtige Option gruen umrandet, Plural in der Erklaerung), Stammformen ('machen' mit vertauschtem Hilfsverb und zwei echten Fremdformen als Ablenker). |
| 6 | Kein erfundener Ablenker | **erfüllt** | Test prueft fuer JEDES Verb im Bestand, dass jede falsche Antwort entweder eine echte Perfektform aus der Vokabeldatei oder die Form mit vertauschtem Hilfsverb ist. |
| 6 | Ton-Uebung nur fuer einsilbige Woerter | **erfüllt** | Bei mehrsilbigen Woertern hat jede Silbe ihren eigenen Ton (AE-7), und die Silbengrenze in der Thai-Schrift ist nicht bestimmbar (AE-8). buildToneQuestion wirft; Test deckt alle mehrsilbigen Eintraege ab. |
| 6 | FSRS-Integrationsfrage entschieden und begruendet | **erfüllt** | AE-16: Uebungen laufen NICHT durch FSRS (eine Erinnerungsspur je Item; Ratequote 20-33 % passt nicht zur Selbsteinschaetzungs-Skala; Kartenschluessel ist vocabId:direction). Sie waehlen ihre Aufgaben aber ueber den vorhandenen FSRS-Zustand und werden im Tagesprotokoll getrennt gezaehlt. Tests belegen, dass keine Karte angelegt oder veraendert wird. |
| 6 | Nutzerprofil-Frage entschieden und begruendet | **erfüllt** | AE-17: Standard-Lernrichtung im meta-Dokument 'profile', nur ausdruecklich gesetzt, jederzeit aufhebbar, Auswahl bleibt ueber 'Richtung wechseln' erreichbar. Im Browser geprueft: gesetzt, neu geladen, startet direkt in der Richtung; Auswahl weiterhin erreichbar und markiert den Standard. |
| 6 | Fehlende Thai-Stimme wird benannt statt stumm zu bleiben | **erfüllt** | isLanguageAvailable liefert ja/nein/weiss-nicht; gewarnt wird nur bei eindeutigem Nein, weil manche Plattformen eine leere Stimmenliste liefern. Im Testbrowser: drei Stimmen, alle de-DE, kein Thai - der Hinweis erschien korrekt. |
| 6 | Uebungen in der Statistik sichtbar, ohne die Wiederholungszahl zu verfaelschen | **erfüllt** | Eigene Zaehler drills/drillsCorrect, eigene Kachel, gestapeltes Diagramm mit Legende. Im Browser nach zwei Aufgaben: 'Heute wiederholt 0 - Heute geuebt 2 - Tage in Folge 1'. Ein Tag mit nur Uebungen zaehlt fuer die Serie mit. |
| 6 | Tests und tsc gruen | **erfüllt** | 322 Tests in 11 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 7 | Reale Modulstruktur mit Quellenangabe erhoben und dokumentiert | **erfüllt** | Beide vorgegebenen Seiten liefern WebFetch HTTP 403; abgerufen ueber den echten Browser am 2026-08-31, dazu die drei Zertifikatsseiten gzsd1/gzsd2/gzb1 unter .../inf.html. Struktur woertlich im Code (lib/exam/types.ts) mit source und retrieved, sichtbar auch im UI. |
| 7 | Aufgabenformate beobachtet statt geraten | **erfüllt** | Einstufungstest (goethe.de/lrn/pro/30-item/, im iframe der tsd.html) Aufgabe fuer Aufgabe durchgeklickt: A/B/C-Auswahl, Richtig/Falsch mit echten mp3-Dateien, Zuordnung (Kaufhaus-Wegweiser, 'Welche Anzeige passt'), Lueckentext. Daraus die vier Formate im Schema. |
| 7 | ExamModule-Schema festgelegt und umgesetzt | **erfüllt** | Unterscheidende Union: bewertbare Aufgaben tragen items, freie tragen production. Der Typ zwingt die Oberflaeche, beide Faelle zu behandeln, statt fuer einen freien Text eine Punktzahl zu erfinden. ExamPart hat ein eigenes Feld approximate, weil A2 'etwa 30 Minuten' sagt und A1 '25 Minuten'. |
| 7 | Mindestens ein spielbares Beispiel je Fertigkeit und Aufgabentyp | **erfüllt** | Acht mitgelieferte Aufgaben decken Lesen, Hoeren, Schreiben und Sprechen sowie alle fuenf Formate auf A1 und A2 ab; Tests erzwingen beide Abdeckungen. Im Browser durchgespielt: Hoeren A1 (3/3, Skript erst nach dem Auswerten), Lesen A1, Sprechen A1 mit Musterloesung und Vorlesetaste. |
| 7 | Geltungsbereich begruendet entschieden | **erfüllt** | AE-19: Modul ist th_to_de. Ein Thai-Gegenstueck existiert (CU-TFL, Chulalongkorn), wurde aber nicht gebaut - die Primaerquelle war aus der Sitzung nicht erreichbar und die Sekundaerquellen widersprechen sich in der Stufenskala. Das Feld direction steht trotzdem im Schema. |
| 7 | Inhalt aus Vorhandenem, Batch-Infrastruktur wiederverwendet | **erfüllt** | Texte aus dem deutschen Teil des geprueften Grundstocks plus elementare Funktionswoerter; Hoerskripte ueber die Aussprache-Abstraktion aus Phase 3 (de-DE), also ohne neue Audio-Erzeugung. runExamBatch ist ein Adapter ueber demselben Laeufer wie Situationen und Bilder - dritter Nutzer, keine Kopie. |
| 7 | Lauf durch den echten Netzwerkpfad (ungueltiger Schluessel) | **erfüllt** | Aus der Oberflaeche heraus: 8/8 verarbeitet, 0 erzeugt, 8 fehlgeschlagen mit '401 authentication_error - API key is invalid', 0 gespeichert; der Bestand blieb bei den acht mitgelieferten Aufgaben. |
| 7 | Keine erfundene Bewertung | **erfüllt** | AE-20: Lesen und Hoeren werden ausgewertet, Schreiben und Sprechen bekommen Musterloesung und Selbstkontrolle statt einer Punktzahl. Nirgends eine Bestehensgrenze, weil die Durchfuehrungsbestimmungen nicht erhoben wurden - der Hinweis steht im UI. |
| 7 | Tests und tsc gruen | **erfüllt** | 365 Tests in 12 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 8 | eas.json mit development/preview/production-Profilen | **erfüllt** | development (Dev-Client, APK, iOS-Simulator), preview (APK, iOS-Simulator, interne Verteilung), production (AAB, autoIncrement); cli.appVersionSource remote. Gueltiges JSON; gegen die EAS-CLI pruefbar erst nach Anmeldung. |
| 8 | app.json fuer EAS vollstaendig | **erfüllt** | android.package und ios.bundleIdentifier ergaenzt (com.thailernbegleiter.app) - ohne sie baut EAS gar nicht. expo-dev-client installiert, sonst kann das development-Profil nicht bauen. |
| 8 | APK/AAB-Wahl begruendet | **erfüllt** | AE-21: Testprofile bauen APK, weil ein AAB sich laut EAS-Dokumentation nicht direkt aufs Geraet installieren laesst; production bleibt beim AAB, weil Google Play das verlangt. |
| 8 | iOS-Weg ohne Apple-Konto gefunden und begruendet | **erfüllt** | AE-22: Simulator-Build (ios.simulator true). Die EAS-Dokumentation sagt woertlich, das gehe 'without needing to deploy to TestFlight or even having an Apple Developer account'. Ein Geraete-Build braucht weiterhin das Apple Developer Program. |
| 8 | EAS-Kontingente und Kosten aktuell nachgesehen | **erfüllt** | Am 2026-09-01 von expo.dev/pricing und expo.dev/pricing.md: Free 0 $/Monat mit 15 Android- und 15 iOS-Builds, niedrige Prioritaet, 60 min CI/CD, Updates an 1K MAUs; Starter 19 $, Production 199 $, Enterprise individuell. Fuer dieses Projekt reicht der freie Tarif. |
| 8 | Web-Export lauffaehig | **erfüllt** | npx expo export --platform web: 8 statische Routen, 3,1 MB in dist/, die Bildablage als eigene Datei (verzoegertes Laden aus Phase 5 funktioniert auch im Export). Aus einem schlichten statischen Server ausgeliefert - Pruefungsmodul und Artikel-Uebung liefen vollstaendig, keine Konsolenfehler. |
| 8 | WordPress-Anschluss bewusst offen gelassen und begruendet | **erfüllt** | AE-23: Im Export nachgemessen, dass die Buendel absolut referenziert werden (/_expo/static/...). Fuer ein Unterverzeichnis braucht es experiments.baseUrl in app.json plus einen neuen Export; ohne bekannten Zielpfad gesetzt, macht das den Export ueberall sonst kaputt. Haken laut Doku: Link und router setzen den Basispfad selbst davor, ein rohes <a> und die Linking-API nicht. |
| 8 | Icons/Splash geprueft | **erfüllt** | Nachgesehen: assets/images/ enthaelt unveraendert den Bildersatz des Expo-Templates, auch assets/expo.icon/ ist das Expo-Symbol. Als offener Punkt vor einer Store-Einreichung benannt, nicht selbst gestaltet - kein Auftrag dieser Phase. |
| 8 | Android-Testbuild tatsaechlich gebaut und installiert | **offen** |  |
| 8 | iOS-Build mindestens einmal ueber EAS durchgelaufen | **offen** |  |
| 8 | Tests und tsc gruen | **erfüllt** | 365 Tests in 12 Suites gruen; npx tsc --noEmit fehlerfrei. Phase 8 hat keine Geschaeftslogik angefasst. |
| 8 | Build-Konfiguration vorab validiert, ohne Konto | **erfüllt** | expo-doctor fand eine fehlende Peer-Abhaengigkeit (expo-asset, gebraucht von expo-audio, 'Your app may crash outside of Expo Go without this dependency') - nachinstalliert, jetzt 21/21 Pruefungen. expo prebuild erzeugte das native Projekt sauber; applicationId und die Keychain-Backup-Regeln aus AE-10 sitzen richtig. Ein lokaler Gradle-Build schied aus: kein JDK und kein Android-SDK auf dem Rechner. |
| 8 | Keine ueberfluessigen Android-Berechtigungen | **erfüllt** | Der Prebuild zeigte RECORD_AUDIO, FOREGROUND_SERVICE und FOREGROUND_SERVICE_MEDIA_PLAYBACK aus expo-audio - die App nimmt aber nie auf. Im Plugin nachgesehen und in app.json abgeschaltet (recordAudioAndroid false, microphonePermission false, enableBackgroundPlayback false); danach aus dem Manifest verschwunden. Rest nachverfolgt: READ/WRITE_EXTERNAL_STORAGE kommen von expo-file-system und tragen maxSdkVersion 32; SYSTEM_ALERT_WINDOW stammt aus der Expo-Vorlage und ist vor einer Store-Einreichung anzusehen. |
| 9 | Kontrastwerte tatsaechlich berechnet, nicht geschaetzt | **erfüllt** | WCAG-2.1-Formel (relative Leuchtdichte, (L1+0,05)/(L2+0,05)) in tones.test.ts ausgeschrieben und gegen die Norm-Beispiele geprueft (Schwarz/Weiss = 21:1, #767676 auf Weiss >= 4,5). Ergebnis der Erstmessung: die einzelne Farbe je Ton aus dem Referenzprototyp verfehlte AA in BEIDEN Modi - hell fielen mid (3,35), high (2,81) und rising (3,95) durch, dunkel low (2,47), falling (2,81) und rising (3,54). |
| 9 | Tonfarben erreichen WCAG AA auf jedem Untergrund | **erfüllt** | AE-24: je Ton eine helle und eine dunkle Fassung, Farbton erhalten, Helligkeit geloest. Alle fuenf Toene erreichen in beiden Modi >= 4,5:1 gegen background, backgroundElement und backgroundSelected. tones.test.ts rechnet das bei jedem Testlauf nach und prueft zusaetzlich, dass der Farbton zwischen den Modi gleich bleibt. |
| 9 | Screenreader-Labels fuer alle Icon-only-Interaktionen | **erfüllt** | Audit ueber alle 30 Pressables. Einziger echter Icon-only-Knopf war die kompakte Vorlesetaste des Beispielsatzes; ihr Label lautete '▶: <Text>' und begann also mit dem Zeichen selbst. Jetzt 'Beispielsatz anhoeren: ...' - im Browser nachgemessen. Auf den geprueften Screens hat kein Bedienelement mehr weder Label noch Text. |
| 9 | Tippziele mindestens 24x24 (WCAG 2.2 AA 2.5.8) | **erfüllt** | Im Web-Build gemessen: drei reine Textknoepfe waren nur 20 Pixel hoch ('Richtung wechseln', 'Als Standard merken', 'Uebung verlassen'). Auf 44 gesetzt; Nachmessung ergibt kein Element mehr unter 24. Die kompakte Vorlesetaste misst jetzt 44x44. |
| 9 | Tastaturbedienbarkeit im Web-Build geprueft | **erfüllt** | 15 von 15 Bedienelementen sind fokussierbar (tabIndex >= 0), Tab wandert der Reihe nach durch, der Fokusring ist sichtbar (im Screenshot belegt), und sie rendern als native <button> mit funktionierendem Klickpfad. Die AUSLOESUNG per Enter liess sich mit dem Automatisierungswerkzeug nicht nachweisen - ein Kontrollversuch mit einem selbst eingefuegten, ganz gewoehnlichen HTML-Knopf schlug genauso fehl. Die Grenze liegt also im Werkzeug, nicht in der App; als Fehler gemeldet wird das ausdruecklich NICHT. |
| 9 | Fehlerbehandlung ausserhalb der Batch-Pfade geschlossen | **erfüllt** | AE-25: Beim Schreiben wurde streng geprueft, beim LESEN blind vertraut. Ein leeres oder veraltetes Dokument liess Pruefungs- und Gespraech-Screen mit 'Cannot read properties of undefined (reading map)' abstuerzen - vorher im Kleinen nachgestellt. Jetzt filtern isValidExamModule und isValidSituation an der Lesegrenze; 18 neue Tests decken die Faelle ab, inklusive: Beschaedigtes wird ausgelassen, aber NICHT geloescht. |
| 9 | Konsolidierte Abnahme gegen den JETZIGEN Repo-Zustand | **erfüllt** | Tabelle in PROGRESS.md, aus .agent/state.json erzeugt statt abgetippt. Der Quergriff, den Phase 9 selbst gefaehrdet hat, wurde eigens nachgemessen: das Phase-3-Kriterium zu den Silbenfarben war mit den ALTEN Farben geprueft. Neu gemessen zeigt สวัสดี jetzt rgb(138,155,177) / rgb(138,155,177) / rgb(136,160,131) - tief-tief-mittel gilt weiterhin, mit den Dunkelmodus-Fassungen. |
| 9 | Toter Code aus der Vorlage entfernt | **erfüllt** | Collapsible aus dem Expo-Template war nirgends eingebunden und das einzige Bedienelement ganz ohne accessibilityRole. Entfernt; damit wurde expo-symbols unbenutzt und ist ebenfalls raus. expo-doctor weiterhin 21/21. |
| 9 | Tests und tsc gruen | **erfüllt** | 392 Tests in 14 Suites gruen; npx tsc --noEmit fehlerfrei. |
| 10 | Alle drei Generator-Gruppen zeigen Anbieter-Auswahl und Modell-Textfeld | **erfüllt** | Im Web-Build geprueft: Sprachsituationen, Bilder und Pruefungsaufgaben haben je eine Anbieterreihe und ein Modell-Freitextfeld. Umstellen wirkt sofort auf Modellvorschlag, Schluesselplatzhalter und die Beschriftung des Schluesselfeldes ('API-Schluessel fuer Google') und NUR auf die eigene Gruppe. Statt eines Aufklappfeldes eine Knopfreihe - Begruendung in AE-28 (React Native hat kein plattformweites Dropdown; @expo/ui ist nativ-only). |
| 10 | Gemini-CORS-Befund gemessen und dokumentiert | **erfüllt** | AE-26. Aus dem laufenden Web-Build am 2026-09-03: generateContent (Text), gemini-2.5-flash-image, imagen-4.0:predict und GET /v1beta/models kommen alle durch (HTTP 400, lesbar), mit Schluessel im Header wie als Query-Parameter. Kontrollen: Anthropic mit/ohne Header wie in AE-12; example.com und goethe.de scheitern - die CORS-Pruefung war also scharf. Genommen wurde der Header, weil eine URL in Verlaufslisten landet. Haken: mit ungueltigem Schluessel antwortet Google auf ALLES 'API key not valid', auch auf ein erfundenes Modell - Anfrage- und Antwortform sind damit vor dem ersten bezahlten Aufruf nicht belegbar. |
| 10 | ChatGPT im Web-Build klar als eingeschraenkt gekennzeichnet | **erfüllt** | AE-27. Die Messung bestaetigt eine Einschraenkung, aber mit anderer Ursache als in AE-13 vermutet: Ein POST an api.openai.com mit einem Schluessel, der mit 'sk-' beginnt, bekommt eine Antwort ohne Access-Control-Allow-Origin; mit 'SK-' oder 'xk-' kommt dieselbe Anfrage durch, beim GET greift die Regel nicht. Da jeder echte OpenAI-Schluessel mit 'sk-' beginnt, bleibt die Konsequenz aus Phase 5 dieselbe. Warnung steht in der Oberflaeche, aber nur hinter Platform.OS === 'web' - nativ gibt es kein CORS. Zwei andere Verdaechtige (Anmeldedaten, Anfragekoerper) wurden geprueft und verworfen. |
| 10 | Provider-Abstraktion statt dritter Kopie | **erfüllt** | AE-28: TextClient und ImageClient in src/lib/providers/. Die bestehenden Anthropic- und Stability-Umsetzungen haengen dahinter, nicht daneben; Prompts, Parser, Bauplan und der Batch-Laeufer aus Phase 5 wurden nicht angefasst. createAnthropicClient und createStabilityImageClient bleiben als Aufruf erhalten. Ein Test belegt, dass beide Textgeneratoren denselben anbieterfreien Prompt schicken. |
| 10 | Key-Speicherung je Anbieter nach dem AE-10-Muster | **erfüllt** | api-key.ts von zwei auf vier Anbieter erweitert, Muster unveraendert (nativ Keychain, Web nur Sitzung, Weiche ueber isAvailableAsync). Tests mit einer nachgebildeten sicheren Ablage: vier Schluessel getrennt, Loeschen eines Anbieters laesst die anderen stehen, und der Claude-Schluessel liegt weiterhin unter dem alten Namen 'anthropic-api-key' - ihn umzubenennen haette gespeicherte Schluessel unauffindbar gemacht. |
| 10 | Modellname nicht validiert (Freitext, kein Katalog) | **erfüllt** | Pflicht 5. Ein Test faehrt vier beliebige Namen durch, darunter '../etwas', und erwartet sie unveraendert zurueck. Leeres Feld nimmt den Vorschlag des Anbieters; ein Anbieterwechsel zieht den Modellnamen mit. Bei Gemini und Stability fuellt der Name den Pfad und wird kodiert, damit ein Tippfehler mit Schraegstrich keine fremde Adresse baut. Im Browser mit 'gemini-99-voellig-ausgedacht' geprueft, inklusive Neuladen. |
| 10 | Bestehende Anthropic-/Stability-Generatoren laufen unveraendert weiter (Regressionstest) | **erfüllt** | Zweifach belegt. Testebene: alle 392 Tests aus Phase 0-9 laufen unveraendert gruen; zusaetzlich prueft ein Test, dass die Voreinstellungen (Claude/claude-opus-5, Stability/stable-image-core) und die in AE-13 gemessene Endpunktadresse sich nicht verschoben haben. Netzebene, aus der Oberflaeche mit ungueltigem Schluessel: Sprachsituationen ueber Claude 16/16 mit '401 authentication_error - API key is invalid' (wortgleich Phase 4/7), Bilder ueber Stability 5/5 mit 'HTTP 401: authorization: invalid or missing header value' (wortgleich Phase 5). Bestand danach unveraendert. |
| 10 | Lauf durch den echten Netzwerkpfad je neuem Anbieter (ungueltiger Schluessel) | **erfüllt** | Sprachsituationen ueber Gemini: 16/16 verarbeitet, 0 erzeugt, 16 x 'HTTP 400: API key not valid. - INVALID_ARGUMENT'. Pruefungsaufgaben ueber Gemini: 8/8, Bestand bleibt bei den 8 mitgelieferten. Bilder ueber ChatGPT: 5/5, 5 x 'Keine Antwort von api.openai.com' mit CORS-Erklaerung. Nach jedem Lauf 0 gespeichert. |
| 10 | Auswahlzustand ist fuer Screenreader ablesbar (Nebenbefund) | **erfüllt** | AE-29, nicht Auftrag dieser Phase, beim Nachmessen gefunden: accessibilityState={{selected}} erzeugt in dieser React-Native-Web-Fassung GAR KEIN ARIA-Attribut, und accessibilityRole 'radio' + accessibilityState {{checked}} liefert zwar role=radio, aber kein aria-checked. Betraf auch Umfang (Phase 4) und Standard-Lernrichtung (Phase 6). Behoben durch direkt gesetztes aria-checked plus radiogroup; nachgemessen 18 von 18 Auswahlknoepfen mit Zustand, davon 7 auf true, und kein Aktionsknopf mit falscher Rolle. |
| 10 | Tests und tsc gruen | **erfüllt** | 437 Tests in 15 Suites gruen (vorher 392 in 14); npx tsc --noEmit fehlerfrei. |
| 10 | Antwortform von ChatGPT und Gemini gegen die laufende API belegt | **offen** |  |
| 11 | Kleiner Testlauf erzeugt Audio, danach offline abspielbar ohne Key | **erfüllt** | Probelauf (5 Vokabeln + 5 Beispielsaetze) durch die echte Pipeline mit einem Ersatz-Client wie in Phase 5: zehn echte Thai-Clips (Microsoft th-TH-Premwadee, mp3) fuer genau die zehn Texte. 10/10 erzeugt; IndexedDB thai-lernbegleiter-audio mit zehn th-<hash>.mp3, 105 264 Byte, localStorage nur +3 280 Zeichen Metadaten. Nach Neuladen ohne Schluessel: Statuszeile '10 Clips, 103 KB', Gespraechszug spielt den Clip (mitgeschnitten new Audio('data:audio/mpeg…') + play()), Karteikarte สวัสดี im Reiter Lernen spielt den Clip und schreibt 'KI-Stimme - keine Muttersprachler-Aufnahme' darunter. Der ECHTE Anbieterlauf (Gemini/ChatGPT) steht wegen B-6 aus. |
| 11 | Resolver bevorzugt Asset, faellt ohne Asset weiterhin auf TTS zurueck (Test) | **erfüllt** | clips.test.ts: Clip vorhanden -> 'asset' mit data:audio/wav-Quelle, gefunden nur ueber Text und Sprache wie die Gespraech-Seite ruft; kein Clip -> 'tts' mit th-TH; Clip-Suche wirft -> 'tts'; ausdrueckliche audioAssetId hat Vortritt; Index wird nach Lauf und Loeschen verworfen. Die neun Tests aus Phase 3 (audio.test.ts) laufen unveraendert. Im Web-Build: Zug ohne Clip blieb bei der Sprachausgabe, Zug mit Clip spielte ihn. |
| 11 | Tonqualitaets-Messung samt Grenzen dokumentiert | **erfüllt** | AE-31 und scripts/tone-contour.html. Fuenf Minimalpaar-Woerter aus dem Grundstock (มา ม้า หมา ไม่ ใหม่), drei Stimmen zweier Engines (Microsoft Premwadee/Niwat, Google), F0 ueber normierte Autokorrelation mit Oktavkorrektur, Konturen in Halbtoenen, schwellenfreie Ordnungspruefung je 7 von 8. Befund: fallend/tief ueberall klar, steigend bei Google NICHT realisiert, mittel/hoch bei Microsoft schwach getrennt - keine Stimme trifft alle fuenf. Grenze ausdruecklich: die App-Anbieter selbst (Gemini, ChatGPT) konnten ohne Schluessel nicht gemessen werden; Kontur ist keine Hoerpruefung. |
| 11 | Speicherbedarf-Abschaetzung dokumentiert | **erfüllt** | AE-30. Gemini-PCM 48 000 Byte/s aus der Doku; Sprechraten an zwei Stimmen gemessen (Silbe 0,9-1,6 s, 11 Zeichen ~2 s, 37 Zeichen 3,4-4,3 s); konservativ 1 s + 10 Zeichen/s. Probelauf ~0,8 MB, alle Vokabeln ~11 MB, voller Dialoglauf ~700 MB als WAV (ChatGPT-mp3 etwa ein Achtel, geschaetzt). Die Schaetzung steht am Knopf VOR dem Start, die Ist-Summe in der Statuszeile; gemessen 10 mp3-Clips = 105 264 Byte. |
| 11 | AudioClient in der Provider-Abstraktion aus Phase 10, CORS je Anbieter gemessen | **erfüllt** | providers/audio.ts neben text.ts und image.ts; vierte Generator-Gruppe 'audio' mit Stimme als Freitext. Gemessen: Gemini-TTS ueber generateContent und ueber /v1beta/interactions beide 400 lesbar; OpenAI /v1/audio/speech unterliegt der sk--Regel aus AE-27 (Bearer ungueltig -> 401 lesbar, Bearer sk-… -> Failed to fetch). Claude und Stability: 'keine Sprachausgabe' als benannter Fehler. Kein fuenfter Anbieter - Begruendung in AE-31. |
| 11 | Ablage nach AE-14-Muster: Metadaten in Sammlung, Bytes in Dateiablage | **erfüllt** | Sammlung 'audio' + Blob-Ablage 'audio' (nativ Paths.document/audio/, Web IndexedDB thai-lernbegleiter-audio). Dafuer die Bildablage zu lib/blobs verallgemeinert (AE-30); alle Bild-Tests liefen ohne Aenderung weiter, IndexedDB-Name und Ordner der Bilder unveraendert. |
| 11 | Ehrliche Kennzeichnung: TTS-Aufnahmen sind keine Muttersprachler-Aufnahmen | **erfüllt** | synthetic: true als Literaltyp im Dokument. Karteikarte, Beispielsatz und Gespraechszug schreiben 'KI-Stimme - keine Muttersprachler-Aufnahme' daneben, sobald ein Clip gespielt hat (auch im Screenreader-Label); bei der Sprachausgabe des Geraets nicht. Im Web-Build beobachtet: 'KI-Stimme' erschien genau am Zug mit Clip, nicht am Zug ohne. |
| 11 | Screens fuer den Resolver-Pfad nicht angefasst | **erfüllt** | Die Screens rufen weiter playPronunciation({ text, language }); der Clip wird ueber Text und Sprache gefunden (Thai ohne Leerraum, AE-30). Geaendert wurden Screens NUR fuer die Kennzeichnung nach Pflicht 4 (SpeakButton, TurnSpeakButton) - nicht, damit Clips spielen. |
| 11 | Tests und tsc gruen | **erfüllt** | 469 Tests in 16 Suites gruen (vorher 437 in 15); npx tsc --noEmit fehlerfrei. |
| 11 | Tonqualitaet der App-Anbieter selbst gemessen (Gemini, ChatGPT) | **offen** |  |
| 12 | Getrennte lokale Aufnahmewege fuer Web und nativ, Grenze gemessen dokumentiert | **erfüllt** | Nativ useAudioStream aus expo-audio 57 (Int16-PCM), Web getUserMedia/Web Audio, weil der installierte AudioStream.web-Stub null liefert. Beide Hook-Lebenszyklen mit API-Doubles getestet; kein fetch, Anbieter, Schluessel, Datei- oder Repository-Schreibpfad. Der In-App-Browser blieb am nicht bedienbaren Mikrofon-Prompt, reales natives PCM bleibt B-2 - AE-34 nennt beide Grenzen. |
| 12 | Sollkontur nachweislich aus verifizierten Tondaten, nie aus TTS | **erfüllt** | Nur sourceVerified und genau eine Silbe; targetTone = syllables[0].tone. Gegenprobe mit widerspruechlichem entry.tone und falschem audioAssetId bleibt beim Silbenton; SpeakingPrompt enthaelt kein Audiofeld. Hoerclip ist im UI separat und wird vor Aufnahme gestoppt. |
| 12 | Phase-8-Mikrofonentscheidung bewusst und minimal umgekehrt | **erfüllt** | AE-33. recordAudioAndroid true und iOS-Zwecktext; Hintergrundaufnahme/-wiedergabe false. Android-Prebuild: RECORD_AUDIO vorhanden, kein FOREGROUND_SERVICE_MICROPHONE/Recording Service. Laufzeitabfrage nach UI-Begruendung erst im start()-Pfad, per Hook-Test belegt. |
| 12 | F0-Verfahren aus tone-contour.html samt Oktavgrenze wiederverwendet | **erfüllt** | 40/10 ms, 70-400 Hz, RMS/Korrelation, Medianfilter, laengste Strecke, einmalige 1,8-fache Oktavkorrektur, 8 Prozent Beschnitt und sechs Halbtonpunkte. Tests fuer 48->8 kHz, Oktavsprung, genau einen Durchgang, Stille und eine steigende PCM-Kurve; verbleibender Oktavfehler steht im UI. |
| 12 | Bewertung bleibt ehrlich und ohne Aussprache-Score | **erfüllt** | UI nennt Konsonanten, Vokallaenge, Aspiration, F0-/Oktavfehler. Nur relative Steig-/Fallform bekommt ohne Baseline ein binaeres Kontururteil; mittel/tief/hoch melden Register offen. Kein score/correct-Feld, keine Behauptung vollstaendiger Aussprache. |
| 12 | FSRS-Entscheidung begruendet und ohne Schreibzugriff umgesetzt | **erfüllt** | AE-35. Kartenzustand wird nur fuer die Auswahl schwacher Woerter gelesen; Session-Test vergleicht den Kartenbestand vor/nach dem Bau. Keine Karte, Bewertung oder Statistik wird geschrieben. |
| 12 | Physische Aufnahme und Konturauswertung auf Android/iOS-Geraet | **offen** |  |
| 12 | Tests, TypeScript und Web-Export gruen | **erfüllt** | 508 Tests in 22 Suites gruen (vorher 469/16); npx tsc --noEmit fehlerfrei; Expo-Web-Export mit acht statischen Routen erfolgreich; gerenderter Sprechscreen ohne Browser-Konsolenfehler. |
| 13 | Konsonanten mit Klassen, Vokalzeichen und Tonregeln als gepruefte Daten mit Quellenangabe | **erfüllt** | src/data/thai-script.ts: 44 Konsonanten (9 mittel / 11 hoch / 24 tief, per Test nachgerechnet), 59 Vokalmuster mit Laenge, vollstaendige Tonregeltabelle inklusive der Luecken bei mai tri und mai chattawa, vier Tonzeichen, ho nam, o nam. Quelle englische Wikipedia 'Thai script', abgerufen 2026-09-03 ueber die MediaWiki-API als ROHTEXT - ein erster Abruf ueber ein zusammenfassendes Werkzeug lieferte nur 28 der 44 Konsonanten. Die Konsonantenzeilen sind aus dem geparsten Rohtext erzeugt, nicht abgetippt. |
| 13 | Unsichere Faelle gekennzeichnet statt entschieden | **erfüllt** | Zwei Stellen, Muster ร้าน/นอน aus Phase 2: ล traegt in der Quelle '/n/ or /w/' und fuehrt beide Werte samt uncertainNote; der implizite Vokal (zwei Konsonanten ohne Vokalzeichen) wird als kurzes /o/ gelesen, die Quelle kennt fuer dieselbe Schreibung auch ein langes /ɔː/ - diese Mehrdeutigkeit steht im UI der Uebung, nicht nur im Code. Ein Test haelt fest, dass genau ล gekennzeichnet ist. |
| 13 | Spielbare Herleitungsuebung, gegen die bekannten Toene des Grundstocks gegengeprueft | **erfüllt** | AE-37. Vierte Uebung 'Ton herleiten' (toneRule, de_to_th): zeigt die Thai-Schrift, fragt den Ton, erklaert danach sieben Schritte (Anfangskonsonant, Klasse, Vokal, Schlusslaut, Silbenart, Tonzeichen, Ergebnis). Gegenprobe: 69 von 69 einsilbigen Eintraegen richtig hergeleitet, KEIN einziger falsch; die Uebung baut eine Aufgabe nur, wenn Herleitung und quellengepruefter Ton uebereinstimmen. Im Web-Build eine volle Runde ueber zehn Aufgaben gespielt (darunter หนึ่ง, ครับ, หก, ค่ะ, ห้า) mit Auswertung am Ende. |
| 13 | Silbengrenzen bleiben ungeloest - mehrsilbige Woerter werden abgewiesen | **erfüllt** | AE-8 gilt weiter. analyzeSyllable nimmt genau eine Silbe entgegen; ein Test faehrt alle 15 mehrsilbigen Eintraege durch und verlangt fuer jeden einen benannten Fehlschlag. Dabei kam ein Befund heraus: ตลาด wurde zunaechst als eine Silbe gelesen, weil jedes Konsonantenpaar als Verbindung durchging. Behoben ueber die belegte Verbindungsliste (zweite Quelle) - eine Schranke gegen das Raten, ausdruecklich kein Segmentierungsansatz (AE-38). |
| 13 | Konsistenz mit Bestehendem: Tonfarben, Konturglyphen, Barrierefreiheit | **erfüllt** | Pflicht 4. Die Antwortoptionen tragen nur den Ton; Farbe und Kontur holt die Oberflaeche aus constants/tones.ts. Im Web-Build nachgemessen: exakt die dort hinterlegten Dunkelmodus-Werte (#88a083, #8a9bb1, #c88b7a, #ba9443, #82a097) und Konturpfade - keine zweite Darstellung, keine neuen Farben, also gilt die Kontrastpruefung aus Phase 9 unveraendert. Herleitung als role=list mit sieben role=listitem; kein Bedienelement ohne Beschriftung, kein Tippziel unter 24 Punkten, keine Konsolenfehler. |
| 13 | Tests und tsc gruen | **erfüllt** | 545 Tests in 23 Suites gruen (vorher 508 in 22); npx tsc --noEmit fehlerfrei. |
| 14 | Freie Produktion in beide Richtungen spielbar, ohne Schluessel nutzbar | **erfüllt** | Uebungstyp 'Schreiben' in BEIDEN Richtungen (anders als die Auswahluebungen, die je Richtung verschieden sind). Im Web-Build durchgespielt: th_to_de หนึ่ง mit 'eins' -> genau richtig; de_to_th 'machen' ueber die Zeichenpalette als ทำ zusammengesetzt -> genau richtig, darunter die Stammformen. Ohne Schluessel und ohne Netz - ein Test liest den Quelltext aller fuenf Module des Schreibpfads und faellt um, sobald dort fetch(, providers/ oder api-key auftaucht. |
| 14 | Thai-Eingabeweg gemessen entschieden und begruendet | **erfüllt** | AE-39. Gemessen: auf diesem Rechner ist genau eine Belegung aktiv (Deutsch, 00000407); Windows bringt vier Thai-Belegungen mit, keine ist eingeschaltet; navigator.keyboard.getLayoutMap() liefert im Web-Build NULL Tasten, die App kann Tastaturverfuegbarkeit also nicht einmal feststellen. Thai wird dargestellt (Schriftbreite 46 gegen 90 bei Ersatzkaestchen) und im Eingabefeld angenommen. Entscheidung: eingebaute Zeichenpalette aus den Daten von Phase 13. Umschrift-Eingabe geprueft und VERWORFEN - nach Entfernen der Tondiakritika bleiben vier Buchstaben (ɔ ʉ ɛ ə, 35 Vorkommen), fuer die eine ASCII-Ersatzschreibung eine erfundene Umschrift waere. |
| 14 | Grossschreibung, Umlaute und Tonzeichen werden nachweislich nicht wegtoleriert | **erfüllt** | AE-41. Der Abgleich prueft geschuetzte Unterschiede VOR der Toleranz; sie gelten nie als Tippfehler. Getestet am ganzen Bestand: alle 12 Eintraege mit Umlaut oder ss in entschaerfter Form, alle 28 Thai-Eintraege ohne ihr Tonzeichen - jeder faellt als benannter Fehler durch. Dazu Einzelfaelle: 'das haus' (Grossschreibung), 'schon' fuer 'schoen' (Abstand 1, laege ohne Schutz in der Toleranz), 'gross' fuer 'gross mit sz', 'Haus' ohne Artikel, 'der Haus' mit falschem. Im Web-Build gesehen: 'hoflichkeitspartikel' ergab die Meldung zum Umlaut und die Bewertung Nochmal. |
| 14 | FSRS-Abbildung entschieden, begruendet und getestet | **erfüllt** | AE-40. Genau richtig -> Gut (3), Tippfehler -> Schwer (2), falsch -> Nochmal (1), Leicht NIE - 'Leicht' ist eine Aussage ueber Muehe, die eine getippte Antwort nicht misst; die Antwortzeit waere die falsche Kruecke, weil Palette und Handy langsamer sind. Derselbe Kartenschluessel wie die Karteikarte (vocabId:direction), kein eigener - AE-16 begruendet den Schluessel mit 'eine Erinnerungsspur je Item'. Tests: kein dritter Schluesselteil, Gegenrichtung unberuehrt, 'Gut' traegt die Karte weiter als 'Schwer', Zaehlung als Wiederholung statt als Uebung. Im Web-Build nachgemessen: Schluessel nueng:th_to_de und khrap:th_to_de, nach der falschen Antwort lapses 1, Tagesprotokoll total 2 mit byRating {1:1, 3:1}. |
| 14 | AE-16 und AE-35 bleiben gueltig, nicht ueberschrieben | **erfüllt** | AE-16 hat die freie Eingabe selbst als den sauberen Weg zu FSRS benannt ('Dann gaebe es kein Rateproblem, und die Antwort waere ein echter Abruf') - diese Phase loest das ein, statt es zu widerrufen. Die drei Auswahluebungen aus Phase 6 und die Tonkonturmessung aus Phase 12 (AE-35) schreiben unveraendert nichts; ihre Gruende (Ratequote 20-33 Prozent, Teilmessung der Aussprache) gelten weiter. |
| 14 | Barrierefreiheit auf dem Niveau von Phase 9 gehalten | **erfüllt** | Pflicht 5, im Web-Build gemessen: 63 Bedienelemente auf dem Schreibscreen, keines ohne Beschriftung, keines unter 24 Punkten, alle Auswahlknoepfe der Palette mit aria-checked, das Eingabefeld beschriftet. Jede der 44 Zeichentasten traegt ihren akrophonischen Namen aus den Phase-13-Daten - ein Screenreader laese sonst nur ein einzelnes Zeichen vor. Rechtschreibhilfe im Eingabefeld abgeschaltet, weil sie genau die Fehler wegkorrigieren wuerde, um die es geht. Keine Konsolenfehler. |
| 14 | Tests und tsc gruen | **erfüllt** | 582 Tests in 24 Suites gruen (vorher 545 in 23); npx tsc --noEmit fehlerfrei. |
| 15 | Datenmodell sprachpaar-faehig, Thai<->Deutsch migriert, alle bisherigen Tests gruen | **erfüllt** | Direction ist jetzt de_to_<X> / <X>_to_de (AE-42) - eine ADDITIVE Erweiterung, 'de_to_th' und 'th_to_de' bleiben woertlich gueltig. Deshalb mussten von 180 Richtungsliteralen im Bestand null angefasst werden. VocabEntry: thai -> term, exampleThai -> exampleTerm, neu language an allen 84 Eintraegen; tone und syllables bleiben, als sprachspezifisch gekennzeichnet. Die 582 Tests aus Phase 0-14 liefen danach unveraendert gruen; die einzige Anpassung war eine Zusicherung im Profiltest, weil das Profil jetzt die Sprache mitfuehrt. |
| 15 | Migrationspfad fuer vorhandene Kartenzustaende getestet | **erfüllt** | AE-43. meta/schemaVersion; migrateStore() spielt den Vokabel-Grundstock neu ein und laesst Karten, Tagesprotokoll und Profil unangetastet - die Trennung Auslieferungsdaten gegen Nutzerdaten ist der Punkt. Der Test baut einen Speicher in der ALTEN Form (Vokabel mit thai/exampleThai, ohne language) plus eine Karte mit echtem Lernfortschritt (zweimal bewertet); nach dem Lauf ist die Karte Feld fuer Feld unveraendert (toEqual) und die Vokabeln in der neuen Form. Dazu Idempotenz, leerer Speicher, cardsTouched 0. |
| 15 | Uebersicht bietet Sprachauswahl; gewaehlte Sprache steuert den Lernen-Bereich | **erfüllt** | LanguagePicker steht an erster Stelle der Uebersicht; die Wahl liegt im Lernprofil (meta/profile) und setzt beim Wechsel die Standard-Lernrichtung zurueck, weil sie zur alten Sprache gehoerte. Die Tonlegende erscheint nur noch, wenn das Merkmal der gewaehlten Sprache das hergibt. Im Web-Build geprueft: Thai gewaehlt mit '84 Vokabeln - Merkmal: Toene', Richtungskarten aus dem Verzeichnis gebaut. |
| 15 | Merkmals-Plugin existiert und traegt Thai unveraendert | **erfüllt** | AE-44. lib/languages/feature.ts liefert Silbenauszeichnung und Merkmalsuebungen; syllablesOf laeuft jetzt durch featureFor(entry).annotate(entry). Fuer Thai kommt genau dasselbe heraus - alle Tests der Phasen 3, 6 und 13 blieben ohne eine einzige Aenderung gruen, einschliesslich der Aussage, dass สวัสดี tief-tief-mittel ist. Farben und Konturglyphen sind BEWUSST nicht ins Merkmal gewandert; sie bleiben in constants/tones.ts, damit kein zweites Darstellungssystem neben dem kontrastgeprueften entsteht. |
| 15 | Merkmal je neuer Sprache recherchiert dokumentiert, nicht implementiert | **erfüllt** | AE-44, beide Quellen am 2026-09-03 ueber die MediaWiki-API im Rohtext. Spanisch: 'Stress in Spanish is marked unequivocally through a series of orthographic rules' -> ableitbar, Herleitungsuebung wie Phase 13; Haken vermerkt, dass die Regel eine Silbenzaehlung mit eigenen Diphthong-Regeln voraussetzt. Englisch: 'unpredictable even for educated native speakers' (⟨ough⟩, mindestens zehn Lesarten) -> NICHT ableitbar, Aussprache muss je Wort hinterlegt werden, Vergleichsuebung statt Herleitung. Der Unterschied steht als Feld kind: 'derivable' / 'per-word' im Modell, nicht nur im Fliesstext. Beide implemented: false. |
| 15 | Leere Sprachen ehrlich gekennzeichnet | **erfüllt** | Pflicht 5. Englisch und Spanisch stehen in der Auswahl, tragen sichtbar 'Noch keine Inhalte', sind nicht anwaehlbar und melden das ueber accessibilityState.disabled auch dem Screenreader; dazu steht ihr entschiedenes Merkmal dabei. Im Web-Build nachgelesen. |
| 15 | Deutsche Module jedem Paar zugeordnet, nicht Thai allein | **erfüllt** | Pflicht 6. drillsForDirection gibt fuer JEDE Richtung auf _to_de die Grammatikuebungen (Artikel, Stammformen) zurueck; ein Test prueft das fuer alle drei Sprachen. hasGermanModules steht am Sprachverzeichnis. Damit sind sie fuer Englisch und Spanisch verfuegbar, sobald es dort Inhalte gibt. |
| 15 | Tests und tsc gruen | **erfüllt** | 606 Tests in 25 Suites gruen (vorher 582 in 24); npx tsc --noEmit fehlerfrei. Barrierefreiheit gehalten: kein Bedienelement ohne Beschriftung, keines unter 24 Punkten, alle Auswahlknoepfe mit aria-checked, in einem frischen Tab keine Konsolenfehler. |
| 16 | Beide Sprachpaare mit verifiziertem Grundstock nutzbar, Anzahl und sourceVerified-Quote dokumentiert | **erfüllt** | 85 englische und 79 spanische Eintraege, sourceVerified 85/85 und 79/79. Jede behauptete Bedeutung musste woertlich in einer Definition des jeweiligen Sprachabschnitts vorkommen (164/164); wo die erste Formulierung nicht vorkam, wurde sie an die Quelle angepasst. Quelle je Eintrag abschnittsgenau verankert (#Spanish / #English). Im Web-Build beide Paare durchgespielt. |
| 16 | Merkmal je Sprache umgesetzt und ueber das Phase-15-Plugin eingehaengt | **erfüllt** | Spanisch: lib/stress mit Herleitungsuebung nach dem Muster von Phase 13, Gegenprobe 79/79 gegen die enge IPA aus Wiktionary (AE-45). Englisch: lib/spelling mit Vergleichsuebung statt Herleitung (AE-47). Beide haengen ueber featureRuntime am Plugin aus Phase 15; kein zweites Darstellungssystem - Tonfarben bleiben in constants/tones.ts, die spanische Betonung wird ueber Schriftschnitt und Unterstreichung gezeigt, nicht ueber eine neue Farbe. |
| 16 | Bestehende Uebungstypen greifen fuer die neuen Paare | **erfüllt** | Karteikarten, Artikel, Stammformen und freies Schreiben laufen fuer beide neuen Paare; im Web-Build angeklickt. DrillMeta traegt side statt einer festen Richtung, ensureCardStates filtert nach der Sprache der Richtung, und ein Test belegt, dass eine spanische Artikelsitzung keine Thai-Vokabel enthaelt. Die Schreibuebung schuetzt im Spanischen den Akut wie im Thai das Tonzeichen und bietet eine Akzentpalette. |
| 16 | Thai<->Deutsch nachweislich unveraendert funktionsfaehig (Regressionstest) | **erfüllt** | Die Tests aus Phase 0-15 zeigen ueber eine umbenannte Importzeile jetzt auf VOCABULARY_TH; unterhalb dieser Zeile wurde in keiner Datei eine Zusicherung geaendert. Dazu ein eigener Block: 84 Eintraege mit Ton und Beispielsatz, สวัสดี weiter tief-tief-mittel, kein Thai-Eintrag traegt ein Feld einer anderen Sprache und kein neuer Eintrag einen Ton. Im Web-Build zeigt die Uebersicht nach dem Zuruecksetzen wieder 84 faellige Karten je Richtung. |
| 16 | Tests und tsc gruen, PROGRESS ergaenzt, TODO aktualisiert, Commit | **erfüllt** | 689 Tests in 30 Suites gruen (vorher 606 in 25); npx tsc --noEmit fehlerfrei. Barrierefreiheit gehalten: kein Bedienelement ohne Beschriftung, alle Auswahlknoepfe mit aria-checked, in einem frischen Tab keine Konsolenfehler. |
| 17 | Uebersicht fuehrt mit Sprachauswahl, Auswahl steuert den Lernen-Bereich | **erfüllt** | Uebersicht: Sprachauswahl zuerst, darunter "{Sprache} lernen" mit den zwei Richtungskarten, die in /review mit dieser Sprache fuehren. Im Web-Build breit und bei 375 px durchgespielt. |
| 17 | Kein Entwicklergeruest mehr in der Endnutzer-Oberflaeche | **erfüllt** | Statistikkarte "Vokabel-Grundstock / Phase 2" und Platzhalter "Pruefungsmodul / Phase 7" entfernt, beide Komponenten geloescht. Ablage-Backends und Grundstockzahlen stehen jetzt in Einstellungen -> Diagnose. grep nach "Phase [0-9]" in app/ und components/ trifft nur noch Kommentare. |
| 17 | Sprachfremde Elemente erscheinen nicht mehr | **erfüllt** | Tonlegende nur bei Thai (Uebersicht und Lernen, seit Phase 16 bereits so); Gespraech und Einstellungen leiten ihre Richtungen aus der Sprache ab statt aus der Thai-Konstante; Pruefungstext nennt keine Thai-Muttersprachler mehr; Kopfzeile "Lernbegleiter" (Phase 16). |
| 17 | Sprachwechsel jederzeit erreichbar | **erfüllt** | LanguageSwitch auf Lernen, Gespraech, Fortschritt, Einstellungen. Auf Gespraech Spanisch gewaehlt -> Profil language=es, danach zeigen Lernen und Fortschritt Spanisch, ohne Umweg ueber Uebersicht oder Einstellungen. |
| 17 | 375 px und breit geprueft, Barrierefreiheitsniveau gehalten | **erfüllt** | Beide Breiten fuer alle Routen; ein Ueberlauf der Sprachkarten auf 375 px gefunden und behoben (flexBasis am falschen Element). Kein Element ohne Beschriftung, keines unter 24 Punkten, aria-checked an allen Umschaltern, scrollWidth == innerWidth. |
| 17 | Bestehende Tests unveraendert gruen, tsc sauber | **erfüllt** | 689 Tests in 30 Suites vor und nach der Phase; keine Datei unter src/lib angefasst. npx tsc --noEmit fehlerfrei. |
| 18 | Generischer Richtungstext entfernt, Uebungslisten gegen die Recherche geprueft | **erfüllt** | directionPrompt ersatzlos entfallen (Lernen UND Uebersicht), Funktion und Test mit. Gegenpruefung: Die Zuordnung Herleitung (th/es) gegen Vergleich (en) entsprach AE-44; unvollstaendig war sie beim Hoeren - nur Thai hatte eine Hoeruebung. Ein Test verlangt jetzt je Zielsprache eine Hoer- UND eine Leseuebung. |
| 18 | Hoer- und Leseuebung je Sprache, nach Fertigkeit gruppiert | **erfüllt** | Neu "Betonung hoeren" (es) und "Wort hoeren" (en), beide im Web-Build gespielt. Leiste gruppiert nach Wortschatz/Hoeren/Lesen/Sprechen/Schreiben/Grammatik in fester Reihenfolge. 18 neue Tests (AE-51). |
| 18 | Merkhilfe je Sprache, nicht nur Tonfarben | **erfüllt** | components/feature-legend.tsx: Betonungsregel als Silbenmuster (es) und Schriftstueck-Gruppen (en), beide aus dem Grundstock erzeugt statt getippt. Keine benutzt eine der fuenf Tonfarben. Im Web-Build fuer alle drei Sprachen angesehen. |
| 18 | Lernen- und Gespraech-Reiter merken sich ihren Stand | **erfüllt** | AE-49. Im Web-Build: Richtung+Uebung offen, auf Pruefung gewechselt, zurueck auf /review ohne Parameter -> wieder dort. Dieselbe Sprache auf der Uebersicht gewaehlt -> review: null, Auswahl erscheint. Pruefung unveraendert. |
| 18 | Bilder und Clips je Sprache erzeugbar, Stimmlage waehlbar | **erfüllt** | Sprachzeile an Bilder- und Clipkarte; Umfaenge rechnen mit der Sprache. Drei englische Motive ergaenzt (28 konkrete Eintraege, nur 25 hatten eines) samt Test. Stimmlage nur bei Gemini und belegt (AE-50), im Web-Build umgeschaltet: Kore weiblich -> Charon maennlich. NICHT geprueft: Klang der Stimmen (B-6) und der native Medienpfad auf iOS/Android (B-2). |
| 18 | Fortschritt zeigt Erarbeitetes, Karte "Lernprofil" entfaellt | **erfüllt** | "Faellige Karten je Richtung" ersatzlos raus; Kacheln Begonnen/Gemeistert statt Bestand; Zustandsbalken ohne "neu", Restzahl als Satz. Lernprofil-Karte entfaellt als Folge von AE-49. |
| 18 | Tests und tsc gruen, 375 px und breit geprueft | **erfüllt** | 712 Tests in 31 Suites gruen (vorher 689 in 30); npx tsc --noEmit fehlerfrei. Beide Breiten: kein horizontales Scrollen, kein Element ohne Beschriftung, keines unter 24 Punkten, in einem frischen Tab keine Konsolenfehler. |

## Skalierungsplan auf ~1000 Einträge

Die Erstellung der restlichen ~900 ist **nicht** Teil von Phase 2. Hier steht,
wie sie ablaufen soll.

### Quelle für die Wortauswahl

Basis ist eine **Frequenzliste**, nicht freies Erfinden. In dieser Reihenfolge:

1. **Thai National Corpus** (Chulalongkorn-Universität) bzw. offene
   Frequenzlisten auf Basis von OpenSubtitles/Wikipedia für Thai. Liefert
   Rangfolge nach Häufigkeit — genau die Reihenfolge, in der Vokabeln für
   Lernende wertvoll sind.
2. Abgleich mit dem **CEFR-Wortschatz A1–B1**, damit Prüfungsrelevanz (Phase 7)
   und Alltagstauglichkeit zusammenpassen.
3. Für die Gegenrichtung „Deutsch für Thailänder": **Goethe-Zertifikat-Wortlisten
   A1/A2/B1**, die das Goethe-Institut selbst veröffentlicht.

Die Frequenzliste liefert **nur die Wortauswahl** — nie Ton, Umschrift oder
Bedeutung. Die kommen ausschließlich aus dem Prüfschritt unten.

### Prüfschritt vor Übernahme (unverändert für jeden Eintrag)

Das in Phase 2 gebaute Skript ist der Weg dorthin und bleibt bestehen:

1. Thai-Abschnitt des Wiktionary-Eintrags über die Sections-API laden.
2. Paiboon-Umschrift, Royal-Institute-Umschrift und IPA extrahieren.
3. Ton **aus der IPA-Tonkontur** ableiten, nie aus Prosa.
4. Silbenzahl von Umschrift und IPA gegeneinander prüfen — stimmt sie nicht,
   geht der Eintrag in die manuelle Sichtung.
5. Bedeutung gegen die Definition des Thai-Abschnitts abgleichen. Deckt sie den
   gewünschten Sinn nicht (wie bei ร้าน und นอน), dann `sourceVerified: false`
   **mit benanntem Grund** — nicht raten, nicht stillschweigend übernehmen.
6. Deutsche Seite von Hand ergänzen: Genus, Plural, Stammformen mit Hilfsverb,
   Steigerung, Kasus bei Präpositionen.
7. Die bestehenden Tests laufen über den gesamten Bestand und blockieren
   Einträge, die das Schema verletzen.

**Durchsatz und Portionierung:** in Blöcken von 50–100 Wörtern arbeiten, je
Block ein eigener Commit mit Nennung der Quelle und der Zahl der
unverifizierten Einträge. Ein Block, dessen Verifikationsquote unter 90 %
liegt, wird nicht übernommen, sondern zurück in die Sichtung gegeben.

### Verhältnis zum Content-Generator aus Phase 4/5 — bewusst getrennt

Der Vokabel-Grundstock läuft **nicht** über das API-Key-plus-Start-Prinzip der
Phasen 4 und 5. Begründung:

- Die Vokabeln sind das **Fundament**. Ein falscher Ton pflanzt sich über die
  FSRS-Wiederholungen monatelang fort und wird eingeschliffen — genau das, was
  Spaced Repetition so wirksam macht, macht einen Fehler hier so teuer. Ein
  Sprachmodell, das Töne aus dem Gedächtnis erzeugt, ist dafür die falsche
  Quelle; ein Wörterbuch-Abgleich ist die richtige.
- Der Grundstock wird **mit der App ausgeliefert** und muss ohne Schlüssel und
  ohne Internet vollständig da sein (Gesamt-Abschlusskriterium). Generierte
  Inhalte sind dagegen ausdrücklich optional.
- Sprachsituationen (Phase 4) und Bilder (Phase 5) sind **Ausschmückung um
  geprüfte Vokabeln herum**: Ein misslungener Dialog ist ärgerlich, ein
  falscher Ton ist schädlich. Deshalb dürfen die Generatoren auf dem
  Grundstock aufsetzen, ihn aber nie erweitern oder verändern.

Ein Sprachmodell darf im Skalierungsprozess an genau einer Stelle helfen:
beim **Vorschlagen von Kandidatenwörtern und deutschen Übersetzungen**. Ton und
Umschrift kommen nie von dort, und jeder Vorschlag durchläuft die Schritte 1–7.

---

## TODO — priorisiert

> **Aktueller Vorrang: Phase 19 (05.09.2026), technische Umsetzung fertig,
> Inhaltsabnahme offen.** Der Ablauf steht in `content/README.md`. Die älteren
> TODO-Einträge darunter sind historisch; Generatoren gehören jetzt nur in
> den Entwicklerbetrieb auf localhost:8081.

- [ ] **B-19: Vollauslieferung vom Nutzer vorerst zurückgestellt.** Am 05.09.2026
  ausdrücklich entschieden: „Nein, vorerst bei den geprüften Testinhalten bleiben“.
  Keine weiteren bezahlten Inhaltsläufe ohne neue Nutzeranweisung. Die ersten
  5 echten Gemini-Bilder und 10 Clips sind vom Nutzer nach eigener Prüfung im
  Chat freigegeben und ins Repo übernommen. Weitere Inhalte brauchen jeweils
  ihre eigene Prüfung. Keine Freigabe für zukünftige Inhalte daraus ableiten.
- [ ] **Vollständigen Audiobestand tatsächlich messen.** Referenzmessung vorhanden
  (SAPI: 1.414.190 → 239.265 Byte; echter Gemini-Probelauf: 632.120 → 112.194 Byte);
  der Gemini-Gesamtbestand fehlt. Bei Überschreitung
  des 150-MiB-Inhaltsbudgets Umfang ausdrücklich entscheiden, nicht automatisch
  kürzen. AAB-/IPA-Endgröße separat messen (B-5).
- [ ] **`npm run content:check` grün bekommen.** Derzeit fehlen 452 Clips bereits
  ohne Dialoge, 73 Bilder und 512 Thai-Situationen. Zusätzlich AE-48: geprüfte
  Gesprächsinhalte/-verträge für Englisch und Spanisch. System-TTS ersetzt keine
  fehlende Offline-Datei. EAS-Preview/Produktion bleiben bis dahin gesperrt.
- [ ] **B-2/B-5:** echte Android-/iOS-Installation offline, Kaltstart und nach
  Cache-Bereinigung testen. Hermes-/Asset-Exporte sind kein signiertes AAB/IPA.
- [x] Phase-19-Entwicklerexport, Einzelprüfung, dauerhafte Sperren, MP3-Kompression,
  gebündelter Resolver und Produktionsausschluss implementiert und automatisiert geprüft.
- [x] Wiederexport nach verlorenen/beschädigten Staging-Dateien, Rücknahme eines
  ungeprüften Entwurfs und Weiterexport trotz einzelner defekter Altmetadaten geprüft.

> **Neu aus Phase 18 (2026-09-04):** Jede Sprache hat jetzt Hören, Lesen und
> Schreiben (Thai zusätzlich Sprechen), eine eigene Merkhilfe und eine
> Merkfunktion, die den Lernen-Reiter dort wieder aufmacht, wo man war.
> Bilder und Clips lassen sich je Sprache erzeugen. Was jetzt oben liegt,
> braucht einen Schlüssel oder ein Gerät.

0. **Clips erzeugen und am Gerät abspielen (B-6 + B-2 zusammen):** Erst
   damit ist belegt, dass die Hörübungen ohne Systemstimme laufen. Im
   Testbrowser ist **weder** eine spanische **noch** eine englische Stimme
   installiert — genau der Fall, für den die Clips gedacht sind. Danach die
   Tonmessung aus AE-31 mit echten Clips wiederholen.

> **Neu aus Phase 17 (2026-09-04):** Die Oberfläche ist für Endnutzer
> bereinigt — Sprachauswahl vorn, Sprachwechsel in jedem Bereich, kein
> Entwicklergerüst mehr. Was die Einstellungen an Generatoren noch nicht
> je Sprache anbieten, ist keine Darstellungsfrage und steht unten.

0. **Generatoren je Sprache in den Einstellungen:** Bilder- und Cliplauf sind
   sprachparametrisiert (AE-46), die Oberfläche bietet die Wahl aber nicht an
   und schreibt „(Thai)". Beim Anbieten mitdenken, dass Motive über den
   gemeinsamen Begriff kommen und Sprachsituationen weiter abgelehnt werden.

> **Neu aus Phase 16 (2026-09-04):** Alle drei Sprachpaare sind nutzbar, alle
> drei Merkmale gebaut. Was jetzt oben liegt, braucht entweder eine eigene
> **Recherche** (Prüfungsmodule, Aufgabentexte für Sprachsituationen,
> Beispielsätze) oder eine Handlung des Nutzers (Schlüssel, Konto, Gerät).
> Ausdrücklich ungeprüft und vor jedem Umbau zu messen: ob das F0-Verfahren
> aus Phase 12 spanische Betonung erkennt (AE-48).

0. **Prüfungsmodule für Englisch und Spanisch (eigene Phase):** Cambridge/IELTS
   und DELE/Cervantes brauchen dieselbe Quellenarbeit wie Goethe in Phase 7 —
   Stufen, Fertigkeiten, Formate, und **keine erfundenen Bestehensgrenzen**.
   Danach den Prüfungs-Screen nach Sprache filtern.

0. **Sprachsituationen für die neuen Paare:** Der Plan ist parametrisiert, der
   Aufgabentext an die KI nicht (Paiboon, ครับ/ค่ะ). Er braucht eine eigene
   Fassung je Sprache samt Recherche zu verbindlichen Anredeformen (AE-48);
   `planSituations` lehnt andere Sprachen bis dahin ab.

> **Neu aus Phase 15 (2026-09-03):** Das Fundament für Mehrsprachigkeit steht,
> Thai↔Deutsch ist das erste Paar im neuen Modell. Englisch und Spanisch haben
> ein **entschiedenes und belegtes** Merkmal, aber keinen Inhalt — der ist je
> Sprache eine eigene Phase mit eigener Recherche, wie Phase 2 für Thai.


> **Neu aus Phase 14 (2026-09-03):** Mit dem freien Schreiben sind alle vier
> Fertigkeiten geschlossen — Lesen, Hören, Sprechen, Schreiben. Der Schreibpfad
> braucht weder Schlüssel noch Netz; was hier oben liegt, braucht beides oder
> ein Gerät.


> **Neu aus Phase 13 (2026-09-03):** Die Schriftregeln stehen als geprüfte
> Daten, und „Ton herleiten" trainiert sie gegen den Grundstock. Was hier oben
> liegt, braucht weiterhin einen Schlüssel oder ein Gerät des Nutzers — die
> Schriftregeln brauchen beides nicht.


> **Neu aus Phase 12 (2026-09-03):** Die lokale Sprechübung steht vollständig
> im Code und im automatisierten Gate. Offen sind nur die ausdrücklich
> gemessenen Hardwaregrenzen: ein physischer Browser-Mikrofonlauf und natives
> PCM auf Android/iOS. TTS bleibt Hörbeispiel, nie Bewertungsmaßstab.

0. **Sprechübung mit echtem Mikrofon abnehmen (Phase 12; nativ Teil von B-2):**
   Zuerst in Chrome/Edge `npm run web`, **Lernen → Deutsch → Thai → Sprechen**.
   Prüfen: Begründung steht vor dem Knopf; Systemdialog erst nach „Aufnahme
   starten"; vier Sekunden oder manuell stoppen; Kontur/Rückmeldung erscheint;
   Browser-Mikrofonindikator endet; Neuladen behält keine Aufnahme. Für
   Android/iOS denselben Lauf über Expo Go oder das Preview-APK wiederholen.
   Besonders notieren: tatsächliche Abtastrate, ob mindestens je ein klar
   steigendes und fallendes Wort messbar ist, und ob der Audioindikator nach
   Stoppen sofort erlischt. Mittel/tief/hoch müssen ohne persönliche Referenz
   „Register offen" melden — ein „passt" wäre ein Fehler. Netzwerk kann dabei
   aus sein; keine Aufnahme darf im Audio-/Bildspeicher auftauchen.

> **Weiter offen aus Phase 11:** Hörclips stehen; die Karteikarte, der
> Beispielsatz und die Gesprächszüge spielen sie bevorzugt und sagen „KI-Stimme"
> dazu. Der echte Anbieter-/Tonlauf braucht weiterhin B-6.

0a. **Hörclips mit gültigem Gemini-Schlüssel erzeugen und die Töne messen
   (neu, Phase 11 — schließt B-6 für Audio):** Reiter **Einstellungen**, Karte
   **Generator: Hörclips**, Anbieter Gemini, Modell und Stimme stehen lassen,
   Schlüssel eintragen, **Probelauf**, **Start**. Erwartung: 10 von 10 erzeugt,
   Statuszeile „10 Clips, ~0,8 MB"; im Reiter **Lernen** spielt „Thai anhören"
   bei สวัสดี den Clip und schreibt „KI-Stimme" daneben. **Dann messen:** die
   zehn Clips liegen im Web in der IndexedDB `thai-lernbegleiter-audio` (nativ
   unter `<Dokumente>/audio/`); als Dateien exportiert nach dem Muster
   `gemini_Kore_<wort>_<ton>.wav` in `scripts/tone-contour.html` ziehen — der
   Ton ist einer von mid/low/falling/high/rising — und mit der Tabelle in AE-31
   vergleichen. Erst danach darf irgendwo stehen, dass Geminis Thai-Töne
   stimmen; bis dahin bleibt es bei „KI-Stimme, keine Muttersprachler-Aufnahme".
   *Falls Fehlschläge kommen:* Steht „Antwort enthielt kein Audio" oder
   „Unbekannter Audio-Typ" in der Fehlerliste, nennt die Meldung die gelieferten
   Teile bzw. den `mimeType` — anzupassen ist dann `parseGeminiAudio` in
   `src/lib/providers/audio.ts`.

> **Aus Phase 10 (2026-09-03):** Die Anbieterwahl steht. Was hier oben
> liegt, ist unverändert das, was einen Schlüssel oder ein Gerät des Nutzers
> braucht — nur dass die Probeläufe seit Phase 10 auch mit **Gemini** gefahren
> werden können und nicht mehr nur mit Anthropic und Stability.

0b. **Anbieter mit einem gültigen Schlüssel gegenprüfen (Phase 10):**
   Reiter **Einstellungen**, bei einer Gruppe den gewünschten Anbieter wählen,
   Modell stehen lassen, Schlüssel eintragen, **Probelauf**, **Start**. Was
   dabei erstmals belegbar wäre und heute offen ist:
   - **Gemini:** die Anfrage- **und** die Antwortform. Google antwortet mit
     ungültigem Schlüssel auf alles „API key not valid", deshalb ließ sich
     nichts festklopfen (AE-26). Schlägt der Lauf mit „Antwort enthielt keine
     candidates (gelieferte Felder: …)" fehl, nennt die Meldung selbst, was
     stattdessen kam — anzupassen sind dann `parseGeminiText` bzw.
     `parseGeminiImage` in `src/lib/providers/`.
   - **ChatGPT im Browser:** ob ein **gültiger** `sk-`-Schlüssel die Ausnahme
     von der in AE-27 gemessenen Regel ist. **Achtung:** die Anfrage geht
     hinaus, auch wenn der Browser die Antwort verwirft — ein Bildlauf könnte
     also berechnet werden, ohne dass ein Bild ankommt. Wenn, dann mit dem
     kleinsten Umfang.
   - **ChatGPT nativ:** ohne CORS sollte der Weg offen sein. Prüfbar erst mit
     B-2 bzw. B-5.
   - Bei OpenAI zusätzlich: ob `max_completion_tokens` das richtige Feld ist.
     Beschwert sich die API, ist es genau diese eine Zeile in
     `src/lib/providers/text.ts`.

1. **Bilder-Probelauf mit gültigem Schlüssel (Blocker B-4, schließt Phase 5 ab):**
   `npx expo start` → `w`, Reiter **Einstellungen**, Karte **Generator:
   Bilder**, einen Stability-AI-Schlüssel eintragen, **Probelauf** wählen (5
   Bilder), **Start**. Erwartung: 5 von 5 erzeugt, 0 fehlgeschlagen; danach
   zeigt die Statuszeile „5 von 25 Bildern", und die Bilder erscheinen im
   Reiter **Lernen** auf den Karten zu Wasser, Reis, Essen, Haus und Auto.
   Seite neu laden und noch einmal schauen — sie müssen ohne Schlüssel
   dableiben. Ein Bild kostet bei Stable Image Core wenige Cent, fünf also
   Kleingeld, aber es ist echtes Geld.
   *Falls Fehlschläge kommen:* die Fehlerliste unter dem Fortschrittsbalken
   aufklappen. Steht dort „Antwort enthielt kein Feld ,image'", hat der
   Anbieter die Antwortform geändert — die gelieferten Feldnamen stehen in
   derselben Meldung, `parseImageResponse` in
   `src/lib/images/generator.ts` ist dann die einzige anzupassende Stelle.
   *Warum ich das nicht selbst gemacht habe:* Ich gebe keine fremden
   API-Schlüssel ein. Alles davor ist geprüft — CORS empirisch, Anfrageform
   gegen die laufende API, Fehlerverhalten, Batch, Ablage, Offline-Abruf und
   Anzeige.
2. **Gerätecheck in Expo Go (Blocker B-2, offen, vom Nutzer zurückgestellt):**
   Betrifft Phase 3, 4, 5 und nun Phase 12 auf iOS/Android; der Apple-Signierweg ist dem
   Nutzer derzeit zu aufwendig. Im Web-Build ist alles geprüft. Auf **Android**
   wäre der Weg über Expo Go deutlich einfacher, falls das später relevant
   wird. Für Phase 5 kommt dazu: der native Bildpfad (`expo-file-system`,
   Datei je Bild unter `Paths.document`) ist bisher nur typgeprüft. Für Phase
   12: Mikrofonfreigabe, tatsächliches `expo-audio`-PCM, lokale Konturmessung
   und sofortiges Freigeben nach Stoppen wie in Punkt 0 prüfen.
3. **Restliche 20 Bilder**, sobald der Probelauf sitzt: „Alle konkreten
   Vokabeln" statt „Probelauf". Der Lauf überspringt, was schon da ist.
> **Der ursprüngliche Plan (Phase 0–9) ist abgearbeitet.** Was hier noch steht,
> braucht eine Handlung des Nutzers oder war nie Teil von v1 — die vollständige
> Bewertung steht im Abschnitt „Konsolidierte Abnahme".

4. **EAS-Konto anlegen und bauen (Blocker B-5, schließt Phase 8 ab und
   B-2 für Android gleich mit):** `npm install --global eas-cli`, dann
   `eas login`, dann `eas build --platform android --profile preview`. Beim
   ersten Lauf „Generate new keystore" bestätigen. Der freie Tarif reicht
   (15 Android- und 15 iOS-Builds). Danach `--platform ios --profile preview`
   für den Simulator-Build, der **kein** Apple-Konto braucht.
   *Warum ich das nicht selbst gemacht habe:* EAS verlangt schon zum Lesen der
   Konfiguration ein Konto (`Not logged in`), und fremde Konten lege ich nicht
   an. Alles davor ist vorbereitet und geprüft.
5. **Phase 9 — QA & Abschluss.**

**Vor einer Store-Einreichung, nicht vorher nötig:**

- **App-Symbol und Splash-Screen** ersetzen — stehen noch auf den
  Template-Platzhaltern von Expo (kein Auftrag von Phase 8, siehe dort).
- **Bundle-Identifier bestätigen** (`com.thailernbegleiter.app`). Nach der
  Veröffentlichung nicht mehr änderbar.
- **Google Play (25 $ einmalig) bzw. Apple Developer Program (99 $/Jahr)** —
  Zahlen von der EAS-Setup-Seite, abgerufen am 2026-09-01.

**Offene Fäden aus Phase 7, bewusst nicht mitgemacht:**

- **Durchführungsbestimmungen erheben** (die PDFs sind auf den
  Zertifikatsseiten verlinkt): Punkteverteilung und Bestehensgrenzen. Erst
  damit dürfte die App „bestanden" sagen — siehe AE-20.
- **B1-Aufgaben** brauchen erst B1-Wortschatz; das hängt am Skalierungsplan.
- **CU-TFL recherchieren**, falls das Prüfungsmodul auch die Gegenrichtung
  bedienen soll — Primärquelle `sti.chula.ac.th`, die aus dieser Sitzung nicht
  erreichbar war. Das Schema trägt `direction` bereits (AE-19).

**Naheliegende Fortsetzungen aus Phase 6, bewusst nicht mitgemacht:**

- Ein Übungstyp mit **freier Eingabe** statt Auswahl. Damit fiele das
  Rateproblem weg, das in AE-16 gegen eine FSRS-Anbindung spricht — und erst
  dann wäre die Frage „Übungen durch FSRS?" überhaupt neu zu stellen.
- Weitere Übungen aus schon vorhandenen Daten: Pluralformen und Steigerung von
  Adjektiven (`germanAdjective`, 12 Einträge) für `th_to_de`, Tonzeichen-Lesen
  für `de_to_th`.

---

## Referenz: FSRS-Kernformeln

Aus dem geprüften Referenzprototyp übernommen, nicht neu erfunden:

```
retrievability = (1 + (19/81) * t / S) ^ -0.5
nextInterval   = max(1, round(S * (0.9^-2 - 1) / (19/81)))
```

Erstbewertung: `S = W[rating-1]`, `D = clamp(W[4] - (rating-3) * W[5], 1, 10)`.
Folgebewertungen: Difficulty-Update mit Mean-Reversion gegen `d0Easy`,
Stability-Wachstum bzw. -Einbruch je nach Bewertung.

Die Default-Gewichte sind eine **Näherung** an veröffentlichte FSRS-Werte,
keine zertifizierte Kopie — dieser Hinweis gehört auch als Kommentar in den
Code.

---

## 2026-09-05 — Phase 19: Entwicklerproduktion, geprüfte Repo-Inhalte

**Stand: technische Umsetzung abgeschlossen und geprüft; Inhaltsabnahme offen.**
Vor Beginn `.agent/state.json`, Protokoll/AE/TODO und Git geprüft. Ausgangspunkt
`0ee3d64`, sauberer Arbeitsbaum. Baseline: 712 Tests, TypeScript fehlerfrei.
Die offenen B-2/B-4/B-5/B-6 wurden angefragt, insbesondere lokal verfügbare
Anbieterzugänge oder bereits geprüfte Inhalte. Bis zu diesem Eintrag liegt
keine Antwort vor. Der tatsächliche Browserbestand auf localhost:8081 ist
leer: 0 Situationen, 0 Bilder, 0 Hörclips, acht bestehende Prüfungsaufgaben.

### AE-52 — MP3 vor der Prüfung, echte Bytezahlen statt Vollmengenbehauptung

**Entscheidung:** Lokaler FFmpeg-Encoder (`ffmpeg-static`, ausschließlich
devDependency), MP3/libmp3lame mit 64 kbit/s, Mono, 24 kHz. MP3 ist bereits im
Clip-Vertrag vorhanden und wird von `expo-audio` verwendet; kein zusätzlicher
Codec im mobilen Build. Die menschliche Prüfung hört das endgültige MP3,
denn die Qualität muss nach der verlustbehafteten Kompression stimmen.

**Aktuelle Store-Grenzen, am 05.09.2026 selbst abgerufen:**
[Google Play](https://support.google.com/googleplay/android-developer/answer/9859372?hl=en):
500 MB komprimierter Download für das Basismodul, 4 GB für Module plus
Install-time-Asset-Packs. 200 MB ist hier ein nicht blockierender Mobilfunkhinweis.
[Apple](https://developer.apple.com/help/app-store-connect/reference/app-uploads/maximum-build-file-sizes/):
4 GB unkomprimierte iOS-App; separat 500 MB für die `__TEXT`-Sektionen des
ausführbaren Codes. AAB-Dateigröße, Downloadgröße und installierte Größe sind
nicht gleichzusetzen.

**Gemessen:** Fünf deutsche Referenzsätze, lokal mit Microsoft Hedda Desktop
als 24-kHz-/16-Bit-/Mono-WAV synthetisiert: **1.414.190 Byte WAV → 239.265 Byte
MP3**, 83,08 % Reduktion. Einzelgrößen und SHA-256 stehen in
`content/compression-measurement.json`; `scripts/measure-sapi.ps1` und
`scripts/measure-audio.cjs` machen den Weg reproduzierbar. Die ersten Aufrufe
in der Sandbox scheiterten an gesperrten Unterprozessen bzw. nicht zugänglicher
SAPI-Stimme; außerhalb dieser Prozesssperre liefen Stimme, Encoder und Tests.

Das ist **kein Gemini-Lauf**, keine Messung der gesamten Dialogmenge und kein
Thai-Tonnachweis. Die ~700 MB aus AE-30 waren schon dort eine Hochrechnung aus
Textlänge/Sprechrate. Ein real erzeugter Vollbestand existiert weiterhin nicht.
Beim echten Export protokolliert `content/size-report.json` jeden Clip vor/nach
Kompression. 150 MiB ist das vorsichtige **Projektbudget** für Inhalte samt
Metadaten, nicht eine Store-Grenze. Überschreitung bricht die gesamte Übernahme
vor Änderungen am Katalog ab. Keine automatische Kürzung und kein heimliches
Nachladen. Sollte die Vollmenge nicht passen, ist der Umfang explizit neu zu
entscheiden. Die echten AAB-/IPA-Endgrößen bleiben zusätzlich B-5.

### AE-53 — Versionierter Katalog plus statische Expo-Assets, vorhandener Resolver

Die Daten bleiben während der Erzeugung im vorhandenen Dokumentspeicher und
in IndexedDB (AE-14). Ein Export sendet **einen Inhalt pro Anfrage** an einen
lokalen Begleitprozess, der nur an 127.0.0.1:8082 bindet und Änderungen nur mit
exaktem Host, Origin `http://localhost:8081` und JSON akzeptiert. Keine
Schlüssel, Profile, Karten oder Tagesprotokolle werden exportiert. Entwürfe
liegen ignoriert unter `.content-studio/`.

Nach Einzelprüfung schreibt die Übernahme Dateien nach `assets/content/`,
Metadaten nach `src/content/catalog.json` und statische `require`-Verweise
nach `src/content/assets.ts`. Die Dateinamen sind SHA-256-basiert. Der
bisherige Resolver wird erweitert: **gebündelt → lokaler Entwurf nur im
Entwicklerbetrieb → System-TTS**. Situationen, Bilder und zusätzliche
Prüfungsaufgaben lesen ebenso bevorzugt den Katalog. Produktionsbuilds
verwenden keine alten ungeprüften Laufzeitentwürfe. FSRS-/Profil-Daten bleiben
unberührt; die vorhandenen Vokabel-IDs bleiben unverändert.

[Expo Asset 57](https://docs.expo.dev/versions/v57.0.0/sdk/asset/) und die
[Asset-Anleitung](https://docs.expo.dev/develop/user-interface/assets/) vorab
gelesen, außerdem die installierten `expo-asset`-Quellen geprüft. Metro
bündelt statisch referenzierte Dateien automatisch. Eine zweite explizite
Plugin-Dateiliste wäre hier unnötig: Das SDK-57-Config-Plugin akzeptiert zudem
WebP/.jpeg nicht, der statische Metro-Assetpfad schon. Kein neuer OTA- oder
Web-PWA-Mechanismus wurde eingeführt.

**Realer Exportnachweis mit isolierten technischen Testdateien:** Je ein MP3
(40.365 Byte) und PNG (799.005 Byte) werden in Android- und iOS-Assetmanifesten
gefunden und bytegenau mit den übernommenen Dateien verglichen. Beide
Hermes-Bundles wurden erstellt; Bericht
`content/asset-bundling-verification.json`. Diese Testfreigaben liegen nur im
ignorierten Prüfprojekt, nicht im echten Katalog. Kein signiertes AAB/IPA,
kein Geräte-Playback und keine menschliche Freigabe werden daraus abgeleitet.

### AE-54 — Generatorcode wird aus dem Produktionsgraph entfernt

Die alte Einstellungsoberfläche liegt jetzt außerhalb des Router-Verzeichnisses
unter `src/dev/`. `DeveloperContent` lädt sie mit `require` **innerhalb** einer
`__DEV__`-Bedingung, zusätzlich nur im Web auf exakt localhost:8081. Es gibt
weder eine Generatorroute noch einen URL-/Profil-/Umgebungsvariablen-Schalter,
der im Release aktivieren könnte. Ein bloßes Verstecken der Felder oder ein
statischer Import der Entwickleroberfläche hätte nicht gereicht.

Grundlage: [Expo Code Removal](https://docs.expo.dev/guides/tree-shaking/).
`__DEV__` wird beim Produktionsbuild konstant falsch und der bedingte
Modulzugriff entfernt. Build-Profilnamen alleine wären keine Code-Schranke;
eine zusätzliche `EXPO_PUBLIC_*`-Variable bringt keinen Nutzen.

**Nachweis:** Der Render-Test setzt `__DEV__ = false` bei ansonsten erlaubtem
Entwicklerkontext. Er prüft null `TextInput`, null Generatorfortschrittsbalken
und keine Schlüssel-/Anbieter-/Generatoranzeige; ein Import des Studios würde
den Test sofort abbrechen. Zusätzlich Android/iOS/Web mit Source Maps
exportiert und die tatsächlichen Modulgraphen sowie JS/HTML geprüft:
**0 Generator-, Schlüssel- oder Anbieterclient-Module**. Die gerenderten
Produktionseinstellungen auf localhost:8083 haben im Browser kein Eingabefeld.
Bericht `content/production-verification.json`.

### AE-55 — Menschen entscheiden pro Inhalt, Ablehnungen überleben neue Läufe

Die Prüfliste zeigt die vollständigen Text-/Aufgabendokumente, das echte Bild
oder den komprimierten Clip samt Transkript und Größen. Jeder Eintrag wird
einzeln freigegeben oder mit Grund abgelehnt. Für Audio wird die Freigabetaste
erst nach vollständigem Abspielen verfügbar. Es gibt keine Sammelfreigabe.
Prüfername, Zeitpunkt, Entscheidung und Hash der endgültigen Bytes/Metadaten
halten fest, **was** geprüft wurde. Änderungen verlieren die Freigabe;
manipulierte Dateien werden vor Übernahme abgefangen.

Ablehnungen stehen dauerhaft in `content/rejections.json` und werden vor jedem
Start mit dem lokalen Speicher abgeglichen. Alle vier bestehenden Batch-Läufer
überspringen gesperrte IDs vor dem Anbieteraufruf, auch nach Löschen aller
Entwürfe. Die Freigabe ist ein redaktioneller Vorgang, keine durch Tests
ersetzbare Behauptung. Aktuell gibt es **null** menschlich freigegebene
generierte Einträge.

### AE-56 — Fehlende Offline-Inhalte blockieren die Auslieferung sichtbar

Der alte Plan vertonte nur Zielsprachenwörter und Thai-Dialogzüge. Der neue
Auslieferungsplan ergänzt deutsche Kartenwörter, Hörtexte der Prüfungen und
gesprochene Musterantworten. Außerdem ein vorhandener Fehler behoben:
`isValidAudioClip` akzeptierte bisher nur th/de und verwarf en/es trotz Phase 16.

Endnutzertexte verweisen nicht mehr auf Schlüsselfelder oder Generatoren;
Modell-/Erzeugungsdaten verschwinden aus der Gesprächsansicht. Fehlt ein
Hörclip, bleibt der vorhandene TTS-Fallback; für eine garantierte
Offline-Auslieferung wird TTS ausdrücklich **nicht** als Inhalt gezählt.
Bei vorhandenen Clips wird eine fehlende Systemstimme nicht mehr fälschlich
als stumme Übung gemeldet.

`content:integrity` prüft die Konsistenz des vorhandenen Katalogs.
`content:check` prüft zusätzlich Vollständigkeit. EAS-Preview/Release laufen
durch diesen Check, Entwicklungsbuilds bleiben möglich. Der aktuelle Check
schlägt korrekt fehl: **462 Clips schon ohne Dialoge, 78 Bilder und 512
Thai-Situationen fehlen**. Auch Gespräche für Englisch/Spanisch fehlen weiter
(AE-48: geprüfter Sprachvertrag und Inhalte erforderlich). Ein leerer
Gesprächsreiter ist damit kein als vollständig abgehakter Offline-Pfad.

### Prüfung und offene Abnahme

- 723 App-Tests in 35 Suites grün; `npx tsc --noEmit` fehlerfrei.
- 7 Node-Pipeline-Tests mit echtem FFmpeg grün: Einzelprüfung, Wiederanlauf,
  dauerhafte Ablehnung, Manipulation, fehlende Medien, Budget-Abbruch ohne
  Teilübernahme und Loopback-/Origin-Schranke.
- Offline-Resolver-Test: Netz und Systemstimme schlagen fehl, gebündelte
  Clips/Bilder/Texte funktionieren über den bestehenden Resolver trotzdem.
- Produktionsgraphen aller drei Plattformen geprüft; Hermes-Export für
  iOS/Android, Web-Export und Browser-Produktionseinstellungen geprüft.
- Auf localhost:8081 existiert der lokale Prüf-/Exportweg. Export des leeren
  echten Laufzeitspeichers gemessen: 0 exportiert, 0 gesperrt, 0 Fehler.
- **Offen (B-19):** echter Anbieter-Generatorlauf, tatsächliche menschliche
  Inhaltsprüfung, Übernahme des echten Bestands und dessen gesamte
  Kompressionsmessung. Ohne diese Daten wäre „ohne Netz vollständig“ falsch.
- **Weiter offen:** B-2/B-5, physischer Offline-Kaltstart und native Store-Builds.

Der aktuelle TODO-Vorrang und `.agent/state.json` wurden entsprechend ergänzt.
Die Phase wird ausdrücklich nicht als vollständig erledigt protokolliert.

### Ergänzende Prüfung des Wiederexports (05.09.2026)

Erneutes Exportieren desselben Mediums stellt eine fehlende oder beschädigte
Staging-Datei wieder her. Die Freigabe bleibt nur bei identischem Hash der
endgültigen Bytes und Metadaten erhalten. Wird ein ungeprüfter Entwurf auf die
bereits ausgelieferte Fassung zurückgesetzt, ersetzt diese auch den veralteten
Prüflisteneintrag. Nullwerte, falsche Datentypen oder fehlende Medien in alten
Laufzeitdaten werden jetzt einzeln als Fehler gemeldet; gültige spätere
Einträge werden weiter exportiert. Beide Wiederanlauffälle sind automatisiert
geprüft, Audio erneut mit echtem FFmpeg. B-19 bleibt unverändert offen.

### AE-57 — Echter Gemini-Probelauf und gemessene komprimierte Enddateien

Am 05.09.2026 hat der Nutzer einen Anbieterzugang für lokale Tests bereitgestellt
und die Modelle `gemini-3.1-flash-image` sowie
`gemini-3.1-flash-tts-preview` festgelegt. Der Zugang wurde ausschließlich im
Sitzungsspeicher des Browsers übernommen, nicht in Dateien oder Berichte.
Aktuelle [Bild-Dokumentation](https://ai.google.dev/gemini-api/docs/image-generation)
und [TTS-Dokumentation](https://ai.google.dev/gemini-api/docs/speech-generation)
vorher gelesen. Beide Modelle funktionieren im bestehenden `generateContent`-Pfad;
eine API-Umstellung war für diesen Lauf nicht erforderlich.

**Tatsächlicher Lauf auf localhost:8081:** 5/5 Bilder und 10/10 Thai-Hörclips,
jeweils 0 Fehler und 0 übersprungen. Anschließend alle 15 Inhalte über die
Entwickleroberfläche exportiert, Audio mit dem festgelegten MP3-Encoder komprimiert.

| Messung | Tatsächlicher Wert |
| --- | ---: |
| 5 Bilder, JPEG, jeweils 1024 × 1024 | 1.910.911 Byte |
| 10 Clips, ursprüngliches PCM ohne WAV-Header | 631.680 Byte |
| 10 Clips, WAV einschließlich Header | 632.120 Byte |
| Dieselben 10 Clips, MP3 64 kbit/s, mono, 24 kHz | 112.194 Byte |
| Einsparung gegenüber WAV | 82,25 % |
| Ursprüngliche Audiodauer zusammen | 13,16 Sekunden |

Alle 15 Enddateien wurden anhand ihrer Hashes und Bytezahlen geprüft und mit
FFmpeg vollständig dekodiert. Die fünf Bilder zeigen Wasser, Reis, Essen, Haus
und Auto; eine technische/visuelle Vorprüfung ersetzt die menschliche Freigabe
nicht. Bericht mit Einzeldateien und SHA-256:
`content/gemini-probelauf-2026-09-05.json`.

**Abnahmestand:** Die 15 echten Medien liegen ungeprüft unter `.content-studio/`
und sind im Inhaltsstudio einzeln sichtbar/anhörbar. Kein Eintrag wurde als
menschlich freigegeben markiert oder in den Auslieferungskatalog übernommen.
B-6 ist für die tatsächliche Gemini-Bild-/Audioantwort teilweise geklärt;
Gemini-Text, ChatGPT und sprachliche Tongenauigkeit bleiben offen. B-19 betrifft
jetzt die Einzelprüfung, Übernahme, restlichen Inhalte und Vollmengenmessung.
Der Probelauf belegt keine reale Gesamtgröße und schließt Phase 19 nicht ab.

### Menschliche Freigabe und erste echte Übernahme (05.09.2026)

Der Nutzer hat im Chat bestätigt: „hab alles geprüft und ich fande es sehr gut.“
Diese Freigabe gilt den bereits vorgelegten 15 Testmedien. Vor Übernahme wurden
ihre IDs und unveränderten Mediendateien mit dem Messbericht abgeglichen; die
bestehende Pipeline protokolliert die menschliche Chat-Freigabe pro Eintrag und
Hash. Eine erneute Eingabe derselben Entscheidung in 15 UI-Felder war dafür
nicht erforderlich. Keine Freigabe für neue, noch ungeprüfte Inhalte.

**Im Repo übernommen:** 5 JPEGs und 10 MP3s in `assets/content/`, Katalog und
statische Expo-Verweise in `src/content/`, Ist-Größen in `content/size-report.json`.
Zusammen **2.038.225 Byte inklusive Katalogeinträgen**. Sämtliche 15 Medien sind
in Web, Android und iOS exportiert und **45-mal bytegenau** mit den Originalen
verglichen (`node scripts/verify-content-assets.cjs`). Die native Prüfung
umfasst Hermes-/Asset-Exporte, weiterhin kein signiertes AAB/IPA oder Gerät.

Der nun gefüllte Katalog machte zwölf bisher vom leeren Lieferbestand abhängige
Speichertests sichtbar. Die Unit-Tests verwenden jetzt einen explizit leeren
Katalog; der neue `delivered.test.ts` nimmt den echten Lieferkatalog und prüft
alle Medien im Produktionspfad bei nicht verfügbarem Netz, Laufzeitspeicher
und Systemstimme. **724 App-Tests in 36 Suites und TypeScript grün**. Alle drei
Produktionsgraphen bleiben ohne Generator-/Schlüsselcode. Die Berichte unter
`content/` wurden aktualisiert.

Phase 19 bleibt für den Gesamtbestand offen: **452 Clips bereits ohne Dialoge,
73 Bilder und 512 Thai-Situationen fehlen**, dazu AE-48. Der erste geprüfte
Bestand ist übernommen; er wird nicht als vollständige Auslieferung ausgegeben.

### Nutzerentscheidung zum weiteren Umfang (05.09.2026)

Nach Commit `a661d25` wurde die Erzeugung des restlichen Wort-/Bildbestands
angesetzt. Die automatische Freigabeprüfung hat den großen Audiolauf wegen
möglicher API-Kosten außerhalb der ausdrücklich erlaubten Probeläufe abgelehnt.
Der bereits gestartete Bildlauf wurde angehalten: **6 zusätzliche Bildentwürfe**
entstanden, blieben aber ausschließlich in der Browser-Laufzeitablage. Der
große Audiolauf wurde nicht gestartet. Beide Umfangswahlen stehen wieder auf
„Probelauf“.

Die konkrete Nachfrage zur Erweiterung auf insgesamt 462 Clips und 78 Bilder
hat der Nutzer abgelehnt: „Nein, vorerst bei den geprüften Testinhalten bleiben“.
Es bleibt damit beim freigegebenen und gebündelten Bestand aus **15 Medien**.
Weitere Generierung benötigt eine neue ausdrückliche Nutzeranweisung; die
sechs zusätzlichen Entwürfe sind nicht freigegeben und werden nicht ausgeliefert.
Die vollständige Phase 19 ist zurückgestellt, nicht als erledigt markiert.

## Phase 20 — Automatisches Tontor und Strukturpflege (05.09.2026)

**Aktueller Auftrag ersetzt den bisherigen Freigabeablauf.** Die drei
„nico“-Freigaben mit leerer Begründung waren bewusste Nutzertests, kein Vorfall.
Block A und B sind umgesetzt; vom ausdrücklich erlaubten Stopp nach B wird
Gebrauch gemacht. Block C bleibt unten vollständig als TODO erhalten.
Historische Phase-19-Einträge beschreiben den damaligen Zustand, nicht den
aktuellen Liefervertrag. Die versionierten Expo-57-Unterlagen wurden vor den
Codeänderungen gelesen.

### AE-58 — F0-Fortsetzung nur ohne bereits messbare sichere Strecke

`r >= 0,6` bleibt der sichere Start. Falls damit keine vier zusammenhängenden
Fenster gefunden werden, dürfen unmittelbar benachbarte Fenster mit
`r >= 0,18` und maximal zwei Halbtönen Abstand je 10-ms-Schritt die Strecke
fortsetzen. Keine Lückenüberbrückung, kein isolierter schwacher Start und kein
Oktavsprung. Energiegrenze, Medianfilter, Randbeschnitt und Messbereich bleiben.
Der erste, breitere Versuch verlängerte auch bestehende sichere Strecken und
veränderte Niwat-Konturen; die Gegenprobe führte deshalb zur engen
Fallback-Bedingung. Vorhandene sichere Strecken bleiben unverändert.

Echter komprimierter Gemini-Clip **ค่ะ**: vorher `unmeasurable`, 50 ms stimmhafte
Fenster; jetzt `measured`, 150 ms stimmhafte Fenster, 110 ms ausgewerteter
Konturabschnitt, **−5,10367 Halbtöne**. Dauerwerte bezeichnen verschiedene
Messgrößen, nicht die ganze Audiodatei. Der verifizierte Sollton ist fallend.
Alle zehn Gemini-Probeclips wurden mit demselben Kern erneut gemessen.

**Microsoft-Gegenprobe mit klarer Herkunftsgrenze:** Die temporären
Originaldateien aus AE-31 waren nicht mehr vorhanden. Der damalige Lauf wurde
für มา / ม้า / หมา / ไม่ / ใหม่ mit `th-TH-PremwadeeNeural` und
`th-TH-NiwatNeural` am 05.09.2026 über edge-tts 7.2.8 neu reproduziert.
Dies sind neue Dateien, kein behaupteter Bytevergleich mit AE-31-Originalen.
Manifest mit Hashes, Datum und Parametern unter
`scripts/content/fixtures/tones/index.json`. **10/10 Vorher-/Nachher-Messungen
sind exakt gleich** (Status, stimmhafte Dauer und sämtliche Summary-Werte).
Die vier fallenden/steigenden Prüfungen passieren; sechs Registerfälle bleiben
ungeprüft. Das ist eine kleine technische Regressionsstichprobe, keine
allgemeine Validierung der TTS-Stimmen oder des Erkennungsverfahrens.

Messwerte und Spuren: `content/tone-calibration.json`;
`npm run content:measure-tones` reproduziert sie aus den vorhandenen Dateien.
`scripts/tone-contour.html` bleibt erhalten und lädt den generierten gemeinsamen
App-Kern `scripts/tone-analysis.js`. `content:tone-tool` prüft dessen Gleichstand.

### AE-59 — Automatische Prüfung ersetzt die Einzelabnahme vollständig

Katalog Version 2 hat `check` statt `review`: Status, Zeitpunkt, Prüfumfang,
Grund und gegebenenfalls Tonmessung. Keine Person, keine Freigabe-Schaltfläche,
kein Durchhören, keine Sammelfreigabe, keine dauerhafte Sperrliste. Hashes von
Metadaten und endgültigen Dateien bleiben Integritätsnachweise; ihre Bindung
an eine menschliche Entscheidung entfällt. Erneute Generierung wird nicht durch
frühere Ablehnungs-IDs gesperrt.

Nach einmaliger Kostenbestätigung läuft der Batch einschließlich Export,
MP3-Kompression, Dekodierung, Tonprüfung und Katalogübernahme automatisch.
Anzahl zählt noch fehlende Anbieteraufrufe. Für exakt bekannte Gemini-Modelle
werden datierte Tarife mit geschätzter Text-/Audiomenge angezeigt; unbekannte
Modelle benötigen eine eigene Gesamtschätzung. Keine Kostenobergrenze behauptet.
[Offizielle Gemini-Preise](https://ai.google.dev/gemini-api/docs/pricing),
abgerufen 05.09.2026: Gemini 3.1 Flash TTS Preview 1 USD/Mio. Eingabetokens und
20 USD/Mio. Audiotokens (25 Tokens/s); Bildmodell 0,50 USD/Mio. Eingabetokens,
3 USD/Mio. Text-/Thinking-Ausgabetokens, 60 USD/Mio. Bildtokens (1K: 1.120 Tokens).
Annahmen und tatsächliche Ist-Bytes werden getrennt ausgewiesen.

Automatisierter UI-Test: **kein Anbieteraufruf vor Bestätigung**, mehrere
Aufrufe mit einer Bestätigung, Abbruch ohne neue Aufrufe. Zusätzlich im realen
localhost-Web-Build Kostenvorschau mit einer Dummy-Eingabe geöffnet: 452 fehlende
Aufrufe, 0,557 USD geschätzt, Annahmen sichtbar. Abgebrochen und Dummy entfernt;
kein kostenpflichtiger Vollmengenlauf gestartet. Der read-only Prüfbericht zeigt
Status, Gründe und Konturwerte korrekt. Keine manuellen Inhaltsfreigaben mehr.

Jeder Thai-Clip erhält F0-Messwerte; positiver Tonbefund erfordert exakt passende
ID/Text sowie quellengeprüftes einsilbiges `syllables[0].tone`. Nur relative
fallende/steigende Formen können positiv geprüft werden. Mittel/tief/hoch
brauchen für eine positive Registerprüfung eine Sprecherreferenz; Mehrsilber
und Sätze brauchen verifizierte zeitliche Segmentierung (AE-7/AE-8). Ohne das
steht **ungeprüft**, nicht automatisch bestanden. Ein deutlicher Fall beim
hohen Sollton kann bereits einen Widerspruch belegen.

**Grenzen im Bericht und UI:** Tonhöhe allein, keine Prüfung von Konsonanten,
Vokallänge oder Aspiration, kein Aussprache-Qualitätsnachweis. Bilder und Texte
erhalten ausschließlich technische Schema-/Integritätsprüfungen. Die Anzeige
„KI-Stimme, keine Muttersprachler-Aufnahme“ bleibt. Mikrofonanalyse bleibt lokal;
kein Upload, kein neues FSRS-Scoring. System-TTS selbst ist ungeprüft.

Aktueller Bestand: **5 Bilder + 1 Thai-Clip übernommen; 9 Thai-Clips ungeprüft
ausgeschlossen; 0 als Tonwiderspruch aussortiert.** Nicht prüfbar ist nicht
gleich falsch. Die App fällt an diesen Stellen auf System-TTS zurück, auch
alte lokale Thai-Entwürfe können das Tor nicht umgehen. Ursprüngliche Gemini-
Dateien bleiben als referenzierte Messevidenz, aber nur sechs Katalogassets
werden statisch gebündelt. `content/automatic-checks.json` enthält alle Spuren.
Liefergröße einschließlich Eintragsmetadaten: **1.924.501 Byte**.

### AE-60 — Block B: Struktur vor/nach, ohne Änderung der Lernlogik

Beleg vor dem Entfernen: AST-Import-/Export-/require-/dynamic-import-Graph,
einschließlich nativer/Web-Varianten; npm-Skript- und Expo-Plugin-Einstiegspunkte
separat geprüft. Ergebnis vor B: **194 Quelldateien / 769 Kanten**; danach
**191 / 763**. Wiederholbares Werkzeug `npm run audit:structure`, aktueller
vollständiger Graph in `content/structure-audit.json`. Der Graph allein
entscheidet keine Löschung; CLI-Einstiegspunkte und transitive Abhängigkeiten
wurden zusätzlich geprüft.

| Vorher | Nachher / belegte Änderung |
| --- | --- |
| Neun Content-Skripte verteilt direkt unter `scripts/` | `scripts/content/{domain,pipeline,pipeline.test,studio,check,eas-gate,verify-assets,verify-production,measure-tones}.cjs`; Imports, Repo-Wurzeln und npm-Befehle angepasst; Fixtures daneben |
| Eigenständiger F0-Code im HTML-Werkzeug | Bereits in A durch gemeinsamen generierten Kern ersetzt; HTML bleibt |
| `expo-device` direkte Abhängigkeit | Kein Source-Import, kein Plugin, `npm explain` nur Root, kein transitiver Bedarf; Paket plus verwaistes Unterpaket aus Lockfile entfernt |
| `expo-font`, `expo-glass-effect`, `@expo/ui` ohne App-Imports | Behalten: Bedarf über Expo/Router/Peers im Lockfile nachgewiesen |
| `reset-project.js` | Alter Scaffold-Reset mit einzigem Einstieg npm-Abkürzung; beide entfernt, keine App-Verwendung |
| `prepare-content-fixture.cjs` | Isolierte Einmalfixture für ersetzten manuellen Review-Vertrag; keine Imports oder npm-/Build-Nutzung |
| `measure-audio.cjs`, `measure-sapi.ps1`, `compression-measurement.json` | Einmalige SAPI-Kompressionsprobe aus Phase 19; kein App-/Build-Verbraucher. Echte Gemini-Messung und reproduzierbare aktuelle Tonprüfung vorhanden; alte Evidenz bleibt in Git/AE-52 |
| `EMPTY_PROFILE`, ungenutzte Props/Imports/Styles | TypeScript-Referenzprüfung: unbenutzt; aus Profil, DrillRunner, ReviewBody, StressLegend und Studio entfernt |
| Review-Oberfläche und Sperrlistenmodule | Wegen der ausdrücklich verlangten Verhaltensänderung in **A** entfernt; keine angeblich rein strukturelle Löschung |

Für A wurden Tests des alten Freigabevertrags angepasst und Ton-/Kostenfälle
ergänzt. **Für B keine Testassertion verändert**; bei verschobenen Node-Tests
nur Pfade korrigiert. Vor und nach B **728 Jest-Tests / 39 Suites plus 8
Node-Pipeline-Tests grün**. Acht statisch gerenderte Seiten nach Entfernen von
Script-/Stylesheet-Dateiverweisen exakt gleich; Hashes in
`content/structure-render-comparison.json`. Dies belegt statisches Markup,
keine vollständige interaktive Geräteprüfung.

### Abschlussprüfung A/B und weiterhin offene Auslieferung

`npx tsc --noEmit`, 728 Jest-Tests, acht Node-Pipeline-Tests,
`content:integrity`, gemeinsamer Tonkern und alle drei Expo-Exporte grün.
Pipeline-Tests dekodieren echte MP3/PNG-Dateien, erkennen Beschädigungen und
Metadatenmanipulation, prüfen Budget-Abbruch ohne Teilübernahme, fehlende
Tonprüfbarkeit, Regenerierung ohne Sperrliste und den entfernten Review-Endpunkt.

Produktionsgraphen: kein Generator-/Schlüssel-/Anbietercode. Sechs aktuelle
Medien in Web, Android und iOS **18-mal bytegleich** nachgewiesen. Signiertes
AAB/IPA, physisches Mikrofon und Offline-Geräte-Playback bleiben B-2/B-5.
`content:check` bleibt wegen **461 fehlender Clips, 73 Bilder, 512 Thai-
Situationen und AE-48** absichtlich rot; diese Lücke wird nicht durch eine
behauptete Vollabnahme oder durch mehr ungeprüfte Generierung verdeckt.

### TODO Block C — explizit nicht umgesetzt

- [ ] Declarative-Procedural-Modell; Nation 1989 und 4/3/2; Shadowing-Übersicht
  über 44 Studien; behauptete TBLT-Planungszeit-Effekte g = 0,98 gegenüber 0,28
  anhand von Primärquellen nachrecherchieren, mit Abrufdatum belegen. Zahlen und
  Wirkungen aus dem Chat sind bislang keine verifizierten Ergebnisse.
- [ ] **Datenbefund zuerst klären:** Laut Kopf von `src/data/vocabulary.ts`
  stammen die Wörter der 84 Thai-Beispielsätze aus verifiziertem Bestand,
  die Sätze als Ganzes wurden ausdrücklich **nicht einzeln quellengeprüft**.
  Für neue Satzübungen Satzbau/Bedeutung/Transkription nach Phase-2-Disziplin
  absichern; `sourceVerified` des Wortes darf keine Satzfreigabe vortäuschen.
- [ ] Satz-Shadowing: Satzclip, Mitsprechen, lokale Aufnahme und begrenzte
  Rückmeldung auf Phase 12 und AE-58 aufbauen. Kein Netz/Upload, keine
  Aussprache-Gesamtnote (AE-32/AE-35), keine unbelegte automatische Bewertung.
- [ ] Sinkende Zeitfenster als **Anpassung** der 4/3/2-Technik spielbar machen.
  Die App hat kein wechselndes Gegenüber; erklären, welcher Anteil eines
  belegten Effekts deshalb nicht abgedeckt ist.
- [ ] Verpflichtende, nicht abschaltbare Vorbereitung vor jeder Produktion.
- [ ] Satz hören und Bedeutung prüfen spielbar machen, auf tatsächlich
  verifizierter Satzbasis und mit ehrlicher Audioabdeckung.
- [ ] Systematische Satzbildungslücken des vorhandenen Wortschatzes prüfen,
  insbesondere Thai-Klassifikatoren und ihre Wortstellung. Auch die
  Mango-Formulierung im Auftrag erst linguistisch verifizieren. Neue Daten
  nur mit Quellen; Befund dokumentieren.
- [ ] Im UI sagen, dass die App kein unvorhersehbares Gegenüber liefert.
  Gesamten Block erst feature-komplett und automatisch geprüft zum manuellen
  Test geben. Bis dahin keine spielbaren Satzübungen behaupten.

## Phase 21 — Satzebene implementiert; echte Audioabdeckung offen (06.09.2026)

Ausgangspunkt: Phase 20 A/B, Commit `7c93caa`. Der vorherige C-TODO-Abschnitt
ist der historische Startstand. Aktueller Anforderungsstand siehe unten;
**Phase 21 bleibt insgesamt unvollständig**, kein Vollmengenlauf gestartet.

### AE-61 — Satz-Ausnahme nach Quellenprüfung abgelehnt

Abramson/Svastikula finden alle fünf Tonkontraste auch in den untersuchten
Thai-Sätzen. Intonation macht die lexikalischen Töne nicht bedeutungslos.
Ein globaler Satzanstieg/-fall ist zwar kein Worttontest, daraus folgt aber
keine wissenschaftlich begründete pauschale Ausnahme vom Tontor. Deshalb keine
solche Kategorie eingeführt. Eine bewusste Lieferung ungeprüfter Satzclips
bedarf einer gesonderten Entscheidung; die offene Rückfrage hat die Regel
nicht geändert. Quellen samt Abrufdatum und genauer Reichweite stehen in
`content/phase21-research.md`.

### AE-62 — Sprecherreferenz und Vorschau vor der Kostenbestätigung

20 vorhandene Kalibrierclips erneut aus den gespeicherten F0-Spuren ausgewertet,
gleich gewichtete Clipmediane pro Stimme: Kore 192,80 Hz (10), Premwadee
156,86 Hz (5), Niwat 131,15 Hz (5). Unausgewogene bzw. nur einmalige Tonbeispiele,
keine unabhängig verifizierten Wiederholungen oder zurückgehaltenen Testdaten.
Keine belastbare Mindestzahl/Streuungsgrenze ableitbar; Register bleiben
ungeprüft. Reproduktion: `node scripts/content/measure-speaker-reference.cjs`;
Messwerte/Quartile und nächste Evidenz in `content/speaker-reference-audit.json`.

Die Generierungsbestätigung zeigt nun vor dem Bezahlen die Kategorien und
Ausschlussgründe des konkreten Plans. Gesamtplan: 462 Clips, davon 22 Thai-
Tonfälle prüfbar, 297 andere Clips technisch prüfbar, 0 ungeprüfte Thai-Clips
ausgeliefert, 143 ausgeschlossen. Maximal 69,0 % können passieren; tatsächliche
F0-/Dateifehler können die Quote weiter senken. Einmalige Kostenbestätigung
bleibt, keine neue Einzelprüfung. Vorschautest prüft Anzeige vor Anbieteraufruf.

### AE-63 — Satzübungen und ihre begrenzte Aussage

Die vorhandenen 84 Beispiele vollständig auditiert (`content/sentence-data-audit.json`).
Der ursprüngliche Datenkopf bestätigt ausdrücklich nicht jeden ganzen Satz.
34 vollständige Satzlesarten mit verifizierten Wörtern und nachvollzogenen
Satzregeln für die Übung übernommen; keine wörtliche Korpusbestätigung erfunden.
Wortgruppen, unzureichend belegte Wörter und ungesicherte Konstruktionen außen.
Originalvokabeln, IDs, Tondaten und `sourceVerified` unverändert.

- Shadowing mit bestätigten Kopfhörern, Vorbildstart nach Mikrofonfreigabe,
  flüchtigem PCM und lokaler F0-Auswertung. Keine Aussprache-/FSRS-Note.
- Wiederholung desselben Satzes mit 12/9/6 Sekunden: ausdrücklich eine Anpassung
  des Verhältnisses; keine Gleichsetzung mit Nations Minutenmonologen und
  wechselnden Zuhörern. 15 Sekunden Vorbereitung vor jeder Produktion verpflichtend.
- Satz-Hörverstehen mit drei Bedeutungsalternativen; Thai und Umschrift erst
  nach der Antwort. Ohne verfügbares Audio bleiben Antworten gesperrt.
- In allen drei Modi: Die App ersetzt kein unvorhersehbares Gegenüber und
  reicht allein nicht für echte Gespräche.

Recherche korrigiert die behaupteten Planungseffekte: g=0,98/0,28 stammen aus
einem GenAI-ESL/EFL-Moderatorvergleich überwiegend zu Schreiben, kein Nachweis
eines bestimmten Timers. DP-Modell und Shadowing-Review mit ihren Grenzen
dokumentiert. Satzbildungsaudit umfasst Klassifikatoren, Fragen/Negation,
Ort/Zeit/Aspekt und Rollen. Thai-Zählkonstruktion gewöhnlich Nomen + Zahl +
Klassifikator; die Reihenfolge im Auftragsbeispiel war unzutreffend. Keine
unbelegten neuen Sprachdaten ergänzt.

Native Besonderheit aus installiertem Expo-57-Code: iOS-Streamstart setzt
reine Aufnahme. Shadowing setzt danach die gemeinsame Aufnahme-/Wiedergabe-
Sitzung; das Clipende darf die laufende Aufnahme nicht deaktivieren. Tests
prüfen Startreihenfolge, Fehlerfreigabe und Player-Ende. Physische Audiorouten
und Mikrofonabnahme weiterhin B-2, keine Behauptung einer Geräteprüfung.

### Verifikation und verbleibender Blocker B-21

`npx tsc --noEmit`, **741 Jest-Tests / 43 Suites**, acht FFmpeg-Pipeline-Tests,
`content:integrity` und `content:tone-tool` grün. Alle drei Expo-Exporte unter
`build-verification/phase21` erfolgreich, keine Generator-/Anbieterschlüssel-
Module im Produktionsgraph. Sechs bestehende Medien in Web/iOS/Android
18-mal bytegleich (`content/asset-bundling-verification.json`). Sandbox-EPERM
bei Unterprozessen durch genehmigte lokale Ausführung gelöst.

Im echten Browser sind die Satzmodi gerendert und die fehlende Audioabdeckung
nachgewiesen: kein zulässiger Satzclip, keine Thai-Systemstimme; Aufnahme und
Hörantwort bleiben entsprechend gesperrt. Kontrollierte Tests der Übungsabläufe
ersetzen dieses fehlende Playback nicht. Kein manueller Testauftrag an den
Nutzer, keine vollständige Spielbarkeit oder Lieferung behauptet.

| Kriterium | Aktueller Nachweis |
| --- | --- |
| C-0a Satzkategorie belegt entscheiden | Erfüllt durch begründete Ablehnung, AE-61 |
| C-0b Sprecherreferenz prüfen | Erfüllt als dokumentierter negativer Datenbefund |
| C-0c Durchlassquote vor Kosten | Implementiert und automatisch geprüft |
| C0 Lernbelege | Primärquellen mit Abrufdatum und Übertragungsgrenzen dokumentiert |
| C1/C2/C4 vollständig spielbar | Offen: tatsächliches Satzaudio fehlt; Abläufe nur mit Testdoubles geprüft |
| C3 verpflichtende Vorbereitung | Implementiert, Timer und Neustart zwischen Runden getestet |
| C5/C6 Satzbildungsbefund und Grenze | Dokumentiert und Grenze in allen drei Lernmodi sichtbar |
| Prüfungen, Protokoll, Commit | Prüfungen grün; Stand dieses Commits dokumentiert |

Nächster erforderlicher Schritt: Entscheidung zum Umgang mit ungeprüften
Satzclips und anschließend tatsächlich verfügbare Audioquellen. Das Tontor
wird dafür nicht stillschweigend geöffnet. Ein kostenpflichtiger Lauf beginnt
erst nach der konkreten Mengen-/Kostenbestätigung. B-19 (Vollbestand), AE-48
und B-2/B-5 bleiben außerdem offen.

### AE-64 — B-21 ausdrücklich als Produktentscheidung gelöst (06.09.2026)

Der Nutzer erlaubt `unchecked`-Thai-Clips für **Vokabelwiedergabe, Satz-
Shadowing, Satzwiederholung und Satz-Hörverstehen**, sichtbar je tatsächlich
gespieltem Clip als **„KI-Stimme, Ton nicht geprüft“**. `passed` erhält eine
eigene Kennzeichnung. Die Entscheidung behauptet keine neue Messung und
widerruft AE-61s Forschungsbefund nicht. `failed` bleibt ausgeschlossen.

`audio-policy.ts` trennt Katalogzulassung und Verwendung. Die Tonerkennung
filtert Kandidaten vor der Auswahl nach verfügbaren `passed`-Clips; auch der
Player erzwingt dies, einschließlich direkter Asset-ID, ohne System-TTS-
Ausweichweg. Antworten bleiben bis zum erfolgreichen Clipstart gesperrt.
Ungeprüfte Entwürfe werden nicht direkt aus dem lokalen Speicher abgespielt.
Hash/Bytes/Schema/Decode und erneute F0-Prüfung bleiben unverändert nötig.

Der Playback-Rückgabewert enthält die ID und den Gate-Status der aufgelösten
Datei. Karteikarte und Satzübungen zeigen daraus den Hinweis; der pauschale
Satzhinweis wurde aus der Oberfläche entfernt. Der Status wird weder aufgrund
des Modus noch einer Nutzerentscheidung auf `passed` geändert. Ein Wechsel
des Clips ersetzt auch die Anzeige. Systemstimmen werden getrennt benannt.

Vorhandene zehn Audioaufnahmen neu durch die Pipeline geschickt, **keine neue
Generierung**: eine `passed`, neun `unchecked`; zusammen mit fünf Bildern
15 Liefermedien. `content:check` meldet ausdrücklich
**`uncheckedThaiDelivered: 9`**, weiterhin 452 fehlende Audioaufnahmen sowie
73 Bilder, 512 Situationen und AE-48. Die Integritätsprüfung ist grün; der
Vollständigkeitscheck bleibt wegen dieser echten Lücken rot.

750 Jest-Tests / 45 Suites, TypeScript und acht FFmpeg-Pipeline-Tests grün.
Produktions-Exporte Web/Android/iOS unter
`build-verification/phase21-b21-delivered`, kein Generator-/Schlüsselcode in
den Graphen, 15 Medien in drei Plattformen 45-mal bytegleich.
Echte Browser-UI: `สวัสดี` auf der Vokabelkarte zeigt beim Clipstart
„KI-Stimme, Ton nicht geprüft“; Tonerkennung enthält genau den einen aktuell
zulässigen Clip und zeigt „KI-Stimme, Ton automatisch geprüft“. Keine
Lernbewertung/FSRS-Antwort im Browser ausgelöst.

**Einmaliger Lauf genehmigt, noch kein Anbieteraufruf:** Der Nutzer bestätigte
459 Clips bei ungefähr 0,54 USD. Der aktuelle Plan hat 462 Einträge, davon
zehn bereits erzeugt; folglich noch 452 neue Aufrufe, geschätzt 0,55709 USD.
Vorhandenes wird nicht zur Erfüllung einer Zahl nochmals bezahlt. Zustimmung
in `content/audio-run-2026-09-06.json` festgehalten und noch nicht verbraucht.
Die echte Startaktion meldet „Erst einen API-Schlüssel eintragen“. Der
Schlüssel wird nur im lokalen Generator benötigt, nicht im Chat. Keine
erneute Kostenfreigabe nötig. B-21s fachliche Entscheidung ist erledigt;
die tatsächliche Audioerzeugung und vollständige Satz-Spielbarkeit bleiben
bis zur Schlüsselbereitstellung offen.

### AE-65 — Genehmigter Audiolauf begonnen, Ratenlimit und Wiederaufnahme (06.09.2026)

Der Schlüssel wurde in der lokalen Browseroberfläche übernommen. Die bereits
erteilte Freigabe wurde für 452 fehlende Clips verwendet (462 im Plan, zehn
vorhanden; Schätzung 0,55709 USD, keine gemessene Abrechnung).

Der erste Abschnitt wurde nach 121 bearbeiteten Einträgen geordnet angehalten:
25 erzeugt, 91 HTTP-429-Fehler, fünf übersprungen. Gemini meldete
`generate_requests_per_model`, Limit zehn, mit Wartehinweisen bis ungefähr
60 Sekunden. Die bisherige Pause von 600 ms reicht für dieses Projekt nicht.
Die [Gemini-Dokumentation zu Ratenlimits](https://ai.google.dev/gemini-api/docs/rate-limits)
wurde am 06.09.2026 abgeglichen; die konkrete Zehnergrenze stammt aus der
tatsächlichen Anbieterantwort, nicht aus einer allgemeingültigen Modellzusage.

Eine Fortsetzung wurde ebenfalls geordnet angehalten: 104 bearbeitet,
26 erzeugt, 49 HTTP-429-Fehler, 29 übersprungen. Metro konnte neu veröffentlichte
MP3s trotz vorhandener Dateien nicht auflösen; dadurch war die geänderte
Wartezeit in dieser Sitzung noch nicht aktiv. Beide Abschnitte exportierten
ihre vorhandenen Entwürfe mit null Exportfehlern. Kein erfolgreicher Clip
wurde neu erzeugt. Insgesamt: **51 neu, 61 vorhanden, 401 noch zu erzeugen**;
191 Anbieteranfragen, davon 140 als HTTP 429 abgelehnt. Diese Fehler sind
keine erfolgreichen Clips und keine Aussage über die tatsächliche Abrechnung.

Die Gemini-Audiopause beträgt jetzt **6500 ms nach jeder Antwort** und ist im
Generator sichtbar. Mediendateien und Asset-Verweisliste werden nun vollständig
in temporäre Dateien geschrieben und per Rename veröffentlicht, sodass ein
Dateibeobachter keine gerade erst angelegte, noch leere MP3 indexieren muss.
Die Tests prüfen weiterhin Publikation, erneuten Export und reale MP3-Integrität;
ein vollständiger Live-Lauf mit dieser Reparatur steht noch aus.

Die lokalen Serverprozesse waren nach dem Sitzungswechsel nachweislich beendet
und wurden neu gestartet. Die alte Browserseite war nicht mehr verfügbar;
der nur im Sitzungsspeicher gehaltene Schlüssel muss erneut im lokalen
Generator übernommen werden. Der frische Browser zeigt den korrekten
Medienbestand und die neue Wartezeit ohne Buildfehler. **Keine zweite
Kostenfreigabe erforderlich:** Es geht um die Fortsetzung desselben Laufs.
Fortsetzungsdaten: `content/audio-run-2026-09-06.json`.

Aktueller Lieferbestand: **55 Audioaufnahmen und elf Bilder**, sechs weitere
Audioaufnahmen durch den Tonfilter ausgeschlossen. `content:check` zählt
**38 ungeprüft ausgelieferte Thai-Clips**. Die Integrität ist fehlerfrei;
Vollständigkeit bleibt rot: 407 Lieferclips fehlen (401 noch nicht erzeugt
und sechs ausgeschlossen), außerdem 67 Bilder, 512 Situationen und AE-48.
Keine der 34 für Satzübungen vorgesehenen Lesarten hat bereits einen Clip;
C1/C2/C4 bleiben deshalb offen.

Verifikation nach den Reparaturen: **750 Jest-Tests / 45 Suites**, TypeScript
und acht FFmpeg-Pipeline-Tests grün. Produktions-Exporte mit Source Maps unter
`build-verification/phase21-run-partial`; Web/Android/iOS enthalten keinen
Generator- oder Schlüsselcode. 66 Medien in drei Plattformen **198-mal
bytegleich**. Kein physischer Mikrofon-/Gerätenachweis behauptet.

### AE-66 — Satzübungen in jede Richtung, Sprechen in beide Thai-Richtungen (06.09.2026)

Der Nutzer entschied: Die Übungsgruppe um die Sätze — Sprechen, Shadowing,
Satz wiederholen, Satz verstehen, Schreiben — die bislang nur unter
„Deutsch → Thai" lag, gehört strukturell zu **jeder Richtung jedes Paars**.

Umgesetzt in drei Schichten, ohne einen erfundenen Satz:

1. `data/sentence-tasks.ts` führt seit AE-66 die Registry
   `SENTENCE_TASKS_BY_LANGUAGE`: Thai trägt die 34 geprüften Satzlesarten;
   Spanisch bleibt ehrlich leer — seine 30 Beispiele sind Nominalgruppen
   wie „el agua", und dieselbe Prüfung, die Thai-Wortgruppen ausgeschlossen
   hat, schließt sie hier aus; Englisch hat bewusst keine Beispiele
   (Phase 16). `SENTENCE_FOOTNOTE_BY_LANGUAGE` benennt je Sprache Bestand
   oder Fehlendes.
2. `sentenceSession(language, seed)` liest nur noch die Registry; der
   `SentenceRunner` nimmt die Zielsprache der Richtung als Prop, spricht
   Sätze in dieser Sprache (Clips wie TTS) und zeigt für eine Sprache ohne
   Satzstoff einen ehrlichen Hinweis — ohne Mikrofonfreigabe, ohne
   Wiedergabe, ohne Vorbereitungsuhr.
3. `review.tsx` hängt die Satzmodi in jede Richtung; `parseMode` validiert
   jetzt über die Modesliste statt über Richtungs-Literale. Die Wort-
   Sprechübung (Tonhöhenkontur gegen geprüfte Silbentöne, AE-48) bleibt an
   Thai gebunden, steht seit AE-66 aber in **beiden** Thai-Richtungen —
   Thai aussprechen wird in beiden geübt. Für Englisch und Spanisch fehlt
   sie, bis ein vergleichbares Messverfahren gebaut ist; die Satzgruppen
   stehen dort trotzdem, mit Hinweis statt Stoff.

Echte Browser-Verifikation (Dev-Server, frischer Speicherstand): Alle sechs
Richtungskarten zeigen die vollständigen Fertigkeitslisten. Unter
„Thai → Deutsch" läuft Shadowing mit Satz 1 von 34 (ผม กิน ไข่) samt
verpflichtender Vorbereitung; die Wort-Sprechübung läuft dort mit ไก่,
Sollform Tief. Unter „Deutsch → Spanisch" zeigt Shadowing den Hinweis
„Noch kein Satzmaterial für Spanisch" mit Zurück-Knopf. Karteikarten-Bild
verifiziert: Karte „das Wasser" (Position 44) zeigt das gebündelte
1024×1024-Bild auf der Vorderseite; die elf Bildwörter sind alle im
Katalog und in `assets.ts` gemappt. Screenshots in `screenshots/`.

752 Jest-Tests / 45 Suites grün (zwei neue: Registry-Ehrlichkeit und
Leerzustand ohne Mikrofonzugriff), TypeScript fehlerfrei. Der DSZ-Ansatz
(keine Bewertung, kein FSRS-Schreiben) ist unverändert; ein Vollständiger
Content-Check bleibt rot aus den bekannten Gründen (407 Clips, 67 Bilder,
512 Situationen, AE-48 offen).

### AE-67 — Android-Toolchain per Terminal, Generator-SDK nativ entkoppelt (07.09.2026)

Der Nutzer ließ SVM im UEFI aktivieren; daraufhin wurde die komplette
Android-Toolchain ohne Android-Studio-Installer eingerichtet: vorhandenes
Microsoft OpenJDK 21 (JAVA_HOME), SDK unter %LOCALAPPDATA%\Android\Sdk
(cmdline-tools 12.0, platform-tools, platform 35, build-tools 35.0.0,
Emulator, System-Image android-35/default/x86_64), AVD „ThaiSpeaker"
(pixel_6), AEHD-2.2-Treiber (silent_install per UAC), ANDROID_HOME und
platform-tools im Benutzer-PATH.

Der erste native Bundle-Versuch scheiterte an `@anthropic-ai/sdk`
(`node:fs` nicht auflösbar): Das Generator-SDK gelangte über die
require-gated, aber statisch gebündelte `DeveloperContent`-Naht in den
nativen Graph. Metro löst das Paket auf Native jetzt zu einem leeren Modul
auf (`metro.config.js`, resolveRequest, nur platform !== 'web'); Web bleibt
über die `browser`-Bedingung unverändert. Zur Laufzeit ist der Weg auf
Native ohnehin tot — `isContentDeveloper` verlangt Web auf localhost:8081.

Danach lief der Development Build auf dem Emulator durch: „Android Bundled
2208ms (2141 Module)". Echte Geräte-Verifikation (ADB-Screenshots in
`screenshots/`): Übersicht mit drei Sprachen, native Tab-Leiste,
Lernen-Reiter zeigt AE-66 (Thai → Deutsch mit Satz verstehen, Sprechen,
Shadowing, Satz wiederholen, Schreiben), und Karte 1 von 84 („das Essen")
zeigt das gebündelte generierte Bild **nativ**. Bisher gab es keinen
physischen Android-Nachweis der Medien; dieser belegt jetzt auch die
native Auslieferung der Bilder.

752 Jest-Tests/45 Suites und TypeScript blieben unangetastet grün (die
Metro-Änderung berührt nur den Bundle-Schritt); Integritätsprüfung grün.

### AE-68 — Erster voller KI-Generierungslauf für alle drei Sprachen (07.09.2026)

Der Nutzer trug den Gemini-Schlüssel im lokalen Studio nach; der Lauf wurde
vollständig aus dieser Session geführt. Befunde und Reparaturen:

1. `gemini-2.5-flash` ist für neue Schlüssel **404** („no longer available
   to new users") — deshalb schlugen alle 512 Situationsaufrufe fehl.
   Wechsel auf `gemini-3.6-flash`, danach 512/512 ohne Fehler. Der Nutzer
   hatte das Modell für die Prüfungsaufgaben eigenständig richtig geraten.
2. `gemini-3.1-flash-tts-preview` hat im Gratis-Tarif ein **Tageslimit von
   genau 100 Aufrufen** (429, „generate_requests_per_model_per_day, limit:
   100"). Nach 100 Clips drosselte Google; der Lauf lief durch und zählte
   die restlichen als fehlgeschlagen (AE-65-Muster). Wechsel auf
   `gemini-2.5-flash-preview-tts` (dasselbe Modell der AE-31-Kalibrierung)
   brachte weiteres Kontingent; ein drittes Tageslimit stoppte den Rest.
3. Parallelläufe auf einem Schlüssel verschärfen 429-Kurven — Läufe
   künftig sequenziell oder mit Pausen je Modell fahren.
4. Das leere `error-overlay`-Div des Dev-Builds blockiert Klicks; es ist
   ohne Inhalt und wurde entfernt. Der Publish (in `exportDrafts`
   eingeschlossen) schrieb während laufender Batches zeitweise ein
   `assets.ts`, dessen Dateien noch fehlten — Metro-Cache-Clear behebt die
   Folge; der Zustand nach Abschluss ist konsistent (232 Requires, alle
   Dateien vorhanden).

Ergebnis im gebündelten Katalog (Publish 0 Exportfehler, 788 Medien):
**89 Bilder (alle konkreten Wörter aller drei Sprachen — Bilder damit
VOLLSTÄNDIG)**, 154 Clips (th/en/de-Mix, Ton-Gate misst passed/unchecked
korrekt), **485 von 512 Situationen**, Prüfungsaufgaben 64/64. Verifiziert
am Android-Emulator: Übersicht, Shadowing (Satz 1 von 34), Gespräch
„485 Situationen — offline nutzbar", Karteikarte „das Essen" mit Bild.
TypeScript und 752 Tests unverändert grün; Integrität fehlerfrei.

Offen: ~3.300 Clips der vollen Auslieferung (3436 geplant) stehen wegen der
Tageslimits aus — Fortsetzung nach Googles Reset oder mit aktivierter
Abrechnung (geschätzt 1–2 USD für alles), danach einfacher Neustart des
Hörclip-Laufs im Studio. 27 Situationen (Schwanz des Plans) ebenso.

## Phase 22 — Review-Fixes: Robustheit, Design-System, Backup/Export (07.09.2026)

Ausgangspunkt: Phase 21/AE-68, Commit `0ed5035`. Vorab drei-Agenten-Review
(Code-Qualität, UI/Design, Backend-Architektur) über den Ist-Stand; alle
Befunde gegen den Code verifiziert, Alt-Findings vom 06.09. neu geprüft
(1 von 7 behoben, Audio-Leak teils behoben, Rest offen). Danach Umsetzung in
zwei Wellen mit parallelen Agenten. Ergebnis: TypeScript clean, **820
Jest-Tests in 49 Suiten grün** (vorher 752/45, +68 Tests), 9 Node-Pipeline-
Tests grün (vorher 8), Content-Integrität fehlerfrei. Orphan-GC: 102 Dateien
(5,27 MiB) aus `assets/content/` entfernt — der Ordner enthält nur noch
katalogreferenzierte Medien.

### AE-69 — Speicherausfall wird sichtbar statt still ignoriert

Schlägt SQLite fehl, lief die App bislang im RAM weiter — Fortschritt ging
beim Schließen verloren, ohne Hinweis. Da ein RAM-Backend nichts persistent
speichern kann, ist kein Meta-Flag möglich: die Degradation wird per
Laufzeitanfrage `isStorageDegraded()` (src/lib/storage/index.ts) abgefragt
und im Einstellungs-Screen als Warnkarte angezeigt. Zusätzlich die
Review-Findings-Familie geschlossen: store-weite Promise-Kette im Web-Backend
(kein „letzter Flush gewinnt" mehr), `withTransactionAsync`/`transact` am
Store (Sperrpflicht dokumentiert; Memory-Store serialisiert ohne Crash-
Rollback), `rateCard` liest den Kartenstand innerhalb der Transaktion neu und
schreibt Karte+Protokoll atomar, `recordReview`/`recordDrill` laufen unter
`withStoreLock`, Profil-Setter serialisiert (kein gegenseitiges Überschreiben
der Felder mehr). `getActiveBackend()` bleibt synchron für den Diagnose-Screen.

### AE-70 — Backup-Format v1 mit Replace-Strategie; Schlüssel ausgeschlossen

Neu `src/lib/backup.ts`: Export von Kartenzuständen (FSRS), Review-Log und
Profil als `{ format: 'thaispeaker-backup', version: 1, exportedAt, data }`.
Import **ersetzt** die Sammlungen — Karten+Protokoll in EINER Transaktion,
Profil danach über die öffentlichen Setter (Sperrhierarchie: `withStoreLock`
ist nicht verschachtelbar). Validierung mit Größenlimit (20 MB) und
deutschen Fehlermeldungen. Native: neue File/Directory-API des
expo-file-system (Legacy-API der v57 ist deprecated) + `Sharing.shareAsync`;
Web: Blob-Download, Bestätigung über `window.confirm` (`Alert.alert` ist in
react-native-web ein No-Op). Module via `npx expo install` (file-system
~57.0.6, sharing ~57.0.18, document-picker ~57.0.1). **Bewusst nicht im
Backup:** API-Schlüssel (SecureStore) und Provider-Einstellungen — sie gehören
nicht in eine weitergegebene Datei. Neue Native-Module → Dev-Client-Rebuild
erforderlich; Ende-zu-Ende auf dem Emulator noch nicht gefahren (Tests decken
die Logik + gemockten Rampen ab).

### AE-71 — Katalog ist Definitions-Hoheit für Medien-Assets

Neu `scripts/content/prune-orphans.cjs` (Dry-Run als Default, `--apply`,
Löschkandidaten nur bei Hash-Namen mit Media-Endung; alles andere wird nur
gemeldet). check.cjs prüft jetzt zusätzlich die Gegenrichtung — jede Datei in
`assets/content/` und jeder Key in assets.ts muss im Katalog referenziert
sein, sonst Fehler (in beiden Modi, auch `--integrity-only`). Eine der 102
gelöschten Dateien war Test-Fixture und lebt jetzt als
`scripts/content/fixtures/real-dead-syllable.mp3` (sha256-Verifikation im
Test). Metro löst `@anthropic-ai/sdk` auf Native statt auf ein leeres Modul
auf ein Stub mit klarer Fehlermeldung („Inhaltsstudio nur im Web-Debug-Studio")
— gleiche Bundle-Wirkung, Diagnose statt `undefined is not a constructor`.
README dokumentiert: `npm run android/ios` = native Dev-Builds, Expo Go
funktioniert nicht.

### AE-72 — Semantische Farbtokens, entkoppelt von den Tonfarben

Neu in theme.ts: `accent`/`accentText` (Primary-CTA), `link`, `success`,
`error`, `badge`, `borderSubtle`, `decorGrey` — mit AA-Kontrasttests je
Light/Dark gegen `backgroundSelected` und einem Test, der Richtig/Falsch mit
Hue-Abstand ≥ 20° von allen fünf Thai-Tonfarben fernhält (davor waren
richtig/falsch = mid/falling). `ThemedButton` (primary/secondary, 44 pt,
accessibilityRole/State) für die Kern-CTAs (Aufdecken, Weiter, Aufnahme,
Auswerten, Erneut versuchen). Modusleiste in review.tsx bricht um
(`flexWrap`) und hat 44-pt-Chips — „Satz wiederholen" ist nicht mehr
abgeschnitten. Thai-Display-Text mit `maxFontSizeMultiplier` (1,4 groß/2
mittel) und mitwachsender Zeilenhöhe; Typo-Skala (`thaiLarge`/`thaiMedium`/
`stat`) zentral in themed-text.tsx. Fortschritts-Chart pro Spalte
ansagbar („12. Mai: 8 Wiederholungen, 3 Übungen"), Balken für Screenreader
versteckt; Web-Tabs mit tablist/tab-Rolle und selected-State.

### Weitere Robustheit (Review-Findings ohne eigenen AE)

- audio.ts: try/catch um Player-Erzeugung/`play()` und Release bei
  Fehlerstatus (`AudioStatus.error`, v57-Docs) — Rest des alten P1-Findings
  geschlossen; Wiedergabefehler werfen ehrlich statt „asset" vorzutäuschen.
- `.catch`-Familie: drill-runner, speaking-runner, conversation, exam
  (Overview/Modul getrennt), review (Profil, CardSession, restart) zeigen
  jetzt Fehlerkarten mit „Erneut versuchen"/„Zurück" nach dem
  progress.tsx-Muster statt Endlos-Spinner.
- sentence-runner: „Neue Runde" würfelt neuen Seed (vorher exakt dieselbe
  Task-Reihenfolge und Antwortmischung), der 200-ms-Timer läuft nur noch in
  der Countdown-Phase, der Methodik-Disclaimer ist einklappbar (Standard zu,
  44-pt-Toggle) und steht nicht mehr bei jedem Satz im Lernfluss.
- providers/http.ts: 30-s-Timeout (`AbortSignal.timeout`), genau ein Retry
  nur bei Netzwerk-/Timeout-Fehlern, 4xx/5xx nie — betrifft das Dev-Studio.
- fsrs: `NEW_CARDS_PER_SESSION = 10` — neue Karten reihen nach den fälligen,
  gedeckelt. **Sichtbare Semantikänderung:** die Dashboard-Zahl „fällig"
  zeigt jetzt die nächste Sitzung (max. 10 neue je Richtung), nicht mehr das
  Gesamt-Backlog; `fresh` zeigt weiterhin alle neuen Karten.
- stats: Streak-Fenster 365 Tage statt 14 (Kappung behoben; Diagrammfenster
  unverändert). `_layout.tsx`: `preventAutoHideAsync().catch(...)`.

### Offen nach Phase 22 (bewusst nicht hier)

- **EAS:** `eas init` nie ausgeführt (CLI nicht eingeloggt),
  `extra.eas.projectId` fehlt — jeder `eas build` scheitert. Nutzeraktion:
  `npx eas login`, `npx eas init`, dann Test-Build gegen das eas-gate.
- Neuer Dev-Client-Build nötig (Backup-Module sind nativ); Backup auf dem
  Emulator Ende-zu-Ende fahren.
- Die 4 vorbestehenden content:check-Vollständigkeitsfehler (Hörclips,
  Situationen en/es) unverändert — Content-Ausbau nach Tageslimit-Reset,
  siehe Phase 21.
- Modus-Chips/Sprach-Optionen nutzen weiterhin `toneColor('mid')` als
  Auswahlrahmen (bewusst zurückgestellt, kein Review-Befund).
- Katalog-Skalierung: bei Annäherung an 3436 Clips catalog.json aus dem
  JS-Bundle lösen (SQLite-Vorbefüllung oder gesplittete Lazy-Module).

### Verifikation auf dem Emulator + zwei Nachträge (07.09.2026)

Phase 22 danach auf dem Android-Emulator (Dev-Client, frischer Metro-Run mit
`--clear` — der alte Bundler-Stand hatte beim Bundle-Laden noch die verwaisten
Dateinamen aus assets.ts referenziert, DebugServerException 500, AE-68-Muster)
durchgeklickt und hell + dunkel fotografiert (screenshots/phase22/).
Befunde in zwei Folgefixes:

1. **„Satzübung verlassen" war eine No-op.** onExit setzte nur `mode: undefined`
   in die Adresse; ohne `?mode=` greift aber der gemerkte Profilstand, und der
   Merk-Effekt schrieb ihn sofort zurück — die Sitzung öffnete sich erneut.
   Betroffen waren alle Nicht-Karteikarten-Modi (Satz-, Sprech-, Schreib- und
   Drill-Übungen), schon vor Phase 22. Fix: onExit schreibt explizit
   `mode: 'cards'` (racefrei gegen den Profil-Fallback); im Emulator verifiziert.
2. **Statusbar-Icons im Hellmodus unlesbar.** Der Layout setzte den Stil nie,
   die Icons blieben weiß auf hellem Grund. `<StatusBar style="auto" />` ergänzt.

Entwarnung zu zwei Design-Review-Meldungen: „Karte 1 von 10" oben abgeschnitten
war Scroll-Position des Screenshots (in 11-lernen-dark.png vollständig sichtbar);
die titelgleichen Situationskarten („Neue Nachbarn im Apartmenthaus") sind
beabsichtigte Dialogvarianten (greeting-A1-de_to_th-001/002/010/…), keine
Daten-Duplikate. Verbleibende Polish-Notizen der Review-Agenten: Backup-Buttons
visuell nicht unterschieden (Restore ist destruktiv), leerer „Pro Tag"-Chart
ohne Empty-State-Text, Chip-Stile (Rahmen vs. Füllung) uneinheitlich,
Quellen-URL bricht nach „www" um. TypeScript und 820 Tests grün.

---

## Gegenmessung, Admin-Pipeline und Repo-Struktur (07.09.2026)

**Messprogramm verifiziert (Code + Literatur):** Der F0-Kern (40/10 ms,
normierte Autokorrelation 70–400 Hz, Startschwelle r≥0,6, konservative
Fortsetzung, Medianfilter, 1,8-fache Oktavkorrektur, 8 %-Randbeschnitt,
Halbtonpunkte relativ zum Stimmenmedian) entspricht etablierter Praxis —
Fenster-/Schrittgeometrie wie Praat für ein 75-Hz-Fundament, erwartete
Konturen decken sich mit Abramsons Bangkok-Zitatformen, Semiton-Normierung
mit Sprechermedian ist Standard. Verdict: belastbarer Richtungs-Filter
(„widerrpricht der Sollton klar?"), kein Hörnachweis — Registerlage von
mittel/tief/hoch bleibt ohne Sprecherreferenz ungeprüft (dokumentiert).
Quellen u. a. Praat-Manual, YIN, Abramson 1962/1997, Gandour 1991,
Thepboriruk 2009, Fuchs & Maxwell 2016 (64 kbps MP3 knapp über der
Messgrenze — Bitrate fest dokumentiert).

**Gegenmessung über alle 168 Audios** (`measure-tones.cjs` neu: Katalog +
Studio-Entwürfe statt der veralteten Festprobengruppe, die 5 von 10 Dateien
nicht mehr fand): 89 Thai — 10 bestanden, 12 failed (alles Studio-Entwürfe,
beim Publish korrekt aussortiert: ข้าว พูด ค่ะ ให้ เก้า สวย ขาย หมา มาก หมู
ห้า หมอ), **67 ungeprüft, aber ausgeliefert**. Auffällig darunter: viele
mittel-Töne der Gemini-Stimme mit 7–11 Halbtönen Fall (คน −10,1; ครู −10,9;
แมว +5,9 steigend statt eben) — prime Hörkandidaten für die vom Nutzer
bemerkte „kacke"-Aufnahme; Regenerate einzeln möglich. Strukturbericht:
siehe content/tone-calibration.json.

**Auto-Ton-Check im Generierungslauf:** `src/lib/clips/batch.ts` misst jeden
frischen WAV-Clip direkt nach der Erzeugung (neuer WAV-Reader
`wavToMonoFloat32`), zählt bestanden/abgelehnt/ungeprüft im Fortschrittspanel
und legt abgelehnte Clips **gar nicht erst ab** (Fehlerliste mit Grund).
mp3 (ChatGPT) bleibt der verbindlichen Node-Prüfung beim Stage/Publish
überlassen. Drei neue Tests in batch-tone.test.ts (flach/fallend → abgelehnt,
aufsteigend/steigend → bestanden, Fremdsprache → ungeprüft gespeichert).

**Drei Schlüsselfelder:** Neue Karte „API-Schlüssel (Debug)" in den
Einstellungen (`api-keys-card.tsx`): Text / Audio / Bilder, je Anbieterwahl
+ Schlüssel, übernimmt die Wahl in die Generator-Gruppen. Nativ erstmals
überhaupt ein Schlüsselfeld; in Release rendert die Karte nichts.

**Struktur & GitHub-Vorbereitung:** ~4,3 GB Bauschutt gelöscht
(android/app/build, .cxx, build-verification, dist). docs/ neu: PROGRESS.md,
AUDIT-Lernwirksamkeit.md, screenshots/ (ehem. gui-test-screenshots/),
PIPELINE.md (Admin-Ablauf). .agent/state.json → _Local/ (unverfolgt).
README neu geschrieben (Struktur, GitHub-vs-lokal, Schnellstart).
Neu: `npm run pipeline:release` (scripts/release-pipeline.cjs).
.phone-UI: Gesprächs-Chips und Sprachumschalter auf 44 dp Trefferfläche,
Bewertungsreihe bleibt auf 360-dp-Telefonen einzeilig (vier gleiche Viertel).

TypeScript und Testreihe grün (siehe Commit).

## 30.09.2026 — Endnutzerkorrekturen und iPhone-Quellkandidat

Vier Lernziele und Thai→Deutsch geprüft. Kapitel nutzen Szenenwortschatz/-grammatik; vollständige Dialogübersetzungen, direkter Lesestart, assistiertes Schreiben ohne FSRS, en/de-Dialogvarianten, Thai-Goethe-Hilfen, B1-Lesefallback und 20-Sprachen-Lernhilfen umgesetzt. Expo-57-Patchpakete aktualisiert, hoher Audit-Befund behoben.

Verifikation: tsc grün; Jest 97 Suites/1260 Tests, gezielte Nachtests 12/178, Pipeline 14 Tests. Integrität errors=[] bei 22727 Einträgen. Produktions-Export iOS/Android/Web, keine Entwickler-/Anbieter-/Schlüsselmodule; 15197 Medienreferenzen/45591 identische Bytevergleiche. Browser 390×844 und vier Lernziele stichprobenartig geprüft. Thai-Zeichentasten nach Browserfund auf targets[0] korrigiert und erneut typgeprüft/exportiert.

Restarbeit: native iPhone-Kompilierung/Signierung und physisches Audio-/Flugmodus-Testing, geprüfte B1-Clips/Sprachprüfung; Vollplanlücken 4868 Audio/3745 Bilder/996 Situationen, 2010 Thai-Audios unchecked; bestehende Lintfehler 29/50 Warnungen, npm 15 moderate. Kein bezahlter KI-Lauf, Cloud-Build, Push oder Upload. Details: docs/release-candidate-2026-09-30.md; lokales Quellarchiv und Manifest unter build-verification/rc-2026-09-30/.

## 03.10.2026 — Erneute Endnutzerprüfung und lokale Bildproben

Fünf Befunde der erneuten Lernrunde korrigiert: Latin-Lesequiz ohne Roman-Felder; kompakte Kapitel; eigene Rollenspielantwort neben Muster; B1-Verständnisfragen im Tageslog ohne FSRS; vier Lernsprachen in App-Info. Goethe B2 ausdrücklich ausgelassen.

ComfyUI 0.38.0 portable lokal installiert; FLUX.2 klein 4B distilled FP8, Qwen-Encoder auf CPU, Batch 1. Helper-Bildroute nur Loopback/App-Origin, ohne Schlüssel/Cloud-Fallback; neue Bilder als 512×512-WebP. Drei 1024-PNG-Proben: Apfel 20,5 s, Stuhl/Fahrrad je 16,3 s. Zwei Studio-Aufträge je ein Bild: Soße als PNG, Flugzeug als WebP (4626 Byte). Sichtprüfung: drei Grundmotive erkennbar, Stil variiert; Flugzeug sehr vereinfacht, vor Veröffentlichung Motiv prüfen. Ausgaben unter _Local/image-trial. Text-/Audioauswahl nicht verändert, nur Bilder im Browser auf ComfyUI umgestellt.

Bestehender Stage hätte schon vor den Proben 707,7 MiB ergeben, ausgelieferter Katalog 411,1 MiB. Ein erster automatischer Publish scheiterte ohne Katalogänderung. Lokaler Bildweg exportiert jetzt ausschließlich Bildentwürfe ohne Publish; zweiter Browser-Lauf fertig, 1/1 erzeugt, null Exportfehler. Keine alten Entwürfe gelöscht oder automatisch ausgeliefert.

Verifikation: tsc; Jest 98 Suites/1262 Tests, nach abschließender Exportkorrektur 3 Suites/58 Tests; lokale Helper-/WebP-Tests 5, Pipeline 14. Integrität: 22727 Einträge, errors=[], 431027734 Inhaltsbytes. Browser Thai→Deutsch: Rollenspielvergleich, Lesequiz (Optionen und Sprecher), Kapitel 390×844, vier Sprachen in App-Info; B1 zeigt heute 3 Übungen/100%, 0 Wiederholungen. Kein bezahlter KI-Lauf, Push oder App-Upload. Native iPhone-Abnahme bleibt offen; Produktions-Export dieser Nachkorrektur noch nicht erneut erstellt. Einrichtung: docs/lokale-bilder.md.

Abschließend das neue CLI-Probeskript vollständig ausgeführt: drei 512-WebPs, je 14–15 s, 6/6/21 kB, alle visuell geprüft. Anbieter-Nachtest 49 Tests grün; gezieltes ESLint der neuen Logik ohne Befund.

## 03.10.2026 — Lokale Bildgenerierung beschleunigt

Nutzer hat den Vollbildlauf bei 23 erfolgreichen Bildern angehalten. Nur Bildweg optimiert: CLIPLoader device=default statt CPU, 768 statt 1024 Pixel, weiterhin vier Schritte und 512-WebP; lokale 800-ms-Zwischenpause entfernt, Helper-Polling 250 statt 1000 ms. ComfyUI verwaltet GPU/Auslagerung, Startparameter unverändert. Helper danach neu gestartet. Kein Text-/Audioanbieter oder Goethe B2 geändert.

12 lokale Vergleichsproben mit drei Motiven/festen Seeds: CPU1024 Mittel 14,01 s, GPU1024 4,90 s, GPU768 2,91 s, GPU512 2,03 s. 768 als Auflösungsreserve gewählt. Anschließender echter Helper-Probelauf 3,2/3,3/3,4 s, drei Bilder visuell geprüft, keine Speicherfehler. Nachweise unter _Local/image-speed/2026-10-03T17-45-20-640Z und _Local/image-trial/2026-10-03T17-47-37-797Z. Browser zeigt weiterhin 23 Bilder; Alle Sprachen/Alle konkreten Vokabeln/ComfyUI wieder startbereit, Serienlauf nicht gestartet. Nutzer-Löschungen an Katalog/assets unberührt.

Typprüfung, fokussiertes ESLint, fünf Helper-Tests bestanden; vollständige Jest-Suite zur Abschlussprüfung gestartet.
Abschluss: Jest 98/98 Suites, 1264/1264 Tests bestanden (355 s); tsc und ESLint bestanden. Nur die Optimierungspfade sichern; Nutzer-Katalog und gelöschte Medien nicht mitnehmen.
