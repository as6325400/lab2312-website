<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../../composables/useApi'

const subject = ref('')
const body = ref('')
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
const testEmail = ref('')
const sending = ref(false)
const testAttachments = ref<File[]>([])
const testFileInput = ref<HTMLInputElement | null>(null)

const variables = [
  { key: '{{name}}', desc: '姓名' },
  { key: '{{username}}', desc: '帳號' },
  { key: '{{password}}', desc: '密碼' },
  { key: '{{url}}', desc: '網站網址' },
]

const sampleData: Record<string, string> = {
  '{{name}}': '王小明',
  '{{username}}': 'xiaoming',
  '{{password}}': 'Lab@2312',
  '{{url}}': 'https://lab.example.com',
}

function replacePlaceholders(text: string) {
  return text.replace(/\{\{(\w+)\}\}/g, (match) => sampleData[match] ?? match)
}

const previewSubject = computed(() => replacePlaceholders(subject.value))
const previewBody = computed(() => replacePlaceholders(body.value))

async function fetchTemplate() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/settings/approve_email')
    const tpl = JSON.parse(data.value)
    subject.value = tpl.subject
    body.value = tpl.body
  } catch {
    message.value = '載入模板失敗'
    messageType.value = 'error'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  message.value = ''
  try {
    await api.put('/admin/settings/approve_email', {
      value: JSON.stringify({ subject: subject.value, body: body.value }),
    })
    message.value = '儲存成功'
    messageType.value = 'success'
  } catch (err: any) {
    message.value = err.response?.data?.error || '儲存失敗'
    messageType.value = 'error'
  } finally {
    saving.value = false
  }
}

function onTestFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  const newFiles = Array.from(input.files)
  const remaining = 5 - testAttachments.value.length
  testAttachments.value = [...testAttachments.value, ...newFiles.slice(0, remaining)]
  input.value = ''
}

function removeTestFile(index: number) {
  testAttachments.value = testAttachments.value.filter((_, i) => i !== index)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function sendTest() {
  if (!testEmail.value) {
    message.value = '請輸入收件人 Email'
    messageType.value = 'error'
    return
  }
  sending.value = true
  message.value = ''
  try {
    const fd = new FormData()
    fd.append('to', testEmail.value)
    for (const file of testAttachments.value) {
      fd.append('files', file)
    }
    await api.post('/admin/settings/test-email', fd)
    message.value = `測試信已寄出至 ${testEmail.value}`
    messageType.value = 'success'
  } catch (err: any) {
    message.value = err.response?.data?.error || '寄送失敗'
    messageType.value = 'error'
  } finally {
    sending.value = false
  }
}

onMounted(fetchTemplate)
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <h2 class="text-lg font-semibold text-gray-800">審核通過信件模板</h2>
      <button @click="save" class="btn-primary text-sm" :disabled="saving">
        {{ saving ? '儲存中...' : '儲存' }}
      </button>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>

    <template v-else>
      <!-- 可用變數 -->
      <div class="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
        可用變數：
        <span v-for="(v, i) in variables" :key="v.key">
          <code class="bg-blue-100 px-1 rounded" v-text="v.key" />
          {{ v.desc }}<span v-if="i < variables.length - 1">、</span>
        </span>
      </div>

      <div class="card space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">信件主旨</label>
          <input v-model="subject" type="text" class="input-field" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">信件內容</label>
          <textarea
            v-model="body"
            class="input-field font-mono text-sm"
            rows="14"
            spellcheck="false"
          />
        </div>
      </div>

      <!-- 預覽 -->
      <div class="card">
        <div class="text-sm font-medium text-gray-700 mb-3">預覽</div>
        <div class="bg-gray-50 rounded-lg p-4 space-y-2">
          <div class="text-sm">
            <span class="text-gray-500">主旨：</span>
            <span class="font-medium" v-text="previewSubject" />
          </div>
          <hr class="border-gray-200" />
          <pre class="text-sm text-gray-700 whitespace-pre-wrap font-sans" v-text="previewBody" />
        </div>
      </div>

      <!-- 測試寄信 -->
      <div class="card space-y-3">
        <div class="text-sm font-medium text-gray-700">測試寄信</div>
        <p class="text-xs text-gray-400">使用範例資料填入模板並寄出測試信，主旨會加上 [測試] 前綴。</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            v-model="testEmail"
            type="email"
            class="input-field flex-1"
            placeholder="收件人 Email"
          />
          <button @click="sendTest" class="btn-secondary text-sm whitespace-nowrap" :disabled="sending">
            {{ sending ? '寄送中...' : '寄送測試信' }}
          </button>
        </div>

        <!-- 附件 -->
        <div>
          <label class="block text-xs text-gray-500 mb-1">附件（最多 5 個，每個上限 10 MB）</label>
          <input
            ref="testFileInput"
            type="file"
            multiple
            class="hidden"
            @change="onTestFilesSelected"
          />
          <button
            v-if="testAttachments.length < 5"
            @click="testFileInput?.click()"
            class="btn-secondary text-xs"
          >
            選擇檔案
          </button>
          <ul v-if="testAttachments.length" class="mt-2 space-y-1">
            <li
              v-for="(file, i) in testAttachments"
              :key="i"
              class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="i-carbon-attachment text-gray-400" />
                <span class="truncate text-gray-700">{{ file.name }}</span>
                <span class="text-xs text-gray-400 shrink-0">{{ formatSize(file.size) }}</span>
              </div>
              <button @click="removeTestFile(i)" class="text-red-400 hover:text-red-600 shrink-0 ml-2">
                <span class="i-carbon-close text-sm" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <div
      v-if="message"
      class="rounded-lg p-3 text-sm"
      :class="messageType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
    >
      {{ message }}
    </div>
  </div>
</template>
