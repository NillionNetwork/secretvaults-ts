import type { ClusterKey, SecretKey } from "@nillion/blindfold";
import type { Did, Keypair, Signer } from "@nillion/nuc";
import type { ByNodeName } from "#/dto/common";
import type { ReadAboutNodeResponse } from "#/dto/system.dto";
import { executeOnCluster } from "./common/cluster";
import { Log } from "./logger";
import type { NilDbBaseClient } from "./nildb/base-client";

/**
 * Provides a mechanism to override the default auth behavior for a single request.
 *
 * Use one of the following mutually exclusive properties:
 * - `invocation`: A pre-signed and serialized invocation string to be used directly.
 * - `delegation`: A serialized delegation string from which the client will derive and sign the final invocation.
 * - `signer`: A temporary `Signer` instance to use for signing the request's invocation, overriding the client's default signer.
 */
export type AuthContext =
  | { invocation: string; delegation?: never; signer?: never }
  | { delegation: string; invocation?: never; signer?: never }
  | { signer: Signer; invocation?: never; delegation?: never };

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
    return this.did.didString;
  }

  /**
   * The DID of the keypair associated with this client.
   */
  get did(): Did {
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
