import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Länge der Ausblend-Animation in Millisekunden.
const DURATION = 750;

/**
 * Vollbild-Overlay beim Start, das den nativen Splash nahtlos weiterführt.
 * Ablauf: Overlay steht zuerst still (`animate = false`); sobald es gelayoutet ist, wird der native Splash
 * ausgeblendet und die Keyframe-Animation (anwachsen, ausblenden) startet. Danach entfernt sich das Overlay selbst.
 */
export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  // Seit 22.10.2026: Die App-Sprechblase wächst kurz an und löst sich dann
  // in die Oberfläche auf — derselbe Nachtblau-Grund wie der native Splash.
  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    35: {
      transform: [{ scale: 1.08 }],
      opacity: 1,
      easing: Easing.out(Easing.cubic),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1.6 }],
      easing: Easing.in(Easing.cubic),
    },
  });

  const image = <Image style={styles.image} source={require('@/assets/images/splash-icon.png')} />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        // Läuft auf dem UI-Thread; den State (Overlay entfernen) setzt `scheduleOnRN` auf dem JS-Thread.
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        // Erst nach dem ersten Layout den nativen Splash ausblenden, damit dazwischen kein leerer Frame aufblitzt.
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const styles = StyleSheet.create({
  // Quadratisch wie das Sprachblüte-Logo (26.10.2026; vorher 200 × 170).
  image: {
    width: 200,
    height: 200,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    // Nachtblau wie Splash und App-Hintergrund (app.json).
    backgroundColor: '#0B1628',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
