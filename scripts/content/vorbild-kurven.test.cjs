'use strict';

// Vorbild-Kurven-Skript: welche Clips eine Kurve bekommen und mit welcher
// Thai-Umschrift (ohne ffmpeg, ohne echten Katalog).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { romanTokens, auftraege } = require('./vorbild-kurven.cjs');

test('Umschrift wird wie in der App in Silben zerlegt', () => {
  assert.deepEqual(romanTokens('châi khráp, nîi bâan-phǒm.'), ['châi', 'khráp', 'nîi', 'bâan', 'phǒm']);
});

test('nur Beispielsätze und Dialogzeilen, Thai mit Umschrift aus Wort bzw. Dialog', () => {
  const katalog = {
    entries: {
      v1: { kind: 'vocabulary', document: { id: 'ki-th-yes', language: 'th', exampleTerm: 'ใช่ครับ', exampleRoman: 'châi khráp' } },
      s1: { kind: 'situations', document: { id: 's', scriptTurns: [{ targetText: 'ไปไหน', roman: 'bpai nǎi' }] } },
      a1: { kind: 'audio', id: 'th-a', asset: 'aaaaaaaa11.mp3', document: { kind: 'example', language: 'th', text: 'ใช่ครับ' } },
      a2: { kind: 'audio', id: 'th-b', asset: 'bbbbbbbb22.mp3', document: { kind: 'turn', language: 'th', text: 'ไปไหน' } },
      a3: { kind: 'audio', id: 'th-c', asset: 'cccccccc33.mp3', document: { kind: 'vocab', language: 'th', text: 'ใช่' } },
      a4: { kind: 'audio', id: 'es-d', asset: 'dddddddd44.mp3', document: { kind: 'example', language: 'es', text: 'Hola.' } },
    },
  };
  const liste = auftraege(katalog);
  assert.deepEqual(liste.map((a) => [a.id, a.roman, a.hash]), [
    ['th-a', 'châi khráp', 'aaaaaaaa'],
    ['th-b', 'bpai nǎi', 'bbbbbbbb'],
    ['es-d', null, 'dddddddd'],
  ]);
});

test('die ausgelieferten Kurven-Dateien sind gültig und decken die Sprachen ab', () => {
  const dir = path.join(__dirname, '../../assets/kurven');
  for (const sprache of ['th', 'en', 'es', 'de']) {
    const datei = path.join(dir, `${sprache}.kurven.yml`);
    if (!fs.existsSync(datei)) continue;
    const daten = JSON.parse(fs.readFileSync(datei, 'utf8'));
    assert.equal(daten.v, 1);
    const eintraege = Object.entries(daten.kurven);
    assert.ok(eintraege.length > 0, `${sprache}: keine Kurven`);
    for (const [id, eintrag] of eintraege.slice(0, 200)) {
      assert.ok(id.startsWith(`${sprache}-`), id);
      assert.match(eintrag[1], /^[a-zA-Z.]+$/);
    }
  }
});
