import {
  Builder,
  Codec,
  type Envelope,
  type NilauthClient,
  type NilauthTypes,
  type Did as NucDid,
  type Signer,
  Validator,
} from "@nillion/nuc";
import {
  type AuthContext,
  SecretVaultBaseClient,
  type SecretVaultBaseOptions,
} from "#/base";
import type {
  DeleteBuilderResponse,
  ReadBuilderProfileResponse,
  RegisterBuilderRequest,
  RegisterBuilderResponse,
  UpdateBuilderProfileRequest,
  UpdateBuilderProfileResponse,
} from "#/dto/builders.dto";
import type {
  CreateCollectionIndexRequest,
  CreateCollectionIndexResponse,
  CreateCollectionRequest,
  CreateCollectionResponse,
  DeleteCollectionResponse,
  DropCollectionIndexResponse,
  ListCollectionsResponse,
  ReadCollectionMetadataResponse,
} from "#/dto/collections.dto";
import type {
  ByNodeName,
  DidString,
  Name,
  PaginationQuery,
  Uuid,
} from "#/dto/common";
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
} from "#/dto/data.dto";
import type {
  CreateQueryRequest,
  CreateQueryResponse,
  DeleteQueryResponse,
  ReadQueriesResponse,
  ReadQueryResponse,
  ReadQueryRunByIdResponse,
  RunQueryRequest,
  RunQueryResponse,
} from "#/dto/queries.dto";
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
    rootToken?: Envelope | string;
  };

/**
 * Client for performing builder operations on SecretVaults.
 *
 * This client handles all builder-specific operations including registration,
 * collection management, data operations, and query execution. It supports
 * automatic handling of concealed data when configured with blindfold.
 */
export class SecretVaultBuilderClient extends SecretVaultBaseClient<NilDbBuilderClient> {
  /**
   * Creates and initializes a new SecretVaultBuilderClient instance.
   *
   * @example
   * // Basic instantiation with an auto-generated key
   * const builderClient = await SecretVaultBuilderClient.from({
   *   signer: Signer.generate(),
   *   nilauthClient,
   *   dbs: ["http://localhost:40081", "http://localhost:40082"],
   * });
   *
   * @example
   * // Advanced: Using a custom signer from a browser wallet
   * import { Signer } from "@nillion/nuc";
   *
   * // Assumes window.ethereum is available from a browser wallet like MetaMask
   * const customSigner = await Signer.fromEip1193Provider(window.ethereum);
   *
   * const clientWithSigner = await SecretVaultBuilderClient.from({
   *   signer: customSigner,
   *   nilauthClient,
   *   dbs: ["http://localhost:40081", "http://localhost:40082"],
   * });
   */
  static async from(options: {
    signer: Signer;
    nilauthClient: NilauthClient;
    dbs: string[];
    blindfold?: BlindfoldFactoryConfig;
    rootToken?: Envelope | string;
  }): Promise<SecretVaultBuilderClient> {
    const {
      dbs: baseUrls,
      signer,
      blindfold,
      nilauthClient,
      rootToken,
    } = options;

    const did = await signer.getDid();

    Log.debug(
      {
        did: did.didString,
        dbCount: baseUrls.length,
        blindfold: !!blindfold,
      },
      "Creating SecretVaultBuilderClient",
    );

    // Create clients for each node
    const clientPromises = baseUrls.map((base) =>
      createNilDbBuilderClient(base),
    );
    const clients = await Promise.all(clientPromises);

    let client: SecretVaultBuilderClient;
    if (blindfold) {
      if ("key" in blindfold) {
        // User provided a key
        client = new SecretVaultBuilderClient({
          clients,
          signer,
          key: blindfold.key,
          nilauthClient,
          rootToken,
        });
      } else {
        // Create a new key
        const key = await toBlindfoldKey({
          ...blindfold,
          clusterSize: clients.length,
        });

        client = new SecretVaultBuilderClient({
          clients,
          signer,
          key,
          nilauthClient,
          rootToken,
        });
      }
    } else {
      // No encryption
      client = new SecretVaultBuilderClient({
        clients,
        signer,
        nilauthClient,
        rootToken,
      });
    }

    const clientDid = await client.getDid();
    Log.info(
      {
        id: clientDid.didString.slice(-8),
        nodes: clients.length,
        encryption: client._options.key?.constructor.name ?? "none",
      },
      "SecretVaultBuilderClient created",
    );

    return client;
  }

  #rootToken: Envelope | null = null;
  #nilauthClient: NilauthClient;

  constructor(options: SecretVaultBuilderOptions) {
    super(options);
    this.#nilauthClient = options.nilauthClient;

    // Handle rootToken re-hydration
    if (options.rootToken) {
      if (typeof options.rootToken === "string") {
        this.#rootToken = Codec._unsafeDecodeBase64Url(options.rootToken);
        Log.debug(
          "Root token re-hydrated using _unsafeDecodeBase64Url(string)",
        );
      } else {
        this.#rootToken = options.rootToken;
        Log.debug("Root token re-hydrated from Envelope object");
      }
    }
  }

  get rootToken(): Envelope {
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
    const response = await this.#nilauthClient.requestToken(
      this._options.signer,
      "nildb",
    );

    this.#rootToken = response.token;
    Log.info({ builder: await this.getId() }, "Root token refreshed");
  }

  /**
   * Checks subscription status by the builder's Did.
   */
  async subscriptionStatus(): Promise<NilauthTypes.SubscriptionStatusResponse> {
    return this.#nilauthClient.subscriptionStatus(await this.getDid(), "nildb");
  }

  /**
   * Registers the builder with all nodes in the cluster.
   */
  async register(
    body: RegisterBuilderRequest,
  ): Promise<ByNodeName<RegisterBuilderResponse>> {
    const result = await executeOnCluster(this.nodes, (c) => c.register(body));
    Log.info({ builder: await this.getId() }, "Builder registered");
    return result;
  }

  /**
   * Reads the builder's profile from the cluster.
   */
  async readProfile(options?: {
    auth?: AuthContext;
  }): Promise<ReadBuilderProfileResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.builders.read,
      });

      return client.readProfile(token);
    });

    const result = processPlaintextResponse(resultsByNode);
    Log.info({ builder: await this.getId() }, "Builder profile read");
    return result;
  }

  /**
   * Updates the builder's profile on all nodes.
   */
  async updateBuilderProfile(
    body: UpdateBuilderProfileRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<UpdateBuilderProfileResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.builders.update,
      });

      return client.updateProfile(token, body);
    });

    Log.info(
      { builder: await this.getId(), updateFields: Object.keys(body) },
      "Builder profile updated",
    );
    return result;
  }

  /**
   * Deletes the builder and associated resources from all nodes.
   */
  async deleteBuilder(options?: {
    auth?: AuthContext;
  }): Promise<ByNodeName<DeleteBuilderResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.builders.delete,
      });

      return client.deleteBuilder(token);
    });

    Log.info({ builder: await this.getId() }, "Builder deleted");
    return result;
  }

  /**
   * Creates a new collection on all nodes.
   */
  async createCollection(
    body: CreateCollectionRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<CreateCollectionResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.collections.create,
      });

      return client.createCollection(token, body);
    });

    Log.info(
      { builder: await this.getId(), collection: body.name },
      "Collection created",
    );
    return result;
  }

  /**
   * Reads a list of all collections from the cluster.
   */
  async readCollections(options?: {
    pagination?: PaginationQuery;
    auth?: AuthContext;
  }): Promise<ListCollectionsResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.collections.read,
      });

      return client.readCollections(token, options?.pagination);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info(
      {
        builder: await this.getId(),
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
    options?: { auth?: AuthContext },
  ): Promise<ReadCollectionMetadataResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.collections.read,
      });

      return client.readCollection(token, collection);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info(
      { builder: await this.getId(), collection },
      "Collection metadata read",
    );
    return result;
  }

  /**
   * Deletes a collection its data from all nodes.
   */
  async deleteCollection(
    collection: Uuid,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<DeleteCollectionResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.collections.delete,
      });

      return client.deleteCollection(token, collection);
    });

    Log.info({ builder: await this.getId(), collection }, "Collection deleted");
    return result;
  }

  /**
   * Creates a new index on a collection.
   */
  async createCollectionIndex(
    collection: Uuid,
    body: CreateCollectionIndexRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<CreateCollectionIndexResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.collections.update,
      });

      return client.createCollectionIndex(token, collection, body);
    });

    Log.info(
      {
        builder: await this.getId(),
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
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<DropCollectionIndexResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.collections.update,
      });

      return client.dropCollectionIndex(token, collection, index);
    });

    Log.info(
      {
        builder: await this.getId(),
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
  async createStandardData(
    body: CreateStandardDataRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<CreateDataResponse>> {
    const { key, clients } = this._options;

    const nodePayloads = await prepareRequest({ key, clients, body });

    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.data.create,
      });

      const id = client.id.didString as DidString;
      const payload = nodePayloads[id];
      return client.createStandardData(token, payload);
    });

    Log.info(
      {
        collection: body.collection,
        count: body.data.length,
        builder: await this.getId(),
        isConcealed: !!key,
      },
      "Data created",
    );

    return result;
  }

  /**
   * Retrieves a list of all saved queries.
   */
  async getQueries(options?: {
    pagination?: PaginationQuery;
    auth?: AuthContext;
  }): Promise<ReadQueriesResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      return client.getQueries(token, options?.pagination);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info(
      { builder: await this.getId(), count: result.data?.length || 0 },
      "Queries read",
    );
    return result;
  }

  /**
   * Retrieves a single saved query by its id.
   */
  async getQuery(
    query: Uuid,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<ReadQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      return client.getQuery(token, query);
    });

    Log.info({ query, builder: await this.getId() }, "Query read");
    return result;
  }

  /**
   * Creates a new saved query on all nodes.
   */
  async createQuery(
    body: CreateQueryRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<CreateQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.queries.create,
      });

      return client.createQuery(token, body);
    });

    Log.info(
      {
        builder: await this.getId(),
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
  async deleteQuery(
    query: Uuid,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<DeleteQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.queries.delete,
      });

      return client.deleteQuery(token, query);
    });

    Log.info({ builder: await this.getId(), query }, "Query deleted");
    return result;
  }

  /**
   * Starts a query execution job.
   */
  async runQuery(
    body: RunQueryRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<RunQueryResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.queries.execute,
      });

      return client.runQuery(token, body);
    });

    Log.info(
      {
        builder: await this.getId(),
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
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<ReadQueryRunByIdResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      const id = client.id.didString as DidString;
      const run = runs[id];
      return client.readQueryRunResults(token, run);
    });
  }

  /**
   * Finds data in a collection, revealing concealed values if a key is configured.
   */
  async findData(
    body: FindDataRequest,
    options?: { auth?: AuthContext },
  ): Promise<FindDataResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.data.read,
      });

      return client.findData(token, body);
    });

    const { key } = this._options;
    let result: FindDataResponse;

    if (key) {
      const data = await processConcealedListResponse({ key, resultsByNode });
      const firstResponse = Object.values(resultsByNode)[0];
      result = {
        data,
        pagination: firstResponse.pagination,
      };
    } else {
      result = processPlaintextResponse(resultsByNode);
    }

    Log.info(
      {
        builder: await this.getId(),
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
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<UpdateDataResponse>> {
    const { key, clients } = this._options;

    const nodePayloads = await prepareRequest({ key, clients, body });
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.data.update,
      });

      const id = client.id.didString as DidString;
      return client.updateData(token, nodePayloads[id]);
    });

    Log.info(
      {
        builder: await this.getId(),
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
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<DeleteDataResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        audience: client.id,
        command: NucCmd.nil.db.data.delete,
      });

      return client.deleteData(token, body);
    });

    Log.info(
      {
        builder: await this.getId(),
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
  async flushData(
    collection: Uuid,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<FlushDataResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
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
  async tailData(
    collection: Uuid,
    options?: { limit?: number; auth?: AuthContext },
  ): Promise<TailDataResponse> {
    const limit = options?.limit ?? 10;
    Log.debug({ collection, limit }, "Tailing data");

    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
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

  private async getInvocationFor(options: {
    auth?: AuthContext;
    audience: NucDid;
    command: string;
  }): Promise<string> {
    const { auth, audience, command } = options;

    if (auth?.invocations) {
      const invocation = auth.invocations[audience.didString];
      if (invocation) {
        return Promise.resolve(invocation);
      }
      throw new Error(
        `Invocation for node ${audience.didString} not found in provided 'invocations' map.`,
      );
    }

    const signer = auth?.signer ?? this.signer;
    const defaultExpiresIn = 30_000; // 30 seconds in milli
    const expiryBuffer = 1_000; // 1 second buffer to avoid race conditions

    if (auth?.delegation) {
      const envelope = await Validator.parse(auth.delegation, {
        rootIssuers: [],
      });
      // Calculate remaining lifetime from delegation to avoid exceeding parent's expiry
      const delegationExp = envelope.nuc.payload.exp;
      const remainingMs = delegationExp
        ? delegationExp * 1000 - Date.now() - expiryBuffer
        : defaultExpiresIn;
      const expiresIn = Math.min(
        defaultExpiresIn,
        Math.max(1_000, remainingMs),
      );

      return Builder.invocationFrom(envelope)
        .audience(audience)
        .command(command)
        .expiresIn(expiresIn)
        .signAndSerialize(signer);
    }

    // Fallback to root token - also cap to remaining lifetime
    const rootExp = this.rootToken.nuc.payload.exp;
    const remainingMs = rootExp
      ? rootExp * 1000 - Date.now() - expiryBuffer
      : defaultExpiresIn;
    const expiresIn = Math.min(defaultExpiresIn, Math.max(1_000, remainingMs));

    return Builder.invocationFrom(this.rootToken)
      .command(command)
      .expiresIn(expiresIn)
      .audience(audience)
      .signAndSerialize(signer);
  }
}
