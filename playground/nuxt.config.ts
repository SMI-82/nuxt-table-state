export default defineNuxtConfig({
  modules: ['../src/module', '@vueuse/nuxt'],
  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: 'latest',
  dataTable: {
    maxPerPage: 50,
  },
})
