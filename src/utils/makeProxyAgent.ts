import { HttpsProxyAgent } from 'https-proxy-agent';

export type ProxyConfig = {
  host: string;
  password?: string;
  port: string | number;
  protocol?: string;
  username?: string;
};

const isIPv6Literal = (host: string): boolean => host.includes(':') && !host.startsWith('[');

const bracket = (host: string): string => (isIPv6Literal(host) ? `[${host}]` : host);

export function buildProxyUrl(proxy: ProxyConfig | string): string {
  if (typeof proxy === 'string') {
    return proxy.trim();
  }

  const protocol = (proxy.protocol || 'http').toLowerCase();
  const host = bracket(proxy.host);
  const port = String(proxy.port);

  if (proxy.username && proxy.password) {
    const user = encodeURIComponent(proxy.username);
    const pass = encodeURIComponent(proxy.password);
    return `${protocol}://${user}:${pass}@${host}:${port}`;
  }

  return `${protocol}://${host}:${port}`;
}

export function makeProxyAgent(proxy: ProxyConfig | string) {
  return new HttpsProxyAgent(buildProxyUrl(proxy));
}
