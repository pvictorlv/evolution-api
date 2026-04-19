import { Logger } from '@config/logger.config';
import { ProxyConfig } from '@utils/makeProxyAgent';

export type RotationPolicy = 'round_robin' | 'random' | 'sticky';

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

const keyOf = (p: ProxyConfig): string =>
  `${(p.protocol || 'http').toLowerCase()}://${p.username || ''}@${p.host}:${p.port}`;

export class ProxyRotator {
  private readonly logger = new Logger('ProxyRotator');
  private readonly pool: ProxyConfig[];
  private readonly policy: RotationPolicy;
  private readonly cooldownMs: number;
  private readonly cooldownUntil = new Map<string, number>();
  private index = -1;
  private sticky?: ProxyConfig;

  constructor(pool: ProxyConfig[], policy: RotationPolicy = 'round_robin', cooldownMs: number = DEFAULT_COOLDOWN_MS) {
    this.pool = pool.filter((p) => p && p.host && p.port);
    this.policy = policy;
    this.cooldownMs = cooldownMs;
  }

  get size(): number {
    return this.pool.length;
  }

  get isEmpty(): boolean {
    return this.pool.length === 0;
  }

  private liveProxies(): ProxyConfig[] {
    const now = Date.now();
    return this.pool.filter((p) => {
      const until = this.cooldownUntil.get(keyOf(p));
      return !until || until <= now;
    });
  }

  current(): ProxyConfig | null {
    if (this.policy === 'sticky' && this.sticky) return this.sticky;
    if (this.index < 0 || this.index >= this.pool.length) return null;
    return this.pool[this.index] || null;
  }

  next(): ProxyConfig | null {
    if (this.isEmpty) return null;

    const live = this.liveProxies();
    if (live.length === 0) {
      this.logger.warn('All proxies in cooldown; clearing cooldowns and retrying');
      this.cooldownUntil.clear();
    }

    const candidates = this.liveProxies();
    if (candidates.length === 0) return null;

    if (this.policy === 'sticky') {
      if (!this.sticky || !candidates.find((c) => keyOf(c) === keyOf(this.sticky!))) {
        this.sticky = candidates[0];
        this.index = this.pool.indexOf(this.sticky);
      }
      return this.sticky;
    }

    if (this.policy === 'random') {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      this.index = this.pool.indexOf(pick);
      return pick;
    }

    const startFrom = this.index;
    for (let step = 1; step <= this.pool.length; step++) {
      const idx = (startFrom + step) % this.pool.length;
      const proxy = this.pool[idx];
      const until = this.cooldownUntil.get(keyOf(proxy));
      if (!until || until <= Date.now()) {
        this.index = idx;
        return proxy;
      }
    }
    return null;
  }

  markFailed(proxy: ProxyConfig | null, reason?: string): void {
    if (!proxy) return;
    const key = keyOf(proxy);
    this.cooldownUntil.set(key, Date.now() + this.cooldownMs);
    this.logger.warn(`Proxy ${proxy.host}:${proxy.port} marked failed (${reason || 'unknown'}); cooldown ${this.cooldownMs}ms`);
  }

  clearFailures(): void {
    this.cooldownUntil.clear();
  }
}
