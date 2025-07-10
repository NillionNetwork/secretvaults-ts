import pino, { type Level, type Logger, type LoggerOptions } from "pino";
import pinoPretty, { prettyFactory } from "pino-pretty";

export type LogLevel = Level | "silent";

const LOG_LEVEL_KEY = "NILLION_LOG_LEVEL";
const DEFAULT_LOG_LEVEL: LogLevel = "silent";
const VALID_LOG_LEVELS: ReadonlyArray<LogLevel> = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
];

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      // Use optional chaining for resilience in non-browser environments.
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Ignore errors if storage is disabled
    }
  },
  removeItem: (key: string): void => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore errors
    }
  },
};

function isValidLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === "string" && VALID_LOG_LEVELS.includes(value as LogLevel)
  );
}

function getInitialLogLevel(): LogLevel {
  let level = DEFAULT_LOG_LEVEL;
  const sources = [
    process.env?.[LOG_LEVEL_KEY],
    safeStorage.getItem(LOG_LEVEL_KEY),
    // @ts-ignore
    globalThis[LOG_LEVEL_KEY],
  ];

  for (const source of sources) {
    const levelAttempt = source?.toLowerCase();
    if (isValidLogLevel(levelAttempt)) {
      level = levelAttempt;
      break;
    }
  }

  return level;
}

declare const window: unknown;

function getLoggerForEnv(): Logger<never, boolean> {
  const env = process.env.NODE_ENV ?? "production";
  const level = getInitialLogLevel();
  const isNode = typeof window === "undefined";

  // For production OR any browser environment, return a simple logger.
  if (env === "production" || !isNode) {
    return pino({
      level,
      browser: { asObject: true },
      base: null,
    });
  }

  const stream = pinoPretty({
    colorize: true,
    levelFirst: true,
    translateTime: "SYS:h:MM:ss TT",
    ignore: "pid,hostname",
    sync: true,
  });

  // If test, mirror to console.log so vitest doesn't swallow logs
  const hooks: Partial<LoggerOptions["hooks"]> = {};
  if (env === "test") {
    hooks.streamWrite = (s: string): string => {
      const prettify = prettyFactory({ sync: true, colorize: true });
      console.log(prettify(s));
      return s;
    };
  }

  return pino(
    {
      level,
      hooks,
    },
    stream,
  );
}

export const Log = getLoggerForEnv();

export function setLogLevel(level: LogLevel): void {
  if (!isValidLogLevel(level)) {
    console.warn(`[Logger] Invalid log level: "${level}". Ignoring.`);
    return;
  }
  Log.level = level;
  safeStorage.setItem(LOG_LEVEL_KEY, level);
}

export function getLogLevel(): LogLevel {
  return Log.level as LogLevel;
}

export function clearStoredLogLevel(): void {
  safeStorage.removeItem(LOG_LEVEL_KEY);
}

interface NillionGlobal {
  setLogLevel: (level: LogLevel) => void;
  getLogLevel: () => LogLevel;
  clearStoredLogLevel: () => void;
}

declare global {
  var __NILLION: NillionGlobal;
}

if (typeof globalThis !== "undefined") {
  globalThis.__NILLION = {
    setLogLevel,
    getLogLevel,
    clearStoredLogLevel,
  };
}
