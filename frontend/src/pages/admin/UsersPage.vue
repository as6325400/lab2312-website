<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../../composables/useApi'

const users = ref<any[]>([])
const loading = ref(true)

const totalCount = computed(() => users.value.length)
const activeCount = computed(() => users.value.filter(u => u.is_active).length)
const adminCount = computed(() => users.value.filter(u => u.role === 'admin').length)
const ldapCount = computed(() => users.value.filter(u => u.source === 'ldap').length)

async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/users')
    users.value = data
  } finally {
    loading.value = false
  }
}

async function toggleActive(user: any) {
  await api.patch(`/admin/users/${user.id}`, { is_active: !user.is_active })
  await fetchUsers()
}

async function toggleRole(user: any) {
  const newRole = user.role === 'admin' ? 'user' : 'admin'
  if (!confirm(`確定要將 ${user.username} 的角色改為 ${newRole}？`)) return
  await api.patch(`/admin/users/${user.id}`, { role: newRole })
  await fetchUsers()
}

onMounted(fetchUsers)
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <h2 class="text-lg font-semibold text-gray-800">使用者管理</h2>

    <!-- 統計卡片 -->
    <div v-if="!loading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-gray-900">{{ totalCount }}</div>
        <div class="text-xs text-gray-500 mt-1">總成員數</div>
      </div>
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-green-600">{{ activeCount }}</div>
        <div class="text-xs text-gray-500 mt-1">啟用中</div>
      </div>
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-purple-600">{{ adminCount }}</div>
        <div class="text-xs text-gray-500 mt-1">管理員</div>
      </div>
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-blue-600">{{ ldapCount }}</div>
        <div class="text-xs text-gray-500 mt-1">LDAP 帳號</div>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else class="card !p-0 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">帳號</th>
            <th class="px-4 py-3 font-medium">顯示名稱</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">角色</th>
            <th class="px-4 py-3 font-medium">來源</th>
            <th class="px-4 py-3 font-medium">狀態</th>
            <th class="px-4 py-3 font-medium">最後登入</th>
            <th class="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 font-medium">{{ user.username }}</td>
            <td class="px-4 py-3">{{ user.display_name }}</td>
            <td class="px-4 py-3 text-gray-500">{{ user.email }}</td>
            <td class="px-4 py-3">
              <span
                class="text-xs px-2 py-0.5 rounded"
                :class="user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'"
              >
                {{ user.role }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500">{{ user.source }}</td>
            <td class="px-4 py-3">
              <span
                class="text-xs px-2 py-0.5 rounded"
                :class="user.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'"
              >
                {{ user.is_active ? '啟用' : '停用' }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500 text-xs">
              {{ user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button @click="toggleRole(user)" class="text-xs text-primary-600 hover:underline">
                  {{ user.role === 'admin' ? '降為 user' : '升為 admin' }}
                </button>
                <button v-if="user.source === 'ldap'" @click="toggleActive(user)" class="text-xs hover:underline" :class="user.is_active ? 'text-red-600' : 'text-green-600'">
                  {{ user.is_active ? '停用' : '啟用' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
