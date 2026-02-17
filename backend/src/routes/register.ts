import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';
import { sendApproveEmail, sendRegistrationNotifyEmail } from '../utils/mailer';
import { createIpaUser } from '../utils/freeipa';
import { generatePassword } from '../utils/password';

const router = Router();

// GET /api/register/validate?token=... (public)
router.get('/validate', (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  const db = getDb();
  const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token as string) as any;

  if (!invite) {
    return res.status(404).json({ error: 'Invalid token' });
  }

  const now = new Date().toISOString();
  if (invite.expires_at < now) {
    return res.status(410).json({ error: 'Token expired' });
  }

  if (invite.used_count >= invite.max_uses) {
    return res.status(410).json({ error: 'Token usage limit reached' });
  }

  return res.json({ valid: true, note: invite.note });
});

// POST /api/register - Submit registration (public with valid token)
router.post('/', async (req: Request, res: Response) => {
  const { token, name, email, username, studentId } = req.body;

  if (!token || !name || !email || !username) {
    return res.status(400).json({ error: 'token, name, email, and username are required' });
  }

  const db = getDb();

  // Validate token
  const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token) as any;
  if (!invite) {
    return res.status(404).json({ error: 'Invalid token' });
  }

  const now = new Date().toISOString();
  if (invite.expires_at < now) {
    return res.status(410).json({ error: 'Token expired' });
  }
  if (invite.used_count >= invite.max_uses) {
    return res.status(410).json({ error: 'Token usage limit reached' });
  }

  // Check username not taken
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // Check no pending request with same username
  const existingReq = db.prepare(
    "SELECT id FROM registration_requests WHERE desired_username = ? AND status = 'pending'"
  ).get(username);
  if (existingReq) {
    return res.status(409).json({ error: 'A pending request with this username already exists' });
  }

  // Create registration request
  const result = db.prepare(
    `INSERT INTO registration_requests (token_id, name, email, desired_username, student_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(invite.id, name, email, username, studentId || '');

  // Increment token usage
  db.prepare('UPDATE invites SET used_count = used_count + 1 WHERE id = ?').run(invite.id);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(null, 'register_request', JSON.stringify({ requestId: result.lastInsertRowid, username }), req.ip);

  // 通知管理員有新申請
  try {
    await sendRegistrationNotifyEmail({ name, email, username, studentId: studentId || '' });
  } catch (err: any) {
    console.error('Send registration notify email failed:', err.message);
  }

  return res.json({ ok: true, id: result.lastInsertRowid });
});

// GET /api/admin/requests - List registration requests
router.get('/', requireAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const status = req.query.status || 'pending';
  const requests = db.prepare(
    `SELECT rr.*, i.token as invite_token, u.username as reviewer_name
     FROM registration_requests rr
     LEFT JOIN invites i ON i.id = rr.token_id
     LEFT JOIN users u ON u.id = rr.reviewed_by
     WHERE rr.status = ?
     ORDER BY rr.created_at DESC`
  ).all(status as string);
  return res.json(requests);
});

// POST /api/admin/requests/:id/approve
router.post('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  const { role = 'user', note } = req.body;
  const db = getDb();

  const request = db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request already processed' });
  }

  // 自動產生隨機密碼
  const password = generatePassword();

  // 透過 FreeIPA API 建立帳號（含 Kerberos principal）
  try {
    await createIpaUser({
      username: request.desired_username,
      password,
      displayName: request.name,
      email: request.email,
      studentId: request.student_id || undefined,
    });
  } catch (err: any) {
    console.error('FreeIPA create user failed:', err);
    return res.status(500).json({ error: 'Failed to create FreeIPA account: ' + err.message });
  }

  // Create portal user
  db.prepare(
    'INSERT INTO users (username, display_name, email, role, source) VALUES (?, ?, ?, ?, ?)'
  ).run(request.desired_username, request.name, request.email, role, 'ldap');

  // Update request
  db.prepare(
    `UPDATE registration_requests
     SET status = 'approved', admin_note = ?, reviewed_at = datetime('now'), reviewed_by = ?
     WHERE id = ?`
  ).run(note || null, req.session.userId, req.params.id);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'approve_request', JSON.stringify({ requestId: req.params.id, ldapCreated: true }), req.ip);

  // 寄送通知信（含隨機密碼）
  let emailSent = false;
  try {
    await sendApproveEmail({
      to: request.email,
      name: request.name,
      username: request.desired_username,
      password,
    });
    emailSent = true;
  } catch (err: any) {
    console.error('Send approve email failed:', err.message);
  }

  return res.json({ ok: true, emailSent });
});

// POST /api/admin/requests/:id/reject
router.post('/:id/reject', requireAdmin, (req: Request, res: Response) => {
  const { reason } = req.body;
  const db = getDb();

  const request = db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request already processed' });
  }

  db.prepare(
    `UPDATE registration_requests
     SET status = 'rejected', admin_note = ?, reviewed_at = datetime('now'), reviewed_by = ?
     WHERE id = ?`
  ).run(reason || null, req.session.userId, req.params.id);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'reject_request', JSON.stringify({ requestId: req.params.id }), req.ip);

  return res.json({ ok: true });
});

export default router;
