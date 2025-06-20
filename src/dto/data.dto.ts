import { z } from "zod";
import { ApiSuccessResponse, Did } from "./common";
import { AclDto } from "./users.dto";

/**
 * Owned data creation request.
 */
export const CreateOwnedDataRequest = z.object({
  owner: Did,
  collection: z.string().uuid(),
  data: z.array(z.record(z.string(), z.unknown())).min(1),
  acl: AclDto,
});
export type CreateOwnedDataRequest = z.infer<typeof CreateOwnedDataRequest>;

/**
 * Standard data creation request.
 */
export const CreateStandardDataRequest = z.object({
  collection: z.string().uuid(),
  data: z.array(z.record(z.string(), z.unknown())).min(1),
});
export type CreateStandardDataRequest = z.infer<
  typeof CreateStandardDataRequest
>;

/**
 * Data creation response.
 */
export const CreateDataResponse = ApiSuccessResponse(
  z.object({
    created: z.array(z.string().uuid()),
    errors: z.array(
      z.object({
        error: z.string(),
        document: z.unknown(),
      }),
    ),
  }),
);
export type CreateDataResponse = z.infer<typeof CreateDataResponse>;

/**
 * Data update request.
 */
export const UpdateDataRequest = z.object({
  collection: z.string().uuid(),
  filter: z.record(z.string(), z.unknown()),
  update: z.record(z.string(), z.unknown()),
});
export type UpdateDataRequest = z.infer<typeof UpdateDataRequest>;

/**
 * Data update response.
 */
export const UpdateDataResponse = ApiSuccessResponse(
  z.object({
    acknowledged: z.boolean(),
    matched: z.number().int().min(0),
    modified: z.number().int().min(0),
    upserted: z.number().int().min(0),
    upserted_id: z.string().nullable(),
  }),
);
export type UpdateDataResponse = z.infer<typeof UpdateDataResponse>;

/**
 * Data find request.
 */
export const FindDataRequest = z.object({
  collection: z.string().uuid(),
  filter: z.record(z.string(), z.unknown()),
});
export type FindDataRequest = z.infer<typeof FindDataRequest>;

/**
 * Data find response.
 */
export const FindDataResponse = ApiSuccessResponse(
  z.array(z.record(z.string(), z.unknown())),
);
export type FindDataResponse = z.infer<typeof FindDataResponse>;

/**
 * Data deletion request.
 */
export const DeleteDataRequest = z.object({
  collection: z.string().uuid(),
  filter: z
    .record(z.string(), z.unknown())
    .refine((obj) => Object.keys(obj).length > 0, "Filter cannot be empty"),
});
export type DeleteDataRequest = z.infer<typeof DeleteDataRequest>;

/**
 * Data deletion response.
 */
export const DeleteDataResponse = ApiSuccessResponse(
  z.object({
    acknowledged: z.boolean(),
    deletedCount: z.number().int().min(0),
  }),
);
export type DeleteDataResponse = z.infer<typeof DeleteDataResponse>;

/**
 * Data flush request.
 */
export const FlushDataRequest = z.object({
  collection: z.string().uuid(),
});
export type FlushDataRequest = z.infer<typeof FlushDataRequest>;

/**
 * Data flush response.
 */
export const FlushDataResponse = z.string();
export type FlushDataResponse = z.infer<typeof FlushDataResponse>;

/**
 * Data drop response.
 */
export const DropDataResponse = ApiSuccessResponse(
  z.object({
    acknowledged: z.boolean(),
    deletedCount: z.number().int().min(0),
  }),
);
export type DropDataResponse = z.infer<typeof DropDataResponse>;

/**
 * Data collection ID parameters.
 */
export const DataSchemaByIdRequestParams = z.object({
  id: z.string().uuid(),
});
export type DataSchemaByIdRequestParams = z.infer<
  typeof DataSchemaByIdRequestParams
>;

/**
 * Data tail request parameters.
 */
export const TailDataRequestParams = z.object({
  id: z.string().uuid(),
});
export type TailDataRequestParams = z.infer<typeof TailDataRequestParams>;

/**
 * Data tail query parameters.
 */
export const TailDataRequestQuery = z.object({
  limit: z.coerce.number().max(1_000).optional().default(25),
});
export type TailDataRequestQuery = z.infer<typeof TailDataRequestQuery>;

/**
 * Data tail response.
 */
export const TailDataResponse = ApiSuccessResponse(
  z.array(z.record(z.string(), z.unknown())),
);
export type TailDataResponse = z.infer<typeof TailDataResponse>;
