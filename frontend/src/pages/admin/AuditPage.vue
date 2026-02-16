<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../composables/useApi'

const logs = ref<any[]>([])
const total = ref(0)
const offset = ref(0)
const limit = 50
const loading = ref(true)

async function fetchLogs() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/audit', { params: { limit, offset: offset.value } })
    logs.value = data.logs
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function prevPage() {
  if (offset.value > 0) {
    offset.value = Math.max(0, offset.value - limit)
    fetchLogs()
  }
}

function nextPage() {
  if (offset.value + limit < total.value) {
    offset.value += limit
    fetchLogs()
  }
}

function formatDetail(json: string) {
  if (!json) return ''
  try {
    return JSON.stringify(JSON.parse(json), null, 0)
  } catch {
    return json
  }
}

onMounted(fetchLogs)
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-800">稽核紀錄</h2>
      <span class="text-sm text-gray-500">共 {{ total }} 筆</span>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else class="card !p-0 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">時間</th>
            <th class="px-4 py-3 font-medium">使用者</th>
            <th class="px-4 py-3 font-medium">動作</th>
            <th class="px-4 py-3 font-medium">詳情</th>
            <th class="px-4 py-3 font-medium">IP</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
              {{ new Date(log.created_at).toLocaleString() }}
            </td>
            <td class="px-4 py-3">{{ log.actor_name || '-' }}</td>
            <td class="px-4 py-3">
              <code class="text-xs bg-gray-100 px-2 py-0.5 rounded">{{ log.action }}</code>
            </td>
            <td class="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
              {{ formatDetail(log.detail_json) }}
            </td>
            <td class="px-4 py-3 text-gray-400 text-xs">{{ log.ip }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex justify-between items-center">
      <button @click="prevPage" :disabled="offset === 0" class="btn-secondary text-sm">上一頁</button>
      <span class="text-sm text-gray-500">
        {{ offset + 1 }}-{{ Math.min(offset + limit, total) }} / {{ total }}
      </span>
      <button @click="nextPage" :disabled="offset + limit >= total" class="btn-secondary text-sm">下一頁</button>
    </div>
  </div>
</template>
