import type { ClusterKey, SecretKey } from "@nillion/blindfold";
import type { Keypair, Did as NucDid } from "@nillion/nuc";
import { executeOnCluster } from "./common/cluster";
import type { ByNodeName } from "./common/types";
import type { ReadAboutNodeResponse } from "./dto/system.dto";
import { Log } from "./logger";
import type { NilDbBaseClient } from "./nildb/base-client";

/**
 * Common constructor options for all SecretVault clients.
 */
export type SecretVaultBaseOptions<TClient extends NilDbBaseClient> = {
  keypair: Keypair;
  clients: TClient[];
  key?: SecretKey | ClusterKey;
};

/**
 * Provides common properties and methods for SecretVault clients.
 */
export class SecretVaultBaseClient<TClient extends NilDbBaseClient> {
  protected _options: SecretVaultBaseOptions<TClient>;

  constructor(options: SecretVaultBaseOptions<TClient>) {
    this._options = options;
  }

  get id(): string {
    return this.did.toString();
  }

  /**
   * The DID of the keypair associated with this client.
   */
  get did(): NucDid {
    return this._options.keypair.toDid();
  }

  /**
   * The array of underlying node clients for the cluster.
   */
  get nodes(): TClient[] {
    return this._options.clients;
  }

  /**
   * The keypair used by this client for signing.
   */
  get keypair(): Keypair {
    return this._options.keypair;
  }

  /**
   * Retrieves information about each node in the cluster.
   */
  async readClusterInfo(): Promise<ByNodeName<ReadAboutNodeResponse>> {
    const result = await executeOnCluster(this.nodes, (c) => c.aboutNode());
    Log.info({ nodes: Object.keys(result).length }, "Cluster info retrieved");
    return result;
  }
}
