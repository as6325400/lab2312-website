import { getDb } from '../db/schema';

export interface GpuInfo {
  index: number;
  name: string;
  utilizationPct: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  temperatureC: number;
  powerDrawW: number;
  powerLimitW: number;
}

export interface DiskInfo {
  mount: string;
  totalGB: number;
  usedGB: number;
}

export interface NicSnapshot {
  name: string;
  ipv4: string;
  rxMbps: number;
  txMbps: number;
}

export interface NodeSnapshot {
  hostname: string;
  ip: string;
  online: boolean;
  updatedAt: string;
  cpuUsagePct: number;
  cpuCores: number;
  memoryUsedGB: number;
  memoryTotalGB: number;
  gpus: GpuInfo[];
  disks: DiskInfo[];
  nics: NicSnapshot[];
  networkRxMbps: number;
  networkTxMbps: number;
  uptimeSeconds: number;
  processCount: number;
  loadAvg: [number, number, number];
}

export interface NodeHistory {
  nodeId: number;
  node: NodeSnapshot;
  cpuHistory: number[];
  gpuHistories: number[][];
  nicRxHistories: number[][];
  nicTxHistories: number[][];
  networkRxHistory: number[];
  networkTxHistory: number[];
  timestamps: string[];
}

const HISTORY_LENGTH = 120; // 10 min / 5 sec

// nodeId → NodeHistory
const store = new Map<number, NodeHistory>();

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-TW', { hour12: false });
}

export function pushSnapshot(nodeId: number, snapshot: NodeSnapshot): void {
  const now = new Date();
  const timeLabel = formatTime(now);

  snapshot.online = true;
  snapshot.updatedAt = now.toISOString();

  const nics = snapshot.nics || [];

  let nh = store.get(nodeId);
  if (!nh) {
    // First report — initialize with single data point
    nh = {
      nodeId,
      node: snapshot,
      cpuHistory: [snapshot.cpuUsagePct],
      gpuHistories: snapshot.gpus.map((g) => [g.utilizationPct]),
      nicRxHistories: nics.map((n) => [n.rxMbps]),
      nicTxHistories: nics.map((n) => [n.txMbps]),
      networkRxHistory: [snapshot.networkRxMbps],
      networkTxHistory: [snapshot.networkTxMbps],
      timestamps: [timeLabel],
    };
    store.set(nodeId, nh);
  } else {
    nh.node = snapshot;

    nh.cpuHistory.push(snapshot.cpuUsagePct);
    if (nh.cpuHistory.length > HISTORY_LENGTH) nh.cpuHistory.shift();

    nh.timestamps.push(timeLabel);
    if (nh.timestamps.length > HISTORY_LENGTH) nh.timestamps.shift();

    nh.networkRxHistory.push(snapshot.networkRxMbps);
    if (nh.networkRxHistory.length > HISTORY_LENGTH) nh.networkRxHistory.shift();

    nh.networkTxHistory.push(snapshot.networkTxMbps);
    if (nh.networkTxHistory.length > HISTORY_LENGTH) nh.networkTxHistory.shift();

    // GPU histories
    snapshot.gpus.forEach((gpu, gi) => {
      if (!nh!.gpuHistories[gi]) {
        nh!.gpuHistories[gi] = [];
      }
      nh!.gpuHistories[gi]!.push(gpu.utilizationPct);
      if (nh!.gpuHistories[gi]!.length > HISTORY_LENGTH) nh!.gpuHistories[gi]!.shift();
    });
    if (nh.gpuHistories.length > snapshot.gpus.length) {
      nh.gpuHistories.length = snapshot.gpus.length;
    }

    // Per-NIC histories
    nics.forEach((nic, ni) => {
      if (!nh!.nicRxHistories[ni]) nh!.nicRxHistories[ni] = [];
      if (!nh!.nicTxHistories[ni]) nh!.nicTxHistories[ni] = [];
      nh!.nicRxHistories[ni]!.push(nic.rxMbps);
      nh!.nicTxHistories[ni]!.push(nic.txMbps);
      if (nh!.nicRxHistories[ni]!.length > HISTORY_LENGTH) nh!.nicRxHistories[ni]!.shift();
      if (nh!.nicTxHistories[ni]!.length > HISTORY_LENGTH) nh!.nicTxHistories[ni]!.shift();
    });
    if (nh.nicRxHistories.length > nics.length) {
      nh.nicRxHistories.length = nics.length;
      nh.nicTxHistories.length = nics.length;
    }
  }

  // Persist latest snapshot to DB (upsert)
  const db = getDb();
  const existing = db.prepare('SELECT id FROM monitor_snapshots WHERE node_id = ?').get(nodeId) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE monitor_snapshots SET snapshot_json = ?, created_at = datetime(\'now\') WHERE node_id = ?')
      .run(JSON.stringify(snapshot), nodeId);
  } else {
    db.prepare('INSERT INTO monitor_snapshots (node_id, snapshot_json) VALUES (?, ?)')
      .run(nodeId, JSON.stringify(snapshot));
  }

  // Update last_seen_at (ISO format with Z for unambiguous UTC parsing in frontend)
  db.prepare('UPDATE monitor_nodes SET last_seen_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\'), ip = ? WHERE id = ?')
    .run(snapshot.ip || '', nodeId);
}

export function getAll(): NodeHistory[] {
  return Array.from(store.values());
}

export function getNode(nodeId: number): NodeHistory | undefined {
  return store.get(nodeId);
}

export function removeNode(nodeId: number): void {
  store.delete(nodeId);
}

/** Mark nodes as offline if no report in the last 30 seconds */
export function markStaleNodesOffline(): void {
  const threshold = 30 * 1000; // 30 seconds
  const now = Date.now();
  for (const nh of store.values()) {
    if (nh.node.online) {
      const lastUpdate = new Date(nh.node.updatedAt).getTime();
      if (now - lastUpdate > threshold) {
        nh.node.online = false;
      }
    }
  }
}

/** Load latest snapshots from DB on server startup */
export function initStoreFromDb(): void {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ms.node_id, ms.snapshot_json, mn.hostname
    FROM monitor_snapshots ms
    JOIN monitor_nodes mn ON mn.id = ms.node_id
    WHERE mn.is_active = 1
  `).all() as { node_id: number; snapshot_json: string; hostname: string }[];

  for (const row of rows) {
    try {
      const snapshot: NodeSnapshot = JSON.parse(row.snapshot_json);
      snapshot.online = false; // Will be set to true on next report
      const now = formatTime(new Date());
      const nics = snapshot.nics || [];
      store.set(row.node_id, {
        nodeId: row.node_id,
        node: snapshot,
        cpuHistory: [snapshot.cpuUsagePct],
        gpuHistories: snapshot.gpus.map((g) => [g.utilizationPct]),
        nicRxHistories: nics.map((n) => [n.rxMbps]),
        nicTxHistories: nics.map((n) => [n.txMbps]),
        networkRxHistory: [snapshot.networkRxMbps],
        networkTxHistory: [snapshot.networkTxMbps],
        timestamps: [now],
      });
    } catch {
      // Skip corrupted snapshots
    }
  }
}

// Run stale check every 15 seconds
setInterval(markStaleNodesOffline, 15_000);
