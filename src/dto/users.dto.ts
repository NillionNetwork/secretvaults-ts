import { z } from "zod/v4";
import { Did } from "#/common/types";
import { ApiSuccessResponse } from "./common";

/**
 * Access control list entry.
 */
export const AclDto = z.object({
  grantee: Did,
  read: z.boolean(),
  write: z.boolean(),
  execute: z.boolean(),
});
export type AclDto = z.infer<typeof AclDto>;

/**
 * User profile data.
 */
const UserProfileData = z.object({
  _id: Did,
  _created: z.iso.datetime(),
  _updated: z.iso.datetime(),
  logs: z.array(
    z.looseObject({
      op: z.string(),
      collection: z.uuid(),
      // present when op is "auth"
      acl: AclDto.optional(),
    }),
  ),
  data: z.array(
    z.object({
      collection: z.uuid(),
      id: z.uuid(),
    }),
  ),
});

/**
 * User profile response.
 */
export const ReadUserProfileResponse = ApiSuccessResponse(UserProfileData);
export type ReadUserProfileResponse = z.infer<typeof ReadUserProfileResponse>;

/**
 * Data read request parameters.
 */
export const ReadDataRequestParams = z.object({
  collection: z.uuid(),
  document: z.uuid(),
});
export type ReadDataRequestParams = z.infer<typeof ReadDataRequestParams>;

const OwnedDataDto = z
  // Allow all keys through since each collection will follow a different schema
  .looseObject({
    _id: z.uuid(),
    _created: z.iso.datetime(),
    _updated: z.iso.datetime(),
    _owner: Did,
    _acl: z.array(AclDto),
  });

export const ReadDataResponse = ApiSuccessResponse(OwnedDataDto);
export type ReadDataResponse = z.infer<typeof ReadDataResponse>;

/**
 * Data document reference.
 */
const DataDocumentReference = z.object({
  builder: Did,
  collection: z.uuid(),
  document: z.uuid(),
});

/**
 * User data references response.
 */
export const ListDataReferencesResponse = ApiSuccessResponse(
  z.array(DataDocumentReference),
);

export type ListDataReferencesResponse = z.infer<
  typeof ListDataReferencesResponse
>;

/**
 * Data ACL read parameters.
 */
export const ReadDataAclRequestParams = z.object({
  collection: z.uuid(),
  document: z.uuid(),
});
export type ReadDataAclRequestParams = z.infer<typeof ReadDataAclRequestParams>;

/**
 * Data access response.
 */
export const ReadDataAccessResponse = ApiSuccessResponse(z.array(AclDto));
export type ReadDataAccessResponse = z.infer<typeof ReadDataAccessResponse>;

/**
 * Grant data access request.
 */
export const GrantAccessToDataRequest = z.object({
  collection: z.uuid(),
  document: z.uuid(),
  acl: AclDto,
});
export type GrantAccessToDataRequest = z.infer<typeof GrantAccessToDataRequest>;

/**
 * Grant data access response.
 */
export const GrantAccessToDataResponse = z.string();
export type GrantAccessToDataResponse = z.infer<
  typeof GrantAccessToDataResponse
>;

/**
 * Revoke data access request.
 */
export const RevokeAccessToDataRequest = z.object({
  grantee: Did,
  collection: z.uuid(),
  document: z.uuid(),
});
export type RevokeAccessToDataRequest = z.infer<
  typeof RevokeAccessToDataRequest
>;

/**
 * Revoke data access response.
 */
export const RevokeAccessToDataResponse = z.string();
export type RevokeAccessToDataResponse = z.infer<
  typeof RevokeAccessToDataResponse
>;

/**
 * Document deletion parameters.
 */
export const DeleteDocumentRequestParams = z.object({
  collection: z.uuid(),
  document: z.uuid(),
});
export type DeleteDocumentRequestParams = z.infer<
  typeof DeleteDocumentRequestParams
>;

/**
 * Document deletion response.
 */
export const DeleteDocumentResponse = z.string();
export type DeleteDocumentResponse = z.infer<typeof DeleteDocumentResponse>;

/**
 * Update user data request.
 */
export const UpdateUserDataRequest = z.object({
  document: z.uuid(),
  collection: z.uuid(),
  update: z.record(z.string(), z.unknown()),
});
export type UpdateUserDataRequest = z.infer<typeof UpdateUserDataRequest>;
