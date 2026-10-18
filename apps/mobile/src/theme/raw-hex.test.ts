import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { colorScheme, colors } from '@screenpeak/shared/tokens'

const HEX = /#[0-9A-Fa-f]{3,8}\b/g

function hexColors(source: string): string[] {
  return [...source.matchAll(HEX)].map((match) => match[0])
}

function screenSources(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'theme') continue
      found.push(...screenSources(full))
      continue
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue
    found.push(readFileSync(full, 'utf8'))
  }
  return found
}

describe('raw hex', () => {
  it('finds a painted hex and the shared accent in the token file', () => {
    const accent = ['#', '47c6dd'].join('')
    expect(hexColors(['paint ', accent].join(''))).toEqual([accent])
    expect(hexColors('plain text')).toEqual([])
    const tokens = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/shared/tokens.ts'), 'utf8')
    expect(hexColors(tokens)).toContain(accent)
  })

  it('keeps hex colours out of the phone screens', () => {
    const src = path.resolve(import.meta.dirname, '..')
    const joined = screenSources(src).join('\n')
    expect(joined).toContain('Sign up, log in, or browse the catalogue.')
    expect(hexColors(joined)).toEqual([])
  })

  it('keeps the native shell on the same dark ground as the website tokens', () => {
    const app = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../app.json'), 'utf8')) as {
      expo: {
        userInterfaceStyle: string
        backgroundColor: string
        android: { adaptiveIcon: { backgroundColor: string } }
        plugins: unknown[]
      }
    }
    const splash = app.expo.plugins.find(
      (plugin): plugin is [string, { backgroundColor: string }] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    )
    expect(app.expo.userInterfaceStyle).toBe(colorScheme)
    expect(app.expo.backgroundColor).toBe(colors.bg)
    expect(app.expo.android.adaptiveIcon.backgroundColor).toBe(colors.bg)
    expect(splash?.[1].backgroundColor).toBe(colors.bg)
  })
})
