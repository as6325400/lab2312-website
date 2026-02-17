import { describe, it, expect } from 'vitest';
import { generateCaddyfile, validateDomain, validateTarget, type ProxyRule } from '../utils/caddyfile';

describe('generateCaddyfile', () => {
  it('generates dashboard block with no extra rules', () => {
    const output = generateCaddyfile([]);
    expect(output).toContain('{$DASHBOARD_DOMAIN}');
    expect(output).toContain('reverse_proxy backend:3000');
    expect(output).toContain('try_files {path} /index.html');
  });

  it('includes enabled proxy rule', () => {
    const rules: ProxyRule[] = [
      { domain: 'app.example.com', target: '10.0.0.1:8080', is_enabled: 1 },
    ];
    const output = generateCaddyfile(rules);
    expect(output).toContain('app.example.com {');
    expect(output).toContain('reverse_proxy 10.0.0.1:8080');
  });

  it('excludes disabled proxy rule', () => {
    const rules: ProxyRule[] = [
      { domain: 'disabled.example.com', target: '10.0.0.2:9090', is_enabled: 0 },
    ];
    const output = generateCaddyfile(rules);
    expect(output).not.toContain('disabled.example.com');
  });

  it('handles mix of enabled and disabled rules', () => {
    const rules: ProxyRule[] = [
      { domain: 'a.example.com', target: '10.0.0.1:80', is_enabled: 1 },
      { domain: 'b.example.com', target: '10.0.0.2:80', is_enabled: 0 },
      { domain: 'c.example.com', target: '10.0.0.3:80', is_enabled: 1 },
    ];
    const output = generateCaddyfile(rules);
    expect(output).toContain('a.example.com');
    expect(output).not.toContain('b.example.com');
    expect(output).toContain('c.example.com');
  });

  it('uses description in comment when provided', () => {
    const rules: ProxyRule[] = [
      { domain: 'app.example.com', target: '10.0.0.1:80', description: 'My Service', is_enabled: 1 },
    ];
    const output = generateCaddyfile(rules);
    expect(output).toContain('# My Service');
  });

  it('uses domain in comment when no description', () => {
    const rules: ProxyRule[] = [
      { domain: 'app.example.com', target: '10.0.0.1:80', is_enabled: 1 },
    ];
    const output = generateCaddyfile(rules);
    expect(output).toContain('# app.example.com');
  });

  it('includes security headers', () => {
    const output = generateCaddyfile([]);
    expect(output).toContain('X-Frame-Options SAMEORIGIN');
    expect(output).toContain('X-Content-Type-Options nosniff');
    expect(output).toContain('X-XSS-Protection');
  });

  it('includes gzip encoding', () => {
    const output = generateCaddyfile([]);
    expect(output).toContain('encode gzip');
  });

  it('formats target correctly as reverse_proxy', () => {
    const rules: ProxyRule[] = [
      { domain: 'app.example.com', target: '192.168.1.1:8080', is_enabled: 1 },
    ];
    const output = generateCaddyfile(rules);
    expect(output).toContain('reverse_proxy 192.168.1.1:8080');
  });
});

describe('validateDomain', () => {
  const dashboard = 'dashboard.example.com';

  it('accepts valid domain', () => {
    expect(validateDomain('app.example.com', dashboard)).toBeNull();
  });

  it('accepts single-segment domain', () => {
    expect(validateDomain('localhost', dashboard)).toBeNull();
  });

  it('rejects domain with underscore', () => {
    expect(validateDomain('my_app.com', dashboard)).not.toBeNull();
  });

  it('rejects domain starting with hyphen', () => {
    expect(validateDomain('-invalid.com', dashboard)).not.toBeNull();
  });

  it('rejects empty domain', () => {
    expect(validateDomain('', dashboard)).not.toBeNull();
  });

  it('rejects domain matching dashboard (case insensitive)', () => {
    expect(validateDomain('Dashboard.Example.Com', dashboard)).not.toBeNull();
  });
});

describe('validateTarget', () => {
  it('accepts valid host:port', () => {
    expect(validateTarget('10.0.0.1:8080')).toBeNull();
  });

  it('accepts hostname:port', () => {
    expect(validateTarget('backend:3000')).toBeNull();
  });

  it('rejects missing port', () => {
    expect(validateTarget('10.0.0.1')).not.toBeNull();
  });

  it('rejects target with path', () => {
    expect(validateTarget('10.0.0.1:8080/path')).not.toBeNull();
  });

  it('rejects empty target', () => {
    expect(validateTarget('')).not.toBeNull();
  });
});
