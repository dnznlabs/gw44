#!/usr/bin/env bash
# What `make audit` runs: two independent adversarial reviews of the scoped files, then a rollup.
#
#   devbox run -- make audit
#   devbox run -- make audit CODEX_MODEL=gpt-5.6-sol CLAUDE_MODEL=opus AUDIT_DATE=2026-11-21
#
# The method is audits/README.md and the prompts are audits/prompts/. This script runs the legs,
# puts the bytes in the right directory, and records what happened; it decides nothing.
#
# Costs rate limit and wall clock, tens of minutes. Deliberately not reachable from `make check` or
# from the workflow: a gate that needs two authenticated CLIs is a decision, not a detail.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

AUDIT_DATE=${AUDIT_DATE:-$(date +%F)}
CODEX_MODEL=${CODEX_MODEL:-gpt-5.6-sol}
CLAUDE_MODEL=${CLAUDE_MODEL:-opus}
LEG_TIMEOUT=${LEG_TIMEOUT:-3600}
KNOWN_ANSWER_FILE=${KNOWN_ANSWER_FILE:-$REPO_ROOT/audits/KNOWN_ANSWER.md}

OUT_DIR=$REPO_ROOT/audits/$AUDIT_DATE
CODEX_LEG=$OUT_DIR/$CODEX_MODEL
CLAUDE_LEG=$OUT_DIR/$CLAUDE_MODEL

say() { printf '\n== %s\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die() { printf '\naudit: %s\n' "$*" >&2; exit 1; }

# ---- preflight ----------------------------------------------------------------------------------
# Everything that can be known before spending an hour is checked before spending it.

say "preflight"

command -v codex >/dev/null 2>&1 || die "codex is not on PATH"
command -v claude >/dev/null 2>&1 || die "claude is not on PATH"
codex login status >/dev/null 2>&1 || die "codex login status failed — the leg would exit without a report"
CODEX_CLI=$(codex --version 2>&1 | head -1)
CLAUDE_CLI=$(claude --version 2>&1 | head -1)
info "codex: $CODEX_CLI"
info "claude: $CLAUDE_CLI"

# An audit of an uncommitted tree cannot be re-run by anyone else.
[ -z "$(git status --porcelain)" ] || die "the tree is dirty — commit or stash before auditing"
REVIEW_COMMIT=$(git rev-parse HEAD)
info "review commit: $REVIEW_COMMIT"

# Append-only: a second run on one date would merge into the first.
[ ! -e "$OUT_DIR" ] || die "audits/$AUDIT_DATE/ already exists — move it aside or pass AUDIT_DATE"

[ -s "$REPO_ROOT/audits/SCOPE" ] || die "audits/SCOPE is missing or empty"
mapfile -t SCOPE < <(sed -e 's/#.*//' -e '/^[[:space:]]*$/d' -e 's/[[:space:]]*$//' "$REPO_ROOT/audits/SCOPE")
[ "${#SCOPE[@]}" -gt 0 ] || die "audits/SCOPE names no files"
for f in "${SCOPE[@]}"; do
  [ -f "$REPO_ROOT/$f" ] || die "audits/SCOPE names a file that does not exist: $f"
done
info "scope: ${#SCOPE[@]} files"

for p in audits/prompts/leg.md audits/prompts/rollup.md; do
  [ -s "$REPO_ROOT/$p" ] || die "$p is missing or empty"
done
grep -q '^<!-- SCOPE -->$' audits/prompts/leg.md || die "audits/prompts/leg.md has no <!-- SCOPE --> marker"
grep -q '^<!-- OUTDIR -->$' audits/prompts/leg.md || die "audits/prompts/leg.md has no <!-- OUTDIR --> marker"
[ -s "$KNOWN_ANSWER_FILE" ] || die "known answer file is missing or empty: $KNOWN_ANSWER_FILE"

# The scratch holds the staged leg reports, both transcripts and the blind tree, so it must not be
# inside the repository: a leg that walked up from its tree would find the other's output.
SCRATCH=$(mktemp -d)
case "$SCRATCH" in "$REPO_ROOT"*) die "TMPDIR is inside the repository: $SCRATCH" ;; esac
trap 'rm -rf "$SCRATCH"' EXIT
info "scratch: $SCRATCH"

# ---- the blind tree -----------------------------------------------------------------------------
# A prompt cannot make a leg blind to the filesystem it is pointed at (audits/README.md § Running
# blind). So the legs get a tree that holds the scoped files and nothing else: no SECURITY.md, no
# handoff, no issue, no previous audit, no other leg.

say "blind tree"
BLIND=$SCRATCH/blind
for f in "${SCOPE[@]}"; do
  mkdir -p "$BLIND/$(dirname "$f")"
  cp "$REPO_ROOT/$f" "$BLIND/$f"
done
# `codex exec` refuses a directory that is not a git repository.
git -C "$BLIND" init -q
git -C "$BLIND" -c user.email=audit@localhost -c user.name=audit add -A
git -C "$BLIND" -c user.email=audit@localhost -c user.name=audit commit -qm "scoped files for review"
BLIND_COMMIT=$(git -C "$BLIND" rev-parse HEAD)
info "blind commit: $BLIND_COMMIT ($(ls -1 "$BLIND" | wc -l) top-level entries)"

# The hashes, not the commit, are what tie this run to the source it read.
BLIND_MD=$SCRATCH/BLIND.md
{
  printf '# Blind tree — %s\n\n' "$AUDIT_DATE"
  printf 'The legs ran outside the repository, in a tree holding only the scoped files. The commit\n'
  printf 'below is that tree'"'"'s own, not this project'"'"'s, so the hashes are what tie the run to the\n'
  printf 'source that was read. See `../README.md` § Running blind.\n\n'
  printf '```\nreview commit     %s\nblind commit      %s\n```\n\n' "$REVIEW_COMMIT" "$BLIND_COMMIT"
  printf '## In the repository, at the review commit\n\n```\n'
  ( cd "$REPO_ROOT" && sha256sum "${SCOPE[@]}" )
  printf '```\n\n## In the blind tree\n\n```\n'
  ( cd "$BLIND" && sha256sum "${SCOPE[@]}" )
  printf '```\n'
} > "$BLIND_MD"
# Equal by construction; asserted because a copy that silently changed a file would invalidate the run.
diff <( cd "$REPO_ROOT" && sha256sum "${SCOPE[@]}" ) <( cd "$BLIND" && sha256sum "${SCOPE[@]}" ) >/dev/null \
  || die "the blind tree's files do not hash equal to the repository's"
info "hashes equal in both trees"

# ---- the leg prompt -----------------------------------------------------------------------------
# Two substitutions and nothing else, so the prompt on disk plus these two values is what ran.

mkdir -p "$SCRATCH/legs/$CODEX_MODEL" "$SCRATCH/legs/$CLAUDE_MODEL"

leg_prompt() { # <outdir>
  SCOPE_TEXT="$(printf '%s\n' "${SCOPE[@]}")" OUTDIR_TEXT="$1" awk '
    $0 == "<!-- SCOPE -->"  { print ENVIRON["SCOPE_TEXT"];  next }
    $0 == "<!-- OUTDIR -->" { print ENVIRON["OUTDIR_TEXT"]; next }
                            { print }' "$REPO_ROOT/audits/prompts/leg.md"
}

# harvest <leg-dir> <leg-name>
# A failed leg is a failed audit: this exits non-zero rather than leaving an empty directory for the
# rollup to read as "no findings".
harvest() {
  local dest="$1" name="$2"
  [ -s "$dest/full-report.md" ] || die "$name: $dest/full-report.md is missing or empty — a failed leg is a failed audit"
  info "$name: $(wc -l < "$dest/full-report.md") lines of report"
}

# -- leg 1: codex --
say "leg 1 — codex $CODEX_MODEL, effort high, 1 pass"
CODEX_LOG=$SCRATCH/codex.log
CODEX_PROMPT=$(leg_prompt "$SCRATCH/legs/$CODEX_MODEL")
CODEX_START=$(date +%s)
set +e
timeout "$LEG_TIMEOUT" codex exec \
  -m "$CODEX_MODEL" \
  -c model_reasoning_effort="high" \
  -s workspace-write \
  -C "$BLIND" \
  "$CODEX_PROMPT" < /dev/null 2>&1 | tee "$CODEX_LOG"
CODEX_RC=${PIPESTATUS[0]}
set -e
CODEX_SECONDS=$(( $(date +%s) - CODEX_START ))
[ "$CODEX_RC" -eq 0 ] || die "codex leg exited $CODEX_RC after ${CODEX_SECONDS}s — a failed leg is a failed audit"
harvest "$SCRATCH/legs/$CODEX_MODEL" "leg 1"

# Observed, from the session header the run actually printed — not from CODEX_MODEL, which is what
# was asked for rather than what answered.
CODEX_OBSERVED=$(awk -F': *' '/^model:/ {print $2; exit}' "$CODEX_LOG")
CODEX_EFFORT=$(awk -F': *' '/^reasoning effort:/ {print $2; exit}' "$CODEX_LOG")
CODEX_TOKENS=$(awk '/^tokens used/ {getline; print; exit}' "$CODEX_LOG" | tr -d ' ')
info "wall ${CODEX_SECONDS}s · model ${CODEX_OBSERVED:-not reported} · effort ${CODEX_EFFORT:-not reported}"

# -- leg 2: claude --
say "leg 2 — claude $CLAUDE_MODEL, 1 pass"
# stream-json, not json: json is the final result alone, and a leg whose tool calls are not on disk
# cannot evidence what it read.
CLAUDE_LOG=$SCRATCH/claude.jsonl
CLAUDE_PROMPT=$(leg_prompt "$SCRATCH/legs/$CLAUDE_MODEL")
CLAUDE_START=$(date +%s)
set +e
( cd "$BLIND" && timeout "$LEG_TIMEOUT" claude -p \
  --model "$CLAUDE_MODEL" \
  --dangerously-skip-permissions \
  --verbose \
  --output-format stream-json \
  "$CLAUDE_PROMPT" < /dev/null ) > "$CLAUDE_LOG" 2>"$SCRATCH/claude.err"
CLAUDE_RC=$?
set -e
CLAUDE_SECONDS=$(( $(date +%s) - CLAUDE_START ))
if [ "$CLAUDE_RC" -ne 0 ]; then
  sed -n '1,40p' "$SCRATCH/claude.err" >&2 || true
  die "claude leg exited $CLAUDE_RC after ${CLAUDE_SECONDS}s — a failed leg is a failed audit"
fi
harvest "$SCRATCH/legs/$CLAUDE_MODEL" "leg 2"
CLAUDE_OBSERVED=$(grep -o '"model":"[^"]*"' "$CLAUDE_LOG" | head -1)
CLAUDE_TOKENS=$(grep -o '"output_tokens":[0-9]*' "$CLAUDE_LOG" | tail -1)
info "wall ${CLAUDE_SECONDS}s · model ${CLAUDE_OBSERVED:-not reported}"

# Both legs have run, so neither can read the other any more.

# ---- provenance ---------------------------------------------------------------------------------
# Captured at run time, never copied from the method document.

say "provenance"
PROVENANCE=$SCRATCH/provenance.txt
{
  printf 'audit date        %s\n' "$AUDIT_DATE"
  printf 'code commit       %s  (dirty: no)\n' "$REVIEW_COMMIT"
  printf 'scope             %s\n' "${SCOPE[0]}"
  for f in "${SCOPE[@]:1}"; do printf '                  %s\n' "$f"; done
  printf 'blind tree        %s (scoped files only; hashes in BLIND.md)\n' "$BLIND_COMMIT"
  printf 'skill             none — web-security prompt, audits/prompts/leg.md\n'
  printf 'leg 1 requested   codex %s · effort high · 1 pass\n' "$CODEX_MODEL"
  printf 'leg 1 cli         %s\n' "$CODEX_CLI"
  printf 'leg 1 observed    model: %s · reasoning effort: %s\n' "${CODEX_OBSERVED:-not reported}" "${CODEX_EFFORT:-not reported}"
  printf 'leg 1 wall        %ss (exit %s)\n' "$CODEX_SECONDS" "$CODEX_RC"
  printf 'leg 1 tokens      %s\n' "${CODEX_TOKENS:-not reported}"
  printf 'leg 2 requested   claude %s · 1 pass\n' "$CLAUDE_MODEL"
  printf 'leg 2 cli         %s\n' "$CLAUDE_CLI"
  printf 'leg 2 observed    %s\n' "${CLAUDE_OBSERVED:-not reported}"
  printf 'leg 2 wall        %ss (exit %s)\n' "$CLAUDE_SECONDS" "$CLAUDE_RC"
  printf 'leg 2 tokens      %s\n' "${CLAUDE_TOKENS:-not reported}"
} > "$PROVENANCE"
cat "$PROVENANCE"

# ---- the legs move into the tree ----------------------------------------------------------------
# Only now: until leg 2 finished, anything in the repository was readable by it.

say "harvest"
mkdir -p "$OUT_DIR" "$OUT_DIR/transcripts"
cp -a "$SCRATCH/legs/$CODEX_MODEL" "$CODEX_LEG"
cp -a "$SCRATCH/legs/$CLAUDE_MODEL" "$CLAUDE_LEG"
cp "$BLIND_MD" "$OUT_DIR/BLIND.md"
info "leg reports and BLIND.md in audits/$AUDIT_DATE/"

# ---- rollup -------------------------------------------------------------------------------------
# A synthesis, so a model writes it. The known answer reaches the rollup and never a leg.

say "rollup — claude $CLAUDE_MODEL"
ROLLUP_PROMPT=$SCRATCH/rollup-prompt.md
{
  cat "$REPO_ROOT/audits/prompts/rollup.md"
  printf '\n\n## This run\n\n'
  printf -- '- leg 1 (codex) report directory: `%s`\n' "$CODEX_LEG"
  printf -- '- leg 2 (claude) report directory: `%s`\n' "$CLAUDE_LEG"
  printf -- '- provenance file, to reproduce verbatim: `%s`\n' "$PROVENANCE"
  printf -- '- write the document to: `%s`\n' "$OUT_DIR/AUDIT.md"
  printf '\n\n## Known answer\n\n'
  cat "$KNOWN_ANSWER_FILE"
} > "$ROLLUP_PROMPT"

# The prompt goes in on stdin, not as a positional argument: `--add-dir` is variadic, so a positional
# prompt after it is consumed as one more directory and `-p` is left with no input.
ROLLUP_START=$(date +%s)
set +e
timeout "$LEG_TIMEOUT" claude -p \
  --model "$CLAUDE_MODEL" \
  --dangerously-skip-permissions \
  --add-dir "$SCRATCH" \
  < "$ROLLUP_PROMPT"
ROLLUP_RC=$?
set -e
ROLLUP_SECONDS=$(( $(date +%s) - ROLLUP_START ))
[ "$ROLLUP_RC" -eq 0 ] || die "rollup exited $ROLLUP_RC after ${ROLLUP_SECONDS}s"
info "wall ${ROLLUP_SECONDS}s"

# ---- transcripts, last --------------------------------------------------------------------------
# After the rollup, so nothing that could read them was still running.

cp "$CODEX_LOG" "$OUT_DIR/transcripts/leg-1-codex.log"
cp "$CLAUDE_LOG" "$OUT_DIR/transcripts/leg-2-claude.jsonl"
cp "$ROLLUP_PROMPT" "$OUT_DIR/transcripts/rollup-prompt.md"

# ---- completion ---------------------------------------------------------------------------------
# audits/README.md's definition, asserted rather than assumed.

say "check"
[ -s "$OUT_DIR/AUDIT.md" ] || die "audits/$AUDIT_DATE/AUDIT.md was not written, or is empty"
for leg in "$CODEX_LEG" "$CLAUDE_LEG"; do
  [ -d "$leg" ] || die "missing leg directory: $leg"
  [ "$(ls -A "$leg" | wc -l)" -gt 0 ] || die "empty leg directory: $leg — an empty leg is a failed audit, not a clean one"
done
info "audits/$AUDIT_DATE/ is complete"
printf '\naudit: done — audits/%s/AUDIT.md\n' "$AUDIT_DATE"
