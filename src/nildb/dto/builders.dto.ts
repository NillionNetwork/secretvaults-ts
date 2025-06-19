import { z } from "zod";
import { ApiSuccessResponse, Did, Name } from "./common";

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
export const RegisterBuilderResponse = z.void();
export type RegisterBuilderResponse = typeof RegisterBuilderResponse;

/**
 * Builder profile data.
 */
const BuilderProfileDto = z.object({
  _id: Did,
  _created: z.string().datetime(),
  _updated: z.string().datetime(),
  name: z.string(),
  collections: z.array(z.string().uuid()),
  queries: z.array(z.string().uuid()),
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
export const DeleteBuilderResponse = z.void();
export type DeleteBuilderResponse = typeof DeleteBuilderResponse;

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
export const UpdateProfileResponse = z.void();
export type UpdateProfileResponse = typeof UpdateProfileResponse;
