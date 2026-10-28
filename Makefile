SHELL := /bin/bash
.DEFAULT_GOAL := help

HOST_UID := $(shell id -u)
HOST_GID := $(shell id -g)
CI_IAC_DIRECTORY := $(CURDIR)/.cache/ci-github-iac
CI_IAC_REVISION := $(shell sed -nE 's|.*uses: hoverkraft-tech/ci-github-iac/actions/vm/create@([0-9a-f]{40}).*|\1|p' .github/workflows/__shared-ci.yml)

.PHONY: help lint-fix ci setup lint e2e plan provision configure deploy verify backup
help: ## Display help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

setup: ## Fetch the pinned VM actions for local runs
	@set -eu; \
	[[ "$(CI_IAC_REVISION)" =~ ^[0-9a-f]{40}$$ ]] || { echo 'Missing immutable CI dependency'; exit 1; }; \
	if [[ "$$(git -C "$(CI_IAC_DIRECTORY)" rev-parse HEAD 2>/dev/null || true)" != "$(CI_IAC_REVISION)" ]]; then \
		mkdir -p "$(CI_IAC_DIRECTORY)"; \
		git -C "$(CI_IAC_DIRECTORY)" init --quiet; \
		git -C "$(CI_IAC_DIRECTORY)" fetch --depth=1 https://github.com/hoverkraft-tech/ci-github-iac.git "$(CI_IAC_REVISION)"; \
		git -C "$(CI_IAC_DIRECTORY)" checkout --quiet --detach FETCH_HEAD; \
	fi

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

e2e: setup ## Run guest assertions with automatic VM setup and cleanup
	node "$(CI_IAC_DIRECTORY)/actions/vm/cli.cjs" run --test-script tests/e2e.sh

plan provision configure deploy verify backup:
	@printf '%s\n' '$@ is unavailable: infrastructure implementation and deployment preflight are required.' >&2
	@exit 2

#############################
# Helpers
#############################
define run_linter
	@set -eu; \
	DEFAULT_WORKSPACE="$(CURDIR)"; \
	LINTER_IMAGE="engineering-office-linter:latest"; \
	VOLUME="$$DEFAULT_WORKSPACE:$$DEFAULT_WORKSPACE"; \
	DEFAULT_BRANCH="$$(git -C "$$DEFAULT_WORKSPACE" rev-parse --abbrev-ref HEAD)"; \
	docker build --platform=linux/amd64 \
		--build-arg UID=$(HOST_UID) --build-arg GID=$(HOST_GID) \
		--tag "$$LINTER_IMAGE" .; \
	docker run --platform=linux/amd64 \
		-v "$$VOLUME" --rm \
		-e RUN_LOCAL=true \
		-e DEFAULT_WORKSPACE="$$DEFAULT_WORKSPACE" \
		-e DEFAULT_BRANCH="$$DEFAULT_BRANCH" \
		-e USE_FIND_ALGORITHM=false \
		-e FILTER_REGEX_INCLUDE="$(filter-out $@,$(MAKECMDGOALS))" \
		-e 'FILTER_REGEX_EXCLUDE=/(\.cache|\.reports)/' \
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
