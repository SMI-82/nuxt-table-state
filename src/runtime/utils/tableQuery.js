/**
 * Builds the codec between one table's state and its address-bar parameters.
 * The address-bar format is deliberately separate from the backend's table_data.
 *
 * @param {object} options
 * @param {string} [options.prefix] Parameter namespace, `t` by default.
 * @param {{ page: number, perPage: number, sort: { by: string, direction: string }, searchGroup?: string }} options.defaults
 * @param {string[]} options.sortFields Sort columns a link may select.
 * @param {string[]} options.searchGroups Search scopes a link may select.
 * @param {string[]} options.filterKeys Filters a link may set.
 * @param {Record<string, { type: 'enum', values: string[] } | { type: 'integer', min?: number } | { type: 'string' }>} [options.filterTypes]
 * @param {boolean} [options.legacyPage] Read and migrate a bare `?page=` (default: only for prefix `t`).
 * @param {boolean} [options.allowUnpaginated] Accept `perPage=0` ("all rows"); default true.
 * @param {number} [options.maxPerPage] Cap for a page size requested by a link (not for `defaults.perPage`); default no cap.
 * @param {string[]} [options.sortDirections] Directions a link may select; default `['asc', 'desc']`.
 *   Without `'both'`, a neutral direction in a link decodes to the default order.
 * @returns {{ decode: Function, encode: Function, merge: Function, signature: Function }}
 */
export function createTableQueryCodec({
  prefix = 't',
  defaults,
  sortFields,
  searchGroups,
  filterKeys,
  filterTypes = {},
  legacyPage = prefix === 't',
  allowUnpaginated = true,
  maxPerPage,
  sortDirections = ['asc', 'desc'],
}) {
  const key = (name) => `${prefix}.${name}`;
  const perPageCap = Number.isSafeInteger(maxPerPage) && maxPerPage > 0 ? maxPerPage : Number.MAX_SAFE_INTEGER;
  const scalar = (value) => (typeof value === 'string' ? value : undefined);
  const positiveInteger = (value) => {
    if (!/^\d+$/.test(value ?? '')) return undefined;
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : undefined;
  };
  const owned = new Set(['page', 'perPage', 'sort', 'direction', 'q', 'searchGroup', ...filterKeys.map((name) => `f.${name}`)].map(key));

  function decodeFilter(name, raw) {
    const schema = filterTypes[name];
    if (schema?.type === 'enum') return schema.values.includes(scalar(raw)) ? raw : undefined;
    const parse = (value) => {
      const str = scalar(value);
      if (schema?.type === 'string') return str;
      if (schema?.type === 'integer' && schema.min === 0 && str === '0') return 0;
      return positiveInteger(str);
    };
    const values = [...new Set((Array.isArray(raw) ? raw : [raw]).map(parse).filter((value) => value !== undefined))];
    return values.length ? values.sort(schema?.type === 'string' ? undefined : (a, b) => a - b) : undefined;
  }

  function decode(query) {
    const filters = {};
    for (const name of filterKeys) {
      const raw = query[key(`f.${name}`)];
      const value = decodeFilter(name, raw);
      if (value !== undefined) filters[name] = value;
    }
    const by = scalar(query[key('sort')]);
    const direction = scalar(query[key('direction')]);
    const group = scalar(query[key('searchGroup')]);
    const requestedPerPage = positiveInteger(scalar(query[key('perPage')]));
    return {
      page: positiveInteger(scalar(query[key('page')] ?? (legacyPage ? query.page : undefined))) ?? defaults.page,
      perPage:
        scalar(query[key('perPage')]) === '0' && allowUnpaginated !== false
          ? 0
          : requestedPerPage !== undefined
            ? Math.min(requestedPerPage, perPageCap)
            : defaults.perPage,
      // A neutral ('both') sort the table does not list means the default order.
      sort:
        direction === 'both' && !sortDirections.includes('both')
          ? { ...defaults.sort }
          : {
              by: sortFields.includes(by) ? by : defaults.sort.by,
              direction: sortDirections.includes(direction) ? direction : defaults.sort.direction,
            },
      search: { val: scalar(query[key('q')]) ?? '', group: searchGroups.includes(group) ? group : (defaults.searchGroup ?? 'all') },
      filters,
    };
  }

  function encode(state) {
    const query = {};
    if (state.page !== defaults.page) query[key('page')] = String(state.page);
    if (state.perPage !== defaults.perPage) query[key('perPage')] = String(state.perPage);
    if (state.sort.by !== defaults.sort.by) query[key('sort')] = state.sort.by;
    if (state.sort.direction !== defaults.sort.direction) query[key('direction')] = state.sort.direction;
    if (state.search.val) query[key('q')] = state.search.val;
    if (state.search.group !== (defaults.searchGroup ?? 'all')) query[key('searchGroup')] = state.search.group;
    for (const name of filterKeys) {
      const raw = state.filters[name];
      const value = decodeFilter(name, Array.isArray(raw) ? raw.map(String) : raw);
      if (value !== undefined) query[key(`f.${name}`)] = Array.isArray(value) ? value.map(String) : value;
    }
    return query;
  }

  function merge(query, state) {
    // Keep unrelated query parameters (and other tables' namespaces) intact.
    const rest = Object.fromEntries(Object.entries(query).filter(([name]) => !owned.has(name) && !(legacyPage && name === 'page')));
    return { ...rest, ...encode(state) };
  }

  return { decode, encode, merge, signature: (state) => JSON.stringify(encode(state)) };
}
