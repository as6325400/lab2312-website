<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../composables/useApi'

const requests = ref<any[]>([])
const loading = ref(true)
const statusFilter = ref('pending')
const processingId = ref<number | null>(null)
const approveError = ref('')

// 審核通過的表單
const approveTarget = ref<any>(null)

async function fetchRequests() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/requests', { params: { status: statusFilter.value } })
    requests.value = data
  } finally {
    loading.value = false
  }
}

function showApproveForm(req: any) {
  approveTarget.value = req
  approveError.value = ''
}

async function confirmApprove() {
  if (!approveTarget.value) return
  approveError.value = ''
  processingId.value = approveTarget.value.id
  try {
    await api.post(`/admin/requests/${approveTarget.value.id}/approve`, {
      role: 'user',
    })
    approveTarget.value = null
    await fetchRequests()
  } catch (e: any) {
    approveError.value = e.response?.data?.error || '審核失敗'
  } finally {
    processingId.value = null
  }
}

async function reject(id: number) {
  const reason = prompt('拒絕原因（可選）：')
  if (reason === null) return
  processingId.value = id
  try {
    await api.post(`/admin/requests/${id}/reject`, { reason })
    await fetchRequests()
  } finally {
    processingId.value = null
  }
}

onMounted(fetchRequests)
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <h2 class="text-lg font-semibold text-gray-800">註冊審核</h2>
      <div class="flex gap-2">
        <button
          v-for="s in ['pending', 'approved', 'rejected']"
          :key="s"
          @click="statusFilter = s; fetchRequests()"
          class="text-sm px-3 py-1 rounded-lg transition-colors"
          :class="statusFilter === s ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'"
        >
          {{ s === 'pending' ? '待審核' : s === 'approved' ? '已通過' : '已拒絕' }}
        </button>
      </div>
    </div>

    <!-- Approve dialog -->
    <div v-if="approveTarget" class="card border-2 border-primary-300 space-y-4">
      <h3 class="font-semibold text-gray-800">
        審核通過：{{ approveTarget.name }}（{{ approveTarget.desired_username }}）
      </h3>

      <!-- LDAP Entry 預覽 -->
      <div class="bg-gray-50 rounded-lg p-4 overflow-x-auto">
        <div class="text-sm font-medium text-gray-700 mb-2">將建立的 LDAP Entry</div>
        <table class="w-full text-sm min-w-[400px]">
          <tbody>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">uid</td>
              <td class="py-1.5 text-gray-800 font-mono">{{ approveTarget.desired_username }}</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">cn</td>
              <td class="py-1.5 text-gray-800 font-mono">{{ approveTarget.name }}</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">sn</td>
              <td class="py-1.5 text-gray-800 font-mono">{{ approveTarget.name.split(' ').pop() || approveTarget.name }}</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">mail</td>
              <td class="py-1.5 text-gray-800 font-mono">{{ approveTarget.email }}</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">employeeNumber</td>
              <td class="py-1.5 text-gray-800 font-mono">{{ approveTarget.student_id || '（無）' }}</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">homeDirectory</td>
              <td class="py-1.5 text-gray-800 font-mono">/home/{{ approveTarget.desired_username }}</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">loginShell</td>
              <td class="py-1.5 text-gray-800 font-mono">/bin/bash</td>
            </tr>
            <tr class="border-b border-gray-200">
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">gidNumber</td>
              <td class="py-1.5 text-gray-800 font-mono">10000</td>
            </tr>
            <tr>
              <td class="py-1.5 pr-4 text-gray-500 font-mono whitespace-nowrap">objectClass</td>
              <td class="py-1.5 text-gray-800 font-mono">inetOrgPerson, posixAccount, top</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 確認操作 -->
      <div class="space-y-3">
        <p class="text-sm text-gray-600 bg-blue-50 rounded-lg p-3">
          系統將自動產生隨機密碼，並透過 Email 寄送給使用者。
        </p>
        <div v-if="approveError" class="text-red-500 text-sm bg-red-50 rounded-lg p-3">
          {{ approveError }}
        </div>
        <div class="flex gap-2">
          <button @click="confirmApprove" class="btn-primary text-sm" :disabled="processingId === approveTarget.id">
            {{ processingId === approveTarget.id ? '建立中...' : '確認通過並建立 LDAP 帳號' }}
          </button>
          <button @click="approveTarget = null" class="btn-secondary text-sm">取消</button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else-if="requests.length === 0" class="card text-center text-gray-500 py-8">
      無{{ statusFilter === 'pending' ? '待審核' : statusFilter === 'approved' ? '已通過' : '已拒絕' }}的申請
    </div>
    <div v-else class="space-y-3">
      <div v-for="req in requests" :key="req.id" class="card !p-4">
        <div class="flex flex-col sm:flex-row items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <span class="font-semibold text-gray-800">{{ req.name }}</span>
              <code class="text-sm bg-gray-100 px-2 py-0.5 rounded">{{ req.desired_username }}</code>
            </div>
            <div class="text-sm text-gray-500 space-y-1">
              <div>Email: {{ req.email }}</div>
              <div v-if="req.student_id">學號: {{ req.student_id }}</div>
              <div>申請時間: {{ new Date(req.created_at).toLocaleString() }}</div>
              <div v-if="req.reviewed_at">審核時間: {{ new Date(req.reviewed_at).toLocaleString() }}</div>
              <div v-if="req.admin_note" class="text-gray-600">管理員備註: {{ req.admin_note }}</div>
            </div>
            <!-- 已通過的顯示 LDAP entry -->
            <div v-if="statusFilter === 'approved'" class="mt-3 bg-gray-50 rounded-lg p-3">
              <div class="text-xs font-medium text-gray-500 mb-1.5">LDAP Entry</div>
              <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs font-mono">
                <span class="text-gray-400">uid</span><span class="text-gray-700">{{ req.desired_username }}</span>
                <span class="text-gray-400">cn</span><span class="text-gray-700">{{ req.name }}</span>
                <span class="text-gray-400">mail</span><span class="text-gray-700">{{ req.email }}</span>
                <span class="text-gray-400">employeeNumber</span><span class="text-gray-700">{{ req.student_id || '—' }}</span>
                <span class="text-gray-400">homeDirectory</span><span class="text-gray-700">/home/{{ req.desired_username }}</span>
                <span class="text-gray-400">loginShell</span><span class="text-gray-700">/bin/bash</span>
              </div>
            </div>
          </div>
          <div v-if="statusFilter === 'pending'" class="flex gap-2 shrink-0">
            <button
              @click="showApproveForm(req)"
              class="btn-primary text-sm !py-1 !px-3"
              :disabled="processingId === req.id"
            >
              通過
            </button>
            <button
              @click="reject(req.id)"
              class="btn-danger text-sm !py-1 !px-3"
              :disabled="processingId === req.id"
            >
              拒絕
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
