// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ApiClientError } from './api/client'
import { useCachedWrite } from './cached-write'

const KEY = ['lists', 'peek', 'user', 'viewer'] as const

function setup(options: { background?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(KEY, { n: 1 })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => useCachedWrite<{ n: number }>(KEY, { viewerId: 'viewer', invalidate: [['lists']], ...options }),
    { wrapper },
  )
  return { client, commit: result.current }
}

function deferred() {
  let reject: (error: unknown) => void = () => undefined
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

describe('useCachedWrite', () => {
  it('shows the optimistic page, then puts the server page back on failure', async () => {
    const { client, commit } = setup()
    const request = deferred()
    const pending = commit(() => request.promise, page => ({ n: page.n + 1 }))
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual({ n: 2 }))
    request.reject(new ApiClientError(429, 'rate_limited', 'Too many requests.', 5))
    expect(await pending).toBe('Too many requests. Try again in 5 seconds.')
    expect(client.getQueryData(KEY)).toEqual({ n: 1 })
  })

  it('keeps a page a refetch wrote while the request was out', async () => {
    const { client, commit } = setup()
    const request = deferred()
    const pending = commit(() => request.promise, page => ({ n: page.n + 1 }))
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual({ n: 2 }))
    client.setQueryData(KEY, { n: 9 })
    request.reject(new Error('offline'))
    expect(await pending).toBe('offline')
    expect(client.getQueryData(KEY)).toEqual({ n: 9 })
  })

  it('restores the page from before the first of two overlapping writes', async () => {
    const { client, commit } = setup()
    const first = deferred()
    const second = deferred()
    const one = commit(() => first.promise, page => ({ n: page.n + 1 }))
    const two = commit(() => second.promise, page => ({ n: page.n + 10 }))
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual({ n: 12 }))
    first.reject(new Error('refused'))
    expect(await one).toBe('refused')
    expect(client.getQueryData(KEY)).toEqual({ n: 1 })
    second.resolve()
    expect(await two).toBeNull()
  })

  it('waits for the refetch unless the caller asks for a background one', async () => {
    const waiting = setup()
    const refetch = deferred()
    const invalidate = vi.spyOn(waiting.client, 'invalidateQueries').mockReturnValue(refetch.promise)
    let settled = false
    const pending = waiting.commit(() => Promise.resolve()).then(() => { settled = true })
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lists'] }))
    expect(settled).toBe(false)
    refetch.resolve()
    await pending

    const background = setup({ background: true })
    vi.spyOn(background.client, 'invalidateQueries').mockReturnValue(new Promise(() => undefined))
    expect(await background.commit(() => Promise.resolve())).toBeNull()
  })
})
