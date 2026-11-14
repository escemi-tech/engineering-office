import { z } from "zod";

export const identity = z.object({
	id: z.int().positive(),
	login: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u),
});
export const fullName = z.string().regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/u);
const admission = z.strictObject({
	id: z.int().positive(),
	fullName,
	visibility: z.enum(["public", "private"]),
});
const policySchema = z
	.strictObject({
		account: identity.strict(),
		scope: z
			.string()
			.regex(/^(professional-internal|personal|client:[a-z0-9-]+)$/u),
		repositories: z.array(admission).min(1).max(1000),
	})
	.refine(
		({ repositories }) =>
			new Set(repositories.map(({ id }) => id)).size === repositories.length &&
			new Set(repositories.map(({ fullName: name }) => name.toLowerCase()))
				.size === repositories.length,
	);

export class BriefingUnavailableError extends Error {}

export class SourcePolicy {
	parse(policy) {
		return policySchema.parse(policy);
	}

	exclusions(scope, exclude) {
		policySchema.shape.scope.parse(scope);
		return new Set(
			z
				.array(fullName)
				.max(1000)
				.parse(exclude)
				.map((name) => name.toLowerCase()),
		);
	}

	matches(approved, repository) {
		return (
			repository.id === approved.id &&
			repository.fullName === approved.fullName &&
			repository.visibility === approved.visibility
		);
	}
}
