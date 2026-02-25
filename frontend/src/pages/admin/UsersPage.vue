<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../../composables/useApi'

const users = ref<any[]>([])
const loading = ref(true)

// Dropdown menu state
const openMenuId = ref<number | null>(null)

// Delete modal state
const showDeleteModal = ref(false)
const deleteTarget = ref<any>(null)
const deletePassword = ref('')
const deleteError = ref('')
const deleting = ref(false)

// Edit modal state
const showEditModal = ref(false)
const editTarget = ref<any>(null)
const editForm = ref({ username: '', student_id: '', email: '' })
const editError = ref('')
const editSaving = ref(false)
const editUsernameError = ref('')

function validateEditUsername() {
  const v = editForm.value.username
  if (!v) { editUsernameError.value = '帳號不可為空'; return }
  if (!/^[a-z_]/.test(v)) {
    editUsernameError.value = '必須以小寫英文字母或底線開頭'
  } else if (/[A-Z]/.test(v)) {
    editUsernameError.value = '不可包含大寫字母'
  } else if (!/^[a-z0-9_-]+$/.test(v)) {
    editUsernameError.value = '只能包含小寫英文、數字、底線、連字號'
  } else if (v.length > 32) {
    editUsernameError.value = '最多 32 個字元'
  } else {
    editUsernameError.value = ''
  }
}

function openEditModal(user: any) {
  closeMenu()
  editTarget.value = user
  editForm.value = { username: user.username, student_id: user.student_id || '', email: user.email || '' }
  editError.value = ''
  editUsernameError.value = ''
  showEditModal.value = true
}

async function confirmEdit() {
  validateEditUsername()
  if (editUsernameError.value) return
  editSaving.value = true
  editError.value = ''
  try {
    await api.patch(`/admin/users/${editTarget.value.id}`, {
      username: editForm.value.username,
      student_id: editForm.value.student_id,
      email: editForm.value.email,
    })
    showEditModal.value = false
    await fetchUsers()
  } catch (e: any) {
    editError.value = e.response?.data?.error || '儲存失敗'
  } finally {
    editSaving.value = false
  }
}

const totalCount = computed(() => users.value.length)
const activeCount = computed(() => users.value.filter(u => u.is_active).length)
const adminCount = computed(() => users.value.filter(u => u.role === 'admin').length)
const ldapCount = computed(() => users.value.filter(u => u.source === 'ldap').length)

function closeMenu() { openMenuId.value = null }

function onClickOutside(e: MouseEvent) {
  if (openMenuId.value !== null && !(e.target as HTMLElement).closest('.action-menu')) {
    closeMenu()
  }
}

onMounted(() => { document.addEventListener('click', onClickOutside) })
onUnmounted(() => { document.removeEventListener('click', onClickOutside) })

async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/users')
    users.value = data
  } finally {
    loading.value = false
  }
}

async function toggleActive(user: any) {
  closeMenu()
  try {
    await api.patch(`/admin/users/${user.id}`, { is_active: !user.is_active })
  } catch (e: any) {
    alert(e.response?.data?.error || '狀態變更失敗')
    return
  }
  await fetchUsers()
}

async function toggleRole(user: any) {
  closeMenu()
  const newRole = user.role === 'admin' ? 'user' : 'admin'
  if (!confirm(`確定要將 ${user.username} 的角色改為 ${newRole}？`)) return
  try {
    await api.patch(`/admin/users/${user.id}`, { role: newRole })
  } catch (e: any) {
    alert(e.response?.data?.error || '角色變更失敗')
    return
  }
  await fetchUsers()
}

async function toggleHidden(user: any) {
  closeMenu()
  try {
    await api.patch(`/admin/users/${user.id}`, { is_hidden: !user.is_hidden })
  } catch (e: any) {
    alert(e.response?.data?.error || '變更失敗')
    return
  }
  await fetchUsers()
}

function openDeleteModal(user: any) {
  closeMenu()
  deleteTarget.value = user
  deletePassword.value = ''
  deleteError.value = ''
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value || !deletePassword.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await api.delete(`/admin/users/${deleteTarget.value.id}`, { data: { password: deletePassword.value } })
    showDeleteModal.value = false
    await fetchUsers()
  } catch (e: any) {
    deleteError.value = e.response?.data?.error || '刪除失敗'
  } finally {
    deleting.value = false
  }
}

onMounted(fetchUsers)
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <h2 class="text-lg font-semibold text-gray-800">使用者管理</h2>

    <!-- 統計卡片 -->
    <div v-if="!loading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-gray-900">{{ totalCount }}</div>
        <div class="text-xs text-gray-500 mt-1">總成員數</div>
      </div>
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-green-600">{{ activeCount }}</div>
        <div class="text-xs text-gray-500 mt-1">啟用中</div>
      </div>
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-purple-600">{{ adminCount }}</div>
        <div class="text-xs text-gray-500 mt-1">管理員</div>
      </div>
      <div class="card !p-4 text-center">
        <div class="text-2xl font-bold text-blue-600">{{ ldapCount }}</div>
        <div class="text-xs text-gray-500 mt-1">LDAP 帳號</div>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>
    <div v-else class="card !p-0 overflow-hidden overflow-x-auto">
      <table class="w-full text-sm min-w-[700px]">
        <thead class="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">帳號</th>
            <th class="px-4 py-3 font-medium">顯示名稱</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">角色</th>
            <th class="px-4 py-3 font-medium">來源</th>
            <th class="px-4 py-3 font-medium">狀態</th>
            <th class="px-4 py-3 font-medium">最後登入</th>
            <th class="px-4 py-3 font-medium w-12"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 font-medium">{{ user.username }}</td>
            <td class="px-4 py-3">{{ user.display_name }}</td>
            <td class="px-4 py-3 text-gray-500">{{ user.email }}</td>
            <td class="px-4 py-3">
              <span
                class="text-xs px-2 py-0.5 rounded"
                :class="user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'"
              >
                {{ user.role }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500">{{ user.source }}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1">
                <span
                  class="text-xs px-2 py-0.5 rounded"
                  :class="user.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'"
                >
                  {{ user.is_active ? '啟用' : '停用' }}
                </span>
                <span v-if="user.is_hidden" class="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-500">
                  隱藏
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-gray-500 text-xs">
              {{ user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-' }}
            </td>
            <td class="px-4 py-3 relative">
              <div class="action-menu">
                <button
                  @click.stop="openMenuId = openMenuId === user.id ? null : user.id"
                  class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                </button>
                <div
                  v-if="openMenuId === user.id"
                  class="absolute right-4 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
                >
                  <button @click="openEditModal(user)" class="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    編輯資料
                  </button>
                  <button @click="toggleRole(user)" class="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    {{ user.role === 'admin' ? '降為 user' : '升為 admin' }}
                  </button>
                  <button v-if="user.source === 'ldap'" @click="toggleActive(user)" class="w-full text-left px-4 py-2 text-xs hover:bg-gray-50" :class="user.is_active ? 'text-red-600' : 'text-green-600'">
                    {{ user.is_active ? '停用帳號' : '啟用帳號' }}
                  </button>
                  <button @click="toggleHidden(user)" class="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    {{ user.is_hidden ? '取消隱藏' : '從名冊隱藏' }}
                  </button>
                  <div class="border-t border-gray-100 my-1" />
                  <button @click="openDeleteModal(user)" class="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50">
                    永久刪除
                  </button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Edit user modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showEditModal = false">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">編輯使用者資料</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">帳號 (username)</label>
              <input
                v-model="editForm.username"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                @input="validateEditUsername"
                autocomplete="off"
              />
              <p v-if="editUsernameError" class="text-xs text-red-500 mt-1">{{ editUsernameError }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">學號</label>
              <input
                v-model="editForm.student_id"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autocomplete="off"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                v-model="editForm.email"
                type="email"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autocomplete="off"
              />
            </div>
          </div>
          <p v-if="editError" class="text-xs text-red-500 mt-3">{{ editError }}</p>
          <div class="flex justify-end gap-3 mt-5">
            <button @click="showEditModal = false" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              取消
            </button>
            <button
              @click="confirmEdit"
              :disabled="!!editUsernameError || editSaving"
              class="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ editSaving ? '儲存中...' : '儲存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete confirmation modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="showDeleteModal = false">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">確認刪除使用者</h3>
          <p class="text-sm text-gray-600 mb-1">
            即將永久刪除 <span class="font-bold text-red-600">{{ deleteTarget?.username }}</span>
          </p>
          <ul class="text-xs text-gray-500 mb-4 space-y-0.5 list-disc pl-4">
            <li v-if="deleteTarget?.source === 'ldap'">刪除 FreeIPA 帳號</li>
            <li>刪除家目錄 /home/{{ deleteTarget?.username }}</li>
            <li>刪除資料庫記錄</li>
          </ul>
          <p class="text-sm text-red-600 font-medium mb-3">此操作不可還原，請輸入您的密碼確認：</p>
          <input
            v-model="deletePassword"
            type="password"
            placeholder="請輸入您的密碼"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            @keyup.enter="confirmDelete"
          />
          <p v-if="deleteError" class="text-xs text-red-500 mt-2">{{ deleteError }}</p>
          <div class="flex justify-end gap-3 mt-4">
            <button @click="showDeleteModal = false" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              取消
            </button>
            <button
              @click="confirmDelete"
              :disabled="!deletePassword || deleting"
              class="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ deleting ? '刪除中...' : '確認刪除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
