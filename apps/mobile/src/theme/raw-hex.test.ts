import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { colorScheme, colors } from '@screenpeak/shared/tokens'

const require = createRequire(import.meta.url)
const { rawColors } = require('../../eslint/raw-color.cjs') as {
  rawColors: (source: string) => string[]
}

function screenSources(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      found.push(...screenSources(full))
      continue
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue
    found.push(readFileSync(full, 'utf8'))
  }
  return found
}

describe('raw colours', () => {
  it('catches hex, long hex, colour functions, and named colours', () => {
    expect(rawColors("paint('#abc')")).toEqual(['#abc'])
    expect(rawColors("paint('#112233445')")).toEqual(['#112233445'])
    expect(rawColors("paint('rgb(1, 2, 3)')")).toEqual(['rgb(1, 2, 3)'])
    expect(rawColors("paint('rgba(0, 0, 0, 0.5)')")).toEqual(['rgba(0, 0, 0, 0.5)'])
    expect(rawColors("paint('hsl(0 0% 0%)')")).toEqual(['hsl(0 0% 0%)'])
    expect(rawColors("paint('hsla(0, 0%, 0%, 0.4)')")).toEqual(['hsla(0, 0%, 0%, 0.4)'])
    expect(rawColors("paint('red')")).toEqual(['red'])
    expect(rawColors("paint('White')")).toEqual(['White'])
    expect(rawColors("paint('transparent')")).toEqual([])
    expect(rawColors('plain text')).toEqual([])
    const tokens = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/shared/tokens.ts'), 'utf8')
    expect(rawColors(tokens)).toContain(['#', '47c6dd'].join(''))
  })

  it('keeps raw colours out of the phone screens', () => {
    const src = path.resolve(import.meta.dirname, '..')
    const joined = screenSources(src).join('\n')
    expect(joined).toContain('Sign up, log in, or browse the catalogue.')
    expect(rawColors(joined)).toEqual([])
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
