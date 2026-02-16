import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'

export interface NavItem {
  label: string
  to: string
  icon: string
}

const defaultNav: NavItem[] = [
  { label: 'Lab 使用教學', to: '/docs/lab-guide', icon: 'i-carbon-document' },
  { label: 'Terminal', to: '/terminal', icon: 'i-carbon-terminal' },
  { label: 'Monitoring', to: '/monitoring', icon: 'i-carbon-dashboard' },
  { label: '成員名冊', to: '/members', icon: 'i-carbon-group' },
  { label: 'VPN 管理', to: 'vpn', icon: 'i-carbon-vpn' },
]

export const useBrandingStore = defineStore('branding', () => {
  const siteName = ref('Lab Portal')
  const siteLogo = ref('')
  const siteFavicon = ref('')
  const sidebarNav = ref<NavItem[]>(defaultNav)
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
      if (Array.isArray(data.sidebarNav)) sidebarNav.value = data.sidebarNav
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

  return { siteName, siteLogo, siteFavicon, sidebarNav, siteInitial, loaded, fetch, update }
})
