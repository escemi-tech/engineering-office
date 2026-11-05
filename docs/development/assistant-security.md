# Professional assistant permissions

The first MVP serves professional internal work. Its current runtime is qualified
with public synthetic fixtures only. Personal and client sources remain disabled.

| Identity                   | Responsibility                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Human operator             | Select sources and processors, review final external actions, approve deployments and revoke access.                                 |
| Assistant runtime          | Produce conversations and drafts within its approved scope; no deployment or approval authority.                                     |
| Connector/publisher        | Hold source credentials outside the runtime and enforce allowed resources, methods and approved final payloads. Not implemented yet. |
| Deployer/recovery operator | Install reviewed artifacts, protect policy and independently stop or recover the service.                                            |
| CI/coding worker           | Use public code and synthetic fixtures; no private source or production credentials.                                                 |

The runtime receives only its inference credential and local gateway credential.
Tools are disabled in the mounted configuration. Credentials for mail, calendars,
publication, infrastructure and household services must never be added to this
runtime. Bitwarden remains the human custody store, with separate domain identities.

The recovery operator can [stop Hermes and rotate credentials](../usage/hermes.md#stop-and-revoke-access)
without its API, compiler or deployment configuration. Shutdown disables Docker
restart and retains the container, logs and volume. It requires independent host
access and does not revoke provider credentials or prevent an authorized deployer
from starting the service again.

Before admitting a private source, record its owner, exact resources, allowed
operations, model processor/region, retention and revocation procedure. Verify
credential separation, egress restrictions and denied-scope access with that
connector. Before publication, bind approval to the final recipient and payload
and reconcile uncertain outcomes before retrying. These controls are still to be
implemented; a prompt or profile is not an authorization boundary.
