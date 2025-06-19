import type { NilDbBuilderClient } from "#/nildb/builder-client";
import type { NilDbUserClient } from "#/nildb/user-client";
import type {
  ClusterNodesInfo,
  DataConflictResolutionStrategy,
} from "#/secretvault/types";

export type NodeClient<T extends NilDbUserClient | NilDbBuilderClient> = {
  name: string;
  client: T;
};

export type SecretVaultOptions<T extends NilDbUserClient | NilDbBuilderClient> =
  {
    dataConflictResolutionStrategy: DataConflictResolutionStrategy;
    clients: T[];
    secretKey: string;
  };

export abstract class SecretVaultBaseClient<
  T extends NilDbUserClient | NilDbBuilderClient,
> {
  protected _token: string | null = null;
  protected _options: SecretVaultOptions<T>;
  protected _nodes: NodeClient<T>[];

  constructor(options: SecretVaultOptions<T>) {
    this._options = options;
    this._nodes = options.clients.map((client, index) => ({
      name: `node${index + 1}`,
      client,
    }));
  }

  setToken(token: string): void {
    this._token = token;
  }

  protected get token(): string {
    if (!this._token) {
      throw new Error(
        "Token not set. Call setToken() before using authenticated methods.",
      );
    }
    return this._token;
  }

  protected get secretKey(): string {
    return this._options.secretKey;
  }

  async readClusterInfo(): Promise<ClusterNodesInfo> {
    const aboutNodePromises = this._nodes.map(async (node) => ({
      name: node.name,
      response: await node.client.aboutNode(),
    }));

    const results = await Promise.all(aboutNodePromises);

    return results.reduce((acc, { name, response }) => {
      acc[name] = response;
      return acc;
    }, {} as ClusterNodesInfo);
  }
}
