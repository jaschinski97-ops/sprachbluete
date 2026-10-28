// Vorbild-Kurven je Lernsprache (28.10.2026), erzeugt von
// `node scripts/content/vorbild-kurven.cjs`. Statische requires: Metro legt
// die Dateien als Asset in den App-Build. Endung `.yml` (Inhalt ist JSON,
// also gültiges YAML), weil Metro sie ohne Änderung an der geschützten
// `metro.config.js` als Asset kennt.
import type { LanguageCode } from '@/lib/languages/types';

export const KURVEN_DATEIEN: Record<LanguageCode, number> = {
  th: require('../../assets/kurven/th.kurven.yml'),
  en: require('../../assets/kurven/en.kurven.yml'),
  es: require('../../assets/kurven/es.kurven.yml'),
  de: require('../../assets/kurven/de.kurven.yml'),
};
