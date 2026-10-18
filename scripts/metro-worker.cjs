// Metro-Worker laden metro.config.js nicht selbst. Die beiden Build-Helfer
// müssen deshalb auch hier installiert sein; Expo bleibt der Transformer.
require('./limit-build-io.cjs').install();
require('./metro-content-assets.cjs').install(require('node:path').join(__dirname, '../assets/content'));
// Nicht-Entwicklungsbauten bekommen den schlanken App-Katalog
// (metro-app-catalog.cjs); alles andere geht unverändert an Expo.
const upstream = require(require('expo/metro-config').unstable_transformerPath);
module.exports = { ...upstream, transform: require('./metro-app-catalog.cjs').wrapTransform(upstream.transform) };
