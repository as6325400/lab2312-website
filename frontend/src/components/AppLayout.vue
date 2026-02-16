<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SideBar from './SideBar.vue'

const auth = useAuthStore()
const route = useRoute()

const pageTitle = computed(() => {
  const name = route.name as string
  const titles: Record<string, string> = {
    'docs': 'Lab 使用教學',
    'terminal': 'Terminal',
    'monitoring': 'Monitoring',
    'admin-invites': '邀請管理',
    'admin-requests': '註冊審核',
    'admin-docs': '文件編輯',
    'admin-users': '使用者管理',
    'admin-audit': '稽核紀錄',
  }
  return titles[name] || 'Lab Portal'
})
</script>

<template>
  <div class="flex h-screen bg-gray-50">
    <SideBar />
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <h1 class="text-lg font-semibold text-gray-800">{{ pageTitle }}</h1>
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span>{{ auth.user?.displayName || auth.username }}</span>
          <button
            @click="auth.logout().then(() => $router.push('/login'))"
            class="btn-secondary text-sm !py-1 !px-3"
          >
            登出
          </button>
        </div>
      </header>
      <!-- Main Content -->
      <main class="flex-1 overflow-auto p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
