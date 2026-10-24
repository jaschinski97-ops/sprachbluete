// Erzeugt von `node scripts/app-catalog-files.cjs --write-map`. Nicht von Hand ändern;
// scripts/app-catalog-files.test.cjs vergleicht die Datei mit dem Erzeuger.
// Statische requires: Metro legt die Sprachdateien als Asset in den App-Build
// (Android res/raw, iOS App-Bundle, Web dist/assets).
import type { UiLanguage } from '@/lib/i18n/types';
import type { LanguageCode } from '@/lib/languages/types';

/** Basis einer Lernsprache und ihre Übersetzungsteile je App-Sprache (Schritt 1b). */
export type CatalogFileSet = { base: number; translations: Record<UiLanguage, number> };

export const CATALOG_FILES: Record<LanguageCode, CatalogFileSet> = {
  th: {
    base: require('../../assets/catalog/th.catalog'),
    translations: {
      de: require('../../assets/catalog/th-de.catalog'),
      en: require('../../assets/catalog/th-en.catalog'),
      es: require('../../assets/catalog/th-es.catalog'),
      th: require('../../assets/catalog/th-th.catalog'),
      ar: require('../../assets/catalog/th-ar.catalog'),
      zh: require('../../assets/catalog/th-zh.catalog'),
      hi: require('../../assets/catalog/th-hi.catalog'),
      fr: require('../../assets/catalog/th-fr.catalog'),
      bn: require('../../assets/catalog/th-bn.catalog'),
      pt: require('../../assets/catalog/th-pt.catalog'),
    },
  },
  en: {
    base: require('../../assets/catalog/en.catalog'),
    translations: {
      de: require('../../assets/catalog/en-de.catalog'),
      en: require('../../assets/catalog/en-en.catalog'),
      es: require('../../assets/catalog/en-es.catalog'),
      th: require('../../assets/catalog/en-th.catalog'),
      ar: require('../../assets/catalog/en-ar.catalog'),
      zh: require('../../assets/catalog/en-zh.catalog'),
      hi: require('../../assets/catalog/en-hi.catalog'),
      fr: require('../../assets/catalog/en-fr.catalog'),
      bn: require('../../assets/catalog/en-bn.catalog'),
      pt: require('../../assets/catalog/en-pt.catalog'),
    },
  },
  es: {
    base: require('../../assets/catalog/es.catalog'),
    translations: {
      de: require('../../assets/catalog/es-de.catalog'),
      en: require('../../assets/catalog/es-en.catalog'),
      es: require('../../assets/catalog/es-es.catalog'),
      th: require('../../assets/catalog/es-th.catalog'),
      ar: require('../../assets/catalog/es-ar.catalog'),
      zh: require('../../assets/catalog/es-zh.catalog'),
      hi: require('../../assets/catalog/es-hi.catalog'),
      fr: require('../../assets/catalog/es-fr.catalog'),
      bn: require('../../assets/catalog/es-bn.catalog'),
      pt: require('../../assets/catalog/es-pt.catalog'),
    },
  },
  de: {
    base: require('../../assets/catalog/de.catalog'),
    translations: {
      de: require('../../assets/catalog/de-de.catalog'),
      en: require('../../assets/catalog/de-en.catalog'),
      es: require('../../assets/catalog/de-es.catalog'),
      th: require('../../assets/catalog/de-th.catalog'),
      ar: require('../../assets/catalog/de-ar.catalog'),
      zh: require('../../assets/catalog/de-zh.catalog'),
      hi: require('../../assets/catalog/de-hi.catalog'),
      fr: require('../../assets/catalog/de-fr.catalog'),
      bn: require('../../assets/catalog/de-bn.catalog'),
      pt: require('../../assets/catalog/de-pt.catalog'),
    },
  },
};
