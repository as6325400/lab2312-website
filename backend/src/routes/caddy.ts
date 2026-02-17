import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middlewares/auth';
import { getDb } from '../db/schema';
import { generateCaddyfile, validateDomain, validateTarget, type ProxyRule } from '../utils/caddyfile';
import fs from 'fs';
import path from 'path';

const router = Router();

const CADDY_CONF_DIR = process.env.CADDY_CONF_DIR || '/etc/caddy';
const CADDY_CONTAINER = process.env.CADDY_CONTAINER_NAME || 'lab-caddy';
const DASHBOARD_DOMAIN = process.env.DASHBOARD_DOMAIN || 'dashboard.example.com';

// Docker exec helper — 透過 Docker socket 在 caddy container 執行指令
async function caddyExec(cmd: string[]): Promise<{ exitCode: number; output: string }> {
  const Docker = require('dockerode');
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const container = docker.getContainer(CADDY_CONTAINER);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ Tty: false });

  return new Promise((resolve, reject) => {
    let output = '';

    docker.modem.demuxStream(
      stream,
      { write: (chunk: any) => { output += chunk.toString(); } },
      { write: (chunk: any) => { output += chunk.toString(); } },
    );

    stream.on('end', async () => {
      try {
        const info = await exec.inspect();
        resolve({ exitCode: info.ExitCode, output: output.trim() });
      } catch (e) {
        reject(e);
      }
    });

    stream.on('error', reject);
  });
}

async function regenerateAndReload(): Promise<{ success: boolean; output: string }> {
  const db = getDb();
  const rules = db.prepare('SELECT * FROM proxy_rules ORDER BY domain ASC').all() as ProxyRule[];
  const content = generateCaddyfile(rules);

  // Write Caddyfile
  const filePath = path.join(CADDY_CONF_DIR, 'Caddyfile');
  fs.writeFileSync(filePath, content, 'utf-8');

  // Validate
  const validateResult = await caddyExec(['caddy', 'validate', '--config', '/etc/caddy/Caddyfile']);
  if (validateResult.exitCode !== 0) {
    return { success: false, output: 'Validation failed: ' + validateResult.output };
  }

  // Reload
  const reloadResult = await caddyExec(['caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
  if (reloadResult.exitCode !== 0) {
    return { success: false, output: 'Reload failed: ' + reloadResult.output };
  }

  return { success: true, output: 'Caddy reloaded successfully' };
}

// ── Proxy Rules CRUD ────────────────────────────────────────

// GET /api/admin/caddy/rules — 列出所有 proxy rules
router.get('/rules', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();
  const rules = db.prepare(
    `SELECT pr.*, u.username as created_by_name
     FROM proxy_rules pr
     LEFT JOIN users u ON u.id = pr.created_by
     ORDER BY pr.domain ASC`
  ).all();
  return res.json(rules);
});

// POST /api/admin/caddy/rules — 建立新 rule
router.post('/rules', requireAdmin, async (req: Request, res: Response) => {
  const { domain, target, description = '' } = req.body;

  const domainErr = validateDomain(domain, DASHBOARD_DOMAIN);
  if (domainErr) return res.status(400).json({ error: domainErr });
  const targetErr = validateTarget(target);
  if (targetErr) return res.status(400).json({ error: targetErr });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM proxy_rules WHERE domain = ?').get(domain);
  if (existing) {
    return res.status(409).json({ error: '此域名已存在' });
  }

  const result = db.prepare(
    'INSERT INTO proxy_rules (domain, target, description, created_by) VALUES (?, ?, ?, ?)'
  ).run(domain, target, description, req.session.userId);

  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'proxy_rule_create', JSON.stringify({ domain, target }), req.ip);

  try {
    const reload = await regenerateAndReload();
    return res.json({ id: result.lastInsertRowid, ok: true, ...reload });
  } catch (err: any) {
    return res.json({ id: result.lastInsertRowid, ok: true, warning: 'Rule saved but reload failed: ' + err.message });
  }
});

// PUT /api/admin/caddy/rules/:id — 更新 rule
router.put('/rules/:id', requireAdmin, async (req: Request, res: Response) => {
  const { domain, target, description, is_enabled } = req.body;
  const db = getDb();

  const rule = db.prepare('SELECT * FROM proxy_rules WHERE id = ?').get(req.params.id) as any;
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (domain !== undefined) {
    const domainErr2 = validateDomain(domain, DASHBOARD_DOMAIN);
    if (domainErr2) return res.status(400).json({ error: domainErr2 });
    const dup = db.prepare('SELECT id FROM proxy_rules WHERE domain = ? AND id != ?').get(domain, req.params.id);
    if (dup) {
      return res.status(409).json({ error: '此域名已存在' });
    }
    updates.push('domain = ?');
    values.push(domain);
  }
  if (target !== undefined) {
    const targetErr2 = validateTarget(target);
    if (targetErr2) return res.status(400).json({ error: targetErr2 });
    updates.push('target = ?');
    values.push(target);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (is_enabled !== undefined) {
    updates.push('is_enabled = ?');
    values.push(is_enabled ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: '沒有需要更新的欄位' });
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE proxy_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'proxy_rule_update', JSON.stringify({ ruleId: req.params.id, changes: req.body }), req.ip);

  try {
    const reload = await regenerateAndReload();
    return res.json({ ok: true, ...reload });
  } catch (err: any) {
    return res.json({ ok: true, warning: 'Rule updated but reload failed: ' + err.message });
  }
});

// DELETE /api/admin/caddy/rules/:id — 刪除 rule
router.delete('/rules/:id', requireAdmin, async (req: Request, res: Response) => {
  const db = getDb();

  const rule = db.prepare('SELECT * FROM proxy_rules WHERE id = ?').get(req.params.id) as any;
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  db.prepare('DELETE FROM proxy_rules WHERE id = ?').run(req.params.id);

  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'proxy_rule_delete', JSON.stringify({ domain: rule.domain, target: rule.target }), req.ip);

  try {
    const reload = await regenerateAndReload();
    return res.json({ ok: true, ...reload });
  } catch (err: any) {
    return res.json({ ok: true, warning: 'Rule deleted but reload failed: ' + err.message });
  }
});

// ── Raw Caddyfile CRUD（保留原有功能）────────────────────────

// GET /api/admin/caddy/config — 讀取 Caddyfile
router.get('/config', requireAdmin, (_req: Request, res: Response) => {
  try {
    const filePath = path.join(CADDY_CONF_DIR, 'Caddyfile');
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    return res.json({ content });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/caddy/config — 儲存 Caddyfile
router.put('/config', requireAdmin, (req: Request, res: Response) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    fs.writeFileSync(path.join(CADDY_CONF_DIR, 'Caddyfile'), content, 'utf-8');

    const db = getDb();
    db.prepare(
      'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
    ).run(req.session.userId, 'caddy_edit', '{}', req.ip);

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/caddy/validate — caddy validate
router.post('/validate', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await caddyExec(['caddy', 'validate', '--config', '/etc/caddy/Caddyfile']);
    return res.json({ success: result.exitCode === 0, output: result.output });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to connect to caddy container: ' + err.message });
  }
});

// POST /api/admin/caddy/reload — caddy reload
router.post('/reload', requireAdmin, async (req: Request, res: Response) => {
  try {
    // 先驗證設定
    const validateResult = await caddyExec(['caddy', 'validate', '--config', '/etc/caddy/Caddyfile']);
    if (validateResult.exitCode !== 0) {
      return res.status(400).json({ success: false, output: 'Config validation failed:\n' + validateResult.output });
    }

    const result = await caddyExec(['caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);

    const db = getDb();
    db.prepare(
      'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
    ).run(req.session.userId, 'caddy_reload', JSON.stringify({ exitCode: result.exitCode }), req.ip);

    return res.json({ success: result.exitCode === 0, output: result.output || 'Caddy reloaded successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reload: ' + err.message });
  }
});

// POST /api/admin/caddy/fmt — caddy fmt (格式化 Caddyfile)
router.post('/fmt', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await caddyExec(['caddy', 'fmt', '--overwrite', '/etc/caddy/Caddyfile']);
    if (result.exitCode !== 0) {
      return res.json({ success: false, output: result.output });
    }
    // 讀回格式化後的內容
    const filePath = path.join(CADDY_CONF_DIR, 'Caddyfile');
    const content = fs.readFileSync(filePath, 'utf-8');
    return res.json({ success: true, content, output: result.output || 'Formatted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
