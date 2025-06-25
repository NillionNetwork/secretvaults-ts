import { z } from "zod";
import type { Did } from "#/dto/common";

/**
 *
 */
export const Uuid = z.string().uuid().brand<"Uuid">();
export type Uuid = z.infer<typeof Uuid>;

/**
 *
 */
export type ByNodeName<T> = Record<Did, T>;
