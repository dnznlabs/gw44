# The port is the name. Exported so procs/10-gateway.yml and tools/serve.ts read the same one.
GW44_PORT ?= 8244
export GW44_PORT

# One contract at every URL, compiled in: `make build PIN=<chain>:<address>`. Empty is the ordinary
# build, which reads the contract from the URL and carries every chain in the chains file.
PIN ?=
# A project's contracts, one per chain: `make build CONFIG=gw44.json`. Mutually exclusive with PIN.
CONFIG ?=
export GW44_CONFIG = $(CONFIG)
export GW44_PIN = $(PIN)

TSCONFIGS := tsconfig.json tsconfig.sw.json tsconfig.dom.json tsconfig.e2e.json

# Browser engines the e2e suite runs under, in order. Only chromium is expected to launch on a
# machine without Firefox's and WebKit's system libraries; CI runs all three.
ENGINES ?= chromium

# Playwright ships Chromium as a headless shell under a different package name from its engine name.
BROWSER_PACKAGES = $(patsubst chromium,chromium-headless-shell,$(ENGINES))

.PHONY: build serve typecheck test e2e check get clean browsers verify check-site

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

build: node_modules ## Build the deployable into dist/ (chains from chains.json or GW44_CHAINS=<file>; PIN=<chain>:<address> or CONFIG=<file> for one project)
	node tools/build.ts

serve: build ## Serve dist/ on localhost:$(GW44_PORT) under process-compose
	process-compose $(addprefix -f ,$(sort $(wildcard procs/*.yml))) up

typecheck: node_modules ## Strict typecheck of every program
	@for c in $(TSCONFIGS); do npx tsc -p $$c || exit 1; done

test: typecheck ## Typecheck and unit tests
	node --test test/*.test.ts

browsers: node_modules ## Install Playwright's browsers for $(ENGINES)
	npx playwright-core install $(BROWSER_PACKAGES)

# One run per engine, in order, stopping at the first failure. A named engine that cannot launch is
# a failure and never a skip, so a missing library is reported rather than passed over.
#
# PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS is set here, not in CI, because it is a property of
# running Playwright through devbox and not of any one runner: the pre-launch check shells out to
# `ldd`, which inside devbox is nix's glibc `ldd` and cannot see system libraries, so Firefox and
# WebKit are reported as missing every library they need and never start. Measured on the CI runner:
# outside devbox `ldd` on the Firefox binary reports 0 "not found"; inside devbox `ldd` resolves to
# /nix/store/...-glibc-bin/bin/ldd. Skipping the check leaves the launch itself free to fail, which
# is the honest gate. Closes #10.
e2e: node_modules ## Browser tests against a fake chain, once per engine in ENGINES="$(ENGINES)"
	@for e in $(ENGINES); do \
		echo "==> e2e: $$e"; \
		PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 GW44_ENGINE=$$e \
			node --test --test-timeout=30000 test/e2e/*.e2e.ts || exit 1; \
	done

check: test e2e ## Everything a PR must pass

# Deliberately not a prerequisite of `check` and not in the workflow: it reads live contracts over
# public endpoints, and a gate that depends on those is a decision rather than a detail.
verify: node_modules ## Prove the gateway serves what the chain returns, with cast as the referee
	tools/verify.sh

# Deliberately not a prerequisite of `check` and not in the workflow, for `verify`'s reason and one
# more: it needs a site that somebody deployed, which no gate can assume exists.
# CONFIG names the configuration the site was built from, because the default chain and the chain
# list are what most of the cases are about. EMBED is `<chain>/<file>=sha384-…` as `tools/embeds.sh`
# printed it at deploy time; without it the two embed cases report themselves skipped.
SITE_CONFIG ?= test/fixtures/gw44.two-chains.json
EMBED ?=

check-site: node_modules ## Check a deployed gateway in a browser: make check-site URL=<base url> [SITE_CONFIG=<file>] [EMBED=<chain>/<file>=sha384-…] [ENGINES="..."]
	@test -n "$(URL)" || { echo 'make check-site needs URL=<base url>'; exit 2; }
	@for e in $(ENGINES); do \
		PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 GW44_ENGINE=$$e \
			node tools/check-site.ts "$(URL)" "$(SITE_CONFIG)" $(EMBED) || exit 1; \
	done

get: node_modules ## Resolve one gateway URL without a browser: make get URL=<url>
	@node tools/get.ts "$(URL)"

clean: ## Remove build output
	rm -rf dist
