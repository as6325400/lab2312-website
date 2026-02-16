<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../composables/useApi'
import { useBrandingStore, type NavItem } from '../../stores/branding'
import { availableIcons } from '../../constants/icons'

const branding = useBrandingStore()

// Branding
const siteName = ref('Lab Portal')
const siteLogo = ref('')
const siteFavicon = ref('')
const uploading = ref(false)
const uploadingFavicon = ref(false)
const logoInput = ref<HTMLInputElement>()
const faviconInput = ref<HTMLInputElement>()

// System
const sessionTimeout = ref(20)
const terminalIdleTimeout = ref(30)
const terminalMaxSessions = ref(2)
const adminNotifyEmail = ref('')

// Sidebar Nav
const navItems = ref<NavItem[]>([])

const loading = ref(true)
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

onMounted(async () => {
  try {
    const [brandingRes, systemRes] = await Promise.all([
      api.get('/branding'),
      api.get('/admin/settings/system'),
    ])
    siteName.value = brandingRes.data.siteName || 'Lab Portal'
    siteLogo.value = brandingRes.data.siteLogo || ''
    siteFavicon.value = brandingRes.data.siteFavicon || ''
    if (Array.isArray(brandingRes.data.sidebarNav)) {
      navItems.value = brandingRes.data.sidebarNav.map((n: NavItem) => ({ ...n }))
    }
    sessionTimeout.value = parseInt(systemRes.data.session_timeout_minutes) || 20
    terminalIdleTimeout.value = parseInt(systemRes.data.terminal_idle_timeout_minutes) || 30
    terminalMaxSessions.value = parseInt(systemRes.data.terminal_max_sessions) || 2
    adminNotifyEmail.value = systemRes.data.admin_notify_email || ''
  } catch {
    message.value = '載入設定失敗'
    messageType.value = 'error'
  } finally {
    loading.value = false
  }
})

function addNavItem() {
  navItems.value.push({ label: '', to: '', icon: 'i-carbon-link' })
}

function removeNavItem(index: number) {
  navItems.value.splice(index, 1)
}

function moveNavItem(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= navItems.value.length) return
  const removed = navItems.value.splice(index, 1)[0]!
  navItems.value.splice(target, 0, removed)
}

async function uploadImage(e: Event, target: 'logo' | 'favicon') {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const isLogo = target === 'logo'
  if (isLogo) uploading.value = true
  else uploadingFavicon.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post('/admin/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    if (isLogo) siteLogo.value = data.url
    else siteFavicon.value = data.url
  } catch (err: any) {
    message.value = '上傳失敗：' + (err.response?.data?.error || err.message)
    messageType.value = 'error'
  } finally {
    if (isLogo) {
      uploading.value = false
      if (logoInput.value) logoInput.value.value = ''
    } else {
      uploadingFavicon.value = false
      if (faviconInput.value) faviconInput.value.value = ''
    }
  }
}

async function save() {
  saving.value = true
  message.value = ''
  try {
    await Promise.all([
      api.put('/admin/settings/site_name', { value: siteName.value }),
      api.put('/admin/settings/site_logo', { value: siteLogo.value }),
      api.put('/admin/settings/site_favicon', { value: siteFavicon.value }),
      api.put('/admin/settings/session_timeout_minutes', { value: String(sessionTimeout.value) }),
      api.put('/admin/settings/terminal_idle_timeout_minutes', { value: String(terminalIdleTimeout.value) }),
      api.put('/admin/settings/terminal_max_sessions', { value: String(terminalMaxSessions.value) }),
      api.put('/admin/settings/sidebar_nav', { value: JSON.stringify(navItems.value) }),
      api.put('/admin/settings/admin_notify_email', { value: adminNotifyEmail.value }),
    ])
    branding.update(siteName.value, siteLogo.value, siteFavicon.value)
    branding.sidebarNav = navItems.value.map(n => ({ ...n }))
    message.value = '儲存成功'
    messageType.value = 'success'
  } catch (err: any) {
    message.value = err.response?.data?.error || '儲存失敗'
    messageType.value = 'error'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <h2 class="text-lg font-semibold text-gray-800">系統設定</h2>
      <button @click="save" class="btn-primary text-sm" :disabled="saving || loading">
        {{ saving ? '儲存中...' : '儲存' }}
      </button>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>

    <template v-else>
      <!-- 網站品牌 -->
      <div class="text-sm font-medium text-gray-500 uppercase tracking-wider">網站品牌</div>

      <!-- Preview -->
      <div class="card">
        <label class="block text-sm font-medium text-gray-700 mb-3">預覽</label>
        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div v-if="siteLogo" class="w-10 h-10 rounded-lg overflow-hidden shrink-0">
            <img :src="siteLogo" alt="Logo" class="w-full h-full object-cover" />
          </div>
          <div v-else class="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {{ (siteName || 'L').charAt(0).toUpperCase() }}
          </div>
          <span class="font-semibold text-gray-800 text-lg">{{ siteName || 'Lab Portal' }}</span>
          <div v-if="siteFavicon" class="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <img :src="siteFavicon" alt="Favicon" class="w-5 h-5" />
            Favicon
          </div>
        </div>
      </div>

      <!-- Site Name -->
      <div class="card">
        <label class="block text-sm font-medium text-gray-700 mb-1">網站名稱</label>
        <input v-model="siteName" type="text" class="input-field" placeholder="Lab Portal" />
        <p class="text-xs text-gray-400 mt-1">顯示在側邊欄、登入頁面，以及瀏覽器分頁標題。</p>
      </div>

      <!-- Logo -->
      <div class="card">
        <label class="block text-sm font-medium text-gray-700 mb-3">Logo 圖片</label>
        <div v-if="siteLogo" class="flex items-center gap-4 mb-3">
          <div class="w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
            <img :src="siteLogo" alt="Current logo" class="w-full h-full object-cover" />
          </div>
          <button @click="siteLogo = ''" class="btn-secondary text-sm">移除圖片</button>
        </div>
        <div class="flex items-center gap-3">
          <label class="btn-secondary cursor-pointer text-sm">
            {{ uploading ? '上傳中...' : '選擇圖片' }}
            <input
              ref="logoInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="hidden"
              :disabled="uploading"
              @change="uploadImage($event, 'logo')"
            />
          </label>
          <span class="text-xs text-gray-400">建議正方形，顯示在側邊欄和登入頁面。</span>
        </div>
      </div>

      <!-- Favicon -->
      <div class="card">
        <label class="block text-sm font-medium text-gray-700 mb-3">Favicon（瀏覽器小圖示）</label>
        <div v-if="siteFavicon" class="flex items-center gap-4 mb-3">
          <div class="w-10 h-10 rounded border border-gray-200 flex items-center justify-center">
            <img :src="siteFavicon" alt="Current favicon" class="w-6 h-6" />
          </div>
          <button @click="siteFavicon = ''" class="btn-secondary text-sm">移除</button>
        </div>
        <div class="flex items-center gap-3">
          <label class="btn-secondary cursor-pointer text-sm">
            {{ uploadingFavicon ? '上傳中...' : '選擇圖片' }}
            <input
              ref="faviconInput"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/webp"
              class="hidden"
              :disabled="uploadingFavicon"
              @change="uploadImage($event, 'favicon')"
            />
          </label>
          <span class="text-xs text-gray-400">建議 32x32 或 64x64 的 PNG/ICO/SVG。</span>
        </div>
      </div>

      <!-- 側邊欄導航 -->
      <div class="text-sm font-medium text-gray-500 uppercase tracking-wider pt-2">側邊欄導航</div>

      <div class="card space-y-3">
        <p class="text-xs text-gray-400">設定左側導航選單項目。路徑填 <code class="bg-gray-100 px-1 rounded">vpn</code> 代表 VPN SSO 連結；填 <code class="bg-gray-100 px-1 rounded">https://...</code> 會以新分頁開啟外部連結。</p>
        <div
          v-for="(item, i) in navItems"
          :key="i"
          class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
        >
          <div class="flex flex-col gap-0.5">
            <button
              @click="moveNavItem(i, -1)"
              :disabled="i === 0"
              class="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
            >&uarr;</button>
            <button
              @click="moveNavItem(i, 1)"
              :disabled="i === navItems.length - 1"
              class="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
            >&darr;</button>
          </div>
          <input
            v-model="item.label"
            type="text"
            class="input-field !py-1 text-sm flex-1"
            placeholder="標籤"
          />
          <input
            v-model="item.to"
            type="text"
            class="input-field !py-1 text-sm flex-1"
            placeholder="路徑（如 /terminal）"
          />
          <select v-model="item.icon" class="input-field !py-1 text-sm w-40">
            <option v-for="ic in availableIcons" :key="ic" :value="ic">{{ ic.replace('i-carbon-', '') }}</option>
          </select>
          <span :class="item.icon" class="text-lg text-gray-500 shrink-0 w-5" />
          <button
            @click="removeNavItem(i)"
            class="text-red-400 hover:text-red-600 shrink-0 text-sm"
          >&times;</button>
        </div>
        <button @click="addNavItem" class="btn-secondary text-sm">+ 新增項目</button>
      </div>

      <!-- 系統參數 -->
      <div class="text-sm font-medium text-gray-500 uppercase tracking-wider pt-2">系統參數</div>

      <div class="card space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Session 過期時間（分鐘）</label>
          <input
            v-model.number="sessionTimeout"
            type="number"
            min="1"
            max="1440"
            class="input-field"
          />
          <p class="text-xs text-gray-400 mt-1">使用者閒置超過此時間後需重新登入。預設 20 分鐘。</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Terminal 閒置逾時（分鐘）</label>
          <input
            v-model.number="terminalIdleTimeout"
            type="number"
            min="1"
            max="1440"
            class="input-field"
          />
          <p class="text-xs text-gray-400 mt-1">Terminal 連線閒置超過此時間後自動斷開。預設 30 分鐘。僅影響新連線。</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">每人最大 Terminal 連線數</label>
          <input
            v-model.number="terminalMaxSessions"
            type="number"
            min="1"
            max="10"
            class="input-field"
          />
          <p class="text-xs text-gray-400 mt-1">每位使用者同時可開啟的 Terminal 最大數量。預設 2。</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">管理員通知信箱</label>
          <input
            v-model="adminNotifyEmail"
            type="email"
            class="input-field"
            placeholder="admin@example.com"
          />
          <p class="text-xs text-gray-400 mt-1">有新註冊申請時通知此信箱。留空則寄到 SMTP 寄件帳號。</p>
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
