<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../../composables/useApi'

const logs = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const pageSizeOptions = [20, 50, 100, 200]
const loading = ref(true)
const jumpInput = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const offset = computed(() => (page.value - 1) * pageSize.value)

async function fetchLogs() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/audit', { params: { limit: pageSize.value, offset: offset.value } })
    logs.value = data.logs
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function goToPage(p: number) {
  const clamped = Math.max(1, Math.min(p, totalPages.value))
  if (clamped !== page.value) {
    page.value = clamped
    fetchLogs()
  }
}

function jumpToPage() {
  const p = parseInt(jumpInput.value)
  if (!isNaN(p)) {
    goToPage(p)
  }
  jumpInput.value = ''
}

function changePageSize(size: number) {
  pageSize.value = size
  page.value = 1
  fetchLogs()
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
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <h2 class="text-lg font-semibold text-gray-800">稽核紀錄</h2>
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span>每頁</span>
        <select
          :value="pageSize"
          @change="changePageSize(Number(($event.target as HTMLSelectElement).value))"
          class="input-field !w-auto !py-1 !px-2 text-sm"
        >
          <option v-for="s in pageSizeOptions" :key="s" :value="s">{{ s }}</option>
        </select>
        <span>筆，共 {{ total }} 筆</span>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else class="card !p-0 overflow-hidden overflow-x-auto">
      <table class="w-full text-sm min-w-[600px]">
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
    <div class="flex flex-col sm:flex-row justify-between items-center gap-3">
      <button @click="goToPage(page - 1)" :disabled="page <= 1" class="btn-secondary text-sm">上一頁</button>
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span>第</span>
        <form @submit.prevent="jumpToPage" class="inline">
          <input
            v-model="jumpInput"
            type="text"
            :placeholder="String(page)"
            class="input-field !w-16 !py-1 !px-2 text-sm text-center"
            inputmode="numeric"
          />
        </form>
        <span>/ {{ totalPages }} 頁</span>
      </div>
      <button @click="goToPage(page + 1)" :disabled="page >= totalPages" class="btn-secondary text-sm">下一頁</button>
    </div>
  </div>
</template>
