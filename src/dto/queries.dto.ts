import { z } from "zod/v4";
import { Did } from "#/common/types";
import { ApiSuccessResponse } from "./common";

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
 * Query document data.
 */
const QueryDocumentResponse = z.object({
  _id: z.uuid(),
  _created: z.iso.datetime(),
  _updated: z.iso.datetime(),
  owner: Did,
  name: z.string().min(1).max(100),
  collection: z.uuid(),
  variables: z.record(z.string(), QueryVariableValidator),
  pipeline: z.array(z.record(z.string(), z.unknown())),
});

/**
 * Queries list response.
 */
export const ReadQueriesResponse = ApiSuccessResponse(
  z.array(QueryDocumentResponse),
);
export type ReadQueriesResponse = z.infer<typeof ReadQueriesResponse>;

/**
 * Read query response.
 */
export const ReadQueryResponse = ApiSuccessResponse(QueryDocumentResponse);
export type ReadQueryResponse = z.infer<typeof ReadQueryResponse>;

/**
 * Query ID path parameters.
 */
export const ByIdRequestParams = z.object({
  id: z.uuid(),
});
export type ByIdRequestParams = z.infer<typeof ByIdRequestParams>;

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

export const ReadQueryRunByIdResponse = ApiSuccessResponse(ReadQueryRunByIdDto);
export type ReadQueryRunByIdResponse = z.infer<typeof ReadQueryRunByIdResponse>;
