import { z } from "zod/v4";
import { Did } from "#/common/types";

/**
 *
 */
export const Name = z.string().min(1).max(255);
export type Name = z.infer<typeof Name>;

/**
 *
 */
export const ApiSuccessResponse = <T extends z.ZodType>(Schema: T) =>
  z.object({
    data: Schema,
  });

/**
 *
 */
export const ApiErrorResponse = z.object({
  ts: z.iso.datetime(),
  errors: z.string().array(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;

/**
 * Generic ID path parameter.
 */
export const ByIdRequestParams = z.object({
  id: z.uuid(),
});
export type ByIdRequestParams = z.infer<typeof ByIdRequestParams>;

/**
 * Access control list entry.
 */
export const Acl = z.object({
  grantee: Did,
  read: z.boolean(),
  write: z.boolean(),
  execute: z.boolean(),
});
export type Acl = z.infer<typeof Acl>;
