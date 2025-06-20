import {
  type Command,
  type Did,
  InvocationBody,
  type Keypair,
  NucTokenBuilder,
  NucTokenEnvelopeSchema,
} from "@nillion/nuc";
import { intoSecondsFromNow } from "#/common/time";
import { NucCmd } from "./common/nuc-cmd";
import type { ByNodeName } from "./common/types";
import type {
  CreateDataResponse,
  CreateOwnedDataRequest,
} from "./dto/data.dto";
import type { ReadAboutNodeResponse } from "./dto/system.dto";
import type {
  DeleteDocumentRequestParams,
  DeleteDocumentResponse,
  GrantAccessToDataRequest,
  GrantAccessToDataResponse,
  ListDataReferencesResponse,
  ReadDataRequestParams,
  ReadDataResponse,
  ReadUserProfileResponse,
  RevokeAccessToDataRequest,
  RevokeAccessToDataResponse,
} from "./dto/users.dto";
import type { NilDbUserClient } from "./nildb/user-client";

export type SecretVaultUserClientOptions = {
  keypair: Keypair;
  clients: NilDbUserClient[];
};

export class SecretVaultUserClient {
  _options: SecretVaultUserClientOptions;

  constructor(options: SecretVaultUserClientOptions) {
    this._options = options;
  }

  get did(): Did {
    return this._options.keypair.toDid();
  }

  get nodes(): NilDbUserClient[] {
    return this._options.clients;
  }

  get keypair(): Keypair {
    return this._options.keypair;
  }

  readClusterInfo(): Promise<ByNodeName<ReadAboutNodeResponse>> {
    return this.executeOnAllNodes((client) => client.aboutNode());
  }

  readUserProfile(): Promise<ByNodeName<ReadUserProfileResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.root,
        audience: client.did,
      });

      return client.getProfile(token);
    });
  }

  createData(
    delegation: string,
    body: CreateOwnedDataRequest,
  ): Promise<ByNodeName<CreateDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const envelop = NucTokenEnvelopeSchema.parse(delegation);
      const token = NucTokenBuilder.extending(envelop)
        .audience(client.did)
        .command(NucCmd.nil.db.data.create)
        .expiresAt(intoSecondsFromNow(60))
        .body(new InvocationBody({}))
        .build(this.keypair.privateKey());

      return client.createOwnedData(token, body);
    });
  }

  listDataReferences(): Promise<ByNodeName<ListDataReferencesResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.read,
        audience: client.did,
      });

      return client.listDataReferences(token);
    });
  }

  readData(
    params: ReadDataRequestParams,
  ): Promise<ByNodeName<ReadDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.read,
        audience: client.did,
      });

      return client.readData(token, params);
    });
  }

  deleteData(
    params: DeleteDocumentRequestParams,
  ): Promise<ByNodeName<DeleteDocumentResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.delete,
        audience: client.did,
      });

      return client.deleteData(token, params);
    });
  }

  grantAccess(
    body: GrantAccessToDataRequest,
  ): Promise<ByNodeName<GrantAccessToDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.update,
        audience: client.did,
      });

      return client.grantAccess(token, body);
    });
  }

  revokeAccess(
    body: RevokeAccessToDataRequest,
  ): Promise<ByNodeName<RevokeAccessToDataResponse>> {
    return this.executeOnAllNodes(async (client) => {
      const token = this.mintInvocation({
        cmd: NucCmd.nil.db.users.update,
        audience: client.did,
      });

      return client.revokeAccess(token, body);
    });
  }

  private async executeOnAllNodes<T>(
    operation: (client: NilDbUserClient) => Promise<T>,
  ): Promise<Record<string, T>> {
    const promises = this.nodes.map(async (client) => ({
      name: client.name,
      result: await operation(client),
    }));

    const results = await Promise.all(promises);

    return results.reduce(
      (acc, { name, result }) => {
        acc[name] = result;
        return acc;
      },
      {} as Record<string, T>,
    );
  }

  private mintInvocation(options: { cmd: Command; audience: Did }): string {
    const builder = NucTokenBuilder.invocation({});

    return builder
      .command(options.cmd)
      .subject(this.did)
      .audience(options.audience)
      .expiresAt(intoSecondsFromNow(60))
      .build(this.keypair.privateKey());
  }
}
