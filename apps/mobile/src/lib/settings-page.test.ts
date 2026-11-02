import type { SettingsData } from '@screenpeak/shared/api/me'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { describe, expect, it } from 'vitest'

import {
  bioProblem,
  emailProblem,
  memberSinceLine,
  passwordChangeProblem,
  shownTitle,
  titleChoices,
  usernameProblem,
  withPrivacy,
} from './settings-page'

const SETTINGS: SettingsData = {
  username: 'peek',
  avatar_url: null,
  selected_title: null,
  created_at: '2025-03-14 09:30:00.123+00',
  email: 'peek@example.com',
  default_list_public: true,
  library_public: false,
  loadout_public: true,
  steam_linked: false,
}

function profile(favorites: string[], developers: string[], owner = true): ProfilePageData {
  return {
    profile: {
      id: 'u1',
      username: 'peek',
      display_name: 'peek',
      avatar_url: null,
      created_at: null,
      selected_title: null,
      user_bio: null,
      profile_loadout_bio: null,
      library_public: true,
      loadout_public: true,
      follower_count: 0,
      following_count: 0,
    },
    library_stats: null,
    favorites: favorites.map((name, i) => ({
      id: `g${i}`,
      name,
      slug: name.toLowerCase(),
      cover_image_url: null,
      released: null,
      developer: null,
      avg_rating: null,
      user_rating: null,
    })),
    recent_reviews: [],
    rating_count: 0,
    avg_rating: null,
    viewer: owner ? { is_owner: true, is_following: false, top_developer_names: developers } : null,
  }
}

describe('settings page', () => {
  it('dates the account the way the website does, from a Postgres timestamp', () => {
    expect(memberSinceLine('2025-03-14 09:30:00.123+00')).toBe('Member since 3/14/2025')
    expect(memberSinceLine(null)).toBeNull()
  })

  it('shows the website placeholder when no title is picked', () => {
    expect(shownTitle(null)).toBe('Title-less Noob')
    expect(shownTitle('Soulslike Sicko')).toBe('Soulslike Sicko')
  })

  it('offers the genre titles plus one per favorite game and top developer', () => {
    const titles = titleChoices(profile(['Hades'], ['Supergiant Games']))
    expect(titles).toContain('Soulslike Sicko')
    expect(titles).toContain('#1 Hades Fan')
    expect(titles.at(-1)).toBe('#1 Supergiant Games Fan')
    expect(titleChoices(undefined)).toHaveLength(titleChoices(profile([], [])).length)
  })

  it('checks a new username against the website rules and the current one', () => {
    expect(usernameProblem('ab', 'peek')).toBe('Username must be at least 3 characters')
    expect(usernameProblem('has space', 'peek')).toBe('Usernames can only contain letters, numbers, and underscores')
    expect(usernameProblem(' peek ', 'peek')).toBe("That's already your username.")
    expect(usernameProblem('nova_7', 'peek')).toBeNull()
  })

  it('checks a new email and that it changed', () => {
    expect(emailProblem('', 'peek@example.com')).toBe('Email is required')
    expect(emailProblem('nope', 'peek@example.com')).toBe('Enter a valid email address')
    expect(emailProblem('Peek@Example.com ', 'peek@example.com')).toBe("That's already your email.")
    expect(emailProblem('new@example.com', 'peek@example.com')).toBeNull()
  })

  it('limits the bio to 500 characters', () => {
    expect(bioProblem('x'.repeat(500))).toBeNull()
    expect(bioProblem('x'.repeat(501))).toBe('Bio is limited to 500 characters')
  })

  it('needs the current password and a new one typed twice', () => {
    expect(passwordChangeProblem('', 'newpassword', 'newpassword')).toBe('Enter your current password.')
    expect(passwordChangeProblem('oldpassword', 'newpassword', 'newpasswrd')).toBe("Passwords don't match")
    expect(passwordChangeProblem('oldpassword', 'short', 'short')).toBe('Password must be at least 8 characters')
    expect(passwordChangeProblem('samepassword', 'samepassword', 'samepassword')).toBe('Pick a password you are not using now.')
    expect(passwordChangeProblem('oldpassword', 'newpassword', 'newpassword')).toBeNull()
  })

  it('flips one privacy flag and leaves the rest', () => {
    expect(withPrivacy(SETTINGS, 'Library', true)).toEqual({ ...SETTINGS, library_public: true })
    expect(withPrivacy(SETTINGS, 'Default List', false)).toEqual({ ...SETTINGS, default_list_public: false })
    expect(withPrivacy(SETTINGS, 'Loadout', false)).toEqual({ ...SETTINGS, loadout_public: false })
  })
})
