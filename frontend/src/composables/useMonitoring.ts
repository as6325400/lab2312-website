import { ref, onUnmounted } from 'vue'
import api from './useApi'

export interface GpuInfo {
  index: number
  name: string
  utilizationPct: number
  memoryUsedMB: number
  memoryTotalMB: number
  temperatureC: number
  powerDrawW: number
  powerLimitW: number
}

export interface DiskInfo {
  mount: string
  totalGB: number
  usedGB: number
}

export interface NicSnapshot {
  name: string
  ipv4: string
  rxMbps: number
  txMbps: number
}

export interface NodeSnapshot {
  hostname: string
  ip: string
  online: boolean
  updatedAt: string
  cpuUsagePct: number
  cpuCores: number
  memoryUsedGB: number
  memoryTotalGB: number
  gpus: GpuInfo[]
  disks: DiskInfo[]
  nics: NicSnapshot[]
  networkRxMbps: number
  networkTxMbps: number
  uptimeSeconds: number
  processCount: number
  loadAvg: [number, number, number]
}

export interface NodeHistory {
  nodeId: number
  node: NodeSnapshot
  cpuHistory: number[]
  gpuHistories: number[][]
  nicRxHistories: number[][]
  nicTxHistories: number[][]
  networkRxHistory: number[]
  networkTxHistory: number[]
  timestamps: string[]
}

export function useMonitoring() {
  const nodes = ref<NodeHistory[]>([])
  const loading = ref(true)
  const error = ref('')
  let timer: ReturnType<typeof setInterval> | null = null

  async function fetchNodes() {
    try {
      const { data } = await api.get('/monitoring/nodes')
      nodes.value = data.nodes || []
      error.value = ''
    } catch (e: any) {
      error.value = e.response?.data?.error || e.message || 'Failed to fetch monitoring data'
    } finally {
      loading.value = false
    }
  }

  function startPolling() {
    // Initial fetch
    fetchNodes()
    // Poll every 5 seconds
    if (!timer) {
      timer = setInterval(fetchNodes, 5000)
    }
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onUnmounted(stopPolling)

  return { nodes, loading, error, startPolling, stopPolling }
}
