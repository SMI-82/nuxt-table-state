<script setup>
// In-memory demo list: every state change goes through the URL, so Back/Forward and reloads restore it.
const colors = ['red', 'green', 'blue'];
const allRows = Array.from({ length: 87 }, (_, index) => ({
  id: index + 1,
  name: `Item ${String(index + 1).padStart(3, '0')}`,
  color: colors[index % colors.length],
}));

const fm = useFilterManager(`demo:${useRoute().path}`, {
  sort: { by: 'id', direction: 'asc' },
  perPage: 10,
  url: {
    prefix: 'demo',
    sortFields: ['id', 'name'],
    searchGroups: ['all', 'name'],
    filterKeys: ['color'],
    filterTypes: { color: { type: 'enum', values: colors } },
  },
});
const { search } = useSearch(fm);

const matchingRows = computed(() => {
  const { val } = fm.search.value;
  const color = fm.filters.value.color;
  const { by, direction } = fm.effectiveSort.value;
  const needle = val.trim().toLowerCase();
  const rows = allRows.filter(
    (row) => (!needle || row.name.toLowerCase().includes(needle)) && (!color || row.color === color),
  );
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => (left[by] > right[by] ? sign : left[by] < right[by] ? -sign : 0));
});

const visibleRows = computed(() => {
  if (!fm.isPaginated.value) return matchingRows.value;
  const start = (fm.page.value - 1) * fm.perPage.value;
  return matchingRows.value.slice(start, start + fm.perPage.value);
});

const { pageButtons, incDecPage } = usePagination({
  totalItems: computed(() => matchingRows.value.length),
  itemsPerPage: fm.perPage,
  currentPage: fm.page,
  controlled: true,
  onChange: fm.changePage,
});

const colorFilter = computed({
  get: () => fm.filters.value.color ?? '',
  set: (value) => {
    fm.setFilter('color', value || undefined);
    fm.applyFilters();
  },
});

/** Toggles the order of one column between ascending and descending. */
function toggleSort(column) {
  fm.order({ key: column, direction: fm.sortDirection(column) === 'asc' ? 'desc' : 'asc' });
}

/** Arrow shown next to a column header for its current direction. */
const arrow = (column) => ({ asc: '▲', desc: '▼' })[fm.sortDirection(column)] ?? '';
</script>

<template>
  <main style="font-family: sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 16px">
    <h1>nuxt-table-state playground</h1>

    <div style="display: flex; gap: 8px; margin-bottom: 12px">
      <input
        :value="fm.search.value.val"
        placeholder="Search by name"
        @input="search($event.target.value)"
      />
      <select v-model="colorFilter">
        <option value="">Any color</option>
        <option v-for="color in colors" :key="color" :value="color">{{ color }}</option>
      </select>
      <button v-if="!fm.isDefault.value" type="button" @click="fm.reset">Reset</button>
    </div>

    <table style="width: 100%; border-collapse: collapse">
      <thead>
        <tr>
          <th style="cursor: pointer; text-align: left" @click="toggleSort('id')">ID {{ arrow('id') }}</th>
          <th style="cursor: pointer; text-align: left" @click="toggleSort('name')">Name {{ arrow('name') }}</th>
          <th style="text-align: left">Color</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="row.id">
          <td>{{ row.id }}</td>
          <td>{{ row.name }}</td>
          <td>{{ row.color }}</td>
        </tr>
        <tr v-if="!visibleRows.length">
          <td colspan="3">Nothing found</td>
        </tr>
      </tbody>
    </table>

    <nav style="display: flex; gap: 4px; margin-top: 12px">
      <button type="button" @click="incDecPage(-1)">‹</button>
      <template v-for="(pageNumber, index) in pageButtons" :key="index">
        <span v-if="pageNumber === 0">…</span>
        <button
          v-else
          type="button"
          :disabled="pageNumber === fm.page.value"
          @click="fm.changePage(pageNumber)"
        >
          {{ pageNumber }}
        </button>
      </template>
      <button type="button" @click="incDecPage(1)">›</button>
    </nav>

    <p style="color: #666">{{ matchingRows.length }} rows · query: {{ $route.fullPath }}</p>
  </main>
</template>
