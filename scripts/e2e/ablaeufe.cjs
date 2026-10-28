'use strict';

/**
 * Die Klick-Abläufe (28.10.2026). Jeder Ablauf beginnt mit frisch gestarteter
 * App und prüft, was ein Nutzer sieht.
 *
 * `schonend: true` = ändert keine Lernstände (läuft immer).
 * `schonend: false` = bewertet Karten, schaltet Einstellungen um usw. Läuft
 * nur mit `--frisch` (vorher Schnappschuss, App-Daten gelöscht, danach
 * Schnappschuss zurück).
 */

const assert = require('node:assert/strict');

const { schlafe } = require('./geraet.cjs');

const passtGenau = (wert, muster) => (muster instanceof RegExp ? muster.test(wert) : wert === muster);
const { t, tMuster } = require('./texte.cjs');

const BEREICHE = ['skill.wortschatz', 'skill.hoeren', 'skill.lesenSchreiben', 'skill.sprechen', 'skill.grammatik'];
const REITER = ['tabs.overview', 'tabs.learn', 'tabs.progress', 'tabs.settings'];

/** Lern-Reiter mit gewählter Lernsprache (Name englisch, z. B. „Thai“). */
async function oeffneLernen(g, sprache) {
  // Über den „Learn“-Knopf der Sprachkarte (`language-picker.tsx`): eindeutig,
  // egal welche Sprache der Lern-Reiter zuletzt offen hatte.
  await g.tippeReiter(t('tabs.overview'));
  const knopf = `${t('tabs.learn')}: ${sprache}`;
  await g.scrolleZu(knopf);
  await g.tippe(knopf);
  await g.warteAuf(t('level.choose'), { zeit: 30_000 });
  // Überschrift des Lern-Reiters ist die gewählte Sprache.
  await g.warteAuf(sprache);
}

/** Klappt einen Lernbereich auf und liefert die Knöpfe seiner Übungen (mit Position). */
async function uebungsKnoepfe(g, bereichSchluessel) {
  const name = t(bereichSchluessel);
  await g.scrolleZu(name);
  let knoten = await g.lies();
  const kopf = () => knoten.find((k) => k.klickbar && k.beschriftung === name);
  const knoepfeUnter = () => {
    const k = kopf();
    if (!k) return [];
    const andere = BEREICHE.map(t).filter((n) => n !== name);
    const naechster = knoten
      .filter((n) => n.klickbar && andere.includes(n.beschriftung) && n.y1 > k.y2)
      .map((n) => n.y1)
      .sort((a, b) => a - b)[0] ?? Infinity;
    const reiterOben = Math.min(...knoten.filter((n) => REITER.map(t).includes(n.text)).map((n) => n.y1), Infinity);
    // Unter dem letzten Bereich folgt die Kapitel-Liste: keine Übungen.
    const kapitel = [tMuster('chapter.position', { ende: false }), new RegExp(`^${t('foundations.chapter')}`)];
    const ersterKapitel = knoten
      .filter((n) => n.klickbar && kapitel.some((m) => m.test(n.beschriftung)) && n.y1 > k.y2)
      .map((n) => n.y1)
      .sort((a, b) => a - b)[0] ?? Infinity;
    const grenze = Math.min(naechster, reiterOben, ersterKapitel);
    return knoten.filter((n) => n.klickbar && n.y1 >= k.y2 && n.y2 <= grenze && (n.beschriftung || n.text));
  };
  // Bereichskopf nach oben holen, damit aufgeklappte Übungen nicht unter dem
  // Reiterbalken liegen (sonst hielte der Test einen offenen Bereich für zu
  // und klappte ihn zu).
  const nachOben = async () => {
    const k = kopf();
    if (k && k.y1 > 700) {
      g.wischeVon(k.y1, 400);
      await schlafe(700);
      knoten = await g.lies();
    }
  };
  await nachOben();
  if (knoepfeUnter().length === 0) {
    const k = kopf();
    assert.ok(k, `Bereich „${name}“ nicht gefunden`);
    // Über die Position: „Speaking“ heißt auch eine Übung.
    g.tippeAuf(k.mitte.x, k.mitte.y);
    await schlafe(800);
    knoten = await g.lies();
    await nachOben();
  }
  return knoepfeUnter().map((k) => ({ ...k, name: k.beschriftung || k.text }));
}

/** Namen der Übungen eines Lernbereichs. */
async function uebungenIn(g, bereichSchluessel) {
  return (await uebungsKnoepfe(g, bereichSchluessel)).map((k) => k.name);
}

/** Öffnet eine Übung, prüft, dass sie steht, und geht zurück. */
async function pruefeUebung(g, bereichSchluessel, uebung, protokoll) {
  const knopf = (await uebungsKnoepfe(g, bereichSchluessel)).find((k) => k.name === uebung);
  assert.ok(knopf, `Übung „${uebung}“ fehlt in ${t(bereichSchluessel)}`);
  // Über die Position: „Speaking“ heißt auch der Bereich selbst.
  g.tippeAuf(knopf.mitte.x, knopf.mitte.y);
  // Jede Übung zeigt oben „Zurück“ und ihren Titel.
  await g.warteAuf(t('common.back'), { zeit: 20_000 });
  await schlafe(800);
  assert.ok(g.appImVordergrund(), `App nach „${uebung}“ nicht mehr im Vordergrund (Absturz?)`);
  const knoten = await g.lies();
  const inhalt = knoten.filter((k) => (k.text || k.beschriftung) && k.y1 > 700 && k.y2 < 2200).length;
  assert.ok(inhalt >= 2, `„${uebung}“ zeigt keinen Inhalt`);
  protokoll(`    ✓ ${t(bereichSchluessel)} → ${uebung}`);
  await g.tippe(t('common.back'));
  await g.warteAuf(t('level.choose'), { zeit: 10_000 }).catch(async () => {
    // Manche Übungen haben eine eigene Zwischenseite: noch einmal zurück.
    await g.tippe(t('common.back'));
    await g.warteAuf(t('level.choose'));
  });
}

const ABLAEUFE = [
  {
    name: 'Start und Übersicht',
    schonend: true,
    async lauf(g) {
      await g.warteAuf(t('tabs.overview'), { zeit: 30_000 });
      await g.warteAuf(t('home.heroCta'));
      for (const sprache of ['Thai', 'Spanish', 'German']) await g.warteAuf(sprache);
      // Wortzahl je Sprache steht da und ist nicht 0.
      const knoten = await g.lies();
      const zahlen = knoten.map((k) => /^(\d+) words$/.exec(k.text)).filter(Boolean).map((m) => Number(m[1]));
      assert.ok(zahlen.length >= 3, `Wortzahlen fehlen auf der Übersicht (${zahlen.length})`);
      assert.ok(zahlen.every((z) => z > 500), `Verdächtig kleine Wortzahl: ${zahlen.join(', ')}`);
    },
  },
  {
    name: 'Alle vier Reiter',
    schonend: true,
    async lauf(g) {
      await g.tippeReiter(t('tabs.progress'));
      await g.warteAuf(t('progress.subtitle'));
      await g.tippeReiter(t('tabs.settings'));
      await g.warteAuf(t('appLanguage.title'));
      await g.warteAuf(t('pack.title'));
      await g.tippeReiter(t('tabs.learn'));
      await g.warteAufEines([t('review.pickSubtitle'), t('level.choose')]);
      await g.tippeReiter(t('tabs.overview'));
      await g.warteAuf(t('home.heroCta'));
    },
  },
  {
    name: 'Sprachpakete-Liste',
    schonend: true,
    async lauf(g) {
      await g.tippeReiter(t('tabs.settings'));
      await g.tippe(t('pack.title'));
      await g.warteAufEines([t('pack.notInstalled'), tMuster('pack.installed')]);
      for (const sprache of ['Thai', 'Spanish', 'German']) await g.scrolleZu(sprache);
    },
  },
  {
    name: 'Karteikarte aufdecken (ohne Bewertung)',
    schonend: true,
    async lauf(g) {
      await oeffneLernen(g, 'Thai');
      const uebungen = await uebungenIn(g, 'skill.wortschatz');
      assert.ok(uebungen.includes(t('mode.cards')), `Karteikarten fehlen: ${uebungen.join(', ')}`);
      await g.tippe(t('mode.cards'));
      await g.warteAuf(tMuster('cards.progress'));
      await g.tippe(t('card.revealA11y'));
      for (const bewertung of ['rating.again', 'rating.good']) {
        await g.warteAuf(t('rating.a11y', { label: t(bewertung) }));
      }
      // Thai-Antwort zeigt Schrift plus Umschrift.
      const knoten = await g.lies();
      assert.ok(knoten.some((k) => /[฀-๿]/.test(k.text)), 'Keine Thai-Schrift auf der Karte');
      assert.ok(knoten.some((k) => /[àáâǎ]|[a-z]{2,}/.test(k.text) && !/[฀-๿]/.test(k.text)), 'Keine Umschrift auf der Karte');
      await g.tippe(t('common.back'));
      await g.warteAuf(t('level.choose'));
    },
  },
  {
    name: 'Kapitel 0 öffnen',
    schonend: true,
    async lauf(g) {
      await oeffneLernen(g, 'Thai');
      await g.warteAuf(t('foundations.title'));
      await g.tippe(t('path.open'));
      await g.warteAuf(t('common.back'), { zeit: 20_000 });
      assert.ok(g.appImVordergrund(), 'Kapitel 0 hat die App beendet');
      await g.tippe(t('common.back'));
    },
  },
  ...['Thai', 'Spanish', 'German'].map((sprache) => ({
    name: `Jede Übung öffnet (${sprache})`,
    schonend: true,
    async lauf(g, { protokoll }) {
      await oeffneLernen(g, sprache);
      let anzahl = 0;
      for (const bereich of BEREICHE) {
        const uebungen = await uebungenIn(g, bereich);
        assert.ok(uebungen.length > 0, `${t(bereich)}: keine Übungen sichtbar`);
        for (const uebung of uebungen) {
          await pruefeUebung(g, bereich, uebung, protokoll);
          anzahl++;
        }
      }
      assert.ok(anzahl >= 10, `Nur ${anzahl} Übungen gefunden`);
    },
  })),

  // ------------------------------------------------ nur mit --frisch

  {
    name: 'Einführung beim ersten Start',
    schonend: false,
    async lauf(g) {
      await g.warteAuf(t('intro.welcomeTitle'), { zeit: 40_000 });
      for (const titel of ['intro.pathTitle', 'intro.shortTitle', 'intro.longTitle']) {
        await g.tippe(t('common.next'));
        await g.warteAuf(t(titel));
      }
      await g.tippe(t('intro.done'));
      await g.warteAuf(t('home.heroCta'));
    },
  },
  {
    name: 'Karteikartenrunde komplett bewerten',
    schonend: false,
    async lauf(g, { protokoll }) {
      await oeffneLernen(g, 'Thai');
      await uebungenIn(g, 'skill.wortschatz');
      await g.tippe(t('mode.cards'));
      const erste = await g.warteAuf(tMuster('cards.progress'));
      const gesamt = Number(/(\d+)\D*$/.exec(erste.text)[1]);
      assert.ok(gesamt > 0 && gesamt <= 20, `Rundengröße ${gesamt} (erwartet 1–20)`);
      for (let i = 1; i <= gesamt; i++) {
        await g.warteAuf(t('cards.progress', { index: i, total: gesamt }));
        await g.tippe(t('card.revealA11y'));
        await g.tippe(t('rating.a11y', { label: t(i % 4 === 0 ? 'rating.again' : 'rating.good') }));
      }
      await g.warteBisWeg(tMuster('cards.progress'), { zeit: 10_000 });
      protokoll(`    ✓ ${gesamt} Karten bewertet`);
      // Die Bewertungen zählen im Fortschritt.
      await g.tippeReiter(t('tabs.progress'));
      await g.warteAuf(t('progress.subtitle'));
      const knoten = await g.lies();
      const heute = knoten.find((k) => k.text === 'Reviewed today');
      if (heute) {
        const zahl = knoten.find((k) => /^\d+$/.test(k.text) && Math.abs(k.mitte.x - heute.x1) < 250 && k.y1 > heute.y2 && k.y1 - heute.y2 < 200);
        assert.ok(zahl && Number(zahl.text) >= gesamt, `Fortschritt zeigt ${zahl?.text} statt ≥ ${gesamt} Wiederholungen`);
      }
    },
  },
  {
    name: 'App-Sprache auf Deutsch und zurück',
    schonend: false,
    async lauf(g) {
      const de = require('node:path').join(__dirname, '../../src/lib/i18n/dictionaries/de.ts');
      const deText = require(de).default;
      // Die Sprachknöpfe sind Radio-Knöpfe mit Beschriftung = Name (`AppLanguageSection`).
      const radio = async (muster) => {
        await g.scrolleZu(muster);
        const knoten = (await g.lies()).filter((k) => k.klickbar && k.beschriftung && passtGenau(k.beschriftung, muster));
        assert.ok(knoten.length, `Sprachknopf fehlt: ${muster}`);
        g.tippeAuf(knoten[0].mitte.x, knoten[0].mitte.y);
        await schlafe(800);
      };
      await g.tippeReiter(t('tabs.settings'));
      await g.tippe(t('appLanguage.title'));
      await radio(/^Deutsch\b/);
      await g.warteAuf(deText['tabs.settings']);
      // Mitten im Wechsel: Reiter und Wortschatz sind deutsch beschriftet.
      await g.warteAuf(deText['tabs.learn']);
      await radio(new RegExp(`^${deText['appLanguage.system']}$`));
      await g.warteAuf(t('tabs.settings'));
      await g.warteAuf(t('tabs.learn'));
    },
  },
];

module.exports = { ABLAEUFE, oeffneLernen, uebungenIn };
