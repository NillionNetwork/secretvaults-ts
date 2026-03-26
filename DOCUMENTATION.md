# SecretVaults Ts Usage Guide

This document provides a guide to using the `@nillion/secretvaults` library, covering basic instantiation, authentication, and advanced usage patterns.

## Client Instantiation

The library exposes two main clients: `SecretVaultBuilderClient` and `SecretVaultUserClient`. Both are initialized using a static `from()` method, which requires a `@nillion/nuc` `Signer` and a list of NilDB node URLs.

### Builder Client

The `SecretVaultBuilderClient` is used by data producers to manage collections, queries, and standard data.

```typescript
import { Signer } from "@nillion/nuc";
import { SecretVaultBuilderClient } from "@nillion/secretvaults";

const builderClient = await SecretVaultBuilderClient.from({
  signer: Signer.generate(),
  dbs: ["http://localhost:40081", "http://localhost:40082"],
});
```

### User Client

The `SecretVaultUserClient` is used by data owners to manage their "owned" data, including creating data and managing access control lists (ACLs).

```typescript
import { Signer } from "@nillion/nuc";
import { SecretVaultUserClient } from "@nillion/secretvaults";

const userClient = await SecretVaultUserClient.from({
  signer: Signer.generate(),
  baseUrls: ["http://localhost:40081", "http://localhost:40082"],
});
```

## Authentication (`AuthContext`)

By default, the clients handle NUC invocation minting automatically. For advanced use cases, you can override the authentication behavior on a per-request basis by passing an `AuthContext` object to any authenticated method.

The `AuthContext` allows you to provide one of the following mutually exclusive properties:

| Property      | Type                     | Use Case                                                                                              |
| :------------ | :----------------------- | :---------------------------------------------------------------------------------------------------- |
| `invocations` | `Record<string, string>` | **Cluster-wide operations without re-signing.** A map of node DIDs to pre-signed invocations.         |
| `delegation`  | `string`                 | **Chained capabilities.** A delegation from which a new invocation will be derived and signed.        |
| `signer`      | `Signer`                 | **Temporary identity.** A one-time `Signer` to use for this request, overriding the client's default. |

**Example:** Using a map of pre-signed invocations to read a builder's profile without triggering new signatures.

```typescript
import { Builder, NucCmd } from "@nillion/secretvaults";
import type { Command } from "@nillion/nuc";

// 1. Pre-mint invocations for each node in the cluster
const invocations: Record<string, string> = {};
for (const node of builderClient.nodes) {
  invocations[node.id.didString] = await Builder.invocation()
    .subject(await builderClient.getDid())
    .audience(node.id)
    .command(NucCmd.nil.db.builders.read as Command)
    .expiresIn(30_000)
    .signAndSerialize(builderClient.signer);
}

// 2. Pass the map to the authenticated method to perform the operation without re-signing
const profile = await builderClient.readProfile({
  auth: { invocations },
});
```

## Advanced: Using with Browser Wallets

The clients' dependency on the `@nillion/nuc` `Signer` abstraction allows for integration with external signers, such as those from browser wallets. To do this, create a `Signer` instance using the `fromEip1193Provider` method and pass it to the client during instantiation.

```typescript
import { Signer } from "@nillion/nuc";
import { SecretVaultUserClient } from "@nillion/secretvaults";

// 1. Create a Nillion Signer directly from the browser's EIP-1193 provider.
// This example assumes a browser environment with a wallet like MetaMask injected at window.ethereum.
const nillionSigner = await Signer.fromEip1193Provider(window.ethereum);

// 2. Instantiate the client with the custom, web3-backed Signer.
const client = await SecretVaultUserClient.from({
  signer: nillionSigner,
  baseUrls: ["http://localhost:40081", "http://localhost:40082"],
});
```
