SHELL := /bin/bash
.DEFAULT_GOAL := help
export ANSIBLE_CONFIG := $(CURDIR)/tooling/ansible/ansible.cfg

HOST_UID := $(shell id -u)
HOST_GID := $(shell id -g)
HERMES_PROJECT := engineering-office-hermes
HERMES_COMPOSE := docker compose --env-file .local/hermes.env --project-name $(HERMES_PROJECT) -f platform/assistant/runtime/compose.yml

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
	@npm run --silent --prefix features/briefing/github briefing -- --source "$(CURDIR)/.local/github-briefing/source.json" --token-file "$(CURDIR)/.local/github-briefing/token" --format text

.PHONY: hermes-briefing hermes-briefing-mcp hermes-briefing-access
hermes-briefing: ## On the approved host, request a fresh briefing with native asynchronous progress
	docker run --rm --network host --read-only --cap-drop ALL --security-opt no-new-privileges \
		--user 0:0 --memory 128m --pids-limit 32 \
		--mount type=bind,src=/srv/engineering-office/.local/hermes-gateway-key,dst=/run/hermes/key,readonly \
		engineering-office-briefing:local node src/adapters/hermes-cli.js collect

hermes-briefing-mcp: ## On the approved host, expose bounded briefing tools over authenticated caller-owned stdio
	@docker run --rm -i --network host --read-only --cap-drop ALL --security-opt no-new-privileges \
		--user 0:0 --memory 128m --pids-limit 32 \
		--mount type=bind,src=/srv/engineering-office/.local/hermes-gateway-key,dst=/run/hermes/key,readonly \
		engineering-office-briefing:local node src/adapters/client-stdio.js

hermes-briefing-access: ## Enable or revoke the explicitly approved private client tunnel
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/deployment/hermes-briefing-access.yml --extra-vars @.local/hermes-briefing-access.yml

.PHONY: management management-enforce
management: ## Configure the approved host's WireGuard interface without closing bootstrap SSH
	ansible-playbook -i .local/management-inventory.yml platform/hosting/host/management.yml --extra-vars @.local/management.yml

management-enforce: ## Require the verified WireGuard path for new SSH connections
	ansible-playbook -i .local/management-inventory.yml platform/hosting/host/management-enforce.yml --extra-vars @.local/management.yml

.PHONY: infrastructure-state
infrastructure-state: ## Bootstrap approved private state storage and initialize the encrypted workspace
	ansible-playbook platform/hosting/state/infrastructure-state.yml --extra-vars @.local/infrastructure-state.yml

hermes-policy: ## Build the canonical writing policy with the qualified APM compiler
	bash platform/assistant/runtime/build-policy.sh

hermes-start: hermes-policy ## Rebuild policy and recreate Hermes while preserving sessions
	$(HERMES_COMPOSE) up -d --force-recreate --wait --wait-timeout 180

hermes-host: ## Prepare Docker prerequisites on the explicitly configured approved Ubuntu host
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/deployment/hermes-host.yml

hermes-deploy: hermes-policy ## Deploy Hermes to the explicitly configured approved host
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/deployment/hermes.yml --extra-vars @.local/hermes-deployment.yml

hermes-health: ## Check the deployed gateway without credentials or service changes
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/deployment/hermes-health.yml

hermes-backup: ## Encrypt and verify stopped Hermes state in the configured repository
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/backup/hermes-backup.yml --extra-vars @.local/hermes-backup.yml

hermes-backup-check: ## Verify backup integrity and a matching recovery point within 24 hours
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/backup/hermes-backup-check.yml --extra-vars @.local/hermes-backup.yml

hermes-backup-prune: ## Create a verified backup, then enforce recovery-point retention
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/backup/hermes-backup-prune.yml --extra-vars @.local/hermes-backup.yml

hermes-backup-schedule: ## Configure or remove automatic backups on the explicitly approved host
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/backup/hermes-backup-schedule.yml --extra-vars @.local/hermes-backup-schedule.yml

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
	ansible-playbook -i .local/hermes-inventory.yml platform/assistant/backup/hermes-restore.yml --extra-vars @.local/hermes-backup.yml

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

.PHONY: plan destroy-plan provision qualification-expiry qualification-cleanup recovery-expiry recovery-provision recovery-cleanup
plan: ## Prepare an encrypted host plan and its review fingerprint without applying it
	ansible-playbook platform/hosting/host/professional-host-plan.yml --extra-vars @.local/professional-host.yml

destroy-plan: ## Prepare an encrypted destruction plan for review
	ansible-playbook platform/hosting/host/professional-host-plan.yml --extra-vars @.local/professional-host.yml --extra-vars '{"professional_host_destroy_plan": true}'

qualification-expiry: ## Reserve a provider campaign run and arm its independent expiry
recovery-expiry: ## Arm independent expiry for a separately approved recovery exercise
qualification-expiry recovery-expiry:
	ansible-playbook platform/hosting/host/professional-host-expiry.yml --extra-vars @.local/professional-host.yml

provision: ## Apply the exact approved primary or qualification plan
recovery-provision: ## Apply the exact approved recovery plan with its own bounded writer
provision recovery-provision:
	systemd-run --user --unit=$(if $(filter recovery-provision,$@),engineering-office-recovery-provisioning,engineering-office-provisioning) --collect --wait --pipe \
		--property=Conflicts=engineering-office-$(if $(filter recovery-provision,$@),recovery,qualification)-expiry.service \
		--property=Before=engineering-office-$(if $(filter recovery-provision,$@),recovery,qualification)-expiry.service \
		--property=RuntimeMaxSec=30min --property=KillSignal=SIGINT --property=TimeoutStopSec=90s \
		--property=UMask=0077 --working-directory="$(CURDIR)" \
		--setenv="PATH=$(PATH)" --setenv="ANSIBLE_COLLECTIONS_PATH=$(CURDIR)/.local/ansible/collections" \
		--setenv="ANSIBLE_LOCAL_TEMP=$(CURDIR)/.local/ansible-tmp" \
		"$(CURDIR)/.local/ansible/bin/ansible-playbook" platform/hosting/host/professional-host-apply.yml \
		--extra-vars @.local/professional-host.yml --extra-vars @.local/professional-host-approval.yml

qualification-cleanup: ## Independently reconcile and remove the explicitly selected disposable run
	systemctl --user start engineering-office-qualification-expiry.service

recovery-cleanup: ## Independently remove only the selected recovery host
	systemctl --user start engineering-office-recovery-expiry.service

configure deploy verify backup:
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
		-e ANSIBLE_DIRECTORY=platform \
		-e ANSIBLE_HOME=/github/home/.ansible \
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
