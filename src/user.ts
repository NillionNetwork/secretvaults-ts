import {
  Builder,
  Codec,
  type Command,
  type Did as NucDid,
  type Signer,
} from "@nillion/nuc";
import {
  type AuthContext,
  SecretVaultBaseClient,
  type SecretVaultBaseOptions,
} from "#/base";
import type { ByNodeName, PaginationQuery } from "#/dto/common";
import type {
  CreateDataResponse,
  CreateOwnedDataRequest,
} from "#/dto/data.dto";
import type {
  DeleteDocumentRequestParams,
  DeleteDocumentResponse,
  GrantAccessToDataRequest,
  GrantAccessToDataResponse,
  ListDataReferencesResponse,
  ReadDataRequestParams,
  ReadDataResponse,
  ReadUserProfileResponse,
  RevokeAccessToDataRequest,
  RevokeAccessToDataResponse,
} from "#/dto/users.dto";
import { Log } from "#/logger";
import {
  type BlindfoldFactoryConfig,
  toBlindfoldKey,
} from "./common/blindfold";
import {
  executeOnCluster,
  prepareRequest,
  processConcealedObjectResponse,
  processPlaintextResponse,
} from "./common/cluster";
import { NucCmd } from "./common/nuc-cmd";
import { intoSecondsFromNow } from "./common/utils";
import {
  createNilDbUserClient,
  type NilDbUserClient,
} from "./nildb/user-client";

export type SecretVaultUserOptions = SecretVaultBaseOptions<NilDbUserClient>;

/**
 * A specific AuthContext for createData, which requires a delegation or invocation.
 */
export type CreateDataAuthContext =
  | { delegation: string; invocation?: never }
  | { invocation: string; delegation?: never };

/**
 * Client for user operations on SecretVaults.
 *
 * This client handles user-specific operations for managing owned documents,
 * including creation, retrieval, updates, and deletion. It supports automatic
 * handling of concealed data when configured with blindfold.
 *
 * @example
 * ```ts
 * const client = await SecretVaultUserClient.from({
 *   keypair: myKeypair,
 *   baseUrls: [
 *     'https://nildb-stg-n1.nillion.network',
 *     'https://nildb-stg-n2.nillion.network',
 *     'https://nildb-stg-n3.nillion.network',
 *   ],
 *   blindfold: { // optional blindfold config }
 * })
 * ```
 */
export class SecretVaultUserClient extends SecretVaultBaseClient<NilDbUserClient> {
  /**
   * Creates and initializes a new SecretVaultUserClient instance.
   *
   * @example
   * // Basic instantiation with an auto-generated key
   * const userClient = await SecretVaultUserClient.from({
   *   signer: Signer.generate(),
   *   baseUrls: ["http://localhost:40081", "http://localhost:40082"],
   * });
   *
   * @example
   * // Advanced: Using a custom signer from a browser wallet
   * import { ethers } from "ethers";
   * import { Signer } from "@nillion/nuc";
   *
   * const provider = new ethers.BrowserProvider(window.ethereum);
   * const ethersSigner = await provider.getSigner();
   * const customSigner = await Signer.fromWeb3(ethersSigner);
   *
   * const clientWithSigner = await SecretVaultUserClient.from({
   *   signer: customSigner,
   *   baseUrls: ["http://localhost:40081", "http://localhost:40082"],
   * });
   */
  static async from(options: {
    signer: Signer;
    baseUrls: string[];
    blindfold?: BlindfoldFactoryConfig;
  }): Promise<SecretVaultUserClient> {
    const { baseUrls, signer, blindfold } = options;

    // Create clients
    const clientPromises = baseUrls.map((u) => createNilDbUserClient(u));
    const clients = await Promise.all(clientPromises);

    let client: SecretVaultUserClient;
    if (blindfold) {
      if ("key" in blindfold) {
        // User provided a key
        client = new SecretVaultUserClient({
          clients,
          signer,
          key: blindfold.key,
        });
      } else {
        // Create a new key
        const key = await toBlindfoldKey({
          ...blindfold,
          clusterSize: clients.length,
        });

        client = new SecretVaultUserClient({
          clients,
          signer,
          key,
        });
      }
    } else {
      // No encryption
      client = new SecretVaultUserClient({
        clients,
        signer,
      });
    }

    const did = await signer.getDid();
    Log.info(
      {
        did: did.didString,
        nodes: clients.length,
        encryption: client._options.key?.constructor.name ?? "none",
      },
      "SecretVaultUserClient created",
    );

    return client;
  }

  /**
   * Reads the user's profile information from the cluster.
   */
  async readProfile(options?: {
    auth?: AuthContext;
  }): Promise<ReadUserProfileResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        command: NucCmd.nil.db.users.root,
        audience: client.id,
      });
      return client.readProfile(token);
    });

    const result = processPlaintextResponse(resultsByNode);
    Log.info({ user: await this.getId() }, "User profile read");
    return result;
  }

  /**
   * Creates one or more data documents owned by the user.
   */
  async createData(
    body: CreateOwnedDataRequest,
    auth: CreateDataAuthContext,
  ): Promise<ByNodeName<CreateDataResponse>> {
    const { key, clients } = this._options;

    // 1. Prepare map of node-id to node-specific payload.
    const nodePayloads = await prepareRequest({ key, clients, body });

    // 2. Execute on all nodes, looking up the payload by node id.
    const result = await executeOnCluster(this.nodes, async (client) => {
      let token: string;
      if ("invocation" in auth && typeof auth.invocation === "string") {
        token = auth.invocation;
      } else {
        // TypeScript knows this is the `delegation` case
        const envelope = Codec.decodeBase64Url(auth.delegation);
        token = await Builder.invocationFrom(envelope)
          .audience(client.id)
          .command(NucCmd.nil.db.data.create as Command)
          .expiresAt(intoSecondsFromNow(60))
          .signAndSerialize(this.signer);
      }

      const id = client.id.didString;
      const payload = nodePayloads[id];
      return client.createOwnedData(token, payload);
    });

    Log.info(
      {
        user: await this.getId(),
        collection: body.collection,
        documents: body.data.length,
        concealed: !!key,
      },
      "User data created",
    );

    return result;
  }

  /**
   * Lists references to all data documents owned by the user.
   */
  async listDataReferences(options?: {
    pagination?: PaginationQuery;
    auth?: AuthContext;
  }): Promise<ListDataReferencesResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        command: NucCmd.nil.db.users.read,
        audience: client.id,
      });
      return client.listDataReferences(token, options?.pagination);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info(
      { user: await this.getId(), count: result.data?.length || 0 },
      "User data references listed",
    );

    return result;
  }

  /**
   * Reads a single data document, automatically revealing concealed values if a key is configured.
   */
  async readData(
    params: ReadDataRequestParams,
    options?: { auth?: AuthContext },
  ): Promise<ReadDataResponse> {
    // 1. Fetch the raw data from all nodes.
    const resultsByNode = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        command: NucCmd.nil.db.users.read,
        audience: client.id,
      });
      return client.readData(token, params);
    });

    const { key } = this._options;
    let result: ReadDataResponse;

    // 2. If a key is configured, process the results for concealed values and then reveal them
    if (key) {
      const data = await processConcealedObjectResponse({
        key,
        resultsByNode,
      });
      result = { data } as ReadDataResponse;
    } else {
      // 3. No key so process as plain text
      result = processPlaintextResponse(resultsByNode);
    }

    Log.info(
      {
        user: await this.getId(),
        collection: params.collection,
        document: params.document,
      },
      "User data read",
    );

    return result;
  }

  /**
   * Deletes a user-owned document from all nodes.
   */
  async deleteData(
    params: DeleteDocumentRequestParams,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<DeleteDocumentResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        command: NucCmd.nil.db.users.delete,
        audience: client.id,
      });
      return client.deleteData(token, params);
    });

    Log.info(
      {
        user: await this.getId(),
        collection: params.collection,
        document: params.document,
      },
      "User data deleted",
    );

    return result;
  }

  /**
   * Grants a given Did access to a given user-owned document.
   */
  async grantAccess(
    body: GrantAccessToDataRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<GrantAccessToDataResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        command: NucCmd.nil.db.users.update,
        audience: client.id,
      });
      return client.grantAccess(token, body);
    });

    Log.info(
      {
        user: await this.getId(),
        collection: body.collection,
        document: body.document,
        grantee: body.acl.grantee,
      },
      "Data access granted",
    );

    return result;
  }

  /**
   * Revokes access for a given Did to the specified user-owned document.
   */
  async revokeAccess(
    body: RevokeAccessToDataRequest,
    options?: { auth?: AuthContext },
  ): Promise<ByNodeName<RevokeAccessToDataResponse>> {
    const result = await executeOnCluster(this.nodes, async (client) => {
      const token = await this.getInvocationFor({
        auth: options?.auth,
        command: NucCmd.nil.db.users.update,
        audience: client.id,
      });
      return client.revokeAccess(token, body);
    });

    Log.info(
      {
        user: await this.getId(),
        collection: body.collection,
        document: body.document,
        revokee: body.grantee,
      },
      "Data access revoked",
    );

    return result;
  }

  private async getInvocationFor(options: {
    auth?: AuthContext;
    command: string;
    audience: NucDid;
  }): Promise<string> {
    const { auth, command, audience } = options;

    if (auth?.invocation) {
      return Promise.resolve(auth.invocation);
    }

    const signer = auth?.signer ?? this.signer;
    const expiresAt = intoSecondsFromNow(60);

    if (auth?.delegation) {
      const envelope = Codec.decodeBase64Url(auth.delegation);
      return Builder.invocationFrom(envelope)
        .audience(audience)
        .command(command as Command)
        .expiresAt(expiresAt)
        .signAndSerialize(signer);
    }

    // Fallback to self-signed invocation
    return Builder.invocation()
      .command(command as Command)
      .subject(await this.getDid())
      .audience(audience)
      .expiresAt(expiresAt)
      .signAndSerialize(signer);
  }
}
