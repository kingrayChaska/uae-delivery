import { describe, expect, it } from 'vitest';

import { buildCsp, generateNonce, isLoopbackHost } from '@/lib/security/csp';

const directive = (csp: string, name: string) =>
  csp.split('; ').find((part) => part.startsWith(`${name} `))?.split(' ').slice(1) ?? [];

describe('buildCsp', () => {
  const prod = buildCsp({ nonce: 'abc123', isDev: false, supabaseUrl: 'https://xyzproject.supabase.co' });

  it('only allows scripts carrying the request nonce (plus what they load)', () => {
    const scripts = directive(prod, 'script-src');
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it('allows eval only in development', () => {
    const dev = buildCsp({ nonce: 'n', isDev: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(dev).not.toContain('upgrade-insecure-requests');
    expect(prod).toContain('upgrade-insecure-requests');
  });

  it('allows the exact Supabase project (https + wss), not every Supabase project', () => {
    const connect = directive(prod, 'connect-src');
    expect(connect).toContain('https://xyzproject.supabase.co');
    expect(connect).toContain('wss://xyzproject.supabase.co');
    expect(prod).not.toContain('*.supabase.co');
  });

  it('blocks framing, plugins, and base-tag hijacking', () => {
    expect(directive(prod, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(prod, 'object-src')).toEqual(["'none'"]);
    expect(directive(prod, 'base-uri')).toEqual(["'self'"]);
  });

  it('ignores a malformed Supabase URL instead of emitting garbage', () => {
    const csp = buildCsp({ nonce: 'n', isDev: false, supabaseUrl: 'not a url' });
    expect(directive(csp, 'connect-src')).not.toContain('not');
  });
});

describe('generateNonce', () => {
  it('is 128 bits of base64 and unique per call', () => {
    const a = generateNonce();
    expect(atob(a)).toHaveLength(16);
    expect(a).not.toBe(generateNonce());
  });
});

describe('local production builds', () => {
  it('can omit upgrade-insecure-requests for a plain-http local host', () => {
    const csp = buildCsp({ nonce: 'n', isDev: false, upgradeInsecureRequests: false });
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(csp).toContain("'nonce-n'");
  });

  it.each(['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]', '::1'])('treats %s as loopback', (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(['parcellinkuae.com', 'localhost.evil.com', '128.0.0.1', '10.0.0.5'])('does not treat %s as loopback', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});
