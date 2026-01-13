import {
  type Address,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

import type { BlindModule, NilauthClient } from "@nillion/nilauth-client";
import type { Did, Signer } from "@nillion/nuc";

const burnWithDigestAbi = [
  {
    type: "function",
    name: "burnWithDigest",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "digest", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export type EvmPayerConfig = {
  rpcUrl: string;
  privateKey: `0x${string}`;
  nilTokenAddress: Address;
  burnContractAddress: Address;
  chainId: number;
};

export class EvmPayer {
  readonly #publicClient: PublicClient;
  readonly #walletClient: WalletClient;
  readonly #config: EvmPayerConfig;
  readonly #chain: typeof anvil;
  readonly #account: ReturnType<typeof privateKeyToAccount>;

  constructor(config: EvmPayerConfig) {
    this.#config = config;
    this.#account = privateKeyToAccount(config.privateKey);
    this.#chain = { ...anvil, id: config.chainId as typeof anvil.id };

    this.#publicClient = createPublicClient({
      chain: this.#chain,
      transport: http(config.rpcUrl),
    });

    this.#walletClient = createWalletClient({
      account: this.#account,
      chain: this.#chain,
      transport: http(config.rpcUrl),
    });
  }

  /**
   * Pay for a subscription using the ERC-20 approve + BurnWithDigest flow.
   */
  async payForSubscription(
    nilauthClient: NilauthClient,
    payerSigner: Signer,
    subscriberDid: Did,
    blindModule: BlindModule,
  ): Promise<string> {
    const payerDid = await payerSigner.getDid();

    // Step 1: Get subscription cost (in UNILs)
    const costUnils = await nilauthClient.subscriptionCost(blindModule);
    const costTokenUnits = BigInt(costUnils);

    // Step 2: Create payment resource (digest + payload)
    const { resourceHash, payload } = nilauthClient.createPaymentResource(subscriberDid, blindModule, payerDid);

    // Convert SHA-256 hash to bytes32 for the contract
    const digest = toHex(resourceHash, { size: 32 });

    // Step 3: Check current allowance
    const payerAddress = this.#account.address;
    const allowance = await this.#publicClient.readContract({
      address: this.#config.nilTokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [payerAddress, this.#config.burnContractAddress],
    });

    // Step 4: Approve if needed
    if (allowance < costTokenUnits) {
      const approveHash = await this.#walletClient.writeContract({
        account: this.#account,
        chain: this.#chain,
        address: this.#config.nilTokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.#config.burnContractAddress, costTokenUnits],
      });

      await this.#publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Step 5: Execute burn
    const burnHash = await this.#walletClient.writeContract({
      account: this.#account,
      chain: this.#chain,
      address: this.#config.burnContractAddress,
      abi: burnWithDigestAbi,
      functionName: "burnWithDigest",
      args: [costTokenUnits, digest],
    });

    await this.#publicClient.waitForTransactionReceipt({ hash: burnHash });

    // Step 6: Validate payment with nilauth
    await nilauthClient.validatePayment(burnHash, payload, payerSigner);

    return burnHash;
  }
}

export function createEvmPayerFromEnv(): EvmPayer {
  return new EvmPayer({
    rpcUrl: process.env.APP_ETHEREUM_RPC_URL!,
    privateKey: process.env.APP_PAYER_PRIVATE_KEY as `0x${string}`,
    nilTokenAddress: process.env.APP_NIL_TOKEN_ADDRESS as Address,
    burnContractAddress: process.env.APP_BURN_CONTRACT_ADDRESS as Address,
    chainId: Number(process.env.APP_CHAIN_ID),
  });
}
