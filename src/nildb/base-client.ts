import { Did as NucDid } from "@nillion/nuc";
import { z } from "zod/v4";
import { log } from "#/common/logger";
import { NilDbEndpoint } from "#/common/paths";
import {
  NodeHealthCheckResponse,
  ReadAboutNodeResponse,
} from "#/dto/system.dto";

export const NilDbBaseClientOptions = z.object({
  about: ReadAboutNodeResponse,
  baseUrl: z.string().min(15),
});

export type NilDbBaseClientOptions = z.infer<typeof NilDbBaseClientOptions>;

export type AuthenticatedRequestOptions = {
  path: string;
  token?: string;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
};

export class NilDbBaseClient {
  #options: NilDbBaseClientOptions;

  constructor(options: NilDbBaseClientOptions) {
    this.#options = options;
  }

  get name(): string {
    return this.#options.about.public_key.slice(-4);
  }

  get id(): NucDid {
    return NucDid.fromHex(this.#options.about.public_key);
  }

  /**
   * Handles error responses with consistent error information
   */
  private handleErrorResponse(
    response: Response,
    method: string,
    path: string,
    body: unknown,
  ): never {
    throw new Error(`Request failed: ${method} ${path}`, {
      cause: {
        body,
        response,
        status: response.status,
        statusText: response.statusText,
      },
    });
  }

  /**
   * Makes an authenticated request to the NilDb API
   */
  async request<TSuccess>(options: {
    path: string;
    token?: string;
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
    // biome-ignore lint/suspicious/noExplicitAny: these enable more ergonomic types in the test client
    responseSchema: z.Schema<TSuccess, any, any>;
  }): Promise<TSuccess> {
    const { path, token, method = "GET", body, responseSchema } = options;

    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const endpoint = new URL(path, this.#options.baseUrl).toString();

    const response = await fetch(endpoint, {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const json = await response.json();
      console.log("Response body: ", json);

      if (!response.ok) {
        this.handleErrorResponse(response, method, path, json);
      }

      return responseSchema.parse(json);
    }

    if (contentType.includes("text/plain")) {
      const text = await response.text();
      console.log("Response text: ", text);

      if (!response.ok) {
        this.handleErrorResponse(response, method, path, text);
      }

      return responseSchema.parse(text);
    }

    log("Response has no body");
    if (!response.ok) {
      this.handleErrorResponse(response, method, path, null);
    }

    return responseSchema.parse(undefined);
  }

  /**
   * Retrieves comprehensive node information including version and configuration
   */
  async aboutNode(): Promise<ReadAboutNodeResponse> {
    return await this.request({
      path: NilDbEndpoint.v1.system.about,
      responseSchema: ReadAboutNodeResponse,
    });
  }

  /**
   * Checks node health status
   */
  async healthCheck(): Promise<"OK"> {
    return await this.request({
      path: NilDbEndpoint.v1.system.health,
      responseSchema: NodeHealthCheckResponse,
    });
  }
}
