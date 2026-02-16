import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../composables/useApi'

export const useBrandingStore = defineStore('branding', () => {
  const siteName = ref('Lab Portal')
  const siteLogo = ref('')
  const loaded = ref(false)

  const siteInitial = computed(() => (siteName.value || 'L').charAt(0).toUpperCase())

  async function fetch() {
    try {
      const { data } = await api.get('/branding')
      siteName.value = data.siteName || 'Lab Portal'
      siteLogo.value = data.siteLogo || ''
    } catch {
      // Use defaults
    } finally {
      loaded.value = true
    }
  }

  function update(name: string, logo: string) {
    siteName.value = name
    siteLogo.value = logo
  }

  return { siteName, siteLogo, siteInitial, loaded, fetch, update }
})
