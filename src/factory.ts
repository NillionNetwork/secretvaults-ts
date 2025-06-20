import { type Keypair, NilauthClient, PayerBuilder } from "@nillion/nuc";
import { SecretVaultBuilderClient } from "#/builder-client";
import { createNilDbBuilderClient } from "#/nildb/builder-client";
import { createNilDbUserClient } from "#/nildb/user-client";
import { SecretVaultUserClient } from "#/user-client";

export async function createSecretVaultUserClient(options: {
  keypair: Keypair;
  baseUrls: string[];
}): Promise<SecretVaultUserClient> {
  const { baseUrls, keypair } = options;

  const clientPromises = baseUrls.map((baseUrl) =>
    createNilDbUserClient(baseUrl),
  );
  const clients = await Promise.all(clientPromises);

  return new SecretVaultUserClient({
    clients,
    keypair,
  });
}

export async function createSecretVaultBuilderClient(options: {
  keypair: Keypair;
  urls: {
    chain: string;
    auth: string;
    dbs: string[];
  };
}): Promise<SecretVaultBuilderClient> {
  const { urls, keypair } = options;

  // This is not used for subscription payments; its is created here because NilauthClient
  // requires a payer
  const payerBuilder = await new PayerBuilder()
    .keypair(keypair)
    .chainUrl(urls.chain)
    .build();
  const nilauthClient = await NilauthClient.from(urls.auth, payerBuilder);

  const clientPromises = urls.dbs.map((base) => createNilDbBuilderClient(base));
  const clients = await Promise.all(clientPromises);

  return new SecretVaultBuilderClient({
    clients,
    nilauthClient,
    keypair,
  });
}
