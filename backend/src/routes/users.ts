import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';
import { addIpaGroupMember, removeIpaGroupMember, disableIpaUser, enableIpaUser } from '../utils/freeipa';

const router = Router();

// GET /api/admin/users - List users
router.get('/', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, display_name, email, role, source, is_active, created_at, last_login_at FROM users ORDER BY created_at DESC'
  ).all();
  return res.json(users);
});

// PATCH /api/admin/users/:id - Update user
router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { role, is_active, display_name, email } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Sync role change to FreeIPA admins group (for LDAP users)
  if (role !== undefined && ['user', 'admin'].includes(role) && role !== user.role && user.source === 'ldap') {
    try {
      if (role === 'admin') {
        await addIpaGroupMember('admins', user.username);
      } else {
        await removeIpaGroupMember('admins', user.username);
      }
    } catch (err: any) {
      console.error('FreeIPA group sync failed:', err.message);
      return res.status(500).json({ error: 'FreeIPA 群組同步失敗: ' + err.message });
    }
  }

  // Sync active status to FreeIPA (for LDAP users)
  if (is_active !== undefined && is_active !== Boolean(user.is_active) && user.source === 'ldap') {
    try {
      if (is_active) {
        await enableIpaUser(user.username);
      } else {
        await disableIpaUser(user.username);
      }
    } catch (err: any) {
      console.error('FreeIPA user status sync failed:', err.message);
      return res.status(500).json({ error: 'FreeIPA 帳號狀態同步失敗: ' + err.message });
    }
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (role !== undefined && ['user', 'admin'].includes(role)) {
    updates.push('role = ?');
    values.push(role);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    values.push(display_name);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    values.push(email);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'update_user', JSON.stringify({ targetUserId: req.params.id, updates: req.body }), req.ip);

  return res.json({ ok: true });
});

export default router;
