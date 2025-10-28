import { z } from "zod";
import { NilDbEndpoint } from "#/common/paths";
import {
  DeleteBuilderResponse,
  ReadBuilderProfileResponse,
  type RegisterBuilderRequest,
  RegisterBuilderResponse,
  type UpdateBuilderProfileRequest,
  UpdateBuilderProfileResponse,
} from "#/dto/builders.dto";
import {
  type CreateCollectionIndexRequest,
  CreateCollectionIndexResponse,
  type CreateCollectionRequest,
  CreateCollectionResponse,
  DeleteCollectionResponse,
  DropCollectionIndexResponse,
  ListCollectionsResponse,
  ReadCollectionMetadataResponse,
} from "#/dto/collections.dto";
import type { Name, PaginationQuery, Uuid } from "#/dto/common";
import {
  CreateDataResponse,
  type CreateStandardDataRequest,
  type DeleteDataRequest,
  DeleteDataResponse,
  type FindDataRequest,
  FindDataResponse,
  FlushDataResponse,
  TailDataResponse,
  type UpdateDataRequest,
  UpdateDataResponse,
} from "#/dto/data.dto";
import {
  type CreateQueryRequest,
  CreateQueryResponse,
  DeleteQueryResponse,
  ReadQueriesResponse,
  ReadQueryResponse,
  ReadQueryRunByIdResponse,
  type RunQueryRequest,
  RunQueryResponse,
} from "#/dto/queries.dto";
import type { ReadAboutNodeResponse } from "#/dto/system.dto";
import { NilDbBaseClient, NilDbBaseClientOptions } from "#/nildb/base-client";

export const NilDbBuilderClientOptions = z.object({
  ...NilDbBaseClientOptions.shape,
});
export type NilDbBuilderClientOptions = z.infer<
  typeof NilDbBuilderClientOptions
>;

/**
 *
 */
export class NilDbBuilderClient extends NilDbBaseClient {
  /**
   * Registers a new builder.
   */
  register(body: RegisterBuilderRequest): Promise<RegisterBuilderResponse> {
    return this.request({
      path: NilDbEndpoint.v1.builders.register,
      method: "POST",
      body,
      responseSchema: RegisterBuilderResponse,
    });
  }

  /**
   * Retrieves the authenticated builder's profile information.
   */
  readProfile(token: string): Promise<ReadBuilderProfileResponse> {
    return this.request({
      path: NilDbEndpoint.v1.builders.me,
      token,
      responseSchema: ReadBuilderProfileResponse,
    });
  }

  /**
   * Updates the authenticated builder's profile information.
   */
  updateProfile(
    token: string,
    body: UpdateBuilderProfileRequest,
  ): Promise<UpdateBuilderProfileResponse> {
    return this.request({
      path: NilDbEndpoint.v1.builders.me,
      method: "POST",
      body,
      token,
      responseSchema: UpdateBuilderProfileResponse,
    });
  }

  /**
   * Deletes the authenticated builder and all associated resources.
   */
  deleteBuilder(token: string): Promise<DeleteBuilderResponse> {
    return this.request({
      path: NilDbEndpoint.v1.builders.me,
      method: "DELETE",
      token,
      responseSchema: DeleteBuilderResponse,
    });
  }

  /**
   * Creates a new collection for data validation.
   */
  createCollection(
    token: string,
    body: CreateCollectionRequest,
  ): Promise<CreateCollectionResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.root,
      method: "POST",
      body,
      token,
      responseSchema: CreateCollectionResponse,
    });
  }

  /**
   * Lists all collections owned by the authenticated builder.
   */
  readCollections(
    token: string,
    pagination?: PaginationQuery,
  ): Promise<ListCollectionsResponse> {
    let path: string = NilDbEndpoint.v1.collections.root;
    if (pagination) {
      const params = new URLSearchParams();
      if (pagination.limit !== undefined) {
        params.set("limit", String(pagination.limit));
      }
      if (pagination.offset !== undefined) {
        params.set("offset", String(pagination.offset));
      }
      if (pagination.sort) {
        for (const [key, value] of Object.entries(pagination.sort)) {
          params.append(`sort[${key}]`, String(value));
        }
      }
      path = `${path}?${params.toString()}`;
    }
    return this.request({
      path,
      method: "GET",
      token,
      responseSchema: ListCollectionsResponse,
    });
  }

  /**
   * Deletes a collection by id and all associated data.
   */
  deleteCollection(
    token: string,
    collection: Uuid,
  ): Promise<DeleteCollectionResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.byId.replace(":id", collection),
      method: "DELETE",
      token,
      responseSchema: DeleteCollectionResponse,
    });
  }

  /**
   * Retrieves a collection by id including metadata.
   */
  readCollection(
    token: string,
    collection: Uuid,
  ): Promise<ReadCollectionMetadataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.byId.replace(":id", collection),
      method: "GET",
      token,
      responseSchema: ReadCollectionMetadataResponse,
    });
  }

  /**
   * Creates an index on a collection.
   */
  createCollectionIndex(
    token: string,
    collection: Uuid,
    body: CreateCollectionIndexRequest,
  ): Promise<CreateCollectionIndexResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.indexesById.replace(":id", collection),
      method: "POST",
      body,
      token,
      responseSchema: CreateCollectionIndexResponse,
    });
  }

  /**
   * Drops an index from a collection.
   */
  dropCollectionIndex(
    token: string,
    collection: Uuid,
    index: Name,
  ): Promise<DropCollectionIndexResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.indexesByNameById
        .replace(":id", collection)
        .replace(":name", index),
      method: "DELETE",
      token,
      responseSchema: DropCollectionIndexResponse,
    });
  }

  /**
   * Lists all queries owned by the authenticated builder.
   */
  getQueries(
    token: string,
    pagination?: PaginationQuery,
  ): Promise<ReadQueriesResponse> {
    let path: string = NilDbEndpoint.v1.queries.root;
    if (pagination) {
      const params = new URLSearchParams();
      if (pagination.limit !== undefined) {
        params.set("limit", String(pagination.limit));
      }
      if (pagination.offset !== undefined) {
        params.set("offset", String(pagination.offset));
      }
      if (pagination.sort) {
        for (const [key, value] of Object.entries(pagination.sort)) {
          params.append(`sort[${key}]`, String(value));
        }
      }
      path = `${path}?${params.toString()}`;
    }
    return this.request({
      path,
      token,
      responseSchema: ReadQueriesResponse,
    });
  }

  /**
   * Retrieves a query by id.
   */
  getQuery(token: string, query: Uuid): Promise<ReadQueryResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.byId.replace(":id", query),
      token,
      responseSchema: ReadQueryResponse,
    });
  }

  /**
   * Creates a new MongoDB aggregation query with variable substitution.
   */
  createQuery(
    token: string,
    body: CreateQueryRequest,
  ): Promise<CreateQueryResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.root,
      method: "POST",
      body,
      token,
      responseSchema: CreateQueryResponse,
    });
  }

  /**
   * Deletes a query by id.
   */
  deleteQuery(token: string, query: Uuid): Promise<DeleteQueryResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.byId.replace(":id", query),
      method: "DELETE",
      token,
      responseSchema: DeleteQueryResponse,
    });
  }

  /**
   * Executes a query with variable substitution.
   */
  runQuery(token: string, body: RunQueryRequest): Promise<RunQueryResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.run,
      method: "POST",
      body,
      token,
      responseSchema: RunQueryResponse,
    });
  }

  /**
   * Retrieves the status and results of a background query job.
   */
  readQueryRunResults(
    token: string,
    run: Uuid,
  ): Promise<ReadQueryRunByIdResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.runById.replace(":id", run),
      token,
      responseSchema: ReadQueryRunByIdResponse,
    });
  }

  /**
   * Uploads standard data records to a schema-validated collection.
   */
  createStandardData(
    token: string,
    body: CreateStandardDataRequest,
  ): Promise<CreateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.createStandard,
      method: "POST",
      body,
      token,
      responseSchema: CreateDataResponse,
    });
  }

  /**
   * Searches for data matching the provided filter.
   */
  findData(token: string, body: FindDataRequest): Promise<FindDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.find,
      method: "POST",
      body,
      token,
      responseSchema: FindDataResponse,
    });
  }

  /**
   * Updates data records matching the provided filter.
   */
  updateData(
    token: string,
    body: UpdateDataRequest,
  ): Promise<UpdateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.update,
      method: "POST",
      body,
      token,
      responseSchema: UpdateDataResponse,
    });
  }

  /**
   * Deletes data records matching the provided filter.
   */
  deleteData(
    token: string,
    body: DeleteDataRequest,
  ): Promise<DeleteDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.delete,
      method: "POST",
      body,
      token,
      responseSchema: DeleteDataResponse,
    });
  }

  /**
   * Removes all data from a collection.
   */
  flushData(token: string, collection: Uuid): Promise<FlushDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.flushById.replace(":id", collection),
      method: "DELETE",
      token,
      responseSchema: FlushDataResponse,
    });
  }

  /**
   * Retrieves the most recent data records from a collection.
   */
  tailData(
    token: string,
    collection: Uuid,
    limit = 10,
  ): Promise<TailDataResponse> {
    return this.request({
      path: `${NilDbEndpoint.v1.data.tailById.replace(":id", collection)}?limit=${limit}`,
      method: "GET",
      token,
      responseSchema: TailDataResponse,
    });
  }
}

export async function createNilDbBuilderClient(
  baseUrl: string,
): Promise<NilDbBuilderClient> {
  const response = await fetch(`${baseUrl}/about`);
  const body = (await response.json()) as ReadAboutNodeResponse;

  const validated = NilDbBuilderClientOptions.parse({
    about: body,
    baseUrl: baseUrl,
  });

  return new NilDbBuilderClient(validated);
}
