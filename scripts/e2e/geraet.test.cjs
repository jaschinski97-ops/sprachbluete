'use strict';

// Klick-Tester ohne Gerät prüfen: Bildschirm-XML lesen, Texte finden,
// Wörterbuchtexte auflösen. Die Abläufe selbst laufen nur am Emulator
// (`npm run e2e:android`).

const test = require('node:test');
const assert = require('node:assert/strict');

const { leseKnoten, finde, bereinige } = require('./geraet.cjs');
const { t, tMuster } = require('./texte.cjs');
const { ABLAEUFE } = require('./ablaeufe.cjs');

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" content-desc="" clickable="false" enabled="true" bounds="[0,0][1080,2400]">
<node index="1" text="Learn" content-desc="" clickable="false" enabled="true" bounds="[420,1466][515,1519]" />
<node index="2" text="" content-desc="&#57344;, Learn" clickable="true" enabled="true" bounds="[270,2209][540,2337]" />
<node index="3" text="Mangoes &amp; more &quot;fresh&quot;" content-desc="" clickable="true" enabled="true" bounds="[0,10][100,50]" />
<node index="4" text="leer" content-desc="" clickable="false" enabled="true" bounds="[0,0][0,0]" />
</node></hierarchy>`;

test('liest Knoten mit Position, Klickbarkeit und entschlüsselten Texten', () => {
  const knoten = leseKnoten(XML);
  assert.equal(knoten.length, 5);
  const reiter = knoten[2];
  assert.equal(reiter.klickbar, true);
  assert.deepEqual(reiter.mitte, { x: 405, y: 2273 });
  assert.equal(knoten[3].text, 'Mangoes & more "fresh"');
});

test('Reiterbeschriftung mit Symbolzeichen passt auf den reinen Namen', () => {
  assert.equal(bereinige(', Learn'), 'Learn');
  const treffer = finde(leseKnoten(XML), 'Learn');
  assert.equal(treffer.length, 2);
  assert.ok(treffer.some((k) => k.klickbar));
});

test('unsichtbare Knoten (Größe 0) werden nie gefunden', () => {
  assert.equal(finde(leseKnoten(XML), 'leer').length, 0);
});

test('RegExp-Muster prüfen Text und Beschriftung', () => {
  assert.equal(finde(leseKnoten(XML), /^Mangoes/).length, 1);
});

test('Wörterbuchtexte: Platzhalter füllen und als Muster öffnen', () => {
  assert.equal(t('tabs.learn'), 'Learn');
  assert.equal(t('cards.progress', { index: 3, total: 20 }), 'Card 3 of 20');
  assert.ok(tMuster('cards.progress').test('Card 7 of 12'));
  assert.ok(!tMuster('cards.progress').test('Card 7 of'));
  assert.throws(() => t('gibt.es.nicht'), /Unbekannter Wörterbuchschlüssel/);
});

test('jeder Ablauf hat einen eindeutigen Namen, schonende kommen ohne --frisch aus', () => {
  const namen = ABLAEUFE.map((a) => a.name);
  assert.equal(new Set(namen).size, namen.length);
  assert.ok(ABLAEUFE.filter((a) => a.schonend).length >= 5);
  for (const ablauf of ABLAEUFE) assert.equal(typeof ablauf.lauf, 'function');
});
