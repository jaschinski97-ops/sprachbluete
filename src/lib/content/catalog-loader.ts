import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Text einer eingebetteten Sprachdatei samt Dauer der beiden Schritte. */
export type CatalogFileText = { text: string; assetMs: number; readMs: number };

/**
 * Liest eine eingebettete Sprachdatei (`require('…/<lang>.catalog')`).
 *
 * Derselbe Weg wie die eingebetteten Hörclips (`bundledAssetUri`):
 * `downloadAsync` liefert auf Android die Kopie der Ressource aus `res/raw`
 * im Cache, auf iOS die Datei im App-Bundle. Laut expo-asset-Doku (v57) ist
 * nicht garantiert, dass die Cache-Kopie eine Sitzung überlebt — deshalb
 * wird bei jedem Start gefragt, nie ein Pfad gemerkt. Auf Web ist die URI
 * eine Adresse unter `dist/assets`, gelesen per `fetch`.
 */
export async function readCatalogAsset(moduleId: number): Promise<CatalogFileText> {
  const started = Date.now();
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const downloaded = Date.now();
  let text: string;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`HTTP ${response.status} für ${uri}`);
    text = await response.text();
  } else {
    text = await new File(uri).text();
  }
  return { text, assetMs: downloaded - started, readMs: Date.now() - downloaded };
}
