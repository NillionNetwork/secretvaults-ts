import { z } from "zod/v4";
import { Did } from "#/common/types";
import { ApiSuccessResponse, Name } from "./common";

/**
 * Builder registration request.
 */
export const RegisterBuilderRequest = z.object({
  did: Did,
  name: Name,
});
export type RegisterBuilderRequest = z.infer<typeof RegisterBuilderRequest>;

/**
 * Builder registration response.
 */
export const RegisterBuilderResponse = z.string();
export type RegisterBuilderResponse = z.infer<typeof RegisterBuilderResponse>;

/**
 * Builder profile data.
 */
const BuilderProfileDto = z.object({
  _id: Did,
  _created: z.iso.datetime(),
  _updated: z.iso.datetime(),
  name: z.string(),
  collections: z.array(z.uuid()),
  queries: z.array(z.uuid()),
});

/**
 * Profile retrieval response.
 */
export const ReadBuilderProfileResponse = ApiSuccessResponse(BuilderProfileDto);
export type ReadBuilderProfileResponse = z.infer<
  typeof ReadBuilderProfileResponse
>;

/**
 * Builder deletion response.
 */
export const DeleteBuilderResponse = z.string();
export type DeleteBuilderResponse = z.infer<typeof DeleteBuilderResponse>;

/**
 * Profile update request.
 */
export const UpdateBuilderProfileRequest = z.object({
  name: Name,
});
export type UpdateBuilderProfileRequest = z.infer<
  typeof UpdateBuilderProfileRequest
>;

/**
 * Profile update response.
 */
export const UpdateBuilderProfileResponse = z.string();
export type UpdateBuilderProfileResponse = z.infer<
  typeof UpdateBuilderProfileResponse
>;
