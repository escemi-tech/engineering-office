# Use the briefing from an existing assistant

Request the same scoped professional briefing from ChatGPT, Codex or Copilot.
Hermes owns the collection, model run and retained conversation. The client can
disconnect and check the same run later. Client conversation histories remain
separate. Household access, GitHub writes and scheduled delivery are not exposed.

## Request, follow and remove a briefing

After connecting an approved client, ask: "Lance mon briefing GitHub professionnel
et indique-moi son avancement." Keep the returned `runId`. Ask for its result
later instead of starting another collection.

| Tool                     | Input   | Result                                                                                       |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------- |
| `start_github_briefing`  | None    | Starts one fresh Hermes run, consumes inference budget and returns its identifier.           |
| `get_github_briefing`    | `runId` | Returns progress or the completed response with source scope, observation time and coverage. |
| `cancel_github_briefing` | `runId` | Requests cooperative cancellation.                                                           |
| `forget_github_briefing` | `runId` | Deletes a settled conversation and prevents further result retrieval.                        |

Wait at least 30 seconds between status requests. Collection can take 15 minutes.
Status becomes `overdue` after 20 minutes; request cancellation rather than
launching another run. This is an observation, not an independent watchdog.
Closing the client does not cancel the run. A cancellation can remain pending
until the source's bounded request finishes; wait for a terminal status before
forgetting it. Source coverage can remain partial.

If admission fails or is uncertain, do not automatically retry: the native run
may already exist. Ask the operator to inspect Hermes. Missing evidence, an
unavailable gateway and expired runs never return a previous briefing. Results
are accessible for at most one hour after launch and can disappear sooner after
native buffer expiry or runtime restart. The API accepts no custom prompt,
source selection, URL or shell command.

Unlike the terminal command, these tools retain the conversation for subsequent
polling until explicit deletion or the existing hourly cleanup of sessions older
than one day. Read the [receipt and backup retention limits](hermes-briefing.md#retention-and-revocation).
Forgetting a conversation does not erase native receipts, encrypted backups or
copies in ChatGPT/Codex/Copilot. Those clients have their own data controls and
model-processing terms, which must be accepted before returning private evidence.

## Connect ChatGPT through a private tunnel

Start with a healthy [approved hosted briefing](hermes-briefing.md), active cleanup,
and a reviewed production deployment. This integration is for one trusted owner.
It relies on OpenAI's tunnel associations, RBAC and private plugin visibility;
it does not implement per-user authorization within a shared workspace.

1. In [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels),
   create a dedicated tunnel associated only with the approved Platform organization
   and your personal ChatGPT workspace. Verify who can use it. Creating/managing
   it requires the native Tunnels Read/Manage permissions.
2. Create a separate runtime credential with Tunnels Read/Use, without management
   or inference access. Keep it in a distinct Bitwarden entry. Never reuse the
   inference key, gateway key or GitHub token. Runtime keys do not belong in chat,
   client settings or Git. See [OpenAI's setup and permission requirements](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
3. In an owner-only `.local/hermes-briefing-access.yml` on the deployment controller,
   supply the approved tunnel ID and runtime key:

   ```yaml
   hermes_briefing_access_config:
     tunnel_id: tunnel_REPLACE_WITH_THE_COMPLETE_ID
     runtime_key: REPLACE_WITH_THE_SEPARATE_RUNTIME_KEY
   ```

4. After approval, deploy the reviewed runtime source with `make hermes-deploy`,
   following its backup maintenance procedure. Then run `make hermes-briefing-access`
   with the existing approved `.local/hermes-inventory.yml`. Wait for successful
   readiness before connecting ChatGPT. Resume the approved backup schedule as
   described in the deployment guide.
5. In ChatGPT web, open Plugins, `+`, "Add custom MCP server". Choose Connection:
   Tunnel and select that exact tunnel. Keep the plugin private to the approved
   owner. The stdio server has no additional OAuth endpoint: tunnel permissions
   authenticate the caller. Do not expose it through a public unauthenticated URL.
   If the account requires additional server OAuth or cannot restrict access to
   the approved owner, stop setup and review that requirement before activation.
6. Verify discovery of exactly the four tools above. Qualify one approved run,
   progress, result retrieval and deletion from the laptop and mobile phone browser.
   Confirm that source links and coverage remain visible. Discovery or container
   readiness alone does not qualify the ChatGPT journey.

The separate container runs the pinned official OpenAI `tunnel-client` with the
existing MCP SDK over stdio. Its native configuration completes the initialized
notification after a successful handshake, including when ChatGPT discovery omits
that notification. It initiates outbound HTTPS and publishes no port.
Only its gateway and tunnel credentials are mounted; GitHub access remains in
the source connector. Its health/admin listener is container-loopback only.
Docker retains no stdout logs. Run only one tunnel client per tunnel ID, including
during upgrades. The native 120-second request limit is respected by short
start/status calls; collection continues in Hermes.

Re-run `make hermes-briefing-access` after runtime source updates or gateway-key
rotation to rebuild the client and refresh its gateway credential. Do not copy
credentials into the image. Dependabot maintains the tagged/digest-pinned tunnel
image through the existing Docker configuration.

## Connect local Codex or Copilot through private SSH

The laptop must already have the approved private SSH route, trusted host key and
operator login. This path uses the operator's existing host permissions; it does
not create a separate restricted SSH identity. Configure the alias
`engineering-office` locally, then verify noninteractive `sudo -n` for the deployed
Make command. Do not disable SSH host verification or put a sudo password in the
MCP configuration. Avoid a pseudo-terminal: stdout must contain only MCP messages.

For [Codex's local MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli):

```sh
codex mcp add engineering-office -- ssh -T -o BatchMode=yes engineering-office \
  sudo -n make --silent -C /srv/engineering-office hermes-briefing-mcp
```

For Copilot, use "MCP: Add Server", choose a stdio command and the intended user
configuration. Supply `ssh` as command and the same arguments above, starting
with `-T`. Follow the [native configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
for the active Copilot harness; its portable `mcpServers` format and VS Code's
editor-managed `servers` format differ. Keep machine-specific settings out of Git.

These commands are for local clients. A cloud agent without the private SSH route
cannot use them. Qualify each client and its processing scope before enabling
private evidence; successful ChatGPT activation does not prove Codex or Copilot
access. Orca integration and Home Assistant domain access remain separate work.

## Revoke or recover access

To disable the ChatGPT tunnel, set `hermes_briefing_access_config: {}` in the protected
controller file and run `make hermes-briefing-access`. It removes the owned client
container, its credential directory and outbound network. It preserves Hermes,
its internal network and the independent backup schedule. Existing runs continue;
use the private operator path to stop them if needed. Remove the private plugin
and revoke its runtime credential in OpenAI separately. Do not delete an unrelated
tunnel or credential.

Disabling the underlying briefing source also removes this client access before
purging feature conversations. For local clients, remove their MCP configuration
and revoke operator SSH access if it is no longer authorized. The tunnel toggle
does not revoke an administrator's SSH permissions.

After host recovery, first restore and verify Hermes using the existing recovery
procedure. The tunnel credential is deliberately outside the Hermes state backup;
recover it separately from Bitwarden, redeploy access, and verify one active client
for the tunnel. Treat lost native run buffers as unavailable, not as authorization
to start another inference call automatically.
