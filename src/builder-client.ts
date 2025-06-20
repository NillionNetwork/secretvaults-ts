import {
  type Did,
  InvocationBody,
  type Keypair,
  type NilauthClient,
  NucTokenBuilder,
  type NucTokenEnvelope,
  type SubscriptionStatusResponse,
} from "@nillion/nuc";
import { intoSecondsFromNow } from "#/common/time";
import { NucCmd } from "./common/nuc-cmd";
import type { ByNodeName, Uuid } from "./common/types";
import type {
  DeleteBuilderResponse,
  ReadBuilderProfileResponse,
  RegisterBuilderRequest,
  RegisterBuilderResponse,
  UpdateBuilderProfileRequest,
  UpdateBuilderProfileResponse,
} from "./dto/builders.dto";
import type {
  CreateCollectionIndexRequest,
  CreateCollectionIndexResponse,
  CreateCollectionRequest,
  CreateCollectionResponse,
  DeleteCollectionResponse,
  DropCollectionIndexResponse,
  ListCollectionsResponse,
  ReadCollectionMetadataResponse,
} from "./dto/collections.dto";
import type { Name } from "./dto/common";
import type {
  CreateDataResponse,
  CreateStandardDataRequest,
  DeleteDataRequest,
  DeleteDataResponse,
  FindDataRequest,
  FindDataResponse,
  FlushDataResponse,
  TailDataResponse,
  UpdateDataRequest,
  UpdateDataResponse,
} from "./dto/data.dto";
import type {
  CreateQueryRequest,
  CreateQueryResponse,
  DeleteQueryResponse,
  ReadQueriesResponse,
  ReadQueryResponse,
  ReadQueryRunByIdResponse,
  RunQueryRequest,
  RunQueryResponse,
} from "./dto/queries.dto";
import type { ReadAboutNodeResponse } from "./dto/system.dto";
import type { NilDbBuilderClient } from "./nildb/builder-client";

/**
 *
 */
export type SecretVaultBuilderOptions = {
  nilauthClient: NilauthClient;
  clients: NilDbBuilderClient[];
  keypair: Keypair;
};

/**
 * - payments are not handled by the builder client
 */
export class SecretVaultBuilderClient {
  _options: SecretVaultBuilderOptions;
  #rootToken: NucTokenEnvelope | null = null;

  constructor(options: SecretVaultBuilderOptions) {
    this._options = options;
  }

  get keypair(): Keypair {
    return this._options.keypair;
  }

  get did(): Did {
    return this.keypair.toDid();
  }

  get nodes(): NilDbBuilderClient[] {
    return this._options.clients;
  }

  get rootToken(): NucTokenEnvelope {
    if (!this.#rootToken) {
      throw new Error("Call `refreshRootToken` before trying to use it");
    }
    return this.#rootToken;
  }

  async refreshRootToken(): Promise<void> {
    const { token } = await this._options.nilauthClient.requestToken(
      this._options.keypair,
      "nildb",
    );

    this.#rootToken = token;
  }

  private async executeOnAllNodes<T>(
    operation: (client: NilDbBuilderClient) => Promise<T>,
  ): Promise<Record<string, T>> {
    const promises = this.nodes.map(async (client) => ({
      name: client.name,
      result: await operation(client),
    }));

    const results = await Promise.all(promises);

    return results.reduce(
      (acc, { name, result }) => {
        acc[name] = result;
        return acc;
      },
      {} as Record<string, T>,
    );
  }

  subscriptionStatus(): Promise<SubscriptionStatusResponse> {
    return this._options.nilauthClient.subscriptionStatus(
      this.keypair.publicKey("hex"),
      "nildb",
    );
  }

  readClusterInfo(): Promise<ByNodeName<ReadAboutNodeResponse>> {
    return this.executeOnAllNodes((client) => client.aboutNode());
  }

  register(
    body: RegisterBuilderRequest,
  ): Promise<ByNodeName<RegisterBuilderResponse>> {
    return this.executeOnAllNodes(async (client) => {
      return client.register(body);
    });
  }

  readBuilderProfile(): Promise<ByNodeName<ReadBuilderProfileResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.builders.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.getProfile(token);
    });
  }

  updateBuilderProfile(
    body: UpdateBuilderProfileRequest,
  ): Promise<ByNodeName<UpdateBuilderProfileResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.builders.update)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.updateProfile(token, body);
    });
  }

  deleteBuilder(): Promise<ByNodeName<DeleteBuilderResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.builders.delete)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.deleteBuilder(token);
    });
  }

  createCollection(
    body: CreateCollectionRequest,
  ): Promise<ByNodeName<CreateCollectionResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.create)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.createCollection(token, body);
    });
  }

  readCollections(): Promise<ByNodeName<ListCollectionsResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.readCollections(token);
    });
  }

  readCollection(
    collection: Uuid,
  ): Promise<ByNodeName<ReadCollectionMetadataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.readCollection(token, collection);
    });
  }

  deleteCollection(
    collection: Uuid,
  ): Promise<ByNodeName<DeleteCollectionResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.delete)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.deleteCollection(token, collection);
    });
  }

  createCollectionIndex(
    collection: Uuid,
    body: CreateCollectionIndexRequest,
  ): Promise<ByNodeName<CreateCollectionIndexResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.update)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.createCollectionIndex(token, collection, body);
    });
  }

  dropCollectionIndex(
    collection: Uuid,
    index: Name,
  ): Promise<ByNodeName<DropCollectionIndexResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.update)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.dropCollectionIndex(token, collection, index);
    });
  }

  createStandardData(options: {
    body: CreateStandardDataRequest;
    delegation?: string;
  }): Promise<ByNodeName<CreateDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const { body, delegation } = options;
      let token = delegation;

      if (!token) {
        token = NucTokenBuilder.extending(this.rootToken)
          .command(NucCmd.nil.db.data.create)
          .body(new InvocationBody({}))
          .expiresAt(intoSecondsFromNow(60))
          .audience(client.did)
          .build(this._options.keypair.privateKey());
      }

      return client.createStandardData(token, body);
    });
  }

  getQueries(): Promise<ByNodeName<ReadQueriesResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.queries.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.getQueries(token);
    });
  }

  getQuery(query: Uuid): Promise<ByNodeName<ReadQueryResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.queries.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.getQuery(token, query);
    });
  }

  createQuery(
    body: CreateQueryRequest,
  ): Promise<ByNodeName<CreateQueryResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.queries.create)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.createQuery(token, body);
    });
  }

  deleteQuery(query: Uuid): Promise<ByNodeName<DeleteQueryResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.queries.delete)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.deleteQuery(token, query);
    });
  }

  runQuery(body: RunQueryRequest): Promise<ByNodeName<RunQueryResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.queries.execute)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.runQuery(token, body);
    });
  }

  readQueryRunResults(
    runs: ByNodeName<Uuid>,
  ): Promise<ByNodeName<ReadQueryRunByIdResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.queries.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      const run = runs[client.name];
      return client.readQueryRunResults(token, run);
    });
  }

  findData(body: FindDataRequest): Promise<ByNodeName<FindDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.data.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.findData(token, body);
    });
  }

  updateData(body: UpdateDataRequest): Promise<ByNodeName<UpdateDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.data.update)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.updateData(token, body);
    });
  }

  deleteData(body: DeleteDataRequest): Promise<ByNodeName<DeleteDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.data.delete)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.deleteData(token, body);
    });
  }

  flushData(collection: Uuid): Promise<ByNodeName<FlushDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.data.delete)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.flushData(token, collection);
    });
  }

  tailData(
    collection: Uuid,
    limit = 10,
  ): Promise<ByNodeName<TailDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.data.read)
        .body(new InvocationBody({}))
        .expiresAt(intoSecondsFromNow(60))
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.tailData(token, collection, limit);
    });
  }
}
