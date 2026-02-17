export interface ProxyRule {
  domain: string;
  target: string;
  description?: string;
  is_enabled: number | boolean;
}

// Domain used in Caddyfile — environment variable syntax for Caddy
const CADDYFILE_DOMAIN = '{$DASHBOARD_DOMAIN}';

export function generateCaddyfile(rules: ProxyRule[]): string {
  let caddyfile = `{
\t# Managed by Lab Portal
}\n\n`;

  // Dashboard site block
  caddyfile += `${CADDYFILE_DOMAIN} {
\t# API proxy
\thandle /api/* {
\t\treverse_proxy backend:3000
\t}

\t# WebSocket proxy
\thandle /ws/* {
\t\treverse_proxy backend:3000
\t}

\t# Uploads
\thandle /uploads/* {
\t\treverse_proxy backend:3000
\t}

\t# Frontend SPA (fallback)
\thandle {
\t\troot * /srv
\t\ttry_files {path} /index.html
\t\tfile_server
\t}

\t# Security headers
\theader {
\t\tX-Frame-Options SAMEORIGIN
\t\tX-Content-Type-Options nosniff
\t\tX-XSS-Protection "1; mode=block"
\t}

\tencode gzip
}\n`;

  // User-defined proxy rules (enabled only)
  const enabledRules = rules.filter((r) => r.is_enabled);
  for (const rule of enabledRules) {
    caddyfile += `\n# ${rule.description || rule.domain}\n`;
    caddyfile += `${rule.domain} {\n`;
    caddyfile += `\treverse_proxy ${rule.target}\n`;
    caddyfile += `}\n`;
  }

  return caddyfile;
}

// Validation patterns (exported for testing)
export const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
export const TARGET_REGEX = /^[\w.-]+:\d+$/;

export function validateDomain(domain: string, dashboardDomain: string): string | null {
  if (!domain || typeof domain !== 'string') return 'domain 為必填';
  if (!DOMAIN_REGEX.test(domain)) return '無效的域名格式';
  if (domain.toLowerCase() === dashboardDomain.toLowerCase()) return '不可覆蓋 Dashboard 域名';
  return null;
}

export function validateTarget(target: string): string | null {
  if (!target || typeof target !== 'string') return 'target 為必填';
  if (!TARGET_REGEX.test(target)) return 'target 格式須為 host:port';
  return null;
}
