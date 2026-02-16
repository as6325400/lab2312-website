<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../composables/useApi'

const route = useRoute()
const token = ref(route.query.token as string || '')
const tokenValid = ref(false)
const tokenError = ref('')
const submitted = ref(false)
const loading = ref(false)
const error = ref('')

const form = ref({
  name: '',
  email: '',
  username: '',
  studentId: '',
})

onMounted(async () => {
  if (!token.value) {
    tokenError.value = '缺少邀請 token'
    return
  }
  try {
    await api.get('/register/validate', { params: { token: token.value } })
    tokenValid.value = true
  } catch (e: any) {
    tokenError.value = e.response?.data?.error || 'Token 無效'
  }
})

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    await api.post('/register', {
      token: token.value,
      ...form.value,
    })
    submitted.value = true
  } catch (e: any) {
    error.value = e.response?.data?.error || '提交失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="card w-full max-w-lg">
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Lab 帳號申請</h1>
      </div>

      <!-- Token error -->
      <div v-if="tokenError" class="text-center text-red-500 bg-red-50 rounded-lg p-6">
        <p class="text-lg font-medium">{{ tokenError }}</p>
        <p class="text-sm mt-2 text-gray-500">請聯絡管理員取得有效的邀請連結</p>
      </div>

      <!-- Success -->
      <div v-else-if="submitted" class="text-center text-green-600 bg-green-50 rounded-lg p-6">
        <p class="text-lg font-medium">申請已提交！</p>
        <p class="text-sm mt-2 text-gray-500">請等待管理員審核，通過後即可登入</p>
      </div>

      <!-- Form -->
      <form v-else-if="tokenValid" @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
          <input v-model="form.name" type="text" class="input-field" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input v-model="form.email" type="email" class="input-field" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">希望的帳號 (username) *</label>
          <input v-model="form.username" type="text" class="input-field" pattern="[a-z][a-z0-9_-]*" title="小寫英文開頭，可含數字、底線、連字號" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">學號 *</label>
          <input v-model="form.studentId" type="text" class="input-field" required />
        </div>

        <div v-if="error" class="text-red-500 text-sm bg-red-50 rounded-lg p-3">
          {{ error }}
        </div>

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? '提交中...' : '提交申請' }}
        </button>
      </form>

      <!-- Loading -->
      <div v-else class="text-center text-gray-500 py-8">
        驗證 token 中...
      </div>
    </div>
  </div>
</template>
