# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-10-30

### Changed

- Releases are staged on npm by GitHub Actions (trusted publishing) and approved
  with 2FA; the README has a "Releasing" section. No code change.
- 1.0.1 was tagged but never reached npm: its release run failed before the build.

## [1.0.0] - 2026-10-30

### Added

- Extracted from the init-project template; no behaviour change. The composables,
  their options, the `dataTable` config key and the request payload are the same
  as in the copied module folder.
- `@vueuse/nuxt` (needed for `useDebounceFn` in `useTableSearchInput`) is now a
  declared peer dependency and a Nuxt module dependency: it is
  enabled automatically when the project does not list it in `modules`.
- Requires Nuxt 4.1 or newer (module dependencies need it).
- The `#imports` stand-in for Node tests is published as
  `@smi-82/nuxt-table-state/testing/nuxt-imports`, and the composables are
  importable as `@smi-82/nuxt-table-state/runtime/*`.

[1.0.2]: https://github.com/SMI-82/nuxt-table-state/releases/tag/v1.0.2
[1.0.0]: https://github.com/SMI-82/nuxt-table-state/releases/tag/v1.0.0
