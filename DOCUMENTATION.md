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

The `AuthContext` allows you to provide one of three mutually exclusive properties:

| Property     | Type     | Description                                                                                 |
| :----------- | :------- | :------------------------------------------------------------------------------------------ |
| `invocation` | `string` | A pre-signed and serialized invocation string to be used directly.                          |
| `delegation` | `string` | A serialized delegation string from which the client will derive and sign the final invocation. |
| `signer`     | `Signer` | A temporary `Signer` instance to use for this request, overriding the client's default signer.  |

**Example:** Using a pre-signed invocation to read a builder's profile.

```typescript
const preSignedInvocation = "ey..."; // A valid, serialized invocation NUC

const profile = await builderClient.readProfile({
  invocation: preSignedInvocation,
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
