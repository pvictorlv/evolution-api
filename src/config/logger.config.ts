import fs from 'fs';
import pino from 'pino';

import { configService, Log, LogLevel } from './env.config';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const logConfig = configService.get<Log>('LOG');

function buildTransports(): pino.TransportMultiOptions {
  const targets: pino.TransportTargetOptions[] = [];

  targets.push({
    target: 'pino-pretty',
    level: 'trace',
    options: {
      colorize: logConfig.COLOR,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '[Evolution API] v{version} {pid} - {context} {msg}',
    },
  });

  if (logConfig.LOKI.ENABLED && logConfig.LOKI.URL) {
    const lokiOptions: Record<string, any> = {
      batching: true,
      interval: 5,
      host: logConfig.LOKI.URL,
      labels: {
        application: 'evolution-api',
        project_id: logConfig.LOKI.PROJECT_ID,
        version: packageJson.version,
      },
    };

    if (logConfig.LOKI.USERNAME && logConfig.LOKI.PASSWORD) {
      lokiOptions.basicAuth = {
        username: logConfig.LOKI.USERNAME,
        password: logConfig.LOKI.PASSWORD,
      };
    }

    targets.push({
      target: 'pino-loki',
      level: 'trace',
      options: lokiOptions,
    });
  }

  return { targets };
}

const pinoLogger = pino(
  {
    level: 'trace',
  },
  pino.transport(buildTransports()),
);

const LEVEL_MAP: Record<string, string> = {
  LOG: 'info',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug',
  VERBOSE: 'trace',
  DARK: 'trace',
  WEBHOOKS: 'info',
  WEBSOCKET: 'info',
};

export class Logger {
  private context: string;
  private instance: string | null = null;
  private allowedTypes: Set<string>;

  constructor(context = 'Logger') {
    this.context = context;
    this.allowedTypes = new Set(configService.get<Log>('LOG').LEVEL);
  }

  public setContext(value: string) {
    this.context = value;
  }

  public setInstance(value: string) {
    this.instance = value;
  }

  private emit(value: any, type: LogLevel) {
    if (!this.allowedTypes.has(type)) return;

    const pinoLevel = LEVEL_MAP[type] || 'info';
    const child = pinoLogger.child({
      context: this.context,
      ...(this.instance && { instance: this.instance }),
      version: packageJson.version,
      pid: process.pid,
    });

    if (typeof value === 'object') {
      child[pinoLevel](value, type);
    } else {
      child[pinoLevel](type + ' ' + value);
    }
  }

  public log(value: any) {
    this.emit(value, 'LOG');
  }

  public info(value: any) {
    this.emit(value, 'INFO');
  }

  public warn(value: any) {
    this.emit(value, 'WARN');
  }

  public error(value: any) {
    this.emit(value, 'ERROR');
  }

  public verbose(value: any) {
    this.emit(value, 'VERBOSE');
  }

  public debug(value: any) {
    this.emit(value, 'DEBUG');
  }

  public dark(value: any) {
    this.emit(value, 'DARK');
  }
}
