import {
  type Command,
  InvocationBody,
  type Keypair,
  type Did as NucDid,
  NucTokenBuilder,
  NucTokenEnvelopeSchema,
} from "@nillion/nuc";
import { SecretVaultBaseClient, type SecretVaultBaseOptions } from "#/base";
import { Log } from "#/logger";
import {
  type BlindfoldFactoryConfig,
  toBlindfoldKey,
} from "./common/blindfold";
import {
  executeOnCluster,
  prepareConcealedRequest,
  preparePlaintextRequest,
  processConcealedObjectResponse,
  processPlaintextResponse,
} from "./common/cluster";
import { NucCmd } from "./common/nuc-cmd";
import { intoSecondsFromNow } from "./common/time";
import { type ByNodeName, Did } from "./common/types";
import type {
  CreateDataResponse,
  CreateOwnedDataRequest,
} from "./dto/data.dto";
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
} from "./dto/users.dto";
import {
  createNilDbUserClient,
  type NilDbUserClient,
} from "./nildb/user-client";

export type SecretVaultUserOptions = SecretVaultBaseOptions<NilDbUserClient>;

/**
 * Client for users to manage owned-documents in SecretVaults.
 */
export class SecretVaultUserClient extends SecretVaultBaseClient<NilDbUserClient> {
  /**
   * Creates and initializes a new SecretVaultUserClient instance.
   */
  static async from(options: {
    keypair: Keypair;
    baseUrls: string[];
    blindfold?: BlindfoldFactoryConfig;
  }): Promise<SecretVaultUserClient> {
    const { baseUrls, keypair, blindfold } = options;

    // Create clients
    const clientPromises = baseUrls.map((u) => createNilDbUserClient(u));
    const clients = await Promise.all(clientPromises);

    let client: SecretVaultUserClient;
    if (blindfold) {
      if ("key" in blindfold) {
        // User provided a key
        client = new SecretVaultUserClient({
          clients,
          keypair,
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
          keypair,
          key,
        });
      }
    } else {
      // No encryption
      client = new SecretVaultUserClient({
        clients,
        keypair,
      });
    }

    Log.info(
      {
        did: keypair.toDid().toString(),
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
  async readProfile(): Promise<ReadUserProfileResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.root,
        audience: client.id,
      });
      return client.readProfile(token);
    });

    const result = processPlaintextResponse(resultsByNode);
    Log.info({ user: this.id }, "User profile read");
    return result;
  }

  /**
   * Creates one or more data documents owned by the user.
   */
  async createData(
    delegation: string,
    body: CreateOwnedDataRequest,
  ): Promise<ByNodeName<CreateDataResponse>> {
    const { key, clients } = this._options;

    // 1. Prepare map of node-id to node-specific payload.
    const nodePayloads = key
      ? await prepareConcealedRequest({ key, clients, body })
      : preparePlaintextRequest({ clients, body });

    // 2. Execute on all nodes, looking up the payload by node id.
    const result = await executeOnCluster(this.nodes, (client) => {
      const envelop = NucTokenEnvelopeSchema.parse(delegation);
      const token = NucTokenBuilder.extending(envelop)
        .audience(client.id)
        .command(NucCmd.nil.db.data.create)
        .expiresAt(intoSecondsFromNow(60))
        .body(new InvocationBody({}))
        .build(this.keypair.privateKey());

      const id = Did.parse(client.id.toString());
      const payload = nodePayloads[id];
      return client.createOwnedData(token, payload);
    });

    Log.info(
      {
        user: this.id,
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
  async listDataReferences(): Promise<ListDataReferencesResponse> {
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.read,
        audience: client.id,
      });
      return client.listDataReferences(token);
    });

    const result = processPlaintextResponse(resultsByNode);

    Log.info(
      { user: this.id, count: result.data?.length || 0 },
      "User data references listed",
    );

    return result;
  }

  /**
   * Reads a single data document, automatically revealing concealed values if a key is configured.
   */
  async readData(params: ReadDataRequestParams): Promise<ReadDataResponse> {
    // 1. Fetch the raw data from all nodes.
    const resultsByNode = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
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
        user: this.id,
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
  ): Promise<ByNodeName<DeleteDocumentResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.delete,
        audience: client.id,
      });
      return client.deleteData(token, params);
    });

    Log.info(
      {
        user: this.id,
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
  ): Promise<ByNodeName<GrantAccessToDataResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.update,
        audience: client.id,
      });
      return client.grantAccess(token, body);
    });

    Log.info(
      {
        user: this.id,
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
  ): Promise<ByNodeName<RevokeAccessToDataResponse>> {
    const result = await executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.update,
        audience: client.id,
      });
      return client.revokeAccess(token, body);
    });

    Log.info(
      {
        user: this.id,
        collection: body.collection,
        document: body.document,
        revokee: body.grantee,
      },
      "Data access revoked",
    );

    return result;
  }

  private mintInvocation(options: {
    command: Command;
    audience: NucDid;
  }): string {
    const builder = NucTokenBuilder.invocation({});

    return builder
      .command(options.command)
      .subject(this.did)
      .audience(options.audience)
      .expiresAt(intoSecondsFromNow(60))
      .build(this.keypair.privateKey());
  }
}
