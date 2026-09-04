import { join } from "@std/path";
import { exists } from "@std/fs";

import jsforce from "@jsforce/jsforce-node";
import { importPKCS8, SignJWT } from "@panva/jose";

import type { ISalesforceCertRefreshRequest } from "./model.ts";

class Main {
  private currentWorkDir = Deno.cwd();
  private salesforceApiVersion = "67.0";
  private certRefreshRequestMap:
    | Map<string, ISalesforceCertRefreshRequest>
    | null = null;
  private salesforceConnectionMap: Map<string, jsforce.Connection> | null =
    null;

  public async run() {
    this.certRefreshRequestMap = await this.readCertRefreshRequests();

    // login to each instance and refresh certs for each app
    this.salesforceConnectionMap = await this.getSalesforceConnections(
      Array.from(this.certRefreshRequestMap.keys()),
    );
  }

  private readCertRefreshRequests = async () => {
    const inputFolderPath = join(this.currentWorkDir, "INPUT");
    const certRefreshRequests = new Map<
      string,
      ISalesforceCertRefreshRequest
    >();

    for await (const entry of Deno.readDir(inputFolderPath)) {
      if (entry.isDirectory) {
        const requestFilePath = join(
          inputFolderPath,
          entry.name,
          "request.json",
        );

        if (!(await exists(requestFilePath))) {
          console.log(`Ignoring ${entry.name} as request.json does not exist.`);
          continue;
        }

        try {
          const requestJson = await Deno.readTextFile(requestFilePath);
          const request = JSON.parse(
            requestJson,
          ) as ISalesforceCertRefreshRequest;
          certRefreshRequests.set(entry.name, request);
        } catch (error) {
          console.error(`Error reading request.json for ${entry.name}:`, error);
          throw error;
        }
      }
    }

    return certRefreshRequests;
  };

  private getSalesforceConnections = async (instanceNames: string[]) => {
    const connections = new Map<string, jsforce.Connection>();
    for (const instanceName of instanceNames) {
      const { connection } = await this.login(instanceName);
      connections.set(instanceName, connection);
    }
    return connections;
  };

  /**
   * @param instanceName Registered instance name. Folder name inside `INPUT` folder.
   * @returns Connection object to Salesforce org
   */
  private login = async (instanceName: string) => {
    const request = this.certRefreshRequestMap?.get(instanceName);
    if (!request) {
      throw new Error(
        `No cert refresh request found for instance: ${instanceName}`,
      );
    }

    const authParam = request.authParam;

    const issuer = authParam.appId;
    const username = authParam.username;
    const jwtDurationSeconds = authParam.jwtDurationSeconds ?? 300; // Default to 5 minutes if not provided

    const claim = {
      iss: issuer,
      aud: authParam.orgType === "PRODUCTION"
        ? "https://login.salesforce.com"
        : "https://test.salesforce.com",
      sub: username,
      exp: Math.floor(Date.now() / 1000) + jwtDurationSeconds, // Token expiration time
    };

    const privateKeyPath = join(
      this.currentWorkDir,
      "INPUT",
      instanceName,
      authParam.privateKeyFilename ?? `${instanceName}.key`,
    );

    const privateKeyText = await Deno.readTextFile(
      privateKeyPath,
    );
    const privateKey = await importPKCS8(privateKeyText, "RS256");

    // sign jwt with private key, we get bearer token
    const jwt = await new SignJWT(claim)
      .setProtectedHeader(
        { alg: "RS256" },
      )
      .sign(privateKey);

    // use bearer token to login to salesforce
    const connection = new jsforce.Connection(
      {
        version: this.salesforceApiVersion,
      },
    );

    const userInfo = await connection.authorize({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    });

    return { userInfo, connection };
  };
}

export default (new Main()).run();
