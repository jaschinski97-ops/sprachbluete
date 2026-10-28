'use strict';

/**
 * UI-Texte für die Klick-Tests direkt aus dem englischen Wörterbuch
 * (`src/lib/i18n/dictionaries/en.ts`, Node 24 liest TypeScript). So bleiben
 * die Abläufe gültig, wenn ein Text umformuliert wird. Der Emulator läuft auf
 * Englisch; die App-Sprache „System“ folgt ihm.
 */

const path = require('node:path');

const en = require(path.join(__dirname, '../../src/lib/i18n/dictionaries/en.ts')).default;

function roh(schluessel) {
  const wert = en[schluessel];
  if (typeof wert !== 'string') throw new Error(`Unbekannter Wörterbuchschlüssel: ${schluessel}`);
  return wert;
}

/** Fertiger Text, Platzhalter `{{name}}` aus `werte`. */
function t(schluessel, werte = {}) {
  return roh(schluessel).replace(/\{\{(\w+)\}\}/g, (_, name) => String(werte[name] ?? ''));
}

/** RegExp für einen Text mit offenen Platzhaltern (`{{count}}` → beliebig). */
function tMuster(schluessel, { anfang = true, ende = true } = {}) {
  const teile = roh(schluessel).split(/\{\{\w+\}\}/).map((teil) => teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`${anfang ? '^' : ''}${teile.join('.+?')}${ende ? '$' : ''}`);
}

module.exports = { t, tMuster };
