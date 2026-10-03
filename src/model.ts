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
  /** Prefixed certificate Common Name. ${sfOrgName}_${certName} */
  prefixedCommonName: string;
  type: "CONNECTED_APP" | "EXTERNAL_CLIENT_APP";
}

export interface ISalesforceCertRefreshRequest {
  authParam: ISalesforceAuthInfo;
  apps: ITargetAppDefinition[];
}

export interface ICertRefreshReportItem {
  appApiName: string;
  /** Prefixed certificate Common Name. ${sfOrgName}_${certName} */
  prefixedCommonName: string;
  appType: ITargetAppDefinition["type"];
  okay: boolean;
  message?: string | null;
}

export interface ICertRefreshReport {
  message: string;
  successful: Record<string, ICertRefreshReportItem[]>;
  failed: Record<string, ICertRefreshReportItem[]>;
}
