import z from "zod";
import type { Uuid } from "#/common/types";
import {
  CreateDataResponse,
  type CreateOwnedDataRequest,
} from "#/nildb/dto/data.dto";
import type { ReadAboutNodeResponse } from "#/nildb/dto/system.dto";
import { NilDbBaseClient, NilDbBaseClientOptions } from "./base-client";
import {
  type GrantAccessToDataRequest,
  ListDataReferencesResponse,
  ReadDataResponse,
  ReadProfileResponse,
  type RevokeAccessToDataRequest,
} from "./dto/users.dto";
import { NilDbEndpoint } from "./paths";

export const NilDbUserClientOptions = z.object({
  ...NilDbBaseClientOptions.shape,
});

export type NilDbUserClientOptions = z.infer<typeof NilDbUserClientOptions>;

export class NilDbUserClient extends NilDbBaseClient {
  #options: NilDbUserClientOptions;

  constructor(options: NilDbUserClientOptions) {
    super(options);
    this.#options = options;
  }

  /**
   * Retrieves the authenticated user's profile information.
   */
  getProfile(options: { token: string }): Promise<ReadProfileResponse> {
    return this.request({
      path: NilDbEndpoint.v1.users.me,
      token: options.token,
      responseSchema: ReadProfileResponse,
    });
  }

  /**
   * Lists all data records owned by the authenticated user.
   */
  listDataReferences(options: {
    token: string;
  }): Promise<ListDataReferencesResponse> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.root,
      token: options.token,
      responseSchema: ListDataReferencesResponse,
    });
  }

  /**
   * Create user-owned data in an owned collection
   */
  createOwnedData(options: {
    token: string;
    body: CreateOwnedDataRequest;
  }): Promise<CreateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.createOwned,
      method: "POST",
      token: options.token,
      body: options.body,
      responseSchema: CreateDataResponse,
    });
  }

  /**
   * Retrieves user-owned data by collection and document id.
   */
  readData(options: {
    token: string;
    collection: Uuid;
    document: Uuid;
  }): Promise<ReadDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.byId
        .replace(":collection", options.collection)
        .replace(":document", options.document),
      token: options.token,
      responseSchema: ReadDataResponse,
    });
  }

  /**
   * Deletes a user-owned data document.
   */
  deleteData(options: {
    token: string;
    collection: Uuid;
    document: Uuid;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.byId
        .replace(":collection", options.collection)
        .replace(":document", options.document),
      method: "DELETE",
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Grants access to user-owned data.
   */
  grantAccess(options: {
    token: string;
    body: GrantAccessToDataRequest;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.acl.grant,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Removes access to user-owned data.
   */
  revokeAccess(options: {
    token: string;
    body: RevokeAccessToDataRequest;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.acl.revoke,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }
}

export async function createNilDbUserClient(
  baseUrl: string,
): Promise<NilDbUserClient> {
  const response = await fetch(`${baseUrl}/about`);
  const about = (await response.json()) as ReadAboutNodeResponse;

  const validated = NilDbUserClientOptions.parse({
    about,
    baseUrl,
  });

  return new NilDbUserClient(validated);
}
