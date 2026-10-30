// Test stand-in for Nuxt's `#imports`: Vue, VueUse's debounce, and the few Nuxt composables the module uses.
import { ref } from 'vue';
export * from 'vue';
export { useDebounceFn } from '@vueuse/core';

let router;
let states;
let runtimeConfig = { public: {} };

/**
 * Resets the fake Nuxt app: a fresh router, empty useState store and runtime config.
 *
 * @param {import('vue-router').Router} testRouter
 * @param {object} [testRuntimeConfig] What useRuntimeConfig() returns, e.g. `{ public: { dataTable: { ... } } }`.
 */
export function configureNuxt(testRouter, testRuntimeConfig = { public: {} }) {
  router = testRouter;
  states = new Map();
  runtimeConfig = testRuntimeConfig;
}
export const useRoute = () => router.currentRoute.value;
export const useRouter = () => router;
export const useRuntimeConfig = () => runtimeConfig;
export function useState(key, factory) {
  if (!states.has(key)) states.set(key, ref(factory()));
  return states.get(key);
}
