#!/usr/bin/env bash
# What `make verify` runs. Proves that what the gateway serves for a live contract is byte for byte
# what the chain returns, and that a browser actually renders it.
#
#   devbox run -- make verify
#   VERIFY_CHAINS=11155111 devbox run -- make verify
#   VERIFY_ADDRESS=0x… devbox run -- make verify
#
# The point is an independent decoder. The reference side is `cast` plus shell arithmetic over the
# raw ABI hex, and it imports nothing under `src/`: a bug shared between the gateway's decoder and
# its own test would pass both, which is exactly what this exists to catch. The compared side is
# `tools/get.ts`, which is the gateway's core.
#
# Needs the network and a funded-by-nobody public endpoint per chain, so it is deliberately NOT part
# of `make check` and NOT in CI — a gate that depends on public endpoints is a decision, not a
# detail (m01-t03 § Out of scope).
set -euo pipefail

# The fixture of spike 001 § Evidence: the redeployed `App`, the same address on both testnets.
FIXTURE=0x00a9f390a6010d045e0d34856048ddd6910d25ba
VERIFY_CHAINS=${VERIFY_CHAINS:-"11155111 84532"}
VERIFY_ADDRESS=${VERIFY_ADDRESS:-$FIXTURE}
VERIFY_TIMEOUT_MS=${VERIFY_TIMEOUT_MS:-20000}

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Hex to raw bytes, through node alone. `xxd` is not a devbox package, so a build that preferred it
# decoded differently on a host that happened to have it than on one that did not, and the branch
# that was always available was the one nobody ever ran (#26).
unhex() {
  node -e 'let h="";process.stdin.on("data",c=>h+=c);process.stdin.on("end",()=>process.stdout.write(Buffer.from(h.replace(/\s/g,""),"hex")))'
}

# A 32-byte ABI word is 64 hex characters and bash arithmetic is 64-bit, so only the low 8 bytes are
# read. A length or offset that needed more than that would not fit in memory anyway.
word_at() { echo $((16#${1:$2+48:16})); }

fail=0
note() { printf '  %s\n' "$*"; }

# The reference hashes, keyed `<chain> <resource>`, so the pinned pass below compares against the
# same chain-side bytes rather than reading the chain a second time.
declare -A ref_hash
declare -A ref_len

# The status an ERC-5219 resource must answer for its body to be the thing being compared. An
# override exists so the branch can be shown failing without a contract that answers anything else.
VERIFY_STATUS=${VERIFY_STATUS:-200}

printf 'verify: address %s on chains [%s]\n' "$VERIFY_ADDRESS" "$VERIFY_CHAINS"

for chain in $VERIFY_CHAINS; do
  endpoint=$(node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync("chains.json","utf8"));process.stdout.write((c[process.argv[1]]||[])[0]||"")' "$chain")
  if [ -z "$endpoint" ]; then
    note "chain $chain: no endpoint in chains.json — MISMATCH"
    fail=1
    continue
  fi

  for resource in root widget; do
    # --- the reference side: cast, then the ABI cut apart by hand ---
    if [ "$resource" = root ]; then
      path=/
      raw=$(cast call "$VERIFY_ADDRESS" 'html()' --rpc-url "$endpoint" 2>"$work/cast.err") || raw=""
      hex=${raw#0x}
      # `html()` returns one string: [offset][length][bytes]. Length at hex offset 66 of the
      # 0x-prefixed value, bytes from 130 — so 64 and 128 into the unprefixed hex.
      if [ -n "$hex" ] && [ ${#hex} -ge 128 ]; then
        len=$(word_at "$hex" 64)
        data=${hex:128:$((len * 2))}
      else
        len=0
        data=""
      fi
    else
      path=/widget.js
      raw=$(cast call "$VERIFY_ADDRESS" 'request(string[],(string,string)[])' '["widget.js"]' '[]' \
        --rpc-url "$endpoint" 2>"$work/cast.err") || raw=""
      hex=${raw#0x}
      # ERC-5219 `request` returns (uint16 status, string body, (string,string)[] headers). Word 0 is
      # the status, word 1 the body's offset from the start of the return data; the length and the
      # bytes follow at that offset.
      if [ -n "$hex" ] && [ ${#hex} -ge 192 ]; then
        # Word 0 is the status, and a body carried by a 404 is not the resource (#29).
        status=$(word_at "$hex" 0)
        if [ "$status" -ne "$VERIFY_STATUS" ]; then
          note "$chain $resource: the chain answered status $status, not $VERIFY_STATUS — MISMATCH"
          fail=1
          continue
        fi
        boff=$(word_at "$hex" 64)
        len=$(word_at "$hex" $((boff * 2)))
        data=${hex:$((boff * 2 + 64)):$((len * 2))}
      else
        len=0
        data=""
      fi
    fi

    if [ "$len" -eq 0 ] || [ ${#data} -ne $((len * 2)) ]; then
      note "$chain $resource: the chain returned no usable body — MISMATCH$([ -s "$work/cast.err" ] && printf ' (%s)' "$(head -1 "$work/cast.err")")"
      fail=1
      continue
    fi
    chain_hash=$(printf '%s' "$data" | unhex | sha256sum | cut -d' ' -f1)

    # --- the compared side: the gateway's own core, through tools/get.ts ---
    if node tools/get.ts "http://localhost:8244/$chain/$VERIFY_ADDRESS$path" \
      >"$work/served" 2>"$work/get.err"; then
      served_bytes=$(wc -c <"$work/served")
      served_hash=$(sha256sum <"$work/served" | cut -d' ' -f1)
    else
      note "$chain $resource: tools/get.ts failed — MISMATCH ($(tail -1 "$work/get.err"))"
      fail=1
      continue
    fi

    ref_hash["$chain $resource"]=$chain_hash
    ref_len["$chain $resource"]=$len

    if [ "$chain_hash" = "$served_hash" ] && [ "$served_bytes" -eq "$len" ]; then
      note "$chain $resource $len B chain=${chain_hash:0:16}… served=${served_hash:0:16}… ok"
    else
      note "$chain $resource chain=$len B $chain_hash served=$served_bytes B $served_hash MISMATCH"
      fail=1
    fi
  done
done

# --- the pinned build resolves the same bytes from a URL that names no contract ---
# `pinned.invalid` is deliberately neither loopback nor a host-form name: under a pin the hostname is
# never read, so a URL that the unpinned gateway would refuse must still resolve to the contract.
for chain in $VERIFY_CHAINS; do
  for resource in root widget; do
    chain_hash=${ref_hash["$chain $resource"]:-}
    len=${ref_len["$chain $resource"]:-}
    if [ -z "$chain_hash" ]; then
      note "$chain pinned $resource: no reference hash — MISMATCH"
      fail=1
      continue
    fi
    [ "$resource" = root ] && path=/ || path=/widget.js

    if GW44_PIN="$chain:$VERIFY_ADDRESS" node tools/get.ts "https://pinned.invalid$path" \
      >"$work/served" 2>"$work/get.err"; then
      served_bytes=$(wc -c <"$work/served")
      served_hash=$(sha256sum <"$work/served" | cut -d' ' -f1)
    else
      note "$chain pinned $resource: tools/get.ts failed — MISMATCH ($(tail -1 "$work/get.err"))"
      fail=1
      continue
    fi

    if [ "$chain_hash" = "$served_hash" ] && [ "$served_bytes" -eq "$len" ]; then
      note "$chain pinned $resource $len B chain=${chain_hash:0:16}… served=${served_hash:0:16}… ok"
    else
      note "$chain pinned $resource chain=$len B $chain_hash served=$served_bytes B $served_hash MISMATCH"
      fail=1
    fi
  done
done

if [ "$fail" -ne 0 ]; then
  echo "verify: a comparison failed" >&2
  exit 1
fi

# --- the configured build resolves the same bytes under each chain's prefix ---
# One project on both testnets, the first chain the default. The prefix is the whole difference from
# the pinned pass: the same contract, reached at `/<chain>/` rather than at `/`.
config=$work/gw44.json
{
  printf '{ "default": "%s", "contracts": {' "${VERIFY_CHAINS%% *}"
  sep=""
  for chain in $VERIFY_CHAINS; do
    printf '%s "%s": "%s"' "$sep" "$chain" "$VERIFY_ADDRESS"
    sep=","
  done
  printf ' } }\n'
} >"$config"

for chain in $VERIFY_CHAINS; do
  for resource in root widget; do
    chain_hash=${ref_hash["$chain $resource"]:-}
    len=${ref_len["$chain $resource"]:-}
    if [ -z "$chain_hash" ]; then
      note "$chain config $resource: no reference hash — MISMATCH"
      fail=1
      continue
    fi
    [ "$resource" = root ] && path="/$chain/" || path="/$chain/widget.js"

    if GW44_CONFIG="$config" node tools/get.ts "https://pinned.invalid$path" \
      >"$work/served" 2>"$work/get.err"; then
      served_bytes=$(wc -c <"$work/served")
      served_hash=$(sha256sum <"$work/served" | cut -d' ' -f1)
    else
      note "$chain config $resource: tools/get.ts failed — MISMATCH ($(tail -1 "$work/get.err"))"
      fail=1
      continue
    fi

    if [ "$chain_hash" = "$served_hash" ] && [ "$served_bytes" -eq "$len" ]; then
      note "$chain config $resource $len B chain=${chain_hash:0:16}… served=${served_hash:0:16}… ok"
    else
      note "$chain config $resource chain=$len B $chain_hash served=$served_bytes B $served_hash MISMATCH"
      fail=1
    fi
  done
done

# --- criterion 3: a browser renders it, not just a decoder ---
# The static host is `tools/serve.ts` on a free port; the page is the fixture's root per chain. A
# pass is the title ceasing to be the shell's within the budget, with no page error.
echo "verify: browser stage"

free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})'
}
serve_at() { # <dir> <port> -> pid on stdout
  GW44_PORT=$2 node tools/serve.ts "$1" >>"$work/serve.log" 2>&1 &
  echo $!
}
wait_for() {
  for _ in $(seq 1 50); do
    curl -s -o /dev/null "http://127.0.0.1:$1/" && return 0
    sleep 0.1
  done
  return 1
}

make --no-print-directory build >/dev/null
port=$(free_port)
serve_pid=$(serve_at dist "$port")
pins=()
trap 'kill "$serve_pid" ${pins[*]} 2>/dev/null || true; rm -rf "$work"' EXIT
wait_for "$port" || { echo "verify: the unpinned host never answered" >&2; exit 1; }

for chain in $VERIFY_CHAINS; do
  if node tools/verify-browser.ts "http://localhost:$port/$chain/$VERIFY_ADDRESS/" "$VERIFY_TIMEOUT_MS"; then
    note "$chain browser ok"
  else
    note "$chain browser MISMATCH"
    fail=1
  fi

  # The pinned build gets its own directory and its own port, because its root is the contract and
  # there is no URL on it that would name a chain or an address.
  pin_out=$work/pinned-$chain
  GW44_OUT=$pin_out GW44_PIN="$chain:$VERIFY_ADDRESS" node tools/build.ts >/dev/null
  pin_port=$(free_port)
  pins+=("$(serve_at "$pin_out" "$pin_port")")
  if wait_for "$pin_port" && node tools/verify-browser.ts "http://localhost:$pin_port/" "$VERIFY_TIMEOUT_MS"; then
    note "$chain pinned browser ok"
  else
    note "$chain pinned browser MISMATCH"
    fail=1
  fi
done

# The configured build gets one directory and one port for both chains, because one build serves
# them both — which is the thing being checked.
config_out=$work/config-build
GW44_OUT=$config_out GW44_CONFIG="$config" node tools/build.ts >/dev/null
config_port=$(free_port)
pins+=("$(serve_at "$config_out" "$config_port")")
if wait_for "$config_port"; then
  # `/` covers the default chain through its redirect; every other chain is loaded at its prefix. One
  # load per configured chain, so the count does not change with the number of chains.
  default=${VERIFY_CHAINS%% *}
  for chain in $VERIFY_CHAINS; do
    if [ "$chain" = "$default" ]; then
      where=/ label="root → $chain"
    else
      where="/$chain/" label="$chain"
    fi
    if node tools/verify-browser.ts "http://localhost:$config_port$where" "$VERIFY_TIMEOUT_MS"; then
      note "$label config browser ok"
    else
      note "$label config browser MISMATCH"
      fail=1
    fi
  done
else
  note "config browser: the host never answered — MISMATCH"
  fail=1
fi

[ "$fail" -eq 0 ] || { echo "verify: the browser stage failed" >&2; exit 1; }
echo "verify: every comparison and every browser load passed"
