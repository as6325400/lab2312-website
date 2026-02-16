import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin, requireNodeToken } from '../middlewares/auth';
import { getDb } from '../db/schema';
import { pushSnapshot, getAll, getNode, removeNode, initStoreFromDb, type NodeSnapshot } from '../services/monitorStore';

const router = Router();

// Initialize store from DB on first import
initStoreFromDb();

// ── Exporter Endpoints ─────────────────────────────────────

// POST /api/monitoring/register — Exporter registers itself
router.post('/register', (req: Request, res: Response) => {
  const { hostname, capabilities } = req.body;
  if (!hostname || typeof hostname !== 'string') {
    return res.status(400).json({ error: 'hostname is required' });
  }
  if (!capabilities || typeof capabilities !== 'object') {
    return res.status(400).json({ error: 'capabilities object is required' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM monitor_nodes WHERE hostname = ?')
    .get(hostname) as { id: number } | undefined;

  if (existing) {
    return res.status(409).json({
      status: 'already_registered',
      error: `Node "${hostname}" is already registered. Ask admin to delete or reset token.`,
    });
  }

  const token = crypto.randomUUID();
  const capJson = JSON.stringify(capabilities);
  const ip = req.ip || '';

  // New registration
  const result = db.prepare(
    'INSERT INTO monitor_nodes (hostname, token, ip, capabilities_json) VALUES (?, ?, ?, ?)'
  ).run(hostname, token, ip, capJson);

  return res.json({
    status: 'registered',
    token,
    nodeId: result.lastInsertRowid,
    message: 'Registered successfully. Config may be pending admin setup.',
  });
});

// GET /api/monitoring/config — Exporter pulls its monitoring config
router.get('/config', requireNodeToken, (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT config_json FROM monitor_nodes WHERE id = ?')
    .get(req.nodeId) as { config_json: string } | undefined;

  if (!row) {
    return res.status(404).json({ error: 'Node not found' });
  }

  try {
    const config = JSON.parse(row.config_json);
    return res.json(config);
  } catch {
    return res.json({});
  }
});

// POST /api/monitoring/report — Exporter sends snapshot
router.post('/report', requireNodeToken, (req: Request, res: Response) => {
  const snapshot = req.body as NodeSnapshot;
  if (!snapshot || !snapshot.hostname) {
    return res.status(400).json({ error: 'Invalid snapshot data' });
  }

  pushSnapshot(req.nodeId!, snapshot);

  // Return configVersion so exporter can detect config changes
  const db = getDb();
  const row = db.prepare('SELECT config_version FROM monitor_nodes WHERE id = ?')
    .get(req.nodeId!) as { config_version: number } | undefined;

  return res.json({ ok: true, configVersion: row?.config_version ?? 0 });
});

// ── Frontend Endpoints (authenticated users) ───────────────

// GET /api/monitoring/nodes — Get all nodes with history
router.get('/nodes', requireAuth, (_req: Request, res: Response) => {
  const db = getDb();
  // Build a nodeId → sort_order map for ordering
  const rows = db.prepare('SELECT id, sort_order FROM monitor_nodes').all() as { id: number; sort_order: number }[];
  const orderMap = new Map(rows.map(r => [r.id, r.sort_order]));

  const nodes = getAll();
  nodes.sort((a, b) => {
    const oa = orderMap.get(a.nodeId) ?? 999;
    const ob = orderMap.get(b.nodeId) ?? 999;
    return oa - ob;
  });
  return res.json({ nodes });
});

// GET /api/monitoring/nodes/:id — Get single node with history
router.get('/nodes/:id', requireAuth, (req: Request, res: Response) => {
  const nodeId = parseInt(String(req.params.id), 10);
  if (isNaN(nodeId)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }
  const nh = getNode(nodeId);
  if (!nh) {
    return res.status(404).json({ error: 'Node not found or no data yet' });
  }
  return res.json(nh);
});

// ── Admin Endpoints ────────────────────────────────────────

// GET /api/admin/monitoring/nodes — List all registered nodes (admin)
router.get('/admin/nodes', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const nodes = db.prepare(`
    SELECT id, hostname, token, ip, capabilities_json, config_json, sort_order, is_active, created_at, last_seen_at
    FROM monitor_nodes
    ORDER BY sort_order ASC, created_at ASC
  `).all();
  return res.json(nodes);
});

// PUT /api/admin/monitoring/nodes/:id/config — Update node monitoring config
router.put('/admin/nodes/:id/config', requireAdmin, (req: Request, res: Response) => {
  const nodeId = parseInt(String(req.params.id), 10);
  if (isNaN(nodeId)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  const db = getDb();
  const node = db.prepare('SELECT id FROM monitor_nodes WHERE id = ?').get(nodeId);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  const config = req.body;
  db.prepare('UPDATE monitor_nodes SET config_json = ?, config_version = config_version + 1 WHERE id = ?')
    .run(JSON.stringify(config), nodeId);

  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'monitor_node_config', JSON.stringify({ nodeId, config }), req.ip);

  return res.json({ ok: true });
});

// DELETE /api/admin/monitoring/nodes/:id — Delete (deactivate) node
router.delete('/admin/nodes/:id', requireAdmin, (req: Request, res: Response) => {
  const nodeId = parseInt(String(req.params.id), 10);
  if (isNaN(nodeId)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  const db = getDb();
  const node = db.prepare('SELECT id, hostname FROM monitor_nodes WHERE id = ?')
    .get(nodeId) as { id: number; hostname: string } | undefined;
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  db.prepare('DELETE FROM monitor_snapshots WHERE node_id = ?').run(nodeId);
  db.prepare('DELETE FROM monitor_nodes WHERE id = ?').run(nodeId);
  removeNode(nodeId);

  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'monitor_node_delete', JSON.stringify({ nodeId, hostname: node.hostname }), req.ip);

  return res.json({ ok: true });
});

// POST /api/admin/monitoring/nodes/:id/reset-token — Reset exporter token
router.post('/admin/nodes/:id/reset-token', requireAdmin, (req: Request, res: Response) => {
  const nodeId = parseInt(String(req.params.id), 10);
  if (isNaN(nodeId)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  const db = getDb();
  const node = db.prepare('SELECT id, hostname FROM monitor_nodes WHERE id = ?')
    .get(nodeId) as { id: number; hostname: string } | undefined;
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  const newToken = crypto.randomUUID();
  db.prepare('UPDATE monitor_nodes SET token = ? WHERE id = ?').run(newToken, nodeId);

  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'monitor_node_reset_token', JSON.stringify({ nodeId, hostname: node.hostname }), req.ip);

  return res.json({ ok: true, token: newToken });
});

// PUT /api/admin/monitoring/nodes/reorder — Reorder nodes
router.put('/admin/nodes/reorder', requireAdmin, (req: Request, res: Response) => {
  const { nodeIds } = req.body;
  if (!Array.isArray(nodeIds)) {
    return res.status(400).json({ error: 'nodeIds array is required' });
  }

  const db = getDb();
  const stmt = db.prepare('UPDATE monitor_nodes SET sort_order = ? WHERE id = ?');
  const updateAll = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => stmt.run(index, id));
  });
  updateAll(nodeIds);

  return res.json({ ok: true });
});

export default router;
