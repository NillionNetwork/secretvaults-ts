![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/NillionNetwork/secretvaults-ts/.github%2Fworkflows%2Fci.yaml)
![GitHub package.json version](https://img.shields.io/github/package-json/v/NillionNetwork/secretvaults-ts)

A TypeScript client library for building with [Nillion Private Storage](https://docs.nillion.com/build/private-storage/overview), a decentralized storage system that keeps sensitive data secret by storing encrypted shares across a cluster of [nilDB nodes](https://docs.nillion.com/learn/blind-modules#nildb). Each nilDB node stores a separate share of the encrypted data, ensuring no single node can reveal the original value.

## Installation

Install the package via npm:

```bash
npm install @nillion/secretvaults
```

Or using yarn:

```bash
yarn add @nillion/secretvaults
```

Or using pnpm:

```bash
pnpm add @nillion/secretvaults
```

## Quick Start

For a complete quickstart guide with examples, visit the [Nillion Docs Private Storage Quickstart](https://docs.nillion.com/build/private-storage/quickstart).

## Examples

For comprehensive usage examples and integration patterns, see the [NilDB Examples repository](https://github.com/NillionNetwork/blind-module-examples/tree/main/nildb).

## Key Concepts

For detailed information about Private Storage concepts, see the [Nillion Key Concepts documentation](https://docs.nillion.com/build/private-storage/overview#key-concepts).

## Network Configuration

Service URLs for different environments can be found in the [Nillion Network Configuration docs](https://docs.nillion.com/build/network-config).

### Testnet Example

```typescript
const urls = {
  chain: 'http://rpc.testnet.nilchain-rpc-proxy.nilogy.xyz',
  auth: 'https://nilauth.sandbox.app-cluster.sandbox.nilogy.xyz',
  dbs: [
    'https://nildb-stg-n1.nillion.network',
    'https://nildb-stg-n2.nillion.network',
    'https://nildb-stg-n3.nillion.network',
  ],
};
```

## Error Handling

The library uses typed errors and provides detailed error information:

```typescript
try {
  await builderClient.createCollection(collection);
} catch (error) {
  console.error('Failed to create collection:', error.message);
  // Handle specific error types
}
```

## Contributing

We welcome contributions! Please see the main repository for contribution guidelines.

## License

This project is licensed under the [MIT License](./LICENSE).

## Support

- [Nillion Documentation](https://docs.nillion.com)
- [GitHub Issues](https://github.com/NillionNetwork/secretvaults-ts/issues)
- [Discord Community](https://discord.com/invite/nillionnetwork)
