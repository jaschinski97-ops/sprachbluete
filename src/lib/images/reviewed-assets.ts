/**
 * Bilddateien mit falschem Motiv, nach Dateihash ausgeblendet.
 *
 * Abgelehnt wird immer die genaue Datei, nie das Wort: Ein neu erzeugtes Bild
 * mit anderem Hash erscheint normal. Das Original bleibt im Katalog und im
 * Studio, damit es ersetzt werden kann.
 *
 * Die Liste ist seit dem 25.10.2026 leer: Die 72 Einträge der Bildprüfungen
 * vom 04.10.2026 betrafen die alten, lokal erzeugten Bilder, die beim
 * Neuaufbau alle gelöscht und durch Gemini-Bilder je Begriff ersetzt wurden
 * (Liste in der Git-Historie). Neue Fehlmotive hier mit Hash und Grund
 * eintragen, z. B. `'<sha256>.webp', // concept-dog: Katze statt Hund`.
 */
const rejectedAssets = new Set<string>([]);

export function isRejectedImageAsset(asset: string | undefined): boolean {
  return !!asset && rejectedAssets.has(asset.split(/[/?#]/).find(part => /^[a-f0-9]{64}\.webp$/.test(part)) ?? asset);
}
