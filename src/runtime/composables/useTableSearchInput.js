import { onScopeDispose, ref, useDebounceFn, watch } from '#imports';

/**
 * Debounced search-box state for a component bound to a filter manager.
 *
 * Only user typing schedules a search. A restore from the URL (a new `modelValue`
 * or `resetKey`) and unmounting both invalidate typing still waiting on the
 * debounce, so a stale value is never emitted. `useDebounceFn` comes from
 * `@vueuse/nuxt`.
 *
 * @param {{ modelValue?: string, resetKey?: string, delay?: number }} props Component props;
 *   bind `modelValue` to `fm.search.value.val` and `resetKey` to `fm.urlResetKey.value`.
 *   `delay` is the debounce in ms (default 300).
 * @param {(event: 'update:modelValue' | 'search', value: string) => void} emit Component emit.
 * @returns {{
 *   inputValue: import('vue').Ref<string>,
 *   onInput: (event: { target: { value: string } }) => void,
 *   clearInput: () => void,
 * }}
 */
export function useTableSearchInput(props, emit) {
  const inputValue = ref(props.modelValue ?? '');
  let revision = 0;
  watch(
    () => [props.modelValue, props.resetKey],
    () => {
      revision++;
      inputValue.value = props.modelValue ?? '';
    },
    { flush: 'sync' },
  );
  onScopeDispose(() => revision++);

  function submit(value) {
    emit('update:modelValue', value);
    emit('search', value);
  }
  const debouncedSearch = useDebounceFn(
    (value, version) => {
      if (version === revision) submit(value);
    },
    () => props.delay ?? 300,
  );

  /**
   * Input handler: shows the typed text at once and emits it after the debounce.
   *
   * @param {{ target: { value: string } }} event
   */
  function onInput(event) {
    inputValue.value = event.target.value;
    debouncedSearch(inputValue.value, revision);
  }

  /** Clears the box, cancels pending typing and emits the empty search immediately. */
  function clearInput() {
    revision++;
    inputValue.value = '';
    submit('');
  }

  return { inputValue, onInput, clearInput };
}
