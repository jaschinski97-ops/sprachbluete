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

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { TranslationKey, useLocale } from '@/lib/i18n';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const LINKS = [
  { name: 'home', href: '/', icon: 'home' },
  { name: 'review', href: '/review', icon: 'layers' },
  { name: 'conversation', href: '/conversation', icon: 'chatbubbles' },
  { name: 'progress', href: '/progress', icon: 'stats-chart' },
  { name: 'settings', href: '/settings', icon: 'settings' },
] as const;

/** Reitername je Link — der Schlüsselraum kommt aus dem i18n-Wörterbuch. */
const LINK_LABELS: Record<(typeof LINKS)[number]['name'], TranslationKey> = {
  home: 'tabs.overview',
  review: 'tabs.learn',
  conversation: 'tabs.conversation',
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
  return (
    <ThemedView type="backgroundElement" style={styles.bar}>
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
  return (
    <Pressable
      {...props}
      // Web-Tabs von Hand, was die native Tab-Leiste von expo-router mitbringt:
      // Rolle und Auswahlzustand, sonst sagt der Screenreader nur „Link“ ohne
      // die aktuelle Position (UI-Review 2026-09-07).
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.navButton}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function BottomBar(props: { children?: ReactNode }) {
  const { t } = useLocale();
  const colors = useTheme();
  return (
    <ThemedView
      type="background"
      // Haarlinie aus decorGrey: subpixel dünn wirkt sie von selbst gedämpft —
      // der Token ersetzt eine handgerechnete rgba und wechselt mit dem Modus.
      style={[styles.bottomBar, { borderTopColor: colors.decorGrey }]}>
      <View
        style={styles.bottomBarInner}
        accessibilityRole="tablist"
        accessibilityLabel={t('tabs.mainNavA11y')}>
        {props.children}
      </View>
    </ThemedView>
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
      <ThemedView type={isFocused ? 'text' : 'background'} style={styles.bottomTabPill}>
        <Ionicons
          name={icon}
          size={22}
          color={isFocused ? colors.background : colors.textSecondary}
        />
        {isFocused ? (
          <ThemedText type="small" themeColor="background">
            {label}
          </ThemedText>
        ) : null}
      </ThemedView>
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
  },
  bottomBar: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    // 56px-Leiste mit 6px Boden: übliche Bottom-Bar-Anmutung; das Web braucht
    // kein zusätzliches Safe-Area-Polster wie auf dem Phone.
    minHeight: 56,
    paddingTop: Spacing.one,
    paddingBottom: 6,
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
    flexGrow: 1.9,
  },
  bottomTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
    minHeight: 32,
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
