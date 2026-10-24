#!/usr/bin/env node
// Generiert ein UI-Wörterbuch aus der deutschen Referenz (dictionaries/de.ts)
// — die Pipeline für „jeder Mensch nutzt die App in seiner Heimatsprache“.
//
// Aufruf:  node scripts/content/generate-ui-language.cjs ar
//
// WARUM SKRIPT STATT HANDSCHRIFT: Eine neue Oberflächensprache ist ein
// Pipeline-Job (KI übersetzt alle 365 Referenz-Keys, Stichprobe ersetzt die
// manuelle Prüfung — Nutzerentscheidung 10.09.: Fehler sollen User über das
// Feedback melden), nicht eine handgeschriebene Datei. de.ts bleibt DIE Quelle;
// das Ergebnis ist vollständig (Parität) und trägt den GENERATED-Header.
//
// ABLAUF: de.ts wird über den TypeScript-Loader (domain.cjs) echt geladen —
// kein Regex-Parsen der mehrzeiligen Werte. Die Keys laufen in Chunks à ~30
// durch Chat Completions (Modell gpt-4o-mini, JSON-Antwort erzwungen); je Chunk
// gibt es 2 Wiederholungen, danach fallen einzelne fehlgeschlagene Keys auf
// Deutsch zurück und werden gewarnt. Platzhalter ({{name}}) müssen exakt
// erhalten bleiben — ein geänderten Platzhalter wäre zur Laufzeit ein Leertext.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const { loadEnvLocal } = require('../pipeline/env.cjs');
const { load } = require('./domain.cjs');

loadEnvLocal({ root });

// Die bisher generierten Oberflächensprachen. Eine neue Sprache = ein Eintrag
// hier + ein Lauf dieses Skripts + Registrierung in src/lib/i18n (siehe
// PROGRESS des Pilot-Jobs). Nichts weiter.
//
// SEIT DEM 20-SPRACHEN-AUSBAU (13.09.2026, Nutzerwunsch: „die 20 meist-
// gesprochenen Sprachen der Welt“ in den SPRACHEINSTELLUNGEN): die fünf
// bestehenden Oberflächen (de Referenz, en/es/th geprüft, ar Pilot) plus die
// 15 meistgesprochenen Sprachen, die noch fehlten. Die vier LERNsprachen
// (th/en/es/de) bleiben davon unberührt — ausgebaut wird die APP-SPRACHE.
const ZIELSPRACHEN = {
  ar: {
    datei: path.join(root, 'src', 'lib', 'i18n', 'dictionaries', 'ar.ts'),
    constName: 'ar',
    sprachName: 'Ägyptisch-Arabisch',
    // Nutzerformulierung (10.09.): die Pilot-Sprache soll klingen wie Kairo,
    // aber als App-Oberfläche ruhig geradeaus bleiben.
    stil:
      'Ägyptisches Arabisch, wie in Kairo gesprochen, leicht formal für eine App-Oberfläche',
    // Erwartete Schrift der Übersetzung — fängt den Fall „Quelle war schon
    // Englisch, Modell gab den Text unverändert zurück“ ab.
    schrift: /\p{Script=Arabic}/u,
  },
  zh: {
    datei: path.join(root, 'src', 'lib', 'i18n', 'dictionaries', 'zh.ts'),
    constName: 'zh',
    sprachName: 'Mandarin-Chinesisch',
    stil:
      'Vereinfachtes Hochchinesisch, wie in Festlandchina gebräuchlich, knapp und für eine App-Oberfläche leicht formell',
    schrift: /\p{Script=Han}/u,
  },
  hi: {
    datei: path.join(root, 'src', 'lib', 'i18n', 'dictionaries', 'hi.ts'),
    constName: 'hi',
    sprachName: 'Hindi',
    stil: 'Standard-Hindi in Devanagari, höflich und knapp für eine App-Oberfläche',
    schrift: /\p{Script=Devanagari}/u,
  },
  fr: {
    datei: path.join(root, 'src', 'lib', 'i18n', 'dictionaries', 'fr.ts'),
    constName: 'fr',
    sprachName: 'Französisch',
    stil: 'Gegenwärtiges Standard-Französisch, knapp und für eine App-Oberfläche leicht formell',
    schrift: /\p{Script=Latin}/u,
    // Lateinische Zielschriften: Die Schrift-Prüfung allein fängt nichts, denn
    // auch der deutsche Quelltext ist lateinisch. Der zweite Check unten
    // (identischMitQuelle) greift deshalb für diese Sprachen zusätzlich.
    identischMitQuelle: true,
  },
  bn: {
    datei: path.join(root, 'src', 'lib', 'i18n', 'dictionaries', 'bn.ts'),
    constName: 'bn',
    sprachName: 'Bengalisch',
    stil: 'Standard-Bengalisch in bengalischer Schrift, höflich und knapp',
    schrift: /\p{Script=Bengali}/u,
  },
  pt: {
    datei: path.join(root, 'src', 'lib', 'i18n', 'dictionaries', 'pt.ts'),
    constName: 'pt',
    sprachName: 'Portugiesisch',
    stil: 'Brasilianisches Portugiesisch, knapp und für eine App-Oberfläche leicht formell',
    schrift: /\p{Script=Latin}/u,
    identischMitQuelle: true,
  },
};

const MODELL = 'gpt-4o-mini';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const CHUNK_GROESSE = 30;
// 2 Retries = bis zu 3 Versuche je Chunk, bevor die Rest-Keys auf Deutsch fallen.
const RETRIES = 2;

/**
 * Die {{namen}} eines Texts — für die Erhaltensprüfung nach der Übersetzung.
 * Pluralblöcke `{{count, plural, one {…} other {…}}}` zählen als `count`, damit
 * eine Zielsprache ohne Pluralformen auch einfach `{{count}}` schreiben darf.
 */
function platzhalter(text) {
  return [...String(text).matchAll(/\{\{(\w+)(?:\}\}|, plural,)/g)].map((m) => m[1]).sort().join('|');
}

/**
 * Ein Chunk durch Chat Completions. Wirft bei Transport-/API-Fehlern; das
 * Retry liegt beim Aufrufer, damit Antwort-Qualität und Netzfehler dieselbe
 * Behandlungsstelle haben.
 */
async function rufeOpenAI(apiKey, ziel, chunk) {
  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELL,
      // Niedrig, weil Übersetzen kein Kreativjob ist — Konsistenz schlägt Vielfalt.
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `Du übersetzt UI-Texte einer Lern-App ins ${ziel.sprachName}. ` +
            `Stil: ${ziel.stil}. Regeln:\n` +
            '1. Übersetze natürlich und knapp — es sind Knopf-, Titel- und Hinweistexte.\n' +
            '2. Platzhalter wie {{count}} oder {{message}} bleiben EXAKT stehen (gleiches Wort in den doppelten geschweiften Klammern).\n' +
            '   Pluralblöcke {{count, plural, one {# Wort} other {# Wörter}}} bekommen die CLDR-Kategorien der Zielsprache (z. B. one/few/many/other); ohne Pluralformen genügt {{count}}.\n' +
            '3. Kein Schlüssel darf in der Antwort fehlen.\n' +
            '4. Antworte NUR mit einem JSON-Objekt: { "<schlüssel>": "<übersetzung>", ... } — dieselben Schlüssel wie die Eingabe.',
        },
        {
          role: 'user',
          content: JSON.stringify(chunk),
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(data.choices[0].message.content);
  } catch {
    throw new Error('Antwort war kein gültiges JSON');
  }
  return { uebersetzungen: parsed, usage: data.usage ?? null };
}

/**
 * Übersetzt einen Chunk mit Retries. Zurück gehen (a) die Übersetzungen,
 * (b) die Keys, die trotz Retries auf Deutsch bleiben mussten.
 */
async function uebersetzeChunk(apiKey, ziel, chunk) {
  // `offene` = die Keys, die noch keine gültige Übersetzung haben. Nach jedem
  // Versuch bleibt genau der Rest drin — der nächste Versuch fragt nur den nach.
  let offene = { ...chunk };
  const ergebnis = {};
  let usage = null;
  for (let versuch = 0; versuch <= RETRIES && Object.keys(offene).length > 0; versuch++) {
    if (versuch > 0) {
      // Kurze Pause — ein 429/Timeout soll nicht sofort wieder zuschlagen.
      await new Promise((resolve) => setTimeout(resolve, 1500 * versuch));
      console.warn(
        `  Wiederholung ${versuch}/${RETRIES} für ${Object.keys(offene).length} Keys …`
      );
    }
    try {
      const { uebersetzungen, usage: neuUsage } = await rufeOpenAI(apiKey, ziel, offene);
      if (neuUsage) usage = neuUsage;
      const uebrig = {};
      for (const [key, deutscherWert] of Object.entries(offene)) {
        const wert = uebersetzungen[key];
        const ok =
          typeof wert === 'string' &&
          wert.trim().length > 0 &&
          // Platzhalter sind der Vertrag zur Laufzeit: ein geänderter Platzhalter
          // wäre ein stiller Leertext — der Wert zählt dann als fehlgeschlagen.
          platzhalter(wert) === platzhalter(deutscherWert) &&
          // Schrift-Prüfung: Steht für die Sprache eine Schrift fest, muss die
          // Übersetzung sie tragen, WENN die Quelle überhaupt Wörter hat. Ohne
          // sie rutscht ein unveränderter Quelltext (etwa ein englischer
          // de-Wert) unübersetzt ins Wörterbuch. Rein symbolische Quellen
          // (etwa `exam.retrievedSuffix: ''`) sind davon ausgenommen.
          (!ziel.schrift ||
            ziel.schrift.test(wert) ||
            !/\p{L}{2,}/u.test(deutscherWert)) &&
          // Lateinische Zielschriften (fr/pt/id/tr/vi): Der deutsche Quelltext
          // ist selbst lateinisch — ein unverändert übernommener Wert wäre
          // hier durch die Schrift-Prüfung gerutscht. Für diese Sprachen
          // zählt ein wörtlich identischer Wert (bei wirklichem Wortlaut) als
          // fehlgeschlagen; kurze symbolische Quellen sind ausgenommen.
          (!ziel.identischMitQuelle ||
            wert.trim() !== deutscherWert.trim() ||
            !/\p{L}{2,}/u.test(deutscherWert));
        if (ok) {
          ergebnis[key] = wert.trim();
        } else {
          uebrig[key] = deutscherWert;
        }
      }
      offene = uebrig;
    } catch (error) {
      console.warn(`  Chunk-Fehler: ${error.message}`);
    }
  }
  const gefallen = Object.keys(offene);
  return { ergebnis, gefallen, usage };
}

async function main() {
  // ZWEITER ARGUMENT `--fehlende` (21.09.2026): Nur die Keys übersetzen,
  // die im Wörterbuch NOCH FEHLEN — der bestehende Bestand bleibt bytegleich
  // erhalten. Ohne das Flag gilt das bisherige Verhalten (alles neu).
  const nurFehlende = process.argv.includes('--fehlende');
  const code = process.argv.find((arg) => arg !== '--fehlende' && arg !== process.argv[0] && arg !== process.argv[1]);
  const ziel = ZIELSPRACHEN[code];
  if (!ziel) {
    console.error(
      `Unbekannte Zielsprache "${code ?? ''}". Verfügbar: ${Object.keys(ZIELSPRACHEN).join(', ')}`
    );
    process.exit(1);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY fehlt (.env.local oder Umgebung).');
    process.exit(1);
  }

  // ECHTES Laden der Referenz über den TypeScript-Loader — de.ts bleibt die
  // eine Quelle, und mehrzeilige Werte brauchen kein Regex-Parsen.
  const de = load('src/lib/i18n/dictionaries/de.ts').default;
  const keys = Object.keys(de);
  if (keys.length < 300) {
    // Schutz vor einem halben Loader-Ergebnis: Damit würde Parität scheitern.
    console.error(`Referenz verdächtig klein (${keys.length} Keys) — Abbruch.`);
    process.exit(1);
  }
  // MERGE-MODUS: vorhandene Übersetzungen sind die Basis, übersetzt wird
  // nur die Differenz. Bestehende Werte bleiben unverändert — kein
  // Qualitäts-Umschwung bei bereits ausgelieferten Sprachen.
  const vorhanden = nurFehlende
    ? load(`src/lib/i18n/dictionaries/${code}.ts`).default
    : {};
  const offene = keys.filter((key) => !(key in vorhanden));
  if (nurFehlende && offene.length === 0) {
    console.log(`${ziel.sprachName}: nichts zu tun — Parität besteht bereits.`);
    return;
  }
  console.log(
    nurFehlende
      ? `Ziehe ${offene.length} fehlende Keys nach ${ziel.sprachName} nach (${MODELL}, Chunks à ${CHUNK_GROESSE}); ${keys.length - offene.length} bleiben unverändert …`
      : `Übersetze ${keys.length} Keys nach ${ziel.sprachName} (${MODELL}, Chunks à ${CHUNK_GROESSE}) …`
  );

  const woerterbuch = { ...vorhanden };
  let gefallenGesamt = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for (let i = 0; i < offene.length; i += CHUNK_GROESSE) {
    const chunkKeys = offene.slice(i, i + CHUNK_GROESSE);
    const chunk = Object.fromEntries(chunkKeys.map((key) => [key, de[key]]));
    const { ergebnis, gefallen, usage } = await uebersetzeChunk(apiKey, ziel, chunk);
    Object.assign(woerterbuch, ergebnis);
    gefallenGesamt += gefallen.length;
    if (usage) {
      tokensIn += usage.prompt_tokens ?? 0;
      tokensOut += usage.completion_tokens ?? 0;
    }
    if (gefallen.length > 0) {
      console.warn(
        `  ⚠ ${gefallen.length} Keys fallen auf Deutsch zurück: ${gefallen.join(', ')}`
      );
    }
    console.log(`  Chunk ${i / CHUNK_GROESSE + 1}/${Math.ceil(offene.length / CHUNK_GROESSE)} fertig`);
  }

  const zeilen = keys.map((key) => {
    const wert = woerterbuch[key] ?? de[key];
    return `  ${JSON.stringify(key)}: ${JSON.stringify(wert)},`;
  });
  const kopf = [
    `// GENERIERT von scripts/content/generate-ui-language.cjs — ${ziel.sprachName}; nicht von Hand editieren, Quelle ist de.ts`,
    `// Stil: ${ziel.stil}.`,
    `// Stand: ${keys.length} Keys (Parität zur Referenz), davon ${gefallenGesamt} als Deutsch-Fallback.`,
    '',
  ].join('\n');
  const inhalt = `${kopf}const ${ziel.constName} = {\n${zeilen.join('\n')}\n} as const;\n\nexport default ${ziel.constName};\n`;
  fs.mkdirSync(path.dirname(ziel.datei), { recursive: true });
  fs.writeFileSync(ziel.datei, inhalt, 'utf8');

  console.log(
    `Geschrieben: ${path.relative(root, ziel.datei)} — ${keys.length} Keys, ` +
      `${gefallenGesamt} Deutsch-Fallback` +
      (tokensIn ? `, ~${tokensIn}+${tokensOut} Token (~$${((tokensIn / 1e6) * 0.15 + (tokensOut / 1e6) * 0.6).toFixed(4)})` : '')
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
