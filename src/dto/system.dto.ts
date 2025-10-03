import { z } from "zod";

/**
 * Node information response.
 */
export const ReadAboutNodeResponse = z.object({
  started: z.iso.datetime(),
  build: z.object({
    time: z.iso.datetime(),
    commit: z.string(),
    version: z.string(),
  }),
  public_key: z.string(),
  url: z.url(),
  maintenance: z.object({
    active: z.boolean(),
    started_at: z.iso.datetime(),
  }),
});

export type ReadAboutNodeResponse = z.infer<typeof ReadAboutNodeResponse>;

/**
 *
 */
export const NodeHealthCheckResponse = z.literal("OK");
export type NodeHealthCheckResponse = z.infer<typeof NodeHealthCheckResponse>;
