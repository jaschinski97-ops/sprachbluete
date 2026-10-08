/** Motif review on 2026-10-04. Reject the exact file, never the word: a new
 * generation with a different hash becomes visible normally. Originals stay
 * in the catalog and Studio so the user can replace them. */
const rejectedAssets = new Set([
  '8a8e2436de2c866c12d748f1c7832c1cd849a1ca9e5415f45cbf62f127c6673b.webp', // weather: creature
  '5bf63b19185c8958696ed25b66ce937ce2f08925201204ec0627ba2e047fbc18.webp', // cocoa: fruit
  '5b2cd11a887079f2fbff8a49d4dfcc07fd96ba0a6a1caa029b49c30404998f9e.webp', // portada: creature
  '3cb1ac67ba21cd251a6fd69a080c45b06b7aba543d64c51d186c2dc8b1f52936.webp', // combing: fruit
  '0e21fdc9695c639ac9b954948750d57bec83df6fc08578ef2f331b095987e328.webp', // workplace: portrait
  '664667e420e53d0b2cfe336a94d985e770fb6762b105ca343a56cdb51d77b545.webp', // sausage: bean
  '4defc25c3c153b8b4fef2d1316ecee941bd5d7951d998001ae5eef2f506806c2.webp', // comb: fork
  '3d4898d5740cf71c3336c7236f4e4f11511683c4c833841e603a17a12346e78f.webp', // cover: fruit
  '28868a08257266adf6c72d4e97fe1d840936f821fb341b1b95edf815f67aa3d7.webp', // sausage: bean
  'd4f70f9be80e8ad66b134a86c19cc290071b1c6d7374afda572ae662408e7ccd.webp', // money: creature (replaced)
  'c33e81738ab44452cc4603f38e5991e173e9b094d340d055921dc5dda459abd6.webp', // jug: fruit (replaced)
  // Bildprüfung 04.10.2026, docs/karteikarten-bildpruefung-2026-10-04.md (ungeeignet)
  '8b38120f0ab63bf4830b47a1354363d130ebed85c1e16a32f244bcfd61e65a38.webp', // ki-th-2a97b171 Stück: Figur ohne Stück-Kontext
  '1cbdb768d5cdb60bc357a10f2ae6d66001e33048b3eecb8a551363dade007a4d.webp', // ki-th-345e9d6b leicht (Gewicht, Ton): Frucht ohne Gewichts- oder Tonkontext
  'd57ad47104597022878825c6b11d593b09d544f2d42df84fd61c9d1eb69db6a8.webp', // ki-th-38405188 Wäscheständer: Stehlampe statt Wäscheständer
  'b1b811d61cbc3f731a88f9e7f728c1dd21a65e6eaff557013b57aba80641b8c0.webp', // ki-th-3b43e131 Pinsel: Bleistift statt Pinsel
  '4d132ff6cab2587969e13a420506fe7f3621a42d1c50746dcee8dfa75bf1260f.webp', // ki-th-46e0fa16 Bett: Gesicht statt Bett
  'aacd0a77a80fd8ae156edbc06d2cc0ee5f70f36980a63fc7ed327e6bc6ac3c69.webp', // ki-th-56005eec Mangostane: Grüner Apfel statt Mangostane
  'a4e93e1338710753679b3c28db80961c2d43eac403ca3cc59d25f3fc7923eb99.webp', // ki-th-5b167a7d berühren, antippen: Stehende Figur ohne Berührung
  'f7746445637c5c21d2676589b4eea62ad3d88f30bd8588d8eaf407035b21dab6.webp', // ki-th-5fd91b52 zerreißen, aufreißen: Figur ohne Zerreißen
  'e4f843bb30ceaadfc936d8472879304d7453a62649c216c6cca35a6731d529ba.webp', // ki-th-677bdf57 fallen: Stab ohne Fallbewegung
  '7cfbccb17c3b6b3b60796adc1fb0607e1e82129958aeab1d38deb81efd35d92d.webp', // ki-th-6ba6b26e wecken: Figur ohne Aufwecken
  'b0fe4582e72ded95a425e15b1576b79044f2e0bb681b6fd94065d32199fbe0bb.webp', // ki-th-707bed82 klatschen, schlagen: Frucht ohne Klatschen oder Schlagen
  'c8e02ef48af8aaf14cd5e3a0ddd9a4e433e67fb63c94c72febda69fd7f5f3ebb.webp', // ki-th-8b2b0267 Tamarinde: Grüner Apfel statt Tamarinde
  '9479f83fd58173fa9fe1fda67125b82391778d716eb4bab8e4e9495c9470714e.webp', // ki-th-950669a5 Gaspedal: Fruchtgesicht statt Gaspedal
  '2e288e91f7336fa60977608dd64372ac9a059c910cb43e351b2f47639808b7ab.webp', // ki-th-9c4191f0 Allergiemittel, Antihistaminikum: Grüne Kugel ohne Medikament
  '5511b85265c29f58197a0509a61e2a4f04d69545cdc319c0c926c7a8a343aea9.webp', // ki-th-a1447812 einweichen: Porträt ohne Einweichen
  'cb49dfc4c82b062398677b40a43b5ee66c33f4ea1d53bcdb4fb2cbfc15406ba5.webp', // ki-th-a89f0be0 Wörterbuch: Kopf statt Wörterbuch
  'a478a729dd5bd6691fc096cf065bf7a2a589f8c3af7de06bf74fe3e82a485656.webp', // ki-th-c8d07310 künstliche Tränen: Weinendes Gesicht ohne Augentropfen
  '7c203d627da0e1122f70a9033fd826c8bdc8fc0f02e24180804693a9f0cfb96c.webp', // ki-th-d416d8c6 Roman: Porträt statt Roman
  'b1db049013509688d8098d2129c3f2f7b35846d98c5ad1ea3b3e280c37dda83b.webp', // ki-th-e2ab10d9 Regenwurm: Kurze Fantasiefigur statt Regenwurm
  'a358630f9a6f2e6bc7f08ded32ee3dc31f6b93904a36a1a48be311144e9b3dcd.webp', // ki-th-ebeb9d62 Jasminreis: Brauner Apfel statt Reis
  'feb6e7a4bdb1735a36aa0372769ffe5ccfb50d98e26e35857c1d84ec752a71f4.webp', // ki-th-f8c0cb7e Mönch: Kind ohne Mönchsgewand
  '8843f763d27b4f1c59202d40ee2ddb267258d4177ed3687eb29043c9f565db44.webp', // ki-th-fc17d940 Bart: Gesicht ohne Bart
  'e2832b4955b3e54fd41d1abff3936c6fe544fe3606f4900bbe5b24dbb47fe503.webp', // ki-en-09b9a6eb reparieren: Kugel ohne Reparatur
  '8c496ab0b9642509773f70104a01761e167fdb0013c66b261a45ec74d3877e38.webp', // ki-en-37ee5899 braten: Objekt ohne Bratvorgang
  '259d665aaa4f64d837e8bc4c22bd47bc9674c06ee552573bd4ee5077abb3713c.webp', // ki-en-53ab1f83 schnarchen: Waches Porträt ohne Schnarchen
  'cc60043df4db0f783c25504b2696c2cb3b3b1c8f7673b5a0c4a692d39515e0f0.webp', // ki-en-81bd39b1 reiben: Frucht ohne Reiben
  '9c7676eccb06016b698bb628d4af1af8d1c0750ab86cff1aa31e6f0b7bfb7fb3.webp', // ki-en-9f53afe2 Vertrag: Porträt statt Vertrag
  '6dc98c905b4c661ffdb3ce06a0423be305e058a8f7bb8c66848b86bc36623761.webp', // ki-en-be5b76c0 schneiden: Frucht ohne Schneiden
  '59de241d4fc7c4b8136efe6fd3c9b103853a65e0b3c2c8422f470244f552e9eb.webp', // ki-en-c5c9e3e5 Kante: Kinderporträt ohne Kante
  'e834c59ddfe75fed78ef5508ee8bf1823997b5073d66ac55f034962188a49562.webp', // ki-en-dd1e4701 Verkehrsstau: Einzelnes Auto ohne Stau
  'fe3b40b52180682b815709daa0241926b41c4ef5abc4de839ffa5212c96df743.webp', // ki-es-071a89c7 Knochen: Kartoffelähnliches Objekt statt Knochen
  '51e19c0be34ebee1df1ad96c9bdfc1c68c1526b6f18c9a53b8ee42c62c9ee176.webp', // ki-es-0fb9cb28 umarmen: Einzelne Figur ohne Umarmung
  'b1d7ce32d2f66bed71b0a6671c005e24c23ea91b11f143324ac101a0c1c31b07.webp', // ki-es-2c7b7381 Welle: Frucht-/Wolkenfigur statt Welle
  'ef2184f193c2c63cebe00cf122099eafe29297c7adc9eaad3b50c21436db8da7.webp', // ki-es-39e7f4b2 abheben: Zeigende Hand ohne Abheben
  '4089fb330bdab56e05ebf0da8746fa012232b80d41c37e0da1d002fda4176875.webp', // ki-es-43cdba7b Arm: Kreis statt Arm
  'd40cf4ee13905e3353b4986c0a5e5ec46eee60b5573d4fdbf04aa421597abbde.webp', // ki-es-611cbf9e Stau: Fantasiefigur statt Stau
  'c801e9b19a3db17bc786ef4a12fcdcc6bbc719b0f6bfccc3db21463725eda0ac.webp', // ki-es-68f0cc25 Wand, Mauer: Hackmesser statt Wand
  '7fe6de0c329f44b4ff0aeaca25d2acb292b7ce5ca8db694a03610d4f8bd7cbea.webp', // ki-es-6d253725 Bohne: Gelbe Frucht statt Bohne
  '329f565e3d000a3b531057e8d4ff15a1f4199f00a63fef1e82d280f1bffb4a36.webp', // ki-es-827991ad rau: Apfel ohne raue Oberfläche
  '24624b6426e971b41b0722ace879b5b8f11b3465f70d97f1b0e952cad80674ed.webp', // ki-es-855f56db Blumenkohl: Brokkoli statt Blumenkohl
  '82ed5a188830a3290815a2b701aa7189871f4deda51b5d5500565414f45a8425.webp', // ki-es-8ba3607f Ventilator: Kessel statt Ventilator
  '000ac962bbd7b3aa55003ab8a907f73fd54f3195fa7aff1209b279350623d1a0.webp', // ki-es-a33ac5b6 App / Anwendung: Porträt statt Anwendung
  'aa250a1ca5cc033df0d8e483eda3f757f4ff11cf533ea09d8a3fc334cd4fd534.webp', // ki-es-bb9b8dfd Kohl: Blaue Figur statt Kohl
  '1d32ef8bcef22047295ffcd71958ca2e4ba4c5b7a8e2005676677dee926d04a2.webp', // ki-es-c238d875 Atmosphäre: Fruchtgesicht ohne Atmosphäre
  '0e624b80061a7e3c1fad34e37ac71b655ca5f44a3ed5dac8a0073c55c3b78e24.webp', // ki-es-c69d7e08 Broschüre: Frucht am Stab statt Broschüre
  '234378b70b40703278d66e95820649439a5b724069b5b86721ba0db7c240c562.webp', // ki-es-cd12f6c3 Rote Bete: Erdbeere statt Rote Bete
  '5b83a62757229a057eeec9ca4ac5efaadcfe9ca19ba56c2d855c6e18632e73ef.webp', // ki-es-e6479b93 Rechnung: Fruchtgesicht statt Rechnung
  '1539e03fe5fdf734e43c5787dff511283a7cc7e814a82ea9f3217f2b308e88a4.webp', // ki-es-eca3bf43 Badewanne: Kleine Schüssel statt Badewanne
  'f9ae7bb68aa2ac98f77ec5d23cd5bdc6244cb8fa72c4aedbd845a9b81f6efd04.webp', // ki-es-f173111b modern: Fantasiefigur ohne Modern-Kontext
  '14371ac62c7a66226deabef64d249fad47570f5a1f663262074f18e35af31764.webp', // ki-es-fdd5583c backen: Frucht ohne Backvorgang
  '8add6e05c451e43b9ab74b3ed9c8eede491c733f91107ce5cb0d60bceb265cf2.webp', // ki-de-28cc5b78 elektrische Schelle an der Tür: Tür ohne Klingel
  '5055dbaa655ecdff8767c3a6aa4b3d162ba67b26fbbb61abb21d2932bd11aa33.webp', // ki-de-4cb9000e Brüder und Schwestern einer Person: Einzelne Frau ohne Geschwisterkontext
  '3c7eb164727f76ee202c3c707fce0257e5534dfef4df03a669e711201d7ae9f9.webp', // ki-de-50597aac Weg nach draußen: Orange Figur statt Ausgang
  'f3f73a6bbbff029c60041cbe8d3b76a95faadda63fdf4a6e658fcc1ea63e8709.webp', // ki-de-5a65001c Tiergarten: Bäume ohne erkennbare Zoo-Szene
  '0514cd6499865456bf89f4193d5bf5963671c4b5df02564d503d82ccda449a28.webp', // ki-de-6a91058b preiswerte Unterkunft für junge Reisende: Lebensmittelkartons statt Jugendherberge
  '574be577e202be69f15eef2a06e92a8cc033cde537203058cf7e9a0ff49bf50b.webp', // ki-de-7fc96992 zu, nicht geöffnet: Figur ohne Geschlossen-Kontext
  '297eba0f16bf4eed84e3d842a8ca96d12f59b4736353e135ac0c35f1ea7eebbe.webp', // ki-de-a23e5e28 unterstes Geschoss zu ebener Erde: Rahmen ohne Erdgeschoss-Kontext
  'cda58cc7293f96057dbe860c15c218422b5c8032ba02593de253a5fe3472ad19.webp', // ki-de-c5b40732 Betriebsstörung, Missgeschick: Flasche statt Panne
  '8316e21acd014e4699fee56a819eb88ad7d6b2e5e1732c6ce78582b96471965c.webp', // ki-de-d78ca0d9 Längeneinheit: Fantasiefigur ohne Längenmaß
  'ded27de8d2518d902c662a6fb206849b3c75fe9dd970f80ab0db690f248ab123.webp', // ki-de-db407616 Licht reflektieren und funkeln: Frucht ohne erkennbaren Glanz
  '6aa37cfa403d05652f2c26445b5a361c1633fd4ef2181cd2c21f4d5a8ff829af.webp', // ki-de-ed678dd1 Station zum Kraftstofftanken: Wohnmobil/Laster ohne Tankstelle
]);

export function isRejectedImageAsset(asset: string | undefined): boolean {
  return !!asset && rejectedAssets.has(asset.split(/[/?#]/).find(part => /^[a-f0-9]{64}\.webp$/.test(part)) ?? asset);
}
