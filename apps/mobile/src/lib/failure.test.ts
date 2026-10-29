import { describe, expect, it } from 'vitest'

import { ApiClientError } from '@screenpeak/shared/api/client'
import { actionFailure, loadFailure } from './failure'

describe('actionFailure', () => {
  it('names the wait when the write is rate limited', () => {
    expect(actionFailure(new ApiClientError(429, 'rate_limited', 'Too many requests. Try again soon.', 8)))
      .toBe('Too many requests. Try again in 8 seconds.')
    expect(actionFailure(new ApiClientError(429, 'rate_limited', 'Too many requests. Try again soon.', null)))
      .toBe('Too many requests. Try again soon.')
  })

  it('shows the server message for any other failure', () => {
    expect(actionFailure(new ApiClientError(400, 'invalid_request', 'Give the list a name.')))
      .toBe('Give the list a name.')
    expect(actionFailure('nope')).toBe('Something went wrong.')
  })
})

describe('loadFailure', () => {
  it('titles a 429 as a rate limit and anything else as a failed load', () => {
    expect(loadFailure(new ApiClientError(429, 'rate_limited', 'Too many requests.', 3)))
      .toEqual({ title: 'Too many requests', body: 'Too many requests. Try again in 3 seconds.' })
    expect(loadFailure(new ApiClientError(404, 'not_found', 'Not found.')))
      .toEqual({ title: "Couldn't load this screen", body: 'Not found.' })
  })
})
