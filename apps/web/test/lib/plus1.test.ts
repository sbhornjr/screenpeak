// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { plus1 } from '@/lib/plus1'

describe('plus1 (browser)', () => {
    let received: CustomEvent[] = []
    const listener = (e: Event) => received.push(e as CustomEvent)

    afterEach(() => {
        window.removeEventListener('screenpeak:plus1', listener)
        received = []
    })

    it('dispatches an screenpeak:plus1 event carrying the label and count', () => {
        window.addEventListener('screenpeak:plus1', listener)
        plus1('SAVED', 3)

        expect(received).toHaveLength(1)
        expect(received[0].type).toBe('screenpeak:plus1')
        expect(received[0].detail).toEqual({ label: 'SAVED', n: 3 })
    })

    it('defaults the count to 1 and allows an undefined label', () => {
        window.addEventListener('screenpeak:plus1', listener)
        plus1()

        expect(received[0].detail).toEqual({ label: undefined, n: 1 })
    })
})
