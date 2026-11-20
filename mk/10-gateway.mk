# The port is the name. Exported so procs/10-gateway.yml and tools/serve.ts read the same one.
GW44_PORT ?= 8244
export GW44_PORT

TSCONFIGS := tsconfig.json tsconfig.sw.json tsconfig.dom.json tsconfig.e2e.json

.PHONY: build serve typecheck test e2e check get clean

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

e2e: node_modules ## Browser tests against a fake chain (GW44_CHROMIUM=<path> picks the browser)
	node --test --test-timeout=30000 test/e2e/*.e2e.ts

check: test e2e ## Everything a PR must pass

get: node_modules ## Resolve one gateway URL without a browser: make get URL=<url>
	@node tools/get.ts "$(URL)"

clean: ## Remove build output
	rm -rf dist
