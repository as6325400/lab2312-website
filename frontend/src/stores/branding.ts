import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'

export const useBrandingStore = defineStore('branding', () => {
  const siteName = ref('Lab Portal')
  const siteLogo = ref('')
  const siteFavicon = ref('')
  const loaded = ref(false)

  const siteInitial = computed(() => (siteName.value || 'L').charAt(0).toUpperCase())

  // Keep document.title and favicon in sync
  watch(siteName, (name) => {
    document.title = name || 'Lab Portal'
  })

  watch(siteFavicon, (url) => {
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
    if (link) {
      link.href = url || '/vite.svg'
    }
  })

  async function fetch() {
    try {
      const { data } = await api.get('/branding')
      siteName.value = data.siteName || 'Lab Portal'
      siteLogo.value = data.siteLogo || ''
      siteFavicon.value = data.siteFavicon || ''
    } catch {
      // Use defaults
    } finally {
      loaded.value = true
    }
  }

  function update(name: string, logo: string, favicon?: string) {
    siteName.value = name
    siteLogo.value = logo
    if (favicon !== undefined) siteFavicon.value = favicon
  }

  return { siteName, siteLogo, siteFavicon, siteInitial, loaded, fetch, update }
})
