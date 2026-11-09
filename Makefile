SHELL := /bin/bash
.DEFAULT_GOAL := help

HOST_UID := $(shell id -u)
HOST_GID := $(shell id -g)
HERMES_PROJECT := engineering-office-hermes
HERMES_COMPOSE := docker compose --env-file .local/hermes.env --project-name $(HERMES_PROJECT) -f services/hermes/compose.yml

.PHONY: help lint-fix ci lint github-briefing hermes-policy hermes-start hermes-stop hermes-logs hermes-host hermes-deploy hermes-health hermes-backup hermes-backup-check hermes-backup-prune hermes-restore plan provision configure deploy verify backup
help: ## Display help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

lint: ## Execute linting
	$(call run_linter,)

lint-fix: ## Execute linting and fix
	$(call run_linter, \
		-e FIX_BIOME_FORMAT=true \
		-e FIX_BIOME_LINT=true \
		-e FIX_SPELL_CODESPELL=true \
		-e FIX_MARKDOWN=true \
		-e FIX_MARKDOWN_PRETTIER=true \
		-e FIX_YAML_PRETTIER=true \
		-e FIX_NATURAL_LANGUAGE=true \
		-e FIX_SHELL_SHFMT=true \
	)

ci: ## Execute local CI tasks
	$(MAKE) lint-fix

github-briefing: ## Collect relevant GitHub work using the protected local source policy
	@npm run --silent --prefix packages/github-briefing briefing -- --source "$(CURDIR)/.local/github-briefing/source.json" --token-file "$(CURDIR)/.local/github-briefing/token"

hermes-policy: ## Build the canonical writing policy with the qualified APM compiler
	bash services/hermes/build-policy.sh

hermes-start: hermes-policy ## Rebuild policy and recreate Hermes while preserving sessions
	$(HERMES_COMPOSE) up -d --force-recreate --wait --wait-timeout 180

hermes-host: ## Prepare Docker prerequisites on the explicitly configured approved Ubuntu host
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-host.yml

hermes-deploy: hermes-policy ## Deploy Hermes to the explicitly configured approved host
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes.yml --extra-vars @.local/hermes-deployment.yml

hermes-health: ## Check the deployed gateway without credentials or service changes
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-health.yml

hermes-backup: ## Encrypt and verify stopped Hermes state in the configured repository
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-backup.yml --extra-vars @.local/hermes-backup.yml

hermes-backup-check: ## Verify backup integrity and a matching recovery point within 24 hours
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-backup-check.yml --extra-vars @.local/hermes-backup.yml

hermes-backup-prune: ## Create a verified backup, then enforce recovery-point retention
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-backup-prune.yml --extra-vars @.local/hermes-backup.yml

hermes-restore: ## Restore the selected snapshot into a new volume without starting Hermes
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-restore.yml --extra-vars @.local/hermes-backup.yml

hermes-stop: ## Disable Hermes restart and stop it without loading configuration
	@set -euo pipefail; \
	containers="$$(docker container ls --all --quiet \
		--filter 'label=com.docker.compose.project=$(HERMES_PROJECT)' \
		--filter 'label=com.docker.compose.service=hermes')"; \
	if [[ -z "$$containers" ]]; then \
		printf '%s\n' 'No Hermes containers found for $(HERMES_PROJECT).'; \
		exit 0; \
	fi; \
	mapfile -t container_ids <<< "$$containers"; \
	docker container update --restart=no "$${container_ids[@]}" >/dev/null; \
	docker container stop --timeout 60 "$${container_ids[@]}" >/dev/null; \
	for container_id in "$${container_ids[@]}"; do \
		if [[ "$$(docker container inspect --format '{{.State.Running}} {{.State.Restarting}} {{.HostConfig.RestartPolicy.Name}}' "$$container_id")" != 'false false no' ]]; then \
			printf 'Hermes shutdown could not be verified: %s\n' "$$container_id" >&2; \
			exit 1; \
		fi; \
	done; \
	printf '%s\n' 'Hermes stopped; automatic restart disabled. Containers, logs and volumes retained.'

hermes-logs: ## Show recent Hermes logs
	$(HERMES_COMPOSE) logs --tail 100

plan provision configure deploy verify backup:
	@printf '%s\n' '$@ is unavailable: infrastructure implementation and deployment preflight are required.' >&2
	@exit 2

#############################
# Helpers
#############################
# Keep the Dependabot exclusion aligned with shared-ci.yml until zizmor supports APM.
define run_linter
	@set -eu; \
	DEFAULT_WORKSPACE="$(CURDIR)"; \
	LINTER_IMAGE="engineering-office-linter:latest"; \
	VOLUME="$$DEFAULT_WORKSPACE:$$DEFAULT_WORKSPACE"; \
	docker build --platform=linux/amd64 \
		--build-arg UID=$(HOST_UID) --build-arg GID=$(HOST_GID) \
		--tag "$$LINTER_IMAGE" .; \
	docker run --platform=linux/amd64 \
		-v "$$VOLUME" --rm \
		-e RUN_LOCAL=true \
		-e DEFAULT_WORKSPACE="$$DEFAULT_WORKSPACE" \
		-e USE_FIND_ALGORITHM=true \
		-e STRIP_DEFAULT_WORKSPACE_FOR_REGEX=true \
		-e FILTER_REGEX_INCLUDE="$(filter-out $@,$(MAKECMDGOALS))" \
		-e FILTER_REGEX_EXCLUDE='^\.github/dependabot\.yml$$' \
		$(1) \
		"$$LINTER_IMAGE"
endef

#############################
# Positional filters for lint commands only
#############################
ifneq ($(filter lint lint-fix,$(firstword $(MAKECMDGOALS))),)
%:
	@:
endif
