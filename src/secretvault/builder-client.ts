import {
  type Did,
  InvocationBody,
  type Keypair,
  NilauthClient,
  NucTokenBuilder,
  type NucTokenEnvelope,
  PayerBuilder,
  type SubscriptionStatusResponse,
} from "@nillion/nuc";
import {
  createNilDbBuilderClient,
  type NilDbBuilderClient,
} from "#/nildb/builder-client";
import type {
  ReadBuilderProfileResponse,
  RegisterBuilderRequest,
} from "#/nildb/dto/builders.dto";
import type { CreateCollectionRequest } from "#/nildb/dto/collections.dto";
import type {
  CreateDataResponse,
  CreateStandardDataRequest,
} from "#/nildb/dto/data.dto";
import type { ReadAboutNodeResponse } from "#/nildb/dto/system.dto";
import { NucCmd } from "#/nildb/nuc-cmd";
import type {
  ByNodeName,
  DataConflictResolutionStrategy,
} from "#/secretvault/types";

/**
 *
 */
export type SecretVaultBuilderOptions = {
  dataConflictResolutionStrategy:
    | "random"
    | "last-updated"
    | "first-response"
    | "priority-order";
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

  async register(body: RegisterBuilderRequest): Promise<void> {
    const _result = await this.executeOnAllNodes(async (client) => {
      return client.register({ body });
    });
  }

  readBuilderProfile(): Promise<ByNodeName<ReadBuilderProfileResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.builders.read)
        .body(new InvocationBody({}))
        .expiresAt(Date.now() + 60 * 1000)
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.getProfile({ token });
    });
  }

  async createCollection(body: CreateCollectionRequest): Promise<ByNodeName<void>> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.extending(this.rootToken)
        .command(NucCmd.nil.db.collections.create)
        .body(new InvocationBody({}))
        .expiresAt(Date.now() + 60 * 1000)
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.createCollection({ body, token });
    });
  }

  async createData(options: {
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
          .expiresAt(Date.now() + 60 * 1000)
          .audience(client.did)
          .build(this._options.keypair.privateKey());
      }

      return client.createStandardData({
        body,
        token,
      });
    });
  }
}

export async function createSecretVaultBuilderClient(options: {
  keypair: Keypair;
  urls: {
    chain: string;
    auth: string;
    dbs: string[];
  };
  dataConflictResolutionStrategy: DataConflictResolutionStrategy;
}): Promise<SecretVaultBuilderClient> {
  const { urls, keypair, dataConflictResolutionStrategy } = options;

  // This is not used for subscription payments; its is created here because NilauthClient
  // requires a payer
  const payerBuilder = await new PayerBuilder()
    .keypair(keypair)
    .chainUrl(urls.chain)
    .build();
  const nilauthClient = await NilauthClient.from(urls.auth, payerBuilder);

  const clientPromises = urls.dbs.map((base) => createNilDbBuilderClient(base));
  const clients = await Promise.all(clientPromises);

  return new SecretVaultBuilderClient({
    dataConflictResolutionStrategy,
    clients,
    nilauthClient,
    keypair,
  });
}
