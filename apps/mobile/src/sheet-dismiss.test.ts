import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** A navigation pressed inside a sheet has to go through dismiss(), which closes the sheet first. */
function unguardedSheetNavigation(source: string): string[] {
  const lines = source.split('\n')
  const problems: string[] = []
  lines.forEach((line, index) => {
    if (/onPress=\{\s*onSign(?:In|Up)\s*\}/.test(line)) {
      problems.push(`${index + 1}: ${line.trim()}`)
      return
    }
    if (!/(?:router\.(?:push|replace)|onSignIn|onSignUp)\s*\(/.test(line)) return
    const window = lines.slice(Math.max(0, index - 8), index + 1).join('\n')
    if (!window.includes('dismiss(')) problems.push(`${index + 1}: ${line.trim()}`)
  })
  return problems
}

describe('sheet navigation', () => {
  it('dismisses the sheet before any navigation started from one', () => {
    const root = join(import.meta.dirname)
    const sheets = filesUnder(root).filter(path => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))
    const problems = sheets.flatMap(path => {
      const source = readFileSync(path, 'utf8')
      if (!source.includes('<Sheet')) return []
      return unguardedSheetNavigation(source).map(line => `${path}: ${line}`)
    })
    expect(problems).toEqual([])
  })
})
