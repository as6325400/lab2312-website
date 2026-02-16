<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../../composables/useApi'

// ── Tab state ──
const activeTab = ref<'rules' | 'raw'>('rules')

// ── Proxy Rules ──
interface ProxyRule {
  id: number
  domain: string
  target: string
  description: string
  is_enabled: number
  created_by_name: string | null
  created_at: string
  updated_at: string
}

const rules = ref<ProxyRule[]>([])
const rulesLoading = ref(true)
const showCreate = ref(false)
const creating = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const output = ref('')
const outputType = ref<'success' | 'error' | 'warning' | ''>('')

const form = ref({ domain: '', target: '', description: '' })
const editForm = ref({ domain: '', target: '', description: '' })

const totalCount = computed(() => rules.value.length)
const enabledCount = computed(() => rules.value.filter(r => r.is_enabled).length)
const disabledCount = computed(() => rules.value.filter(r => !r.is_enabled).length)

async function fetchRules() {
  rulesLoading.value = true
  try {
    const { data } = await api.get('/admin/caddy/rules')
    rules.value = data
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '載入規則失敗')
  } finally {
    rulesLoading.value = false
  }
}

async function createRule() {
  creating.value = true
  output.value = ''
  try {
    const { data } = await api.post('/admin/caddy/rules', form.value)
    if (data.warning) {
      showOutput('warning', data.warning)
    } else {
      showOutput('success', data.output || '規則已建立並套用')
    }
    showCreate.value = false
    form.value = { domain: '', target: '', description: '' }
    await fetchRules()
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '建立失敗')
  } finally {
    creating.value = false
  }
}

function startEdit(rule: ProxyRule) {
  editingId.value = rule.id
  editForm.value = { domain: rule.domain, target: rule.target, description: rule.description }
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(id: number) {
  saving.value = true
  output.value = ''
  try {
    const { data } = await api.put(`/admin/caddy/rules/${id}`, editForm.value)
    if (data.warning) {
      showOutput('warning', data.warning)
    } else {
      showOutput('success', data.output || '規則已更新並套用')
    }
    editingId.value = null
    await fetchRules()
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '更新失敗')
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(rule: ProxyRule) {
  output.value = ''
  try {
    const { data } = await api.put(`/admin/caddy/rules/${rule.id}`, { is_enabled: !rule.is_enabled })
    if (data.warning) {
      showOutput('warning', data.warning)
    } else {
      showOutput('success', `${rule.domain} 已${rule.is_enabled ? '停用' : '啟用'}`)
    }
    await fetchRules()
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '操作失敗')
  }
}

async function deleteRule(rule: ProxyRule) {
  if (!confirm(`確定要刪除 ${rule.domain} 的規則嗎？`)) return
  output.value = ''
  try {
    const { data } = await api.delete(`/admin/caddy/rules/${rule.id}`)
    if (data.warning) {
      showOutput('warning', data.warning)
    } else {
      showOutput('success', data.output || '規則已刪除並套用')
    }
    await fetchRules()
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '刪除失敗')
  }
}

function showOutput(type: 'success' | 'error' | 'warning', msg: string) {
  outputType.value = type
  output.value = msg
}

// ── Raw Caddyfile editor ──
const rawContent = ref('')
const rawLoading = ref(false)
const rawSaving = ref(false)
const validating = ref(false)
const reloading = ref(false)
const formatting = ref(false)

async function fetchConfig() {
  rawLoading.value = true
  try {
    const { data } = await api.get('/admin/caddy/config')
    rawContent.value = data.content
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '載入設定失敗')
  } finally {
    rawLoading.value = false
  }
}

async function saveRaw() {
  rawSaving.value = true
  output.value = ''
  try {
    await api.put('/admin/caddy/config', { content: rawContent.value })
    showOutput('success', '儲存成功')
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '儲存失敗')
  } finally {
    rawSaving.value = false
  }
}

async function validate() {
  validating.value = true
  output.value = ''
  try {
    const { data } = await api.post('/admin/caddy/validate')
    showOutput(data.success ? 'success' : 'error', data.output || (data.success ? 'Valid configuration' : 'Validation failed'))
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '驗證失敗')
  } finally {
    validating.value = false
  }
}

async function reload() {
  reloading.value = true
  output.value = ''
  try {
    const { data } = await api.post('/admin/caddy/reload')
    showOutput(data.success ? 'success' : 'error', data.output || (data.success ? 'Caddy reloaded' : 'Reload failed'))
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '重載失敗')
  } finally {
    reloading.value = false
  }
}

async function fmt() {
  formatting.value = true
  output.value = ''
  try {
    const { data } = await api.post('/admin/caddy/fmt')
    if (data.success && data.content) rawContent.value = data.content
    showOutput(data.success ? 'success' : 'error', data.output || (data.success ? '格式化完成' : '格式化失敗'))
  } catch (err: any) {
    showOutput('error', err.response?.data?.error || '格式化失敗')
  } finally {
    formatting.value = false
  }
}

function switchTab(tab: 'rules' | 'raw') {
  activeTab.value = tab
  output.value = ''
  if (tab === 'raw') fetchConfig()
}

onMounted(fetchRules)
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <!-- Header + Tabs -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-800">Proxy 管理</h2>
      <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          @click="switchTab('rules')"
          class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === 'rules' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'"
        >
          Proxy 規則
        </button>
        <button
          @click="switchTab('raw')"
          class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === 'raw' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'"
        >
          Caddyfile 編輯
        </button>
      </div>
    </div>

    <!-- ═══ Tab 1: Proxy Rules ═══ -->
    <template v-if="activeTab === 'rules'">
      <!-- Stats -->
      <div class="grid grid-cols-3 gap-4">
        <div class="card text-center">
          <div class="text-2xl font-bold text-gray-800">{{ totalCount }}</div>
          <div class="text-sm text-gray-500">總規則數</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-green-600">{{ enabledCount }}</div>
          <div class="text-sm text-gray-500">啟用中</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-red-500">{{ disabledCount }}</div>
          <div class="text-sm text-gray-500">已停用</div>
        </div>
      </div>

      <!-- Add button -->
      <div class="flex justify-end">
        <button @click="showCreate = !showCreate" class="btn-primary text-sm">
          {{ showCreate ? '取消' : '+ 新增規則' }}
        </button>
      </div>

      <!-- Create form -->
      <div v-if="showCreate" class="card">
        <h3 class="text-sm font-medium text-gray-700 mb-3">新增 Proxy 規則</h3>
        <form @submit.prevent="createRule" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Domain</label>
              <input v-model="form.domain" type="text" class="input-field font-mono text-sm"
                placeholder="gitlab.lab2312.cs.nthu.edu.tw" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Target (IP:Port)</label>
              <input v-model="form.target" type="text" class="input-field font-mono text-sm"
                placeholder="192.168.1.100:3000" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">說明</label>
              <input v-model="form.description" type="text" class="input-field text-sm"
                placeholder="GitLab 服務（選填）" />
            </div>
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary text-sm" :disabled="creating">
              {{ creating ? '建立中...' : '建立規則' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Rules table -->
      <div v-if="rulesLoading" class="text-center text-gray-500 py-8">載入中...</div>

      <div v-else-if="rules.length === 0" class="card text-center text-gray-500 py-8">
        尚無 Proxy 規則。點擊「新增規則」開始設定。
      </div>

      <div v-else class="card !p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th class="px-4 py-3 font-medium">Domain</th>
              <th class="px-4 py-3 font-medium">Target</th>
              <th class="px-4 py-3 font-medium">說明</th>
              <th class="px-4 py-3 font-medium">狀態</th>
              <th class="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="rule in rules" :key="rule.id" class="hover:bg-gray-50">
              <!-- Normal view -->
              <template v-if="editingId !== rule.id">
                <td class="px-4 py-3 font-mono text-sm font-medium">{{ rule.domain }}</td>
                <td class="px-4 py-3 font-mono text-sm text-gray-600">{{ rule.target }}</td>
                <td class="px-4 py-3 text-gray-500">{{ rule.description || '-' }}</td>
                <td class="px-4 py-3">
                  <span class="text-xs px-2 py-0.5 rounded"
                    :class="rule.is_enabled ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'">
                    {{ rule.is_enabled ? '啟用' : '停用' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-2">
                    <button @click="startEdit(rule)" class="text-xs text-primary-600 hover:underline">編輯</button>
                    <button @click="toggleEnabled(rule)" class="text-xs hover:underline"
                      :class="rule.is_enabled ? 'text-orange-600' : 'text-green-600'">
                      {{ rule.is_enabled ? '停用' : '啟用' }}
                    </button>
                    <button @click="deleteRule(rule)" class="text-xs text-red-600 hover:underline">刪除</button>
                  </div>
                </td>
              </template>
              <!-- Inline edit -->
              <template v-else>
                <td class="px-4 py-2">
                  <input v-model="editForm.domain" class="input-field text-sm font-mono w-full" />
                </td>
                <td class="px-4 py-2">
                  <input v-model="editForm.target" class="input-field text-sm font-mono w-full" />
                </td>
                <td class="px-4 py-2">
                  <input v-model="editForm.description" class="input-field text-sm w-full" />
                </td>
                <td colspan="2" class="px-4 py-2">
                  <div class="flex gap-2">
                    <button @click="saveEdit(rule.id)" class="btn-primary text-xs" :disabled="saving">
                      {{ saving ? '儲存中...' : '儲存' }}
                    </button>
                    <button @click="cancelEdit" class="btn-secondary text-xs">取消</button>
                  </div>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ═══ Tab 2: Raw Caddyfile Editor ═══ -->
    <template v-if="activeTab === 'raw'">
      <!-- Warning -->
      <div class="bg-amber-50 rounded-lg p-3 text-sm text-amber-700">
        ⚠ 手動編輯 Caddyfile 會在下次從「Proxy 規則」頁面新增/修改/刪除規則時被覆蓋。建議透過規則介面管理。
      </div>

      <!-- Buttons -->
      <div class="flex justify-between items-center">
        <span class="text-sm font-medium text-gray-700 font-mono">Caddyfile</span>
        <div class="flex gap-2">
          <button @click="fmt" class="btn-secondary text-sm" :disabled="formatting">
            {{ formatting ? '格式化中...' : '格式化' }}
          </button>
          <button @click="validate" class="btn-secondary text-sm" :disabled="validating">
            {{ validating ? '驗證中...' : '驗證設定' }}
          </button>
          <button @click="reload" class="btn-primary text-sm" :disabled="reloading">
            {{ reloading ? '重載中...' : '重載 Caddy' }}
          </button>
          <button @click="saveRaw" class="btn-primary text-sm" :disabled="rawSaving">
            {{ rawSaving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>

      <div v-if="rawLoading" class="text-center text-gray-500 py-8">載入中...</div>
      <textarea
        v-else
        v-model="rawContent"
        class="w-full font-mono text-sm bg-gray-900 text-green-400 rounded-lg p-4 resize-none border-0 focus:outline-none focus:ring-2 focus:ring-primary-500"
        spellcheck="false"
        rows="24"
      />
    </template>

    <!-- Output -->
    <div
      v-if="output"
      class="rounded-lg p-3 font-mono text-sm whitespace-pre-wrap"
      :class="{
        'bg-green-50 text-green-700': outputType === 'success',
        'bg-red-50 text-red-700': outputType === 'error',
        'bg-amber-50 text-amber-700': outputType === 'warning',
      }"
    >
      {{ output }}
    </div>
  </div>
</template>
