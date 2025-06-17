import { z } from "zod";

/**
 * Node information response.
 */
export const ReadAboutNodeResponse = z.object({
  started: z.string().datetime(),
  build: z.object({
    time: z.string().datetime(),
    commit: z.string(),
    version: z.string(),
  }),
  public_key: z.string(),
  url: z.string().url(),
  maintenance: z.object({
    active: z.boolean(),
    started_at: z.string().datetime(),
  }),
});

export type ReadAboutNodeResponse = z.infer<typeof ReadAboutNodeResponse>;

/**
 *
 */
export const NodeHealthCheckResponse = z.literal("OK");
export type NodeHealthCheckResponse = z.infer<typeof NodeHealthCheckResponse>;
