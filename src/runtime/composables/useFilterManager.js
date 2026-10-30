import { computed, getCurrentScope, onScopeDispose, useRoute, useRuntimeConfig, useState } from '#imports';
import { useTableUrlState } from './useTableUrlState.js';

/**
 * Search scope meaning "look across every searchable column" — the default
 * narrowing applied to every list unless the page selects a narrower group.
 *
 * @type {string}
 */
const SEARCH_GROUP_ALL = 'all';

/**
 * Number of live `useFilterManager(key)` callers per key, module-level so it
 * survives across every component sharing the same key. Not reactive state —
 * it is bookkeeping for the cleanup below, not something a template reads.
 *
 * @type {Record<string, number>}
 */
const refCounts = {};

/** Copies a filter map so that edits to the copy never reach the source. */
const cloneFilters = (filters) =>
  Object.fromEntries(Object.entries(filters ?? {}).map(([name, value]) => [name, Array.isArray(value) ? [...value] : value]));

/** Serializes the filters in use; absent values and empty lists count as no filter. */
const filtersSignature = (filters) =>
  JSON.stringify(
    Object.entries(filters ?? {})
      .filter(([, value]) => value != null && !(Array.isArray(value) && value.length === 0))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/**
 * Reads the project-wide URL limits published by the module (`dataTable` in nuxt.config).
 * Missing config (e.g. outside a Nuxt app) yields no project defaults.
 *
 * @returns {{ allowUnpaginated?: boolean, maxPerPage?: number }}
 */
function projectUrlLimits() {
  try {
    return useRuntimeConfig()?.public?.dataTable ?? {};
  } catch {
    return {};
  }
}

/**
 * Shared page/sort/search/filter state of one list, plus its refetch wiring.
 *
 * State lives in `useState('data_filtering')[key]`, so every caller with the same key
 * shares it; it is dropped when the last caller's scope is disposed. Only the call that
 * declares `sort`, `filters` and `searchGroup` knows the defaults that `order`,
 * `reset` and `isDefault` use.
 *
 * @param {string} key Store key; one per independent table.
 * @param {object} [options]
 * @param {{ by: string, direction: 'asc' | 'desc' }} [options.sort] Default order.
 * @param {Record<string, unknown>} [options.filters] Default filters (copied, never shared).
 * @param {string} [options.searchGroup] Default search scope, `'all'` by default.
 * @param {number} [options.perPage] Default page size, 10 by default; 0 means unpaginated.
 * @param {object} [options.url] Opt-in URL persistence: `prefix`, `sortFields`, `searchGroups`,
 *   `filterKeys`, `filterTypes`, `legacyPage`, `sortDirections`, and the limits
 *   `allowUnpaginated` / `maxPerPage`, which override the module-wide defaults.
 * @returns The manager; see the module README for its members.
 */
export function useFilterManager(key, options = {}) {
  const store = useState('data_filtering', () => ({}));
  // The declared default order: also what an empty or neutral ('both') sort falls back to.
  const defaultSort = { ...(options.sort ?? { by: '', direction: 'asc' }) };
  const defaultFilters = cloneFilters(options.filters);
  const defaultSearchGroup = options.searchGroup ?? SEARCH_GROUP_ALL;

  if (!store.value[key]) {
    const route = useRoute();
    store.value[key] = {
      filters: cloneFilters(defaultFilters),
      search: { val: '', group: defaultSearchGroup },
      sort: { ...defaultSort },
      perPage: options.perPage ?? 10,
      page: Number(route?.query?.page) || 1,
      meta: {},
      // Flips on every trigger(); a watchable "the table was (re)requested" signal, never sent.
      flag: false,
    };
  }

  // Drop this list's state from the shared store once the LAST component using
  // this key is left, otherwise every list ever visited keeps piling up in it
  // for the whole session. Two places on the same page can share one key, so a
  // plain unconditional delete on dispose would wipe the entry out from under
  // whichever caller is still mounted — reference-count it instead.
  //
  // Called outside a component scope (e.g. a plain composable invocation),
  // onScopeDispose has nothing to hook into: don't increment the counter in
  // that case, or it would become a phantom reference that never gets
  // released and permanently blocks the entry from being cleaned up.
  if (getCurrentScope()) {
    refCounts[key] = (refCounts[key] ?? 0) + 1;

    onScopeDispose(() => {
      refCounts[key] -= 1;
      if (refCounts[key] <= 0) {
        delete refCounts[key];
        delete store.value[key];
      }
    });
  }

  const s = computed(() => store.value[key]);

  let refetch = null;
  let urlState = null;
  const setRefetch = (fn) => {
    refetch = fn;
  };
  const trigger = () => {
    s.value.flag = !s.value.flag;
    urlState?.commit();
    if (typeof refetch === 'function') refetch();
  };

  if (options.url) {
    const projectLimits = projectUrlLimits();
    urlState = useTableUrlState(
      s,
      {
        ...options.url,
        allowUnpaginated: options.url.allowUnpaginated ?? projectLimits.allowUnpaginated ?? true,
        maxPerPage: options.url.maxPerPage ?? projectLimits.maxPerPage,
        defaults: {
          page: 1,
          perPage: options.perPage ?? 10,
          sort: { ...defaultSort },
          searchGroup: defaultSearchGroup,
        },
      },
      trigger,
    );
  }

  const setPage = (page) => {
    s.value.page = page;
  };
  const setPerPage = (n) => {
    s.value.perPage = n;
    s.value.page = 1;
  };
  const setSort = (by, direction = 'asc') => {
    s.value.sort = { by, direction };
    s.value.page = 1;
  };
  const setSearch = (val) => {
    s.value.search = { ...s.value.search, val: val ?? '' };
    s.value.page = 1;
  };
  const setSearchGroup = (group) => {
    s.value.search = { ...s.value.search, group: group || SEARCH_GROUP_ALL };
    s.value.page = 1;
    if (!s.value.search.val) urlState?.commit({ search: { ...s.value.search }, page: 1 });
  };
  const setFilter = (k, value) => {
    s.value.page = 1;
    if (value == null || (Array.isArray(value) && value.length === 0)) {
      delete s.value.filters[k];
    } else {
      s.value.filters[k] = value;
    }
  };
  const setFilterItem = (k, item, include) => {
    const current = s.value.filters[k] ? [...s.value.filters[k]] : [];
    const idx = current.indexOf(item);
    if (include && idx === -1) current.push(item);
    if (!include && idx !== -1) current.splice(idx, 1);
    setFilter(k, current);
  };
  const clearFilters = () => {
    s.value.filters = {};
    s.value.page = 1;
  };

  const patch = (partial) => {
    if (!partial) return;
    if ('page' in partial) s.value.page = partial.page;
    if ('perPage' in partial) s.value.perPage = partial.perPage;
    if ('sort' in partial) s.value.sort = { ...s.value.sort, ...partial.sort };
    if ('search' in partial) s.value.search = { ...s.value.search, ...partial.search };
    if ('filters' in partial) s.value.filters = { ...partial.filters };
  };

  // Applies a header arrow click. A column reaching neutral restores the default order;
  // the default column itself only toggles asc/desc (its neutral step comes from desc).
  const order = ({ key: sortKey, direction }) => {
    if (direction !== 'both') setSort(sortKey, direction);
    else if (sortKey === defaultSort.by) setSort(sortKey, 'asc');
    else setSort(defaultSort.by, defaultSort.direction);
    trigger();
  };

  const changePage = (p) => {
    setPage(p);
    trigger();
  };
  const applyFilters = () => trigger();
  const cancelFilters = () => {
    clearFilters();
    trigger();
  };
  // Back to the declared defaults; the page size stays, it is a personal preference.
  const reset = () => {
    s.value.filters = cloneFilters(defaultFilters);
    s.value.search = { val: '', group: defaultSearchGroup };
    s.value.sort = { ...defaultSort };
    s.value.page = 1;
    trigger();
  };

  const page = computed(() => s.value.page);
  const perPage = computed(() => s.value.perPage);
  const isPaginated = computed(() => Number(s.value.perPage) > 0);
  const sort = computed(() => s.value.sort);
  // The order actually applied to the rows; header arrows and local sorting read this.
  const effectiveSort = computed(() => {
    const { by, direction } = s.value.sort ?? {};
    return by && direction !== 'both' ? { by, direction } : { ...defaultSort };
  });
  const sortDirection = (sortKey) => (effectiveSort.value.by === sortKey ? effectiveSort.value.direction : 'both');
  const search = computed(() => s.value.search);
  const filters = computed(() => s.value.filters);
  const urlResetKey = computed(() => urlState?.resetKey.value ?? '');
  const flag = computed(() => s.value.flag);
  const hasFilters = computed(() => Object.keys(s.value.filters).length > 0);
  // True while filters, search, order and page all match the defaults (page size aside).
  const isDefault = computed(() => {
    const { val, group } = s.value.search ?? {};
    return (
      filtersSignature(s.value.filters) === filtersSignature(defaultFilters) &&
      !val &&
      (group || SEARCH_GROUP_ALL) === defaultSearchGroup &&
      effectiveSort.value.by === defaultSort.by &&
      effectiveSort.value.direction === defaultSort.direction &&
      s.value.page === 1
    );
  });

  // The request payload; the client-only `flag` stays out of it.
  const queryParams = () => {
    const { flag: _flag, ...params } = JSON.parse(JSON.stringify(s.value));
    return params;
  };

  return {
    key,
    page,
    perPage,
    isPaginated,
    sort,
    defaultSort,
    effectiveSort,
    sortDirection,
    search,
    filters,
    hasFilters,
    isDefault,
    urlResetKey,
    flag,
    setPage,
    setPerPage,
    setSort,
    setSearch,
    setSearchGroup,
    setFilter,
    setFilterItem,
    clearFilters,
    patch,
    order,
    changePage,
    applyFilters,
    cancelFilters,
    reset,
    queryParams,
    setRefetch,
    trigger,
  };
}
