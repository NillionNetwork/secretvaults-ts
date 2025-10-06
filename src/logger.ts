/**
 * @module logger
 * Provides a standardized, environment-aware logging utility for the library.
 *
 * This module configures a `pino` logger instance that can be controlled via
 * environment variables in Node.js or `localStorage` in the browser. It also
 * exposes a global API (`window.__NILLION`) for runtime log level management
 * in browser environments.
 *
 * @example
 * ```bash
 * # In Node.js
 * NILLION_LOG_LEVEL=debug node my-script.js
 * ```
 *
 * @example
 * ```ts
 * // In a browser's developer console
 * localStorage.setItem("NILLION_LOG_LEVEL", "debug");
 * // Or, to control all Nillion libraries on the page at once:
 * __NILLION.setLogLevel("debug");
 * ```
 */
import pino from "pino";

export type LogLevel = pino.Level | "silent";

const LOG_LEVEL_KEY = "NILLION_LOG_LEVEL";
const DEFAULT_LOG_LEVEL: LogLevel = "silent";
const VALID_LOG_LEVELS: ReadonlySet<string> = new Set<LogLevel>([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

/**
 * A resilient wrapper around `localStorage` that fails gracefully in non-browser environments.
 * @internal
 */
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Fails silently if storage is unavailable.
    }
  },
  removeItem: (key: string): void => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Fails silently if storage is unavailable.
    }
  },
};

/**
 * Type guard to check if a value is a valid `LogLevel`.
 * @internal
 */
function isValidLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && VALID_LOG_LEVELS.has(value);
}

/**
 * Determines the initial log level with a clear order of precedence.
 * @internal
 */
function getInitialLogLevel(): LogLevel {
  const fromEnv =
    typeof process !== "undefined" ? process.env[LOG_LEVEL_KEY] : undefined;
  if (isValidLogLevel(fromEnv)) {
    return fromEnv;
  }

  const fromStorage = safeStorage.getItem(LOG_LEVEL_KEY);
  if (isValidLogLevel(fromStorage)) {
    return fromStorage;
  }

  return DEFAULT_LOG_LEVEL;
}

/**
 * The shared, singleton logger instance for this library module.
 */
export const Log: pino.Logger = pino({
  level: getInitialLogLevel(),
  browser: { asObject: true },
  base: null,
});

/**
 * Sets the log level for this specific logger instance and persists the choice.
 * @param level The new log level to set.
 */
export function setLogLevel(level: LogLevel): void {
  if (!isValidLogLevel(level)) {
    console.warn(`[Logger] Invalid log level: "${level}". Ignoring.`);
    return;
  }
  Log.level = level;
  safeStorage.setItem(LOG_LEVEL_KEY, level);
}

/**
 * Returns the current log level of this specific logger instance.
 */
export function getLogLevel(): LogLevel {
  return Log.level as LogLevel;
}

/**
 * Removes the stored log level from `localStorage`.
 */
export function clearStoredLogLevel(): void {
  safeStorage.removeItem(LOG_LEVEL_KEY);
}

/**
 * The interface for a single logger's control functions.
 * @internal
 */
interface LoggerApi {
  set: (level: LogLevel) => void;
  get: () => LogLevel;
  clear: () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __NILLION: {
    /**
     * A set of all registered Nillion logger instances on the page.
     * @internal
     */
    _instances: Set<LoggerApi>;
    /**
     * Sets the log level for all Nillion libraries on the page.
     */
    setLogLevel: (level: LogLevel) => void;
    /**
     * Gets the log level of the first registered Nillion library.
     * Note: If different libraries have different levels, this may not be representative.
     */
    getLogLevel: () => LogLevel;
    /**
     * Clears the persisted log level setting from localStorage.
     */
    clearStoredLogLevel: () => void;
  };
}

/**
 * Attaches a global controller to `globalThis` for managing all logger instances.
 * This handles the case where multiple libraries using this logger are present.
 * @internal
 */
if (typeof globalThis !== "undefined") {
  // Initialize the global controller only once.
  if (!globalThis.__NILLION) {
    const instances = new Set<LoggerApi>();
    globalThis.__NILLION = {
      _instances: instances,
      setLogLevel: (level: LogLevel) => {
        // Broadcast the command to all registered logger instances.
        for (const instance of instances) {
          instance.set(level);
        }
      },
      getLogLevel: (): LogLevel => {
        // Return the level of the first registered instance as a representative value.
        const first = instances.values().next().value;
        return first ? first.get() : getInitialLogLevel();
      },
      clearStoredLogLevel: () => {
        // This is a global action, so only one instance needs to perform it.
        const first = instances.values().next().value;
        if (first) {
          first.clear();
        }
      },
    };
  }

  // Register this specific logger instance's API with the global controller.
  globalThis.__NILLION._instances.add({
    set: setLogLevel,
    get: getLogLevel,
    clear: clearStoredLogLevel,
  });
}
