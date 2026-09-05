export interface ISalesforceAuthInfo {
  appId: string;
  username: string;
  orgType: "SANDBOX" | "PRODUCTION";
  /** filename with extension */
  privateKeyFileName?: string;
  jwtDurationSeconds?: number;
}

export interface ITargetAppDefinition {
  metadataApiName: string;
  /** filename with extension */
  certFileName: string;
  type: "CONNECTED_APP" | "EXTERNAL_CLIENT_APP";
}

export interface ISalesforceCertRefreshRequest {
  authParam: ISalesforceAuthInfo;
  apps: ITargetAppDefinition[];
}
