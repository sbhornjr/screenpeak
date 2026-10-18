import { Pressable, Text } from 'react-native'

import { catalogueHref } from '@/lib/routes'

import { DataAttribution } from './data-attribution'
import { ScreenScroll, screenStyles } from './screen-scroll'

export function WelcomeScreen({ onOpen }: { onOpen: (href: string) => void }) {
  return (
    <ScreenScroll title="Welcome">
      <Text style={screenStyles.body}>Sign up, log in, or browse the catalogue.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign up" onPress={() => onOpen('/sign-up')} style={screenStyles.rowButton}>
        <Text style={screenStyles.rowText}>Sign up</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => onOpen('/sign-in')} style={screenStyles.rowButton}>
        <Text style={screenStyles.rowText}>Log in</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Browse" onPress={() => onOpen(catalogueHref())} style={screenStyles.rowButton}>
        <Text style={screenStyles.rowText}>Browse</Text>
      </Pressable>
      <DataAttribution />
    </ScreenScroll>
  )
}
