export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export type ErrorLike = {
  message: string;
  cause: unknown;
};

export function isErrorLike(value: unknown): value is ErrorLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return typeof obj.message === "string" && "cause" in obj;
}
