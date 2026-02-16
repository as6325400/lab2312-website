import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../composables/useApi'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const username = computed(() => user.value?.username || '')

  async function fetchMe() {
    try {
      const { data } = await api.get('/auth/me')
      if (data.authenticated) {
        user.value = data
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password })
    user.value = { ...data, authenticated: true }
    return data
  }

  async function logout() {
    await api.post('/auth/logout')
    user.value = null
  }

  return { user, loading, isAuthenticated, isAdmin, username, fetchMe, login, logout }
})
