import { describe, expect, it } from 'vitest'

import { signUpAuthBody } from './sign-up'

describe('signUpAuthBody', () => {
  it('passes a trimmed username in user metadata', () => {
    expect(signUpAuthBody('horn.flakes+peek@mail.grokbot.com', 'peekpeek1', ' peek ')).toEqual({
      ok: true,
      body: {
        email: 'horn.flakes+peek@mail.grokbot.com',
        password: 'peekpeek1',
        options: { data: { username: 'peek' } },
      },
    })
  })

  it('rejects the email local-part when it is not a username', () => {
    expect(signUpAuthBody('horn.flakes+peek@mail.grokbot.com', 'peekpeek1', 'horn.flakes+peek')).toEqual({
      ok: false,
      error: 'Usernames can only contain letters, numbers, and underscores',
    })
  })
})
