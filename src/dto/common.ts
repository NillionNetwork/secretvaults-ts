import { z } from "zod";

/**
 *
 */
export type ByNodeName<T> = Record<string, T>;

/**
 * A type representing the sorting applied in paginatend endpoints.
 */
export type Sort = Record<string, 1 | -1>;

/**
 * Zod schema for the sort query parameter.
 */
export const SortSchema = z
  .record(z.string(), z.union([z.literal(1), z.literal(-1)]))
  .optional();

/**
 * UUID string type.
 */
export const Uuid = z.uuid();
export type Uuid = string;

/**
 *
 */
export const DidString = z.string().startsWith("did:");
export type DidString = z.infer<typeof DidString>;

/**
 *
 */
export const Name = z.string().min(1).max(255);
export type Name = z.infer<typeof Name>;

/**
 * Zod schema for common pagination query parameters.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: SortSchema,
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * A generic factory for creating a paginated response schema.
 * @param dataSchema The Zod schema for the items in the data array.
 */
export const PaginatedResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    pagination: z.object({
      total: z.number().int().min(0),
      limit: z.number().int().min(1),
      offset: z.number().int().min(0),
      sort: SortSchema,
    }),
  });

/**
 * Zod schema for an optional pagination object in a request body.
 */
export const PaginationBodySchema = z.object({
  pagination: PaginationQuerySchema.optional(),
});
export type PaginationBody = z.infer<typeof PaginationBodySchema>;

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
  grantee: DidString,
  read: z.boolean(),
  write: z.boolean(),
  execute: z.boolean(),
});
export type Acl = z.infer<typeof Acl>;
