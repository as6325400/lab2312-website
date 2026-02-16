<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../composables/useApi'

const invites = ref<any[]>([])
const loading = ref(true)
const showCreate = ref(false)
const creating = ref(false)
const copied = ref('')

const form = ref({
  expiresMinutes: 60,
  maxUses: 1,
  note: '',
})

async function fetchInvites() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/invites')
    invites.value = data
  } finally {
    loading.value = false
  }
}

async function createInvite() {
  creating.value = true
  try {
    const expiresAt = new Date(Date.now() + form.value.expiresMinutes * 60 * 1000).toISOString()
    await api.post('/admin/invites', {
      expiresAt,
      maxUses: form.value.maxUses,
      note: form.value.note,
    })
    showCreate.value = false
    form.value = { expiresMinutes: 60, maxUses: 1, note: '' }
    await fetchInvites()
  } finally {
    creating.value = false
  }
}

async function deleteInvite(id: number) {
  if (!confirm('確定要停用此邀請連結？')) return
  try {
    await api.delete(`/admin/invites/${id}`)
    await fetchInvites()
  } catch (e: any) {
    alert(e.response?.data?.error || '操作失敗')
  }
}

function getRegisterUrl(token: string) {
  return `${location.origin}/register?token=${token}`
}

async function copyLink(token: string) {
  const url = getRegisterUrl(token)
  await navigator.clipboard.writeText(url)
  copied.value = token
  setTimeout(() => { copied.value = '' }, 2000)
}

onMounted(fetchInvites)
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-800">邀請連結管理</h2>
      <button @click="showCreate = !showCreate" class="btn-primary">
        {{ showCreate ? '取消' : '建立邀請' }}
      </button>
    </div>

    <!-- Create form -->
    <div v-if="showCreate" class="card">
      <form @submit.prevent="createInvite" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">有效時間（分鐘）</label>
            <input v-model.number="form.expiresMinutes" type="number" min="1" class="input-field" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">最多使用次數</label>
            <input v-model.number="form.maxUses" type="number" min="1" class="input-field" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <input v-model="form.note" type="text" class="input-field" placeholder="可選" />
        </div>
        <button type="submit" class="btn-primary" :disabled="creating">
          {{ creating ? '建立中...' : '建立' }}
        </button>
      </form>
    </div>

    <!-- Invites list -->
    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else-if="invites.length === 0" class="card text-center text-gray-500 py-8">
      目前沒有有效的邀請連結
    </div>
    <div v-else class="space-y-3">
      <div v-for="invite in invites" :key="invite.id" class="card !p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <code class="text-sm bg-gray-100 px-2 py-0.5 rounded truncate block max-w-md">{{ invite.token }}</code>
              <span class="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">有效</span>
            </div>
            <div class="text-sm text-gray-500 space-x-4">
              <span>使用: {{ invite.used_count }}/{{ invite.max_uses }}</span>
              <span>到期: {{ new Date(invite.expires_at).toLocaleString() }}</span>
              <span v-if="invite.note">備註: {{ invite.note }}</span>
            </div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button @click="copyLink(invite.token)" class="btn-secondary text-sm !py-1 !px-3">
              {{ copied === invite.token ? '已複製！' : '複製連結' }}
            </button>
            <button @click="deleteInvite(invite.id)" class="btn-danger text-sm !py-1 !px-3">停用</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
