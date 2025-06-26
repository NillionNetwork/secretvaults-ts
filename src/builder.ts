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
import { intoSecondsFromNow } from "#/common/time";
import {
  type BlindfoldFactoryConfig,
  conceal,
  toBlindfoldKey,
} from "./common/blindfold";
import {
  executeOnCluster,
  prepareConcealedRequest,
  preparePlaintextRequest,
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
 * Client for builders to manage their SecretVaults with automatic handling of concealed data if configured.
 */
export class SecretVaultBuilderClient extends SecretVaultBaseClient<NilDbBuilderClient> {
  /**
   * Creates and initializes a new SecretVaultBuilderClient instance.
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

    if (!blindfold) {
      // No encryption
      return new SecretVaultBuilderClient({
        clients,
        keypair,
        nilauthClient,
      });
    }

    if ("key" in blindfold) {
      // Use a pre-existing key
      return new SecretVaultBuilderClient({
        clients,
        keypair,
        nilauthClient,
        key: blindfold.key,
      });
    }

    const key = await toBlindfoldKey({
      ...blindfold,
      clusterSize: clients.length,
    });

    return new SecretVaultBuilderClient({
      clients,
      keypair,
      nilauthClient,
      key,
    });
  }

  #rootToken: NucTokenEnvelope | null = null;
  #nilauthClient: NilauthClient;

  constructor(options: SecretVaultBuilderOptions) {
    // Pass the common options up to the base class.
    super(options);
    // Handle the specific property here.
    this.#nilauthClient = options.nilauthClient;
  }

  get rootToken(): NucTokenEnvelope {
    if (!this.#rootToken) {
      throw new Error("Call `refreshRootToken` before trying to use it");
    }
    return this.#rootToken;
  }

  /**
   * Fetches a new root NUC token from the configured nilAuth server.
   */
  async refreshRootToken(): Promise<void> {
    const { token } = await this.#nilauthClient.requestToken(
      this._options.keypair,
      "nildb",
    );

    this.#rootToken = token;
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
  register(
    body: RegisterBuilderRequest,
  ): Promise<ByNodeName<RegisterBuilderResponse>> {
    return executeOnCluster(this.nodes, (c) => c.register(body));
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

    return processPlaintextResponse(resultsByNode);
  }

  /**
   * Updates the builder's profile on all nodes.
   */
  updateBuilderProfile(
    body: UpdateBuilderProfileRequest,
  ): Promise<ByNodeName<UpdateBuilderProfileResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.builders.update,
      });

      return client.updateProfile(token, body);
    });
  }

  /**
   * Deletes the builder and associated resources from all nodes.
   */
  deleteBuilder(): Promise<ByNodeName<DeleteBuilderResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.builders.delete,
      });

      return client.deleteBuilder(token);
    });
  }

  /**
   * Creates a new collection on all nodes.
   */
  createCollection(
    body: CreateCollectionRequest,
  ): Promise<ByNodeName<CreateCollectionResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.create,
      });

      return client.createCollection(token, body);
    });
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

    return processPlaintextResponse(resultsByNode);
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

    return processPlaintextResponse(resultsByNode);
  }

  /**
   * Deletes a collection its data from all nodes.
   */
  deleteCollection(
    collection: Uuid,
  ): Promise<ByNodeName<DeleteCollectionResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.delete,
      });

      return client.deleteCollection(token, collection);
    });
  }

  /**
   * Creates a new index on a collection.
   */
  createCollectionIndex(
    collection: Uuid,
    body: CreateCollectionIndexRequest,
  ): Promise<ByNodeName<CreateCollectionIndexResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.update,
      });

      return client.createCollectionIndex(token, collection, body);
    });
  }

  /**
   * Drops an index from a collection.
   */
  dropCollectionIndex(
    collection: Uuid,
    index: Name,
  ): Promise<ByNodeName<DropCollectionIndexResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.collections.update,
      });

      return client.dropCollectionIndex(token, collection, index);
    });
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

    const nodePayloads = key
      ? await prepareConcealedRequest({ key, clients, body })
      : preparePlaintextRequest({ clients, body });

    return executeOnCluster(this.nodes, (client) => {
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
  }

  /**
   * Retrieves a list of all saved queries.
   */
  getQueries(): Promise<ByNodeName<ReadQueriesResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      return client.getQueries(token);
    });
  }

  /**
   * Retrieves a single saved query by its id.
   */
  getQuery(query: Uuid): Promise<ByNodeName<ReadQueryResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.read,
      });

      return client.getQuery(token, query);
    });
  }

  /**
   * Creates a new saved query on all nodes.
   */
  createQuery(
    body: CreateQueryRequest,
  ): Promise<ByNodeName<CreateQueryResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.create,
      });

      return client.createQuery(token, body);
    });
  }

  /**
   * Deletes a saved query from all nodes.
   */
  deleteQuery(query: Uuid): Promise<ByNodeName<DeleteQueryResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.delete,
      });

      return client.deleteQuery(token, query);
    });
  }

  /**
   * Starts a query execution job.
   */
  runQuery(body: RunQueryRequest): Promise<ByNodeName<RunQueryResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.queries.execute,
      });

      return client.runQuery(token, body);
    });
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

    if (key) {
      const data = await processConcealedListResponse({ key, resultsByNode });
      return { data };
    }
    return processPlaintextResponse(resultsByNode);
  }

  /**
   * Updates documents in a collection, concealing the update payload if a key is configured.
   */
  async updateData(
    body: UpdateDataRequest,
  ): Promise<ByNodeName<UpdateDataResponse>> {
    const { key, clients } = this._options;

    let nodePayloads: ByNodeName<UpdateDataRequest>;

    // The update payload is a single object, not an array of documents,
    // so we build the concealed request manually instead of using a helper.
    if (key) {
      const concealedSetShares = await conceal(key, body.update);
      if (concealedSetShares.length !== clients.length) {
        throw new Error("Concealed shares count must match node count.");
      }

      const pairs = clients.map((client, index) => {
        const payload: UpdateDataRequest = {
          ...body,
          update: { $set: concealedSetShares[index] },
        };

        return [client.id.toString(), payload] as const;
      });
      nodePayloads = Object.fromEntries(pairs);
    } else {
      nodePayloads = preparePlaintextRequest({ clients, body });
    }

    return executeOnCluster(this.nodes, (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.data.update)
        .audience(client.id)
        .build(this.keypair.privateKey());

      const id = Did.parse(client.id.toString());
      return client.updateData(token, nodePayloads[id]);
    });
  }

  /**
   * Deletes data from a collection based on a filter.
   */
  deleteData(body: DeleteDataRequest): Promise<ByNodeName<DeleteDataResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.delete,
      });

      return client.deleteData(token, body);
    });
  }

  /**
   * Deletes all data from a collection.
   */
  flushData(collection: Uuid): Promise<ByNodeName<FlushDataResponse>> {
    return executeOnCluster(this.nodes, async (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.delete,
      });

      return client.flushData(token, collection);
    });
  }

  /**
   * Reads the last N documents from a collection, revealing concealed values if a key is configured.
   */
  async tailData(collection: Uuid, limit = 10): Promise<TailDataResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintRootInvocation({
        audience: client.id,
        command: NucCmd.nil.db.data.read,
      });
      return client.tailData(token, collection, limit);
    });

    const { key } = this._options;
    if (key) {
      const data = await processConcealedListResponse({ key, resultsByNode });
      return { data };
    }
    return processPlaintextResponse(resultsByNode);
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
