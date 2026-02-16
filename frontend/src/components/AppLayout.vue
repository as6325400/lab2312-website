<script setup lang="ts">
import { ref, computed, provide } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SideBar from './SideBar.vue'

const auth = useAuthStore()
const route = useRoute()
const sidebarOpen = ref(false)

// Allow child pages to set a dynamic title (e.g., DocsPage)
const dynamicTitle = ref('')
provide('setPageTitle', (title: string) => { dynamicTitle.value = title })

const pageTitle = computed(() => {
  const name = route.name as string
  if (name === 'docs') return dynamicTitle.value || 'Lab Portal'
  const titles: Record<string, string> = {
    'terminal': 'Terminal',
    'monitoring': 'Monitoring',
    'members': '成員名冊',
    'change-password': '變更密碼',
    'admin-invites': '邀請管理',
    'admin-requests': '註冊審核',
    'admin-docs': '文件編輯',
    'admin-users': '使用者管理',
    'admin-system': '系統設定',
    'admin-email-template': '信件模板',
    'admin-audit': '稽核紀錄',
  }
  return titles[name] || 'Lab Portal'
})
</script>

<template>
  <div class="flex h-screen bg-gray-50">
    <SideBar v-model="sidebarOpen" />
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shrink-0">
        <div class="flex items-center gap-3">
          <!-- Hamburger (mobile only) -->
          <button
            class="md:hidden p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            @click="sidebarOpen = true"
          >
            <span class="i-carbon-menu text-xl" />
          </button>
          <h1 class="text-lg font-semibold text-gray-800">{{ pageTitle }}</h1>
        </div>
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span class="hidden sm:inline">{{ auth.user?.displayName || auth.username }}</span>
          <button
            @click="auth.logout().then(() => $router.push('/login'))"
            class="btn-secondary text-sm !py-1 !px-3"
          >
            登出
          </button>
        </div>
      </header>
      <!-- Main Content -->
      <main class="flex-1 overflow-auto p-4 md:p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
