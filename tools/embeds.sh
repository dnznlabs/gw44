#!/usr/bin/env bash
# Publishes static copies of the resources other sites embed, each checked against the chain, and
# prints the snippet a host page pins them with.
#
#   GW44_CONFIG=gw44.json GW44_CHAINS=chains.json GW44_EMBEDS="widget.js" tools/embeds.sh <site dir>
#   GW44_SITE_URL=https://host  (optional; without it the snippet's host is a placeholder)
#
# Why a copy at all: a host page cannot embed a script that a service worker invents, because the
# worker only answers pages on its own origin. So the deploy writes the bytes the chain returned as
# a plain file, and the snippet pins them by `integrity` so the host page is not trusting the site.
#
# Each resource is read twice, by the two independent paths `tools/verify.sh` uses — the gateway's
# own core through `tools/get.ts`, and `cast` cut apart by hand — and refused unless both agree byte
# for byte. A copy nobody can check against the chain is worse than no copy.
set -euo pipefail

SITE=${1:-}
if [ -z "$SITE" ] || [ ! -d "$SITE" ]; then
  echo "embeds: usage: tools/embeds.sh <site dir>   (the directory tools/build.ts wrote)" >&2
  exit 2
fi

CONFIG=${GW44_CONFIG:-}
CHAINS=${GW44_CHAINS:-chains.json}
EMBEDS=${GW44_EMBEDS:-}
SITE_URL=${GW44_SITE_URL:-}

[ -n "$CONFIG" ] || { echo "embeds: GW44_CONFIG is required" >&2; exit 2; }
[ -f "$CONFIG" ] || { echo "embeds: GW44_CONFIG names no file: $CONFIG" >&2; exit 2; }
[ -f "$CHAINS" ] || { echo "embeds: GW44_CHAINS names no file: $CHAINS" >&2; exit 2; }
if [ -z "$EMBEDS" ]; then
  echo "embeds: nothing to publish"
  exit 0
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The three files the build writes. A copy must never land on one of them: that would replace the
# deployable with a contract's bytes, which is the one thing the build's own gate exists to prevent.
BUILT="404.html gw44-sw.js index.html"

# Hex to raw bytes, through node alone, as tools/verify.sh does it (#26).
unhex() {
  node -e 'let h="";process.stdin.on("data",c=>h+=c);process.stdin.on("end",()=>process.stdout.write(Buffer.from(h.replace(/\s/g,""),"hex")))'
}
# A 32-byte ABI word is 64 hex characters and bash arithmetic is 64-bit, so only the low 8 bytes.
word_at() { echo $((16#${1:$2+48:16})); }

read_config() { node -e '
  const fs = require("fs");
  const pins = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const chains = Object.keys(pins.contracts);
  for (const c of chains) process.stdout.write(`${c} ${pins.contracts[c]}\n`);
' "$CONFIG"; }

endpoint_for() { node -e '
  const fs = require("fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write((c[process.argv[2]] || [])[0] || "");
' "$CHAINS" "$1"; }

mapfile -t PAIRS < <(read_config)
[ "${#PAIRS[@]}" -gt 0 ] || { echo "embeds: the configuration names no chain" >&2; exit 2; }
single=$([ "${#PAIRS[@]}" -eq 1 ] && echo yes || echo no)

fail=0
note() { printf '  %s\n' "$*"; }
printf 'embeds: %s on %d chain(s), into %s\n' "$EMBEDS" "${#PAIRS[@]}" "$SITE"

for path in $EMBEDS; do
  # One path segment of letters, digits, dot, underscore and hyphen, and nothing else. Narrower than
  # "a plain relative path": that refused `..`, a leading slash and a scheme, but left a path with an
  # inner `/` or a quote to fail further down, where it would fail closed but for the wrong reason.
  # A nested embed is not supported rather than accidentally broken; widening this is a decision.
  if ! printf '%s' "$path" | grep -qE '^[A-Za-z0-9][A-Za-z0-9._-]*$'; then
    echo "embeds: refusing the path '$path': one segment of letters, digits, '.', '_' or '-' is required" >&2
    exit 2
  fi
  for built in $BUILT; do
    if [ "$path" = "$built" ]; then
      echo "embeds: refusing to overwrite the built file '$path'" >&2
      exit 2
    fi
  done

  for pair in "${PAIRS[@]}"; do
    chain=${pair%% *}
    address=${pair##* }
    endpoint=$(endpoint_for "$chain")
    if [ -z "$endpoint" ]; then
      note "$chain $path: no endpoint in $CHAINS — FAILED"
      fail=1
      continue
    fi

    # Decided before either read, because the comparison read has to ask for the same URL the
    # deployed site will serve. Under a one-contract configuration the whole path is the resource,
    # so asking for `/<chain>/<path>` would request a resource named after the chain — which the
    # contract answers 404, and the copy was refused for a reason that had nothing to do with it.
    if [ "$single" = yes ]; then
      dest="$SITE/$path"
      url_path="/$path"
    else
      dest="$SITE/$chain/$path"
      url_path="/$chain/$path"
    fi

    # --- the reference side: cast, cut apart by hand ---
    raw=$(cast call "$address" 'request(string[],(string,string)[])' "[\"$path\"]" '[]' \
      --rpc-url "$endpoint" 2>"$work/cast.err") || raw=""
    hex=${raw#0x}
    if [ -z "$hex" ] || [ ${#hex} -lt 192 ]; then
      note "$chain $path: the chain returned nothing usable — FAILED$([ -s "$work/cast.err" ] && printf ' (%s)' "$(head -1 "$work/cast.err")")"
      fail=1
      continue
    fi
    status=$(word_at "$hex" 0)
    if [ "$status" -ne 200 ]; then
      note "$chain $path: the chain answered status $status, not 200 — FAILED"
      fail=1
      continue
    fi
    boff=$(word_at "$hex" 64)
    len=$(word_at "$hex" $((boff * 2)))
    data=${hex:$((boff * 2 + 64)):$((len * 2))}
    if [ "$len" -eq 0 ] || [ ${#data} -ne $((len * 2)) ]; then
      note "$chain $path: the chain's body is truncated — FAILED"
      fail=1
      continue
    fi
    printf '%s' "$data" | unhex > "$work/chain.bin"

    # --- the compared side: the gateway's own core ---
    if ! GW44_CONFIG="$CONFIG" GW44_CHAINS="$CHAINS" \
      node tools/get.ts "https://embeds.invalid$url_path" >"$work/served.bin" 2>"$work/get.err"; then
      note "$chain $path: tools/get.ts failed — FAILED ($(tail -1 "$work/get.err"))"
      fail=1
      continue
    fi

    if ! cmp -s "$work/chain.bin" "$work/served.bin"; then
      note "$chain $path: the two reads disagree — FAILED ($(wc -c <"$work/chain.bin") B from cast, $(wc -c <"$work/served.bin") B from the core)"
      fail=1
      continue
    fi

    # Both reads agree, so write the copy.
    mkdir -p "$(dirname "$dest")"
    cp "$work/chain.bin" "$dest"

    sha=$(openssl dgst -sha384 -binary "$dest" | openssl base64 -A)
    host=${SITE_URL:-"https://<host>"}
    host=${host%/}
    note "$chain $path $len B sha256=$(sha256sum <"$dest" | cut -c1-16)… written to ${dest#"$SITE"/}"
    printf '    <script src="%s%s" integrity="sha384-%s" crossorigin="anonymous"></script>\n' \
      "$host" "$url_path" "$sha"
  done
done

if [ "$fail" -ne 0 ]; then
  echo "embeds: a copy could not be checked against the chain; nothing more was written" >&2
  exit 1
fi
if [ -z "$SITE_URL" ]; then
  echo "embeds: GW44_SITE_URL was not set, so each snippet's host above is a placeholder"
fi
echo "embeds: every copy agreed with the chain on both reads"
