import type { ClusterKey, SecretKey } from "@nillion/blindfold";
import type { Did, Signer } from "@nillion/nuc";
import type { ByNodeName } from "#/dto/common";
import type { ReadAboutNodeResponse } from "#/dto/system.dto";
import { executeOnCluster } from "./common/cluster";
import { Log } from "./logger";
import type { NilDbBaseClient } from "./nildb/base-client";

/**
 * Provides a mechanism to override the default auth behavior for a single request.
 *
 * Use one of the following mutually exclusive properties:
 * - `invocations`: A map of node DIDs to pre-signed invocation strings, ideal for signature-free cluster-wide operations.
 * - `delegation`: A serialized delegation string from which the client will derive and sign the final invocation for each node.
 * - `signer`: A temporary `Signer` instance to use for this request, overriding the client's default signer.
 */
export type AuthContext =
  | {
      invocations: Record<string, string>;
      delegation?: never;
      signer?: never;
    }
  | {
      delegation: string;
      signer?: never;
      invocations?: never;
    }
  | {
      signer: Signer;
      delegation?: never;
      invocations?: never;
    };

/**
 * Common constructor options for all SecretVault clients.
 */
export type SecretVaultBaseOptions<TClient extends NilDbBaseClient> = {
  signer: Signer;
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

  async getId(): Promise<string> {
    return (await this.getDid()).didString;
  }

  /**
   * The DID of the signer associated with this client.
   */
  async getDid(): Promise<Did> {
    return this._options.signer.getDid();
  }

  /**
   * The array of underlying node clients for the cluster.
   */
  get nodes(): TClient[] {
    return this._options.clients;
  }

  /**
   * The signer used by this client for signing.
   */
  get signer(): Signer {
    return this._options.signer;
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
