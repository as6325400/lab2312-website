import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import { generateSsoToken } from '../utils/sso';
import { getDb } from '../db/schema';

const router = Router();

const SSO_SECRET = process.env.SSO_SECRET || '';

function generateJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// 查詢使用者在 LDAP 中所屬的所有 group
async function getLdapGroups(username: string): Promise<string[]> {
  const ldapUrl = process.env.LDAP_URL;
  const baseDn = process.env.LDAP_BASE_DN;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PASSWORD;
  if (!ldapUrl || !baseDn || !bindDn || !bindPw) return [];

  return new Promise((resolve) => {
    try {
      const ldap = require('ldapjs');
      const client = ldap.createClient({ url: ldapUrl, tlsOptions: { rejectUnauthorized: false } });

      client.bind(bindDn, bindPw, (err: any) => {
        if (err) { client.unbind(); return resolve([]); }

        const groupBase = baseDn.replace(/^cn=users,/, 'cn=groups,');
        const filter = `(member=uid=${username},${baseDn})`;

        client.search(groupBase, { filter, scope: 'sub', attributes: ['cn'] }, (err: any, searchRes: any) => {
          if (err) { client.unbind(); return resolve([]); }

          const groups: string[] = [];
          searchRes.on('searchEntry', (entry: any) => {
            const cn = entry.pojo?.attributes?.find((a: any) => a.type === 'cn')?.values?.[0]
              || entry.object?.cn;
            if (cn) groups.push(cn);
          });
          searchRes.on('end', () => {
            client.unbind();
            resolve(groups);
          });
          searchRes.on('error', () => {
            client.unbind();
            resolve(groups);
          });
        });
      });

      client.on('error', () => resolve([]));
    } catch {
      resolve([]);
    }
  });
}

// POST /api/sso/token - Generate a one-time SSO token for the current user
router.post('/token', requireAuth, async (req: Request, res: Response) => {
  if (!SSO_SECRET) {
    return res.status(500).json({ error: 'SSO not configured' });
  }

  const groups = await getLdapGroups(req.session.username!);

  const token = generateSsoToken(
    {
      username: req.session.username!,
      groups,
      is_admin: req.session.role === 'admin',
    },
    SSO_SECRET,
  );

  return res.json({ token });
});

// POST /api/sso/outline-token - Generate a JWT for Outline SSO
router.post('/outline-token', requireAuth, (req: Request, res: Response) => {
  if (!SSO_SECRET) {
    return res.status(500).json({ error: 'SSO not configured' });
  }

  const db = getDb();
  const user = db.prepare('SELECT username, email, display_name FROM users WHERE id = ?').get(req.session.userId) as
    { username: string; email: string; display_name: string } | undefined;

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = generateJwt(
    {
      sub: user.username,
      email: user.email,
      name: user.display_name || user.username,
      iat: now,
      exp: now + 300,
    },
    SSO_SECRET,
  );

  return res.json({ token });
});

export default router;
