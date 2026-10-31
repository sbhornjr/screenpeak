// Feature id -> drive. Each id has a recipe in ../features/<id>.md.
import { fail } from '../runtime.mjs'
import { driveGamePage } from './game-page.mjs'
import { driveGameWrites } from './game-writes.mjs'
import { driveLoadoutReadout } from './loadout-readout.mjs'
import { driveMobileExplore } from './mobile-explore.mjs'
import { driveMobileFeed } from './mobile-feed.mjs'
import { driveForgotPassword } from './mobile-forgot-password.mjs'
import { driveMobileGame } from './mobile-game.mjs'
import { driveMobileLibrary } from './mobile-library.mjs'
import { driveMobileLists } from './mobile-lists.mjs'
import { driveMobileNav } from './mobile-nav.mjs'
import { driveMobileProfile } from './mobile-profile.mjs'
import { driveSignUp } from './mobile-sign-up.mjs'
import { driveReadEndpoints } from './read-endpoints.mjs'
import { driveSearch } from './search.mjs'

// Order is the order the usage error lists them in.
export const drives = new Map([
    ['loadout-readout', driveLoadoutReadout],
    ['game-page', driveGamePage],
    ['read-endpoints', driveReadEndpoints],
    ['game-writes', driveGameWrites],
    ['search', driveSearch],
    ['mobile-nav', driveMobileNav],
    ['mobile-forgot-password', driveForgotPassword],
    ['mobile-sign-up', driveSignUp],
    ['mobile-game', driveMobileGame],
    ['mobile-profile', driveMobileProfile],
    ['mobile-library', driveMobileLibrary],
    ['mobile-lists', driveMobileLists],
    ['mobile-feed', driveMobileFeed],
    ['mobile-explore', driveMobileExplore],
])

export async function drive(feature) {
    const run = drives.get(feature)
    if (!run) fail(`Unknown feature ${feature || ''}. Mapped features: ${[...drives.keys()].join(', ')}.`)
    return run()
}
