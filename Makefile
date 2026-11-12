SHELL := /bin/bash
.DEFAULT_GOAL := help

HOST_UID := $(shell id -u)
HOST_GID := $(shell id -g)
HERMES_PROJECT := engineering-office-hermes
HERMES_COMPOSE := docker compose --env-file .local/hermes.env --project-name $(HERMES_PROJECT) -f services/hermes/compose.yml

.PHONY: help lint-fix ci lint github-briefing hermes-policy hermes-start hermes-stop hermes-logs hermes-host hermes-deploy hermes-health hermes-backup hermes-backup-check hermes-backup-prune hermes-backup-schedule hermes-backup-disable hermes-restore plan provision configure deploy verify backup
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

github-briefing: ## Show a scoped GitHub work briefing using the protected local source policy
	@npm run --silent --prefix packages/github-briefing briefing -- --source "$(CURDIR)/.local/github-briefing/source.json" --token-file "$(CURDIR)/.local/github-briefing/token" --format text

.PHONY: management management-enforce
management: ## Configure the approved host's WireGuard interface without closing bootstrap SSH
	ANSIBLE_ROLES_PATH="$(CURDIR)/.local/ansible/roles:$(CURDIR)/ansible/roles" ansible-playbook -i .local/management-inventory.yml ansible/management.yml --extra-vars @.local/management.yml

management-enforce: ## Require the verified WireGuard path for new SSH connections
	ANSIBLE_ROLES_PATH="$(CURDIR)/.local/ansible/roles:$(CURDIR)/ansible/roles" ansible-playbook -i .local/management-inventory.yml ansible/management-enforce.yml --extra-vars @.local/management.yml

.PHONY: infrastructure-state
infrastructure-state: ## Bootstrap approved private state storage and initialize the encrypted workspace
	ansible-playbook ansible/infrastructure-state.yml --extra-vars @.local/infrastructure-state.yml

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

hermes-backup-schedule: ## Configure or remove automatic backups on the explicitly approved host
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-backup-schedule.yml --extra-vars @.local/hermes-backup-schedule.yml

hermes-backup-disable: ## On the target host, stop automatic backups without loading credentials
	@set -euo pipefail; \
	unit='hermes-backup-$(HERMES_PROJECT)'; \
	if [[ -f "/etc/systemd/system/$$unit.timer" ]]; then \
		systemctl disable --now "$$unit.timer"; \
	fi; \
	if [[ -f "/etc/systemd/system/$$unit.service" ]]; then \
		systemctl stop "$$unit.service"; \
	fi

hermes-restore: ## Restore the selected snapshot into a new volume without starting Hermes
	ansible-playbook -i .local/hermes-inventory.yml ansible/hermes-restore.yml --extra-vars @.local/hermes-backup.yml

hermes-stop: hermes-backup-disable ## Disable backup automation and Hermes restart, then stop without credentials
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
