import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { GradientFill } from './fx';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { TranslationKey, useLocale } from '@/lib/i18n';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const LINKS = [
  { name: 'home', href: '/', icon: 'home' },
  { name: 'review', href: '/review', icon: 'layers' },
  { name: 'progress', href: '/progress', icon: 'stats-chart' },
  { name: 'settings', href: '/settings', icon: 'settings' },
] as const;

/** Reitername je Link — der Schlüsselraum kommt aus dem i18n-Wörterbuch. */
const LINK_LABELS: Record<(typeof LINKS)[number]['name'], TranslationKey> = {
  home: 'tabs.overview',
  review: 'tabs.learn',
  progress: 'tabs.progress',
  settings: 'tabs.settings',
};

/**
 * Schmal ab hier heißt „Phone“: unter 768px liegen die Breiten, auf denen die
 * Top-Leiste mit sechs Einträgen in zwei Zeilen umbreicht und ~130px Höhe
 * frisst (spitz beobachtet bei 390px). 768 ist zugleich die übliche
 * Tablet-Grenze, ab der eine Browser-Leiste sinnvoll oben bleibt.
 */
const NARROW_BREAKPOINT = 768;

/**
 * Web navigation: responsive. Wide viewports get the single-line top nav bar
 * (a phone-style bottom bar reads badly in a wide desktop window — Phase 0
 * requirement); narrow viewports get a bottom tab bar instead, because a top
 * bar with six entries wraps onto two lines there (~130px of height) and the
 * thumb zone at the bottom is the phone idiom (mockup, phone 1). Both
 * variants share TabList/TabTrigger, so tablist/tab roles and the selected
 * state survive on either side (UI review 2026-09-07). Labels and the brand
 * come from the app language.
 */
export default function AppTabs() {
  const { t } = useLocale();
  // Hook statt CSS-MatchMedia: useWindowDimensions liefert schon beim ersten
  // Render die echte Breite — kein Umschalt-Flackern, und Resizing triggert
  // ein Rerender wie jeder andere State.
  const { width } = useWindowDimensions();
  const isNarrow = width < NARROW_BREAKPOINT;

  const triggers = LINKS.map((link) => (
    <TabTrigger key={link.name} name={link.name} href={link.href} asChild>
      {isNarrow ? (
        <BottomTabButton icon={link.icon} label={t(LINK_LABELS[link.name])} />
      ) : (
        <NavButton>{t(LINK_LABELS[link.name])}</NavButton>
      )}
    </TabTrigger>
  ));

  // Untergeordnete Bereiche (settings/about, settings/studio): Der
  // UI-Tabs registriert NUR Routen mit Trigger (common.js
  // triggersToScreens baut die Screens aus den Triggern) — ohne Trigger hier
  // fiele /settings/about auf die Übersicht zurück. Sie hängen unsichtbar in
  // der Leiste und werden nur per router.push erreicht.
  const versteckteTrigger = (
    <>
      <TabTrigger name="settings/about" href="/settings/about" asChild>
        <View style={styles.hidden} />
      </TabTrigger>
      <TabTrigger name="settings/studio" href="/settings/studio" asChild>
        <View style={styles.hidden} />
      </TabTrigger>
    </>
  );

  const tabBar = (
    <TabList asChild>
      {isNarrow
        ? <BottomBar>{triggers}{versteckteTrigger}</BottomBar>
        : <NavBar>{triggers}{versteckteTrigger}</NavBar>}
    </TabList>
  );

  return (
    <Tabs>
      {isNarrow ? (
        // Schmal: TabSlot zuerst, TabList danach — expo-router/ui (v57) zeigt
        // genau diese Reihenfolge im Doku-Beispiel; im flexiblen Column-Root
        // landet die Leiste dadurch unten unter dem Inhalt.
        <>
          <TabSlot style={styles.slot} />
          {tabBar}
        </>
      ) : (
        <>
          {tabBar}
          <TabSlot style={styles.slot} />
        </>
      )}
    </Tabs>
  );
}

function NavBar(props: { children?: ReactNode }) {
  const { t } = useLocale();
  const colors = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.bar, { borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, backgroundColor: colors.glass }]}>
      <View style={styles.barInner}>
        <ThemedText type="smallBold" style={styles.brand}>
          {t('tabs.brand')}
        </ThemedText>
        <View
          style={styles.links}
          accessibilityRole="tablist"
          accessibilityLabel={t('tabs.mainNavA11y')}>
          {props.children}
        </View>
      </View>
    </ThemedView>
  );
}

function NavButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const colors = useTheme();
  return (
    <Pressable
      {...props}
      // Web-Tabs von Hand, was die native Tab-Leiste von expo-router mitbringt:
      // Rolle und Auswahlzustand, sonst sagt der Screenreader nur „Link“ ohne
      // die aktuelle Position (UI-Review 2026-09-07).
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      style={({ pressed }) => pressed && styles.pressed}>
      {/* Aktiv seit 22.10.2026 als Verlaufspille, inaktiv durchsichtig. */}
      <View style={[styles.navButton, isFocused && { boxShadow: `0 4px 16px ${colors.gradientStart}55` }]}>
        {isFocused ? <GradientFill radius={Spacing.three} /> : null}
        <ThemedText
          type={isFocused ? 'smallBold' : 'small'}
          style={{ color: isFocused ? colors.gradientText : colors.textSecondary }}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function BottomBar(props: { children?: ReactNode }) {
  const { t } = useLocale();
  const colors = useTheme();
  return (
    // Seit 22.10.2026 eine schwebende Glasleiste über der Aurora.
    <View style={[styles.bottomBarWrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.glass, borderColor: colors.cardBorder, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' },
        ]}>
        <View
          style={styles.bottomBarInner}
          accessibilityRole="tablist"
          accessibilityLabel={t('tabs.mainNavA11y')}>
          {props.children}
        </View>
      </View>
    </View>
  );
}

function BottomTabButton({
  icon,
  label,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: IoniconName; label: string }) {
  const colors = useTheme();
  return (
    <Pressable
      {...props}
      // Dieselbe Handarbeit wie in NavButton: Rolle und Auswahlzustand für den
      // Screenreader (UI-Review 2026-09-07) — und accessibilityLabel mit dem
      // Tab-Namen, denn inaktive Tabs zeigen ihn nicht an.
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.bottomTab,
        // Der aktive Tab wächst stärker: sein Label passt sonst nicht in das
        // 1/6-Sextel bei 390px, und die Pille lief über das Nachbar-Icon hinweg
        // (im Web-Build gemessen).
        isFocused && styles.bottomTabActive,
        pressed && styles.pressed,
      ]}>
      {/* Aktiver Tab als invertierte Pille (text auf background — dreht im
          Dunkelmodus automatisch um, Mockup Phone 1). Inaktiv nur das Icon:
          sechs Labels passen auf 390px nicht mehr in Lesegröße, der aktive
          Tab trägt das Label stellvertretend für alle. */}
      <View
        style={[styles.bottomTabPill, isFocused && { boxShadow: `0 4px 18px ${colors.gradientStart}66` }]}>
        {isFocused ? <GradientFill radius={Spacing.three} /> : null}
        <Ionicons
          name={icon}
          size={22}
          color={isFocused ? colors.gradientText : colors.textSecondary}
        />
        {isFocused ? (
          <ThemedText type="smallBold" numberOfLines={1} style={[styles.bottomLabel, { color: colors.gradientText }]}>
            {label}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  barInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  brand: {
    marginRight: 'auto',
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.one,
    // React Native defaults flex items to `flexShrink: 0`. Without this the
    // link row keeps its full width on a narrow viewport and the last tab is
    // clipped instead of wrapping onto a second line.
    flexShrink: 1,
  },
  navButton: {
    // Wie überall: 44 Punkte Mindesthöhe für ein Tippziel (UI-Review
    // 2026-09-07) — die Leiste wächst dafür minimal, nimmt dafür jeden Treffer.
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  bottomBarWrap: {
    width: '100%',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
    paddingTop: Spacing.one,
  },
  bottomBar: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    // 56px-Leiste: übliche Bottom-Bar-Anmutung; das Web braucht kein
    // zusätzliches Safe-Area-Polster wie auf dem Phone.
    minHeight: 56,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  bottomBarInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomTab: {
    // Volle Zeilenbreite je Tab plus 44 Punkte Mindesthöhe: jeder der sechs
    // Treffer ist bequem erreichbar (Tippziel-Regel, UI-Review 2026-09-07).
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabActive: {
    // 2.8 statt 1.9 seit der Verlaufspille (22.10.2026): Auf 375 px lief
    // „Einstellungen“ sonst rechts aus der Leiste.
    flexGrow: 2.8,
  },
  bottomTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 40,
    overflow: 'hidden',
  },
  bottomLabel: {
    fontSize: 13,
  },
  slot: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  pressed: {
    opacity: 0.7,
  },
});
