// @vitest-environment jsdom
import type { SettingsData } from '@screenpeak/shared/api/me'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsScreen, SettingsSkeleton, type SettingsScreenProps } from './settings-screen'

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel }, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    disabled,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean, disabled?: boolean, checked?: boolean }
    disabled?: boolean
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole ?? 'button',
      'aria-checked': accessibilityState?.checked,
      'aria-pressed': accessibilityState?.selected,
      disabled: disabled || accessibilityState?.disabled,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children, accessibilityLabel, role }: { children?: React.ReactNode, accessibilityLabel?: string, role?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel, role }, children),
  Text: ({ children, accessibilityRole, role }: { children?: React.ReactNode, accessibilityRole?: string, role?: string }) =>
    React.createElement('span', { role: role ?? (accessibilityRole === 'header' ? 'heading' : undefined) }, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  RefreshControl: () => null,
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  TextInput: Object.assign(({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel?: string
    value?: string
    onChangeText?: (value: string) => void
  }) => React.createElement('input', {
    'aria-label': accessibilityLabel,
    value: value ?? '',
    onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
  }), { State: { currentlyFocusedInput: () => null } }),
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

afterEach(() => {
  cleanup()
})

const SETTINGS: SettingsData = {
  username: 'peek',
  avatar_url: null,
  selected_title: null,
  created_at: '2025-03-14 09:30:00+00',
  email: 'peek@example.com',
  default_list_public: true,
  library_public: false,
  loadout_public: true,
  steam_linked: false,
}

function renderScreen(props: Partial<SettingsScreenProps> = {}) {
  const handlers = {
    onChangePhoto: vi.fn(async () => null as string | null),
    onSaveTitle: vi.fn(async () => null as string | null),
    onSaveBio: vi.fn(async () => null as string | null),
    onSaveUsername: vi.fn(async () => null as string | null),
    onChangeEmail: vi.fn(async () => ({ ok: true, message: 'Check new@example.com for a link.' })),
    onChangePassword: vi.fn(async () => null as string | null),
    onPrivacy: vi.fn(async () => null as string | null),
    onSignOut: vi.fn(async () => null as string | null),
    onDeleteAccount: vi.fn(async () => null as string | null),
    onLinkSteam: vi.fn(async () => null as string | null),
    onResyncSteam: vi.fn(),
    onUnlinkSteam: vi.fn(async () => null as string | null),
  }
  render(
    <SettingsScreen
      settings={SETTINGS}
      bio="Roguelikes, mostly."
      titles={['Soulslike Sicko', '#1 Hades Fan']}
      onBack={() => undefined}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('settings Steam connection', () => {
  it('links Steam when it is not linked, and shows why linking failed', async () => {
    const onLinkSteam = vi.fn(async () => "Couldn't link Steam. Try again." as string | null)
    renderScreen({ onLinkSteam })
    expect(screen.getByRole('heading', { name: 'Connections' })).toBeTruthy()
    expect(screen.getByText('Not linked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Re-sync' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Link Steam' }))
    await waitFor(() => expect(onLinkSteam).toHaveBeenCalledTimes(1))
    expect(await screen.findByText("Couldn't link Steam. Try again.")).toBeTruthy()
  })

  it('re-syncs a linked account, and unlinks it only after asking', async () => {
    const { onResyncSteam, onUnlinkSteam } = renderScreen({ settings: { ...SETTINGS, steam_linked: true } })
    expect(screen.getByText('Linked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Link Steam' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Re-sync' }))
    expect(onResyncSteam).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Steam' }))
    expect(screen.getByText('This will not change your library. Games you imported from Steam stay in it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it linked' }))
    expect(onUnlinkSteam).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Steam' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Steam account' }))
    await waitFor(() => expect(onUnlinkSteam).toHaveBeenCalledTimes(1))
  })
})

describe('settings', () => {
  it('shows the account, the profile fields, and each privacy flag', () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getAllByText('Title-less Noob')).toHaveLength(2)
    expect(screen.getByText('Member since 3/14/2025')).toBeTruthy()
    expect(screen.getByText('Roguelikes, mostly.')).toBeTruthy()
    expect(screen.getByText('peek@example.com')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Library public' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Loadout public' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Default list public' }).textContent).toContain('Public')
  })

  it('picks a title from the player’s choices', async () => {
    const { onSaveTitle } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Change title' }))
    fireEvent.click(screen.getByRole('button', { name: '#1 Hades Fan' }))
    await waitFor(() => expect(onSaveTitle).toHaveBeenCalledWith('#1 Hades Fan'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Soulslike Sicko' })).toBeNull())
  })

  it('counts the bio and refuses one over 500 characters', async () => {
    const { onSaveBio } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Edit bio' }))
    expect(screen.getByText('19/500')).toBeTruthy()
    type('Bio', 'x'.repeat(501))
    fireEvent.click(screen.getByRole('button', { name: 'Save bio' }))
    expect(screen.getByText('Bio is limited to 500 characters')).toBeTruthy()
    expect(onSaveBio).not.toHaveBeenCalled()
    type('Bio', 'Metroidvanias now.')
    fireEvent.click(screen.getByRole('button', { name: 'Save bio' }))
    await waitFor(() => expect(onSaveBio).toHaveBeenCalledWith('Metroidvanias now.'))
  })

  it('checks a new username first, then shows a server refusal with Retry', async () => {
    const onSaveUsername = vi.fn(async () => 'That username is taken.' as string | null)
    renderScreen({ onSaveUsername })
    fireEvent.click(screen.getByRole('button', { name: 'Change username' }))
    type('New username', 'no spaces')
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }))
    expect(screen.getByText('Usernames can only contain letters, numbers, and underscores')).toBeTruthy()
    expect(onSaveUsername).not.toHaveBeenCalled()
    type('New username', ' nova_7 ')
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }))
    expect(await screen.findByText('That username is taken.')).toBeTruthy()
    expect(onSaveUsername).toHaveBeenCalledWith('nova_7')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(onSaveUsername).toHaveBeenCalledTimes(2))
  })

  it('sends an email confirmation link and says what happens next', async () => {
    const { onChangeEmail } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }))
    expect(screen.getByText('Current email: peek@example.com')).toBeTruthy()
    type('New email', 'new@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }))
    expect(await screen.findByText('Check new@example.com for a link.')).toBeTruthy()
    expect(onChangeEmail).toHaveBeenCalledWith('new@example.com')
  })

  it('changes the password only when the new one is typed twice', async () => {
    const { onChangePassword } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    type('Current password', 'oldpassword')
    type('New password', 'newpassword')
    type('Confirm new password', 'newpasswrd')
    fireEvent.click(screen.getAllByRole('button', { name: 'Change password' }).at(-1)!)
    expect(screen.getByText("Passwords don't match")).toBeTruthy()
    expect(onChangePassword).not.toHaveBeenCalled()
    type('Confirm new password', 'newpassword')
    fireEvent.click(screen.getAllByRole('button', { name: 'Change password' }).at(-1)!)
    expect(await screen.findByText('Password changed.')).toBeTruthy()
    expect(onChangePassword).toHaveBeenCalledWith('oldpassword', 'newpassword', 'newpassword')
  })

  it('shows a wrong current password and keeps the form', async () => {
    renderScreen({ onChangePassword: vi.fn(async () => 'Current password is incorrect.') })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    type('Current password', 'wrongpassword')
    type('New password', 'newpassword')
    type('Confirm new password', 'newpassword')
    fireEvent.click(screen.getAllByRole('button', { name: 'Change password' }).at(-1)!)
    expect(await screen.findByText('Current password is incorrect.')).toBeTruthy()
    expect(screen.getByLabelText('Current password')).toBeTruthy()
  })

  it('flips a privacy flag and shows why a flip failed', async () => {
    const onPrivacy = vi.fn(async () => 'Too many requests. Try again in 5 seconds.' as string | null)
    renderScreen({ onPrivacy })
    fireEvent.click(screen.getByRole('switch', { name: 'Library public' }))
    await waitFor(() => expect(onPrivacy).toHaveBeenCalledWith('Library', true))
    expect(await screen.findByText('Too many requests. Try again in 5 seconds.')).toBeTruthy()
  })

  it('asks before deleting the account, and Keep my account does not delete', async () => {
    const { onDeleteAccount } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByText('This permanently deletes your account and all your data. This cannot be undone.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }))
    expect(onDeleteAccount).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!)
    await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(1))
  })

  it('keeps the delete sheet open with the reason when it fails', async () => {
    renderScreen({ onDeleteAccount: vi.fn(async () => 'Could not delete the account. Try again.') })
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!)
    expect(await screen.findByText('Could not delete the account. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep my account' })).toBeTruthy()
  })

  it('says Uploading while the photo goes up, then why it failed', async () => {
    let finish: (value: string | null) => void = () => undefined
    const onChangePhoto = vi.fn(() => new Promise<string | null>((resolve) => { finish = resolve }))
    renderScreen({ onChangePhoto })
    fireEvent.click(screen.getByRole('button', { name: 'Change photo' }))
    const busy = await screen.findByRole('button', { name: 'Uploading…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    finish('Image must be under 2MB')
    expect(await screen.findByText('Image must be under 2MB')).toBeTruthy()
  })

  it('signs out', async () => {
    const { onSignOut } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1))
  })

  it('has a loading skeleton', () => {
    render(<SettingsSkeleton onBack={() => undefined} />)
    expect(screen.getByLabelText('Loading settings')).toBeTruthy()
  })
})
