import { describe, it, expect } from 'vitest';
import type { NodeSnapshot } from '../services/monitorStore';

// These tests validate the snapshot format and registration logic
// without needing a running server. They test the data contract.

function makeValidSnapshot(): NodeSnapshot {
  return {
    hostname: 'gpu-node-1',
    ip: '10.0.1.11',
    online: true,
    updatedAt: new Date().toISOString(),
    cpuUsagePct: 65.2,
    cpuCores: 32,
    memoryUsedGB: 83.2,
    memoryTotalGB: 128,
    gpus: [
      {
        index: 0,
        name: 'NVIDIA RTX 4090',
        utilizationPct: 75,
        memoryUsedMB: 18000,
        memoryTotalMB: 24576,
        temperatureC: 72,
        powerDrawW: 380,
        powerLimitW: 450,
      },
    ],
    disks: [{ mount: '/', totalGB: 500, usedGB: 180 }],
    nics: [{ name: 'eth0', ipv4: '10.0.1.11', rxMbps: 120.5, txMbps: 45.3 }],
    networkRxMbps: 120.5,
    networkTxMbps: 45.3,
    uptimeSeconds: 1382400,
    processCount: 340,
    loadAvg: [20.8, 18.7, 17.7],
  };
}

describe('Snapshot Format Validation', () => {
  it('valid snapshot has all required fields', () => {
    const snap = makeValidSnapshot();
    expect(snap.hostname).toBeDefined();
    expect(snap.ip).toBeDefined();
    expect(typeof snap.cpuUsagePct).toBe('number');
    expect(typeof snap.cpuCores).toBe('number');
    expect(typeof snap.memoryUsedGB).toBe('number');
    expect(typeof snap.memoryTotalGB).toBe('number');
    expect(typeof snap.networkRxMbps).toBe('number');
    expect(typeof snap.networkTxMbps).toBe('number');
    expect(typeof snap.uptimeSeconds).toBe('number');
    expect(typeof snap.processCount).toBe('number');
    expect(Array.isArray(snap.loadAvg)).toBe(true);
    expect(snap.loadAvg).toHaveLength(3);
  });

  it('snapshot with empty gpus is valid', () => {
    const snap = makeValidSnapshot();
    snap.gpus = [];
    expect(snap.gpus).toHaveLength(0);
    expect(snap.hostname).toBeDefined(); // still valid
  });

  it('snapshot with empty nics is valid', () => {
    const snap = makeValidSnapshot();
    snap.nics = [];
    expect(snap.nics).toHaveLength(0);
    expect(snap.hostname).toBeDefined();
  });

  it('snapshot with undefined nics falls back to empty (runtime check)', () => {
    const snap = makeValidSnapshot();
    // Simulate old exporter that doesn't send nics
    (snap as any).nics = undefined;
    const nics = snap.nics || [];
    expect(nics).toHaveLength(0);
  });

  it('GPU fields are well-typed', () => {
    const snap = makeValidSnapshot();
    const gpu = snap.gpus[0]!;
    expect(typeof gpu.index).toBe('number');
    expect(typeof gpu.name).toBe('string');
    expect(typeof gpu.utilizationPct).toBe('number');
    expect(typeof gpu.memoryUsedMB).toBe('number');
    expect(typeof gpu.memoryTotalMB).toBe('number');
    expect(typeof gpu.temperatureC).toBe('number');
    expect(typeof gpu.powerDrawW).toBe('number');
    expect(typeof gpu.powerLimitW).toBe('number');
  });

  it('disk fields are well-typed', () => {
    const snap = makeValidSnapshot();
    const disk = snap.disks[0]!;
    expect(typeof disk.mount).toBe('string');
    expect(typeof disk.totalGB).toBe('number');
    expect(typeof disk.usedGB).toBe('number');
  });

  it('NIC fields are well-typed', () => {
    const snap = makeValidSnapshot();
    const nic = snap.nics[0]!;
    expect(typeof nic.name).toBe('string');
    expect(typeof nic.rxMbps).toBe('number');
    expect(typeof nic.txMbps).toBe('number');
  });
});

describe('Registration Secret Logic', () => {
  // Pure logic tests for secret verification without requiring Express

  function verifySecret(requiredSecret: string, providedSecret?: string): boolean {
    if (requiredSecret && requiredSecret !== providedSecret) return false;
    return true;
  }

  it('passes when no secret is required', () => {
    expect(verifySecret('', undefined)).toBe(true);
    expect(verifySecret('', 'anything')).toBe(true);
  });

  it('passes when correct secret is provided', () => {
    expect(verifySecret('my-secret', 'my-secret')).toBe(true);
  });

  it('fails when wrong secret is provided', () => {
    expect(verifySecret('my-secret', 'wrong')).toBe(false);
  });

  it('fails when secret is required but not provided', () => {
    expect(verifySecret('my-secret', undefined)).toBe(false);
  });

  it('passes when secret is empty string (not set)', () => {
    expect(verifySecret('', '')).toBe(true);
  });
});

describe('Node Reorder Logic', () => {
  it('produces correct sort_order mapping', () => {
    const nodeIds = [5, 2, 8, 1];
    const expected = nodeIds.map((id, index) => ({ id, sort_order: index }));
    expect(expected).toEqual([
      { id: 5, sort_order: 0 },
      { id: 2, sort_order: 1 },
      { id: 8, sort_order: 2 },
      { id: 1, sort_order: 3 },
    ]);
  });

  it('empty array produces no updates', () => {
    const nodeIds: number[] = [];
    const updates = nodeIds.map((id, index) => ({ id, sort_order: index }));
    expect(updates).toHaveLength(0);
  });

  it('single node gets sort_order 0', () => {
    const nodeIds = [42];
    const updates = nodeIds.map((id, index) => ({ id, sort_order: index }));
    expect(updates).toEqual([{ id: 42, sort_order: 0 }]);
  });

  it('sort function orders by sort_order correctly', () => {
    const nodes = [
      { nodeId: 1, sortOrder: 2 },
      { nodeId: 2, sortOrder: 0 },
      { nodeId: 3, sortOrder: 1 },
    ];
    const orderMap = new Map(nodes.map(n => [n.nodeId, n.sortOrder]));
    const sorted = [...nodes].sort((a, b) =>
      (orderMap.get(a.nodeId) ?? 999) - (orderMap.get(b.nodeId) ?? 999)
    );
    expect(sorted.map(n => n.nodeId)).toEqual([2, 3, 1]);
  });
});
