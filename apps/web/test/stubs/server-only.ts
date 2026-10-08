// Vitest stand-in for the `server-only` package. The real one throws unless the
// importer is bundled as a React Server Component — the guard that keeps db/
// loaders out of client bundles in the Next build. Tests run modules directly in
// Node, where that guard has nothing to protect, so the alias in
// vitest.config.mts points here. The Next build still uses the real package.
export {}
