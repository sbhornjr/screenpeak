import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const requireUser = vi.fn()
const deleteAccount = vi.fn()
vi.mock('@/lib/auth', () => ({ requireUser }))
vi.mock('@/lib/account-deletion', () => ({ deleteAccount }))

const { DELETE } = await import('@/app/api/delete-account/route')

beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: 'user-1', email: 'peek@screenpeak.test' })
    deleteAccount.mockReset().mockResolvedValue({ error: null })
})

describe('DELETE /api/delete-account', () => {
    it('does not send Access-Control-Allow-Origin — this route still uses the session cookie', async () => {
        const res = await DELETE(new NextRequest('http://localhost/api/delete-account', { method: 'DELETE' }), { params: Promise.resolve({}) })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true })
        expect(res.headers.get('access-control-allow-origin')).toBeNull()
        expect(deleteAccount).toHaveBeenCalledWith('user-1')
    })
})
