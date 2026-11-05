# Writing policy

The [canonical policy](../../packages/writing-policy/.apm/instructions/writing.instructions.md)
defines shared writing rules, English and French profiles, and guidance for
messages, reviews, briefings and personal communication. It protects raw evidence,
code, quotations, citations and factual uncertainty.

Use it when reviewing an assistant draft. The policy is packaged as APM source;
it is not installed into the Hermes service, Codex or Copilot by this repository.
An instruction file does not enforce publishing permissions or normalize text.

## Review a draft

1. Select the language and channel using the recipient's known context.
2. Apply the shared rules to newly written prose. Keep protected content unchanged.
3. Apply only the relevant domain's private style preferences, if available.
4. Check facts, sources, recipient and final wording before approving publication.

Private overlays belong in private domain configuration, outside this public
repository. They may refine style but cannot authorize a send or weaken source
preservation. Missing overlays use the public policy. No overlay loader is
implemented here; do not assume that placing a file in a directory activates it.

## Package ownership and coverage

The [manifest](../../packages/writing-policy/apm.yml) versions the policy package.
Review the policy and its version together. Consumers must select a reviewed Git
revision; the package version alone does not pin content. There are no external
package dependencies and no generated client files committed beside this source.

| Surface                      | Current coverage                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Manual draft review          | Policy available for human review                                                                     |
| Hermes gateway               | No writing-policy mount or verified instruction loading                                               |
| Codex                        | No installation or verified client loading                                                            |
| Copilot                      | No installation or verified client loading                                                            |
| Local draft module           | [Typography adapter](writing-normalizer.md) for text, Markdown and HTML; explicit provenance required |
| Managed outbound publication | No publisher or automatic normalization integration                                                   |

APM adoption requires the [qualification gate](../development/adr/0003-agent-content-qualification.md).
Preserve authored client instructions during that qualification; do not use
`apm install --force` to resolve ownership conflicts. Keep generated build content
separate from a user's working configuration and from private overlays.
