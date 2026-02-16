<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../composables/useApi'

const members = ref<any[]>([])
const loading = ref(true)
const search = ref('')

const filtered = computed(() => {
  if (!search.value) return members.value
  const q = search.value.toLowerCase()
  return members.value.filter(m =>
    m.username.toLowerCase().includes(q) ||
    m.display_name.toLowerCase().includes(q) ||
    m.student_id.toLowerCase().includes(q) ||
    m.email.toLowerCase().includes(q)
  )
})

async function fetchMembers() {
  loading.value = true
  try {
    const { data } = await api.get('/members')
    members.value = data
  } finally {
    loading.value = false
  }
}

onMounted(fetchMembers)
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-gray-800">成員名冊</h2>
      <span v-if="!loading" class="text-sm text-gray-500">共 {{ members.length }} 人</span>
    </div>

    <input
      v-model="search"
      type="text"
      placeholder="搜尋帳號、姓名、學號、信箱..."
      class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
    />

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else class="card !p-0 overflow-hidden overflow-x-auto">
      <table class="w-full text-sm min-w-[480px]">
        <thead class="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">帳號</th>
            <th class="px-4 py-3 font-medium">姓名</th>
            <th class="px-4 py-3 font-medium">學號</th>
            <th class="px-4 py-3 font-medium">Email</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="m in filtered" :key="m.username" class="hover:bg-gray-50">
            <td class="px-4 py-3 font-medium">{{ m.username }}</td>
            <td class="px-4 py-3">{{ m.display_name }}</td>
            <td class="px-4 py-3 text-gray-500">{{ m.student_id || '-' }}</td>
            <td class="px-4 py-3 text-gray-500">{{ m.email || '-' }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="4" class="px-4 py-8 text-center text-gray-400">沒有符合的結果</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
