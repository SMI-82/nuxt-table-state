import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, reactive } from 'vue';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#imports') return { url: new URL('../testing/nuxt-imports.js', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { useTableSearchInput } = await import('../src/runtime/composables/useTableSearchInput.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the composable in its own scope with reactive props and a recording emit. */
function setup(t, initialProps) {
  const props = reactive({ delay: 10, resetKey: 'one', ...initialProps });
  const searches = [];
  const models = [];
  const emit = (event, value) => (event === 'search' ? searches : models).push(value);
  const scope = effectScope();
  const input = scope.run(() => useTableSearchInput(props, emit));
  t.after(() => scope.stop());
  return { props, input, searches, models, scope };
}

test('typing is debounced and emits both the model update and the search', async (t) => {
  const { input, searches, models } = setup(t, { modelValue: 'restored' });
  assert.equal(input.inputValue.value, 'restored');
  input.onInput({ target: { value: 'ty' } });
  input.onInput({ target: { value: 'typed' } });
  assert.equal(input.inputValue.value, 'typed');
  assert.deepEqual(searches, []);
  await wait(30);
  assert.deepEqual(searches, ['typed']);
  assert.deepEqual(models, ['typed']);
});

test('a URL restore replaces the text silently and cancels pending typing', async (t) => {
  const { props, input, searches } = setup(t, { modelValue: '' });
  input.onInput({ target: { value: 'obsolete' } });
  props.modelValue = 'back';
  props.resetKey = 'two';
  await nextTick();
  await wait(30);
  assert.equal(input.inputValue.value, 'back');
  assert.deepEqual(searches, []);
});

test('a reset key change alone also cancels pending typing', async (t) => {
  const { props, input, searches } = setup(t, { modelValue: 'same' });
  input.onInput({ target: { value: 'pending' } });
  props.resetKey = 'two';
  await wait(30);
  assert.equal(input.inputValue.value, 'same');
  assert.deepEqual(searches, []);
});

test('clearing emits the empty search at once and drops pending typing', async (t) => {
  const { input, searches } = setup(t, { modelValue: 'x' });
  input.onInput({ target: { value: 'will be cleared' } });
  input.clearInput();
  assert.equal(input.inputValue.value, '');
  assert.deepEqual(searches, ['']);
  await wait(30);
  assert.deepEqual(searches, ['']);
});

test('disposing the scope drops pending typing', async (t) => {
  const { input, searches, scope } = setup(t, { modelValue: '' });
  input.onInput({ target: { value: 'gone' } });
  scope.stop();
  await wait(30);
  assert.deepEqual(searches, []);
});

test('the debounce defaults to 300 ms when no delay is given', async (t) => {
  const { input, searches } = setup(t, { modelValue: '', delay: undefined });
  input.onInput({ target: { value: 'slow' } });
  await wait(100);
  assert.deepEqual(searches, []);
  await wait(260);
  assert.deepEqual(searches, ['slow']);
});
