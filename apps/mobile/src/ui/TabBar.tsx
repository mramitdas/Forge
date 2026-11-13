import { BlurView } from 'expo-blur';
import { useRouter, usePathname } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { elevation, palette, radii, spacing, textStyles } from '@/theme/tokens';
import { QuickActionsSheet } from './QuickActionsSheet';

const TABS = [
  { key: 'home', label: 'Home', glyph: '⌂', href: '/(tabs)/home' },
  { key: 'members', label: 'Members', glyph: '☺', href: '/(tabs)/members' },
] as const;

/**
 * The Floating Island Bar: Home and Members flanking the centre quick-action
 * trigger, floating above the safe area.
 */
export function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { session } = useAuth();

  // A forced password reset blocks everything else.
  if (session?.mustResetPassword) return null;

  const isActive = (href: string) => pathname === href.replace('/(tabs)', '');

  return (
    <>
      <View style={[styles.wrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        <View style={styles.bar}>
          {Platform.OS !== 'web' ? (
            <BlurView
              intensity={elevation.bar.blur}
              tint="dark"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          ) : null}

          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Pressable
                key={tab.key}
                testID={`tab-${tab.key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={styles.tab}
                onPress={() => router.navigate(tab.href as never)}
              >
                <View style={[styles.tabInner, active && styles.tabInnerActive]}>
                  <Text style={[styles.glyph, active && styles.glyphActive]}>{tab.glyph}</Text>
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          testID="quick-actions-trigger"
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          style={styles.trigger}
          onPress={() => setSheetOpen(true)}
        >
          <Text style={styles.triggerGlyph}>+</Text>
        </Pressable>
      </View>

      <QuickActionsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    alignSelf: 'center',
    width: '92%',
    maxWidth: 420,
    height: 60,
    borderRadius: radii.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: elevation.border,
    backgroundColor: elevation.bar.background,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  tabInnerActive: {
    backgroundColor: palette.accentSoft,
  },
  glyph: {
    ...textStyles.bodyLg,
    color: palette.inkFaint,
  },
  glyphActive: {
    color: palette.primaryContainer,
  },
  tabLabel: {
    ...textStyles.labelMd,
    color: palette.inkFaint,
  },
  tabLabelActive: {
    color: palette.primaryContainer,
  },
  trigger: {
    position: 'absolute',
    top: -22,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryContainer,
    shadowColor: palette.primaryContainer,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  triggerGlyph: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '500',
    color: palette.accentInk,
  },
});
