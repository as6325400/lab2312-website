import https from 'https';

function getIpaHost(): string {
  if (process.env.IPA_HOST) return process.env.IPA_HOST;
  const ldapUrl = process.env.LDAP_URL;
  if (ldapUrl) return new URL(ldapUrl).hostname;
  throw new Error('IPA_HOST or LDAP_URL not configured');
}

function httpsPost(
  host: string,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ statusCode: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        port: 443,
        path,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body), Referer: `https://${host}/ipa` },
        rejectUnauthorized: false,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data }),
        );
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Login to FreeIPA as admin and return session cookie */
async function getAdminSession(): Promise<string> {
  const host = getIpaHost();
  const password = process.env.IPA_ADMIN_PASSWORD || process.env.LDAP_BIND_PASSWORD;
  if (!password) throw new Error('FreeIPA admin password not configured');

  const body = `user=admin&password=${encodeURIComponent(password)}`;
  const res = await httpsPost(host, '/ipa/session/login_password', {
    'Content-Type': 'application/x-www-form-urlencoded',
  }, body);

  if (res.statusCode !== 200) {
    throw new Error(`FreeIPA admin login failed (${res.statusCode})`);
  }

  const cookies: string[] = Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie']
    : [res.headers['set-cookie'] || ''];
  const session = cookies.find((c) => c.startsWith('ipa_session='));
  if (!session) throw new Error('FreeIPA session cookie not found');

  return session.split(';')[0];
}

/** Call FreeIPA JSON-RPC API */
async function ipaRpc(
  session: string,
  method: string,
  args: string[],
  opts: Record<string, any> = {},
): Promise<any> {
  const host = getIpaHost();
  const body = JSON.stringify({
    method,
    params: [args, { ...opts, version: '2.245' }],
  });

  const res = await httpsPost(host, '/ipa/session/json', {
    'Content-Type': 'application/json',
    Cookie: session,
    Accept: 'application/json',
  }, body);

  const json = JSON.parse(res.body);
  if (json.error) {
    throw new Error(json.error.message || `FreeIPA ${method} failed`);
  }
  return json.result;
}

/** Create a FreeIPA user account (with Kerberos principal, proper UID/GID, etc.) */
export async function createIpaUser(opts: {
  username: string;
  password: string;
  displayName: string;
  email: string;
  studentId?: string;
}): Promise<void> {
  const session = await getAdminSession();

  // 拆分姓名：有空格就拆，沒有就用全名當 sn、第一個字當 givenname
  const parts = opts.displayName.trim().split(/\s+/);
  let givenname: string;
  let sn: string;
  if (parts.length >= 2) {
    givenname = parts.slice(0, -1).join(' ');
    sn = parts[parts.length - 1];
  } else {
    givenname = opts.displayName;
    sn = opts.displayName;
  }

  const userOpts: Record<string, any> = {
    givenname,
    sn,
    cn: opts.displayName,
    mail: opts.email,
    userpassword: opts.password,
    loginshell: '/bin/bash',
  };

  if (opts.studentId) {
    userOpts.employeenumber = opts.studentId;
  }

  await ipaRpc(session, 'user_add', [opts.username], userOpts);
}

/** Add a user to a FreeIPA group */
export async function addIpaGroupMember(groupName: string, username: string): Promise<void> {
  const session = await getAdminSession();
  const result = await ipaRpc(session, 'group_add_member', [groupName], { user: [username] });
  checkGroupMemberResult(result, 'add', groupName, username);
}

/** Remove a user from a FreeIPA group */
export async function removeIpaGroupMember(groupName: string, username: string): Promise<void> {
  const session = await getAdminSession();
  const result = await ipaRpc(session, 'group_remove_member', [groupName], { user: [username] });
  checkGroupMemberResult(result, 'remove', groupName, username);
}

/** Check group_add_member / group_remove_member result for silent failures */
function checkGroupMemberResult(
  result: any,
  action: string,
  groupName: string,
  username: string,
): void {
  if (!result) return;
  const failedUsers: string[][] = result.failed?.member?.user;
  if (failedUsers && failedUsers.length > 0) {
    const reason = failedUsers[0][1] || 'unknown error';
    throw new Error(`Failed to ${action} ${username} in group ${groupName}: ${reason}`);
  }
}

/** Delete a FreeIPA user account permanently */
export async function deleteIpaUser(username: string): Promise<void> {
  const session = await getAdminSession();
  await ipaRpc(session, 'user_del', [username]);
}

/** Disable a FreeIPA user account */
export async function disableIpaUser(username: string): Promise<void> {
  const session = await getAdminSession();
  await ipaRpc(session, 'user_disable', [username]);
}

/** Enable a FreeIPA user account */
export async function enableIpaUser(username: string): Promise<void> {
  const session = await getAdminSession();
  await ipaRpc(session, 'user_enable', [username]);
}

/**
 * Change FreeIPA user password (self-service).
 * Uses /ipa/session/change_password which handles Kerberos password change,
 * including expired password scenarios.
 */
export async function changeIpaPassword(
  username: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const host = getIpaHost();
  const body = [
    `user=${encodeURIComponent(username)}`,
    `old_password=${encodeURIComponent(oldPassword)}`,
    `new_password=${encodeURIComponent(newPassword)}`,
  ].join('&');

  const res = await httpsPost(host, '/ipa/session/change_password', {
    'Content-Type': 'application/x-www-form-urlencoded',
  }, body);

  const result = res.headers['x-ipa-pwchange-result'];

  if (result === 'invalid-password') {
    throw new Error('目前密碼錯誤');
  }
  if (result === 'policy-error') {
    const policyMsg = res.headers['x-ipa-pwchange-policy-error'] || '不符合密碼策略';
    throw new Error(`密碼更改失敗：${policyMsg}`);
  }
  if (result !== 'ok') {
    throw new Error('密碼更改失敗');
  }
}
