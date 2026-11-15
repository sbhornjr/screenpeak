// @vitest-environment jsdom
import type { GameSearchPage, ListSearchPage, UserSearchPage } from '@screenpeak/shared/api/search'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { queryKeys } from './query-keys'
import { searchTypeParam, useExploreSearch, type SearchType } from './explore-search'

const calls = vi.hoisted(() => ({
  games: [] as { q: string, resolve: (page: GameSearchPage) => void }[],
  lists: [] as { q: string, resolve: (page: ListSearchPage) => void }[],
  users: [] as { q: string, resolve: (page: UserSearchPage) => void }[],
}))

function pending<T>(bucket: { q: string, resolve: (page: T) => void }[], q: string): Promise<T> {
  return new Promise<T>(resolve => { bucket.push({ q, resolve }) })
}

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ ready: true, session: null }),
}))

vi.mock('@/components/screen-state', () => ({
  screenGate: () => null,
}))

vi.mock('@/lib/api', () => ({
  apiConfigured: () => true,
  api: {
    games: { search: (q: string) => pending(calls.games, q) },
    lists: { search: (q: string) => pending(calls.lists, q) },
    users: { search: (q: string) => pending(calls.users, q) },
  },
}))

const HADES = { id: 'g-hades', name: 'Hades', slug: 'hades', cover_image_url: null, released: null, avg_rating: null }
const ADA = { id: 'u-ada', username: 'ada', avatar_url: null, follower_count: 3 }

function setup(initial: { type: SearchType, query: string | null }) {
  calls.games.length = 0
  calls.lists.length = 0
  calls.users.length = 0
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    ({ type, query }: { type: SearchType, query: string | null }) => useExploreSearch(type, query),
    { wrapper, initialProps: initial },
  )
  return { ...hook, client }
}

describe('useExploreSearch', () => {
  it('runs nothing until there is a query', () => {
    const { result } = setup({ type: 'games', query: null })
    expect(result.current).toEqual({ results: null, searching: false, error: null })
    expect(calls.games).toHaveLength(0)
  })

  it('never shows a games response after the filter moved to players', async () => {
    const { result, rerender, client } = setup({ type: 'games', query: 'ada' })
    await vi.waitFor(() => expect(calls.games).toHaveLength(1))
    rerender({ type: 'users', query: 'ada' })
    await vi.waitFor(() => expect(calls.users).toHaveLength(1))
    expect(calls.users[0].q).toBe('ada')

    // The games request lands late: the players filter must not render it.
    await act(async () => { calls.games[0].resolve({ games: [HADES] }) })
    await vi.waitFor(() => expect(client.getQueryData(queryKeys.gameSearch('ada', null))).toEqual({ games: [HADES] }))
    expect(result.current.results).toBeNull()
    expect(result.current.searching).toBe(true)

    await act(async () => { calls.users[0].resolve({ users: [ADA] }) })
    await vi.waitFor(() => expect(result.current.results).toEqual({ type: 'users', hits: [ADA] }))

    // Back to games: its own (cached) answer, tagged as games, never the players one.
    rerender({ type: 'games', query: 'ada' })
    expect(result.current.results).toEqual({ type: 'games', hits: [HADES] })
  })

  it('never shows the answer to an older query under a newer one', async () => {
    const { result, rerender, client } = setup({ type: 'lists', query: 'pea' })
    await vi.waitFor(() => expect(calls.lists).toHaveLength(1))
    rerender({ type: 'lists', query: 'peak' })
    await vi.waitFor(() => expect(calls.lists).toHaveLength(2))
    await act(async () => { calls.lists[0].resolve({ lists: [] }) })
    await vi.waitFor(() => expect(client.getQueryData(queryKeys.listSearch('pea', null))).toEqual({ lists: [] }))
    expect(result.current.results).toBeNull()
    expect(result.current.searching).toBe(true)
  })

  it('reads the type a deep link asks for', () => {
    expect(searchTypeParam('users')).toBe('users')
    expect(searchTypeParam('lists')).toBe('lists')
    expect(searchTypeParam('games')).toBe('games')
    expect(searchTypeParam(['users'])).toBe('users')
    expect(searchTypeParam('people')).toBeNull()
    expect(searchTypeParam(undefined)).toBeNull()
  })
})
