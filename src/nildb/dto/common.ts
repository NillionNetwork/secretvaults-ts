import z from "zod";

/**
 *
 */
export const Did = z.string().regex(/^did:nil:([a-zA-Z0-9]{66})$/);
export type Did = z.infer<typeof Did>;

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
  ts: z.string().datetime(),
  errors: z.string().array(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;

/**
 * Generic ID path parameter.
 */
export const ByIdRequestParams = z.object({
  id: z.string().uuid(),
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

/**
 *
 */
export const AboutNode = z.object({
  started: z.string().datetime(),
  build: z.object({
    time: z.string().datetime(),
    commit: z.string(),
    version: z.string(),
  }),
  public_key: z.string(),
  url: z.string(),
  maintenance: z.object({
    active: z.boolean(),
    started_at: z.string().datetime(),
  }),
});

/**
 *
 */
export type AboutNode = z.infer<typeof AboutNode>;
