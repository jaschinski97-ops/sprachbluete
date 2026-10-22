import * as ExpoRouter from 'expo-router';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
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
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

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
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from ?? theme.gradientStart} />
          <Stop offset="1" stopColor={to ?? theme.gradientEnd} />
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
 */
export function Shine({ every = 4200 }: { every?: number }) {
  const reduce = useReducedMotion();
  const sichtbar = useScreenFocused();
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduce || !sichtbar) return;
    x.set(
      withRepeat(
        withSequence(withTiming(-1, { duration: 0 }), withDelay(every, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }))),
        -1,
        false
      )
    );
    return () => cancelAnimation(x);
  }, [every, reduce, sichtbar, x]);
  const style = useAnimatedStyle(() => ({ left: `${-40 + 140 * ((x.value + 1) / 2)}%` as `${number}%` }));
  if (reduce) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.shine, style]}>
      <GradientFill from="rgba(255,255,255,0)" to="rgba(255,255,255,0.45)" />
    </Animated.View>
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

/** Ein sanftes, endloses Pulsieren — z. B. für einen Leuchtpunkt. */
export function usePulse(min = 0.55, max = 1, duration = 1600) {
  const reduce = useReducedMotion();
  const v = useSharedValue(max);
  useEffect(() => {
    if (reduce) return;
    v.set(withRepeat(withTiming(min, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(v);
  }, [duration, max, min, reduce, v]);
  return useAnimatedStyle(() => ({ opacity: v.value }));
}

const styles = StyleSheet.create({
  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '35%',
    transform: [{ skewX: '-20deg' }],
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
