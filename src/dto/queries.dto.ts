import { z } from "zod";
import {
  ApiSuccessResponse,
  PaginatedResponse,
  PaginationQuerySchema,
} from "./common";

/**
 * MongoDB aggregation pipeline variable validation.
 */
const PATH_EXPRESSION = /^\$(\.[$a-zA-Z][a-zA-Z0-9-_]+(\[\d+])*)+$/;
const VariablePath = z
  .string()
  .transform((path) => PATH_EXPRESSION.exec(path))
  .refine((match) => match !== null, "invalid PATH")
  // @ts-expect-error the refine previous checks for null
  .transform((match) => match[0]);

/**
 * Query variable configuration validator.
 */
export const QueryVariableValidator = z.object({
  path: VariablePath,
  description: z.string().optional(),
});

/**
 * Query creation request.
 */
export const CreateQueryRequest = z.object({
  _id: z.uuid(),
  name: z.string().min(1).max(100),
  collection: z.uuid(),
  variables: z.record(z.string(), QueryVariableValidator),
  pipeline: z.array(z.record(z.string(), z.unknown())),
});
export type CreateQueryRequest = z.infer<typeof CreateQueryRequest>;

/**
 * Query creation response.
 */
export const CreateQueryResponse = z.string();
export type CreateQueryResponse = z.infer<typeof CreateQueryResponse>;

/**
 * Query document response - returned by list/get operations.
 */
const QueryDocumentResponse = z.object({
  _id: z.uuid(),
  name: z.string().min(1).max(100),
  collection: z.uuid(),
});

/**
 * Queries list request query parameters.
 */
export const ReadQueriesRequestQuery = PaginationQuerySchema;
export type ReadQueriesRequestQuery = z.infer<typeof ReadQueriesRequestQuery>;

/**
 * Queries list response.
 */
export const ReadQueriesResponse = PaginatedResponse(QueryDocumentResponse);
export type ReadQueriesResponse = z.infer<typeof ReadQueriesResponse>;

/**
 * Read query response.
 */
export const ReadQueryResponse = ApiSuccessResponse(QueryDocumentResponse);
export type ReadQueryResponse = z.infer<typeof ReadQueryResponse>;

/**
 * Query deletion request.
 */
export const DeleteQueryRequest = z.object({
  id: z.uuid(),
});
export type DeleteQueryRequest = z.infer<typeof DeleteQueryRequest>;

/**
 * Query deletion response.
 */
export const DeleteQueryResponse = z.string();
export type DeleteQueryResponse = z.infer<typeof DeleteQueryResponse>;

/**
 * Query execution request.
 */
export const RunQueryRequest = z.object({
  _id: z.uuid(),
  variables: z.record(z.string(), z.unknown()),
});
export type RunQueryRequest = z.infer<typeof RunQueryRequest>;

/**
 * Query execution response.
 */
export const RunQueryResponse = ApiSuccessResponse(z.uuid());
export type RunQueryResponse = z.infer<typeof RunQueryResponse>;

/**
 * Query execution status.
 */
export const RunQueryResultStatus = z.enum([
  "pending",
  "running",
  "complete",
  "error",
]);
export type RunQueryResultStatus = z.infer<typeof RunQueryResultStatus>;

/**
 * Query job data.
 */
const ReadQueryRunByIdDto = z.object({
  _id: z.uuid(),
  query: z.uuid(),
  status: RunQueryResultStatus,
  started: z.iso.datetime().optional(),
  completed: z.iso.datetime().optional(),
  result: z.unknown().optional(),
  errors: z.array(z.string()).optional(),
});

/**
 * Query run read request query parameters.
 */
export const ReadQueryRunByIdRequestQuery = PaginationQuerySchema;
export type ReadQueryRunByIdRequestQuery = z.infer<
  typeof ReadQueryRunByIdRequestQuery
>;

export const ReadQueryRunByIdResponse = z.object({
  data: ReadQueryRunByIdDto,
  pagination: z
    .object({
      total: z.number().int().min(0),
      limit: z.number().int().min(1),
      offset: z.number().int().min(0),
    })
    .optional(),
});
export type ReadQueryRunByIdResponse = z.infer<typeof ReadQueryRunByIdResponse>;
