# The port is the name. Exported so procs/10-gateway.yml and tools/serve.ts read the same one.
GW44_PORT ?= 8244
export GW44_PORT

TSCONFIGS := tsconfig.json tsconfig.sw.json tsconfig.dom.json tsconfig.e2e.json

# Browser engines the e2e suite runs under, in order. Only chromium is expected to launch on a
# machine without Firefox's and WebKit's system libraries; CI runs all three.
ENGINES ?= chromium

# Playwright ships Chromium as a headless shell under a different package name from its engine name.
BROWSER_PACKAGES = $(patsubst chromium,chromium-headless-shell,$(ENGINES))

.PHONY: build serve typecheck test e2e check get clean browsers

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

build: node_modules ## Build the deployable into dist/ (chains from chains.json, or GW44_CHAINS=<file>)
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
e2e: node_modules ## Browser tests against a fake chain, once per engine in ENGINES="$(ENGINES)"
	@for e in $(ENGINES); do \
		echo "==> e2e: $$e"; \
		GW44_ENGINE=$$e node --test --test-timeout=30000 test/e2e/*.e2e.ts || exit 1; \
	done

check: test e2e ## Everything a PR must pass

get: node_modules ## Resolve one gateway URL without a browser: make get URL=<url>
	@node tools/get.ts "$(URL)"

clean: ## Remove build output
	rm -rf dist
