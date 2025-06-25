import { z } from "zod/v4";

/**
 *
 */
export const Uuid = z.uuid().brand<"Uuid">();
export type Uuid = z.infer<typeof Uuid>;

/**
 *
 */
export const Did = z
  .string()
  .regex(/^did:nil:([a-zA-Z0-9]{66})$/)
  .brand<"Did">();
export type Did = z.infer<typeof Did>;

/**
 *
 */
export type ByNodeName<T> = Record<Did, T>;
