import {
  type Did,
  InvocationBody,
  type Keypair,
  type NilauthClient,
  NucTokenBuilder,
  type NucTokenEnvelope,
  type SubscriptionStatusResponse,
} from "@nillion/nuc";
import { NucCmd } from "./common/nuc-cmd";
import type { ByNodeName } from "./common/types";
import type {
  ReadBuilderProfileResponse,
  RegisterBuilderRequest,
} from "./dto/builders.dto";
import type { CreateCollectionRequest } from "./dto/collections.dto";
import type {
  CreateDataResponse,
  CreateStandardDataRequest,
} from "./dto/data.dto";
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

  async createCollection(
    body: CreateCollectionRequest,
  ): Promise<ByNodeName<void>> {
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
