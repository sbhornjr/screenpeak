import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireUser = vi.fn()
const generateReadout = vi.fn()
vi.mock('@/lib/auth', () => ({ requireUser }))
vi.mock('@/lib/loadout-readout', () => ({ generateReadout }))

const { POST } = await import('@/app/api/loadout/route')

const USER = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@x.test' }

async function post() {
    const handler = POST as unknown as (req: NextRequest, ctx: { params: Promise<object> }) => Promise<Response>
    const res = await handler(new NextRequest('http://localhost/api/loadout', { method: 'POST' }), { params: Promise.resolve({}) })
    return { status: res.status, body: await res.json() }
}

beforeEach(() => {
    requireUser.mockReset().mockResolvedValue(USER)
    generateReadout.mockReset()
})

// The website's LoadoutActions branches on these statuses, so they stay as they were.
describe('POST /api/loadout', () => {
    it('returns the new Read-out as text', async () => {
        generateReadout.mockResolvedValue({ ok: true, identity: 'You chase hard games.' })
        expect(await post()).toEqual({ status: 200, body: { text: 'You chase hard games.' } })
        expect(generateReadout).toHaveBeenCalledWith(USER.id)
    })

    it('keeps the website statuses for each refusal', async () => {
        const cases = [
            [{ ok: false, reason: 'too_soon', retryAfter: 10 }, 429, 'slow down'],
            [{ ok: false, reason: 'not_eligible' }, 400, 'not eligible'],
            [{ ok: false, reason: 'no_profile' }, 400, 'no profile'],
            [{ ok: false, reason: 'generation_failed' }, 502, 'generation failed'],
            [{ ok: false, reason: 'save_failed' }, 500, 'save failed'],
        ] as const
        for (const [outcome, status, error] of cases) {
            generateReadout.mockResolvedValueOnce(outcome)
            expect(await post()).toEqual({ status, body: { error } })
        }
    })
})
