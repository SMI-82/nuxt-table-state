import { ref, watch } from '#imports';

/**
 * Keeps checkbox choices as a draft, out of requests and the URL, until the user presses Apply.
 *
 * The draft follows the manager's applied filters: a Back/Forward restore or a cancel
 * replaces it silently. Searches and page changes made meanwhile never send it.
 *
 * @param {ReturnType<typeof import('./useFilterManager.js').useFilterManager>} fm
 * @returns {{
 *   draftFilters: import('vue').Ref<Record<string, Array<unknown>>>,
 *   onFilterToggle: (changes: Record<string, { item: unknown, status: boolean }>) => void,
 *   applyFilters: () => void,
 *   cancelFilters: () => void,
 * }}
 */
export function useTableFilterDraft(fm) {
  const draftFilters = ref({});
  const restore = () => {
    draftFilters.value = JSON.parse(JSON.stringify(fm.filters.value));
  };
  watch(() => fm.filters.value, restore, { immediate: true, deep: true });

  /**
   * Adds (status true) or removes (status false) one item per filter key in the draft.
   *
   * @param {Record<string, { item: unknown, status: boolean }>} changes
   */
  function onFilterToggle(changes) {
    for (const [key, { item, status }] of Object.entries(changes)) {
      const values = new Set(draftFilters.value[key] ?? []);
      if (status) values.add(item);
      else values.delete(item);
      if (values.size) draftFilters.value[key] = [...values];
      else delete draftFilters.value[key];
    }
  }

  /** Commits the draft to the manager, back to page 1, and refreshes once. */
  function applyFilters() {
    fm.patch({ filters: draftFilters.value, page: 1 });
    fm.applyFilters();
  }

  /** Clears the applied filters (one refresh) and drops the draft with them. */
  function cancelFilters() {
    fm.cancelFilters();
    restore();
  }

  return { draftFilters, onFilterToggle, applyFilters, cancelFilters };
}
