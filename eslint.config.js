// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    // scripts/tone-analysis.js erzeugt build-tone-tool.cjs aus analysis.ts.
    ignores: ["dist/**", "assets/content/**", "build-verification/**", ".content-studio/**", ".expo/**", "android/**", "ios/**", "public/**", "_Local/**", "scripts/tone-analysis.js"],
  },
  {
    // Node-Skripte (scripts/**/*.cjs) und Jest-Umgebung: Die Expo-Grundkonfiguration
    // kennt weder Node- noch Jest-Globals, deshalb meldete der erste Lauf
    // `__dirname`, `Buffer` und `jest` als undefiniert.
    files: ["scripts/**/*.cjs", "jest.setup.js", "**/*.test.{ts,tsx}", "metro.config.js", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  {
    // Die Regel schützt das App-Bundle (Expo ersetzt nur feste EXPO_PUBLIC_-Namen);
    // Node-Skripte lesen process.env zur Laufzeit.
    files: ["scripts/**/*.cjs"],
    rules: { "expo/no-dynamic-env-var": "off" },
  },
]);
