import pino, { type Logger } from "pino";
import { vi } from "vitest";
import type { ByNodeName, Uuid } from "#/dto/common";
import type { ReadQueryRunByIdResponse } from "#/dto/queries.dto";
import type { FixtureContext } from "./fixture";

export function createTestLogger(): Logger {
  return pino();
}

export function waitForQueryRun(
  c: FixtureContext,
  runs: ByNodeName<Uuid>,
): Promise<Record<string, ReadQueryRunByIdResponse>> {
  const { expect, builder } = c;

  return vi.waitFor(
    async () => {
      const result = await builder.readQueryRunResults(runs);

      const nodes = Object.values(result);
      const completedNodes = nodes.filter(
        (node) =>
          node.data.status === "complete" || node.data.status === "error",
      );

      expect(completedNodes.length).toBe(2);
      return result;
    },
    {
      timeout: 15000,
      interval: 1500,
    },
  );
}
