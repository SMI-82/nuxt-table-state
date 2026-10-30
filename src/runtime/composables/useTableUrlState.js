import { computed, onScopeDispose, useRoute, useRouter, watch } from '#imports';
import { createTableQueryCodec } from '../utils/tableQuery.js';
import { isTableUrlNavigation, queueTableUrlWrite, registerTableUrlPrefix } from '../utils/tableUrlWrites.js';

/** Opt-in URL persistence. It never constructs or sends a backend request. */
export function useTableUrlState(state, options, refresh) {
  const route = useRoute();
  const router = useRouter();
  const path = route.path;
  const codec = createTableQueryCodec(options);
  const unregister = registerTableUrlPrefix(router, path, options.prefix ?? 't');
  const snapshot = () => codec.decode(codec.encode(state.value));
  let applied = codec.decode(route.query);
  let observed = codec.signature(applied);
  Object.assign(state.value, structuredClone(applied));

  let restoring = false;
  let disposed = false;
  let pending = null;
  let writing = false;
  let expected = null;
  let revision = 0;
  onScopeDispose(() => {
    disposed = true;
    pending = null;
    unregister();
  });

  // Serialize rapid changes so a late navigation cannot overwrite a newer one.
  async function write() {
    if (writing) return;
    writing = true;
    try {
      while (pending && !disposed && router.currentRoute.value.path === path) {
        const next = pending;
        pending = null;
        const writeRevision = revision;
        const failure = await queueTableUrlWrite(router, (navigate) => {
          if (disposed || revision !== writeRevision || router.currentRoute.value.path !== path) return;
          expected = codec.signature(next.state);
          const current = router.currentRoute.value;
          return navigate(next.replace ? 'replace' : 'push', { path, query: codec.merge(current.query, next.state), hash: current.hash });
        });
        if (failure && !pending) applied = codec.decode(router.currentRoute.value.query);
      }
    } finally {
      writing = false;
      expected = null;
    }
  }

  function commit(partial) {
    if (restoring || disposed) return;
    const next = partial ? { ...applied, ...partial } : snapshot();
    if (codec.signature(next) === codec.signature(applied)) return;
    const replace = next.search.val !== applied.search.val;
    applied = next;
    pending = { state: next, replace };
    void write().catch((error) => {
      applied = codec.decode(router.currentRoute.value.query);
      console.warn('Could not update the table URL', error);
    });
  }

  watch(
    // Observe completed router navigations synchronously. Nuxt's page route can lag
    // behind them, which would let a rapid second edit restore an older URL.
    () => router.currentRoute.value,
    (current) => {
      if (disposed) return;
      if (current.path !== path) {
        revision++;
        pending = null;
        return;
      }
      const next = codec.decode(current.query);
      const signature = codec.signature(next);
      const interrupted = writing && !isTableUrlNavigation(router, current);
      // A neighbour's navigation must not discard this table's queued edits.
      if (signature === observed && !interrupted) return;
      observed = signature;
      if (!interrupted && (signature === expected || signature === codec.signature(applied))) return;
      revision++;
      pending = null;
      applied = next;
      if (signature === codec.signature(snapshot())) return;
      restoring = true;
      try {
        Object.assign(state.value, structuredClone(next));
        refresh();
      } finally {
        restoring = false;
      }
    },
    { flush: 'sync' },
  );

  const resetKey = computed(() => codec.signature(codec.decode(router.currentRoute.value.query)));
  return { commit, resetKey };
}
