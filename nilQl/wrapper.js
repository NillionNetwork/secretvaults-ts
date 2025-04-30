import { nilql } from "@nillion/nilql";

// Define an enum for key types
export const KeyType = {
  CLUSTER: "cluster",
  SECRET: "secret",
};

// Define an enum for operations types
export const OperationType = {
  STORE: "store",
  SUM: "sum",
  MATCH: "match",
};

/**
 * NilQLWrapper provides encryption and decryption of data using Nillion's technology.
 * It generates and manages secret keys, splits data into shares when encrypting,
 * and recombines shares when decrypting.
 *
 * @example
 * const wrapper = new NilQLWrapper(cluster);
 * await wrapper.init();
 * const shares = await wrapper.encrypt(sensitiveData);
 */
export class NilQLWrapper {
  constructor(
    cluster,
    operation = OperationType.STORE,
    secretKey = null, // option to pass in your own secret key
    secretKeySeed = null,
    keyType = KeyType.CLUSTER,
  ) {
    this.cluster = cluster;
    this.secretKey = secretKey;
    this.secretKeySeed = secretKeySeed;
    this.operation = {
      [operation]: true,
    };
    this.keyType = keyType;
  }

  /**
   * Initializes the NilQLWrapper by generating and storing a secret key
   * for the cluster. This must be called before any encryption/decryption operations.
   * @returns {Promise<void>}
   */
  async init() {
    // Create secretKey from secretKeySeed, if provided
    if (this.secretKeySeed && this.secretKey === null) {
      this.secretKey = await nilql.SecretKey.generate(
        this.cluster,
        this.operation,
        this.secretKeySeed,
      );
    }

    if (this.secretKey === null) {
      switch (this.keyType) {
        case KeyType.SECRET:
          this.secretKey = await nilql.SecretKey.generate(
            this.cluster,
            this.operation,
          );
          break;
        case KeyType.CLUSTER:
          this.secretKey = await nilql.ClusterKey.generate(
            this.cluster,
            this.operation,
          );
          break;
        default:
          throw new Error("Unsupported key type");
      }
    }
  }

  /**
   * Encrypts data using the initialized secret key
   * @param {any} data - The data to encrypt
   * @throws {Error} If NilQLWrapper hasn't been initialized
   * @returns {Promise<string | string[] | number[] | number[][]>} Array of encrypted shares
   */
  async encrypt(data) {
    if (!this.secretKey) {
      throw new Error("NilQLWrapper not initialized. Call init() first.");
    }
    const shares = await nilql.encrypt(this.secretKey, data);
    return shares;
  }

  /**
   * Decrypts data using the initialized secret key and provided shares
   * @param {Array} shares - Array of encrypted shares to decrypt
   * @throws {Error} If NilQLWrapper hasn't been initialized
   * @returns {Promise<any>} The decrypted data
   */
  async decrypt(shares) {
    if (!this.secretKey) {
      throw new Error("NilQLWrapper not initialized. Call init() first.");
    }
    const decryptedData = await nilql.decrypt(this.secretKey, shares);
    return decryptedData;
  }

  /**
   * Recursively encrypts all values marked with %allot in the given data object
   * and prepares it for secure processing.
   *
   * - Traverses the entire object structure, handling nested objects at any depth.
   * - Encrypts values associated with the %allot key using nilql.encrypt().
   * - Preserves non-%allot values and maintains the original object structure.
   * - Calls nilql.allot() on the fully processed data before returning.
   *
   * @param {object} data - The input object containing fields marked with %allot for encryption.
   * @throws {Error} If NilQLWrapper has not been initialized with a secret key.
   * @returns {Promise<object>} The processed object with encrypted %allot values.
   */
  async prepareAndAllot(data) {
    if (!this.secretKey) {
      throw new Error("NilQLWrapper not initialized. Call init() first.");
    }

    const encryptDeep = async (obj) => {
      if (typeof obj !== "object" || obj === null) {
        return obj;
      }

      const encrypted = Array.isArray(obj) ? [] : {};

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "object" && value !== null) {
          if ("%allot" in value) {
            encrypted[key] = {
              "%allot": await nilql.encrypt(this.secretKey, value["%allot"]),
            };
          } else {
            encrypted[key] = await encryptDeep(value); // Recurse into nested objects
          }
        } else {
          encrypted[key] = value;
        }
      }
      return encrypted;
    };

    const encryptedData = await encryptDeep(data);
    return nilql.allot(encryptedData);
  }

  /**
   * Recombines encrypted shares back into original data structure
   * @param {Array} shares - Array of shares from prepareAndAllot
   * @throws {Error} If NilQLWrapper hasn't been initialized
   * @returns {Promise<object>} Original data structure with decrypted values
   */
  async unify(shares) {
    if (!this.secretKey) {
      throw new Error("NilQLWrapper not initialized. Call init() first.");
    }
    const unifiedResult = await nilql.unify(this.secretKey, shares);
    return unifiedResult;
  }
}
