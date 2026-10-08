// Adds jest-dom matchers (toBeInTheDocument, toHaveAttribute, ...) to `expect`.
// Safe to load in the node environment too — it only calls expect.extend.
import '@testing-library/jest-dom/vitest'

// Set dummy DATABASE_POOL_URL for imports that require it
if (!process.env.DATABASE_POOL_URL) {
    process.env.DATABASE_POOL_URL = 'postgresql://dummy:dummy@localhost/dummy'
}
