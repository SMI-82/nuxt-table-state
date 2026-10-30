/**
 * Search-input glue around a filter manager.
 *
 * The free-text value and the search scope are sent as two separate fields:
 * `search.val` (the typed text) and `search.group` (a named scope the server
 * defines, e.g. "all" or "name" — never a raw column name), so the server
 * decides which columns a group actually covers.
 *
 * @param {ReturnType<typeof useFilterManager>} fm
 */
export function useSearch(fm) {
  /**
   * Switches the active search scope. Re-triggers the current search only when
   * there is already a typed value to re-run it against.
   *
   * @param {string} group
   */
  function searchGroup(group) {
    const val = fm.search.value?.val ?? '';
    fm.setSearchGroup(group);
    if (val !== '') fm.trigger();
  }

  /**
   * Sets the search text (trimmed) and triggers a refetch.
   *
   * @param {string} [value]
   */
  function search(value = '') {
    const trimmed = (value ?? '').trim();
    fm.setSearch(trimmed);
    fm.trigger();
  }

  return {
    searchGroup,
    search,
  };
}
