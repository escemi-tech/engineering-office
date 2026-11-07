import source from "../../source.json" with { type: "json" };

export class GitHubApiFixture {
	requests = [];
	status = 200;
	headers = {};
	updatedAt = new Date(Date.now() - 60_000).toISOString();
	repository = {
		id: source.repositoryId,
		full_name: `${source.owner}/${source.repository}`,
		html_url: `https://github.com/${source.owner}/${source.repository}`,
		private: false,
	};
	items = [this.item(2, "pull-request"), this.item(1)];

	item(number, kind = "issue") {
		const url = `${this.repository.html_url}/${kind === "issue" ? "issues" : "pull"}/${number}`;
		return {
			id: 1000 + number,
			number,
			title: `Synthetic ${kind} ${number}`,
			html_url: url,
			state: "open",
			updated_at: this.updatedAt,
			...(kind === "pull-request" ? { pull_request: { html_url: url } } : {}),
			body: "synthetic-source-body-canary",
			user: { login: "synthetic-author-not-for-the-snapshot" },
		};
	}

	fetch = async (url, options) => {
		const target = new URL(url);
		this.requests.push({ url: target, ...options });
		const payload = target.pathname.endsWith("/issues")
			? this.items
			: this.repository;
		return Response.json(
			this.status === 200
				? payload
				: { message: "synthetic-error-body-canary" },
			{ status: this.status, headers: this.headers },
		);
	};
}
