import { afterEach, describe, expect, it, vi } from 'vitest'

import { plus1, subscribePlus1 } from './plus1'

describe('plus1', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tells every subscriber a unique id and the uppercased label', () => {
    const first = vi.fn()
    const second = vi.fn()
    subscribePlus1(first)
    subscribePlus1(second)
    plus1('RATED')
    expect(first).toHaveBeenCalledWith({ id: expect.any(Number), text: '+1 RATED' })
    expect(second).toHaveBeenCalledWith({ id: expect.any(Number), text: '+1 RATED' })
    const [[firstChip]] = first.mock.calls
    const [[secondChip]] = second.mock.calls
    expect(firstChip.id).toBe(secondChip.id)
  })

  it('omits the label when none is given, and honours a custom count', () => {
    const listener = vi.fn()
    subscribePlus1(listener)
    plus1()
    plus1('LISTED', 3)
    expect(listener).toHaveBeenNthCalledWith(1, { id: expect.any(Number), text: '+1' })
    expect(listener).toHaveBeenNthCalledWith(2, { id: expect.any(Number), text: '+3 LISTED' })
  })

  it('assigns a new id to every chip, even with the same label', () => {
    const listener = vi.fn()
    subscribePlus1(listener)
    plus1('SAVED')
    plus1('SAVED')
    const [[a], [b]] = listener.mock.calls
    expect(a.id).not.toBe(b.id)
  })

  it('stops notifying a listener once it unsubscribes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePlus1(listener)
    plus1('FAVORITED')
    unsubscribe()
    plus1('FAVORITED')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
