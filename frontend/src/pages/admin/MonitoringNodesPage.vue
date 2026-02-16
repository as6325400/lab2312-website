<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../composables/useApi'

interface GpuCap {
  index: number
  name: string
  memoryTotalMB: number
}
interface DiskCap {
  mount: string
  totalGB: number
}
interface NicCap {
  name: string
  ipv4: string
}
interface Capabilities {
  cpuCores?: number
  memoryTotalGB?: number
  gpus?: GpuCap[]
  disks?: DiskCap[]
  nics?: NicCap[]
}
interface MonitorNode {
  id: number
  hostname: string
  token: string
  ip: string
  capabilities_json: string
  config_json: string
  sort_order: number
  is_active: number
  created_at: string
  last_seen_at: string | null
}
interface NodeConfig {
  gpuIndices?: number[]
  diskMounts?: string[]
  nicNames?: string[]
  reportIntervalSec?: number
}

const nodes = ref<MonitorNode[]>([])
const loading = ref(true)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
const expandedId = ref<number | null>(null)
const showTokenId = ref<number | null>(null)

// Editing state per node
const editConfigs = ref<Map<number, NodeConfig>>(new Map())

onMounted(async () => {
  await fetchNodes()
})

async function fetchNodes() {
  loading.value = true
  try {
    const { data } = await api.get('/monitoring/admin/nodes')
    nodes.value = data
  } catch (e: any) {
    message.value = e.response?.data?.error || '載入失敗'
    messageType.value = 'error'
  } finally {
    loading.value = false
  }
}

function getCapabilities(node: MonitorNode): Capabilities {
  try {
    return JSON.parse(node.capabilities_json)
  } catch {
    return {}
  }
}

function getNodeIps(node: MonitorNode): string {
  const caps = getCapabilities(node)
  const cfg = getConfig(node)
  const nics = caps.nics || []
  const selectedNames = cfg.nicNames
  // 顯示已勾選網卡的 IP；若無勾選設定則顯示全部
  const filtered = selectedNames ? nics.filter(n => selectedNames.includes(n.name)) : nics
  if (filtered.length > 0) return filtered.map(n => n.ipv4).join(', ')
  return node.ip || '-'
}

function getConfig(node: MonitorNode): NodeConfig {
  try {
    return JSON.parse(node.config_json)
  } catch {
    return {}
  }
}

function toggleExpand(node: MonitorNode) {
  if (expandedId.value === node.id) {
    expandedId.value = null
    return
  }
  expandedId.value = node.id
  // Initialize edit config if not exists
  if (!editConfigs.value.has(node.id)) {
    const cfg = getConfig(node)
    const caps = getCapabilities(node)
    // If config is empty, default to all items selected
    editConfigs.value.set(node.id, {
      gpuIndices: cfg.gpuIndices ?? caps.gpus?.map(g => g.index) ?? [],
      diskMounts: cfg.diskMounts ?? caps.disks?.map(d => d.mount) ?? [],
      nicNames: cfg.nicNames ?? caps.nics?.map(n => n.name) ?? [],
      reportIntervalSec: cfg.reportIntervalSec ?? 5,
    })
  }
}

function getEditConfig(nodeId: number): NodeConfig {
  return editConfigs.value.get(nodeId) || {}
}

function toggleGpu(nodeId: number, gpuIndex: number) {
  const cfg = getEditConfig(nodeId)
  const arr = cfg.gpuIndices || []
  const idx = arr.indexOf(gpuIndex)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(gpuIndex)
  cfg.gpuIndices = arr
  editConfigs.value.set(nodeId, { ...cfg })
}

function toggleDisk(nodeId: number, mount: string) {
  const cfg = getEditConfig(nodeId)
  const arr = cfg.diskMounts || []
  const idx = arr.indexOf(mount)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(mount)
  cfg.diskMounts = arr
  editConfigs.value.set(nodeId, { ...cfg })
}

function toggleNic(nodeId: number, nicName: string) {
  const cfg = getEditConfig(nodeId)
  const arr = cfg.nicNames || []
  const idx = arr.indexOf(nicName)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(nicName)
  cfg.nicNames = arr
  editConfigs.value.set(nodeId, { ...cfg })
}

async function saveConfig(nodeId: number) {
  const cfg = getEditConfig(nodeId)
  try {
    await api.put(`/monitoring/admin/nodes/${nodeId}/config`, cfg)
    // 樂觀更新：直接改本地資料
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) node.config_json = JSON.stringify(cfg)
    message.value = '設定已儲存'
    messageType.value = 'success'
  } catch (e: any) {
    message.value = e.response?.data?.error || '儲存失敗'
    messageType.value = 'error'
  }
}

async function deleteNode(node: MonitorNode) {
  if (!confirm(`確定要刪除節點 "${node.hostname}"？exporter 需要重新註冊。`)) return
  // 樂觀更新：立刻從列表移除
  nodes.value = nodes.value.filter(n => n.id !== node.id)
  expandedId.value = null
  try {
    await api.delete(`/monitoring/admin/nodes/${node.id}`)
    message.value = `已刪除 ${node.hostname}`
    messageType.value = 'success'
  } catch (e: any) {
    message.value = e.response?.data?.error || '刪除失敗'
    messageType.value = 'error'
    await fetchNodes() // 失敗才重新拉回
  }
}

async function resetToken(node: MonitorNode) {
  if (!confirm(`確定要重設 "${node.hostname}" 的 token？exporter 需要重新設定。`)) return
  try {
    const { data } = await api.post(`/monitoring/admin/nodes/${node.id}/reset-token`)
    message.value = `Token 已重設。新 token: ${data.token}`
    messageType.value = 'success'
    await fetchNodes()
  } catch (e: any) {
    message.value = e.response?.data?.error || '重設失敗'
    messageType.value = 'error'
  }
}

function timeSince(dateStr: string | null): string {
  if (!dateStr) return '從未上線'
  // SQLite datetime 可能沒有 Z 後綴，手動補上確保當成 UTC 解析
  const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
  const diff = Date.now() - new Date(utcStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  return `${Math.floor(hr / 24)} 天前`
}

async function moveNode(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= nodes.value.length) return
  // Swap in local array
  const a = nodes.value[index]!
  const b = nodes.value[targetIndex]!
  nodes.value[index] = b
  nodes.value[targetIndex] = a
  // Save new order to backend
  const nodeIds = nodes.value.map(n => n.id)
  try {
    await api.put('/monitoring/admin/nodes/reorder', { nodeIds })
  } catch (e: any) {
    message.value = e.response?.data?.error || '排序失敗'
    messageType.value = 'error'
    await fetchNodes()
  }
}

function fmtMem(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  return mb + ' MB'
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-800">節點管理</h2>
      <span class="text-sm text-gray-400">{{ nodes.length }} 個節點</span>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>

    <div v-else-if="nodes.length === 0" class="text-center text-gray-400 py-12">
      <p>尚無註冊的監控節點</p>
      <p class="text-sm mt-1">在各節點執行 lab-exporter 即可自動註冊</p>
    </div>

    <template v-else>
      <div v-for="(node, idx) in nodes" :key="node.id" class="card !p-0 overflow-hidden">
        <!-- Node header row -->
        <div
          class="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
          @click="toggleExpand(node)"
        >
          <!-- Sort buttons -->
          <div class="flex flex-col shrink-0 -my-1">
            <button
              @click.stop="moveNode(idx, -1)"
              class="text-gray-300 hover:text-gray-600 text-xs leading-none p-0.5 disabled:opacity-30 disabled:cursor-default"
              :disabled="idx === 0"
            >&#9650;</button>
            <button
              @click.stop="moveNode(idx, 1)"
              class="text-gray-300 hover:text-gray-600 text-xs leading-none p-0.5 disabled:opacity-30 disabled:cursor-default"
              :disabled="idx === nodes.length - 1"
            >&#9660;</button>
          </div>
          <div
            class="w-2.5 h-2.5 rounded-full shrink-0"
            :class="node.last_seen_at && (Date.now() - new Date(node.last_seen_at.endsWith('Z') ? node.last_seen_at : node.last_seen_at + 'Z').getTime()) < 30000 ? 'bg-green-400' : 'bg-gray-300'"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-800">{{ node.hostname }}</span>
              <span class="text-xs text-gray-400">{{ getNodeIps(node) }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5">
              最後上線：{{ timeSince(node.last_seen_at) }}
              · 註冊於 {{ new Date(node.created_at).toLocaleDateString('zh-TW') }}
            </div>
          </div>
          <span class="text-gray-400 text-sm transition-transform" :class="expandedId === node.id ? 'rotate-180' : ''">▼</span>
        </div>

        <!-- Expanded detail -->
        <div v-if="expandedId === node.id" class="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
          <!-- Capabilities summary -->
          <div class="text-xs text-gray-500">
            硬體：{{ getCapabilities(node).cpuCores || '?' }} 核心 CPU ·
            {{ getCapabilities(node).memoryTotalGB || '?' }} GB RAM ·
            {{ getCapabilities(node).gpus?.length || 0 }} GPU ·
            {{ getCapabilities(node).disks?.length || 0 }} 磁碟 ·
            {{ getCapabilities(node).nics?.length || 0 }} 網卡
          </div>

          <!-- GPU selection -->
          <div v-if="getCapabilities(node).gpus?.length">
            <div class="text-sm font-medium text-gray-700 mb-2">GPU 監控</div>
            <div class="space-y-1.5">
              <label
                v-for="gpu in getCapabilities(node).gpus"
                :key="gpu.index"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="getEditConfig(node.id).gpuIndices?.includes(gpu.index)"
                  @change="toggleGpu(node.id, gpu.index)"
                  class="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span class="text-gray-600">GPU {{ gpu.index }} — {{ gpu.name }} ({{ fmtMem(gpu.memoryTotalMB) }})</span>
              </label>
            </div>
          </div>

          <!-- Disk selection -->
          <div v-if="getCapabilities(node).disks?.length">
            <div class="text-sm font-medium text-gray-700 mb-2">硬碟監控</div>
            <div class="space-y-1.5">
              <label
                v-for="disk in getCapabilities(node).disks"
                :key="disk.mount"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="getEditConfig(node.id).diskMounts?.includes(disk.mount)"
                  @change="toggleDisk(node.id, disk.mount)"
                  class="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span class="text-gray-600 font-mono">{{ disk.mount }}</span>
                <span class="text-xs text-gray-400">({{ disk.totalGB }} GB)</span>
              </label>
            </div>
          </div>

          <!-- NIC selection -->
          <div v-if="getCapabilities(node).nics?.length">
            <div class="text-sm font-medium text-gray-700 mb-2">網路介面監控</div>
            <div class="space-y-1.5">
              <label
                v-for="nic in getCapabilities(node).nics"
                :key="nic.name"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="getEditConfig(node.id).nicNames?.includes(nic.name)"
                  @change="toggleNic(node.id, nic.name)"
                  class="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span class="text-gray-600 font-mono">{{ nic.name }}</span>
                <span class="text-xs text-gray-400">({{ nic.ipv4 }})</span>
              </label>
            </div>
          </div>

          <!-- Report interval -->
          <div>
            <div class="text-sm font-medium text-gray-700 mb-1">回報間隔</div>
            <div class="flex items-center gap-2">
              <input
                :value="getEditConfig(node.id).reportIntervalSec || 5"
                @input="(e: Event) => { const cfg = getEditConfig(node.id); cfg.reportIntervalSec = parseInt((e.target as HTMLInputElement).value) || 5; editConfigs.set(node.id, { ...cfg }) }"
                type="number"
                min="1"
                max="60"
                class="input-field !w-20 text-sm"
              />
              <span class="text-sm text-gray-500">秒</span>
            </div>
          </div>

          <!-- Token -->
          <div>
            <div class="text-sm font-medium text-gray-700 mb-1">Token</div>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 flex-1 truncate">
                {{ showTokenId === node.id ? node.token : '••••••••-••••-••••-••••-••••••••••••' }}
              </code>
              <button
                @click.stop="showTokenId = showTokenId === node.id ? null : node.id"
                class="text-xs text-primary-500 hover:text-primary-700 shrink-0"
              >
                {{ showTokenId === node.id ? '隱藏' : '顯示' }}
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 pt-2 border-t border-gray-200">
            <button @click.stop="saveConfig(node.id)" class="btn-primary text-sm">
              儲存設定
            </button>
            <button @click.stop="resetToken(node)" class="btn-secondary text-sm">
              重設 Token
            </button>
            <button @click.stop="deleteNode(node)" class="text-sm text-red-500 hover:text-red-700 ml-auto">
              刪除節點
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Message -->
    <div
      v-if="message"
      class="rounded-lg p-3 text-sm"
      :class="messageType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
    >
      {{ message }}
    </div>
  </div>
</template>
