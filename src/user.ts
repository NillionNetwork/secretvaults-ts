import {
  type Command,
  InvocationBody,
  type Keypair,
  type Did as NucDid,
  NucTokenBuilder,
  NucTokenEnvelopeSchema,
} from "@nillion/nuc";
import { SecretVaultBaseClient, type SecretVaultBaseOptions } from "#/base";
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
    const clientPromises = baseUrls.map((baseUrl) =>
      createNilDbUserClient(baseUrl),
    );
    const clients = await Promise.all(clientPromises);

    if (!blindfold) {
      // No encryption
      return new SecretVaultUserClient({
        clients,
        keypair,
      });
    }

    if ("key" in blindfold) {
      return new SecretVaultUserClient({
        clients,
        keypair,
        key: blindfold.key,
      });
    }

    const key = await toBlindfoldKey({
      ...blindfold,
      clusterSize: clients.length,
    });

    return new SecretVaultUserClient({
      clients,
      keypair,
      key,
    });
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

    return processPlaintextResponse(resultsByNode);
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
    return executeOnCluster(this.nodes, (client) => {
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

    return processPlaintextResponse(resultsByNode);
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

    // 2. If a key is configured, process the results for concealed values and then reveal them
    if (key) {
      const data = await processConcealedObjectResponse({
        key,
        resultsByNode,
      });
      return { data } as ReadDataResponse;
    }

    // 3. No key so process as plain text
    return processPlaintextResponse(resultsByNode);
  }

  /**
   * Deletes a user-owned document from all nodes.
   */
  deleteData(
    params: DeleteDocumentRequestParams,
  ): Promise<ByNodeName<DeleteDocumentResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.delete,
        audience: client.id,
      });
      return client.deleteData(token, params);
    });
  }

  /**
   * Grants a given Did access to a given user-owned document.
   */
  grantAccess(
    body: GrantAccessToDataRequest,
  ): Promise<ByNodeName<GrantAccessToDataResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.update,
        audience: client.id,
      });
      return client.grantAccess(token, body);
    });
  }

  /**
   * Revokes access for a given Did to the specified user-owned document.
   */
  revokeAccess(
    body: RevokeAccessToDataRequest,
  ): Promise<ByNodeName<RevokeAccessToDataResponse>> {
    return executeOnCluster(this.nodes, (client) => {
      const token = this.mintInvocation({
        command: NucCmd.nil.db.users.update,
        audience: client.id,
      });
      return client.revokeAccess(token, body);
    });
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
