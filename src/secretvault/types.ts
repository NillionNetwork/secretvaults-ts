import { z } from "zod/v4";

/**
 *
 */
export const NilDbNodeOptions = z.url();

/**
 *
 */
export const SecretVaultOptions = z.object({
  nodes: NilDbNodeOptions.array(),
});

/**
 *
 */
export type SecretVaultOptions = z.infer<typeof SecretVaultOptions>;
