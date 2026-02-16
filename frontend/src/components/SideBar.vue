<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useBrandingStore } from '../stores/branding'
import api from '../composables/useApi'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const branding = useBrandingStore()

const VPN_URL = import.meta.env.VITE_VPN_URL || ''

onMounted(() => {
  if (!branding.loaded) branding.fetch()
})

// Close sidebar on route change (mobile)
router.afterEach(() => {
  emit('update:modelValue', false)
})

async function openVpn() {
  const win = window.open('', '_blank')
  try {
    const { data } = await api.post('/sso/token')
    if (win) {
      win.location.href = `${VPN_URL}/api/sso/callback?token=${encodeURIComponent(data.token)}`
    }
  } catch {
    win?.close()
    alert('無法產生 SSO token')
  }
}

const adminNav = [
  { label: '邀請管理', to: '/admin/invites', icon: 'i-carbon-email' },
  { label: '註冊審核', to: '/admin/requests', icon: 'i-carbon-user-follow' },
  { label: '文件編輯', to: '/admin/docs', icon: 'i-carbon-edit' },
  { label: 'Proxy 管理', to: '/admin/caddy', icon: 'i-carbon-cloud-app' },
  { label: '信件模板', to: '/admin/email-template', icon: 'i-carbon-email-new' },
  { label: '使用者管理', to: '/admin/users', icon: 'i-carbon-group' },
  { label: '系統設定', to: '/admin/system', icon: 'i-carbon-settings' },
  { label: '稽核紀錄', to: '/admin/audit', icon: 'i-carbon-catalog' },
]

const isActive = (path: string) => {
  return route.path === path || route.path.startsWith(path + '/')
}
</script>

<template>
  <!-- Backdrop (mobile only) -->
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 bg-black/40 z-40 md:hidden"
        @click="emit('update:modelValue', false)"
      />
    </transition>
  </Teleport>

  <!-- Sidebar -->
  <aside
    class="fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-gray-200 flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out md:relative md:z-auto md:translate-x-0"
    :class="modelValue ? 'translate-x-0' : '-translate-x-full'"
  >
    <!-- Logo -->
    <div class="h-14 flex items-center px-4 border-b border-gray-200">
      <div class="flex items-center gap-2">
        <div v-if="branding.siteLogo" class="w-8 h-8 rounded-lg overflow-hidden shrink-0">
          <img :src="branding.siteLogo" alt="Logo" class="w-full h-full object-cover" />
        </div>
        <div v-else class="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {{ branding.siteInitial }}
        </div>
        <span class="font-semibold text-gray-800 text-lg truncate">{{ branding.siteName }}</span>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-4 overflow-y-auto">
      <ul class="space-y-1 px-2">
        <li v-for="item in branding.sidebarNav" :key="item.to">
          <!-- VPN: special SSO handler -->
          <a
            v-if="item.to === 'vpn' && VPN_URL"
            href="#"
            @click.prevent="openVpn"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <span :class="item.icon" class="text-lg" />
            {{ item.label }}
          </a>
          <!-- External link -->
          <a
            v-else-if="item.to.startsWith('http://') || item.to.startsWith('https://')"
            :href="item.to"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <span :class="item.icon" class="text-lg" />
            {{ item.label }}
          </a>
          <!-- Internal route link -->
          <router-link
            v-else-if="item.to !== 'vpn'"
            :to="item.to"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
            :class="isActive(item.to)
              ? 'bg-primary-50 text-primary-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'"
          >
            <span :class="item.icon" class="text-lg" />
            {{ item.label }}
          </router-link>
        </li>
      </ul>

      <!-- Admin section -->
      <template v-if="auth.isAdmin">
        <div class="px-4 mt-6 mb-2">
          <span class="text-xs font-medium uppercase tracking-wider text-gray-400">管理員</span>
        </div>
        <ul class="space-y-1 px-2">
          <li v-for="item in adminNav" :key="item.to">
            <router-link
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="isActive(item.to)
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'"
            >
              <span :class="item.icon" class="text-lg" />
              {{ item.label }}
            </router-link>
          </li>
        </ul>
      </template>
    </nav>

    <!-- User info at bottom -->
    <div class="p-3 border-t border-gray-200 space-y-2">
      <div class="flex items-center gap-2 px-1">
        <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">
          {{ (auth.username || '?')[0].toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-gray-800 truncate">{{ auth.username }}</div>
          <div class="text-xs" :class="auth.viewAsUser ? 'text-amber-500' : 'text-gray-400'">
            {{ auth.viewAsUser ? 'User (預覽中)' : auth.isAdmin ? 'Admin' : 'User' }}
          </div>
        </div>
      </div>
      <!-- View as user toggle (real admins only) -->
      <button
        v-if="auth.isRealAdmin"
        @click="auth.viewAsUser = !auth.viewAsUser"
        class="w-full text-center text-xs rounded py-1.5 transition-colors"
        :class="auth.viewAsUser
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
      >
        {{ auth.viewAsUser ? '返回管理員視角' : '切換使用者視角' }}
      </button>
      <div class="flex gap-1">
        <router-link
          to="/change-password"
          class="flex-1 text-center text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded py-1.5 transition-colors"
        >
          變更密碼
        </router-link>
        <button
          @click="auth.logout().then(() => $router.push('/login'))"
          class="flex-1 text-center text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded py-1.5 transition-colors"
        >
          登出
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
