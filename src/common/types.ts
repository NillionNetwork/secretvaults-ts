import { z } from "zod";

/**
 * UUID type for unique identifiers.
 *
 * A branded type that ensures type safety for UUID strings.
 *
 * @example
 * ```typescript
 * const id: Uuid = Uuid.parse("123e4567-e89b-12d3-a456-426614174000");
 * ```
 */
export const Uuid = z.uuid().brand<"Uuid">();
export type Uuid = z.infer<typeof Uuid>;

/**
 * Decentralized Identifier (DID) for Nillion network.
 *
 * A branded type that loosely validates DIDs.
 *
 * @example
 * ```ts
 * const did: Did = Did.parse("did:nil:abcdef123456...");
 * ```
 */
export const Did = z
  .string()
  .startsWith("did:")
  .superRefine((value, ctx) => {
    if (value.startsWith("did:ethr:")) {
      console.warn(
        "Received `did:ethr` which is not compatible with this version of secretvaults — upgrade to 1.0.0+.",
      );
      return;
    }

    if (value.startsWith("did:nil:")) {
      return;
    }

    if (value.startsWith("did:key:")) {
      // Conversion is handled in transform, but validate format here
      try {
        const multibaseKey = value.slice("did:key:".length);
        if (!multibaseKey || multibaseKey.length < 10) {
          ctx.addIssue({
            code: "custom",
            message: "Invalid did:key format - key portion too short",
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Invalid did:key format",
        });
      }
      return;
    }

    ctx.addIssue({
      code: "custom",
      message: `Unsupported DID method. Expected did:nil, did:key, or did:ethr, but got: ${value.slice(0, 10)}...`,
    });
  })
  .transform((value) => {
    if (value.startsWith("did:key:")) {
      return convertDidKeyToDidNil(value);
    }
    return value;
  })
  .brand<"Did">();
export type Did = z.infer<typeof Did>;

// Base58 alphabet used in multibase
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Decode base58 string to Uint8Array (compatible with browser and Node)
function decodeBase58(str: string): Uint8Array {
  let num = 0n;

  for (let i = 0; i < str.length; i++) {
    const digit = BigInt(BASE58_ALPHABET.indexOf(str[i]));
    if (digit === -1n) {
      throw new Error(`Invalid base58 character: ${str[i]}`);
    }
    num = num * 58n + digit;
  }

  // Convert big integer to bytes
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num = num >> 8n;
  }

  // Handle leading zeros (represented as '1' in base58)
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    bytes.unshift(0);
  }

  return new Uint8Array(bytes.length > 0 ? bytes : [0]);
}

// Helper to convert did:key to did:nil format
function convertDidKeyToDidNil(didKey: string): string {
  try {
    // did:key format: did:key:z<multibase-encoded-key>
    const multibaseKey = didKey.slice("did:key:".length);

    if (!multibaseKey.startsWith("z")) {
      throw new Error("Expected multibase encoding type 'z' (base58)");
    }

    // Decode the base58 key (skip the 'z' prefix)
    const decodedBytes = decodeBase58(multibaseKey.slice(1));

    // Skip the multicodec prefix (usually 2-3 bytes for key type)
    // For Ed25519: 0xed 0x01
    // For secp256k1: 0xe7 0x01
    const publicKeyHex = toHex(decodedBytes.slice(2));

    return `did:nil:${publicKeyHex}`;
  } catch (error) {
    throw new Error(
      `Failed to convert did:key to did:nil: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Convert Uint8Array to hex string
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Map type indexed by node DIDs.
 *
 * Used to store data associated with specific nodes in the network.
 *
 * @typeParam T - The type of value stored for each node
 *
 * @example
 * ```ts
 * type NodeStatus = ByNodeName<{ online: boolean; lastSeen: Date }>;
 * ```
 */
export type ByNodeName<T> = Record<Did, T>;
