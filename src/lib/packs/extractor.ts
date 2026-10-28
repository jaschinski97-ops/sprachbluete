/**
 * Entpacken der Paket-Zips.
 *
 * ENTSCHEIDUNG (Architektur): Das eigentliche Entpacken macht auf dem Geraet
 * `react-native-zip-archive` — eine NATIVE Abhaengigkeit, die hier bewusst
 * noch NICHT installiert ist (`npm i react-native-zip-archive` ist Sache des
 * Orchestrators, siehe Report). Bis dahin ist der Extraktor ein Interface mit
 * einer erkennbaren Luecke statt einer halben Implementierung:
 *
 *   - `createPackExtractor()` liefert `null`, wenn das native Modul fehlt
 *     (Web, Test, oder Dependency nicht installiert). Die App degradiert
 *     sauber: Paket-Installation ist dann nicht moeglich, alles andere
 *     laeuft wie bisher ueber die eingebetteten Assets.
 *   - Fuer Jest gibt es einen In-Memory-/Kopier-Extraktor in den Tests.
 *
 * Wer spaeter einen anderen Entpacker andocken will, implementiert nur
 * dieses Interface.
 */

import { Platform } from 'react-native';

import { createNativeExtractor } from './zip-extractor';

export interface PackExtractor {
  /**
   * Entpackt das Archiv nach `destDirUri` (file://-URI). Das Ziel darf
   * existieren, aber leer sein — bestehende Dateien ueberschreibt der
   * Extraktor. Wirft bei jedem Fehler; der Downloader raeumt dann auf.
   */
  extract(zipUri: string, destDirUri: string): Promise<void>;
}

export type NativeZipModule = {
  unzip(zipUri: string, destDirUri: string): Promise<string>;
};

let detection: PackExtractor | null | undefined;

/**
 * Findet den verfuegbaren Extraktor: nativ nur auf iOS/Android und nur mit
 * installiertem `react-native-zip-archive`. Ergebnis wird gecacht; fuer
 * Tests mit `resetPackExtractor()`.
 */
export function createPackExtractor(): PackExtractor | null {
  if (detection !== undefined) return detection;
  if (Platform.OS === 'web') {
    detection = null;
    return detection;
  }
  try {
    // Erst nach `npm i react-native-zip-archive` erreichbar; davor wirft das
    // require und wir melden sauber "nicht verfuegbar".
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    detection = createNativeExtractor(require('react-native-zip-archive') as NativeZipModule);
  } catch {
    detection = null;
  }
  return detection;
}
