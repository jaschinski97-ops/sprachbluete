// AsyncStorage hat kein natives Modul im Test-Prozess — der mitgelieferte Mock
// bildet die Schnittstelle im Arbeitsspeicher nach, sodass `backend.web.ts`
// echt getestet werden kann statt nur gemockt.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Die Tests laufen gegen einen FESTEN Testkatalog (src/test-fixtures/
// fixture-catalog.ts): derselbe Datenweg wie die App, aber mit stabilen,
// bekannten Wörtern statt des echten, sich ändernden Bestands. Bundle-Tests
// setzen bei Bedarf einen eigenen Katalog; delivered.test.ts liest den echten.
jest.mock('./src/content/catalog.json', () => require('./src/test-fixtures/fixture-catalog').FIXTURE_CATALOG);

// Katalog je Lernsprache: Die Sprachdateien (`assets/catalog/*.catalog`)
// entstehen erst beim Metro-Start und sind kein JS. Jest hat den vollen
// Katalog im Modul und braucht sie nicht; Ladetests setzen eigene Dateien
// (`setCatalogSource`).
jest.mock('./src/content/catalog-files', () => ({ CATALOG_FILES: {} }));
