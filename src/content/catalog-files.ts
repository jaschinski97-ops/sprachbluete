// Erzeugt von `node scripts/app-catalog-files.cjs --write-map`. Nicht von Hand ändern;
// scripts/app-catalog-files.test.cjs vergleicht die Datei mit dem Erzeuger.
// Statische requires: Metro legt die Sprachdateien als Asset in den App-Build
// (Android res/raw, iOS App-Bundle, Web dist/assets).
import type { LanguageCode } from '@/lib/languages/types';

export const CATALOG_FILES: Record<LanguageCode, number> = {
  th: require('../../assets/catalog/th.catalog'),
  en: require('../../assets/catalog/en.catalog'),
  es: require('../../assets/catalog/es.catalog'),
  de: require('../../assets/catalog/de.catalog'),
};
