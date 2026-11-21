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

# Hex to raw bytes. `xxd` is not a devbox package — it comes from the host on this machine — so the
# node path is the one that is always available, and which of the two ran is printed.
if command -v xxd >/dev/null 2>&1; then
  UNHEX_WITH=xxd
  unhex() { xxd -r -p; }
else
  UNHEX_WITH=node
  unhex() {
    node -e 'let h="";process.stdin.on("data",c=>h+=c);process.stdin.on("end",()=>process.stdout.write(Buffer.from(h.replace(/\s/g,""),"hex")))'
  }
fi

# A 32-byte ABI word is 64 hex characters and bash arithmetic is 64-bit, so only the low 8 bytes are
# read. A length or offset that needed more than that would not fit in memory anyway.
word_at() { echo $((16#${1:$2+48:16})); }

fail=0
note() { printf '  %s\n' "$*"; }

printf 'verify: address %s on chains [%s], hex decoded with %s\n' "$VERIFY_ADDRESS" "$VERIFY_CHAINS" "$UNHEX_WITH"

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

    if [ "$chain_hash" = "$served_hash" ] && [ "$served_bytes" -eq "$len" ]; then
      note "$chain $resource $len B chain=${chain_hash:0:16}… served=${served_hash:0:16}… ok"
    else
      note "$chain $resource chain=$len B $chain_hash served=$served_bytes B $served_hash MISMATCH"
      fail=1
    fi
  done
done

if [ "$fail" -ne 0 ]; then
  echo "verify: a comparison failed" >&2
  exit 1
fi

# --- criterion 3: a browser renders it, not just a decoder ---
# The static host is `tools/serve.ts` on a free port; the page is the fixture's root per chain. A
# pass is the title ceasing to be the shell's within the budget, with no page error.
echo "verify: browser stage"
make --no-print-directory build >/dev/null
port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')
GW44_PORT=$port node tools/serve.ts dist >"$work/serve.log" 2>&1 &
serve_pid=$!
trap 'kill "$serve_pid" 2>/dev/null || true; rm -rf "$work"' EXIT
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 0.1
done

for chain in $VERIFY_CHAINS; do
  if node tools/verify-browser.ts "$port" "$chain" "$VERIFY_ADDRESS" "$VERIFY_TIMEOUT_MS"; then
    note "$chain browser ok"
  else
    note "$chain browser MISMATCH"
    fail=1
  fi
done

[ "$fail" -eq 0 ] || { echo "verify: the browser stage failed" >&2; exit 1; }
echo "verify: every comparison and both browser loads passed"
