<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../composables/useApi'
import { useBrandingStore } from '../../stores/branding'

const branding = useBrandingStore()

const siteName = ref('Lab Portal')
const siteLogo = ref('')
const saving = ref(false)
const uploading = ref(false)
const logoInput = ref<HTMLInputElement>()

onMounted(async () => {
  try {
    const { data } = await api.get('/branding')
    siteName.value = data.siteName || 'Lab Portal'
    siteLogo.value = data.siteLogo || ''
  } catch {
    // Use defaults
  }
})

async function uploadLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post('/admin/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    siteLogo.value = data.url
  } catch (err: any) {
    alert('上傳失敗：' + (err.response?.data?.error || err.message))
  } finally {
    uploading.value = false
    if (logoInput.value) logoInput.value.value = ''
  }
}

function removeLogo() {
  siteLogo.value = ''
}

async function save() {
  saving.value = true
  try {
    await api.put('/admin/settings/site_name', { value: siteName.value })
    await api.put('/admin/settings/site_logo', { value: siteLogo.value })
    branding.update(siteName.value, siteLogo.value)
    alert('已儲存！')
  } catch (err: any) {
    alert('儲存失敗：' + (err.response?.data?.error || err.message))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-800">網站品牌設定</h2>
      <button @click="save" class="btn-primary" :disabled="saving">
        {{ saving ? '儲存中...' : '儲存' }}
      </button>
    </div>

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
      </div>
    </div>

    <!-- Site Name -->
    <div class="card">
      <label class="block text-sm font-medium text-gray-700 mb-1">網站名稱</label>
      <input v-model="siteName" type="text" class="input-field" placeholder="Lab Portal" />
    </div>

    <!-- Logo -->
    <div class="card">
      <label class="block text-sm font-medium text-gray-700 mb-3">Logo 圖片</label>

      <div v-if="siteLogo" class="flex items-center gap-4 mb-3">
        <div class="w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
          <img :src="siteLogo" alt="Current logo" class="w-full h-full object-cover" />
        </div>
        <button @click="removeLogo" class="btn-secondary text-sm">移除圖片</button>
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
            @change="uploadLogo"
          />
        </label>
        <span class="text-xs text-gray-400">支援 PNG、JPG、WebP、GIF</span>
      </div>

      <p class="text-xs text-gray-400 mt-2">
        建議使用正方形圖片，將顯示在側邊欄和登入頁面。不上傳圖片則顯示名稱首字母。
      </p>
    </div>
  </div>
</template>
