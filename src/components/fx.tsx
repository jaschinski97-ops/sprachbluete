import * as ExpoRouter from 'expo-router';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeInRight,
  FlipInEasyY,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { useNutzerAktiv } from '@/lib/aktivitaet';

/**
 * Effekt-Bausteine der Oberfläche (seit 23.10.2026 „Kirschblüte“, Tag und
 * Nacht nach Systemeinstellung): Blütenszene, Verlaufsfläche, Pinselstrich,
 * federnder Druck, gestaffeltes Einblenden und Glanzlicht. Alles respektiert
 * „Bewegung reduzieren“ des Systems — dann steht die Szene still und nichts
 * federt.
 *
 * Bewusst EINE Datei: Die Bausteine teilen Feder- und Zeitwerte, und jeder
 * Bildschirm braucht mehrere davon.
 */

const FEDER = { damping: 16, stiffness: 260, mass: 0.6 } as const;

/**
 * Ist der Bildschirm gerade sichtbar? Jeder Reiter hat seine eigene Szene;
 * unsichtbare Reiter pausieren sie (Akku). Ohne Navigations-Kontext (Tests
 * mit teilweise ersetztem Router) gilt „sichtbar“. Die Wahl fällt einmal beim
 * Laden des Moduls, die Hook-Reihenfolge bleibt also stabil.
 */
export const useScreenFocused: () => boolean =
  typeof ExpoRouter.useIsFocused === 'function' ? ExpoRouter.useIsFocused : () => true;

/**
 * Weicher Schein um Text. Farbe, Versatz und Radius stehen absichtlich in
 * EINEM Objekt: react-native-web baut den CSS-Schatten je Stilobjekt, und
 * auf zwei Objekte verteilt (Radius im StyleSheet, Farbe inline) entstand
 * im Web gar kein Schatten (23.10.2026). Nativ wirkte es, weil RN den
 * Stil vorher zusammenführt.
 */
export function textGlow(color: string, radius: number): TextStyle {
  return { textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: radius };
}

/** SVG-IDs müssen im ganzen Dokument eindeutig sein (Web) — useId ohne Doppelpunkte. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Pinselstrich unter dem Seitentitel — im Verlauf der Hauptknöpfe. */
export function BrushStroke({ width = 78 }: { width?: number }) {
  const theme = useTheme();
  const id = useSvgId('pinsel');
  return (
    <Svg width={width} height={12} viewBox="0 0 78 12">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={theme.gradientStart} />
          <Stop offset="1" stopColor={theme.gradientEnd} />
        </LinearGradient>
      </Defs>
      <Path d="M3 8 C 20 2, 44 10, 75 4" stroke={`url(#${id})`} strokeWidth={4.5} strokeLinecap="round" fill="none" />
      <Path d="M8 9.5 C 26 5.5, 48 11, 68 7" stroke={`url(#${id})`} strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.6} />
    </Svg>
  );
}

/* ---------- Verlauf ---------- */

/** Füllt den Elternrahmen mit dem Hauptverlauf (Violett → Türkis), diagonal. */
export function GradientFill({ radius = 0, from, to }: { radius?: number; from?: string; to?: string }) {
  const theme = useTheme();
  const id = useSvgId('grad');
  const start = from ?? theme.gradientStart;
  const ende = to ?? theme.gradientEnd;
  // iPhone (28.10.2026): Das SVG mit 100 % Größe malte den Verlauf nur als
  // Streifen oben, das Glanzlicht blieb als weißer Block stehen. Auf dem
  // Gerät zeichnet ihn deshalb die View selbst; das Web behält das SVG.
  if (Platform.OS !== 'web') {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, experimental_backgroundImage: `linear-gradient(to bottom right, ${start}, ${ende})` },
        ]}
      />
    );
  }
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={start} />
          <Stop offset="1" stopColor={ende} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Ein Glanzlicht, das alle paar Sekunden schräg über die Fläche wandert —
 * für den einen wichtigsten Knopf eines Bildschirms. Der Elternrahmen
 * braucht `overflow: 'hidden'`.
 *
 * Akku (25.10.2026): bewegt per `translateX` statt über `left` (das zwang den
 * Browser zu einem Layout je Bild), zwischen zwei Durchläufen läuft keine
 * Animationsschleife mehr, sondern nur ein Zeitgeber, und bei ruhendem
 * Nutzer (`lib/aktivitaet`) steht es ganz.
 */
export function Shine({ every = 4200 }: { every?: number }) {
  const reduce = useReducedMotion();
  const sichtbar = useScreenFocused();
  const nutzerAktiv = useNutzerAktiv();
  const x = useSharedValue(-1);
  const breite = useSharedValue(0);
  const laeuft = !reduce && sichtbar && nutzerAktiv;
  useEffect(() => {
    if (!laeuft) return;
    const durchlauf = () => {
      x.set(-1);
      x.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    };
    const uhr = setInterval(durchlauf, every + 1100);
    return () => {
      clearInterval(uhr);
      cancelAnimation(x);
      x.set(-1);
    };
  }, [every, laeuft, x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: breite.value * (-0.4 + 1.4 * ((x.value + 1) / 2)) }, { skewX: '-20deg' }],
  }));
  if (reduce) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => breite.set(event.nativeEvent.layout.width)}>
      <Animated.View style={[styles.shine, style]}>
        <GradientFill from="rgba(255,255,255,0)" to="rgba(255,255,255,0.45)" />
      </Animated.View>
    </View>
  );
}

/* ---------- Druck ---------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Wie stark der Druck einsinkt (1 = gar nicht). */
  scaleTo?: number;
};

/** Pressable mit federndem Einsinken statt Durchsichtigkeit. */
export function PressableScale({ style, scaleTo = 0.96, onPressIn, onPressOut, disabled, ...rest }: PressableScaleProps) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        if (!reduce) scale.set(withSpring(scaleTo, FEDER));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        scale.set(withSpring(1, FEDER));
        onPressOut?.(event);
      }}
      style={[style, animated, disabled ? styles.disabled : null]}
    />
  );
}

/**
 * Dieselbe Feder für Fälle, in denen das Pressable seinen Style nicht behält
 * (expo-routers `Link asChild` ersetzt ihn): Das Pressable bekommt die
 * Handler, ein inneres `Animated.View` den Style.
 */
export function usePressScale(scaleTo = 0.97) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduce) scale.set(withSpring(scaleTo, FEDER));
    },
    onPressOut: () => {
      scale.set(withSpring(1, FEDER));
    },
  };
}

/* ---------- Einblenden ---------- */

/**
 * Blendet seinen Inhalt kurz von unten ein; `index` staffelt Geschwister
 * (55 ms je Stufe, höchstens zehn Stufen). Bewusst kurz und ohne Feder:
 * Beim ersten Laden ist der JS-Faden beschäftigt, eine lange Animation
 * ließe den Inhalt sichtbar spät erscheinen.
 */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.delay(Math.min(index, 10) * 55).duration(360).easing(Easing.out(Easing.cubic))}
      style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * Karteikarten-Übergang: Eine neue Karte gleitet von rechts herein, beim
 * Aufdecken dreht sie sich um die senkrechte Achse. Der Schlüssel aus Karte
 * und Zustand baut den Inhalt dafür jeweils neu auf.
 */
export function CardTransition({ cardKey, revealed, children }: { cardKey: string; revealed: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const entering = reduce
    ? undefined
    : revealed
      ? FlipInEasyY.duration(460)
      : FadeInRight.duration(320).easing(Easing.out(Easing.cubic));
  return (
    <Animated.View key={`${cardKey}:${revealed ? 'b' : 'a'}`} entering={entering}>
      {children}
    </Animated.View>
  );
}

/** Fortschrittsbalken mit Verlauf, der weich auf seinen neuen Stand wächst. */
export function GradientProgress({ value, height = 8 }: { value: number; height?: number }) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const breite = useSharedValue(Math.max(0, Math.min(1, value)));
  useEffect(() => {
    const ziel = Math.max(0, Math.min(1, value));
    breite.set(reduce ? ziel : withTiming(ziel, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [breite, reduce, value]);
  const fill = useAnimatedStyle(() => ({ width: `${breite.value * 100}%` as `${number}%` }));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.backgroundSelected }]}>
      <Animated.View
        style={[styles.fill, { borderRadius: height / 2, boxShadow: `0 0 12px ${theme.gradientStart}88` }, fill]}>
        <GradientFill radius={height / 2} />
      </Animated.View>
    </View>
  );
}

/**
 * Zählt eine Kennzahl beim Erscheinen von 0 auf ihren Wert hoch („42“,
 * „87 %“). Text ohne führende Zahl („–“) steht sofort da.
 */
export function useCountUp(text: string, duration = 700): string {
  const reduce = useReducedMotion();
  const match = /^(\d+)(.*)$/s.exec(text);
  const ziel = match ? Number(match[1]) : null;
  const rest = match ? match[2] : '';
  const animiert = ziel !== null && ziel > 0 && !reduce;
  const [wert, setWert] = useState(0);
  useEffect(() => {
    if (!animiert || ziel === null) return;
    let frame = 0;
    const start = Date.now();
    const schritt = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setWert(Math.round(ziel * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(schritt);
    };
    frame = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(frame);
  }, [animiert, duration, ziel]);
  return animiert ? `${wert}${rest}` : text;
}

const styles = StyleSheet.create({
  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '35%',
  },
  disabled: {
    opacity: 0.45,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    overflow: 'hidden',
  },
});
