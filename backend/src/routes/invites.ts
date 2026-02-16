import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /api/admin/invites - Create invite
router.post('/', requireAdmin, (req: Request, res: Response) => {
  const { expiresAt, maxUses = 1, note = '' } = req.body;

  if (!expiresAt) {
    return res.status(400).json({ error: 'expiresAt is required' });
  }

  const db = getDb();
  const token = uuidv4();

  const result = db.prepare(
    'INSERT INTO invites (token, expires_at, max_uses, note, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(token, expiresAt, maxUses, note, req.session.userId);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'create_invite', JSON.stringify({ inviteId: result.lastInsertRowid }), req.ip);

  return res.json({
    id: result.lastInsertRowid,
    token,
    expiresAt,
    maxUses,
    note,
  });
});

// GET /api/admin/invites - 只列出仍有效的邀請（未過期、未用完）
router.get('/', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const invites = db.prepare(
    `SELECT i.*, u.username as created_by_name
     FROM invites i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.used_count < i.max_uses AND i.expires_at > datetime('now')
     ORDER BY i.created_at DESC`
  ).all();
  return res.json(invites);
});

// DELETE /api/admin/invites/:id — 停用邀請連結（設為過期），不刪除已有的申請記錄
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id;

  const invite = db.prepare('SELECT id FROM invites WHERE id = ?').get(id);
  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  // 設為已過期，連結即失效
  db.prepare("UPDATE invites SET expires_at = datetime('now') WHERE id = ?").run(id);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'expire_invite', JSON.stringify({ inviteId: id }), req.ip);

  return res.json({ ok: true });
});

export default router;
