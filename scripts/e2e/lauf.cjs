'use strict';

/**
 * Klick-Tests am Android-Emulator starten (28.10.2026).
 *
 *   npm run e2e:android                 schonend: ändert keine Lernstände
 *   npm run e2e:android -- --alle       dazu Übungsrundgang Spanisch + Deutsch
 *   npm run e2e:android -- --frisch     alles, auf frischer App; vorher
 *                                       Emulator-Schnappschuss, danach zurück
 *   npm run e2e:android -- --nur Karte  nur Abläufe, deren Name passt
 *
 * Voraussetzung: Emulator läuft (`emulator -avd ThaiSpeaker_API36`) und die
 * App ist installiert. Fehlerbilder landen in `measurements/e2e/`.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { Geraet, zusammenfassung, schlafe } = require('./geraet.cjs');
const { ABLAEUFE } = require('./ablaeufe.cjs');
const { t } = require('./texte.cjs');

const SCHNAPPSCHUSS = 'vor-klicktests';

function argumente(liste) {
  const nurIndex = liste.indexOf('--nur');
  return {
    frisch: liste.includes('--frisch'),
    alle: liste.includes('--alle') || liste.includes('--frisch'),
    nur: nurIndex >= 0 ? new RegExp(liste[nurIndex + 1], 'i') : null,
  };
}

function emulatorBefehl(...befehl) {
  const ausgabe = execFileSync(require('./geraet.cjs').ADB, ['emu', ...befehl], { encoding: 'utf8' });
  if (/KO/.test(ausgabe)) throw new Error(`Emulator-Befehl fehlgeschlagen: ${befehl.join(' ')}: ${ausgabe.trim()}`);
  return ausgabe;
}

async function main() {
  const { frisch, alle, nur } = argumente(process.argv.slice(2));
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ablage = path.join(__dirname, '../../measurements/e2e', stempel);
  const g = new Geraet({ ablage });
  const protokoll = (zeile) => console.log(zeile);

  g.pruefeVerbindung();
  const auswahl = ABLAEUFE.filter((a) => (frisch || a.schonend) && (alle || nur || !a.alleSprachen) && (!nur || nur.test(a.name)));
  // Bei --frisch: erst die Einführung (braucht leere Daten), dann der Rest.
  auswahl.sort((a, b) => Number(a.name.startsWith('Einführung') ? 0 : 1) - Number(b.name.startsWith('Einführung') ? 0 : 1));

  if (frisch) {
    protokoll(`Schnappschuss „${SCHNAPPSCHUSS}“ sichern …`);
    emulatorBefehl('avd', 'snapshot', 'save', SCHNAPPSCHUSS);
    g.loescheAppDaten();
  }
  g.animationenAus();
  // Auch bei Abbruch (Strg+C, kill) die Emulator-Einstellungen zurückstellen.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      try {
        g.animationenZurueck();
      } finally {
        process.exit(130);
      }
    });
  }

  const ergebnisse = [];
  try {
    for (const ablauf of auswahl) {
      const beginn = Date.now();
      // Die Einführung erscheint nur beim allerersten Start; danach normaler Neustart.
      g.leereLog();
      g.starteApp();
      try {
        if (!ablauf.name.startsWith('Einführung')) {
          // Frische App: Einführung wegklicken, falls sie (noch) kommt.
          const { index } = await g.warteAufEines([t('intro.skip'), t('home.freePractice')], { zeit: 40_000 });
          if (index === 0) {
            await g.tippe(t('intro.skip'));
            await g.warteAuf(t('home.freePractice'));
          }
          // Übersicht steht; kurz Luft, bis die Reiter Berührungen annehmen.
          await schlafe(800);
        }
        await ablauf.lauf(g, { protokoll });
        const fehler = g.fehlerImLog();
        if (fehler.length) throw new Error(`JS-/Absturzfehler im Log:\n      ${fehler.slice(0, 5).join('\n      ')}`);
        ergebnisse.push({ name: ablauf.name, ok: true, ms: Date.now() - beginn });
        protokoll(`✓ ${ablauf.name} (${((Date.now() - beginn) / 1000).toFixed(1)} s)`);
      } catch (fehler) {
        const datei = g.sichere(ablauf.name);
        let bildschirm = '';
        try {
          bildschirm = zusammenfassung(await g.lies(), 25);
        } catch {}
        ergebnisse.push({ name: ablauf.name, ok: false, ms: Date.now() - beginn });
        protokoll(`✗ ${ablauf.name}\n    ${fehler.message}`);
        if (datei) protokoll(`    Bild: ${path.relative(process.cwd(), datei)}.png`);
        if (bildschirm) protokoll(`    Bildschirm:\n${bildschirm.replace(/^/gm, '      ')}`);
      }
    }
  } finally {
    g.animationenZurueck();
    if (frisch) {
      protokoll(`Schnappschuss „${SCHNAPPSCHUSS}“ zurückladen (Lernstände wie vorher) …`);
      emulatorBefehl('avd', 'snapshot', 'load', SCHNAPPSCHUSS);
      // Kein Dauerballast: der Schnappschuss kostet sonst Platz.
      await schlafe(3000);
      try {
        emulatorBefehl('avd', 'snapshot', 'delete', SCHNAPPSCHUSS);
      } catch {}
    }
  }

  const fehlgeschlagen = ergebnisse.filter((e) => !e.ok);
  const dauer = ergebnisse.reduce((s, e) => s + e.ms, 0) / 1000;
  protokoll(`\n${ergebnisse.length - fehlgeschlagen.length}/${ergebnisse.length} Abläufe bestanden (${dauer.toFixed(0)} s)${frisch ? '' : alle ? ' — schonend; alles: --frisch' : ' — schonend, Übungen nur Thai; mehr: --alle / --frisch'}`);
  process.exitCode = fehlgeschlagen.length ? 1 : 0;
}

main().catch((fehler) => {
  console.error(fehler.message);
  process.exit(2);
});
