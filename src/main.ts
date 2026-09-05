import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";

import jsforce from "@jsforce/jsforce-node";
import { importPKCS8, SignJWT } from "@panva/jose";

import type {
  ISalesforceCertRefreshRequest,
  ITargetAppDefinition,
} from "./model.ts";

interface IUpdateCertificateResult {
  appApiName: string;
  okay: boolean;
  message?: string | null;
}

interface ICertRefreshReport {
  message: string;
  successful: Record<string, IUpdateCertificateResult[]>;
  failed: Record<string, IUpdateCertificateResult[]>;
}

class Main {
  private currentWorkDir = Deno.cwd();
  private salesforceApiVersion = "67.0";
  private certRefreshRequestMap:
    | Map<string, ISalesforceCertRefreshRequest>
    | null = null;
  private salesforceConnectionMap: Map<string, jsforce.Connection> | null =
    null;

  public async run(): Promise<ICertRefreshReport> {
    this.certRefreshRequestMap = await this.readCertRefreshRequests();

    // login to instances
    this.salesforceConnectionMap = await this.getSalesforceConnections(
      Array.from(this.certRefreshRequestMap.keys()),
    );

    const instanceSuccessfulResultMap: Map<
      string,
      IUpdateCertificateResult[]
    > = new Map();
    const instanceFailedResultMap: Map<
      string,
      IUpdateCertificateResult[]
    > = new Map();
    let errorResultCount = 0;

    // for each instance, for each app, refresh certs
    for (const [instanceName, request] of this.certRefreshRequestMap) {
      const currentResultMap = await this.replaceCertificates(
        instanceName,
        request.apps,
      );

      // categorize results into successful and failed maps
      const currentResults = Array.from(currentResultMap.values());

      const successfulResults = currentResults.filter((result) => result.okay);
      if (successfulResults.length > 0) {
        instanceSuccessfulResultMap.set(
          instanceName,
          successfulResults,
        );
      }

      const failedResults = currentResults.filter((result) => !result.okay);
      if (failedResults.length > 0) {
        errorResultCount += failedResults.length;
        instanceFailedResultMap.set(
          instanceName,
          failedResults,
        );
      }
    }

    // Write report to OUTPUT folder
    const outputFolderPath = join(this.currentWorkDir, "OUTPUT");
    await ensureDir(outputFolderPath);
    const successFilePath = join(outputFolderPath, "success.json");
    const errorFilePath = join(outputFolderPath, "error.json");

    const report: ICertRefreshReport = {
      message: "",
      successful: Object.fromEntries(instanceSuccessfulResultMap),
      failed: Object.fromEntries(instanceFailedResultMap),
    };

    if (errorResultCount > 0) {
      // Some certificate updates failed.
      const message = `Failed to update ${errorResultCount} certificate(s).`;
      report.message = message;
      const reportJson = JSON.stringify(report, null, 2);
      await Deno.writeTextFile(errorFilePath, reportJson);
      throw new Error(message);
    } else {
      // All certificate updates succeeded.
      report.message = "All certificate updates succeeded.";
      const reportJson = JSON.stringify(report, null, 2);
      await Deno.writeTextFile(successFilePath, reportJson);
    }

    return report;
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

  /**
   * Get Salesforce connections for the given instance names.
   * @param instanceNames Array of instance names to get connections for.
   * @returns Map of instance name => Salesforce connection object.
   */
  private getSalesforceConnections = async (instanceNames: string[]) => {
    const connections = new Map<string, jsforce.Connection>();
    for (const instanceName of instanceNames) {
      const { connection } = await this.login(instanceName);
      connections.set(instanceName, connection);
    }
    return connections;
  };

  private updateConnectedAppCertificate = async (
    connection: jsforce.Connection,
    appMetadataApiName: string,
    certificateText: string,
  ) => {
    const existingMetadata = await connection.metadata.read(
      "ConnectedApp",
      appMetadataApiName,
    );

    const updatedMetadata = {
      ...existingMetadata,
      oauthConfig: {
        ...existingMetadata.oauthConfig,
        certificate: certificateText,
      },
    };

    return await connection.metadata.update(
      "ConnectedApp",
      updatedMetadata,
    );
  };

  private updateEcaCertificate = async (
    connection: jsforce.Connection,
    appMetadataApiName: string,
    certificateText: string,
  ) => {
    const existingMetadata = await connection.metadata.read(
      "ExtlClntAppGlobalOauthSettings" as any, // any: blame jsforce for not supporting this metadata type
      `${appMetadataApiName}_glbloauth`,
    );

    const updatedMetadata = {
      ...existingMetadata,
      certificate: certificateText,
    };

    return await connection.metadata.update(
      "ExtlClntAppGlobalOauthSettings" as any, // any: blame jsforce for not supporting this metadata type
      updatedMetadata,
    );
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
      authParam.privateKeyFileName ?? `${instanceName}.key`,
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

  /**
   * Replace certificates for the given apps in the specified Salesforce instance.
   * @param instanceName Registered instance name.
   * @param apps List of target apps to update certificates for.
   * @returns A map of app API names to their update results.
   */
  private replaceCertificates = async (
    instanceName: string,
    apps: ITargetAppDefinition[],
  ): Promise<Map<string, IUpdateCertificateResult>> => {
    /** appApiName => IUpdateCertificateResult */
    const resultMap = new Map<string, IUpdateCertificateResult>();
    for (const app of apps) {
      resultMap.set(app.metadataApiName, {
        appApiName: app.metadataApiName,
        okay: false,
        message: null,
      });
    }

    const connection = this.salesforceConnectionMap?.get(instanceName);
    if (!connection) {
      for (const result of resultMap.values()) {
        result.okay = false;
        result.message =
          `No Salesforce connection found for instance: ${instanceName}`;
      }
      return resultMap;
    }

    for (const app of apps) {
      const appCertUpdateResult = resultMap.get(app.metadataApiName)!;

      const certFilePath = join(
        this.currentWorkDir,
        "INPUT",
        instanceName,
        app.certFileName,
      );

      let certificateText: string;
      try {
        certificateText = await Deno.readTextFile(certFilePath);
      } catch (error) {
        appCertUpdateResult.okay = false;
        appCertUpdateResult.message = `Error reading certificate file: ${
          (error as Error)?.message ?? error
        }`;
        continue;
      }

      let metadataResult: jsforce.SaveResult;

      try {
        if (app.type === "CONNECTED_APP") {
          metadataResult = await this.updateConnectedAppCertificate(
            connection,
            app.metadataApiName,
            certificateText,
          ) as unknown as jsforce.SaveResult;
        } else {
          // defaults to EXTERNAL_CLIENT_APP
          metadataResult = await this.updateEcaCertificate(
            connection,
            app.metadataApiName,
            certificateText,
          ) as unknown as jsforce.SaveResult;
        }

        if (metadataResult.success) {
          appCertUpdateResult.okay = true;
        } else {
          appCertUpdateResult.okay = false;
          appCertUpdateResult.message = `Failed to update certificate: ${
            metadataResult.errors?.join(", ")
          }`;
        }
      } catch (error) {
        appCertUpdateResult.okay = false;
        appCertUpdateResult.message = `Error updating certificate: ${
          (error as Error)?.message ?? error
        }`;
      }
    }

    return resultMap;
  };
}

export default (new Main()).run();
