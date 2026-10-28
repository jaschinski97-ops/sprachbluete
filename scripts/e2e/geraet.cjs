'use strict';

/**
 * Klick-Tests am Android-Emulator (28.10.2026) — der Gerätebaustein.
 *
 * Steuert die installierte App über `adb`: Bildschirm auslesen
 * (`uiautomator dump`), Elemente nach Text oder Beschriftung finden, tippen,
 * schreiben, zurück. Keine Installation nötig, nur das Android-SDK.
 *
 * Gesucht wird nach dem, was der Nutzer sieht: `text` oder `content-desc`
 * (React Natives `accessibilityLabel`). Muster sind Strings (exakt) oder
 * RegExp.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PAKET = 'com.sprachbluete.app';
const AKTIVITAET = `${PAKET}/.MainActivity`;
const ANIMATIONEN = ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'];

function adbPfad() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(require('node:os').homedir(), 'Android/Sdk');
  const kandidat = path.join(sdk, 'platform-tools', 'adb');
  return fs.existsSync(kandidat) ? kandidat : 'adb';
}

const ADB = adbPfad();

function adb(args, { binaer = false, still = false } = {}) {
  const ausgabe = execFileSync(ADB, args, {
    encoding: binaer ? 'buffer' : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', still ? 'ignore' : 'pipe'],
  });
  return ausgabe;
}

const schlafe = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

// ---------------------------------------------------------------- XML lesen

function entschluessele(wert) {
  return wert
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Alle `<node …>` aus einem uiautomator-Dump als flache Liste. */
function leseKnoten(xml) {
  const knoten = [];
  const muster = /<node\b([^>]*?)\/?>/g;
  let treffer;
  while ((treffer = muster.exec(xml))) {
    const attr = {};
    const attrMuster = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = attrMuster.exec(treffer[1]))) attr[a[1]] = entschluessele(a[2]);
    const grenzen = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(attr.bounds || '');
    if (!grenzen) continue;
    const [x1, y1, x2, y2] = grenzen.slice(1).map(Number);
    knoten.push({
      text: attr.text || '',
      beschriftung: attr['content-desc'] || '',
      klickbar: attr.clickable === 'true',
      aktiv: attr.enabled !== 'false',
      x1, y1, x2, y2,
      mitte: { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) },
      sichtbar: x2 > x1 && y2 > y1,
    });
  }
  return knoten;
}

/**
 * Reiterknöpfe tragen vorn das Symbolzeichen (Privatbereich, U+E000–F8FF)
 * und „, “: aus „, Progress“ wird „Progress“.
 */
function bereinige(wert) {
  return wert.replace(/^[\s\p{Co}]*,\s*/u, '').replace(/[\p{Co}]/gu, '').trim();
}

/** Passt ein Knoten auf das Muster (Text oder Beschriftung)? */
function passt(knoten, muster) {
  const werte = [knoten.text, knoten.beschriftung].filter(Boolean).flatMap((w) => [w, bereinige(w)]);
  if (muster instanceof RegExp) return werte.some((w) => muster.test(w));
  return werte.includes(muster);
}

function finde(knoten, muster) {
  return knoten.filter((k) => k.sichtbar && passt(k, muster));
}

function beschreibe(muster) {
  return muster instanceof RegExp ? String(muster) : JSON.stringify(muster);
}

// ---------------------------------------------------------------- Gerät

class Geraet {
  constructor({ ablage } = {}) {
    this.ablage = ablage;
    this.alteAnimationen = null;
  }

  pruefeVerbindung() {
    const liste = adb(['devices']).split('\n').slice(1).filter((z) => /\tdevice\s*$/.test(z));
    if (liste.length === 0) throw new Error('Kein Gerät/Emulator verbunden (adb devices ist leer). Emulator starten: emulator -avd ThaiSpeaker_API36');
    const paket = adb(['shell', 'pm', 'list', 'packages', PAKET]);
    if (!paket.includes(PAKET)) throw new Error(`${PAKET} ist nicht installiert.`);
  }

  /** Animationen des Emulators aus (die App hält dann ihre Deko still). */
  animationenAus() {
    this.alteAnimationen = ANIMATIONEN.map((name) => adb(['shell', 'settings', 'get', 'global', name]).trim());
    for (const name of ANIMATIONEN) adb(['shell', 'settings', 'put', 'global', name, '0']);
  }

  /** Stellt den Zustand vor `animationenAus()` wieder her. */
  animationenZurueck() {
    if (!this.alteAnimationen) return;
    ANIMATIONEN.forEach((name, i) => {
      const alt = this.alteAnimationen[i];
      if (alt === 'null' || alt === '') adb(['shell', 'settings', 'delete', 'global', name], { still: true });
      else adb(['shell', 'settings', 'put', 'global', name, alt]);
    });
    this.alteAnimationen = null;
  }

  /** App beenden und frisch starten (Lernstände bleiben). */
  starteApp() {
    adb(['shell', 'am', 'force-stop', PAKET]);
    adb(['shell', 'am', 'start', '-W', '-n', AKTIVITAET]);
  }

  /** Löscht ALLE App-Daten (Lernstände, Sprachpakete). Nur mit --frisch. */
  loescheAppDaten() {
    adb(['shell', 'pm', 'clear', PAKET]);
  }

  /** Liest den Bildschirm. Wiederholt, solange Android „nicht ruhig“ meldet. */
  async lies() {
    for (let versuch = 0; versuch < 5; versuch++) {
      let xml = '';
      try {
        xml = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], { still: true });
      } catch {
        xml = '';
      }
      const start = xml.indexOf('<?xml');
      const ende = xml.lastIndexOf('</hierarchy>');
      if (start >= 0 && ende > start) {
        this.letztesXml = xml.slice(start, ende + '</hierarchy>'.length);
        return leseKnoten(this.letztesXml);
      }
      await schlafe(500);
    }
    throw new Error('Bildschirm nicht lesbar (uiautomator dump schlägt fehl; laufen Animationen?)');
  }

  /** Wartet, bis das Muster sichtbar ist, und gibt den ersten Treffer zurück. */
  async warteAuf(muster, { zeit = 15_000 } = {}) {
    const bis = Date.now() + zeit;
    for (;;) {
      const treffer = finde(await this.lies(), muster);
      if (treffer.length) return treffer[0];
      if (Date.now() > bis) throw new Error(`Nicht gefunden nach ${zeit / 1000} s: ${beschreibe(muster)}`);
      await schlafe(400);
    }
  }

  /** Wartet, bis das Muster verschwunden ist. */
  async warteBisWeg(muster, { zeit = 15_000 } = {}) {
    const bis = Date.now() + zeit;
    for (;;) {
      if (finde(await this.lies(), muster).length === 0) return;
      if (Date.now() > bis) throw new Error(`Noch sichtbar nach ${zeit / 1000} s: ${beschreibe(muster)}`);
      await schlafe(400);
    }
  }

  /** Ist das Muster JETZT sichtbar? (ohne zu warten) */
  async sieht(muster) {
    return finde(await this.lies(), muster).length > 0;
  }

  /** Erster Treffer aus einer Liste von Mustern (wartet bis `zeit`). */
  async warteAufEines(muster, { zeit = 15_000 } = {}) {
    const bis = Date.now() + zeit;
    for (;;) {
      const knoten = await this.lies();
      for (let i = 0; i < muster.length; i++) {
        const treffer = finde(knoten, muster[i]);
        if (treffer.length) return { index: i, knoten: treffer[0] };
      }
      if (Date.now() > bis) throw new Error(`Keines gefunden nach ${zeit / 1000} s: ${muster.map(beschreibe).join(' | ')}`);
      await schlafe(400);
    }
  }

  tippeAuf(x, y) {
    adb(['shell', 'input', 'tap', String(x), String(y)]);
  }

  /** Wartet auf das Muster und tippt es an. */
  async tippe(muster, optionen) {
    const k = await this.warteAuf(muster, optionen);
    this.tippeAuf(k.mitte.x, k.mitte.y);
    await schlafe(350);
    return k;
  }

  /**
   * Tippt einen Reiter der unteren Leiste an. Der Reitername kann auch
   * anderswo stehen („Learn“ auf den Sprachkarten), darum der unterste Treffer.
   */
  async tippeReiter(name) {
    const bis = Date.now() + 15_000;
    for (;;) {
      const treffer = finde(await this.lies(), name).filter((k) => k.klickbar).sort((a, b) => b.y1 - a.y1);
      if (treffer.length) {
        this.tippeAuf(treffer[0].mitte.x, treffer[0].mitte.y);
        await schlafe(500);
        return;
      }
      if (Date.now() > bis) throw new Error(`Reiter nicht gefunden: ${name}`);
      await schlafe(400);
    }
  }

  /**
   * Scrollt, bis das Muster gut sichtbar ist (nicht unter dem Reiterbalken).
   * Erst nach unten; am Listenende (Bildschirm ändert sich nicht mehr) nach oben.
   */
  async scrolleZu(muster, { versuche = 12 } = {}) {
    let richtung = 'hoch';
    let vorher = '';
    for (let i = 0; i <= versuche; i++) {
      const knoten = await this.lies();
      const treffer = finde(knoten, muster).filter((k) => k.y2 < this.hoehe(knoten) - 250 && k.y1 > 150);
      if (treffer.length) return treffer[0];
      const jetzt = zusammenfassung(knoten, 200);
      if (jetzt === vorher) {
        if (richtung === 'runter') break;
        richtung = 'runter';
      }
      vorher = jetzt;
      this.wische(richtung);
      await schlafe(500);
    }
    throw new Error(`Auch nach Scrollen nicht gefunden: ${beschreibe(muster)}`);
  }

  hoehe(knoten) {
    return Math.max(...knoten.map((k) => k.y2), 2000);
  }

  /** `hoch` = Inhalt nach oben schieben (also nach unten scrollen). */
  wische(richtung = 'hoch') {
    const [von, nach] = richtung === 'hoch' ? [1700, 700] : [700, 1700];
    adb(['shell', 'input', 'swipe', '540', String(von), '540', String(nach), '300']);
  }

  /** Langsames Wischen von y nach y (kein Schwung, landet genau). */
  wischeVon(vonY, nachY) {
    adb(['shell', 'input', 'swipe', '540', String(Math.round(vonY)), '540', String(Math.round(nachY)), '900']);
  }

  /** Text ins fokussierte Feld schreiben (ASCII; Leerzeichen erlaubt). */
  schreibe(text) {
    adb(['shell', 'input', 'text', text.replace(/ /g, '%s').replace(/(['"`$&|;<>()\\])/g, '\\$1')]);
  }

  zurueck() {
    adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  }

  /** Läuft die App noch im Vordergrund (kein Absturz)? */
  appImVordergrund() {
    const fokus = adb(['shell', 'dumpsys', 'window']).split('\n').find((z) => z.includes('mCurrentFocus')) || '';
    return fokus.includes(PAKET);
  }

  /** Bildschirmfoto + Elementliste in die Ablage (bei Fehlern). */
  sichere(name) {
    if (!this.ablage) return null;
    fs.mkdirSync(this.ablage, { recursive: true });
    const basis = path.join(this.ablage, name.replace(/[^\w.-]+/g, '_'));
    try {
      fs.writeFileSync(`${basis}.png`, adb(['exec-out', 'screencap', '-p'], { binaer: true }));
    } catch {}
    if (this.letztesXml) fs.writeFileSync(`${basis}.xml`, this.letztesXml);
    return basis;
  }

  /** Neue Absturz-/JS-Fehlerzeilen der App seit dem Start. */
  leereLog() {
    adb(['logcat', '-c'], { still: true });
  }

  fehlerImLog() {
    const log = adb(['logcat', '-d', '-v', 'brief', 'ReactNativeJS:E', 'AndroidRuntime:E', '*:S'], { still: true });
    return log
      .split('\n')
      .filter((z) => /^[EF]\//.test(z))
      .filter((z) => !/beginning of/.test(z));
  }
}

/** Kurzansicht des aktuellen Bildschirms (zum Erkunden und in Fehlermeldungen). */
function zusammenfassung(knoten, max = 60) {
  const zeilen = [];
  for (const k of knoten) {
    const t = bereinige(k.text || k.beschriftung);
    if (!t || !k.sichtbar) continue;
    zeilen.push(`${k.klickbar ? '*' : ' '} ${t.replace(/\s+/g, ' ').slice(0, 70)}  @${k.mitte.x},${k.mitte.y}`);
  }
  return zeilen.slice(0, max).join('\n');
}

module.exports = { Geraet, leseKnoten, finde, passt, bereinige, zusammenfassung, schlafe, PAKET, ADB };

// `node scripts/e2e/geraet.cjs` zeigt den aktuellen Bildschirm (zum Erkunden).
if (require.main === module) {
  (async () => {
    const g = new Geraet();
    console.log(zusammenfassung(await g.lies(), 200));
  })().catch((fehler) => {
    console.error(fehler.message);
    process.exit(1);
  });
}
