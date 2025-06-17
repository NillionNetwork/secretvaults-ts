import z from "zod";
import type { Uuid } from "#/common/types";
import { NilDbBaseClient, NilDbBaseClientOptions } from "#/nildb/base-client";
import {
  CreateDataResponse,
  type CreateOwnedDataRequest,
  type CreateStandardDataRequest,
  type DeleteDataRequest,
  DeleteDataResponse,
  type FindDataRequest,
  FindDataResponse,
  TailDataResponse,
  type UpdateDataRequest,
  UpdateDataResponse,
} from "#/nildb/dto/data.dto";
import { NilDbEndpoint } from "#/nildb/paths";
import {
  ReadBuilderProfileResponse,
  type RegisterBuilderRequest,
  type UpdateBuilderProfileRequest,
} from "./dto/builders.dto";
import {
  type CreateCollectionIndexRequest,
  type CreateCollectionRequest,
  ListCollectionsResponse,
  ReadCollectionMetadataResponse,
} from "./dto/collections.dto";
import type { Name } from "./dto/common";
import {
  type CreateQueryRequest,
  ReadQueriesResponse,
  ReadQueryResponse,
  ReadQueryRunByIdResponse,
  type RunQueryRequest,
  RunQueryResponse,
} from "./dto/queries.dto";

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
  #options: NilDbBuilderClientOptions;

  constructor(options: NilDbBuilderClientOptions) {
    super(options);
    this.#options = options;
  }

  /**
   * Registers a new builder.
   */
  register(options: {
    body: RegisterBuilderRequest;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.builders.register,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Retrieves the authenticated builder's profile information.
   */
  getProfile(options: {
    token: string;
  }): Promise<ReadBuilderProfileResponse> {
    return this.request({
      path: NilDbEndpoint.v1.builders.me,
      token: options.token,
      responseSchema: ReadBuilderProfileResponse,
    });
  }

  /**
   * Updates the authenticated builder's profile information.
   */
  updateProfile(options: {
    body: UpdateBuilderProfileRequest;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.builders.me,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Deletes the authenticated builder and all associated resources.
   */
  deleteBuilder(options: {
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.builders.me,
      method: "DELETE",
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Creates a new collection for data validation.
   */
  createCollection(options: {
    body: CreateCollectionRequest;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.collections.root,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Lists all collections owned by the authenticated builder.
   */
  readCollections(options: {
    token: string;
  }): Promise<ListCollectionsResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.root,
      method: "GET",
      token: options.token,
      responseSchema: ListCollectionsResponse,
    });
  }

  /**
   * Deletes a collection by id and all associated data.
   */
  deleteCollection(options: {
    collection: Uuid;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.collections.byId.replace(":id", options.collection),
      method: "DELETE",
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Retrieves a collection by id including metadata.
   */
  readCollection(options: {
    collection: Uuid;
    token: string;
  }): Promise<ReadCollectionMetadataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.collections.byId.replace(":id", options.collection),
      method: "GET",
      token: options.token,
      responseSchema: ReadCollectionMetadataResponse,
    });
  }

  /**
   * Creates an index on a collection.
   */
  createCollectionIndex(options: {
    collection: Uuid;
    body: CreateCollectionIndexRequest;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.collections.indexesById.replace(":id", options.collection),
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Drops an index from a collection.
   */
  dropCollectionIndex(options: {
    collection: Uuid;
    index: Name;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.collections.indexesByNameById
        .replace(":id", options.collection)
        .replace(":name", options.index),
      method: "DELETE",
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Lists all queries owned by the authenticated builder.
   */
  getQueries(options: {
    token: string;
  }): Promise<ReadQueriesResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.root,
      token: options.token,
      responseSchema: ReadQueriesResponse,
    });
  }

  /**
   * Retrieves a query by id.
   */
  getQuery(options: {
    query: Uuid;
    token: string;
  }): Promise<ReadQueryResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.byId.replace(":id", options.query),
      token: options.token,
      responseSchema: ReadQueryResponse,
    });
  }

  /**
   * Creates a new MongoDB aggregation query with variable substitution.
   */
  createQuery(options: {
    body: CreateQueryRequest;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.queries.root,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Deletes a query by id.
   */
  deleteQuery(options: {
    query: Uuid;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.queries.byId.replace(":id", options.query),
      method: "DELETE",
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Executes a query with variable substitution.
   */
  runQuery(options: {
    body: RunQueryRequest;
    token: string;
  }): Promise<RunQueryResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.run,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: RunQueryResponse,
    });
  }

  /**
   * Retrieves the status and results of a background query job.
   */
  readQueryRunResults(options: {
    run: Uuid;
    token: string;
  }): Promise<ReadQueryRunByIdResponse> {
    return this.request({
      path: NilDbEndpoint.v1.queries.runById.replace(":id", options.run),
      token: options.token,
      responseSchema: ReadQueryRunByIdResponse,
    });
  }

  /**
   * Uploads owned data records to a schema-validated collection.
   */
  createOwnedData(options: {
    body: CreateOwnedDataRequest;
    token: string;
  }): Promise<CreateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.createOwned,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: CreateDataResponse,
    });
  }

  /**
   * Uploads standard data records to a schema-validated collection.
   */
  createStandardData(options: {
    body: CreateStandardDataRequest;
    token: string;
  }): Promise<CreateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.createStandard,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: CreateDataResponse,
    });
  }

  /**
   * Searches for data matching the provided filter.
   */
  findData(options: {
    body: FindDataRequest;
    token: string;
  }): Promise<FindDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.find,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: FindDataResponse,
    });
  }

  /**
   * Updates data records matching the provided filter.
   */
  updateData(options: {
    body: UpdateDataRequest;
    token: string;
  }): Promise<UpdateDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.update,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: UpdateDataResponse,
    });
  }

  /**
   * Deletes data records matching the provided filter.
   */
  deleteData(options: {
    body: DeleteDataRequest;
    token: string;
  }): Promise<DeleteDataResponse> {
    return this.request({
      path: NilDbEndpoint.v1.data.delete,
      method: "POST",
      body: options.body,
      token: options.token,
      responseSchema: DeleteDataResponse,
    });
  }

  /**
   * Removes all data from a collection.
   */
  flushData(options: {
    collection: Uuid;
    token: string;
  }): Promise<void> {
    return this.request({
      path: NilDbEndpoint.v1.data.flushById.replace(":id", options.collection),
      method: "DELETE",
      token: options.token,
      responseSchema: z.void(),
    });
  }

  /**
   * Retrieves the most recent data records from a collection.
   */
  tailData(options: {
    collection: Uuid;
    limit?: number;
    token: string;
  }): Promise<TailDataResponse> {
    const limit = options.limit ?? 10;
    return this.request({
      path: `${NilDbEndpoint.v1.data.tailById.replace(":id", options.collection)}?limit=${limit}`,
      method: "GET",
      token: options.token,
      responseSchema: TailDataResponse,
    });
  }
}

export async function createNilDbBuilderClient(
  options: NilDbBuilderClientOptions,
): Promise<NilDbBuilderClient> {
  const validated = NilDbBuilderClientOptions.parse(options);
  return new NilDbBuilderClient(validated);
}
