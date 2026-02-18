import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAuth } from '../middlewares/auth';
import { changeIpaPassword } from '../utils/freeipa';

const router = Router();

// POST /api/auth/login
// 自動嘗試 LDAP → 失敗再嘗試 PAM，不需前端選擇
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  console.log(`[Login] attempt: username=${username}`);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    let authenticated = false;
    let source: 'ldap' | 'pam' = 'ldap';

    // 先嘗試 LDAP
    console.log(`[Login] trying LDAP for ${username}...`);
    authenticated = await authenticateLdap(username, password);
    console.log(`[Login] LDAP result: ${authenticated}`);

    // LDAP 失敗，改嘗試 PAM
    if (!authenticated) {
      source = 'pam';
      console.log(`[Login] trying PAM for ${username}...`);
      authenticated = await authenticatePam(username, password);
      console.log(`[Login] PAM result: ${authenticated}`);
    }

    if (!authenticated) {
      console.log(`[Login] FAILED for ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[Login] SUCCESS for ${username} via ${source}`);

    // 判斷角色：PAM 看 sudo/root group，LDAP 看 admins group
    let detectedRole: 'admin' | 'user' = 'user';
    if (source === 'pam') {
      detectedRole = await checkPamAdmin(username) ? 'admin' : 'user';
    } else if (source === 'ldap') {
      detectedRole = await checkLdapAdmin(username) ? 'admin' : 'user';
    }

    // Sync/create user in DB
    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (!user) {
      db.prepare(
        'INSERT INTO users (username, display_name, email, role, source) VALUES (?, ?, ?, ?, ?)'
      ).run(username, username, '', detectedRole, source);
      user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    } else {
      // 每次登入同步角色
      db.prepare('UPDATE users SET role = ?, source = ? WHERE id = ?').run(detectedRole, source, user.id);
      user.role = detectedRole;
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    // Audit log
    db.prepare(
      'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
    ).run(user.id, 'login', JSON.stringify({ source }), req.ip);

    return res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, ip) VALUES (?, ?, ?)'
  ).run(req.session.userId, 'logout', req.ip);

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) as any;
  if (!user) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
  });
});

// LDAP authentication
export async function authenticateLdap(username: string, password: string): Promise<boolean> {
  const ldapUrl = process.env.LDAP_URL;
  const baseDn = process.env.LDAP_BASE_DN;
  if (!ldapUrl || !baseDn) {
    console.warn('LDAP not configured');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const ldap = require('ldapjs');
      const client = ldap.createClient({
        url: ldapUrl,
        tlsOptions: { rejectUnauthorized: false },
      });

      const userDn = `uid=${username},${baseDn}`;
      client.bind(userDn, password, (err: any) => {
        client.unbind();
        if (err) {
          console.warn(`LDAP bind failed for ${username}: ${err.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });

      client.on('error', (err: any) => {
        console.warn(`LDAP connection error for ${username}: ${err.message}`);
        resolve(false);
      });
    } catch (err: any) {
      console.warn(`LDAP exception for ${username}: ${err.message}`);
      resolve(false);
    }
  });
}

// PAM authentication via unix_chkpwd
// unix_chkpwd 是 PAM 內建的密碼驗證工具，即使以 root 執行也會正確驗證 /etc/shadow
export async function authenticatePam(username: string, password: string): Promise<boolean> {
  const { spawn } = require('child_process');

  return new Promise((resolve) => {
    const proc = spawn('/sbin/unix_chkpwd', [username, 'nullok'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // unix_chkpwd 期望 null-terminated 密碼
    proc.stdin.write(password + '\0');
    proc.stdin.end();

    proc.on('close', (code: number) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

// 檢查 PAM 使用者是否在 sudo 或 root group
async function checkPamAdmin(username: string): Promise<boolean> {
  const { execSync } = require('child_process');
  try {
    const output = execSync(`id -Gn ${username}`, { encoding: 'utf-8', timeout: 3000 });
    const groups = output.trim().split(/\s+/);
    return groups.includes('sudo') || groups.includes('root');
  } catch {
    return false;
  }
}

// 檢查 LDAP 使用者是否在 admins group
async function checkLdapAdmin(username: string): Promise<boolean> {
  const ldapUrl = process.env.LDAP_URL;
  const baseDn = process.env.LDAP_BASE_DN;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PASSWORD;
  if (!ldapUrl || !baseDn || !bindDn || !bindPw) return false;

  return new Promise((resolve) => {
    try {
      const ldap = require('ldapjs');
      const client = ldap.createClient({ url: ldapUrl, tlsOptions: { rejectUnauthorized: false } });

      client.bind(bindDn, bindPw, (err: any) => {
        if (err) { client.unbind(); return resolve(false); }

        // 搜尋 admins group 是否包含該使用者
        // FreeIPA groups 在 cn=groups,cn=accounts,... 底下，而非 cn=users,...
        const groupBase = baseDn.replace(/^cn=users,/, 'cn=groups,');
        const filter = `(&(cn=admins)(member=uid=${username},${baseDn}))`;

        client.search(groupBase, { filter, scope: 'sub' }, (err: any, searchRes: any) => {
          if (err) { client.unbind(); return resolve(false); }

          let found = false;
          searchRes.on('searchEntry', () => { found = true; });
          searchRes.on('end', () => {
            client.unbind();
            resolve(found);
          });
          searchRes.on('error', () => {
            client.unbind();
            resolve(false);
          });
        });
      });

      client.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    if (user.source === 'ldap') {
      await changeIpaPassword(user.username, oldPassword, newPassword);
    } else if (user.source === 'pam') {
      await changePamPassword(user.username, oldPassword, newPassword);
    } else {
      return res.status(400).json({ error: 'Password change not supported for this account type' });
    }

    // Audit
    db.prepare(
      'INSERT INTO audit_logs (actor_user_id, action, ip) VALUES (?, ?, ?)'
    ).run(req.session.userId, 'change_password', req.ip);

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 更改 PAM 密碼
async function changePamPassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
  // 先驗證舊密碼
  const valid = await authenticatePam(username, oldPassword);
  if (!valid) throw new Error('目前密碼錯誤');

  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('chpasswd', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(`${username}:${newPassword}\n`);
    proc.stdin.end();

    proc.on('close', (code: number) => {
      if (code === 0) resolve();
      else reject(new Error('密碼更改失敗'));
    });

    proc.on('error', () => reject(new Error('chpasswd 不可用')));
    setTimeout(() => { proc.kill(); reject(new Error('操作逾時')); }, 5000);
  });
}

export default router;
