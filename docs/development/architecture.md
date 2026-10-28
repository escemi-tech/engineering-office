# Infrastructure boundaries

Repository: `escemi-tech/engineering-office`. Scope: OVHcloud infrastructure, engineering agents and professional integrations.

This repository owns one independent trust domain. Future OpenTofu state must use
its own backend object namespace, access identity and encryption configuration.
No backend or deployment credential is configured during bootstrap. Local state,
plans, private variables, keys and private inventory are ignored by Git. Review
ignore rules before adding new state formats; an ignore rule is not secret scanning.

Human credentials and recovery keys stay in Bitwarden with identities dedicated
to this domain. Public defaults and synthetic CI fixtures may be committed.
Operational data, raw backups and authenticated test artifacts must remain outside
this public repository. PR CI uses no account credentials.

The `production` environment is reserved for reviewed deployments from protected
branches, with an explicit reviewer gate. No workflow currently deploys or spends
money. Main-branch protection requires passing checks and a pull-request review.
A PR author cannot approve their own PR; another eligible reviewer is required.

Dependencies are pinned to immutable Action commits and a Docker digest. Dependabot
proposes updates. The Makefile derives its action revision from the shared workflow
reference, so local and CI lifecycle code cannot drift to different revisions. Review
shared CI updates with a complete VM lifecycle before merging.
