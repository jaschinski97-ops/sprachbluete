# Karteikarten: Bildprüfung 04.10.2026

Alle 3.825 Bildzuordnungen (3.821 verschiedene Dateien) technisch geprüft: SHA-256, Dekodierung, 512×512 Pixel, Dateigröße, Web-Dateigleichheit und Vokabelreferenz ohne Fehler. Neun bereits gesperrte Zuordnungen sind weiterhin im Katalog vorhanden; die Lernansicht filtert ihre exakten Dateien.

Browser: je eine 20-Karten-Runde in Thai, Englisch, Spanisch und Deutsch vollständig durchlaufen. Alle 28 dabei angezeigten Bilder geladen. Bewertungen nur auf dem separaten Testursprung 127.0.0.1; Lernstand auf localhost unberührt.

Motivprüfung: 256 Vorschauen, je 64 gleichmäßig über die aktiven Bildzuordnungen jeder Sprache verteilt. Bereits gesperrte Motive ausgeschlossen. 61 weitere Motive sind für das jeweilige Lernwort ungeeignet; 50 weitere sind unklar oder bilden den Begriff unvollständig ab. Die übrigen 145 zeigten in dieser Vorschau keinen eindeutigen Fehler. Das ist keine Freigabe des Gesamtbestands und keine statistisch zufällige Stichprobe.

| Lernsprache | Geprüft | Ungeeignet | Unklar/unvollständig |
|---|---:|---:|---:|
| Thai | 64 | 22 | 10 |
| Englisch | 64 | 8 | 15 |
| Spanisch | 64 | 20 | 13 |
| Deutsch | 64 | 11 | 12 |

Nachtrag: Die 61 ungeeigneten Motive sind inzwischen nach Dateihash gesperrt (`src/lib/images/reviewed-assets.ts`). Die Ursache war der Ersatz-Prompt mit deutscher Bedeutung und Zielwort; der neue englische Prompt je Wortart (`generatedMotif` in `src/lib/images/plan.ts`) ersetzt beim nächsten lokalen Bildlauf alle Bilder mit altem Prompt. Ursprünglich: Keine KI-Erzeugung gestartet. Der Fehler betrifft die Motive selbst, nicht die technische Zuordnung. Abstrakte Begriffe, Handlungen, Körperteile und Beziehungen brauchen erkennbare Szenen statt beliebiger Figuren.

Die JSON-Begleitdatei enthält vollständige Dateinamen sowie die unklaren Fälle. Sichtbögen und Browserbelege liegen lokal unter `build-verification/card-images-2026-10-04/`.

## Ungeeignete Motive

| Sprache | Wort | Bedeutung | Befund | Vokabel-ID |
|---|---|---|---|---|
| th | ชิ้น | Stück | Figur ohne Stück-Kontext | `ki-th-2a97b171` |
| th | เบา | leicht (Gewicht, Ton) | Frucht ohne Gewichts- oder Tonkontext | `ki-th-345e9d6b` |
| th | ราวตากผ้า | Wäscheständer | Stehlampe statt Wäscheständer | `ki-th-38405188` |
| th | พู่กัน | Pinsel | Bleistift statt Pinsel | `ki-th-3b43e131` |
| th | เตียง | Bett | Gesicht statt Bett | `ki-th-46e0fa16` |
| th | มังคุด | Mangostane | Grüner Apfel statt Mangostane | `ki-th-56005eec` |
| th | แตะ | berühren, antippen | Stehende Figur ohne Berührung | `ki-th-5b167a7d` |
| th | ฉีก | zerreißen, aufreißen | Figur ohne Zerreißen | `ki-th-5fd91b52` |
| th | ตก | fallen | Stab ohne Fallbewegung | `ki-th-677bdf57` |
| th | ปลุก | wecken | Figur ohne Aufwecken | `ki-th-6ba6b26e` |
| th | ตบ | klatschen, schlagen | Frucht ohne Klatschen oder Schlagen | `ki-th-707bed82` |
| th | มะขาม | Tamarinde | Grüner Apfel statt Tamarinde | `ki-th-8b2b0267` |
| th | คันเร่ง | Gaspedal | Fruchtgesicht statt Gaspedal | `ki-th-950669a5` |
| th | ยาแก้แพ้ | Allergiemittel, Antihistaminikum | Grüne Kugel ohne Medikament | `ki-th-9c4191f0` |
| th | แช่ | einweichen | Porträt ohne Einweichen | `ki-th-a1447812` |
| th | พจนานุกรม | Wörterbuch | Kopf statt Wörterbuch | `ki-th-a89f0be0` |
| th | น้ำตาเทียม | künstliche Tränen | Weinendes Gesicht ohne Augentropfen | `ki-th-c8d07310` |
| th | นิยาย | Roman | Porträt statt Roman | `ki-th-d416d8c6` |
| th | ไส้เดือน | Regenwurm | Kurze Fantasiefigur statt Regenwurm | `ki-th-e2ab10d9` |
| th | ข้าวหอมมะลิ | Jasminreis | Brauner Apfel statt Reis | `ki-th-ebeb9d62` |
| th | พระ | Mönch | Kind ohne Mönchsgewand | `ki-th-f8c0cb7e` |
| th | เครา | Bart | Gesicht ohne Bart | `ki-th-fc17d940` |
| en | fix | reparieren | Kugel ohne Reparatur | `ki-en-09b9a6eb` |
| en | roast | braten | Objekt ohne Bratvorgang | `ki-en-37ee5899` |
| en | snore | schnarchen | Waches Porträt ohne Schnarchen | `ki-en-53ab1f83` |
| en | rub | reiben | Frucht ohne Reiben | `ki-en-81bd39b1` |
| en | contract | Vertrag | Porträt statt Vertrag | `ki-en-9f53afe2` |
| en | cut | schneiden | Frucht ohne Schneiden | `ki-en-be5b76c0` |
| en | edge | Kante | Kinderporträt ohne Kante | `ki-en-c5c9e3e5` |
| en | traffic jam | Verkehrsstau | Einzelnes Auto ohne Stau | `ki-en-dd1e4701` |
| es | hueso | Knochen | Kartoffelähnliches Objekt statt Knochen | `ki-es-071a89c7` |
| es | abrazar | umarmen | Einzelne Figur ohne Umarmung | `ki-es-0fb9cb28` |
| es | ola | Welle | Frucht-/Wolkenfigur statt Welle | `ki-es-2c7b7381` |
| es | despegar | abheben | Zeigende Hand ohne Abheben | `ki-es-39e7f4b2` |
| es | brazo | Arm | Kreis statt Arm | `ki-es-43cdba7b` |
| es | atasco | Stau | Fantasiefigur statt Stau | `ki-es-611cbf9e` |
| es | pared | Wand, Mauer | Hackmesser statt Wand | `ki-es-68f0cc25` |
| es | alubia | Bohne | Gelbe Frucht statt Bohne | `ki-es-6d253725` |
| es | áspero | rau | Apfel ohne raue Oberfläche | `ki-es-827991ad` |
| es | coliflor | Blumenkohl | Brokkoli statt Blumenkohl | `ki-es-855f56db` |
| es | ventilador | Ventilator | Kessel statt Ventilator | `ki-es-8ba3607f` |
| es | aplicación | App / Anwendung | Porträt statt Anwendung | `ki-es-a33ac5b6` |
| es | col | Kohl | Blaue Figur statt Kohl | `ki-es-bb9b8dfd` |
| es | atmósfera | Atmosphäre | Fruchtgesicht ohne Atmosphäre | `ki-es-c238d875` |
| es | folleto | Broschüre | Frucht am Stab statt Broschüre | `ki-es-c69d7e08` |
| es | remolacha | Rote Bete | Erdbeere statt Rote Bete | `ki-es-cd12f6c3` |
| es | factura | Rechnung | Fruchtgesicht statt Rechnung | `ki-es-e6479b93` |
| es | bañera | Badewanne | Kleine Schüssel statt Badewanne | `ki-es-eca3bf43` |
| es | moderno | modern | Fantasiefigur ohne Modern-Kontext | `ki-es-f173111b` |
| es | hornear | backen | Frucht ohne Backvorgang | `ki-es-fdd5583c` |
| de | Klingel | elektrische Schelle an der Tür | Tür ohne Klingel | `ki-de-28cc5b78` |
| de | Geschwister | Brüder und Schwestern einer Person | Einzelne Frau ohne Geschwisterkontext | `ki-de-4cb9000e` |
| de | Ausgang | Weg nach draußen | Orange Figur statt Ausgang | `ki-de-50597aac` |
| de | Zoo | Tiergarten | Bäume ohne erkennbare Zoo-Szene | `ki-de-5a65001c` |
| de | Jugendherberge | preiswerte Unterkunft für junge Reisende | Lebensmittelkartons statt Jugendherberge | `ki-de-6a91058b` |
| de | geschlossen | zu, nicht geöffnet | Figur ohne Geschlossen-Kontext | `ki-de-7fc96992` |
| de | Erdgeschoss | unterstes Geschoss zu ebener Erde | Rahmen ohne Erdgeschoss-Kontext | `ki-de-a23e5e28` |
| de | Panne | Betriebsstörung, Missgeschick | Flasche statt Panne | `ki-de-c5b40732` |
| de | Meter | Längeneinheit | Fantasiefigur ohne Längenmaß | `ki-de-d78ca0d9` |
| de | glänzen | Licht reflektieren und funkeln | Frucht ohne erkennbaren Glanz | `ki-de-db407616` |
| de | Tankstelle | Station zum Kraftstofftanken | Wohnmobil/Laster ohne Tankstelle | `ki-de-ed678dd1` |
