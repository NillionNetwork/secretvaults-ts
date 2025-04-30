# secretvaults

Wrapper classes for simplifying usage of Nillion's Secret Vault and the nilQL encryption and decryption library.

## Installation

```bash
npm install secretvaults
```

## NilQLWrapper: Lightweight wrapper for encryption and decryption using nilQL:

- Encrypts data into shares for distributed storage across nodes
- Handles structured data with `'%allot'` markers for selective encryption
- Recombines shares and decrypts data marked `%share` using unify
- Manages secret keys for encryption/decryption operations
- Recombines and decrypts shares to recover original data
- Maintains compatibility with SecretVault timestamps
- No node configuration required when used standalone

## SecretVaultWrapper: wrapper for Secret Vault API operations:

### Authentication

- Handles JWT creation and management per node
- Manages node authentication automatically

### Schema Operations

#### Create: Deploy schema across nodes (/api/v1/schemas)

- Creates schemas with optional custom ID
- Validates schema structure
- Distributes to all nodes

#### Read: List available schemas (/api/v1/schemas)

- Retrieves schema configurations
- Shows schema metadata and structure

#### Delete: Remove schema definition (/api/v1/schemas)

- Deletes schema across all nodes
- Preserves data integrity

### Data Operations

#### Write: Upload data to the specified schema collection (/api/v1/data/create)

- Writes data to multiple nodes
- Encrypts specified fields with `'%allot'` markers before distribution
- Distributes encrypted shares marked `%share` across nodes

#### Read: Retrieve data from the specified schema collection that matches the provided filter (/api/v1/data/read)

- Retrieves data from all nodes
- Recombines encrypted shares marked `%share` from nodes to decrypts specified fields automatically
- Returns decrypted record

#### Flush: Remove all documents in a schema collection (/api/v1/data/flush)

- Removes all data across nodes from a schema collection

#### List the organization's schemas (/api/v1/schemas)

## Usage

### Standalone NilQLWrapper Example

Run examples

```
node examples/nilQlEncryption.js
```

### SecretVaultWrapper Example

Copy the .env.example to create a .env file that uses the example org

```
cp .env.example .env
```

Run example to encrypt and upload data to all nodes, then read data from nodes.

```
node examples/store/readWriteSv.js
```

Basic setup

```
const secretVaultCollection = new SecretVaultWrapper(
    orgConfig.nodes,
    orgConfig.orgCredentials,
    collectionConfig.schemaId
);
await secretVaultCollection.init();

// years_in_web3 field value is marked with '%allot' to show it will be encrypted
const dataWritten = await secretVaultCollection.writeToNodes(
    [{
        _id: uuidv4(),
        years_in_web3: { '%allot': 4 },
        responses: [
        { rating: 5, question_number: 1 },
        { rating: 3, question_number: 2 },
        ],
    },]
);
```
