<script setup lang="ts">
import { ref } from 'vue'
import api from '../composables/useApi'

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function handleSubmit() {
  error.value = ''
  success.value = false

  if (newPassword.value !== confirmPassword.value) {
    error.value = '新密碼與確認密碼不一致'
    return
  }

  if (newPassword.value.length < 6) {
    error.value = '新密碼至少需要 6 個字元'
    return
  }

  loading.value = true
  try {
    await api.post('/auth/change-password', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    })
    success.value = true
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e: any) {
    error.value = e.response?.data?.error || '密碼更改失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-md mx-auto">
    <h2 class="text-lg font-semibold text-gray-800 mb-6">變更密碼</h2>

    <div v-if="success" class="bg-green-50 text-green-700 rounded-lg p-4 mb-4">
      密碼已成功更改
    </div>

    <form @submit.prevent="handleSubmit" class="card space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">目前密碼</label>
        <input
          v-model="oldPassword"
          type="password"
          class="input-field"
          required
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
        <input
          v-model="newPassword"
          type="password"
          class="input-field"
          minlength="6"
          required
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
        <input
          v-model="confirmPassword"
          type="password"
          class="input-field"
          minlength="6"
          required
        />
      </div>

      <div v-if="error" class="text-red-500 text-sm bg-red-50 rounded-lg p-3">
        {{ error }}
      </div>

      <button type="submit" class="btn-primary w-full" :disabled="loading">
        {{ loading ? '更改中...' : '更改密碼' }}
      </button>
    </form>
  </div>
</template>
