import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';
import { addIpaGroupMember, removeIpaGroupMember, disableIpaUser, enableIpaUser, deleteIpaUser, updateIpaUser } from '../utils/freeipa';
import { authenticateLdap, authenticatePam } from './auth';

const router = Router();

// GET /api/admin/users - List users
router.get('/', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, student_id, display_name, email, role, source, is_active, is_hidden, created_at, last_login_at FROM users ORDER BY created_at DESC'
  ).all();
  return res.json(users);
});

const USERNAME_REGEX = /^[a-z_][a-z0-9_-]{0,30}$/;

// PATCH /api/admin/users/:id - Update user
router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { role, is_active, is_hidden, display_name, email, username, student_id } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Validate and handle username rename
  if (username !== undefined && username !== user.username) {
    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: 'Username 只能以小寫英文或底線開頭，包含小寫英文、數字、底線、連字號，最多 32 字元' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
    if (existing) {
      return res.status(409).json({ error: '帳號名稱已被使用' });
    }
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

  // Sync username/email/student_id to FreeIPA (for LDAP users)
  const ipaUpdates: { newUsername?: string; email?: string; studentId?: string } = {};
  if (username !== undefined && username !== user.username) ipaUpdates.newUsername = username;
  if (email !== undefined && email !== user.email) ipaUpdates.email = email;
  if (student_id !== undefined && student_id !== user.student_id) ipaUpdates.studentId = student_id;

  if (user.source === 'ldap' && Object.keys(ipaUpdates).length > 0) {
    try {
      await updateIpaUser(user.username, ipaUpdates);
    } catch (err: any) {
      console.error('FreeIPA user update failed:', err.message);
      return res.status(500).json({ error: 'FreeIPA 帳號更新失敗: ' + err.message });
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
  if (is_hidden !== undefined) {
    updates.push('is_hidden = ?');
    values.push(is_hidden ? 1 : 0);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    values.push(display_name);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    values.push(email);
  }
  if (username !== undefined) {
    updates.push('username = ?');
    values.push(username);
  }
  if (student_id !== undefined) {
    updates.push('student_id = ?');
    values.push(student_id);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // If username changed, sync registration_requests table
  if (username !== undefined && username !== user.username) {
    db.prepare(
      "UPDATE registration_requests SET desired_username = ? WHERE desired_username = ? AND status = 'approved'"
    ).run(username, user.username);
  }

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'update_user', JSON.stringify({ targetUserId: req.params.id, updates: req.body }), req.ip);

  return res.json({ ok: true });
});

// DELETE /api/admin/users/:id - Delete user permanently
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { password } = req.body;
  const db = getDb();

  if (!password) {
    return res.status(400).json({ error: '請輸入密碼' });
  }

  // Verify admin's own password
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) as any;
  if (!admin) {
    return res.status(401).json({ error: '驗證失敗' });
  }

  let verified = false;
  if (admin.source === 'ldap') {
    verified = await authenticateLdap(admin.username, password);
  } else {
    verified = await authenticatePam(admin.username, password);
  }
  if (!verified) {
    return res.status(403).json({ error: '密碼錯誤' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent self-deletion
  if (user.id === req.session.userId) {
    return res.status(400).json({ error: '不能刪除自己的帳號' });
  }

  // Delete FreeIPA account for LDAP users (ignore "not found" errors)
  if (user.source === 'ldap') {
    try {
      await deleteIpaUser(user.username);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('not found')) {
        console.warn('FreeIPA user already gone:', msg);
      } else {
        console.error('FreeIPA user deletion failed:', msg);
        return res.status(500).json({ error: 'FreeIPA 帳號刪除失敗: ' + msg });
      }
    }
  }

  // Delete home directory via SSH to bastion
  const bastionHost = process.env.BASTION_HOST;
  const bastionKey = process.env.BASTION_PRIVATE_KEY_PATH;
  if (bastionHost && bastionKey) {
    try {
      const safeUsername = user.username.replace(/[^a-zA-Z0-9._-]/g, '');
      execSync(
        `ssh -i ${bastionKey} -o StrictHostKeyChecking=no root@${bastionHost} "rm -rf /home/${safeUsername}"`,
        { timeout: 15000 },
      );
    } catch (err: any) {
      console.error('Home directory deletion failed:', err.message);
      // Continue with DB deletion even if home dir removal fails
    }
  }

  // Audit first (before deleting the user record)
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'delete_user', JSON.stringify({ username: user.username, source: user.source }), req.ip);

  // Nullify foreign key references before deleting user
  db.prepare('UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = ?').run(user.id);
  db.prepare('UPDATE uploads SET created_by = NULL WHERE created_by = ?').run(user.id);
  db.prepare('UPDATE doc_versions SET created_by = NULL WHERE created_by = ?').run(user.id);
  db.prepare('UPDATE invites SET created_by = NULL WHERE created_by = ?').run(user.id);
  db.prepare('UPDATE registration_requests SET reviewed_by = NULL WHERE reviewed_by = ?').run(user.id);
  db.prepare('UPDATE proxy_rules SET created_by = NULL WHERE created_by = ?').run(user.id);

  // Delete from DB
  db.prepare("DELETE FROM registration_requests WHERE desired_username = ? AND status = 'approved'").run(user.username);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

  return res.json({ ok: true });
});

export default router;
