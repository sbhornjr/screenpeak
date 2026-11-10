import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TIER = />=\s*[68]\b[\s\S]{0,80}?(?:--color-good|--color-mid|--color-bad|['"]good['"]|['"]mid['"]|['"]bad['"])/g

function tierCopies(source: string): string[] {
  return [...source.matchAll(TIER)].map((match) => match[0].replace(/\s+/g, ' '))
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue
    found.push(full)
  }
  return found
}

describe('rating tiers', () => {
  it('catches a copied threshold and ignores an unrelated comparison', () => {
    expect(tierCopies("const color = rating >= 8 ? 'var(--color-good)' : 'var(--color-bad)'")).toEqual([
      ">= 8 ? 'var(--color-good",
    ])
    expect(tierCopies('bytes.length >= 8 && bytes[0] === 1')).toEqual([])
  })

  it('keeps the threshold in the shared tokens', () => {
    const root = path.resolve(import.meta.dirname, '../../../..')
    const hits = sourceFiles(path.join(root, 'apps')).concat(sourceFiles(path.join(root, 'packages')))
      .flatMap((file) => tierCopies(readFileSync(file, 'utf8')).map(() => path.relative(root, file)))
    expect([...new Set(hits)]).toEqual(['packages/shared/tokens.ts'])
  })
})