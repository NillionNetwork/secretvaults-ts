import { Did as NucDid } from "@nillion/nuc";
import { z } from "zod";
import { NilDbEndpoint } from "#/common/paths";
import { isError, pause } from "#/common/utils";
import {
  NodeHealthCheckResponse,
  ReadAboutNodeResponse,
} from "#/dto/system.dto";
import { Log } from "#/logger";

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
   * Determines if an error is retryable based on its type
   */
  private isRetryableError(error: unknown): boolean {
    if (isError(error)) {
      const retryableNames = [
        "NetworkError",
        "AbortError",
        "TimeoutError",
        "ERR_NETWORK",
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
      ];

      if (retryableNames.includes(error.name)) {
        return true;
      }

      // Check error message for network-related issues
      const message = error.message.toLowerCase();
      if (
        message.includes("network") ||
        message.includes("fetch failed") ||
        message.includes("connection refused") ||
        message.includes("timeout")
      ) {
        return true;
      }

      // Check if it's a response error with retryable status
      const cause = (error as { cause?: { status?: number } }).cause;
      if (cause?.status) {
        // Retry on 5xx errors and specific 4xx errors
        return (
          cause.status >= 500 || cause.status === 429 || cause.status === 408
        );
      }
    }

    return false;
  }

  /**
   * Executes a fetch request with retry logic for network failures
   */
  private async fetchWithRetry(
    endpoint: string,
    fetchOptions: RequestInit,
    context: string,
    maxRetries = 5,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fetch(endpoint, fetchOptions);
      } catch (error) {
        lastError = error;

        if (!this.isRetryableError(error) || attempt === maxRetries) {
          Log.debug(
            `${context} failed permanently after ${attempt} attempts: %O`,
            error,
          );
          throw error;
        }

        const delay = Math.min(1000 * 2 ** (attempt - 1), 10000); // Exponential backoff with max 10s
        Log.debug(
          `${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: %O`,
          error,
        );
        await pause(delay);
      }
    }

    throw lastError;
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
    const context = `${method} ${path}`;

    const response = await this.fetchWithRetry(
      endpoint,
      {
        method,
        headers,
        ...(body && { body: JSON.stringify(body) }),
      },
      context,
    );

    const contentType = response.headers.get("content-type") ?? "";
    const status = response.status;

    if (contentType.includes("application/json")) {
      const json = await response.json();
      Log.debug({ endpoint, json, status }, "Response was application/json");

      if (!response.ok) {
        this.handleErrorResponse(response, method, endpoint, json);
      }

      return responseSchema.parse(json);
    }

    if (contentType.includes("text/plain")) {
      const text = await response.text();
      Log.debug({ endpoint, text, status }, "Response was text/plain");

      if (!response.ok) {
        this.handleErrorResponse(response, method, path, text);
      }

      return responseSchema.parse(text);
    }

    Log.debug({ endpoint, status }, "Response had no body");
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
