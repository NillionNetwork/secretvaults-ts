import z from "zod";
import { NilDbEndpoint } from "#/common/paths";
import {
  CreateDataResponse,
  type CreateOwnedDataRequest,
} from "#/dto/data.dto";
import type { ReadAboutNodeResponse } from "#/dto/system.dto";
import {
  type DeleteDocumentRequestParams,
  type GrantAccessToDataRequest,
  ListDataReferencesResponse,
  type ReadDataRequestParams,
  ReadDataResponse,
  ReadUserProfileResponse,
  type RevokeAccessToDataRequest,
} from "#/dto/users.dto";
import { NilDbBaseClient, NilDbBaseClientOptions } from "./base-client";

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
  getProfile(token: string): Promise<ReadUserProfileResponse> {
    return this.request({
      path: NilDbEndpoint.v1.users.me,
      token,
      responseSchema: ReadUserProfileResponse,
    });
  }

  /**
   * Lists all data records owned by the authenticated user.
   */
  listDataReferences(token: string): Promise<ListDataReferencesResponse> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.root,
      token,
      responseSchema: ListDataReferencesResponse,
    });
  }

  /**
   * Create user-owned data in an owned collection
   */
  createOwnedData(
    token: string,
    body: CreateOwnedDataRequest,
  ): Promise<CreateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.createOwned,
      method: "POST",
      token,
      body,
      responseSchema: CreateDataResponse,
    });
  }

  /**
   * Retrieves user-owned data by collection and document id.
   */
  readData(
    token: string,
    params: ReadDataRequestParams,
  ): Promise<ReadDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.users.data.byId
        .replace(":collection", params.collection)
        .replace(":document", params.document),
      token,
      responseSchema: ReadDataResponse,
    });
  }

  /**
   * Deletes a user-owned data document.
   */
  async deleteData(
    token: string,
    params: DeleteDocumentRequestParams,
  ): Promise<void> {
    await this.request({
      path: NilDbEndpoint.v1.users.data.byId
        .replace(":collection", params.collection)
        .replace(":document", params.document),
      method: "DELETE",
      token,
      responseSchema: z.string(),
    });
  }

  /**
   * Grants access to user-owned data.
   */
  async grantAccess(
    token: string,
    body: GrantAccessToDataRequest,
  ): Promise<void> {
    const _result = await this.request({
      path: NilDbEndpoint.v1.users.data.acl.grant,
      method: "POST",
      body,
      token,
      responseSchema: z.string(),
    });
  }

  /**
   * Removes access to user-owned data.
   */
  async revokeAccess(
    token: string,
    body: RevokeAccessToDataRequest,
  ): Promise<void> {
    const _result = await this.request({
      path: NilDbEndpoint.v1.users.data.acl.revoke,
      method: "POST",
      body,
      token,
      responseSchema: z.string(),
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
