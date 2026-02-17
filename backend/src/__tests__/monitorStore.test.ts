import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB before importing store
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn().mockReturnValue([]);
vi.mock('../db/schema', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    })),
  })),
}));

// We need to re-import for each test to get clean store state.
// Since the store uses a module-level Map, we'll use dynamic import + resetModules.
import type { NodeSnapshot, NodeHistory } from '../services/monitorStore';

function makeSnapshot(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    hostname: 'test-node',
    ip: '10.0.0.1',
    online: false,
    updatedAt: '',
    cpuUsagePct: 50,
    cpuCores: 16,
    memoryUsedGB: 32,
    memoryTotalGB: 64,
    gpus: [],
    disks: [],
    nics: [],
    networkRxMbps: 10,
    networkTxMbps: 5,
    uptimeSeconds: 86400,
    processCount: 200,
    loadAvg: [1.0, 2.0, 3.0],
    ...overrides,
  };
}

describe('MonitorStore', () => {
  let pushSnapshot: typeof import('../services/monitorStore').pushSnapshot;
  let getAll: typeof import('../services/monitorStore').getAll;
  let getNode: typeof import('../services/monitorStore').getNode;
  let removeNode: typeof import('../services/monitorStore').removeNode;
  let markStaleNodesOffline: typeof import('../services/monitorStore').markStaleNodesOffline;

  beforeEach(async () => {
    vi.resetModules();
    mockRun.mockReset();
    mockGet.mockReset();
    mockGet.mockReturnValue({ id: 1 }); // default: snapshot exists in DB
    mockAll.mockReturnValue([]); // initStoreFromDb returns no rows

    const mod = await import('../services/monitorStore');
    pushSnapshot = mod.pushSnapshot;
    getAll = mod.getAll;
    getNode = mod.getNode;
    removeNode = mod.removeNode;
    markStaleNodesOffline = mod.markStaleNodesOffline;
  });

  it('creates NodeHistory on first push', () => {
    pushSnapshot(1, makeSnapshot());
    const nh = getNode(1);
    expect(nh).toBeDefined();
    expect(nh!.cpuHistory).toHaveLength(1);
    expect(nh!.cpuHistory[0]).toBe(50);
  });

  it('accumulates history on consecutive pushes', () => {
    for (let i = 0; i < 5; i++) {
      pushSnapshot(1, makeSnapshot({ cpuUsagePct: i * 10 }));
    }
    const nh = getNode(1);
    expect(nh!.cpuHistory).toHaveLength(5);
    expect(nh!.cpuHistory).toEqual([0, 10, 20, 30, 40]);
  });

  it('truncates history at HISTORY_LENGTH (120)', () => {
    for (let i = 0; i < 130; i++) {
      pushSnapshot(1, makeSnapshot({ cpuUsagePct: i }));
    }
    const nh = getNode(1);
    expect(nh!.cpuHistory).toHaveLength(120);
    // First element should be 10 (0-9 were shifted out)
    expect(nh!.cpuHistory[0]).toBe(10);
  });

  it('sets snapshot.online to true', () => {
    pushSnapshot(1, makeSnapshot());
    const nh = getNode(1);
    expect(nh!.node.online).toBe(true);
  });

  it('sets snapshot.updatedAt to valid ISO string', () => {
    pushSnapshot(1, makeSnapshot());
    const nh = getNode(1);
    expect(new Date(nh!.node.updatedAt).toISOString()).toBe(nh!.node.updatedAt);
  });

  it('handles GPU history growing and shrinking', () => {
    // Push with 2 GPUs
    pushSnapshot(1, makeSnapshot({
      gpus: [
        { index: 0, name: 'GPU0', utilizationPct: 80, memoryUsedMB: 1000, memoryTotalMB: 8000, temperatureC: 70, powerDrawW: 200, powerLimitW: 300 },
        { index: 1, name: 'GPU1', utilizationPct: 60, memoryUsedMB: 2000, memoryTotalMB: 8000, temperatureC: 65, powerDrawW: 180, powerLimitW: 300 },
      ],
    }));
    let nh = getNode(1);
    expect(nh!.gpuHistories).toHaveLength(2);

    // Push with 1 GPU — should shrink
    pushSnapshot(1, makeSnapshot({
      gpus: [
        { index: 0, name: 'GPU0', utilizationPct: 90, memoryUsedMB: 1000, memoryTotalMB: 8000, temperatureC: 72, powerDrawW: 210, powerLimitW: 300 },
      ],
    }));
    nh = getNode(1);
    expect(nh!.gpuHistories).toHaveLength(1);
  });

  it('handles NIC history growing and shrinking', () => {
    pushSnapshot(1, makeSnapshot({
      nics: [
        { name: 'eth0', ipv4: '10.0.0.1', rxMbps: 100, txMbps: 50 },
        { name: 'eth1', ipv4: '10.0.0.2', rxMbps: 200, txMbps: 100 },
        { name: 'eth2', ipv4: '10.0.0.3', rxMbps: 50, txMbps: 25 },
      ],
    }));
    let nh = getNode(1);
    expect(nh!.nicRxHistories).toHaveLength(3);

    // Shrink to 2 NICs
    pushSnapshot(1, makeSnapshot({
      nics: [
        { name: 'eth0', ipv4: '10.0.0.1', rxMbps: 110, txMbps: 55 },
        { name: 'eth1', ipv4: '10.0.0.2', rxMbps: 210, txMbps: 105 },
      ],
    }));
    nh = getNode(1);
    expect(nh!.nicRxHistories).toHaveLength(2);
    expect(nh!.nicTxHistories).toHaveLength(2);
  });

  it('getAll returns all nodes', () => {
    pushSnapshot(1, makeSnapshot({ hostname: 'node-1' }));
    pushSnapshot(2, makeSnapshot({ hostname: 'node-2' }));
    pushSnapshot(3, makeSnapshot({ hostname: 'node-3' }));
    expect(getAll()).toHaveLength(3);
  });

  it('getNode returns correct node', () => {
    pushSnapshot(1, makeSnapshot({ hostname: 'node-1' }));
    pushSnapshot(2, makeSnapshot({ hostname: 'node-2' }));
    expect(getNode(1)!.node.hostname).toBe('node-1');
    expect(getNode(2)!.node.hostname).toBe('node-2');
    expect(getNode(999)).toBeUndefined();
  });

  it('removeNode deletes node from store', () => {
    pushSnapshot(1, makeSnapshot());
    expect(getNode(1)).toBeDefined();
    removeNode(1);
    expect(getNode(1)).toBeUndefined();
  });

  it('markStaleNodesOffline marks nodes offline after 30s', () => {
    pushSnapshot(1, makeSnapshot());
    const nh = getNode(1)!;
    // Manually set updatedAt to 31 seconds ago
    nh.node.updatedAt = new Date(Date.now() - 31000).toISOString();
    markStaleNodesOffline();
    expect(nh.node.online).toBe(false);
  });

  it('markStaleNodesOffline keeps recent nodes online', () => {
    pushSnapshot(1, makeSnapshot());
    const nh = getNode(1)!;
    // updatedAt was just set by pushSnapshot, should be recent
    markStaleNodesOffline();
    expect(nh.node.online).toBe(true);
  });

  it('accumulates networkRxHistory and networkTxHistory', () => {
    pushSnapshot(1, makeSnapshot({ networkRxMbps: 100, networkTxMbps: 50 }));
    pushSnapshot(1, makeSnapshot({ networkRxMbps: 200, networkTxMbps: 80 }));
    pushSnapshot(1, makeSnapshot({ networkRxMbps: 150, networkTxMbps: 60 }));
    const nh = getNode(1)!;
    expect(nh.networkRxHistory).toEqual([100, 200, 150]);
    expect(nh.networkTxHistory).toEqual([50, 80, 60]);
  });
});
