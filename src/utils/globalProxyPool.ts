import { Logger } from '@config/logger.config';
import { ProxyConfig } from '@utils/makeProxyAgent';
import { ProxyRotator, RotationPolicy } from '@utils/proxyRotator';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const logger = new Logger('GlobalProxyPool');

const RELOAD_THROTTLE_MS = 2000;

const parseJsonPool = (raw: string): ProxyConfig[] => {
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data?.proxies;
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && p.host && p.port)
    .map((p: any) => ({
      host: String(p.host),
      port: String(p.port),
      protocol: String(p.protocol || 'http'),
      username: p.username ? String(p.username) : undefined,
      password: p.password ? String(p.password) : undefined,
    }));
};

const parseUrlLinePool = (raw: string): ProxyConfig[] => {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line): ProxyConfig | null => {
      try {
        const withScheme = /^\w+:\/\//.test(line) ? line : `http://${line}`;
        const u = new URL(withScheme);
        return {
          host: u.hostname.replace(/^\[|\]$/g, ''),
          port: u.port || '80',
          protocol: u.protocol.replace(':', ''),
          username: u.username ? decodeURIComponent(u.username) : undefined,
          password: u.password ? decodeURIComponent(u.password) : undefined,
        };
      } catch {
        logger.warn(`Ignoring malformed proxy line: ${line}`);
        return null;
      }
    })
    .filter((p): p is ProxyConfig => p !== null);
};

class GlobalProxyPoolImpl {
  private rotator: ProxyRotator | null = null;
  private filePath: string | null = null;
  private lastMtimeMs = 0;
  private lastReloadCheckAt = 0;
  private policy: RotationPolicy = 'round_robin';

  configure(): void {
    const raw = process.env.PROXY_POOL_FILE?.trim();
    this.policy = (process.env.PROXY_POOL_ROTATION as RotationPolicy) || 'round_robin';
    this.filePath = raw ? resolve(raw) : null;
    this.reloadIfNeeded(true);
  }

  isConfigured(): boolean {
    return this.filePath !== null;
  }

  isEnabled(): boolean {
    this.reloadIfNeeded();
    return !!this.rotator && !this.rotator.isEmpty;
  }

  size(): number {
    return this.rotator?.size ?? 0;
  }

  next(): ProxyConfig | null {
    this.reloadIfNeeded();
    return this.rotator?.next() ?? null;
  }

  markFailed(proxy: ProxyConfig | null, reason?: string): void {
    this.rotator?.markFailed(proxy, reason);
  }

  status(): { configured: boolean; enabled: boolean; size: number; policy: RotationPolicy; filePath: string | null } {
    return {
      configured: this.isConfigured(),
      enabled: this.isEnabled(),
      size: this.size(),
      policy: this.policy,
      filePath: this.filePath,
    };
  }

  private reloadIfNeeded(force = false): void {
    if (!this.filePath) {
      this.rotator = null;
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastReloadCheckAt < RELOAD_THROTTLE_MS) return;
    this.lastReloadCheckAt = now;

    if (!existsSync(this.filePath)) {
      if (this.rotator) {
        logger.error(`Proxy pool file disappeared: ${this.filePath} — pool is now empty`);
        this.rotator = null;
      }
      return;
    }

    const mtime = statSync(this.filePath).mtimeMs;
    if (!force && mtime === this.lastMtimeMs) return;

    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const pool = this.filePath.endsWith('.json') ? parseJsonPool(raw) : parseUrlLinePool(raw);
      if (pool.length === 0) {
        logger.error(`Proxy pool file ${this.filePath} produced 0 valid entries`);
        this.rotator = null;
      } else {
        this.rotator = new ProxyRotator(pool, this.policy);
        logger.info(`Loaded ${pool.length} proxies from ${this.filePath} (policy=${this.policy})`);
      }
      this.lastMtimeMs = mtime;
    } catch (error) {
      logger.error(`Failed to load proxy pool from ${this.filePath}: ${error?.toString()}`);
    }
  }
}

export const GlobalProxyPool = new GlobalProxyPoolImpl();
GlobalProxyPool.configure();
