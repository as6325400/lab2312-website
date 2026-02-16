<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useBrandingStore } from '../stores/branding'

const auth = useAuthStore()
const branding = useBrandingStore()
const router = useRouter()

onMounted(() => {
  if (!branding.loaded) branding.fetch()
})

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.error || '登入失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="card w-full max-w-md">
      <div class="text-center mb-8">
        <div v-if="branding.siteLogo" class="inline-flex w-16 h-16 rounded-2xl overflow-hidden mb-4">
          <img :src="branding.siteLogo" alt="Logo" class="w-full h-full object-cover" />
        </div>
        <div v-else class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500 text-white text-2xl font-bold mb-4">
          {{ branding.siteInitial }}
        </div>
        <h1 class="text-2xl font-bold text-gray-900">{{ branding.siteName }}</h1>
        <p class="text-gray-500 mt-1">請登入以繼續</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">帳號</label>
          <input v-model="username" type="text" class="input-field" placeholder="username" required autofocus />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">密碼</label>
          <input v-model="password" type="password" class="input-field" placeholder="password" required />
        </div>

        <div v-if="error" class="text-red-500 text-sm bg-red-50 rounded-lg p-3">
          {{ error }}
        </div>

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? '登入中...' : '登入' }}
        </button>
      </form>
    </div>
  </div>
</template>
