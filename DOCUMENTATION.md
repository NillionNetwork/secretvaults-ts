# SecretVaults Ts Usage Guide

This document provides a guide to using the `@nillion/secretvaults` library, covering basic instantiation, authentication, and advanced usage patterns.

## Client Instantiation

The library exposes two main clients: `SecretVaultBuilderClient` and `SecretVaultUserClient`. Both are initialized using a static `from()` method, which requires a `@nillion/nuc` `Signer` and a list of NilDB node URLs.

### Builder Client

The `SecretVaultBuilderClient` is used by data producers to manage collections, queries, and standard data. It requires a `nilauthClient` for obtaining root tokens.

```typescript
import { Signer, NilauthClient } from "@nillion/nuc";
import { SecretVaultBuilderClient } from "@nillion/secretvaults";

const builderSigner = Signer.generate();
const nilauthClient = await NilauthClient.create({
  /* ... nilauth options ... */
});

const builderClient = await SecretVaultBuilderClient.from({
  signer: builderSigner,
  dbs: ["http://localhost:40081", "http://localhost:40082"],
  nilauthClient,
});

// The builder client must fetch a root token before making authenticated calls.
await builderClient.refreshRootToken();
```

### User Client

The `SecretVaultUserClient` is used by data owners to manage their "owned" data, including creating data and managing access control lists (ACLs).

```typescript
import { Signer } from "@nillion/nuc";
import { SecretVaultUserClient } from "@nillion/secretvaults";

const userSigner = Signer.generate();

const userClient = await SecretVaultUserClient.from({
  signer: userSigner,
  baseUrls: ["http://localhost:40081", "http://localhost:40082"],
});
```

## Authentication (`AuthContext`)

By default, the clients handle NUC invocation minting automatically. For advanced use cases, you can override the authentication behavior on a per-request basis by passing an `AuthContext` object to any authenticated method.

The `AuthContext` allows you to provide one of the following mutually exclusive properties:

| Property      | Type                     | Use Case                                                                                             |
| :------------ | :----------------------- | :--------------------------------------------------------------------------------------------------- |
| `invocations` | `Record<string, string>` | **Cluster-wide operations without re-signing.** A map of node DIDs to pre-signed invocations.        |
| `delegation`  | `string`                 | **Chained capabilities.** A delegation from which a new invocation will be derived and signed.       |
| `signer`      | `Signer`                 | **Temporary identity.** A one-time `Signer` to use for this request, overriding the client's default. |

**Example:** Using a map of pre-signed invocations to read a builder's profile without triggering new signatures.

```typescript
import { Builder, NucCmd } from "@nillion/secretvaults";

// 1. Pre-mint invocations for each node in the cluster
const nildbTokens: Record<string, string> = {};
for (const node of builderClient.nodes) {
  const token = await Builder.invocationFrom(builderClient.rootToken)
    .audience(node.id)
    .command(NucCmd.nil.db.builders.read)
    .signAndSerialize(builderClient.signer);
  nildbTokens[node.id.didString] = token;
}

// 2. Pass the map to the authenticated method to perform the operation without re-signing
const profile = await builderClient.readProfile({
  auth: { invocations: nildbTokens },
});
```

## Advanced: Using with Browser Wallets

The clients' dependency on the `@nillion/nuc` `Signer` abstraction allows for integration with external signers, such as those from browser wallets. To do this, create a `Signer` instance using the `fromWeb3` method and pass it to the client during instantiation.

```typescript
import { ethers } from "ethers";
import { Signer } from "@nillion/nuc";
import { SecretVaultUserClient } from "@nillion/secretvaults";

// 1. Connect to the browser wallet.
// This example assumes a browser environment with a wallet like MetaMask injected.
const provider = new ethers.BrowserProvider(window.ethereum);
const ethersSigner = await provider.getSigner();

// 2. Create a Nillion Signer from the external Ethers signer.
const nillionSigner = await Signer.fromWeb3(ethersSigner);

// 3. Instantiate the client with the custom, web3-backed Signer.
const client = await SecretVaultUserClient.from({
  signer: nillionSigner,
  baseUrls: ["http://localhost:40081", "http://localhost:40082"],
});
```

## Client Re-hydration (Instant Login)

To provide a seamless user experience without requiring re-authentication on every page load, you can re-hydrate the `SecretVaultBuilderClient` with a previously fetched root token. This is useful for storing the session in `localStorage`.

**Example Workflow:**

1.  **First Login**: The user authenticates, and you fetch a new root token using `refreshRootToken()`.
2.  **Store Token**: Serialize the token and store it in `localStorage`.
3.  **Subsequent Visits**: On the next visit, create the client instance by passing the stored token string directly to the `from()` method. This bypasses the need to call `refreshRootToken()`.

```typescript
import { Codec, Signer, NilauthClient } from "@nillion/nuc";
import { SecretVaultBuilderClient } from "@nillion/secretvaults";

const dbs = ["http://localhost:40081", "http://localhost:40082"];

// --- On initial login ---
async function initialLogin() {
  const signer = Signer.generate();
  const nilauthClient = await NilauthClient.create({
    /* ... */
  });
  const builderClient = await SecretVaultBuilderClient.from({
    signer,
    nilauthClient,
    dbs,
  });

  // Fetch a new token from NilAuth
  await builderClient.refreshRootToken();

  // Serialize the root token for storage
  const rootTokenString = Codec.serializeBase64Url(builderClient.rootToken);
  localStorage.setItem("nillion-root-token", rootTokenString);

  return builderClient;
}

// --- On subsequent page loads ---
async function subsequentLogin() {
  const storedToken = localStorage.getItem("nillion-root-token");
  if (!storedToken) {
    // Handle case where token is not available
    return initialLogin();
  }

  const signer = Signer.generate(); // The signer is still required
  const nilauthClient = await NilauthClient.create({
    /* ... */
  });

  // Re-hydrate the client instantly using the stored token
  const builderClient = await SecretVaultBuilderClient.from({
    signer,
    nilauthClient,
    dbs,
    rootToken: storedToken,
  });

  // No need to call `refreshRootToken()`

  return builderClient;
}
```
