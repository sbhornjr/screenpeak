import { Text } from 'react-native'

import { catalogueHref } from '@/lib/routes'
import { text } from '@/theme'

import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { ScreenScroll } from './screen-scroll'

export function WelcomeScreen({ onOpen }: { onOpen: (href: string) => void }) {
  return (
    <ScreenScroll title="Welcome">
      <Text style={text.body}>Sign up, log in, or browse the catalogue.</Text>
      <Button label="Sign up" onPress={() => onOpen('/sign-up')} />
      <Button label="Log in" variant="secondary" onPress={() => onOpen('/sign-in')} />
      <Button label="Browse" variant="secondary" onPress={() => onOpen(catalogueHref())} />
      <DataAttribution />
    </ScreenScroll>
  )
}
