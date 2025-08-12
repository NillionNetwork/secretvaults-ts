import {
  type Command,
  InvocationBody,
  type Keypair,
  NilauthClient,
  type Did as NucDid,
  NucTokenBuilder,
  type NucTokenEnvelope,
  PayerBuilder,
  type SubscriptionStatusResponse,
} from "@nillion/nuc";
import { SecretVaultBaseClient, type SecretVaultBaseOptions } from "#/base";
import { intoSecondsFromNow } from "#/common/utils";
import { Log } from "#/logger";
import {
  type BlindfoldFactoryConfig,
  toBlindfoldKey,
} from "./common/blindfold";
import {
  executeOnCluster,
  prepareRequest,
  processConcealedListResponse,
  processPlaintextResponse,
} from "./common/cluster";
import { NucCmd } from "./common/nuc-cmd";
import { type ByNodeName, Did, type Uuid } from "./common/types";
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
import {
  createNilDbBuilderClient,
  type NilDbBuilderClient,
} from "./nildb/builder-client";

/**
 *
 */
export type SecretVaultBuilderOptions =
  SecretVaultBaseOptions<NilDbBuilderClient> & {
    nilauthClient: NilauthClient;
  };

/**
 * Client for performing builder operations on SecretVaults.
 *
 * This client handles all builder-specific operations including registration,
 * collection management, data operations, and query execution. It supports
 * automatic handling of concealed data when configured with blindfold.
 *
 * @example
 * ```typescript
 * const client = await SecretVaultBuilderClient.from({
 *   keypair: myKeypair,
 *   urls: {
 *     chain: "http://localhost:26657",
 *     auth: "http://localhost:8080",
 *     dbs: ["http://localhost:3000"]
 *   }
 * });
 * ```
 */
export class SecretVaultBuilderClient extends SecretVaultBaseClient<NilDbBuilderClient> {
  /**
   * Creates and initializes a new SecretVaultBuilderClient instance.
   *
   * @param options - Configuration options for the client
   * @param options.keypair - The builder's keypair for authentication
   * @param options.urls - Service URLs configuration
   * @param options.urls.chain - URL of the blockchain service
   * @param options.urls.auth - URL of the authentication service
   * @param options.urls.dbs - Array of database service URLs
   * @param options.blindfold - Optional blindfold configuration for concealed data
   * @returns A promise that resolves to a configured SecretVaultBuilderClient
   *
   * @example
   * ```typescript
   * const client = await SecretVaultBuilderClient.from({
   *   keypair: myKeypair,
   *   urls: {
   *     chain: "http://localhost:26657",
   *     auth: "http://localhost:8080",
   *     dbs: ["http://localhost:3000", "http://localhost:3001"]
   *   },
   *   blindfold: { // optional blindfold config }
   * });
   * ```
   */
  static async from(options: {
    keypair: Keypair;
    urls: {
      chain: string;
      auth: string;
      dbs: string[];
    };
    blindfold?: BlindfoldFactoryConfig;
  }): Promise<SecretVaultBuilderClient> {
    const { urls, keypair, blindfold } = options;

    Log.debug(
      {
        did: keypair.toDid().toString(),
        dbCount: urls.dbs.length,
        blindfold: !!blindfold,
      },
      "Creating SecretVaultBuilderClient",
    );

    const payerBuilder = await new PayerBuilder()
      .keypair(keypair)
      .chainUrl(urls.chain)
      .build();
    const nilauthClient = await NilauthClient.from(urls.auth, payerBuilder);

    // Create clients for each node
    const clientPromises = urls.dbs.map((base) =>
      createNilDbBuilderClient(base),
    );
    const clients = await Promise.all(clientPromises);

    let client: SecretVaultBuilderClient;
    if (blindfold) {
      if ("key" in blindfold) {
        // User provided a key
        client = new SecretVaultBuilderClient({
          clients,
          keypair,
          key: blindfold.key,
          nilauthClient,
        });
      } else {
        // Create a new key
        const key = await toBlindfoldKey({
          ...blindfold,
          clusterSize: clients.length,
        });

        client = new SecretVaultBuilderClient({
          clients,
          keypair,
          key,
          nilauthClient,
        });
      }
    } else {
      // No encryption
      client = new SecretVaultBuilderClient({
        clients,
        keypair,
        nilauthClient,
      });
    }

    Log.info(
      {
        id: keypair.toDid().toString().slice(-8),
        nodes: clients.length,
        encryption: client._options.key?.constructor.name ?? "none",
      },
      "SecretVaultBuilderClient created",
    );

    return client;
  }

  #rootToken: NucTokenEnvelope | null = null;
  #nilauthClient: NilauthClient;

  constructor(options: SecretVaultBuilderOptions) {
    super(options);
    this.#nilauthClient = options.nilauthClient;
  }

  get rootToken(): NucTokenEnvelope {
    if (!this.#rootToken) {
      throw new Error("`refreshRootToken` must be called first");
    }
    return this.#rootToken;
  }

  /**
   * Fetches a new root NUC token from the configured nilAuth server.
   */
  async refreshRootToken(): Promise<void> {
    Log.debug("Refreshing root token");
    const { token } = await this.#nilauthClient.requestToken(
      this._options.keypair,
      "nildb",
    );

    this.#rootToken = token;
    Log.info({ builder: this.id }, "Root token refreshed");
  }

  /**
   * Checks subscription status by the builder's Did.
   */
  subscriptionStatus(): Promise<SubscriptionStatusResponse> {
    return this.#nilauthClient.subscriptionStatus(
      this.keypair.publicKey("hex"),
      "nildb",
    );
  }

  /**
   * Registers the builder with all nodes in the cluster.
   */
  async register(
    body: RegisterBuilderRequest,
  ): Promise<ByNodeName<RegisterBuilderResponse>> {
    const result = await executeOnCluster(this.nodes, (c) => c.register(body));
    Log.info({ builder: this.id }, "Builder registered");
    return result;
  }

  /**
   * Reads the builder's profile from the cluster.
   */
  async readProfile(): Promise<ReadBuilderProfileResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.builders.read,
      });

      return client.readProfile(token);
    });

    const result = processPlaintextResponse(resultsByNode);
    Log.info({ builder: this.id }, "Builder profile read");
    return result;
  }

  /**
   * Updates the builder's profile on all nodes.
   */
  async updateBuilderProfile(
    body: UpdateBuilderProfileRequest,
  ): Promise<ByNodeName<UpdateBuilderProfileResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.builders.update,
      });

      return client.updateProfile(token, body);
    });

    Log.info(
      { builder: this.id, updateFields: Object.keys(body) },
      "Builder profile updated",
    );
    return result;
  }

  /**
   * Deletes the builder and associated resources from all nodes.
   */
  async deleteBuilder(): Promise<ByNodeName<DeleteBuilderResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.builders.delete,
      });

      return client.deleteBuilder(token);
    });

    Log.info({ builder: this.id }, "Builder deleted");
    return result;
  }

  /**
   * Creates a new collection on all nodes.
   */
  async createCollection(
    body: CreateCollectionRequest,
  ): Promise<ByNodeName<CreateCollectionResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.create,
      });

      return client.createCollection(token, body);
    });

    Log.info({ builder: this.id, collection: body.name }, "Collection created");
    return result;
  }

  /**
   * Reads a list of all collections from the cluster.
   */
  async readCollections(): Promise<ListCollectionsResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.read,
      });

      return client.readCollections(token);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info(
      {
        builder: this.id,
        count: result.data?.length || 0,
      },
      "Collections read",
    );

    return result;
  }

  /**
   * Reads the metadata for a single collection.
   */
  async readCollection(
    collection: Uuid,
  ): Promise<ReadCollectionMetadataResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.read,
      });

      return client.readCollection(token, collection);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info({ builder: this.id, collection }, "Collection metadata read");
    return result;
  }

  /**
   * Deletes a collection its data from all nodes.
   */
  async deleteCollection(
    collection: Uuid,
  ): Promise<ByNodeName<DeleteCollectionResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.delete,
      });

      return client.deleteCollection(token, collection);
    });

    Log.info({ builder: this.id, collection }, "Collection deleted");
    return result;
  }

  /**
   * Creates a new index on a collection.
   */
  async createCollectionIndex(
    collection: Uuid,
    body: CreateCollectionIndexRequest,
  ): Promise<ByNodeName<CreateCollectionIndexResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.update,
      });

      return client.createCollectionIndex(token, collection, body);
    });

    Log.info(
      {
        builder: this.id,
        collection,
        name: body.name,
      },
      "Collection index created",
    );

    return result;
  }

  /**
   * Drops an index from a collection.
   */
  async dropCollectionIndex(
    collection: Uuid,
    index: Name,
  ): Promise<ByNodeName<DropCollectionIndexResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.update,
      });

      return client.dropCollectionIndex(token, collection, index);
    });

    Log.info(
      {
        builder: this.id,
        collection,
        index,
      },
      "Collection index dropped",
    );

    return result;
  }

  /**
   * Creates one or more standard data documents in a collection.
   */
  async createStandardData(options: {
    body: CreateStandardDataRequest;
    delegation?: string;
  }): Promise<ByNodeName<CreateDataResponse>> {
    const { body, delegation } = options;
    const { key, clients } = this._options;

    const nodePayloads = await prepareRequest({ key, clients, body });

    const result = await executeOnCluster(this.nodes, (client) => {
      let token = delegation;
      if (!token) {
        token = this.mintRootInvocation({
          audience: client.id,
          command: NucCmd.nil.db.data.create,
        });
      }

      const id = Did.parse(client.id.toString());
      const payload = nodePayloads[id];
      return client.createStandardData(token, payload);
    });

    Log.info(
      {
        collection: body.collection,
        count: body.data.length,
        builder: this.id,
        isConcealed: !!key,
      },
      "Data created",
    );

    return result;
  }

  /**
   * Retrieves a list of all saved queries.
   */
  async getQueries(): Promise<ByNodeName<ReadQueriesResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      return client.getQueries(token);
    });

    Log.info({ builder: this.id }, "Queries read");
    return result;
  }

  /**
   * Retrieves a single saved query by its id.
   */
  async getQuery(query: Uuid): Promise<ByNodeName<ReadQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      return client.getQuery(token, query);
    });

    Log.info({ query, builder: this.id }, "Query read");
    return result;
  }

  /**
   * Creates a new saved query on all nodes.
   */
  async createQuery(
    body: CreateQueryRequest,
  ): Promise<ByNodeName<CreateQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.create,
      });

      return client.createQuery(token, body);
    });

    Log.info(
      {
        builder: this.id,
        name: body.name,
        id: body._id,
        collection: body.collection,
      },
      "Created query",
    );

    return result;
  }

  /**
   * Deletes a saved query from all nodes.
   */
  async deleteQuery(query: Uuid): Promise<ByNodeName<DeleteQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.delete,
      });

      return client.deleteQuery(token, query);
    });

    Log.info({ builder: this.id, query }, "Query deleted");
    return result;
  }

  /**
   * Starts a query execution job.
   */
  async runQuery(body: RunQueryRequest): Promise<ByNodeName<RunQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.execute,
      });

      return client.runQuery(token, body);
    });

    Log.info(
      {
        builder: this.id,
        query: body._id,
        run: Object.values(result)[0]?.data,
      },
      "Started query run",
    );
    return result;
  }

  /**
   * Reads the results of a completed query run from each node.
   */
  readQueryRunResults(
    runs: ByNodeName<Uuid>,
  ): Promise<ByNodeName<ReadQueryRunByIdResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      const id = Did.parse(client.id.toString());
      const run = runs[id];
      return client.readQueryRunResults(token, run);
    });
  }

  /**
   * Finds data in a collection, revealing concealed values if a key is configured.
   */
  async findData(body: FindDataRequest): Promise<FindDataResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.read,
      });

      return client.findData(token, body);
    });

    const { key } = this._options;
    let result: FindDataResponse;

    if (key) {
      const data = await processConcealedListResponse({ key, resultsByNode });
      result = { data };
    } else {
      result = processPlaintextResponse(resultsByNode);
    }

    Log.info(
      {
        builder: this.id,
        collection: body.collection,
        count: result.data?.length || 0,
      },
      "Data found",
    );

    return result;
  }

  /**
   * Updates documents in a collection, concealing the update payload if a key is configured.
   */
  async updateData(
    body: UpdateDataRequest,
  ): Promise<ByNodeName<UpdateDataResponse>> {
    const { key, clients } = this._options;

    const nodePayloads = await prepareRequest({ key, clients, body });
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.update,
      });

      const id = client.id.toString() as Did;
      return client.updateData(token, nodePayloads[id]);
    });

    Log.info(
      {
        builder: this.id,
        collection: body.collection,
        filter: body.filter,
      },
      "Data updated",
    );

    return result;
  }

  /**
   * Deletes data from a collection based on a filter.
   */
  async deleteData(
    body: DeleteDataRequest,
  ): Promise<ByNodeName<DeleteDataResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.delete,
      });

      return client.deleteData(token, body);
    });

    Log.info(
      {
        builder: this.id,
        collection: body.collection,
        filter: body.filter,
      },
      "Data deleted",
    );

    return result;
  }

  /**
   * Deletes all data from a collection.
   */
  async flushData(collection: Uuid): Promise<ByNodeName<FlushDataResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.delete,
      });

      return client.flushData(token, collection);
    });

    Log.info({ collection }, "Flushed data");
    return result;
  }

  /**
   * Reads the last N documents from a collection, revealing concealed values if a key is configured.
   */
  async tailData(collection: Uuid, limit = 10): Promise<TailDataResponse> {
    Log.debug({ collection, limit }, "Tailing data");

    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.read,
      });
      return client.tailData(token, collection, limit);
    });

    const { key } = this._options;
    let result: TailDataResponse;

    if (key) {
      const data = await processConcealedListResponse({ key, resultsByNode });
      result = { data };
    } else {
      result = processPlaintextResponse(resultsByNode);
    }

    Log.info({ collection, count: result.data?.length || 0 }, "Data tailed");

    return result;
  }

  private mintRootInvocation(options: {
    audience: NucDid;
    command: Command;
  }): string {
    return NucTokenBuilder.extending(this.rootToken)
      .command(options.command)
      .body(new InvocationBody({}))
      .expiresAt(intoSecondsFromNow(60))
      .audience(options.audience)
      .build(this.keypair.privateKey());
  }
}
