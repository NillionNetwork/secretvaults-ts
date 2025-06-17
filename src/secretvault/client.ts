import { SecretVaultOptions } from "./types";

export class SecretVaultClient {
  #options: SecretVaultOptions;
  constructor(options: SecretVaultOptions) {
    this.#options = options;
  }
}

export function createSecretVaultClient(
  options: SecretVaultOptions,
): SecretVaultClient {
  const validated = SecretVaultOptions.parse(options);
  return new SecretVaultClient(validated);
}
