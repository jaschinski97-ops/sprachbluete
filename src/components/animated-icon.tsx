import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 750;

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
  image: {
    width: 200,
    height: 170,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#07071A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
