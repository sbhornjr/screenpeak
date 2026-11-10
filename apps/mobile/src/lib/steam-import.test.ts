import { ApiClientError } from '@screenpeak/shared/api/client'
import { STEAM_NOT_PUBLIC_MESSAGE, type SteamImportBatch } from '@screenpeak/shared/api/steam'
import type { SteamLinkEntry } from '@screenpeak/shared/types'
import { describe, expect, it, vi } from 'vitest'

import {
  applySteamEdit,
  entrySummary,
  importEntries,
  matchingLine,
  mergeEntries,
  runMatching,
  STEAM_PRIVATE_HELP,
  type SteamEdits,
} from './steam-import'

function entry(gameId: string, overrides: Partial<SteamLinkEntry> = {}): SteamLinkEntry {
  return {
    gameId,
    playtimeSelected: 12.5,
    status: 'completed',
    selected: true,
    coverImageUrl: null,
    gameName: `Game ${gameId}`,
    gameDeveloper: 'Supergiant',
    gameReleased: '2020-09-17',
    timesPlayed: 1,
    completedAllAchievements: false,
    ...overrides,
  }
}

function batch(overrides: Partial<SteamImportBatch> = {}): SteamImportBatch {
  return {
    entries: [],
    remaining: 0,
    totalApps: 3,
    matchedGameCount: 0,
    unmatchedAppCount: 0,
    ambiguousAppCount: 0,
    retryableAppCount: 0,
    nextCursor: null,
    ...overrides,
  }
}

describe('merging a new batch', () => {
  it('keeps the fields you edited and takes the rest from the server', () => {
    const edited: SteamEdits = new Map([['a', new Set(['status', 'selected'] as const)]])
    const previous = [entry('a', { status: 'backlog', selected: false, playtimeSelected: 3 })]
    const incoming = [entry('a', { playtimeSelected: 20 }), entry('b')]
    const merged = mergeEntries(previous, incoming, edited)
    expect(merged.map(item => item.gameId)).toEqual(['a', 'b'])
    expect(merged[0]).toMatchObject({ status: 'backlog', selected: false, playtimeSelected: 20 })
  })

  it('keeps 100% once either side has it, unless you set it yourself', () => {
    const previous = [entry('a', { completedAllAchievements: true })]
    expect(mergeEntries(previous, [entry('a')], new Map())[0].completedAllAchievements).toBe(true)
    const edited: SteamEdits = new Map([['a', new Set(['achievements'] as const)]])
    const cleared = [entry('a', { completedAllAchievements: false })]
    expect(mergeEntries(cleared, [entry('a', { completedAllAchievements: true })], edited)[0].completedAllAchievements).toBe(false)
  })
})

describe('the matching sentence', () => {
  it('says how far matching is while it runs, and what was skipped when it stops', () => {
    expect(matchingLine({ matching: true, matchedGameCount: 1, remaining: 4, totalApps: 9, unmatched: 0, ambiguous: 0 }))
      .toBe('Matching your library… 1 game ready, 4 still to check.')
    expect(matchingLine({ matching: false, matchedGameCount: 6, remaining: 0, totalApps: 9, unmatched: 2, ambiguous: 1 }))
      .toBe('6 games ready from 9 Steam apps. 2 Steam apps could not be matched. 1 Steam app matched more than one game and were skipped.')
    expect(matchingLine({ matching: false, matchedGameCount: 1, remaining: 3, totalApps: 1, unmatched: 0, ambiguous: 0 }))
      .toBe('1 game ready from 1 Steam app. 3 still to check.')
  })
})

describe('the import body', () => {
  it('sends only the selected games', () => {
    const body = importEntries([entry('a'), entry('b', { selected: false }), entry('c', { status: 'playing' })])
    expect(body.map(item => [item.gameId, item.status])).toEqual([['a', 'completed'], ['c', 'playing']])
  })
})

describe('editing one game', () => {
  it('saves status, hours, times played, and 100%, and names the fields that changed', () => {
    const result = applySteamEdit(entry('a'), { status: 'playing', hours: '40.5', timesPlayed: 2, completed: true })
    expect(result).toEqual({
      ok: true,
      entry: entry('a', { status: 'playing', playtimeSelected: 40.5, timesPlayed: 2, completedAllAchievements: true }),
      fields: ['status', 'hours', 'times', 'achievements'],
    })
    expect(applySteamEdit(entry('a'), { status: 'completed', hours: '12.5', timesPlayed: 1, completed: false }))
      .toEqual({ ok: true, entry: entry('a'), fields: [] })
  })

  it('treats blank hours as zero and refuses hours the server would refuse', () => {
    expect(applySteamEdit(entry('a'), { status: 'completed', hours: ' ', timesPlayed: 1, completed: false }))
      .toMatchObject({ ok: true, entry: { playtimeSelected: 0 } })
    expect(applySteamEdit(entry('a'), { status: 'completed', hours: '1.25', timesPlayed: 1, completed: false }))
      .toEqual({ ok: false, message: 'Hours can have at most one decimal place' })
    expect(applySteamEdit(entry('a'), { status: 'completed', hours: 'lots', timesPlayed: 1, completed: false }))
      .toEqual({ ok: false, message: 'Hours must be a number.' })
  })

  it('summarizes a game for its row', () => {
    expect(entrySummary(entry('a'))).toBe('Completed · 12.5 hrs · Played 1×')
    expect(entrySummary(entry('a', { status: 'backlog', playtimeSelected: 0, timesPlayed: 3, completedAllAchievements: true })))
      .toBe('Backlog · 0 hrs · Played 3× · 100%')
  })
})

describe('matching the library', () => {
  function harness(responses: (SteamImportBatch | Error)[]) {
    const fetchBatch = vi.fn(async () => {
      const next = responses.shift()
      if (!next) throw new Error('no more batches')
      if (next instanceof Error) throw next
      return next
    })
    const onBatch = vi.fn()
    const onNotice = vi.fn()
    const sleep = vi.fn(async () => undefined)
    return { fetchBatch, onBatch, onNotice, sleep }
  }

  it('follows the cursor until it runs out', async () => {
    const cursor = { phase: 'pending' as const, afterAppId: 40 }
    const h = harness([batch({ nextCursor: cursor, remaining: 1 }), batch({ entries: [entry('a')], matchedGameCount: 1 })])
    expect(await runMatching({ retry: false, ...h, cancelled: () => false })).toEqual({ ok: true })
    expect(h.fetchBatch.mock.calls).toEqual([[{}], [{ retry: false, cursor }]])
    expect(h.onBatch).toHaveBeenCalledTimes(2)
  })

  it('walks once more from the start when apps are still left, then stops', async () => {
    const h = harness([batch({ remaining: 2 }), batch({ remaining: 2 })])
    expect(await runMatching({ retry: false, ...h, cancelled: () => false })).toEqual({ ok: true })
    expect(h.fetchBatch).toHaveBeenCalledTimes(2)
  })

  it('asks for a retry pass from the button', async () => {
    const h = harness([batch()])
    await runMatching({ retry: true, ...h, cancelled: () => false })
    expect(h.fetchBatch).toHaveBeenCalledWith({ retry: true, cursor: null })
  })

  it('waits while another import holds the turn, without touching the list', async () => {
    const h = harness([batch({ notice: 'Another import is running.', retryAfterMs: 2000 }), batch({ matchedGameCount: 1 })])
    await runMatching({ retry: false, ...h, cancelled: () => false })
    expect(h.onNotice).toHaveBeenCalledWith('Another import is running.', 0)
    expect(h.sleep).toHaveBeenCalledWith(2000)
    expect(h.onBatch).toHaveBeenCalledTimes(1)
  })

  it('stops with the server sentence, and with Steam privacy help for a private library', async () => {
    const down = new ApiClientError(503, 'unavailable', 'Steam is unavailable. Your matched games are still listed.', 5)
    expect(await runMatching({ retry: false, ...harness([down]), cancelled: () => false }))
      .toEqual({ ok: false, message: 'Steam is unavailable. Your matched games are still listed.' })
    const hidden = new ApiClientError(400, 'invalid_request', STEAM_NOT_PUBLIC_MESSAGE, null)
    expect(await runMatching({ retry: false, ...harness([hidden]), cancelled: () => false }))
      .toEqual({ ok: false, message: STEAM_PRIVATE_HELP })
  })

  it('stops reporting once the screen has gone', async () => {
    let gone = false
    const h = harness([batch({ nextCursor: { phase: 'pending', afterAppId: 1 } }), batch()])
    h.onBatch.mockImplementation(() => { gone = true })
    expect(await runMatching({ retry: false, ...h, cancelled: () => gone })).toEqual({ ok: true })
    expect(h.fetchBatch).toHaveBeenCalledTimes(1)
  })
})
