import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';
import { invalidateSettingCache } from '../utils/settings';

const router = Router();

// GET /api/admin/settings/system — batch fetch system settings
router.get('/system', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const keys = ['session_timeout_minutes', 'terminal_idle_timeout_minutes', 'terminal_max_sessions'];
  const defaults: Record<string, string> = {
    session_timeout_minutes: '20',
    terminal_idle_timeout_minutes: '30',
    terminal_max_sessions: '2',
  };

  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    result[key] = row?.value ?? defaults[key];
  }

  return res.json(result);
});

// GET /api/admin/settings/:key
router.get('/:key', requireAdmin, (req: Request, res: Response) => {
  const key = req.params.key as string;
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;

  if (!row) {
    return res.status(404).json({ error: 'Setting not found' });
  }

  return res.json({ key, value: row.value });
});

// --- Public branding endpoint (no auth, used by login page & sidebar) ---
export const brandingRouter = Router();

brandingRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const nameRow = db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get() as { value: string } | undefined;
  const logoRow = db.prepare("SELECT value FROM settings WHERE key = 'site_logo'").get() as { value: string } | undefined;
  const faviconRow = db.prepare("SELECT value FROM settings WHERE key = 'site_favicon'").get() as { value: string } | undefined;
  const navRow = db.prepare("SELECT value FROM settings WHERE key = 'sidebar_nav'").get() as { value: string } | undefined;

  let sidebarNav = [
    { label: 'Lab 使用教學', to: '/docs/lab-guide', icon: 'i-carbon-document' },
    { label: 'Terminal', to: '/terminal', icon: 'i-carbon-terminal' },
    { label: 'Monitoring', to: '/monitoring', icon: 'i-carbon-dashboard' },
    { label: '成員名冊', to: '/members', icon: 'i-carbon-group' },
    { label: 'VPN 管理', to: 'vpn', icon: 'i-carbon-vpn' },
  ];
  if (navRow?.value) {
    try { sidebarNav = JSON.parse(navRow.value); } catch {}
  }

  return res.json({
    siteName: nameRow?.value || 'Lab Portal',
    siteLogo: logoRow?.value || '',
    siteFavicon: faviconRow?.value || '',
    sidebarNav,
  });
});

// PUT /api/admin/settings/:key
router.put('/:key', requireAdmin, (req: Request, res: Response) => {
  const key = req.params.key as string;
  const { value } = req.body;

  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value is required' });
  }

  const db = getDb();
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value);

  // Invalidate cache so the new value takes effect immediately
  invalidateSettingCache(key);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'update_setting', JSON.stringify({ key }), req.ip);

  return res.json({ ok: true });
});

// POST /api/admin/settings/test-email - Send test email
router.post('/test-email', requireAdmin, async (req: Request, res: Response) => {
  const { to } = req.body;

  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: '請輸入收件人 Email' });
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'SMTP 尚未設定（請在 .env 設定 SMTP_HOST, SMTP_USER, SMTP_PASS）' });
  }

  // Get email template
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'approve_email'").get() as { value: string } | undefined;
  if (!row) {
    return res.status(400).json({ error: '信件模板尚未建立' });
  }

  const template = JSON.parse(row.value) as { subject: string; body: string };
  const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

  // Replace with sample data
  const sampleVars: Record<string, string> = {
    name: '測試用戶',
    username: 'testuser',
    password: 'TestPass123',
    url: siteUrl,
  };
  const replace = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] ?? '');

  const subject = `[測試] ${replace(template.subject)}`;
  const body = replace(template.body);
  const from = process.env.SMTP_FROM || user || 'noreply@lab.local';

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transport.sendMail({ from, to, subject, text: body });

    // Audit
    db.prepare(
      'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
    ).run(req.session.userId, 'test_email', JSON.stringify({ to }), req.ip);

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: `寄信失敗：${err.message}` });
  }
});

export default router;
