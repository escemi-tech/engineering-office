# Qualify the OVHcloud host

Use this procedure to prepare OVHcloud access and qualify the first professional
Hermes host before implementing provisioning. It covers a new project setup or
an existing project, without ordering compute. The
[Hermes host and deployment playbooks](hermes-deployment.md) prepare an approved
Ubuntu host and install the runtime; they do not create cloud resources.

## Select the target

Identify the Public Cloud project or VPS service intended for engineering-office.
An OVHcloud account alone does not establish that either exists. For a new Public
Cloud project, follow the setup steps below. Compare the available offers before
activating paid services. Keep professional and household resources separate.

For an existing Public Cloud project, open **Public Cloud**, select that project,
then inspect **Quota & Regions** and **Billing Control**. Use **Horizon** when the
image, flavor or network identifiers are needed. These are the native interfaces
documented in the [OVHcloud interface guide](https://docs.ovhcloud.com/en/guides/public-cloud/cross-functional/public-cloud-interface-walk-me).
Inspect existing resources or credits only when they affect this target's capacity
or cost; an account-wide inventory is unnecessary.

Manager access is sufficient for the initial catalogue and billing assessment.
The OpenStack access below enables infrastructure inspection. If a suitable
profile already exists, verify its project, region and roles before reusing it.

## Create the initial Public Cloud project

1. Sign in to the [OVHcloud Manager](https://www.ovh.com/manager/) with the account
   that owns the professional services and open **Public Cloud**.
2. Follow the first-project screen, review the contracts and choose
   **Discover the Public Cloud universe** when offered. Name the project
   `engineering-office`; if the discovery flow assigns a name, rename it in the
   project's settings. Keep its ID in the private qualification record.
3. Check whether the project is in **Discovery mode** or active. Discovery mode
   lets you explore products without creating instances. Some accounts instead
   receive a project-creation form that requires a payment method. Review that
   account-specific summary before confirming; do not assume a zero-charge
   activation or an eligible trial.
4. Keep discovery mode while comparing offers. When ready to activate, use
   **Activate project**, review the payment details and confirm in Manager.
   Activation enables resource creation; it does not require creating an instance.
   Trial credit, when offered, starts at activation and expires, so do not activate
   early merely to reserve it.
5. Inspect **Quota & Regions** and choose an available French region for the
   candidate. Record its exact identifier, quota and image/flavor availability.
   Leave unavailable capabilities pending; discovery mode may require activation
   before the following access steps become available.

Follow [OVHcloud's first-project procedure](https://docs.ovhcloud.com/fr/guides/public-cloud/cross-functional/create-a-public-cloud-project)
for the account's current screens. Stop before creating instances, volumes,
snapshots, public IPs or gateways. Compute billing begins when an instance reaches
`ACTIVE`; other allocated services have their own charges. The
[billing reference](https://docs.ovhcloud.com/en/guides/public-cloud/cross-functional/analyze-billing)
explains those meters. The accepted budgets below apply before any paid test.

## Create read-only OpenStack access

In the selected project's **Users & Roles**, create a dedicated user with the
description `engineering-office-qualification`. Assign only **Infrastructure
Supervisor** and review the assigned roles before using it. This role provides
read access to compute, images, volumes, networks and security groups in the
project; it is not a provisioning identity. See the
[role permissions](https://docs.ovhcloud.com/en/guides/manage-and-operate/iam/authenticate-api-openstack-with-service-account)
and [dedicated-user example](https://docs.ovhcloud.com/en/guides/public-cloud/containers-orchestration/managed-kubernetes/monitoring-instances-prometheus-grafana#generate-the-configuration-for-openstack).

Save the generated username and password immediately in a professional Bitwarden
item, such as `engineering-office / OVH qualification`. The description is not
the generated username, and the password is displayed only once. Follow
[OVHcloud's user management guide](https://docs.ovhcloud.com/en/guides/public-cloud/cross-functional/create-and-delete-a-user)
to reset a lost password or delete this user when access is no longer needed.
Keep this credential outside Hermes and GitHub Actions. A later provisioning
identity receives separately reviewed roles; do not broaden this inspection user.

## Download and check the access profile

From that user's **...** menu, select **Download OpenStack's RC file** and choose
the exact region selected above. Use the provider-generated file rather than
typing project IDs or authentication endpoints by hand. From the repository root,
replace the example download path with its actual location:

```sh
install -d -m 0700 .local .local/ovh
install -m 0600 /path/to/downloaded-openrc.sh .local/ovh/qualification-openrc.sh
```

Review an existing destination before replacing it. After checking the saved
copy, remove the original download from any less protected location. This OpenRC
file configures a specific user/project and region; it prompts for the OpenStack
password instead of storing it. Do not add the password to the file. See
[OVHcloud's OpenRC instructions](https://docs.ovhcloud.com/en/guides/public-cloud/cross-functional/compute-set-openstack-environment-variables).

Open **Horizon** from the selected project and sign in as this user. Select the
matching project and region, then inspect images and quotas without launching a
resource. Alternatively, with the native
[OpenStack CLI](https://docs.openstack.org/python-openstackclient/latest/cli/index.html)
installed, open a fresh Bash terminal in the checkout and run:

```sh
source .local/ovh/qualification-openrc.sh
openstack flavor list
openstack image list
openstack quota show --compute
openstack limits show --absolute
openstack quota show --network --usage
openstack quota show --volume --usage
exit
```

Enter the password only at the hidden prompt. These commands read the configured
project's catalogue and quotas; `exit` closes the terminal holding the credential
environment. Read compute quotas and absolute limits together: the detailed
`quota show --compute --usage` endpoint can be denied to Infrastructure Supervisor.
If a read is denied, record that specific failure and use Manager for the missing
information instead of granting administrator rights. An OpenRC download alone
does not prove API access, and it is not unattended authentication.

Check Neutron's network quotas for security groups and rules before planning a
custom firewall boundary. Compute's older security-group limits do not establish
available Neutron quota. If network quotas are zero or inconsistent, resolve them
through Manager or OVHcloud support before provisioning. Preserve OVHcloud's
default security group; use a dedicated group for custom rules as described in
the [provider's security-group guide](https://docs.ovhcloud.com/en/guides/public-cloud/compute/setup-security-group).

For the next qualification step, provide only the project display name, discovery
or active status, region, absolute OpenRC path and whether the read checks passed.
Keep the file contents, password and raw account exports out of chat and the PR.

## Record the qualification privately

Keep the assessment in `.local/ovh-qualification.md`, with directory mode `0700`
and file mode `0600`. `.local/` is ignored by Git. Store credentials separately;
this record needs only references to their protected locations. Publish only a
sanitized decision and unresolved constraints, not account identifiers or exports.

| Evidence            | Record                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope               | Assessment date, professional owner, selected product and project/service reference, or explicitly no existing target                                                              |
| Region and capacity | Available region, image and flavor identifiers, supported OS, CPU/RAM/disk shape, and remaining quotas for the proposed resources                                                  |
| Host compatibility  | How the image will receive Docker, Compose, Make and Python required by the [deployment guide](hermes-deployment.md#prepare-the-controller-and-host)                               |
| Management access   | Approved operator identity, private SSH path, emergency console access and proposed firewall boundaries; the Hermes gateway stays on host loopback                                 |
| Provisioning API    | Supported provider/resources for creating, reading and deleting this product; access method and any unverified permissions                                                         |
| Hosting quote       | Currency, tax, billing interval, commitment/renewal terms, compute, boot disk, public IP, network services, traffic, backups and state storage; explicitly identify included items |
| Test quote          | Hourly terms, minimum charge, resource list, run duration, cleanup duration and worst-case tax-inclusive total                                                                     |
| Open items          | Missing access, unavailable capacity, unverified API behavior and the next check needed for each                                                                                   |

The [Public Cloud catalogue](https://www.ovhcloud.com/fr/public-cloud/prices/)
and [VPS catalogue](https://www.ovhcloud.com/fr/vps/) help compare candidates;
retain a dated account quote for the selected region and billing mode. A public
starting price does not establish eligibility or the final invoice. Recheck the
quote and available quota before execution.

The disposable [CI VM](../../tests/lima.yml) validates deployment behavior with
synthetic inference. Its size is a test configuration, not measured production
capacity. Allow for the OS, Docker, retained state and backup operations when
sizing the host; no local model inference is included.

## Apply the accepted budgets

Hosting has a **EUR 100/month ceiling**, excluding AI API costs. Record tax
separately and compare the tax-inclusive total against that ceiling until its tax
treatment is confirmed. Count every required service, including management
networking, backups and state storage. Do not assume promotional credits recur.

The initial cloud test campaign has **EUR 5 total including tax**, separate from
hosting: three sequential runs capped at EUR 1 each, plus EUR 2 reserved for
cleanup. This is a one-off campaign, not a monthly allowance. Budget one VM and
one IPv4 at a time, up to two hours per run plus one hour for cleanup; account for
the selected product's minimum billing unit. Additional paid resources require a
revised estimate before execution. These limits do not authorize a purchase.

## Prepare provisioning

The next implementation uses this assessment to select the provider and fixture.
Before paid execution, it must provide:

- An isolated state backend with tested encryption, independent key recovery and
  simultaneous-writer locking.
- Restricted management access with an independent recovery path.
- A reviewed resource plan, cost preflight and bounded cleanup that records and
  removes only the test's resources, including separately billed assets. A failed
  cleanup blocks the next run.

After approval to run the bounded test campaign, qualify create, configure,
rerun, recovery and destroy behavior with synthetic inputs. The operational host
requires that evidence and its own reviewed plan before creation.

Record missing evidence as pending. Completing this guide does not prove a live
provider lifecycle or authorize `make hermes-deploy`; host and change approval
still follow the [deployment guide](hermes-deployment.md).
