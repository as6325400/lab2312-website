import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middlewares/auth';

const router = Router();

const SSO_SECRET = process.env.SSO_SECRET || '';

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

  const payload = JSON.stringify({
    username: req.session.username,
    groups,
    is_admin: req.session.role === 'admin',
    exp: Date.now() + 30000, // 30 seconds
  });

  const signature = crypto.createHmac('sha256', SSO_SECRET).update(payload).digest('hex');
  const token = Buffer.from(payload).toString('base64url') + '.' + signature;

  return res.json({ token });
});

export default router;
