#!/usr/bin/env node
// Thai-Töne prüfen (24.10.2026): Schrift gegen Paiboon-Umschrift, bevor
// Wörter, Sätze oder Dialoge ausgeliefert werden.
//
//   npm run content:thai-tones -- <datei.json> [--nur-fehler] [--json]
//
// Die Datei enthält eine Liste von Wörtern (Format wie VocabEntry), einen
// Katalog/Stage ({ entries: [{ kind, document }] }), Dialoge ({ scriptTurns })
// oder Satzpaare ({ thai, roman }). Ausgabe je Widerspruch: Eintrag, Silbe,
// Soll laut Schrift, Ist laut Umschrift, Begründung und – wenn sicher –
// ein Vorschlag mit den Tönen der Schrift. Exit-Code 1 bei Widerspruch.
const fs = require('node:fs');
const path = require('node:path');
const domain = require('./domain.cjs');
const { pruefeThaiWortToene, pruefeThaiDialogToene } = domain.load('src/lib/thai/tone-check');
const { ergaenzeTonzeichen, pruefeThaiTon, TON_DE } = domain.load('src/lib/thai/tone-rules');

/** Alles Prüfbare aus der Datei, egal in welcher Hülle. */
function eintraege(daten) {
  const liste = Array.isArray(daten) ? daten : Array.isArray(daten?.entries) ? daten.entries : [daten];
  return liste.map((eintrag) => (eintrag && eintrag.document && eintrag.kind ? eintrag.document : eintrag)).filter(Boolean);
}

function pruefeEintrag(eintrag, index) {
  const id = eintrag.id ?? `#${index + 1}`;
  if (Array.isArray(eintrag.scriptTurns)) {
    if (eintrag.direction && eintrag.direction.split('_to_')[1] !== 'th') return null;
    return { id, titel: eintrag.title ?? '', pruefung: pruefeThaiDialogToene(eintrag.scriptTurns) };
  }
  if (typeof eintrag.term === 'string') {
    if (eintrag.language && eintrag.language !== 'th') return null;
    return { id, titel: eintrag.term, pruefung: pruefeThaiWortToene(eintrag) };
  }
  if (typeof eintrag.thai === 'string' && typeof eintrag.roman === 'string') {
    const kontext = eintrag.kontext === 'wort' ? 'wort' : 'satz';
    const befund = pruefeThaiTon(eintrag.thai, eintrag.roman, { kontext });
    const fund = { ort: kontext === 'wort' ? 'Wort' : 'Satz', thai: eintrag.thai, roman: eintrag.roman, befund };
    return { id, titel: eintrag.thai, pruefung: { fehler: [], hinweise: [], funde: [fund] } };
  }
  return null;
}

const ton = (wert) => (wert ? TON_DE[wert] : '?');

function zeilen(ergebnis, nurFehler) {
  const aus = [];
  for (const fund of ergebnis.pruefung.funde) {
    const kontext = fund.ort === 'Wort' || fund.ort === 'Silben' ? 'wort' : 'satz';
    if (fund.befund.grund) {
      if (!nurFehler) aus.push(`UNSICHER     ${ergebnis.id}  ${fund.ort} „${fund.thai}“ (${fund.roman})\n   ${fund.befund.grund}`);
      continue;
    }
    const vorschlag = fund.befund.status === 'widerspruch' ? ergaenzeTonzeichen(fund.thai, fund.roman, kontext).roman : null;
    for (const silbe of fund.befund.silben) {
      if (silbe.status === 'ok' || (silbe.status === 'unsicher' && nurFehler)) continue;
      const art = silbe.status === 'widerspruch' ? 'WIDERSPRUCH' : 'UNSICHER   ';
      aus.push([
        `${art}  ${ergebnis.id}  ${fund.ort} „${fund.thai}“: Silbe ${silbe.index + 1} „${silbe.thai}“ (${silbe.roman})`,
        `   Soll (Schrift): ${ton(silbe.sollSchrift)}   Ist (Umschrift): ${ton(silbe.istUmschrift)}`,
        `   Begründung: ${silbe.begruendung}`,
        ...(vorschlag && silbe.status === 'widerspruch' ? [`   Vorschlag: ${vorschlag}`] : []),
      ].join('\n'));
    }
  }
  // Ton-Feld der Silben gegen ihre Umschrift (kein Fund mit Silbe).
  for (const text of ergebnis.pruefung.fehler.filter((f) => f.includes('Ton-Feld') || f.includes('Feld tone'))) {
    aus.push(`WIDERSPRUCH  ${ergebnis.id}  ${text.replace(/^Ton-Widerspruch: /, '')}`);
  }
  return aus;
}

function main(argv) {
  const datei = argv.find((arg) => !arg.startsWith('--'));
  if (!datei) {
    console.error('Aufruf: npm run content:thai-tones -- <datei.json> [--nur-fehler] [--json]');
    return 2;
  }
  const daten = JSON.parse(fs.readFileSync(path.resolve(datei), 'utf8'));
  const ergebnisse = eintraege(daten).map(pruefeEintrag).filter(Boolean);
  const summe = {
    geprueft: ergebnisse.length,
    mitWiderspruch: ergebnisse.filter((e) => e.pruefung.fehler.length).length,
    widersprueche: ergebnisse.reduce((n, e) => n + e.pruefung.fehler.length, 0),
    hinweise: ergebnisse.reduce((n, e) => n + e.pruefung.hinweise.length, 0),
  };
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ summe, eintraege: ergebnisse.map((e) => ({ id: e.id, titel: e.titel, fehler: e.pruefung.fehler, hinweise: e.pruefung.hinweise })) }, null, 2));
  } else {
    for (const ergebnis of ergebnisse) for (const zeile of zeilen(ergebnis, argv.includes('--nur-fehler'))) console.log(zeile);
    console.log(`\n${summe.geprueft} Einträge geprüft: ${summe.widersprueche} Widersprüche in ${summe.mitWiderspruch} Einträgen, ${summe.hinweise} Hinweise.`);
  }
  return summe.widersprueche ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, pruefeEintrag };
