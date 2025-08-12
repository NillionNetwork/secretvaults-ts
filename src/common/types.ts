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
 * A branded type that validates DIDs in the format "did:nil:" followed by 66 alphanumeric characters.
 *
 * @example
 * ```typescript
 * const did: Did = Did.parse("did:nil:abcdef123456...");
 * ```
 */
export const Did = z
  .string()
  .regex(/^did:nil:([a-zA-Z0-9]{66})$/)
  .brand<"Did">();
export type Did = z.infer<typeof Did>;

/**
 * Map type indexed by node DIDs.
 *
 * Used to store data associated with specific nodes in the network.
 *
 * @typeParam T - The type of value stored for each node
 *
 * @example
 * ```typescript
 * type NodeStatus = ByNodeName<{ online: boolean; lastSeen: Date }>;
 * ```
 */
export type ByNodeName<T> = Record<Did, T>;
