import { describe, expect, it } from 'vitest'

import { apiBaseUrlFromEnv, devApiRuntime } from './api-base'

const RELEASE_MESSAGE =
  'This release build has no API base URL. Set EXPO_PUBLIC_API_URL to the ScreenPeak site URL before shipping.'

describe('devApiRuntime', () => {
  it('follows __DEV__ when the runtime defines it, and stays in dev for unit tests', () => {
    expect(devApiRuntime(true, 'production')).toBe(true)
    expect(devApiRuntime(false, 'development')).toBe(false)
    expect(devApiRuntime(undefined, 'test')).toBe(true)
    expect(devApiRuntime(undefined, 'production')).toBe(false)
  })
})

describe('apiBaseUrlFromEnv', () => {
  it('uses the dev machine LAN host from Expo hostUri, on the Next dev port', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '192.168.1.20:8081' } },
    )).toBe('http://192.168.1.20:3000')
  })

  it('drops an Expo scheme and keeps an IPv6 host', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: 'exp://[::1]:8081' } },
    )).toBe('http://[::1]:3000')
  })

  it('lets EXPO_PUBLIC_API_URL override the derived host, including a trailing slash', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3210/' },
      { expoConfig: { hostUri: '192.168.1.20:8081' } },
    )).toBe('http://127.0.0.1:3210')
  })

  it('treats a blank override as unset and still derives the dev host', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true, EXPO_PUBLIC_API_URL: '   ' },
      { expoConfig: { hostUri: 'localhost:8081' } },
    )).toBe('http://localhost:3000')
  })

  it('names the missing dev host instead of guessing one', () => {
    const message = 'No dev API host: Expo hostUri is missing. Set EXPO_PUBLIC_API_URL to the computer running npm run dev.'
    expect(() => apiBaseUrlFromEnv({ dev: true }, { expoConfig: null })).toThrow(message)
    expect(() => apiBaseUrlFromEnv({ dev: true }, { expoConfig: { hostUri: '   ' } })).toThrow(message)
    expect(() => apiBaseUrlFromEnv({ dev: true })).toThrow(message)
  })

  it('uses a private, loopback, link-local, localhost, or .local dev host', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '10.1.2.3:8081' } },
    )).toBe('http://10.1.2.3:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '127.0.0.1:8081' } },
    )).toBe('http://127.0.0.1:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '172.16.5.4:8081' } },
    )).toBe('http://172.16.5.4:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '172.31.255.255:8081' } },
    )).toBe('http://172.31.255.255:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '169.254.10.1:8081' } },
    )).toBe('http://169.254.10.1:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: 'screenpeak.local:8081' } },
    )).toBe('http://screenpeak.local:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: 'exp://[fe80::1]:8081' } },
    )).toBe('http://[fe80::1]:3000')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '[fd12:3456::1]:8081' } },
    )).toBe('http://[fd12:3456::1]:3000')
  })

  it('fails closed for a tunnel, a public host, and an unbracketed IPv6 literal', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: 'abcd.exp.direct:8081' } },
    )).toBe('')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '8.8.8.8:8081' } },
    )).toBe('')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '172.15.0.1:8081' } },
    )).toBe('')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '172.32.0.1:8081' } },
    )).toBe('')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: '::1:8081' } },
    )).toBe('')
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: 'fe80::1:8081' } },
    )).toBe('')
  })

  it('splits userinfo on @ before the port', () => {
    expect(apiBaseUrlFromEnv(
      { dev: true },
      { expoConfig: { hostUri: 'exp://dev:secret@192.168.1.20:8081' } },
    )).toBe('http://192.168.1.20:3000')
  })

  it('uses the configured site URL in a release build and ignores the Expo host', () => {
    expect(apiBaseUrlFromEnv(
      { dev: false, EXPO_PUBLIC_API_URL: 'https://screenpeak.example/' },
      { expoConfig: { hostUri: '192.168.1.20:8081' } },
    )).toBe('https://screenpeak.example')
  })

  it('throws a release-build message when no site URL is configured', () => {
    expect(() => apiBaseUrlFromEnv(
      { dev: false },
      { expoConfig: { hostUri: '192.168.1.20:8081' } },
    )).toThrow(RELEASE_MESSAGE)
  })

  it('throws in a release build unless the API URL is https', () => {
    const message = 'This release build\'s API URL must use https:.'
    expect(() => apiBaseUrlFromEnv(
      { dev: false, EXPO_PUBLIC_API_URL: 'http://screenpeak.example' },
      { expoConfig: { hostUri: '192.168.1.20:8081' } },
    )).toThrow(message)
    expect(() => apiBaseUrlFromEnv(
      { dev: false, EXPO_PUBLIC_API_URL: 'screenpeak.example' },
    )).toThrow(message)
  })
})
