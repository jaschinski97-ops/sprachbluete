import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
// `Symbol` umbenannt: Unter dem eigenen Namen überdeckt es das eingebaute
// JavaScript-Symbol, das der React Compiler braucht (`Symbol.for`).
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Symbol as SvgSymbol,
  Use,
} from 'react-native-svg';

import { useScreenFocused, useSvgId } from './fx';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useNutzerAktiv } from '@/lib/aktivitaet';

/**
 * Kirschblüten-Szenen hinter den Reitern (23.10.2026, Nutzerwunsch „bei
 * jedem Reiter ein anderes Kirschblüten-Design“). Jede Szene hat Tag und
 * Nacht — der Modus folgt der Systemeinstellung — und eigene Bewegung:
 *
 * - `zweige` (Übersicht): zwei Blütenzweige, die sich im Wind wiegen.
 * - `trauerkirsche` (Lernen): hängende Blütenvorhänge, die im Wind wehen.
 * - `laternen` (Gespräch): Papierlaternen schwingen an einer Leine.
 * - `fluss` (Fortschritt): gemalter Fluss mit Brücke zwischen Kirschbäumen
 *   (lokal mit FLUX erzeugt), darüber Glitzern und treibende Blätter.
 * - `fuji` (Einstellungen): gemalter Fuji am See mit Mond oder Sonne,
 *   darüber ziehender Dunst und ein wiegender Zweig.
 *
 * Überall fallen Blütenblätter. Unsichtbare Reiter, „Bewegung reduzieren“,
 * Übungen (`ruhig`) und 45 s ohne Berührung (`lib/aktivitaet`) halten alles
 * an; dann stehen die Blätter still im Bild.
 * Alles liegt unter dem Inhalt und fängt keine Berührungen.
 */
export type SzenenArt = 'zweige' | 'trauerkirsche' | 'laternen' | 'fluss' | 'fuji';

/* ---------- Grundlagen ---------- */

/** Fester Zufall: dieselbe Szene bei jedem Start, ohne Flackern zwischen Renderings. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * Startet die Schleife 0 → 1 → 0 → 1 … — nach einer Pause genau dort, wo
 * sie stand (25.10.2026). Vorher lief `withRepeat` nach einer Pause nur noch
 * zwischen dem Haltepunkt und 1: Die Zweige zuckten an jeder Rundengrenze,
 * und die Blätter sprangen beim Aufwachen alle nach oben.
 */
function starteSchleife(wert: SharedValue<number>, dauer: number, verzug: number): void {
  const runde = withRepeat(
    withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: dauer, easing: Easing.linear })),
    -1,
    false
  );
  const stand = wert.get();
  if (stand > 0 && stand < 1) {
    wert.set(withSequence(withTiming(1, { duration: dauer * (1 - stand), easing: Easing.linear }), runde));
  } else {
    wert.set(withDelay(verzug, runde));
  }
}

/** Eine endlose Schleife 0 → 1, solange `aktiv`. */
function useSchleife(dauer: number, aktiv: boolean, verzug = 0): SharedValue<number> {
  const wert = useSharedValue(0);
  useEffect(() => {
    if (!aktiv) return;
    starteSchleife(wert, dauer, verzug);
    return () => cancelAnimation(wert);
  }, [aktiv, dauer, verzug, wert]);
  return wert;
}

/** Wiegen um den Ansatzpunkt: Grundwelle plus schnellere Böe wirkt natürlicher als gleichmäßiges Pendeln. */
function useWiegen(zeit: SharedValue<number>, grad: number, phase = 0) {
  return useAnimatedStyle(() => {
    const t = zeit.value * Math.PI * 2;
    return { transform: [{ rotate: `${grad * Math.sin(t + phase) + grad * 0.35 * Math.sin(3 * t + phase * 2)}deg` }] };
  });
}

/** Szenen-Farben, die nur Dekor sind (kein Text darauf) — je Tag und Nacht. */
function szenenFarben(nacht: boolean) {
  return nacht
    ? { dunst: '#D9EAFF', dunstStaerke: 0.22, glanz: '#D6F2FF', stamm: '#24161D', laterneA: '#E5483C', laterneB: '#FFB45E', glut: 0.7 }
    : { dunst: '#FFFFFF', dunstStaerke: 0.5, glanz: '#FFFFFF', stamm: '#5C3E37', laterneA: '#E4513E', laterneB: '#FFC27A', glut: 0.32 };
}

/** Bühne für Vollbild-Szenen: Bezugsmaß 375 × 812, unten ausgerichtet, füllt jede Größe. */
const VB_B = 375;
const VB_H = 812;
function useBuehne() {
  const { width, height } = useWindowDimensions();
  const s = Math.max(width / VB_B, height / VB_H);
  return { width, height, s, ox: (width - VB_B * s) / 2, oy: height - VB_H * s };
}

/* ---------- Blüten ---------- */

type Bluete = { x: number; y: number; scale: number; rotate: number; bud: boolean };
type Bokeh = { x: number; y: number; r: number; o: number };

/** Blüten um Ankerpunkte streuen (Koordinaten im jeweiligen Rahmen). */
function streueBlueten(anker: [number, number][], seed: number, jeAnker: number, streuung: number) {
  const rnd = seeded(seed);
  const blueten: Bluete[] = [];
  const bokeh: Bokeh[] = [];
  for (const [ax, ay] of anker) {
    for (let i = 0; i < jeAnker; i++) {
      blueten.push({
        x: ax + (rnd() - 0.5) * streuung,
        y: ay + (rnd() - 0.5) * streuung,
        scale: 0.65 + rnd() * 0.75,
        rotate: rnd() * 72,
        bud: rnd() < 0.18,
      });
    }
    bokeh.push({ x: ax + (rnd() - 0.5) * 40, y: ay + (rnd() - 0.5) * 40, r: 10 + rnd() * 18, o: 0.18 + rnd() * 0.22 });
  }
  return { blueten, bokeh };
}

/** Eine Kirschblüte: fünf gekerbte Blätter, dunklere Mitte, gelbe Staubgefäße. */
function BluetenSymbol({ id }: { id: string }) {
  const theme = useTheme();
  return (
    <SvgSymbol id={id} viewBox="-22 -22 44 44">
      {[0, 72, 144, 216, 288].map((winkel) => (
        <Path
          key={winkel}
          d="M0 0 C -8 -6, -8 -17, -2.6 -20 L 0 -16.5 L 2.6 -20 C 8 -17, 8 -6, 0 0 Z"
          fill={theme.blossom}
          stroke={theme.blossomEdge}
          strokeWidth={0.9}
          transform={`rotate(${winkel})`}
        />
      ))}
      <Circle r={3.6} fill={theme.blossomCore} />
      {[36, 108, 180, 252, 324].map((winkel) => (
        <Circle key={winkel} cx={0} cy={-6.5} r={1} fill="#FFE08A" transform={`rotate(${winkel})`} />
      ))}
    </SvgSymbol>
  );
}

/** Blüten (oder Knospen) an ihren Plätzen, `groesse` skaliert das Symbol. */
function Blueten({ liste, symbolId, groesse = 0.55 }: { liste: Bluete[]; symbolId: string; groesse?: number }) {
  const theme = useTheme();
  return (
    <>
      {liste.map((b, i) =>
        b.bud ? (
          <Circle key={i} cx={b.x} cy={b.y} r={4.2 * b.scale * (groesse / 0.55)} fill={theme.blossomEdge} />
        ) : (
          <Use
            key={i}
            href={`#${symbolId}`}
            x={b.x - 22 * b.scale * groesse}
            y={b.y - 22 * b.scale * groesse}
            width={44 * b.scale * groesse}
            height={44 * b.scale * groesse}
            transform={`rotate(${b.rotate} ${b.x} ${b.y})`}
          />
        )
      )}
    </>
  );
}

/* ---------- Zweige (Übersicht, auch Gespräch und Fuji) ---------- */

/** Rechter Hauptzweig: ragt von oben rechts in den Himmel (Rahmen 320 × 270). */
const ZWEIG_RECHTS = {
  breite: 320,
  hoehe: 270,
  aeste: [
    { d: 'M330 22 C 280 34, 238 62, 200 104 C 170 136, 136 150, 92 160', w: 8 },
    { d: 'M256 50 C 246 86, 252 118, 272 152', w: 5 },
    { d: 'M206 98 C 194 78, 172 68, 148 70', w: 4 },
  ],
  ...streueBlueten(
    [[304, 30], [280, 38], [258, 52], [238, 66], [218, 84], [198, 106], [176, 126], [152, 140], [126, 150], [100, 158],
     [250, 84], [256, 114], [268, 146], [186, 82], [160, 71]],
    11, 3, 30
  ),
};

/** Linker, kleinerer Zweig (Rahmen 230 × 150). */
const ZWEIG_LINKS = {
  breite: 230,
  hoehe: 150,
  aeste: [
    { d: 'M-10 30 C 36 40, 80 58, 122 88 C 144 104, 168 110, 196 112', w: 7 },
    { d: 'M74 54 C 84 30, 104 18, 128 14', w: 4 },
  ],
  ...streueBlueten([[18, 34], [44, 42], [70, 54], [96, 70], [120, 86], [146, 100], [174, 108], [92, 36], [118, 18]], 29, 3, 26),
};

type Zweig = typeof ZWEIG_RECHTS;

/**
 * Ein Zweig in zwei Lagen: hinten Ast und weiche Lichtflecken, vorn die
 * Blüten. Beide wiegen sich um den Ansatzpunkt am Bildrand, leicht versetzt.
 */
function BluetenZweig({
  zweig,
  seite,
  massstab,
  dauer,
  aktiv,
  oben = 0,
}: {
  zweig: Zweig;
  seite: 'links' | 'rechts';
  massstab: number;
  dauer: number;
  aktiv: boolean;
  oben?: number;
}) {
  const theme = useTheme();
  const blueteId = useSvgId('bluete');
  const schimmerId = useSvgId('schimmer');
  const zeit = useSchleife(dauer, aktiv);
  const richtung = seite === 'rechts' ? 1 : -1;
  const ast = useWiegen(zeit, 1.4 * richtung);
  const blueten = useWiegen(zeit, 2.1 * richtung, 0.4);

  const breite = zweig.breite * massstab;
  const hoehe = zweig.hoehe * massstab;
  const lage = [
    styles.absolut,
    { width: breite, height: hoehe, transformOrigin: seite === 'rechts' ? 'top right' : 'top left' } as ViewStyle,
    seite === 'rechts' ? { top: oben - 26 * massstab, right: -14 * massstab } : { top: oben - 34 * massstab, left: -34 * massstab },
  ];
  const rahmen = `0 0 ${zweig.breite} ${zweig.hoehe}`;

  return (
    <>
      <Animated.View style={[lage, ast]}>
        <Svg width={breite} height={hoehe} viewBox={rahmen}>
          {/* Weiche Lichtflecken (Bokeh): zum Rand hin unsichtbar. */}
          <Defs>
            <RadialGradient id={schimmerId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={theme.blossom} stopOpacity={0.9} />
              <Stop offset="0.6" stopColor={theme.blossom} stopOpacity={0.35} />
              <Stop offset="1" stopColor={theme.blossom} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {zweig.bokeh.map((b, i) => (
            <Circle key={i} cx={b.x} cy={b.y} r={b.r * 1.3} fill={`url(#${schimmerId})`} opacity={b.o * 1.5} />
          ))}
          {zweig.aeste.map((a, i) => (
            <Path key={i} d={a.d} stroke={theme.branch} strokeWidth={a.w} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
      </Animated.View>
      <Animated.View style={[lage, blueten]}>
        <Svg width={breite} height={hoehe} viewBox={rahmen}>
          <Defs>
            <BluetenSymbol id={blueteId} />
          </Defs>
          <Blueten liste={zweig.blueten} symbolId={blueteId} />
        </Svg>
      </Animated.View>
    </>
  );
}

/* ---------- Trauerkirsche (Lernen) ---------- */

type Strang = { d: string; blueten: Bluete[] };

/** Ein hängender Strang: Quadratische Kurve vom oberen Rand, Blüten entlang. */
function strang(x: number, laenge: number, drift: number, seed: number): Strang {
  const rnd = seeded(seed);
  const p0 = [x, -6];
  const p1 = [x + drift * 0.15, laenge * 0.55];
  const p2 = [x + drift, laenge];
  const blueten: Bluete[] = [];
  for (let t = 0.1; t <= 1.001; t += 0.06) {
    const u = 1 - t;
    const px = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const py = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    blueten.push({ x: px + (rnd() - 0.5) * 9, y: py + (rnd() - 0.5) * 6, scale: 0.55 + rnd() * 0.5, rotate: rnd() * 72, bud: rnd() < 0.22 });
    if (rnd() < 0.5) blueten.push({ x: px + (rnd() - 0.5) * 14, y: py + (rnd() - 0.5) * 8, scale: 0.45 + rnd() * 0.4, rotate: rnd() * 72, bud: rnd() < 0.3 });
  }
  return { d: `M${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`, blueten };
}

const VORHANG: [number, number, number][] = [[-4, 312, 16], [16, 280, 14], [36, 248, 12], [56, 208, 10], [76, 168, 8], [96, 126, 6], [116, 92, 4]];
// Links kürzer: Dort stehen Titel und Untertitel.
const STRAENGE_LINKS = VORHANG.map(([x, l, d], i) => strang(x - 10, l * 0.55, d, 300 + i));
const STRAENGE_RECHTS = VORHANG.map(([x, l, d], i) => strang(VB_B - x, l - 14 * (i % 2), -d, 400 + i));

function Vorhang({ straenge, seite, aktiv }: { straenge: Strang[]; seite: 'links' | 'rechts'; aktiv: boolean }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const blueteId = useSvgId('vorhang');
  const m = width / VB_B;
  const zeit = useSchleife(seite === 'links' ? 7600 : 8400, aktiv);
  const richtung = seite === 'links' ? -1 : 1;
  const lageA = useWiegen(zeit, 2.4 * richtung);
  const lageB = useWiegen(zeit, 3.2 * richtung, 1.3);
  const ursprung = { transformOrigin: seite === 'links' ? `${40 * m}px 0px` : `${width - 40 * m}px 0px` } as ViewStyle;
  const hoehe = 340 * m;
  const lage = (teil: Strang[], index: number) => (
    <Svg width={width} height={hoehe} viewBox={`0 0 ${VB_B} 340`}>
      <Defs>
        <BluetenSymbol id={`${blueteId}${index}`} />
      </Defs>
      {teil.map((s, i) => (
        <Path key={i} d={s.d} stroke={theme.branch} strokeWidth={1.6} fill="none" opacity={0.75} />
      ))}
      {teil.map((s, i) => (
        <Blueten key={`b${i}`} liste={s.blueten} symbolId={`${blueteId}${index}`} groesse={0.32} />
      ))}
    </Svg>
  );
  return (
    <>
      <Animated.View style={[styles.oben, { height: hoehe }, ursprung, lageA]}>{lage(straenge.filter((_, i) => i % 2 === 0), 0)}</Animated.View>
      <Animated.View style={[styles.oben, { height: hoehe }, ursprung, lageB]}>{lage(straenge.filter((_, i) => i % 2 === 1), 1)}</Animated.View>
    </>
  );
}

function TrauerkirscheSzene({ aktiv }: { aktiv: boolean }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const m = width / VB_B;
  return (
    <>
      <Vorhang straenge={STRAENGE_LINKS} seite="links" aktiv={aktiv} />
      <Vorhang straenge={STRAENGE_RECHTS} seite="rechts" aktiv={aktiv} />
      {/* Der tragende Ast am oberen Rand — ruhig, die Stränge wehen. */}
      <Svg style={styles.oben} width={width} height={30 * m} viewBox={`0 0 ${VB_B} 30`}>
        <Path d="M-10 6 C 30 2, 80 10, 130 4" stroke={theme.branch} strokeWidth={7} strokeLinecap="round" fill="none" />
        <Path d="M245 4 C 290 10, 340 2, 385 6" stroke={theme.branch} strokeWidth={7} strokeLinecap="round" fill="none" />
      </Svg>
    </>
  );
}

/* ---------- Laternen (Gespräch) ---------- */

/** Punkt auf der Leine (quadratische Kurve) an der Stelle t. */
function leine(t: number): [number, number] {
  const p0 = [40, -4];
  const p1 = [250, 140];
  const p2 = [390, 8];
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

const LATERNEN = [
  { t: 0.42, dauer: 3900, phase: 0, groesse: 0.85 },
  { t: 0.6, dauer: 4400, phase: 1.1, groesse: 1 },
  { t: 0.76, dauer: 4100, phase: 2.3, groesse: 0.92 },
  { t: 0.9, dauer: 4700, phase: 0.6, groesse: 0.8 },
];

function Laterne({ x, y, groesse, dauer, phase, aktiv }: { x: number; y: number; groesse: number; dauer: number; phase: number; aktiv: boolean }) {
  const f = szenenFarben(useColorScheme() === 'dark');
  const { width } = useWindowDimensions();
  const m = (width / VB_B) * groesse;
  const koerperId = useSvgId('laterne');
  const glutId = useSvgId('glut');
  const zeit = useSchleife(dauer, aktiv);
  const schwingen = useAnimatedStyle(() => ({
    transform: [{ rotate: `${4 * Math.sin(zeit.value * Math.PI * 2 + phase)}deg` }],
  }));
  const b = 70 * m;
  const h = 100 * m;
  return (
    <Animated.View
      style={[styles.absolut, { left: x * (width / VB_B) - b / 2, top: y * (width / VB_B), width: b, height: h, transformOrigin: 'top center' } as ViewStyle, schwingen]}>
      <Svg width={b} height={h} viewBox="0 0 70 100">
        <Defs>
          <RadialGradient id={glutId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={f.laterneB} stopOpacity={f.glut} />
            <Stop offset="1" stopColor={f.laterneB} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={koerperId} cx="45%" cy="42%" r="60%">
            <Stop offset="0" stopColor={f.laterneB} />
            <Stop offset="1" stopColor={f.laterneA} />
          </RadialGradient>
        </Defs>
        <Circle cx={35} cy={46} r={34} fill={`url(#${glutId})`} />
        <Line x1={35} y1={0} x2={35} y2={14} stroke={f.stamm} strokeWidth={1.4} />
        <Rect x={24} y={14} width={22} height={6} rx={2} fill={f.stamm} />
        <Ellipse cx={35} cy={44} rx={17} ry={23} fill={`url(#${koerperId})`} />
        {[-10, -4, 4, 10].map((dx) => (
          <Ellipse key={dx} cx={35} cy={44} rx={Math.abs(dx)} ry={23} fill="none" stroke={f.laterneA} strokeWidth={0.8} opacity={0.55} />
        ))}
        {[30, 38, 46, 54, 60].map((yy) => (
          <Line key={yy} x1={20} y1={yy} x2={50} y2={yy} stroke={f.laterneA} strokeWidth={0.6} opacity={0.4} />
        ))}
        <Rect x={24} y={66} width={22} height={6} rx={2} fill={f.stamm} />
        <Line x1={35} y1={72} x2={35} y2={86} stroke={f.laterneA} strokeWidth={2} />
        <Rect x={32} y={84} width={6} height={10} rx={2} fill={f.laterneA} />
      </Svg>
    </Animated.View>
  );
}

function LaternenSzene({ aktiv }: { aktiv: boolean }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const m = width / VB_B;
  return (
    <>
      <BluetenZweig zweig={ZWEIG_LINKS} seite="links" massstab={m * 0.72} dauer={8300} aktiv={aktiv} />
      <BluetenZweig zweig={ZWEIG_RECHTS} seite="rechts" massstab={m * 0.58} dauer={6900} aktiv={aktiv} />
      <Svg style={styles.oben} width={width} height={150 * m} viewBox={`0 0 ${VB_B} 150`}>
        <Path d="M40 -4 Q 250 140 390 8" stroke={theme.branch} strokeWidth={1.6} fill="none" opacity={0.85} />
      </Svg>
      {LATERNEN.map((l, i) => {
        const [x, y] = leine(l.t);
        return <Laterne key={i} x={x} y={y - 2} groesse={l.groesse} dauer={l.dauer} phase={l.phase} aktiv={aktiv} />;
      })}
    </>
  );
}

/* ---------- Fluss (Fortschritt) ---------- */

/**
 * Gemalter Hintergrund (23.10.2026): Mit FLUX.2 klein lokal über ComfyUI
 * erzeugt, nah am Anime-Vorbild des Nutzers — Fluss mit Holzbrücke zwischen
 * blühenden Kirschbäumen, nachts mit Mond, tags mit Sonne. Die Bewegung
 * kommt darüber aus Code: Glitzern und treibende Blätter auf dem Wasser,
 * fallende Blätter und ein langsamer Zoom. Die Koordinaten beziehen sich
 * auf die Bühne 375 × 812 (Brücke bei y ≈ 490, Fluss mittig darunter).
 */
const GEMAELDE = {
  fluss: { nacht: require('../../assets/images/szenen/fluss-nacht.webp'), tag: require('../../assets/images/szenen/fluss-tag.webp') },
  fuji: { nacht: require('../../assets/images/szenen/fuji-nacht.webp'), tag: require('../../assets/images/szenen/fuji-tag.webp') },
};

/** Ein Gemälde als Hintergrund, das sich kaum merklich heranzoomt und wieder zurückgeht. */
function Gemaelde({ bild, aktiv }: { bild: keyof typeof GEMAELDE; aktiv: boolean }) {
  const nacht = useColorScheme() === 'dark';
  // Fenstergröße wie die Bühne der Overlays: Bild und Glitzern liegen deckungsgleich.
  const { width, height } = useWindowDimensions();
  const zeit = useSchleife(30000, aktiv);
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: 1.02 + 0.03 * (0.5 - 0.5 * Math.cos(zeit.value * Math.PI * 2)) }] }));
  return (
    <Animated.View style={[styles.absolut, { left: 0, top: 0, width, height, transformOrigin: '50% 60%' } as ViewStyle, zoom]}>
      <Image
        source={nacht ? GEMAELDE[bild].nacht : GEMAELDE[bild].tag}
        style={{ width, height }}
        contentFit="cover"
        contentPosition="bottom"
        transition={400}
        accessible={false}
      />
    </Animated.View>
  );
}

/** Lichtstreifen auf dem Wasser, die aufblitzen und leicht wandern. */
const GLITZER = [[188, 520, 20], [182, 560, 26], [196, 604, 32], [176, 652, 38], [202, 702, 44], [186, 752, 52], [198, 796, 58]];

function Glitzer({ x, y, w, index, aktiv }: { x: number; y: number; w: number; index: number; aktiv: boolean }) {
  const f = szenenFarben(useColorScheme() === 'dark');
  const { s, ox, oy } = useBuehne();
  const zeit = useSchleife(2600 + index * 430, aktiv, index * 210);
  const stil = useAnimatedStyle(() => {
    const t = zeit.value * Math.PI * 2;
    return { opacity: 0.12 + 0.45 * (0.5 + 0.5 * Math.sin(t)), transform: [{ translateX: 5 * s * Math.sin(t + index) }] };
  });
  return (
    <Animated.View
      style={[styles.absolut, { left: ox + (x - w / 2) * s, top: oy + y * s, width: w * s, height: 2 * s, borderRadius: s, backgroundColor: f.glanz }, stil]}
    />
  );
}

/** Blütenblätter, die auf dem Wasser flussabwärts treiben und dabei näher kommen. */
const TREIBGUT = (() => {
  const rnd = seeded(808);
  return Array.from({ length: 9 }, (_, i) => ({ seite: (rnd() - 0.5) * 70, dauer: 11000 + rnd() * 7000, verzug: i * 1300, dreh: rnd() * 360 }));
})();

function Treibblatt({ seite, dauer, verzug, dreh, aktiv }: { seite: number; dauer: number; verzug: number; dreh: number; aktiv: boolean }) {
  const theme = useTheme();
  const { s, ox, oy } = useBuehne();
  const weg = useSchleife(dauer, aktiv, verzug);
  const stil = useAnimatedStyle(() => {
    const p = weg.value;
    const y = 506 + p * 320;
    const x = 188 + seite * (0.25 + 0.75 * p) + Math.sin(p * Math.PI * 4) * 6;
    const g = 0.45 + p * 1.1;
    return {
      opacity: p < 0.05 ? p * 20 : p > 0.9 ? (1 - p) * 10 : 0.95,
      transform: [{ translateX: ox + x * s }, { translateY: oy + y * s }, { scale: g }, { rotate: `${dreh + p * 90}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.blatt, stil]}>
      <Svg width={14 * s} height={14 * s} viewBox="-8 -8 16 16">
        <Path d="M0 7 C -6 2, -6 -5, -2 -7 L 0 -5 L 2 -7 C 6 -5, 6 2, 0 7 Z" fill={theme.petal} stroke={theme.blossomEdge} strokeWidth={0.6} />
      </Svg>
    </Animated.View>
  );
}

/** Dunst, der langsam über die Ferne zieht. */
function Dunst({ y, hoehe, dauer, weite, aktiv }: { y: number; hoehe: number; dauer: number; weite: number; aktiv: boolean }) {
  const f = szenenFarben(useColorScheme() === 'dark');
  const { width, s, oy } = useBuehne();
  const id = useSvgId('nebel');
  const zeit = useSchleife(dauer, aktiv);
  const stil = useAnimatedStyle(() => ({ transform: [{ translateX: weite * s * Math.sin(zeit.value * Math.PI * 2) }] }));
  return (
    <Animated.View style={[styles.absolut, { left: -40 * s, top: oy + (y - hoehe / 2) * s, width: width + 80 * s, height: hoehe * s }, stil]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={f.dunst} stopOpacity={f.dunstStaerke * 1.2} />
            <Stop offset="1" stopColor={f.dunst} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={30} cy={5} rx={34} ry={5} fill={`url(#${id})`} />
        <Ellipse cx={72} cy={5} rx={30} ry={4.5} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function FlussSzene({ aktiv }: { aktiv: boolean }) {
  return (
    <>
      <Gemaelde bild="fluss" aktiv={aktiv} />
      {GLITZER.map(([x, y, w], i) => (
        <Glitzer key={i} x={x} y={y} w={w} index={i} aktiv={aktiv} />
      ))}
      {TREIBGUT.map((t, i) => (
        <Treibblatt key={i} {...t} aktiv={aktiv} />
      ))}
    </>
  );
}

/* ---------- Fuji (Einstellungen) ---------- */

/** Gemalter Fuji am See (lokal mit FLUX erzeugt), darüber ziehender Dunst und ein wiegender Zweig. */
function FujiSzene({ aktiv }: { aktiv: boolean }) {
  const { width } = useWindowDimensions();
  return (
    <>
      <Gemaelde bild="fuji" aktiv={aktiv} />
      <Dunst y={540} hoehe={40} dauer={18000} weite={22} aktiv={aktiv} />
      <Dunst y={600} hoehe={34} dauer={14000} weite={-18} aktiv={aktiv} />
      <BluetenZweig zweig={ZWEIG_LINKS} seite="links" massstab={(width / VB_B) * 0.95} dauer={8300} aktiv={aktiv} />
    </>
  );
}

/* ---------- Fallende Blätter (alle Szenen) ---------- */

type BlattWerte = { x: number; dauer: number; verzug: number; welle: number; weite: number; drift: number; dreh: number; flip: number; groesse: number; ruhe: number };

/** Feste Flugbahnen der Blätter: Start, Tempo, Taumeln, Drehung. */
function blattWerte(anzahl: number): BlattWerte[] {
  const rnd = seeded(101);
  return Array.from({ length: anzahl }, (_, i) => ({
    x: 0.08 + rnd() * 0.84,
    dauer: 9000 + rnd() * 8000,
    verzug: i * 900 + rnd() * 1200,
    welle: 1 + rnd() * 1.5,
    weite: 14 + rnd() * 26,
    drift: -30 - rnd() * 60,
    dreh: 160 + rnd() * 320,
    flip: 1 + rnd() * 2,
    groesse: 0.7 + rnd() * 0.7,
    ruhe: rnd(),
  }));
}

/** Ein fallendes Blütenblatt: sinkt, taumelt seitlich, dreht und kippt in 3D. */
function FallendesBlatt({ werte, aktiv }: { werte: BlattWerte; aktiv: boolean }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const weg = useSharedValue(werte.ruhe);

  useEffect(() => {
    if (!aktiv) return;
    // Läuft vom stillen Platz (`ruhe`) bzw. Haltepunkt aus weiter.
    starteSchleife(weg, werte.dauer, werte.verzug);
    return () => cancelAnimation(weg);
  }, [aktiv, weg, werte.dauer, werte.verzug]);

  const stil = useAnimatedStyle(() => {
    const p = weg.value;
    const t = p * Math.PI * 2;
    return {
      opacity: p < 0.04 ? p * 25 : p > 0.94 ? (1 - p) * 16 : 1,
      transform: [
        { perspective: 400 },
        { translateX: werte.x * width + Math.sin(t * werte.welle) * werte.weite + p * werte.drift },
        { translateY: -30 + p * (height + 60) },
        { rotate: `${p * werte.dreh}deg` },
        { rotateY: `${Math.sin(t * werte.flip) * 65}deg` },
      ],
    };
  });

  const g = 14 * werte.groesse;
  return (
    <Animated.View style={[styles.blatt, stil]}>
      <Svg width={g} height={g} viewBox="-8 -8 16 16">
        <Path d="M0 7 C -6 2, -6 -5, -2 -7 L 0 -5 L 2 -7 C 6 -5, 6 2, 0 7 Z" fill={theme.petal} stroke={theme.blossomEdge} strokeWidth={0.6} />
      </Svg>
    </Animated.View>
  );
}

const BLAETTER_JE_SZENE: Record<SzenenArt, number> = { zweige: 16, trauerkirsche: 18, laternen: 12, fluss: 20, fuji: 10 };

/* ---------- Szene ---------- */

/** Himmel mit Licht: Tag Sonne oben links, Nacht Mondschein wie im Anime-Vorbild. */
function Himmel() {
  const theme = useTheme();
  const nacht = useColorScheme() === 'dark';
  const himmelId = useSvgId('himmel');
  const lichtId = useSvgId('licht');
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={himmelId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.skyTop} />
          <Stop offset="0.5" stopColor={theme.skyMid} />
          <Stop offset="1" stopColor={theme.skyBottom} />
        </LinearGradient>
        <RadialGradient id={lichtId} cx={nacht ? '16%' : '12%'} cy={nacht ? '44%' : '6%'} r={nacht ? '62%' : '70%'}>
          <Stop offset="0" stopColor={theme.skyGlow} stopOpacity={nacht ? 0.42 : 0.95} />
          <Stop offset="0.35" stopColor={theme.skyGlow} stopOpacity={nacht ? 0.14 : 0.35} />
          <Stop offset="1" stopColor={theme.skyGlow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${himmelId})`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${lichtId})`} />
    </Svg>
  );
}

export function SakuraBackground({ szene = 'zweige', ruhig = false }: { szene?: SzenenArt; ruhig?: boolean }) {
  const reduce = useReducedMotion();
  const sichtbar = useScreenFocused();
  const { width } = useWindowDimensions();
  const massstab = Math.max(1, Math.min(1.6, width / VB_B));
  // `ruhig` (25.10.2026): während Übungen steht die Szene still — sie lief
  // dort vorher dauerhaft mit 10–20 Blättern und wiegenden Zweigen.
  // Und nur, solange jemand die App benutzt (Akku, `lib/aktivitaet`).
  const nutzerAktiv = useNutzerAktiv();
  const aktiv = !reduce && sichtbar && !ruhig && nutzerAktiv;
  const blaetter = useMemo(() => blattWerte(BLAETTER_JE_SZENE[szene]), [szene]);

  return (
    <View pointerEvents="none" style={styles.szene}>
      <Himmel />
      {szene === 'fluss' ? <FlussSzene aktiv={aktiv} /> : null}
      {szene === 'fuji' ? <FujiSzene aktiv={aktiv} /> : null}
      {blaetter.map((werte, i) => (
        <FallendesBlatt key={i} werte={werte} aktiv={aktiv} />
      ))}
      {szene === 'zweige' ? (
        <>
          <BluetenZweig zweig={ZWEIG_LINKS} seite="links" massstab={massstab * 0.8} dauer={8300} aktiv={aktiv} />
          <BluetenZweig zweig={ZWEIG_RECHTS} seite="rechts" massstab={massstab} dauer={6900} aktiv={aktiv} />
        </>
      ) : null}
      {szene === 'trauerkirsche' ? <TrauerkirscheSzene aktiv={aktiv} /> : null}
      {szene === 'laternen' ? <LaternenSzene aktiv={aktiv} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  szene: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  absolut: {
    position: 'absolute',
  },
  oben: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  blatt: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
