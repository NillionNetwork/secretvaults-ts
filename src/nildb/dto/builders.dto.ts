import { StatusCodes } from "http-status-codes";
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
export const RegisterBuilderResponse = new Response(null, {
  status: StatusCodes.CREATED,
});
export type RegisterBuilderResponse = typeof RegisterBuilderResponse;

/**
 * Builder profile data.
 */
const ProfileDto = z.object({
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
export const ReadBuilderProfileResponse = ApiSuccessResponse(ProfileDto);
export type ReadBuilderProfileResponse = z.infer<
  typeof ReadBuilderProfileResponse
>;

/**
 * Builder deletion response.
 */
export const DeleteBuilderResponse = new Response(null, {
  status: StatusCodes.NO_CONTENT,
});
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
export const UpdateProfileResponse = new Response(null, {
  status: StatusCodes.NO_CONTENT,
});
export type UpdateProfileResponse = typeof UpdateProfileResponse;
