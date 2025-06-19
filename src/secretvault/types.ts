import z from "zod";
import type { ReadAboutNodeResponse } from "#/nildb/dto/system.dto";
import type { ReadProfileResponse } from "#/nildb/dto/users.dto";

export const DataConflictResolutionStrategy = z.enum(["random"]);
export type DataConflictResolutionStrategy = z.infer<
  typeof DataConflictResolutionStrategy
>;

export type ClusterNodesInfo = Record<string, ReadAboutNodeResponse>;
export type ClusterUserProfiles = Record<string, ReadProfileResponse>;

/**
 *
 */
export type ByNodeName<T> = Record<string, T>;
