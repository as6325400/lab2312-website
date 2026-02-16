import { ref, toRaw, onUnmounted } from 'vue'

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
  networkRxMbps: number
  networkTxMbps: number
  uptimeSeconds: number
  processCount: number
  loadAvg: [number, number, number]
}

export interface NodeHistory {
  node: NodeSnapshot
  cpuHistory: number[]
  gpuHistories: number[][]
  networkRxHistory: number[]
  networkTxHistory: number[]
  timestamps: string[]
}

const HISTORY_LENGTH = 120 // 10 min / 5 sec

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function drift(current: number, range: number, min: number, max: number) {
  return clamp(current + (Math.random() - 0.5) * range, min, max)
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('zh-TW', { hour12: false })
}

const nodeConfigs = [
  {
    hostname: 'gpu-node-1',
    ip: '10.0.1.11',
    cpuCores: 32,
    memoryTotalGB: 128,
    gpus: [
      { name: 'NVIDIA RTX 4090', memoryTotalMB: 24576, powerLimitW: 450 },
      { name: 'NVIDIA RTX 4090', memoryTotalMB: 24576, powerLimitW: 450 },
    ],
    disks: [
      { mount: '/', totalGB: 500, usedBase: 180 },
      { mount: '/data', totalGB: 4000, usedBase: 2400 },
    ],
    cpuBase: 65,
    gpuBases: [75, 82],
    networkRxBase: 450,
    networkTxBase: 120,
    uptimeSeconds: 86400 * 15 + 3600 * 7,
    processCount: 340,
  },
  {
    hostname: 'gpu-node-2',
    ip: '10.0.1.12',
    cpuCores: 16,
    memoryTotalGB: 64,
    gpus: [
      { name: 'NVIDIA RTX 3090', memoryTotalMB: 24576, powerLimitW: 350 },
    ],
    disks: [
      { mount: '/', totalGB: 250, usedBase: 95 },
      { mount: '/data', totalGB: 2000, usedBase: 800 },
    ],
    cpuBase: 30,
    gpuBases: [45],
    networkRxBase: 200,
    networkTxBase: 60,
    uptimeSeconds: 86400 * 42 + 3600 * 2,
    processCount: 185,
  },
  {
    hostname: 'gpu-node-3',
    ip: '10.0.1.13',
    cpuCores: 64,
    memoryTotalGB: 256,
    gpus: [
      { name: 'NVIDIA A100 80GB', memoryTotalMB: 81920, powerLimitW: 300 },
      { name: 'NVIDIA A100 80GB', memoryTotalMB: 81920, powerLimitW: 300 },
      { name: 'NVIDIA A100 80GB', memoryTotalMB: 81920, powerLimitW: 300 },
      { name: 'NVIDIA A100 80GB', memoryTotalMB: 81920, powerLimitW: 300 },
    ],
    disks: [
      { mount: '/', totalGB: 1000, usedBase: 320 },
      { mount: '/data', totalGB: 8000, usedBase: 5200 },
      { mount: '/scratch', totalGB: 2000, usedBase: 600 },
    ],
    cpuBase: 50,
    gpuBases: [90, 60, 85, 20],
    networkRxBase: 800,
    networkTxBase: 300,
    uptimeSeconds: 86400 * 7 + 3600 * 18,
    processCount: 520,
  },
]

function createInitialHistory(): { nodes: NodeHistory[] } {
  const now = Date.now()
  const nodes: NodeHistory[] = nodeConfigs.map((cfg) => {
    let cpuVal = cfg.cpuBase
    const gpuVals = cfg.gpuBases.map((b) => b)
    let rxVal = cfg.networkRxBase
    let txVal = cfg.networkTxBase

    const cpuHistory: number[] = []
    const gpuHistories: number[][] = cfg.gpus.map(() => [])
    const networkRxHistory: number[] = []
    const networkTxHistory: number[] = []
    const timestamps: string[] = []

    for (let i = 0; i < HISTORY_LENGTH; i++) {
      const t = new Date(now - (HISTORY_LENGTH - 1 - i) * 5000)
      timestamps.push(formatTime(t))

      cpuVal = drift(cpuVal, 8, 5, 100)
      cpuHistory.push(Math.round(cpuVal * 10) / 10)

      gpuVals.forEach((gv, gi) => {
        gpuVals[gi] = drift(gv, 10, 0, 100)
        gpuHistories[gi]!.push(Math.round(gpuVals[gi]! * 10) / 10)
      })

      rxVal = drift(rxVal, 100, 10, 2000)
      txVal = drift(txVal, 50, 5, 1000)
      networkRxHistory.push(Math.round(rxVal))
      networkTxHistory.push(Math.round(txVal))
    }

    const latestCpu = cpuHistory[cpuHistory.length - 1]!
    const memUsed = Math.round((latestCpu / 100) * cfg.memoryTotalGB * 10) / 10

    const gpus: GpuInfo[] = cfg.gpus.map((g, gi) => {
      const util = gpuHistories[gi]![gpuHistories[gi]!.length - 1]!
      return {
        index: gi,
        name: g.name,
        utilizationPct: util,
        memoryUsedMB: Math.round((util / 100) * g.memoryTotalMB),
        memoryTotalMB: g.memoryTotalMB,
        temperatureC: Math.round(35 + (util / 100) * 50),
        powerDrawW: Math.round(50 + (util / 100) * (g.powerLimitW - 50)),
        powerLimitW: g.powerLimitW,
      }
    })

    const disks: DiskInfo[] = cfg.disks.map((d) => ({
      mount: d.mount,
      totalGB: d.totalGB,
      usedGB: Math.round(d.usedBase + Math.random() * 20),
    }))

    const loadBase = latestCpu / 100 * cfg.cpuCores
    return {
      node: {
        hostname: cfg.hostname,
        ip: cfg.ip,
        online: true,
        updatedAt: new Date(now).toISOString(),
        cpuUsagePct: latestCpu,
        cpuCores: cfg.cpuCores,
        memoryUsedGB: memUsed,
        memoryTotalGB: cfg.memoryTotalGB,
        gpus,
        disks,
        networkRxMbps: networkRxHistory[networkRxHistory.length - 1]!,
        networkTxMbps: networkTxHistory[networkTxHistory.length - 1]!,
        uptimeSeconds: cfg.uptimeSeconds,
        processCount: cfg.processCount,
        loadAvg: [
          Math.round(loadBase * 10) / 10,
          Math.round((loadBase * 0.9) * 10) / 10,
          Math.round((loadBase * 0.85) * 10) / 10,
        ],
      },
      cpuHistory,
      gpuHistories,
      networkRxHistory,
      networkTxHistory,
      timestamps,
    }
  })

  return { nodes }
}

function tickNodes(nodes: NodeHistory[]) {
  const now = new Date()
  const timeLabel = formatTime(now)

  nodes.forEach((nh, ni) => {
    const cfg = nodeConfigs[ni]!
    const prevCpu = nh.cpuHistory[nh.cpuHistory.length - 1]!
    const newCpu = drift(prevCpu, 8, 5, 100)
    const roundedCpu = Math.round(newCpu * 10) / 10

    nh.cpuHistory.push(roundedCpu)
    if (nh.cpuHistory.length > HISTORY_LENGTH) nh.cpuHistory.shift()

    nh.timestamps.push(timeLabel)
    if (nh.timestamps.length > HISTORY_LENGTH) nh.timestamps.shift()

    nh.node.cpuUsagePct = roundedCpu
    nh.node.memoryUsedGB = Math.round((roundedCpu / 100) * cfg.memoryTotalGB * 10) / 10
    nh.node.updatedAt = now.toISOString()
    nh.node.uptimeSeconds += 5
    nh.node.processCount = Math.round(drift(nh.node.processCount, 10, 100, 800))

    const loadBase = roundedCpu / 100 * cfg.cpuCores
    nh.node.loadAvg = [
      Math.round(loadBase * 10) / 10,
      Math.round((nh.node.loadAvg[1] * 0.8 + loadBase * 0.2) * 10) / 10,
      Math.round((nh.node.loadAvg[2] * 0.9 + loadBase * 0.1) * 10) / 10,
    ]

    // Network
    const prevRx = nh.networkRxHistory[nh.networkRxHistory.length - 1]!
    const prevTx = nh.networkTxHistory[nh.networkTxHistory.length - 1]!
    const newRx = Math.round(drift(prevRx, 100, 10, 2000))
    const newTx = Math.round(drift(prevTx, 50, 5, 1000))
    nh.networkRxHistory.push(newRx)
    nh.networkTxHistory.push(newTx)
    if (nh.networkRxHistory.length > HISTORY_LENGTH) nh.networkRxHistory.shift()
    if (nh.networkTxHistory.length > HISTORY_LENGTH) nh.networkTxHistory.shift()
    nh.node.networkRxMbps = newRx
    nh.node.networkTxMbps = newTx

    nh.node.gpus.forEach((gpu, gi) => {
      const prev = nh.gpuHistories[gi]![nh.gpuHistories[gi]!.length - 1]!
      const newVal = drift(prev, 10, 0, 100)
      const rounded = Math.round(newVal * 10) / 10

      nh.gpuHistories[gi]!.push(rounded)
      if (nh.gpuHistories[gi]!.length > HISTORY_LENGTH) nh.gpuHistories[gi]!.shift()

      gpu.utilizationPct = rounded
      gpu.memoryUsedMB = Math.round((rounded / 100) * gpu.memoryTotalMB)
      gpu.temperatureC = Math.round(35 + (rounded / 100) * 50)
      gpu.powerDrawW = Math.round(50 + (rounded / 100) * (gpu.powerLimitW - 50))
    })

    // Disk: slow drift
    nh.node.disks.forEach((d) => {
      d.usedGB = Math.round(clamp(d.usedGB + (Math.random() - 0.48) * 0.5, 0, d.totalGB))
    })
  })
}

export function useMockMonitoring() {
  const initial = createInitialHistory()
  const nodes = ref<NodeHistory[]>(initial.nodes)
  let timer: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    if (timer) return
    timer = setInterval(() => {
      tickNodes(toRaw(nodes.value) as NodeHistory[])
      nodes.value = [...nodes.value]
    }, 5000)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onUnmounted(stopPolling)

  return { nodes, startPolling, stopPolling }
}
