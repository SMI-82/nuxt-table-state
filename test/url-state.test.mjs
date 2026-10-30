import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { configureNuxt } from '../testing/nuxt-imports.js';
import { createTableQueryCodec } from '../src/runtime/utils/tableQuery.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#imports') return { url: new URL('../testing/nuxt-imports.js', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { useFilterManager } = await import('../src/runtime/composables/useFilterManager.js');
const { usePagination } = await import('../src/runtime/composables/usePagination.js');
const { useTableFilterDraft } = await import('../src/runtime/composables/useTableFilterDraft.js');

const options = {
  prefix: 't',
  sortFields: ['id', 'name', 'dateCreated'],
  searchGroups: ['all', 'id', 'name', 'client', 'master'],
  filterKeys: ['priority', 'category', 'only_my', 'template'],
};
const defaults = { page: 1, perPage: 10, sort: { by: 'id', direction: 'desc' } };
const codec = createTableQueryCodec({ ...options, defaults });
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await nextTick();
    await new Promise((resolve) => setImmediate(resolve));
  }
};
async function setup(t, url = '/admin/projects', sync = true, managerOptions = {}, runtimeConfig = { public: {} }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/projects', component: {} },
      { path: '/admin/users', component: {} },
      { path: '/admin/clients', component: {} },
      { path: '/admin/clients/prospects', component: {} },
      { path: '/admin/projects/:id', component: {} },
    ],
  });
  await router.push(url);
  configureNuxt(router, runtimeConfig);
  const scope = effectScope();
  const fm = scope.run(() => useFilterManager('projects', { sort: defaults.sort, ...(sync ? { url: options } : {}), ...managerOptions }));
  const requests = [];
  fm.setRefetch(() => requests.push(fm.queryParams()));
  t.after(() => scope.stop());
  return { fm, router, requests, scope };
}

test('URL restores a full table state before the first request; API payload keeps its existing shape', async (t) => {
  const { fm, requests } = await setup(
    t,
    '/admin/projects?t.page=3&t.perPage=20&t.sort=name&t.direction=asc&t.q=a%26b&t.searchGroup=client&t.f.priority=3&t.f.priority=1',
  );
  assert.deepEqual(fm.queryParams(), {
    filters: { priority: [1, 3] },
    search: { val: 'a&b', group: 'client' },
    sort: { by: 'name', direction: 'asc' },
    perPage: 20,
    page: 3,
    meta: {},
  });
  assert.equal(requests.length, 0);
});

test('invalid values are ignored, arrays keep numeric IDs, and repeated scalars are rejected', () => {
  const state = codec.decode({
    't.page': '-3',
    't.perPage': 'Infinity',
    't.sort': 'unknown',
    't.direction': 'bad',
    't.searchGroup': 'unknown',
    't.q': ['a', 'b'],
    't.f.priority': ['3', '3', '0', 'bad', '1'],
    't.f.unknown': '1',
  });
  assert.deepEqual(state, { ...defaults, sort: defaults.sort, search: { val: '', group: 'all' }, filters: { priority: [1, 3] } });
  assert.equal(codec.decode({ 't.page': '1.5' }).page, 1);
  assert.equal(codec.decode({ 't.page': '9007199254740992' }).page, 1);
});

test('a legacy neutral sort in the URL decodes to the default order', () => {
  assert.deepEqual(codec.decode({ 't.sort': 'dateCreated', 't.direction': 'both' }).sort, defaults.sort);
  assert.deepEqual(codec.decode({ 't.direction': 'both' }).sort, defaults.sort);
});

test('a table that lists the neutral direction keeps it from the URL', () => {
  const neutralCodec = createTableQueryCodec({ ...options, defaults, sortDirections: ['asc', 'desc', 'both'] });
  const state = { ...defaults, sort: { by: 'dateCreated', direction: 'both' }, search: { val: '', group: 'all' }, filters: {} };
  assert.deepEqual(neutralCodec.decode(neutralCodec.encode(state)), state);
  assert.deepEqual(neutralCodec.decode({ 't.direction': 'both' }).sort, { by: 'id', direction: 'both' });
});

test('a direction the table does not list falls back to the default direction', () => {
  const ascDescCodec = createTableQueryCodec({ ...options, defaults, sortDirections: ['asc', 'desc'] });
  assert.equal(ascDescCodec.decode({ 't.direction': 'both' }).sort.direction, 'desc');
  const ascOnlyCodec = createTableQueryCodec({ ...options, defaults, sortDirections: ['asc'] });
  assert.deepEqual(ascOnlyCodec.decode({ 't.sort': 'name', 't.direction': 'desc' }).sort, { by: 'name', direction: 'desc' });
  assert.deepEqual(ascOnlyCodec.decode({ 't.sort': 'name', 't.direction': 'asc' }).sort, { by: 'name', direction: 'asc' });
});

test('URL page-size cap and disallowed unpaginated requests', () => {
  const cappedCodec = createTableQueryCodec({
    ...options,
    defaults: { ...defaults, perPage: 20 },
    allowUnpaginated: false,
    maxPerPage: 100,
  });
  assert.equal(cappedCodec.decode({ 't.perPage': '999' }).perPage, 100);
  assert.equal(cappedCodec.decode({ 't.perPage': '0' }).perPage, 20);
  assert.equal(cappedCodec.decode({ 't.perPage': '50' }).perPage, 50);
  assert.equal(cappedCodec.decode({}).perPage, 20);
  assert.equal(createTableQueryCodec({ ...options, defaults, maxPerPage: null }).decode({ 't.perPage': '999' }).perPage, 999);
});

test('page-size cap applies to the URL value, not to the declared default', () => {
  const codec = createTableQueryCodec({ ...options, defaults: { ...defaults, perPage: 200 }, maxPerPage: 100 });
  assert.equal(codec.decode({}).perPage, 200);
  assert.equal(codec.decode({ 't.perPage': '500' }).perPage, 100);
});

test('URL round-trip preserves unicode, punctuation and the numeric All size', () => {
  const state = {
    ...defaults,
    perPage: 317,
    sort: { by: 'dateCreated', direction: 'asc' },
    search: { val: 'Привет + & ? #', group: 'name' },
    filters: { only_my: [1], category: [5, 9] },
  };
  assert.deepEqual(codec.decode(codec.encode(state)), state);
});

test('a user change makes exactly one existing request and preserves unrelated query/hash', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/projects?tab=overview&other.page=7#table');
  fm.changePage(3);
  await settle();
  assert.equal(requests.length, 1);
  assert.deepEqual(router.currentRoute.value.query, { tab: 'overview', 'other.page': '7', 't.page': '3' });
  assert.equal(router.currentRoute.value.hash, '#table');
});

test('draft filter edits do not update URL or request data until Apply', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/projects?t.page=3&t.f.priority=1');
  fm.setFilterItem('priority', 3, true);
  await settle();
  assert.equal(router.currentRoute.value.query['t.page'], '3');
  assert.equal(router.currentRoute.value.query['t.f.priority'], '1');
  assert.equal(requests.length, 0);
  fm.applyFilters();
  await settle();
  assert.deepEqual(router.currentRoute.value.query['t.f.priority'], ['1', '3']);
  assert.equal(router.currentRoute.value.query['t.page'], undefined);
  assert.equal(requests.length, 1);
});

test('Back and Forward restore all settings and each invokes only the existing refresh once', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/projects?t.page=3&t.f.priority=1');
  fm.setFilterItem('priority', 2, true);
  fm.setSort('name', 'asc');
  fm.trigger();
  await settle();
  router.back();
  await settle();
  assert.equal(fm.page.value, 3);
  assert.deepEqual(fm.filters.value, { priority: [1] });
  assert.deepEqual(fm.sort.value, defaults.sort);
  assert.equal(requests.length, 2);
  router.forward();
  await settle();
  assert.deepEqual(fm.filters.value, { priority: [1, 2] });
  assert.equal(fm.sort.value.by, 'name');
  assert.equal(requests.length, 3);
});

test('clearing filters removes only filter parameters and resets page; history restores checks', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/projects?t.page=3&t.q=test&t.f.priority=1&t.f.template=1');
  fm.cancelFilters();
  await settle();
  assert.deepEqual(router.currentRoute.value.query, { 't.q': 'test' });
  assert.equal(requests.length, 1);
  router.back();
  await settle();
  assert.deepEqual(fm.filters.value, { priority: [1], template: [1] });
});

test('search replaces history, while page changes push it', async (t) => {
  const { fm, router, requests } = await setup(t);
  fm.changePage(2);
  await settle();
  fm.setSearch('one');
  fm.trigger();
  await settle();
  fm.setSearch('two');
  fm.trigger();
  await settle();
  router.back();
  await settle();
  assert.equal(fm.search.value.val, '');
  assert.equal(fm.page.value, 1);
  assert.equal(requests.length, 4);
});

test('scope selection with empty search is shared without a request or applying draft filters', async (t) => {
  const { fm, router, requests } = await setup(t);
  fm.setFilterItem('priority', 3, true);
  fm.setSearchGroup('name');
  await settle();
  assert.deepEqual(router.currentRoute.value.query, { 't.searchGroup': 'name' });
  assert.equal(requests.length, 0);
});

test('rapid edits keep the latest state and do not echo requests from internal navigation', async (t) => {
  const { fm, router, requests } = await setup(t);
  fm.changePage(2);
  fm.setSort('name', 'asc');
  fm.trigger();
  fm.setPerPage(50);
  fm.trigger();
  fm.changePage(4);
  await settle();
  assert.equal(router.currentRoute.value.query['t.page'], '4');
  assert.equal(router.currentRoute.value.query['t.perPage'], '50');
  assert.equal(fm.page.value, 4);
  assert.equal(requests.length, 4);
});

test('legacy page is read and replaced on the next action', async (t) => {
  const { fm, router } = await setup(t, '/admin/projects?page=3');
  assert.equal(fm.page.value, 3);
  fm.changePage(4);
  await settle();
  assert.deepEqual(router.currentRoute.value.query, { 't.page': '4' });
});

test('a cancelled URL navigation can be retried without leaving persistence stuck', async (t) => {
  const { fm, router } = await setup(t);
  const removeGuard = router.beforeEach(() => false);
  fm.changePage(2);
  await settle();
  assert.equal(router.currentRoute.value.query['t.page'], undefined);
  removeGuard();
  fm.trigger();
  await settle();
  assert.equal(router.currentRoute.value.query['t.page'], '2');
});

test('unrelated query edits and leaving the page do not reload the table', async (t) => {
  const { fm, router, requests } = await setup(t);
  await router.push('/admin/projects?tab=overview');
  await router.push('/admin/users?t.page=9');
  await settle();
  assert.equal(fm.page.value, 1);
  assert.equal(requests.length, 0);
});

test('other pages retain the original manager behavior when URL persistence is not enabled', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/projects?page=2&t.q=ignored', false);
  assert.equal(fm.search.value.val, '');
  fm.changePage(3);
  await settle();
  assert.equal(router.currentRoute.value.query.page, '2');
  assert.equal(requests.length, 1);
});

test('controlled pager restores page before totals arrive without emitting changes', async (t) => {
  const currentPage = ref(3);
  const totalItems = ref(0);
  const events = [];
  const scope = effectScope();
  t.after(() => scope.stop());
  const pager = scope.run(() =>
    usePagination({ controlled: true, currentPage, totalItems, itemsPerPage: 10, onChange: (page) => events.push(page) }),
  );
  assert.equal(pager.currP.value, 3);
  totalItems.value = 90;
  currentPage.value = 5;
  await nextTick();
  assert.equal(pager.currP.value, 5);
  assert.deepEqual(events, []);
  pager.changePage(6);
  assert.deepEqual(events, [6]);
});

const taskOptions = {
  ...options,
  filterKeys: ['category', 'for_cloning', 'group_id', 'color'],
  filterTypes: {
    category: { type: 'integer', min: 0 },
    for_cloning: { type: 'integer', min: 0 },
    group_id: { type: 'integer', min: 0 },
    color: { type: 'string' },
  },
};
const clientOptions = {
  ...options,
  filterKeys: ['status', 'check_blocked', 'name_confirmation'],
  filterTypes: {
    check_blocked: { type: 'integer', min: 0 },
    name_confirmation: { type: 'enum', values: ['confirmed', 'unconfirmed'] },
  },
};

test('task filters retain zero, empty colors and string arrays through URL and browser history', async (t) => {
  const { fm, router, requests } = await setup(
    t,
    '/admin/projects/42?t.page=3&t.f.for_cloning=0&t.f.color=&t.f.color=%23ff0000&t.f.group_id=8&t.f.category=0',
    true,
    { perPage: 20, url: taskOptions },
  );
  assert.equal(fm.perPage.value, 20);
  assert.deepEqual(fm.filters.value, { category: [0], for_cloning: [0], group_id: [8], color: ['', '#ff0000'] });
  fm.setFilterItem('color', '', false);
  fm.setFilterItem('for_cloning', 1, true);
  fm.applyFilters();
  await settle();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].filters, { category: [0], for_cloning: [0, 1], group_id: [8], color: ['#ff0000'] });
  assert.deepEqual(router.currentRoute.value.query['t.f.for_cloning'], ['0', '1']);
  router.back();
  await settle();
  assert.equal(fm.page.value, 3);
  assert.deepEqual(fm.filters.value.color, ['', '#ff0000']);
  assert.deepEqual(fm.filters.value.for_cloning, [0]);
  assert.equal(requests.length, 2);
  fm.cancelFilters();
  await settle();
  assert.deepEqual(router.currentRoute.value.query, {});
  assert.equal(requests.length, 3);
});

test('client scalar filters keep their API shape, clear and restore without duplicate requests', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/clients?t.f.name_confirmation=unconfirmed&t.f.check_blocked=0', true, {
    url: clientOptions,
  });
  assert.deepEqual(fm.filters.value, { name_confirmation: 'unconfirmed', check_blocked: [0] });
  fm.setFilter('name_confirmation', 'confirmed');
  fm.applyFilters();
  await settle();
  assert.equal(router.currentRoute.value.query['t.f.name_confirmation'], 'confirmed');
  assert.equal(requests[0].filters.name_confirmation, 'confirmed');
  fm.cancelFilters();
  await settle();
  assert.deepEqual(fm.filters.value, {});
  router.back();
  await settle();
  assert.equal(fm.filters.value.name_confirmation, 'confirmed');
  assert.equal(requests.length, 3);
});

test('filter types reject malformed enums and integers without weakening positive ID validation', () => {
  const typedCodec = createTableQueryCodec({ ...clientOptions, defaults });
  for (const invalid of ['other', ['confirmed', 'unconfirmed'], '', null]) {
    assert.deepEqual(typedCodec.decode({ 't.f.name_confirmation': invalid }).filters, {});
  }
  assert.deepEqual(typedCodec.decode({ 't.f.status': ['0', '-1', '2'], 't.f.check_blocked': ['0', '-1', '0.5'] }).filters, {
    status: [2],
    check_blocked: [0],
  });
  assert.deepEqual(codec.decode({ 't.f.priority': '0' }).filters, {});
});

test('prospect tabs and pagination restore together and preserve notification deep links', async (t) => {
  const { fm, router, requests } = await setup(t, '/admin/clients/prospects?prospect=17&conversation=9&t.page=3&t.f.state=contacted#list', true, {
    url: { ...options, filterKeys: ['state'], filterTypes: { state: { type: 'enum', values: ['new', 'contacted', 'rejected', 'all'] } } },
  });
  assert.equal(fm.filters.value.state, 'contacted');
  assert.equal(fm.page.value, 3);
  fm.setFilter('state', 'all');
  fm.trigger();
  await settle();
  assert.equal(fm.page.value, 1);
  fm.setPerPage(50);
  fm.trigger();
  await settle();
  assert.equal(requests.length, 2);
  router.back();
  await settle();
  router.back();
  await settle();
  assert.equal(fm.filters.value.state, 'contacted');
  assert.equal(fm.page.value, 3);
  assert.equal(fm.perPage.value, 10);
  assert.equal(requests.length, 4);
  assert.equal(router.currentRoute.value.query.prospect, '17');
  assert.equal(router.currentRoute.value.query.conversation, '9');
  assert.equal(router.currentRoute.value.hash, '#list');
});

async function setupPair(t, url = '/admin/projects') {
  const first = await setup(t, url, true, { url: { ...options, prefix: 'rates' } });
  const secondScope = effectScope();
  const second = secondScope.run(() =>
    useFilterManager('employees', {
      sort: defaults.sort,
      url: { ...options, prefix: 'employees' },
    }),
  );
  const secondRequests = [];
  second.setRefetch(() => secondRequests.push(second.queryParams()));
  t.after(() => secondScope.stop());
  return { ...first, second, secondRequests, secondScope };
}

test('two tables restore independently and leave the legacy page parameter to its owner', async (t) => {
  const { fm, second, router, requests, secondRequests } = await setupPair(
    t,
    '/admin/projects?page=9&rates.page=2&rates.q=one&employees.page=5&employees.sort=name&employees.f.priority=3#board',
  );
  assert.equal(fm.page.value, 2);
  assert.equal(second.page.value, 5);
  assert.equal(fm.search.value.val, 'one');
  assert.equal(second.search.value.val, '');
  assert.equal(second.sort.value.by, 'name');
  assert.deepEqual(second.filters.value, { priority: [3] });
  fm.changePage(3);
  await settle();
  assert.equal(router.currentRoute.value.query.page, '9');
  assert.equal(router.currentRoute.value.query['employees.page'], '5');
  assert.equal(router.currentRoute.value.hash, '#board');
  assert.equal(requests.length, 1);
  assert.equal(secondRequests.length, 0);
  const namespacedCodec = createTableQueryCodec({ ...options, defaults, prefix: 'employees' });
  assert.equal(namespacedCodec.decode({ page: '9' }).page, 1);
});

test('simultaneous table changes and rapid edits survive delayed router navigation without echoes', async (t) => {
  const { fm, second, router, requests, secondRequests } = await setupPair(t);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let delay = true;
  const removeGuard = router.beforeEach(async () => {
    if (delay) {
      delay = false;
      await blocked;
    }
  });
  t.after(removeGuard);
  fm.changePage(2);
  await settle();
  second.changePage(5);
  fm.changePage(3);
  await settle();
  assert.equal(second.page.value, 5);
  release();
  await settle();
  assert.equal(router.currentRoute.value.query['rates.page'], '3');
  assert.equal(router.currentRoute.value.query['employees.page'], '5');
  assert.equal(fm.page.value, 3);
  assert.equal(second.page.value, 5);
  assert.equal(requests.length, 2);
  assert.equal(secondRequests.length, 1);
});

test('Back and Forward refresh only the table whose URL state changed', async (t) => {
  const { fm, second, router, requests, secondRequests } = await setupPair(t);
  fm.changePage(2);
  await settle();
  second.changePage(5);
  await settle();
  router.back();
  await settle();
  assert.equal(fm.page.value, 2);
  assert.equal(second.page.value, 1);
  assert.equal(requests.length, 1);
  assert.equal(secondRequests.length, 2);
  router.back();
  await settle();
  assert.equal(fm.page.value, 1);
  assert.equal(requests.length, 2);
  assert.equal(secondRequests.length, 2);
  router.forward();
  await settle();
  assert.equal(fm.page.value, 2);
  assert.equal(requests.length, 3);
  assert.equal(secondRequests.length, 2);
});

test('clearing filters and changing a neighbour leaves draft filters and pending search reset keys alone', async (t) => {
  const { fm, second, router } = await setupPair(t, '/admin/projects?rates.f.priority=2&employees.f.category=3');
  const ratesKey = fm.urlResetKey.value;
  const employeesKey = second.urlResetKey.value;
  fm.setFilterItem('priority', 4, true);
  second.changePage(3);
  await settle();
  assert.equal(fm.urlResetKey.value, ratesKey);
  assert.deepEqual(fm.filters.value.priority, [2, 4]);
  assert.notEqual(second.urlResetKey.value, employeesKey);
  second.cancelFilters();
  await settle();
  assert.equal(router.currentRoute.value.query['employees.f.category'], undefined);
  assert.equal(router.currentRoute.value.query['rates.f.priority'], '2');
  assert.deepEqual(fm.filters.value.priority, [2, 4]);
  fm.applyFilters();
  await settle();
  assert.notEqual(fm.urlResetKey.value, ratesKey);
});

test('an aborted write cannot block the other table, and the first table can retry', async (t) => {
  const { fm, second, router, requests, secondRequests } = await setupPair(t);
  let block = true;
  const removeGuard = router.beforeEach((to) => {
    if (block && to.query['rates.page']) {
      block = false;
      return false;
    }
  });
  t.after(removeGuard);
  fm.changePage(2);
  second.changePage(5);
  await settle();
  assert.equal(router.currentRoute.value.query['rates.page'], undefined);
  assert.equal(router.currentRoute.value.query['employees.page'], '5');
  fm.trigger();
  await settle();
  assert.equal(router.currentRoute.value.query['rates.page'], '2');
  assert.equal(router.currentRoute.value.query['employees.page'], '5');
  assert.equal(requests.length, 2);
  assert.equal(secondRequests.length, 1);
});

test('unmounting one table discards its queued write without blocking the other', async (t) => {
  const { fm, second, router, secondScope } = await setupPair(t);
  fm.changePage(2);
  second.changePage(5);
  secondScope.stop();
  await settle();
  assert.equal(router.currentRoute.value.query['rates.page'], '2');
  assert.equal(router.currentRoute.value.query['employees.page'], undefined);
});

test('duplicate prefixes fail explicitly and a disposed table releases its prefix', async (t) => {
  const { scope } = await setup(t);
  const extraScope = effectScope();
  t.after(() => extraScope.stop());
  assert.throws(() => extraScope.run(() => useFilterManager('duplicate', { url: options })), /Duplicate table URL prefix/);
  scope.stop();
  assert.doesNotThrow(() => extraScope.run(() => useFilterManager('replacement', { url: options })));
});

test('external navigation cancels queued edits in both tables before delayed writes can replay them', async (t) => {
  const { fm, second, router, requests, secondRequests } = await setupPair(t);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let delay = true;
  const removeGuard = router.beforeEach(async () => {
    if (delay) {
      delay = false;
      await blocked;
    }
  });
  t.after(removeGuard);
  fm.changePage(2);
  await settle();
  second.changePage(5);
  await router.push('/admin/projects?tab=overview&employees.page=4');
  assert.equal(fm.page.value, 1);
  assert.equal(second.page.value, 4);
  release();
  await settle();
  assert.equal(router.currentRoute.value.query['rates.page'], undefined);
  assert.equal(router.currentRoute.value.query['employees.page'], '4');
  assert.equal(router.currentRoute.value.query.tab, 'overview');
  assert.equal(requests.length, 2);
  assert.equal(secondRequests.length, 2);
});

test('template defaults and unpaginated mode survive URL history', async (t) => {
  const { fm, router } = await setup(t, '/admin/projects?t.perPage=0', true, { searchGroup: 'name' });
  assert.deepEqual(fm.search.value, { val: '', group: 'name' });
  assert.equal(fm.isPaginated.value, false);
  fm.setPerPage(20);
  fm.trigger();
  await settle();
  assert.equal(fm.isPaginated.value, true);
  router.back();
  await settle();
  assert.equal(fm.perPage.value, 0);
  assert.equal(fm.isPaginated.value, false);
});

test('the project-wide allowUnpaginated: false rejects perPage=0 from the URL', async (t) => {
  const { fm } = await setup(t, '/admin/projects?t.perPage=0', true, {}, { public: { dataTable: { allowUnpaginated: false } } });
  assert.equal(fm.perPage.value, 10);
  assert.equal(fm.isPaginated.value, true);
});

test('per-table URL limits override the project-wide defaults', async (t) => {
  const project = { public: { dataTable: { allowUnpaginated: false, maxPerPage: 100 } } };
  const unpaginated = await setup(t, '/admin/projects?t.perPage=0', true, { url: { ...options, allowUnpaginated: true } }, project);
  assert.equal(unpaginated.fm.perPage.value, 0);
  unpaginated.scope.stop();
  const capped = await setup(t, '/admin/projects?t.perPage=80', true, { url: { ...options, maxPerPage: 50 } }, project);
  assert.equal(capped.fm.perPage.value, 50);
  capped.scope.stop();
  const projectCap = await setup(t, '/admin/projects?t.perPage=500', true, {}, project);
  assert.equal(projectCap.fm.perPage.value, 100);
});

test('maxPerPage caps the page size requested by the URL', async (t) => {
  const { fm, requests } = await setup(t, '/admin/projects?t.perPage=999', true, { url: { ...options, maxPerPage: 100 } });
  assert.equal(fm.perPage.value, 100);
  fm.trigger();
  assert.equal(requests[0].perPage, 100);
});

test('missing runtime config leaves the URL limits at their defaults', async (t) => {
  const { fm } = await setup(t, '/admin/projects?t.perPage=0', true, {}, {});
  assert.equal(fm.perPage.value, 0);
});

test('flag flips on every trigger, including history restores, and never reaches the request', async (t) => {
  const { fm, router, requests } = await setup(t);
  assert.equal(fm.flag.value, false);
  fm.trigger();
  assert.equal(fm.flag.value, true);
  fm.changePage(2);
  await settle();
  assert.equal(fm.flag.value, false);
  router.back();
  await settle();
  assert.equal(fm.flag.value, true);
  assert.equal(requests.length, 3);
  for (const request of requests) assert.equal('flag' in request, false);
  assert.equal('flag' in fm.queryParams(), false);
});

test('page-owned checkbox drafts stay out of search/page requests until Apply and restore on Back', async (t) => {
  const { fm, router, requests, scope } = await setup(t);
  const draft = scope.run(() => useTableFilterDraft(fm));
  draft.onFilterToggle({ priority: { item: 2, status: true } });
  fm.setSearch('book');
  fm.trigger();
  await settle();
  assert.deepEqual(requests.at(-1).filters, {});
  assert.deepEqual(draft.draftFilters.value, { priority: [2] });
  draft.applyFilters();
  await settle();
  assert.deepEqual(requests.at(-1).filters, { priority: [2] });
  assert.deepEqual(router.currentRoute.value.query['t.f.priority'], ['2']);
  draft.onFilterToggle({ priority: { item: 3, status: true } });
  assert.deepEqual(fm.queryParams().filters, { priority: [2] });
  const beforeBack = requests.length;
  router.back();
  await settle();
  assert.deepEqual(draft.draftFilters.value, {});
  assert.equal(requests.length, beforeBack + 1);
  router.forward();
  await settle();
  assert.deepEqual(draft.draftFilters.value, { priority: [2] });
  draft.onFilterToggle({ priority: { item: 2, status: false } });
  draft.applyFilters();
  await settle();
  assert.deepEqual(fm.queryParams().filters, {});
  assert.equal(router.currentRoute.value.query['t.f.priority'], undefined);
});

test('cancelling drafts clears applied filters with one request and empties the draft', async (t) => {
  const { fm, requests, scope } = await setup(t, '/admin/projects?t.f.priority=1');
  const draft = scope.run(() => useTableFilterDraft(fm));
  assert.deepEqual(draft.draftFilters.value, { priority: [1] });
  draft.onFilterToggle({ priority: { item: 3, status: true }, category: { item: 4, status: true } });
  draft.cancelFilters();
  await settle();
  assert.deepEqual(draft.draftFilters.value, {});
  assert.deepEqual(fm.filters.value, {});
  assert.equal(requests.length, 1);
});

test('existing shared manager state remains until the final consumer is disposed', async (t) => {
  const { fm, scope } = await setup(t, '/admin/projects', false);
  const consumer = effectScope();
  t.after(() => consumer.stop());
  const shared = consumer.run(() => useFilterManager('projects'));
  fm.setSearch('retained');
  scope.stop();
  assert.equal(shared.search.value.val, 'retained');
  consumer.stop();
  const nextScope = effectScope();
  t.after(() => nextScope.stop());
  const fresh = nextScope.run(() => useFilterManager('projects'));
  assert.equal(fresh.search.value.val, '');
});

test('order: neutral click on the default column toggles it to asc', async (t) => {
  const { fm, requests } = await setup(t);
  fm.order({ key: 'id', direction: 'both' });
  await settle();
  assert.deepEqual(fm.sort.value, { by: 'id', direction: 'asc' });
  assert.equal(requests.length, 1);
});

test('order: neutral click on another column restores the declared default', async (t) => {
  const { fm, requests } = await setup(t, '/admin/projects?t.sort=name&t.direction=asc');
  fm.order({ key: 'name', direction: 'both' });
  await settle();
  assert.deepEqual(fm.sort.value, defaults.sort);
  assert.equal(requests.length, 1);
});

test('order: a concrete direction is applied, resets the page and issues exactly one request', async (t) => {
  const { fm, requests } = await setup(t, '/admin/projects?t.page=3');
  fm.order({ key: 'name', direction: 'desc' });
  await settle();
  assert.deepEqual(fm.sort.value, { by: 'name', direction: 'desc' });
  assert.equal(fm.page.value, 1);
  assert.equal(requests.length, 1);
});

test('effectiveSort and sortDirection fall back to the default for a neutral or empty sort', async (t) => {
  const { fm } = await setup(t);
  fm.setSort('name', 'both');
  assert.deepEqual(fm.effectiveSort.value, defaults.sort);
  assert.equal(fm.sortDirection('id'), 'desc');
  assert.equal(fm.sortDirection('name'), 'both');
  fm.setSort('', 'asc');
  assert.deepEqual(fm.effectiveSort.value, defaults.sort);
  assert.equal(fm.sortDirection('id'), 'desc');
  fm.setSort('name', 'asc');
  assert.equal(fm.sortDirection('name'), 'asc');
  assert.equal(fm.sortDirection('id'), 'both');
});

test('reset restores filters, search, order and page, keeps the page size and clears the URL', async (t) => {
  const { fm, router, requests } = await setup(
    t,
    '/admin/projects?tab=overview&t.page=3&t.perPage=50&t.sort=name&t.direction=asc&t.q=abc&t.searchGroup=client&t.f.priority=1',
  );
  fm.reset();
  await settle();
  assert.deepEqual(fm.filters.value, {});
  assert.deepEqual(fm.search.value, { val: '', group: 'all' });
  assert.deepEqual(fm.sort.value, defaults.sort);
  assert.equal(fm.page.value, 1);
  assert.equal(fm.perPage.value, 50);
  assert.equal(requests.length, 1);
  assert.deepEqual(router.currentRoute.value.query, { tab: 'overview', 't.perPage': '50' });
});

test('isDefault follows changes away from the defaults and back after reset', async (t) => {
  const { fm } = await setup(t);
  assert.equal(fm.isDefault.value, true);
  fm.setPerPage(50);
  assert.equal(fm.isDefault.value, true);
  fm.setFilterItem('priority', 2, true);
  assert.equal(fm.isDefault.value, false);
  fm.setFilterItem('priority', 2, false);
  assert.equal(fm.isDefault.value, true);
  fm.setSearch('x');
  assert.equal(fm.isDefault.value, false);
  fm.reset();
  assert.equal(fm.isDefault.value, true);
  fm.order({ key: 'name', direction: 'asc' });
  assert.equal(fm.isDefault.value, false);
  fm.reset();
  fm.changePage(2);
  assert.equal(fm.isDefault.value, false);
  fm.reset();
  fm.setSearchGroup('name');
  assert.equal(fm.isDefault.value, false);
  fm.reset();
  assert.equal(fm.isDefault.value, true);
  assert.equal(fm.perPage.value, 50);
});

test('reset returns to declared default filters without sharing them with the live state', async (t) => {
  const defaultFilters = { priority: [1] };
  const { fm } = await setup(t, '/admin/projects', false, { filters: defaultFilters });
  assert.equal(fm.isDefault.value, true);
  fm.setFilterItem('priority', 2, true);
  assert.equal(fm.isDefault.value, false);
  fm.reset();
  assert.deepEqual(fm.filters.value, { priority: [1] });
  assert.deepEqual(defaultFilters, { priority: [1] });
  assert.equal(fm.isDefault.value, true);
});

test('reset and isDefault honour a declared default search group', async (t) => {
  const { fm, router } = await setup(t, '/admin/projects?t.searchGroup=client', true, { searchGroup: 'name' });
  assert.equal(fm.isDefault.value, false);
  fm.reset();
  await settle();
  assert.deepEqual(fm.search.value, { val: '', group: 'name' });
  assert.equal(fm.isDefault.value, true);
  assert.deepEqual(router.currentRoute.value.query, {});
});
