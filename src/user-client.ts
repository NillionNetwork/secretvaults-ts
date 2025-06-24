import type { ClusterKey, SecretKey } from "@nillion/blindfold";
import {
  type Command,
  type Did,
  InvocationBody,
  type Keypair,
  NucTokenBuilder,
  NucTokenEnvelopeSchema,
} from "@nillion/nuc";
import {
  type BlindfoldFactoryConfig,
  conceal,
  reveal,
  toBlindfoldKey,
} from "./blindfold";
import { NucCmd } from "./common/nuc-cmd";
import { intoSecondsFromNow } from "./common/time";
import type { ByNodeName } from "./common/types";
import type {
  CreateDataResponse,
  CreateOwnedDataRequest,
} from "./dto/data.dto";
import type { ReadAboutNodeResponse } from "./dto/system.dto";
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

export type SecretVaultUserClientOptions = {
  keypair: Keypair;
  clients: NilDbUserClient[];
  key?: SecretKey | ClusterKey;
};

export class SecretVaultUserClient {
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

  _options: SecretVaultUserClientOptions;

  constructor(options: SecretVaultUserClientOptions) {
    this._options = options;
  }

  get did(): Did {
    return this._options.keypair.toDid();
  }

  get nodes(): NilDbUserClient[] {
    return this._options.clients;
  }

  get keypair(): Keypair {
    return this._options.keypair;
  }

  readClusterInfo(): Promise<ByNodeName<ReadAboutNodeResponse>> {
    return this.executeOnAllNodes((client) => client.aboutNode());
  }

  readUserProfile(): Promise<ByNodeName<ReadUserProfileResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.root,
        audience: client.did,
      });

      return client.getProfile(token);
    });
  }

  async createData(
    delegation: string,
    body: CreateOwnedDataRequest,
  ): Promise<ByNodeName<CreateDataResponse>> {
    let concealed = null;
    const key = this._options.key;
    if (key) {
      concealed = await Promise.all(body.data.map((d) => conceal(key, d)));
    }

    if (concealed && concealed.at(0)?.length !== this.nodes.length) {
      throw new Error(
        "Concealed data shares do not match the number of nodes.",
      );
    }

    return this.executeOnAllNodes(async (client, index) => {
      const envelop = NucTokenEnvelopeSchema.parse(delegation);
      const token = NucTokenBuilder.extending(envelop)
        .audience(client.did)
        .command(NucCmd.nil.db.data.create)
        .expiresAt(intoSecondsFromNow(60))
        .body(new InvocationBody({}))
        .build(this.keypair.privateKey());

      const nodeBody: CreateOwnedDataRequest = { ...body };
      if (concealed) {
        nodeBody.data = concealed.map((s) => s[index]);
      }

      return client.createOwnedData(token, nodeBody);
    });
  }

  listDataReferences(): Promise<ByNodeName<ListDataReferencesResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.read,
        audience: client.did,
      });

      return client.listDataReferences(token);
    });
  }

  async readData(params: ReadDataRequestParams): Promise<ReadDataResponse> {
    // 1. Fetch the raw document share from all nodes.
    const resultByNode = await this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.read,
        audience: client.did,
      });
      return client.readData(token, params);
    });

    const { key } = this._options;

    // 2. If no key is configured, return the response from the first node
    if (!key) {
      return Object.values(resultByNode).at(0)!;
    }

    // 3. If a key exists, collect the .data property from each node's response.
    const shares = Object.values(resultByNode).map((r) => r.data);

    // 4. Reveal (unify and decrypt any shares)
    const revealedDoc = await reveal(key, shares);

    // 5. Return the unified document
    return { data: revealedDoc } as ReadDataResponse;
  }

  deleteData(
    params: DeleteDocumentRequestParams,
  ): Promise<ByNodeName<DeleteDocumentResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.delete,
        audience: client.did,
      });

      return client.deleteData(token, params);
    });
  }

  grantAccess(
    body: GrantAccessToDataRequest,
  ): Promise<ByNodeName<GrantAccessToDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.update,
        audience: client.did,
      });

      return client.grantAccess(token, body);
    });
  }

  revokeAccess(
    body: RevokeAccessToDataRequest,
  ): Promise<ByNodeName<RevokeAccessToDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.update,
        audience: client.did,
      });

      return client.revokeAccess(token, body);
    });
  }

  private async executeOnAllNodes<T>(
    operation: (client: NilDbUserClient, index: number) => Promise<T>,
  ): Promise<Record<string, T>> {
    const promises = this.nodes.map(async (client, index) => ({
      name: client.name,
      result: await operation(client, index),
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

  private mintInvocation(options: { cmd: Command; audience: Did }): string {
    const builder = NucTokenBuilder.invocation({});

    return builder
      .command(options.cmd)
      .subject(this.did)
      .audience(options.audience)
      .expiresAt(intoSecondsFromNow(60))
      .build(this.keypair.privateKey());
  }
}
