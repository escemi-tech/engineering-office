import { z } from "zod";

export class RepositoryAccess {
	static query =
		`query BriefingRepositoryAccess($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner isPrivate
    issues(first: 1) { totalCount }
    pullRequests(first: 1) { totalCount }
  }
}`;

	static allows(body, admissions) {
		const { variables } = z
			.strictObject({
				query: z.literal(RepositoryAccess.query),
				variables: z.strictObject({ owner: z.string(), name: z.string() }),
			})
			.parse(JSON.parse(body));
		return admissions.some(
			(repo) => repo.fullName === `${variables.owner}/${variables.name}`,
		);
	}

	async read(request, repository) {
		const [owner, name] = repository.fullName.split("/");
		const response = await request("POST /graphql", {
			query: RepositoryAccess.query,
			variables: { owner, name },
		});
		if (response.failure) return response;
		if (!response.data.data?.repository) return { failure: "http-404" };
		const count = z.object({ totalCount: z.int().nonnegative() });
		const record = z
			.object({
				databaseId: z.int().positive(),
				nameWithOwner: z.string(),
				isPrivate: z.boolean(),
				issues: count,
				pullRequests: count,
			})
			.parse(response.data.data.repository);
		return {
			data: {
				id: record.databaseId,
				full_name: record.nameWithOwner,
				private: record.isPrivate,
				html_url: `https://github.com/${record.nameWithOwner}`,
			},
		};
	}
}
