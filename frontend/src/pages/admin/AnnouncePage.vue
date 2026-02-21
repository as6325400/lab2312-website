<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../../composables/useApi'

interface User {
  id: number
  username: string
  display_name: string
  email: string
  role: string
  source: string
  is_active: number
  is_hidden: number
}

const users = ref<User[]>([])
const selected = ref<Set<number>>(new Set())
const loading = ref(true)
const subject = ref('')
const body = ref('')
const attachments = ref<File[]>([])
const sending = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
const fileInput = ref<HTMLInputElement | null>(null)

const ldapOnly = ref(false)

const usersWithEmail = computed(() => users.value.filter(u => u.email))
const filteredUsers = computed(() =>
  ldapOnly.value ? usersWithEmail.value.filter(u => u.source === 'ldap') : usersWithEmail.value
)
const selectedCount = computed(() => selected.value.size)

async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/users')
    users.value = data
  } finally {
    loading.value = false
  }
}

function toggleUser(id: number) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function selectAll() {
  selected.value = new Set(filteredUsers.value.map(u => u.id))
}

function deselectAll() {
  selected.value = new Set()
}

function selectVisible() {
  selected.value = new Set(
    filteredUsers.value.filter(u => !u.is_hidden && u.is_active).map(u => u.id)
  )
}

function onToggleLdap() {
  ldapOnly.value = !ldapOnly.value
  // Remove non-LDAP users from selection when switching to LDAP only
  if (ldapOnly.value) {
    const ldapIds = new Set(usersWithEmail.value.filter(u => u.source === 'ldap').map(u => u.id))
    selected.value = new Set([...selected.value].filter(id => ldapIds.has(id)))
  }
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  const newFiles = Array.from(input.files)
  // Limit total to 5 files
  const remaining = 5 - attachments.value.length
  attachments.value = [...attachments.value, ...newFiles.slice(0, remaining)]
  input.value = ''
}

function removeFile(index: number) {
  attachments.value = attachments.value.filter((_, i) => i !== index)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function send() {
  if (selected.value.size === 0) {
    message.value = '請選擇至少一位收件者'
    messageType.value = 'error'
    return
  }
  if (!subject.value.trim()) {
    message.value = '請輸入信件主旨'
    messageType.value = 'error'
    return
  }
  if (!body.value.trim()) {
    message.value = '請輸入信件內容'
    messageType.value = 'error'
    return
  }

  if (!confirm(`確定要寄送公告給 ${selected.value.size} 位使用者？`)) return

  sending.value = true
  message.value = ''
  try {
    const fd = new FormData()
    fd.append('userIds', JSON.stringify(Array.from(selected.value)))
    fd.append('subject', subject.value)
    fd.append('body', body.value)
    for (const file of attachments.value) {
      fd.append('files', file)
    }
    const { data } = await api.post('/admin/announce', fd)
    const parts = [`成功寄出 ${data.sent} 封`]
    if (data.failed > 0) parts.push(`失敗 ${data.failed} 封`)
    message.value = parts.join('，')
    messageType.value = data.failed > 0 ? 'error' : 'success'
  } catch (err: any) {
    message.value = err.response?.data?.error || '寄送失敗'
    messageType.value = 'error'
  } finally {
    sending.value = false
  }
}

onMounted(fetchUsers)
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <h2 class="text-lg font-semibold text-gray-800">公告信件</h2>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>

    <template v-else>
      <!-- 收件者選擇 -->
      <div class="card space-y-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div class="text-sm font-medium text-gray-700">
            收件者
            <span class="text-gray-400 font-normal ml-1">
              （已選 {{ selectedCount }} / {{ filteredUsers.length }} 人）
            </span>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <button
                role="switch"
                :aria-checked="ldapOnly"
                @click="onToggleLdap"
                class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="ldapOnly ? 'bg-primary-600' : 'bg-gray-200'"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  :class="ldapOnly ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
              <span class="text-xs text-gray-600">僅 LDAP</span>
            </label>
            <button @click="selectAll" class="btn-secondary text-xs !py-1 !px-3">全選</button>
            <button @click="deselectAll" class="btn-secondary text-xs !py-1 !px-3">取消全選</button>
            <button @click="selectVisible" class="btn-secondary text-xs !py-1 !px-3">只選未隱藏且啟用</button>
          </div>
        </div>

        <div class="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          <label
            v-for="user in filteredUsers"
            :key="user.id"
            class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer select-none transition-colors"
            :class="{ 'opacity-50': !user.is_active }"
          >
            <input
              type="checkbox"
              :checked="selected.has(user.id)"
              @change="toggleUser(user.id)"
              class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-gray-800">{{ user.display_name || user.username }}</span>
              <span v-if="user.display_name" class="text-xs text-gray-400">{{ user.username }}</span>
              <span class="text-xs text-gray-400">{{ user.email }}</span>
            </div>
            <div class="flex gap-1 shrink-0">
              <span v-if="user.is_hidden" class="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-500">隱藏</span>
              <span v-if="!user.is_active" class="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600">停用</span>
            </div>
          </label>
          <div v-if="filteredUsers.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
            沒有可寄送的使用者
          </div>
        </div>
      </div>

      <!-- 信件內容 -->
      <div class="card space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">信件主旨</label>
          <input v-model="subject" type="text" class="input-field" placeholder="請輸入公告主旨" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">信件內容</label>
          <textarea
            v-model="body"
            class="input-field font-mono text-sm"
            rows="10"
            placeholder="請輸入公告內容"
            spellcheck="false"
          />
        </div>

        <!-- 附件 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">附件</label>
          <p class="text-xs text-gray-400 mb-2">最多 5 個檔案，每個上限 10 MB</p>
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="onFilesSelected"
          />
          <button
            v-if="attachments.length < 5"
            @click="fileInput?.click()"
            class="btn-secondary text-xs"
          >
            選擇檔案
          </button>
          <ul v-if="attachments.length" class="mt-2 space-y-1">
            <li
              v-for="(file, i) in attachments"
              :key="i"
              class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="i-carbon-attachment text-gray-400" />
                <span class="truncate text-gray-700">{{ file.name }}</span>
                <span class="text-xs text-gray-400 shrink-0">{{ formatSize(file.size) }}</span>
              </div>
              <button @click="removeFile(i)" class="text-red-400 hover:text-red-600 shrink-0 ml-2">
                <span class="i-carbon-close text-sm" />
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- 發送按鈕 -->
      <div class="flex justify-end">
        <button
          @click="send"
          :disabled="sending || selectedCount === 0"
          class="btn-primary text-sm"
        >
          {{ sending ? '寄送中...' : `寄送公告（${selectedCount} 人）` }}
        </button>
      </div>
    </template>

    <!-- 結果訊息 -->
    <div
      v-if="message"
      class="rounded-lg p-3 text-sm"
      :class="messageType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
    >
      {{ message }}
    </div>
  </div>
</template>
