import pino, { type Level } from "pino";
import { prettyFactory } from "pino-pretty";

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

function getLoggerForEnv() {
  const env = process.env.NODE_ENV ?? "production";
  if (env === "production") {
    return pino({
      level: getInitialLogLevel(),
      browser: {
        asObject: true,
      },
      base: null,
    });
  }

  return pino({
    level: getInitialLogLevel(),
    browser: {
      asObject: true,
    },
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        levelFirst: true,
        translateTime: "SYS:h:MM:ss TT",
        ignore: "pid,hostname",
        sync: true,
      },
    },
    hooks:
      process.env.NODE_ENV === "test"
        ? {
            streamWrite: (s) => {
              // Mirror to console.log so vitest doesn't swallow logs
              const prettify = prettyFactory({ sync: true, colorize: true });
              console.log(prettify(s));
              return s;
            },
          }
        : undefined,
  });
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
