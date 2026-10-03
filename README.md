# certifresh-salesforce

Scripts to replace certificates used by Connected / External Client Apps in a
Salesforce instance

## Input

Expecting:

```
{CWD}/INPUT/{orgName}/...

- request.json
- prefixed_private.key (for initial auth)
- prefixed_certificate.leaf.crt (for replacement)
- prefixed_certificate.leaf.crt (for replacement)
- ...
```

`request.json` format:

```typescript
export interface ISalesforceCertRefreshRequest {
  authParam: ISalesforceAuthInfo;
  apps: ITargetAppDefinition[];
}

export interface ITargetAppDefinition {
  metadataApiName: string;
  /** Prefixed certificate Common Name. ${sfOrgName}_${certName} */
  prefixedCommonName: string;
  type: "CONNECTED_APP" | "EXTERNAL_CLIENT_APP";
}
```

## Output

success.json / error.json with an object, type of `ICertRefreshReport`.

```typescript
export interface ICertRefreshReportItem {
  appApiName: string;
  /** Prefixed certificate Common Name. ${sfOrgName}_${certName} */
  prefixedCommonName: string;
  appType: "CONNECTED_APP" | "EXTERNAL_CLIENT_APP";
  okay: boolean;
  message?: string | null;
}

interface ICertRefreshReport {
  message: string;
  successful: Record<string, ICertRefreshReportItem[]>;
  failed: Record<string, ICertRefreshReportItem[]>;
}
```

Example

```jsonc
{
  "message": "All certificate updates succeeded.",
  "successful": {
    "myAwesomeOrgA": [
      {
        "appApiName": "app1",
        "certCommonName": "myAwesomeOrgA_app1",
        "appType": "EXTERNAL_CLIENT_APP",
        "okay": true,
        "message": null
      },
      {
        "appApiName": "app2",
        "certCommonName": "myAwesomeOrgA_app2",
        "appType": "CONNECTED_APP",
        "okay": true,
        "message": null
      }
    ],
    "myAwesomeOrgB": [
      {
        "appApiName": "app0",
        "certCommonName": "myAwesomeOrgB_app0",
        "appType": "EXTERNAL_CLIENT_APP",
        "okay": true,
        "message": null
      },
      {
        "appApiName": "app0",
        "certCommonName": "myAwesomeOrgB_app0",
        "appType": "CONNECTED_APP",
        "okay": true,
        "message": null
      }
    ]
  },
  "failed": {}
}
```

## Run

```
deno task start
```

## Build

```
bash build.sh
```

The compressed file can be found in `artifacts` folder.

It can later be uploaded to S3 storage manually, and used by a workflow engine,
such as Windmill.

## Notes

### Auth private key

Private key of each org is used for initial auth. It has to be in PKCS#8 format.

Note that if you also choose to replace the Auth certificate used by the
connected app, its current private key will no longer work after the process is
done. Just a reminder that your workflow needs to handle this.

### Certificates

All the certifiactes should only contain the leaf. (only one
`-----BEGIN CERTIFICATE-----`...`-----END CERTIFICATE-----` section). Salesforce
connected apps do not support the bundle with multiple certificates.

### Connected app (or ECA) used by Certifresh

The option `Issue JSON Web Token (JWT)-based access tokens for named users` must
be UNTICKED. Because SOAP API, used by JsForce to replace app metadata, does not
support this feature.
