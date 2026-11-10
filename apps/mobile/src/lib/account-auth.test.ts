import { describe, expect, it, vi } from 'vitest'

import { changeEmail, changePassword, type AccountAuthClient } from './account-auth'

function client(overrides: { signIn?: { message: string, code?: string } | null, update?: { message: string } | null } = {}) {
  const auth = {
    signInWithPassword: vi.fn(async () => ({ error: overrides.signIn ?? null })),
    updateUser: vi.fn(async () => ({ error: overrides.update ?? null })),
  }
  return { auth } satisfies AccountAuthClient
}

describe('changePassword', () => {
  it('checks the current password, then sets the new one', async () => {
    const c = client()
    expect(await changePassword(c, 'peek@example.com', 'oldpassword', 'newpassword', 'newpassword')).toBeNull()
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'peek@example.com', password: 'oldpassword' })
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' })
  })

  it('stops at a form problem without a request', async () => {
    const c = client()
    expect(await changePassword(c, 'peek@example.com', 'oldpassword', 'newpassword', 'other')).toBe("Passwords don't match")
    expect(c.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('says the current password is wrong and leaves the password alone', async () => {
    const c = client({ signIn: { message: 'Invalid login credentials', code: 'invalid_credentials' } })
    expect(await changePassword(c, 'peek@example.com', 'wrongpass', 'newpassword', 'newpassword')).toBe('Current password is incorrect.')
    expect(c.auth.updateUser).not.toHaveBeenCalled()
  })

  it('passes on any other Auth failure', async () => {
    const c = client({ update: { message: 'Password is known to be weak and easy to guess' } })
    expect(await changePassword(c, 'peek@example.com', 'oldpassword', 'password1', 'password1'))
      .toBe('Password is known to be weak and easy to guess')
  })
})

describe('changeEmail', () => {
  it('asks Auth to change the address and says to confirm it', async () => {
    const c = client()
    expect(await changeEmail(c, ' New@Example.com ', 'peek@example.com')).toEqual({
      ok: true,
      message: 'Check New@Example.com for a link to confirm the change. Your email stays the same until you do.',
    })
    expect(c.auth.updateUser).toHaveBeenCalledWith({ email: 'New@Example.com' })
  })

  it('stops at a bad or unchanged address without a request', async () => {
    const c = client()
    expect(await changeEmail(c, 'peek@example.com', 'peek@example.com')).toEqual({ ok: false, message: "That's already your email." })
    expect(c.auth.updateUser).not.toHaveBeenCalled()
  })

  it('passes on the Auth failure', async () => {
    const c = client({ update: { message: 'A user with this email address has already been registered' } })
    expect(await changeEmail(c, 'taken@example.com', 'peek@example.com'))
      .toEqual({ ok: false, message: 'A user with this email address has already been registered' })
  })
})
