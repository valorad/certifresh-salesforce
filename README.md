# certifresh-salesforce

Scripts to replace certificates used by Connected / External Client Apps in a
Salesforce instance

## Input

Expecting:

```
{CWD}/INPUT/{orgName}/...

- request.json
- {privateKeyFileName} (for initial auth)
- {certificateFileName_A} (for replacement)
- {certificateFileName_B} (for replacement)
- ...
```

## Output

TBD

## Notes

### Auth private key

Private key of each org is used for initial auth. It has to be in PKCS#8 format.

Note that the auth certificate used by the connected app will also be replaced,
so the private key might no longer work after the process is done.

### Certificates

All the certifiactes should only contain the leaf. (only one
`-----BEGIN CERTIFICATE-----`...`-----END CERTIFICATE-----` section). Salesforce
connected apps do not support the bundle with multiple certificates.

### Connected app (or ECA) used by certifresh

The option `Issue JSON Web Token (JWT)-based access tokens for named users` must
be UNTICKED.

Because SOAT API, used by JsForce to replace apps, does not support this
feature.
