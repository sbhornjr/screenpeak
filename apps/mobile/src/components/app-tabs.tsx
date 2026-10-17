import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/theme';

// Four tabs. No drawer. A side rail may come later for tablet and web only.
// Games is a stack screen opened from Explore and the welcome Browse button.
const TABS = [
  { name: 'index', label: 'Feed', sf: { default: 'house', selected: 'house.fill' }, md: 'home' },
  { name: 'explore', label: 'Explore', sf: { default: 'magnifyingglass', selected: 'magnifyingglass' }, md: 'search' },
  { name: 'library', label: 'Library', sf: { default: 'books.vertical', selected: 'books.vertical.fill' }, md: 'menu_book' },
  { name: 'profile', label: 'Profile', sf: { default: 'person', selected: 'person.fill' }, md: 'person' },
] as const;

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      indicatorColor={colors.surfaceLight}
      tintColor={colors.accent}
      iconColor={{ default: colors.muted, selected: colors.accent }}
      labelStyle={{ default: { color: colors.muted }, selected: { color: colors.accent } }}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
