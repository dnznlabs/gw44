# The security review of record. Two independent adversarial legs over audits/SCOPE, then a rollup.
# The method is audits/README.md; scripts/audit.sh runs it and decides nothing.
#
# Deliberately not a prerequisite of `check` and absent from the workflow: it needs two
# authenticated CLIs and tens of minutes of somebody's rate limit, which is a decision and not a
# detail — the same reason `verify` is kept out.

# `opus` is an alias for the latest Opus rather than a pinned version; the provenance block records
# what it resolved to. Overridable so a model choice is never relitigated in prose.
CODEX_MODEL ?= gpt-5.6-sol
CLAUDE_MODEL ?= opus
export CODEX_MODEL CLAUDE_MODEL

# Defaults to today. The escape hatch for the append-only refusal, not a routine setting.
AUDIT_DATE ?=
export AUDIT_DATE

.PHONY: audit

audit: ## Run the security review (two CLIs, tens of minutes of rate limit; see audits/README.md)
	scripts/audit.sh
