export interface ISalesforceAuthInfo {
  appId: string;
  username: string;
  orgType: "SANDBOX" | "PRODUCTION";
  privateKeyFilename?: string;
  jwtDurationSeconds?: number;
}

export interface ITargetAppDefinition {
  certRequestName: string;
  metadataApiName: string;
  type: "CONNECTED_APP" | "EXTERNAL_CLIENT_APP";
}

export interface ISalesforceCertRefreshRequest {
  authParam: ISalesforceAuthInfo;
  apps: ITargetAppDefinition[];
}
