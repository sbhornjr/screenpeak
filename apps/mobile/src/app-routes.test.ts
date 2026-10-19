import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

describe('Expo Router tree', () => {
  it('keeps test files out of src/app so Metro does not bundle them as screens', () => {
    const tests = filesUnder(join(import.meta.dirname, 'app')).filter(path => /\.test\.tsx?$/.test(path))
    expect(tests).toEqual([])
  })
})
