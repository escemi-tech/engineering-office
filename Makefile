SHELL := /bin/bash
.DEFAULT_GOAL := help
CI_IAC_DIRECTORY := $(CURDIR)/.cache/ci-github-iac
CI_IAC_REVISION := $(shell sed -nE 's|.*uses: hoverkraft-tech/ci-github-iac/\.github/workflows/vm-e2e.yml@([0-9a-f]{40}).*|\1|p' .github/workflows/ci.yml)
export E2E_VM_NAME := iac-engineering-office
export E2E_STATE_DIR := $(CURDIR)/.cache/e2e
export REPORTS_DIR := $(CURDIR)/.reports

.PHONY: help setup lint e2e e2e-up e2e-test e2e-collect e2e-down plan provision configure deploy verify backup
help:
	@printf '%s\n' 'make setup | lint | e2e' 'make e2e-up | e2e-test | e2e-collect | e2e-down'

setup:
	@set -eu; \
	[[ "$(CI_IAC_REVISION)" =~ ^[0-9a-f]{40}$$ ]] || { echo 'Missing immutable CI dependency'; exit 1; }; \
	if [[ "$$(git -C "$(CI_IAC_DIRECTORY)" rev-parse HEAD 2>/dev/null || true)" != "$(CI_IAC_REVISION)" ]]; then \
		mkdir -p "$(CI_IAC_DIRECTORY)"; \
		git -C "$(CI_IAC_DIRECTORY)" init --quiet; \
		git -C "$(CI_IAC_DIRECTORY)" fetch --depth=1 https://github.com/hoverkraft-tech/ci-github-iac.git "$(CI_IAC_REVISION)"; \
		git -C "$(CI_IAC_DIRECTORY)" checkout --quiet --detach FETCH_HEAD; \
	fi

lint:
	docker build --tag engineering-office-linter .
	docker run --rm -e RUN_LOCAL=true -e DEFAULT_WORKSPACE=/workspace \
		-e 'FILTER_REGEX_EXCLUDE=/(\.cache|\.reports)/' \
		-v "$(CURDIR):/workspace" engineering-office-linter

e2e:
	@status=0; trap '$(MAKE) e2e-down || status=$$?; exit $$status' EXIT; \
	$(MAKE) e2e-up && $(MAKE) e2e-test || status=$$?; \
	$(MAKE) e2e-collect || status=$$?

e2e-up e2e-test e2e-collect e2e-down: setup
	python3 "$(CI_IAC_DIRECTORY)/tests/fixture/vm.py" $(@:e2e-%=%)

plan provision configure deploy verify backup:
	@printf '%s\n' '$@ is unavailable: infrastructure implementation and deployment preflight are required.' >&2
	@exit 2
