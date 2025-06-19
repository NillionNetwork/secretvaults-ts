import {
  type Did,
  InvocationBody,
  Keypair,
  NucTokenBuilder,
  NucTokenEnvelopeSchema,
} from "@nillion/nuc";
import type {
  CreateDataResponse,
  CreateOwnedDataRequest,
} from "#/nildb/dto/data.dto";
import type { ReadAboutNodeResponse } from "#/nildb/dto/system.dto";
import { NucCmd } from "#/nildb/nuc-cmd";
import {
  createNilDbUserClient,
  type NilDbUserClient,
} from "#/nildb/user-client";
import type {
  ByNodeName,
  ClusterUserProfiles,
  DataConflictResolutionStrategy,
} from "#/secretvault/types";

export type SecretVaultUserClientOptions = {
  dataConflictResolutionStrategy:
    | "random"
    | "last-updated"
    | "first-response"
    | "priority-order";
  keypair: Keypair;
  clients: NilDbUserClient[];
};

export class SecretVaultUserClient {
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

  private async executeOnAllNodes<T>(
    operation: (client: NilDbUserClient) => Promise<T>,
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

  readClusterInfo(): Promise<ByNodeName<ReadAboutNodeResponse>> {
    return this.executeOnAllNodes((client) => client.aboutNode());
  }

  async readUserProfile(): Promise<ClusterUserProfiles> {
    return this.executeOnAllNodes(async (client) => {
      const token = NucTokenBuilder.invocation({})
        .command(NucCmd.nil.db.users.root)
        .expiresAt(Date.now() + 60 * 1000)
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.getProfile({ token });
    });
  }

  async createData(options: {
    body: CreateOwnedDataRequest;
    delegation: string;
  }): Promise<ByNodeName<CreateDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const envelope = NucTokenEnvelopeSchema.parse(options.delegation);

      const token = NucTokenBuilder.extending(envelope)
        .body(new InvocationBody({}))
        .command(NucCmd.nil.db.data.create)
        .expiresAt(Date.now() + 60 * 1000)
        .audience(client.did)
        .build(this._options.keypair.privateKey());

      return client.createOwnedData({ body: options.body, token });
    });
  }
}

export async function createSecretVaultUserClient(options: {
  secretKey: string;
  baseUrls: string[];
  dataConflictResolutionStrategy: DataConflictResolutionStrategy;
}): Promise<SecretVaultUserClient> {
  const { baseUrls, secretKey, dataConflictResolutionStrategy } = options;

  const clientPromises = baseUrls.map((baseUrl) =>
    createNilDbUserClient(baseUrl),
  );
  const clients = await Promise.all(clientPromises);
  const keypair = Keypair.from(secretKey);

  return new SecretVaultUserClient({
    dataConflictResolutionStrategy,
    clients,
    keypair,
  });
}
