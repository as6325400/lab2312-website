<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, toRaw } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { useMonitoring, type NodeHistory } from '../composables/useMonitoring'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const { nodes, loading, error, startPolling } = useMonitoring()

onMounted(startPolling)

// Tab state: null = overview, hostname string = node detail
const activeTab = ref<string | null>(null)

// Scroll to top when switching tabs
watch(activeTab, () => {
  nextTick(() => window.scrollTo({ top: 0, behavior: 'instant' }))
})

// --- Overview computed ---
const totalGpus = computed(() => nodes.value.reduce((s, n) => s + n.node.gpus.length, 0))
const totalDisk = computed(() => {
  let used = 0, total = 0
  nodes.value.forEach(n => n.node.disks.forEach(d => { used += d.usedGB; total += d.totalGB }))
  return { used: +used.toFixed(1), total: +total.toFixed(1), pct: total ? Math.round((used / total) * 100) : 0 }
})
const avgGpuUtil = computed(() => {
  let total = 0, count = 0
  nodes.value.forEach(n => n.node.gpus.forEach(g => { total += g.utilizationPct; count++ }))
  return count ? Math.round(total / count) : 0
})
const avgGpuMem = computed(() => {
  let usedTotal = 0, capTotal = 0
  nodes.value.forEach(n => n.node.gpus.forEach(g => { usedTotal += g.memoryUsedMB; capTotal += g.memoryTotalMB }))
  return capTotal ? Math.round((usedTotal / capTotal) * 100) : 0
})
const totalPower = computed(() => {
  let draw = 0, limit = 0
  nodes.value.forEach(n => n.node.gpus.forEach(g => { draw += g.powerDrawW; limit += g.powerLimitW }))
  return { draw, limit }
})
const totalCpuCores = computed(() => nodes.value.reduce((s, n) => s + n.node.cpuCores, 0))
const avgCpuUsage = computed(() => {
  const len = nodes.value.length
  if (!len) return 0
  return Math.round(nodes.value.reduce((s, n) => s + n.node.cpuUsagePct, 0) / len)
})
const memoryOverview = computed(() => {
  let used = 0, total = 0
  nodes.value.forEach(n => { used += n.node.memoryUsedGB; total += n.node.memoryTotalGB })
  return { used: Math.round(used), total: Math.round(total), pct: total ? Math.round((used / total) * 100) : 0 }
})

// --- Chart helpers ---
const GPU_COLORS = [
  'rgb(14, 165, 233)',   // sky-500
  'rgb(168, 85, 247)',   // purple-500
  'rgb(249, 115, 22)',   // orange-500
  'rgb(34, 197, 94)',    // green-500
]
const GPU_COLORS_BG = [
  'rgba(14, 165, 233, 0.1)',
  'rgba(168, 85, 247, 0.1)',
  'rgba(249, 115, 22, 0.1)',
  'rgba(34, 197, 94, 0.1)',
]

function cpuChartData(nh: NodeHistory) {
  const raw = toRaw(nh)
  return {
    labels: [...raw.timestamps],
    datasets: [{
      label: 'CPU %',
      data: [...raw.cpuHistory],
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
    }],
  }
}

function gpuChartData(nh: NodeHistory) {
  const raw = toRaw(nh)
  return {
    labels: [...raw.timestamps],
    datasets: raw.gpuHistories.map((hist, i) => ({
      label: `GPU ${i}`,
      data: [...hist],
      borderColor: GPU_COLORS[i % GPU_COLORS.length],
      backgroundColor: GPU_COLORS_BG[i % GPU_COLORS_BG.length],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
    })),
  }
}

const NIC_COLORS = [
  { rx: 'rgb(34, 197, 94)',  rxBg: 'rgba(34, 197, 94, 0.1)',  tx: 'rgb(249, 115, 22)', txBg: 'rgba(249, 115, 22, 0.1)' },
  { rx: 'rgb(14, 165, 233)', rxBg: 'rgba(14, 165, 233, 0.1)', tx: 'rgb(168, 85, 247)', txBg: 'rgba(168, 85, 247, 0.1)' },
  { rx: 'rgb(20, 184, 166)', rxBg: 'rgba(20, 184, 166, 0.1)', tx: 'rgb(244, 63, 94)',  txBg: 'rgba(244, 63, 94, 0.1)' },
  { rx: 'rgb(132, 204, 22)', rxBg: 'rgba(132, 204, 22, 0.1)', tx: 'rgb(217, 70, 239)', txBg: 'rgba(217, 70, 239, 0.1)' },
]

function networkChartData(nh: NodeHistory) {
  const raw = toRaw(nh)
  const nics = raw.node.nics || []

  // Per-NIC mode: one RX + TX pair per NIC
  if (nics.length > 0 && raw.nicRxHistories?.length > 0) {
    const datasets: any[] = []
    nics.forEach((nic, i) => {
      const colors = NIC_COLORS[i % NIC_COLORS.length]
      const rxHist = raw.nicRxHistories[i] || []
      const txHist = raw.nicTxHistories[i] || []
      datasets.push({
        label: `${nic.name} ↓RX`,
        data: [...rxHist],
        borderColor: colors.rx,
        backgroundColor: colors.rxBg,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      })
      datasets.push({
        label: `${nic.name} ↑TX`,
        data: [...txHist],
        borderColor: colors.tx,
        backgroundColor: colors.txBg,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        borderDash: [4, 2],
      })
    })
    return { labels: [...raw.timestamps], datasets }
  }

  // Fallback: combined totals
  return {
    labels: [...raw.timestamps],
    datasets: [
      {
        label: 'RX (Mbps)',
        data: [...raw.networkRxHistory],
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'TX (Mbps)',
        data: [...raw.networkTxHistory],
        borderColor: 'rgb(249, 115, 22)',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      },
    ],
  }
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },
  scales: {
    x: {
      display: true,
      ticks: { maxTicksLimit: 6, font: { size: 10 }, color: '#94a3b8' },
      grid: { display: false },
    },
    y: {
      min: 0,
      max: 100,
      ticks: { stepSize: 25, font: { size: 10 }, color: '#94a3b8', callback: (v: number | string) => v + '%' },
      grid: { color: 'rgba(0,0,0,0.05)' },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  interaction: { mode: 'index' as const, intersect: false },
}

const gpuChartOptions = {
  ...chartOptions,
  plugins: {
    ...chartOptions.plugins,
    legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 }, padding: 8 } },
  },
}

const networkChartOptions = {
  ...chartOptions,
  scales: {
    ...chartOptions.scales,
    y: {
      min: 0,
      ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v: number | string) => v + ' Mbps' },
      grid: { color: 'rgba(0,0,0,0.05)' },
    },
  },
  plugins: {
    ...chartOptions.plugins,
    legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 }, padding: 8 } },
  },
}

function barColor(pct: number) {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-primary-500'
}

function tempColor(t: number) {
  if (t >= 80) return 'text-red-500'
  if (t >= 65) return 'text-amber-500'
  return 'text-gray-500'
}

function pctColor(pct: number) {
  if (pct >= 90) return 'text-red-500'
  if (pct >= 70) return 'text-amber-500'
  return 'text-primary-600'
}

function fmtMem(mb: number) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  return mb + ' MB'
}

function fmtUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d} 天 ${h} 小時`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h} 小時 ${m} 分鐘`
}

function fmtDisk(gb: number) {
  if (gb >= 1000) return (gb / 1000).toFixed(1) + ' TB'
  return gb.toFixed(1) + ' GB'
}

function fmtNetwork(mbps: number) {
  if (mbps >= 1000) return (mbps / 1000).toFixed(1) + ' Gbps'
  return mbps.toFixed(1) + ' Mbps'
}
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-4">
    <!-- Loading / Error states -->
    <div v-if="loading" class="text-center text-gray-500 py-16">載入中...</div>
    <div v-else-if="error" class="text-center text-red-500 py-16">{{ error }}</div>
    <div v-else-if="nodes.length === 0" class="text-center text-gray-400 py-16">
      <div class="text-4xl mb-3 opacity-40">i-carbon-dashboard</div>
      <p>尚無監控節點</p>
      <p class="text-sm mt-1">請在各節點部署 lab-exporter 並完成註冊</p>
    </div>
    <template v-else>

    <!-- Tab bar -->
    <div class="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-none">
      <button
        @click="activeTab = null"
        class="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="activeTab === null ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'"
      >
        總覽
      </button>
      <button
        v-for="nh in nodes"
        :key="nh.node.hostname"
        @click="activeTab = nh.node.hostname"
        class="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        :class="activeTab === nh.node.hostname ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'"
      >
        <span class="w-2 h-2 rounded-full shrink-0" :class="nh.node.online ? 'bg-green-400' : 'bg-gray-300'" />
        {{ nh.node.hostname }}
      </button>
    </div>

    <!-- ==================== OVERVIEW TAB ==================== -->
    <template v-if="!activeTab">
      <!-- Summary cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="card !p-4 text-center">
          <div class="text-2xl font-bold text-gray-800">{{ nodes.length }}</div>
          <div class="text-xs text-gray-500 mt-1">節點數</div>
        </div>
        <template v-if="totalGpus > 0">
          <div class="card !p-4 text-center">
            <div class="text-2xl font-bold text-gray-800">{{ totalGpus }}</div>
            <div class="text-xs text-gray-500 mt-1">GPU 總數</div>
          </div>
          <div class="card !p-4 text-center">
            <div class="text-2xl font-bold" :class="pctColor(avgGpuUtil)">{{ avgGpuUtil }}%</div>
            <div class="text-xs text-gray-500 mt-1">平均 GPU 使用率</div>
          </div>
          <div class="card !p-4 text-center">
            <div class="text-2xl font-bold" :class="pctColor(avgGpuMem)">{{ avgGpuMem }}%</div>
            <div class="text-xs text-gray-500 mt-1">平均 GPU 記憶體</div>
          </div>
        </template>
        <template v-else>
          <div class="card !p-4 text-center">
            <div class="text-2xl font-bold text-gray-800">{{ totalCpuCores }}</div>
            <div class="text-xs text-gray-500 mt-1">CPU 核心總數</div>
          </div>
          <div class="card !p-4 text-center">
            <div class="text-2xl font-bold" :class="pctColor(avgCpuUsage)">{{ avgCpuUsage }}%</div>
            <div class="text-xs text-gray-500 mt-1">平均 CPU 使用率</div>
          </div>
          <div class="card !p-4 text-center">
            <div class="text-2xl font-bold" :class="pctColor(memoryOverview.pct)">{{ memoryOverview.pct }}%</div>
            <div class="text-xs text-gray-500 mt-1">記憶體使用率</div>
          </div>
        </template>
      </div>

      <!-- Storage & Power/Memory summary -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="card !p-4">
          <div class="text-xs text-gray-500 mb-2">儲存空間總覽</div>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="barColor(totalDisk.pct)" :style="{ width: totalDisk.pct + '%' }" />
              </div>
            </div>
            <span class="text-sm font-medium text-gray-700 shrink-0">{{ fmtDisk(totalDisk.used) }} / {{ fmtDisk(totalDisk.total) }}</span>
          </div>
          <div class="text-xs text-gray-400 mt-1">使用率 {{ totalDisk.pct }}%</div>
        </div>
        <div v-if="totalGpus > 0" class="card !p-4">
          <div class="text-xs text-gray-500 mb-2">GPU 總功耗</div>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div class="h-full rounded-full bg-amber-400 transition-all duration-500" :style="{ width: (totalPower.limit ? totalPower.draw / totalPower.limit * 100 : 0) + '%' }" />
              </div>
            </div>
            <span class="text-sm font-medium text-gray-700 shrink-0">{{ totalPower.draw }} W / {{ totalPower.limit }} W</span>
          </div>
        </div>
        <div v-else class="card !p-4">
          <div class="text-xs text-gray-500 mb-2">記憶體總覽</div>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="barColor(memoryOverview.pct)" :style="{ width: memoryOverview.pct + '%' }" />
              </div>
            </div>
            <span class="text-sm font-medium text-gray-700 shrink-0">{{ memoryOverview.used }} GB / {{ memoryOverview.total }} GB</span>
          </div>
          <div class="text-xs text-gray-400 mt-1">使用率 {{ memoryOverview.pct }}%</div>
        </div>
      </div>

      <!-- Node summary rows -->
      <div class="space-y-3">
        <div
          v-for="nh in nodes"
          :key="nh.node.hostname"
          class="card !p-4 cursor-pointer hover:ring-2 hover:ring-primary-200 transition-all"
          @click="activeTab = nh.node.hostname"
        >
          <!-- Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-3">
              <div class="w-2.5 h-2.5 rounded-full shrink-0" :class="nh.node.online ? 'bg-green-400' : 'bg-gray-300'" />
              <h3 class="font-semibold text-gray-800">{{ nh.node.hostname }}</h3>
              <span class="text-xs text-gray-400">{{ nh.node.ip }}</span>
            </div>
            <div class="flex items-center gap-4 text-xs text-gray-400">
              <span>運行 {{ fmtUptime(nh.node.uptimeSeconds) }}</span>
              <span>{{ nh.node.processCount }} 程序</span>
            </div>
          </div>

          <!-- Metrics grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <!-- CPU -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-500">CPU ({{ nh.node.cpuCores }} 核心)</span>
                <span class="font-medium" :class="pctColor(nh.node.cpuUsagePct)">{{ nh.node.cpuUsagePct.toFixed(1) }}%</span>
              </div>
              <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="barColor(nh.node.cpuUsagePct)" :style="{ width: nh.node.cpuUsagePct + '%' }" />
              </div>
              <div class="text-xs text-gray-400">記憶體 {{ nh.node.memoryUsedGB.toFixed(1) }} / {{ nh.node.memoryTotalGB.toFixed(1) }} GB</div>
            </div>

            <!-- GPU summary / placeholder -->
            <div class="space-y-1">
              <template v-if="nh.node.gpus.length > 0">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-500">GPU ({{ nh.node.gpus.length }})</span>
                  <span class="font-medium" :class="pctColor(Math.round(nh.node.gpus.reduce((s, g) => s + g.utilizationPct, 0) / nh.node.gpus.length))">
                    {{ Math.round(nh.node.gpus.reduce((s, g) => s + g.utilizationPct, 0) / nh.node.gpus.length) }}%
                  </span>
                </div>
                <div class="flex gap-0.5">
                  <div
                    v-for="gpu in nh.node.gpus"
                    :key="gpu.index"
                    class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"
                  >
                    <div class="h-full rounded-full transition-all duration-500" :class="barColor(gpu.utilizationPct)" :style="{ width: gpu.utilizationPct + '%' }" />
                  </div>
                </div>
                <div class="text-xs text-gray-400">{{ nh.node.gpus.map(g => g.utilizationPct.toFixed(0) + '%').join(' / ') }}</div>
              </template>
              <template v-else>
                <div class="text-xs text-gray-500">GPU</div>
                <div class="text-xs text-gray-300">無 GPU</div>
              </template>
            </div>

            <!-- Storage -->
            <div class="space-y-1">
              <div class="text-xs text-gray-500">儲存</div>
              <div v-for="d in nh.node.disks" :key="d.mount" class="flex items-center gap-1.5">
                <span class="text-xs text-gray-400 w-12 shrink-0 truncate">{{ d.mount }}</span>
                <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500" :class="barColor(Math.round(d.usedGB / d.totalGB * 100))" :style="{ width: (d.usedGB / d.totalGB * 100) + '%' }" />
                </div>
                <span class="text-xs text-gray-400 shrink-0">{{ Math.round(d.usedGB / d.totalGB * 100) }}%</span>
              </div>
            </div>

            <!-- Network -->
            <div class="space-y-1">
              <div class="text-xs text-gray-500">網路</div>
              <div v-if="nh.node.nics?.length" class="space-y-0.5">
                <div v-for="nic in nh.node.nics" :key="nic.name" class="text-xs text-gray-600">
                  <span class="text-gray-400 mr-1">{{ nic.name }}</span>
                  <span v-if="nic.ipv4" class="text-gray-300 mr-1">({{ nic.ipv4 }})</span>
                  <span class="text-green-600">↓{{ fmtNetwork(nic.rxMbps) }}</span>
                  <span class="mx-1 text-gray-300">|</span>
                  <span class="text-orange-500">↑{{ fmtNetwork(nic.txMbps) }}</span>
                </div>
              </div>
              <div v-else class="text-xs text-gray-600">
                <span class="text-green-600">↓ {{ fmtNetwork(nh.node.networkRxMbps) }}</span>
                <span class="mx-1.5 text-gray-300">|</span>
                <span class="text-orange-500">↑ {{ fmtNetwork(nh.node.networkTxMbps) }}</span>
              </div>
              <div class="text-xs text-gray-400">Load {{ nh.node.loadAvg.map((v: number) => v.toFixed(1)).join(' / ') }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ==================== NODE DETAIL TABS ==================== -->
    <template v-for="nh in nodes" :key="nh.node.hostname">
      <div v-if="activeTab === nh.node.hostname" class="space-y-4">
        <!-- Node header -->
        <div class="card !p-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full shrink-0" :class="nh.node.online ? 'bg-green-400' : 'bg-gray-300'" />
              <h2 class="text-xl font-bold text-gray-800">{{ nh.node.hostname }}</h2>
              <span class="text-sm text-gray-400">{{ nh.node.ip }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>運行 {{ fmtUptime(nh.node.uptimeSeconds) }}</span>
              <span>{{ nh.node.processCount }} 程序</span>
              <span>Load {{ nh.node.loadAvg.map((v: number) => v.toFixed(1)).join(' / ') }}</span>
              <span>{{ new Date(nh.node.updatedAt).toLocaleTimeString('zh-TW', { hour12: false }) }}</span>
            </div>
          </div>
        </div>

        <!-- Quick stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="card !p-3 text-center">
            <div class="text-lg font-bold" :class="pctColor(nh.node.cpuUsagePct)">{{ nh.node.cpuUsagePct.toFixed(1) }}%</div>
            <div class="text-xs text-gray-500">CPU ({{ nh.node.cpuCores }} 核心)</div>
          </div>
          <div class="card !p-3 text-center">
            <div class="text-lg font-bold text-gray-800">{{ nh.node.memoryUsedGB.toFixed(1) }} / {{ nh.node.memoryTotalGB.toFixed(1) }} GB</div>
            <div class="text-xs text-gray-500">記憶體</div>
          </div>
          <template v-if="nh.node.gpus.length > 0">
            <div class="card !p-3 text-center">
              <div class="text-lg font-bold text-gray-800">{{ nh.node.gpus.length }}</div>
              <div class="text-xs text-gray-500">GPU</div>
            </div>
            <div class="card !p-3 text-center">
              <div class="text-lg font-bold text-gray-800">
                {{ nh.node.gpus.reduce((s, g) => s + g.powerDrawW, 0) }} W
              </div>
              <div class="text-xs text-gray-500">GPU 功耗</div>
            </div>
          </template>
          <template v-else>
            <div class="card !p-3 text-center">
              <div class="text-lg font-bold text-gray-800">{{ nh.node.loadAvg[0].toFixed(1) }}</div>
              <div class="text-xs text-gray-500">Load Average</div>
            </div>
            <div class="card !p-3 text-center">
              <div class="text-lg font-bold text-gray-800">{{ nh.node.processCount }}</div>
              <div class="text-xs text-gray-500">程序數</div>
            </div>
          </template>
        </div>

        <!-- CPU section -->
        <div class="card space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">CPU</h3>
            <span class="text-sm font-medium" :class="pctColor(nh.node.cpuUsagePct)">{{ nh.node.cpuUsagePct.toFixed(1) }}%</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500" :class="barColor(nh.node.cpuUsagePct)" :style="{ width: nh.node.cpuUsagePct + '%' }" />
            </div>
            <span class="text-xs text-gray-400 shrink-0">記憶體 {{ nh.node.memoryUsedGB.toFixed(1) }} / {{ nh.node.memoryTotalGB.toFixed(1) }} GB</span>
          </div>
          <div class="h-44">
            <Line :data="cpuChartData(nh)" :options="chartOptions" />
          </div>
        </div>

        <!-- GPU section -->
        <div v-if="nh.node.gpus.length > 0" class="card space-y-4">
          <h3 class="text-sm font-semibold text-gray-700">GPU</h3>
          <div class="grid gap-3" :class="nh.node.gpus.length > 2 ? 'sm:grid-cols-2' : ''">
            <div
              v-for="gpu in nh.node.gpus"
              :key="gpu.index"
              class="p-3 bg-gray-50 rounded-lg space-y-2"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600">GPU {{ gpu.index }} · {{ gpu.name }}</span>
                <span class="text-xs" :class="tempColor(gpu.temperatureC)">{{ gpu.temperatureC }}°C</span>
              </div>
              <!-- Utilization -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 w-8 shrink-0">使用率</span>
                <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500" :class="barColor(gpu.utilizationPct)" :style="{ width: gpu.utilizationPct + '%' }" />
                </div>
                <span class="text-xs font-medium text-gray-600 w-10 text-right">{{ gpu.utilizationPct.toFixed(0) }}%</span>
              </div>
              <!-- VRAM -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 w-8 shrink-0">顯存</span>
                <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full rounded-full bg-violet-400 transition-all duration-500" :style="{ width: (gpu.memoryUsedMB / gpu.memoryTotalMB * 100) + '%' }" />
                </div>
                <span class="text-xs text-gray-500 w-24 text-right">{{ fmtMem(gpu.memoryUsedMB) }} / {{ fmtMem(gpu.memoryTotalMB) }}</span>
              </div>
              <!-- Power -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 w-8 shrink-0">功耗</span>
                <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full rounded-full bg-amber-400 transition-all duration-500" :style="{ width: (gpu.powerDrawW / gpu.powerLimitW * 100) + '%' }" />
                </div>
                <span class="text-xs text-gray-500 w-24 text-right">{{ gpu.powerDrawW }} W / {{ gpu.powerLimitW }} W</span>
              </div>
            </div>
          </div>
          <div class="h-44">
            <Line :data="gpuChartData(nh)" :options="nh.node.gpus.length > 1 ? gpuChartOptions : chartOptions" />
          </div>
        </div>

        <!-- Storage section -->
        <div class="card space-y-3">
          <h3 class="text-sm font-semibold text-gray-700">儲存空間</h3>
          <div class="grid gap-3" :class="nh.node.disks.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'">
            <div
              v-for="d in nh.node.disks"
              :key="d.mount"
              class="p-3 bg-gray-50 rounded-lg space-y-2"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600 font-mono">{{ d.mount }}</span>
                <span class="text-xs font-medium" :class="pctColor(Math.round(d.usedGB / d.totalGB * 100))">{{ Math.round(d.usedGB / d.totalGB * 100) }}%</span>
              </div>
              <div class="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="barColor(Math.round(d.usedGB / d.totalGB * 100))" :style="{ width: (d.usedGB / d.totalGB * 100) + '%' }" />
              </div>
              <div class="text-xs text-gray-400">{{ fmtDisk(d.usedGB) }} / {{ fmtDisk(d.totalGB) }}</div>
            </div>
          </div>
        </div>

        <!-- Network section -->
        <div class="card space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">網路</h3>
            <div class="flex items-center gap-3 text-xs">
              <span class="text-green-600">↓ {{ fmtNetwork(nh.node.networkRxMbps) }}</span>
              <span class="text-orange-500">↑ {{ fmtNetwork(nh.node.networkTxMbps) }}</span>
            </div>
          </div>
          <!-- Per-NIC current speeds -->
          <div v-if="nh.node.nics?.length" class="grid gap-2" :class="nh.node.nics.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'">
            <div
              v-for="nic in nh.node.nics"
              :key="nic.name"
              class="p-2 bg-gray-50 rounded-lg flex items-center justify-between"
            >
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-gray-600 font-mono">{{ nic.name }}</span>
                <span v-if="nic.ipv4" class="text-xs text-gray-400">{{ nic.ipv4 }}</span>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-green-600">↓{{ fmtNetwork(nic.rxMbps) }}</span>
                <span class="text-orange-500">↑{{ fmtNetwork(nic.txMbps) }}</span>
              </div>
            </div>
          </div>
          <div class="h-44">
            <Line :data="networkChartData(nh)" :options="networkChartOptions" />
          </div>
        </div>
      </div>
    </template>

    </template>
  </div>
</template>
