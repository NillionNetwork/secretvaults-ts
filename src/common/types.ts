import { z } from "zod";

/**
 *
 */
export const Uuid = z.string().uuid().brand<"Uuid">();
export type Uuid = z.infer<typeof Uuid>;

/**
 *
 */
export type ByNodeName<T> = Record<string, T>;
