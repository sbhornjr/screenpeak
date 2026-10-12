import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createIgdbClient } from '@/lib/igdb/client'
import { redactIgdbErrorBody } from '@/lib/igdb/http'
import { logger } from '@/lib/logger'

function setup(responses: Response[]) {
    const fetcher = vi.fn()
    for (const response of responses) fetcher.mockResolvedValueOnce(response)
    const release = vi.fn().mockResolvedValue(undefined)
    const acquire = vi.fn().mockImplementation(async () => ({ dispatchBefore: performance.now() + 1_000, release }))
    const getToken = vi.fn().mockImplementation(async (rejected?: string) => rejected ? 'new-token' : 'token')
    return { client: createIgdbClient({ clientId: 'client', fetcher, auth: { getToken }, budget: { acquire } }), fetcher, release, acquire, getToken }
}
const schema = z.array(z.object({ id: z.number() }))
afterEach(() => vi.useRealTimers())
it('validates JSON, acquires/releases budget and sends only server credentials', async () => {
    const s = setup([Response.json([{ id: 1 }])])
    expect(await s.client.request('games', 'fields id;', schema)).toEqual([{ id: 1 }])
    expect(s.acquire).toHaveBeenCalledTimes(1); expect(s.release).toHaveBeenCalledTimes(1)
    expect(s.fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer token')
    expect(s.fetcher.mock.calls[0][1].cache).toBe('no-store')
})
it('refreshes once on 401 and stops on a second 401', async () => {
    const s = setup([new Response('',{status:401}), new Response('',{status:401})])
    await expect(s.client.request('games','fields id;',schema)).rejects.toThrow('401')
    expect(s.getToken.mock.calls).toEqual([[], ['token']])
    expect(s.fetcher).toHaveBeenCalledTimes(2); expect(s.release).toHaveBeenCalledTimes(2)
})
it.each([400,403,404])('does not retry HTTP %s', async status => {
    const s = setup([new Response('secret provider body', {status})])
    await expect(s.client.request('games','fields id;',schema)).rejects.toThrow(String(status))
    expect(s.fetcher).toHaveBeenCalledTimes(1)
})
it('scrubs bearer tokens and assigned secrets inside error bodies', () => {
    expect(redactIgdbErrorBody('{"cause":"Bearer x"}')).toBe('{"cause":"Bearer [REDACTED]"}')
    expect(redactIgdbErrorBody('{"message":"client_secret=x"}')).toBe('{"message":"client_secret=[REDACTED]"}')
    expect(redactIgdbErrorBody('"Bearer x"')).toBe('"Bearer [REDACTED]"')
    expect(redactIgdbErrorBody('client_secret=x')).toBe('client_secret=[REDACTED]')
    expect(redactIgdbErrorBody('access_token=abc')).toBe('access_token=[REDACTED]')
    for (const body of ['{"cause":"Bearer x"}', '{"message":"client_secret=x"}', '"Bearer x"', 'client_secret=x', 'access_token=abc']) {
        expect(redactIgdbErrorBody(body)).not.toMatch(/Bearer x|client_secret=x|access_token=abc/)
    }
})
it('logs a 400 body with secrets removed and keeps the query', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const body = JSON.stringify({ title: 'Syntax Error', status: 400, cause: 'unexpected "."', token: 'super-secret' })
    const s = setup([new Response(body, { status: 400, headers: { 'Content-Type': 'application/json' } })])
    await expect(s.client.request('games', 'fields id,rating;', schema)).rejects.toThrow('400')
    const meta = error.mock.calls.map(call => call[2]).find(value => value && typeof value === 'object')
    expect(JSON.stringify(meta)).toContain('Syntax Error')
    expect(JSON.stringify(meta)).toContain('fields id,rating;')
    expect(JSON.stringify(meta)).not.toContain('super-secret')
    expect(JSON.stringify(meta)).toContain('[REDACTED]')
    error.mockRestore()
})
it.each([new Response('not JSON'),Response.json([{id:'wrong'}])])('rejects malformed responses without retry', async response => {
    const s=setup([response])
    await expect(s.client.request('games','fields id;',schema)).rejects.toThrow('invalid response')
    expect(s.fetcher).toHaveBeenCalledTimes(1); expect(s.release).toHaveBeenCalledTimes(1)
})
it('honors Retry-After and reacquires for retry',async()=>{
    vi.useFakeTimers()
    const s=setup([new Response('',{status:429,headers:{'Retry-After':'2'}}),Response.json([{id:1}])])
    const promise=s.client.request('games','fields id;',schema)
    await vi.advanceTimersByTimeAsync(1999);expect(s.fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000);await promise
    expect(s.acquire).toHaveBeenCalledTimes(2)
})
it('fails visibly rather than retrying before a long cooldown',async()=>{
    const s=setup([new Response('',{status:429,headers:{'Retry-After':'60'}})])
    await expect(s.client.request('games','fields id;',schema)).rejects.toThrow('cooldown')
    expect(s.fetcher).toHaveBeenCalledTimes(1)
})
it('fails closed when the shared budget is unavailable',async()=>{
    const s=setup([]);s.acquire.mockRejectedValue(new Error('postgres://secret'))
    await expect(s.client.request('games','fields id;',schema)).rejects.toThrow('budget unavailable')
    expect(s.fetcher).not.toHaveBeenCalled()
})
it('rejects an endpoint outside the allowlist before auth or network',async()=>{
    const s=setup([])
    await expect(s.client.request('../evil','',schema)).rejects.toThrow('endpoint')
    expect(s.getToken).not.toHaveBeenCalled()
})
it('holds a lease until response validation finishes',async()=>{
    let finish!: (v: unknown)=>void
    const response=Response.json([]);vi.spyOn(response,'json').mockImplementation(()=>new Promise(r=>{finish=r}))
    const s=setup([response]);const promise=s.client.request('games','fields id;',schema)
    await vi.waitFor(()=>expect(finish).toBeDefined());expect(s.release).not.toHaveBeenCalled()
    finish([]);await promise;expect(s.release).toHaveBeenCalledOnce()
})

it('bounds network and 5xx retries to three attempts',async()=>{
    vi.useFakeTimers()
    const s=setup([new Response('',{status:503}),new Response('',{status:500}),new Response('',{status:502})])
    const result=s.client.request('games','fields id;',schema).catch(e=>e)
    await vi.runAllTimersAsync();expect((await result).message).toContain('502')
    expect(s.fetcher).toHaveBeenCalledTimes(3);expect(s.release).toHaveBeenCalledTimes(3)
})
it('aborts stalled requests after ten seconds and releases every lease',async()=>{
    vi.useFakeTimers()
    const s=setup([])
    s.fetcher.mockImplementation((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('private URL')))))
    const result=s.client.request('games','fields id;',schema).catch(e=>e)
    await vi.runAllTimersAsync()
    expect((await result).message).toContain('timed out')
    expect((await result).message).not.toContain('private URL')
    expect(s.fetcher).toHaveBeenCalledTimes(3);expect(s.release).toHaveBeenCalledTimes(3)
})
it('does not dispatch an expired reservation',async()=>{
    const s=setup([]);s.acquire.mockResolvedValue({dispatchBefore:performance.now()-1,release:s.release})
    await expect(s.client.request('games','fields id;',schema)).rejects.toThrow('reservation expired')
    expect(s.fetcher).not.toHaveBeenCalled();expect(s.release).toHaveBeenCalledOnce()
})
