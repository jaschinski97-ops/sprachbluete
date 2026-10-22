import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useLocale } from '@/lib/i18n';

/**
 * Native navigation (iOS/Android): a standard bottom tab bar.
 *
 * The web build uses `app-tabs.web.tsx` instead, which renders a top nav bar —
 * a phone-style bottom bar reads badly in a wide desktop window (Phase 0
 * responsive requirement in PROGRESS.md).
 *
 * Die Reiternamen stehen in der App-Sprache (Roadmap v2): sie kommen aus dem
 * i18n-Wörterbuch, nicht mehr als deutsche Literale.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const { t } = useLocale();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Seit 22.10.2026: Akzentfarbe für den aktiven Reiter, die Leiste in
        // der Kartenfläche mit feiner Kante statt Systemgrau.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.backgroundElement, borderTopColor: colors.cardBorder },
        tabBarLabelStyle: { fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.overview'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: t('tabs.learn'),
          tabBarIcon: ({ color, size }) => <Ionicons name="layers" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="conversation"
        options={{
          title: t('tabs.conversation'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('tabs.progress'),
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
      {/* Untergeordnete Bereiche: navigierbar, aber bewusst ohne eigenen Tab
          (href: null) — sie sind Ziel von Zeilen in anderen Reitern, keine
          Hauptziele der App. */}
      <Tabs.Screen name="settings/about" options={{ href: null }} />
      <Tabs.Screen name="settings/studio" options={{ href: null }} />
    </Tabs>
  );
}
