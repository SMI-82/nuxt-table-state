# @smi-82/nuxt-table-state

Headless Nuxt module for list and table screens. It auto-imports
`useFilterManager`, `useSearch`, `useOrder`, `usePagination`,
`useTableFilterDraft` and `useTableSearchInput`, which keep a table's page, page
size, order, search and filters in shared state and, on request, in the URL.

The module registers no components and ships no UI: your project provides its own
table controls and binds them to these composables. It depends only on Nuxt's
auto-imports, `vue`, `vue-router` and `@vueuse/nuxt` (for `useDebounceFn`).

## Install

```sh
npm i -E @smi-82/nuxt-table-state
```

Add it to `modules` in `nuxt.config`, after `@vueuse/nuxt`:

```ts
export default defineNuxtConfig({
  modules: ['@vueuse/nuxt', '@smi-82/nuxt-table-state'],
  dataTable: {
    // optional, see "Module options"
  },
});
```

`@vueuse/nuxt` (13 or newer) is a peer dependency. The module also declares it as
a Nuxt module dependency, so Nuxt enables it even when it is missing
from `modules`; listing it explicitly is still recommended so that its types and
options stay visible in your config. Requires Nuxt 4.1 or newer.

## Usage

Enable URL persistence per list before starting its first request:

```js
const fm = useFilterManager(`projects:${useRoute().path}`, {
  sort: { by: 'id', direction: 'desc' },
  perPage: 20,
  url: {
    prefix: 'projects',
    sortFields: ['id', 'name'],
    searchGroups: ['all', 'name'],
    filterKeys: ['category', 'status'],
  },
});

const { data, refresh } = useFetch('/api/projects/search', {
  method: 'POST',
  body: {},
  onRequest({ options }) {
    options.body = { ...options.body, table_data: fm.queryParams() };
  },
});
fm.setRefetch(refresh);
const { search, searchGroup } = useSearch(fm);
```

The request payload (`queryParams()`) has the shape `page`, `perPage`,
`sort: { by, direction }`, `search: { val, group }`, `filters` and `meta`.
`perPage: 0` means unpaginated (`isPaginated.value === false`); hide the pager in
that mode. Omitting `url` keeps the state in memory only, with reference-counted
cleanup. The manager keeps its own copy of `options.filters`, so later edits never
reach the caller's object.

## Module options

Project-wide defaults for every table's URL limits, set in `nuxt.config`:

```ts
export default defineNuxtConfig({
  dataTable: {
    allowUnpaginated: false, // links may not ask for every row (perPage=0); default true
    maxPerPage: 100,         // links asking for more rows are capped; default no cap
  },
});
```

The module publishes them as `runtimeConfig.public.dataTable` (a value set there
directly, or through `NUXT_PUBLIC_DATA_TABLE_*` env variables, wins over the module
option). A table's own `url.allowUnpaginated` / `url.maxPerPage` override both.
Without any config the defaults apply. These limits only govern what a **link**
may request; `perPage` declared in code and `setPerPage()` are not checked.

## API reference

### `useFilterManager(key, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `sort` | `{ by: '', direction: 'asc' }` | Default order (`defaultSort`). |
| `filters` | `{}` | Default filters; copied, never shared with the caller. |
| `searchGroup` | `'all'` | Default search scope. |
| `perPage` | `10` | Default page size; `0` = unpaginated. |
| `url` | — | Opt-in URL persistence, see below. |

`url` options:

| Option | Default | Meaning |
| --- | --- | --- |
| `prefix` | `'t'` | Parameter namespace; unique per table on a route. |
| `sortFields` | required | Sort columns a link may select. |
| `searchGroups` | required | Search scopes a link may select. |
| `filterKeys` | required | Filters a link may set. |
| `filterTypes` | `{}` | Non-default filter shapes (see "URL and filters"). |
| `legacyPage` | `prefix === 't'` | Read and migrate a bare `?page=`. |
| `sortDirections` | `['asc', 'desc']` | Directions a link may select. Add `'both'` only for a table whose backend accepts a neutral sort; otherwise `direction=both` decodes to the default order. |
| `allowUnpaginated` | module option, else `true` | Accept `perPage=0` from a link. |
| `maxPerPage` | module option, else no cap | Cap a page size requested by a link. |

Returned members:

- State (computed refs): `page`, `perPage`, `isPaginated`, `sort`, `effectiveSort`,
  `search`, `filters`, `hasFilters`, `isDefault`, `urlResetKey`, `flag`.
- Plain values: `key`, `defaultSort`. Function: `sortDirection(column)`.
- Edits without a request: `setPage`, `setPerPage`, `setSort(by, direction?)`,
  `setSearch(val)`, `setSearchGroup(group)`, `setFilter(key, value)`,
  `setFilterItem(key, item, include)`, `clearFilters`, `patch(partial)`.
- Edits that refresh once: `order({ key, direction })`, `changePage(page)`,
  `applyFilters()`, `cancelFilters()`, `reset()`, `trigger()`.
- Wiring: `queryParams()` (the request payload), `setRefetch(fn)`.

`flag` flips on every `trigger()` (including Back/Forward restores and every
action that refreshes). Watch it to react to "the table was requested again"; it
is client-only and never part of `queryParams()`.

### Other composables

- `useSearch(fm)` → `{ search(value), searchGroup(group) }`. `search` trims and
  refreshes; `searchGroup` refreshes only when there is typed text to re-run.
- `useOrder(fields, defField?)` → `{ order, domRefs }`, for uncontrolled header
  arrows that reset each other.
- `usePagination({ totalItems, itemsPerPage, currentPage, cntBtns, onChange, controlled })`
  → `{ currP, cntPages, pageButtons, changePage, incDecPage }`.
- `useTableFilterDraft(fm)` → `{ draftFilters, onFilterToggle, applyFilters, cancelFilters }`
  (see "Controls and drafts").
- `useTableSearchInput(props, emit)` → `{ inputValue, onInput, clearInput }`
  (see "Controls and drafts").

## Sorting and reset

The declared `sort` is the default order, exposed as `defaultSort`. An empty `by`
or a neutral `'both'` direction means "the default order": `effectiveSort` is the
order actually applied to the rows, and `sortDirection(key)` returns that order's
direction for its column and `'both'` for every other one. Drive header arrows
from them so the default column shows its arrow even when nothing was clicked
(`SortArrow` stands for your own header component):

```vue
<SortArrow
  controlled
  sort-key="name"
  :direction="fm.sortDirection('name')"
  @order="fm.order"
/>
```

`order({ key, direction })` applies the click and refreshes once: `asc`/`desc`
sort by that column; neutral on another column restores the default order;
neutral on the default column turns it to `asc`, so that column only toggles
between the two directions. A `direction=both` in the URL decodes to the default
order unless the table lists `'both'` in `url.sortDirections`.

`reset()` brings filters (back to the declared `options.filters`), search (empty
text, default search group), order and page back to the defaults, refreshes once
and drops those parameters from the URL. The page size is deliberately kept: it
is a personal preference, not a table state. `isDefault` is true while the table
matches those defaults (page size aside), so a reset button only appears when
there is something to reset:

```vue
<button v-if="!fm.isDefault.value" @click="fm.reset">Reset</button>
```

These defaults belong to the call that declared `sort`, `filters` and
`searchGroup`: take `order`, `reset` and `isDefault` from that instance. A second
`useFilterManager(key)` call without options sees generic defaults.

## URL and filters

Example:

```text
/projects?projects.page=3&projects.perPage=20&projects.sort=name&projects.direction=asc&projects.searchGroup=name&projects.q=website&projects.f.category=2
```

Defaults are omitted. Removing a parameter restores its default. Only declared
sort fields, sort directions, search groups and filter keys are accepted. Filter
IDs are positive integers by default; pass numbers from checkbox events so
restored values can be unchecked. Optional `filterTypes` preserves other API
shapes:

```js
filterTypes: {
  state: { type: 'enum', values: ['active', 'archived'] }, // scalar string
  for_cloning: { type: 'integer', min: 0 }, // integer array including zero
  color: { type: 'string' }, // string array including empty strings
},
```

Declare these keys in `filterKeys` too. Unrelated query parameters and the hash
are preserved. The default prefix `t` reads/migrates legacy `?page=3`; named
prefixes ignore it unless `legacyPage: true` is explicitly set for one table.

Match the URL limits to what the endpoint accepts: an endpoint with a page-size
cap gets `maxPerPage`, one that cannot return every row gets
`allowUnpaginated: false`, and a SQL sort that rejects a neutral direction keeps
the default `sortDirections`. A page-size selector offering "all" should respect
the same limits.

`trigger()` writes state and invokes the registered refresh callback once.
Search changes replace browser history; pagination, sorting and applied filters
push entries. `setFilter`/`setFilterItem` keep edits pending until `applyFilters()`
or another action calls `trigger()`. Back/Forward restores the affected table and
refreshes it once. Changing the field of an empty search updates the URL without
a request or applying pending filters. Local lists may omit `setRefetch`.

## Multiple tables and controls

Give each independent table a unique manager key and stable `url.prefix`, e.g.
`projects` and `members`. Writes share a router queue and merge with the latest
query, so rapid edits cannot overwrite a neighbour's state. Duplicate prefixes
on one route raise an error. For repeated group tables, include the stable group
ID in the prefix, not the row index.

Create each manager once in the page and pass it to child controls/tables. If
blocks can move between columns, keep their managers in the page so remounting a
block preserves its pending state. Use route paths/entity IDs for manager keys;
do not key the page or manager by `route.fullPath` because table URL changes must
not remount the page.

URL restoration must update controls without emitting new user changes:

- Bind search text to `fm.search.value.val`, checkboxes to `fm.filters.value` (or
  to a draft, below), and both desktop arrows and mobile selects to
  `fm.effectiveSort.value` (arrows via `fm.sortDirection(key)`); send their
  changes to `fm.order`.
- Use a computed getter/setter for a sort select; trigger only from the setter.
  If values encode `field_direction`, split on the final underscore.
- Debounced search inputs should cancel pending input when this table's
  `fm.urlResetKey.value` changes. Using the entire route cancels another table's
  typing.
- Call `usePagination` with `controlled: true`, reactive `currentPage`,
  `itemsPerPage` and `totalItems`, and `onChange: fm.changePage`. Programmatic
  restoration then emits no change and preserves the requested page while totals
  load. Keep navigation available when the current page exceeds the new total;
  render the pager even when the fetched page is empty, so a stale link can
  return to page 1.
- In controlled mode, bind the search/filter/sort props in both mobile and desktop
  views; a one-time local `ref` will display stale values after Back/Forward.

## Controls and drafts

**Search input.** `useTableSearchInput(props, emit)` is the state of a debounced
search box. The component declares `modelValue`, `resetKey` and optionally
`delay` (ms, default 300) and emits `update:modelValue` and `search`:

```vue
<script setup>
const props = defineProps({
  modelValue: { type: String, default: '' },
  resetKey: { type: String, default: '' },
  delay: { type: Number, default: 300 },
});
const emit = defineEmits(['update:modelValue', 'search']);
const { inputValue, onInput, clearInput } = useTableSearchInput(props, emit);
</script>

<template>
  <input :value="inputValue" @input="onInput" />
  <button v-if="inputValue" type="button" @click="clearInput">×</button>
</template>
```

The page binds `:model-value="fm.search.value.val"`,
`:reset-key="fm.urlResetKey.value"` and `@search="search"` (from `useSearch`).
Only typing schedules a search. A restore (new `modelValue` or `resetKey`) and
unmounting cancel typing still waiting on the debounce, without emitting.
`clearInput()` emits the empty search at once. The value is emitted as typed;
`useSearch().search()` trims it.

**Filter drafts.** `useTableFilterDraft(fm)` keeps unapplied checkbox choices out
of requests and the URL. Bind checkboxes to `draftFilters`, forward toggles as
`onFilterToggle({ [filterKey]: { item, status } })`, and wire the panel's buttons
to the draft's `applyFilters` (commits the draft, page 1, one refresh) and
`cancelFilters` (clears applied filters, one refresh). Searches and page changes
never send unapplied choices; a Back/Forward restore replaces the draft silently.

## Tests

The package's own tests run on plain Node, without a test framework. Node 22.15
or newer is needed for `module.registerHooks`; this applies only to running these
tests, not to projects that use the package.

```sh
npm install
npm test
```

The tests exercise the actual module with Vue, VueUse and an in-memory router;
`testing/nuxt-imports.js` stands in for `#imports` (`useRuntimeConfig`
included). They cover URL restoration, payload compatibility, filter types, URL
limits and project-wide defaults, history, controlled pagination, multiple
tables, interrupted navigation, disposal, filter drafts and the debounced search
input. They do not depend on application pages or a running backend.

### Testing your own code

The stand-in is published, so a project can test its own pages and composables
the same way. Redirect `#imports` to it and import the composables by their
package paths:

```js
import { registerHooks } from 'node:module';
import { createMemoryHistory, createRouter } from 'vue-router';
import { configureNuxt } from '@smi-82/nuxt-table-state/testing/nuxt-imports';

const stub = import.meta.resolve('@smi-82/nuxt-table-state/testing/nuxt-imports');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#imports') return { url: stub, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { useFilterManager } = await import('@smi-82/nuxt-table-state/runtime/composables/useFilterManager.js');

configureNuxt(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }));
```

`configureNuxt(router, runtimeConfig?)` resets the fake app: the router, the
`useState` store and what `useRuntimeConfig()` returns. The stand-in imports
`@vueuse/core`, which arrives with `@vueuse/nuxt` under npm's hoisting; with a
strict installer (pnpm) add `@vueuse/core` as a devDependency.

## Development

```sh
npm install
npm run dev:prepare   # stub build + types
npm run dev           # playground: a URL-synced demo list
npm run prepack       # build dist/
```

### Releasing

Releases are staged by GitHub Actions (`.github/workflows/publish.yml`) through npm
trusted publishing, so no npm token is needed; a maintainer then approves the staged
version with 2FA. Add a CHANGELOG entry, then:

```sh
npm version patch     # or minor / major: bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

The workflow checks that the tag matches `package.json`, runs the tests, builds and
stages the package. Approve it on npmjs.com (package → Staged Packages) or with
`npm stage approve <stage-id>`; only then is the version published.

## Upgrading from a copied module folder

- Delete the old local folder (for example `modules/data-table/`) and install the
  package; composable names, options and the `dataTable` config key are unchanged.
- `url.sortDirections` defaults to `['asc', 'desc']`. A table whose header can
  reach a neutral `'both'` either lists `'both'` explicitly or switches to `fm.order`
  + `fm.sortDirection(key)`; otherwise a neutral direction in the URL is restored as
  the default order.
- `allowUnpaginated` defaults to true. If the backend treats `perPage = 0` as "all
  rows" and the old copy rejected it, set `dataTable: { allowUnpaginated: false }`
  in `nuxt.config`.
- Project tests that imported the old stub switch to
  `@smi-82/nuxt-table-state/testing/nuxt-imports`.

## License

[MIT](./LICENSE)
