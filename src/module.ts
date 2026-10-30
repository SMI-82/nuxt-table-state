import { addImportsDir, createResolver, defineNuxtModule } from '@nuxt/kit';

/**
 * Project-wide defaults for the URL limits of every table. A table's own
 * `url.allowUnpaginated` / `url.maxPerPage` take precedence over these.
 */
export interface DataTableModuleOptions {
  /** Whether a link may ask for every row at once (`perPage=0`). Default: true. */
  allowUnpaginated?: boolean;
  /** Largest page size a link may ask for; larger values are capped. Default: no cap. */
  maxPerPage?: number;
}

/**
 * Headless Nuxt module for list/table screens.
 *
 * Auto-imports the filtering/search/ordering composables that drive paginated
 * list screens. It registers no components or routes and ships no UI — the
 * project provides its own table controls on top of these composables.
 *
 *   useFilterManager(key, options?)  — page/sort/search/filter state + refetch
 *   useOrder(fields, defField?)      — sort-state management for table headers
 *   useSearch(fm)                    — search-input glue around a filter manager
 *   usePagination(options?)          — page-button range for the pagination UI
 *   useTableFilterDraft(fm)          — checkbox choices kept as a draft until Apply
 *   useTableSearchInput(props, emit) — debounced typing that ignores URL restores
 *
 * Module options (`dataTable` in nuxt.config) are published as
 * `runtimeConfig.public.dataTable` and read by `useFilterManager`.
 */
export default defineNuxtModule<DataTableModuleOptions>({
  meta: {
    name: '@smi-82/nuxt-table-state',
    configKey: 'dataTable',
    compatibility: { nuxt: '>=4.1.0' },
  },

  // useTableSearchInput auto-imports useDebounceFn; Nuxt adds @vueuse/nuxt if the project does not list it.
  moduleDependencies: {
    '@vueuse/nuxt': { version: '>=13' },
  },

  defaults: {
    allowUnpaginated: true,
  },

  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    addImportsDir(resolver.resolve('./runtime/composables'));

    // Values set directly in runtimeConfig.public.dataTable (or via env) win over module options.
    const publicConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>;
    const existing = (publicConfig.dataTable ?? {}) as DataTableModuleOptions;
    publicConfig.dataTable = {
      allowUnpaginated: options.allowUnpaginated,
      ...(options.maxPerPage !== undefined ? { maxPerPage: options.maxPerPage } : {}),
      ...existing,
    };
  },
});
