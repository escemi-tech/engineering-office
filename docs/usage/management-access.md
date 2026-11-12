# Administer an approved host privately

Use WireGuard for one operator's SSH access to one approved Ubuntu 26.04 host.
The maintained upstream role owns the interface, keys and service. The local
policy restricts new SSH connections to that operator's private address and
blocks forwarding through the tunnel. WireGuard authenticates the device; SSH
still authenticates the user with the existing SSH key and sudo policy.

This procedure does not provision a server or authorize spending. Complete the
[OVH qualification](ovh-qualification.md), target approval and independent console
check before changing a real host. The cloud security group remains a separate
required boundary. Permit UDP 51820 to the host; restrict bootstrap TCP 22 to the
operator's current public address, then remove that rule after cutover.

## Prepare the operator

Use the controller prerequisites in the [deployment guide](hermes-deployment.md#prepare-the-controller-and-host).
Install the pinned dependencies and upstream role in the checkout's protected
local environment:

```sh
python3 -m venv .local/ansible
. .local/ansible/bin/activate
python -m pip install -r ansible/requirements.txt
ansible-galaxy collection install -r ansible/collections/requirements.yml
ansible-galaxy role install -r ansible/collections/requirements.yml --roles-path .local/ansible/roles
install -d -m 0700 .local
install -m 0600 ansible/management.example.yml .local/management.yml
```

Install the distribution's `wireguard-tools` on the operator's Linux device.
Generate its key locally, with no key in command arguments or chat:

```sh
(set -C; umask 077; wg genkey > .local/management-private.key)
wg pubkey < .local/management-private.key
```

Keep this private key in the professional Bitwarden boundary. Only its public
key enters `.local/management.yml`. Choose two unused RFC1918 IPv4 `/32` addresses
that do not overlap the operator's networks or other routes. The example addresses
are placeholders to review, not automatic defaults. Keep the addresses stable;
address changes require a replacement host. Peer-key rotation retains the routes.

Create `.local/management-inventory.yml` with mode `0600`:

```yaml
all:
  children:
    management:
      hosts:
        professional-host:
          ansible_host: approved-bootstrap-address
          ansible_user: approved-ssh-user
```

The inventory must contain exactly one management host, using the standard SSH
service on TCP 22 with no additional SSH listeners. Enforcement checks the actual
connection port and effective sshd configuration. Establish its SSH host
key independently and verify console access before proceeding. The playbooks
preserve SSH host-key verification. Reserve `wg-mgmt`, its configuration and the
`engineering_management` nftables table for this feature; unmanaged configuration
is refused. Do not use Ansible verbosity of three or more: the upstream role's
verbose mode can disclose keys, so the entrypoint rejects it.

## Establish the tunnel before enforcing it

```sh
make management
```

This installs the WireGuard service and prints only the server's public key.
The server creates and retains its own private key in root-only configuration.
The command does not close bootstrap SSH. With that public key and the operator's
private key, create a protected native client configuration such as
`/etc/wireguard/office.conf` using a local editor:

```ini
[Interface]
Address = <operator-private-address>/32
PrivateKey = <operator-private-key>

[Peer]
PublicKey = <verified-server-public-key>
Endpoint = <approved-public-host>:51820
AllowedIPs = <server-private-address>/32
PersistentKeepalive = 25
```

Set root ownership and mode `0600`, then run `sudo wg-quick up office`. Never put
a default route or neighbouring networks in `AllowedIPs`. Confirm a new SSH
connection to the server's private address with the existing approved SSH user.
Verify the same host key for this address through the independent console or the
previous trusted connection; do not disable checking to accept an unexpected key.

Update `ansible_host` in the protected inventory to the server's private address:

```sh
make management-enforce
```

The command checks the actual SSH source and destination addresses and the
configured WireGuard peer before applying an atomic nftables policy. Bootstrap
SSH or local-console invocation cannot enforce the cutover. The policy permits
new TCP 22 connections only from the operator through `wg-mgmt`; other tunnel
services and forwarding in either direction are denied. It preserves loopback,
established connections and unrelated firewall tables. It does not define a
general application-egress policy or publish an assistant endpoint.

Close surviving bootstrap sessions, then verify a fresh private SSH session and
a rejected public SSH connection. Remove the provider's bootstrap TCP 22 rule.
Reboot the approved host with the independent console available and repeat both
probes. A failed firewall service prevents SSH from starting. A stopped tunnel
never reopens public SSH. These real-host checks qualify provider routing and boot
behaviour that disposable container CI cannot establish.

## Rerun, revoke and recover

`make management` preserves the server key and converges the interface;
`make management-enforce` converges the policy over the private SSH path. Use the
same private address for the [Hermes inventory](hermes-deployment.md).

For immediate revocation, run through the independent provider console:

```sh
sudo systemctl disable --now wg-quick@wg-mgmt.service
```

The firewall remains in place and no assistant, model, vault session or working
tunnel is needed. Existing SSH through the tunnel becomes unusable. To restore
the reviewed configuration, use the console to inspect it and run:

```sh
sudo systemctl enable --now wg-quick@wg-mgmt.service
```

Then prove a new private SSH connection. If the operator key is compromised,
keep the interface disabled and generate a replacement on the trusted operator.
Through the independent console, replace only the peer public key in
`/etc/wireguard/wg-mgmt.conf` while the interface is down. Update the protected
controller settings and operator client before enabling the interface again.
Prove a fresh connection with the new identity and rerun both Make targets.
The console is the recovery path; do not flush the host firewall or enable public
SSH as an automatic fallback. Losing the server requires a new server key and
explicitly updating the operator's trusted peer.

See [validation](validation.md#private-administration) for the disposable checks
and [ADR 0008](../development/adr/0008-private-administration.md) for the scope and
maintenance trade-offs.
