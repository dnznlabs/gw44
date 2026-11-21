# Blind tree — 2026-11-21b

The legs ran outside the repository, in a tree holding only the scoped files. The commit
below is that tree's own, not this project's, so the hashes are what tie the run to the
source that was read. See `../README.md` § Running blind.

```
review commit     e289e67a51c3f8cfb139fc4a4ed51a3285d650ec
blind commit      6fc958fdc7530e9bce54c4a5cf4ce24d3062131d
```

## In the repository, at the review commit

```
bca93dfab81fbcb4e6a4219caa17dd5382c6470c3ad7c71429e3cbd2e5055aee  src/core/abi.ts
0d9d18656dc2c59b48d3f1d739f6aad4a762c02478df046dece26a84e5aeadd6  src/core/errors.ts
80d8bec647469ecaf89b37f8b229a716e1392fb5dcd907fdef2cc5b7f05f2e45  src/core/ports.ts
f78626dffb83facce869507582fe2199c1d596ed89e7fd245beb65738bb8ccfa  src/core/resolve.ts
872049280291b2f9cbc2a83bbd004da53ac220e2d66086621d88ca22f0906ace  src/core/target.ts
d2d3aa52263cc6537eb8463c3920805450aacab05d25eaae4b497db5825a4719  src/adapters/rpc/fetch.ts
22feeaff61acc6f0eebc4f8f683ac19b350cc0787836a8c01d5101973a851687  src/adapters/rpc/memory.ts
338737e5ad40c795fa6e0ce1485c92254f48e887565d7b7f26d221a55c4059fe  src/adapters/sw/boot.ts
b9c61ca8a9029e50a146ce3ff3854030637f2cdfadaf720e8a8d333af065ab0e  src/adapters/sw/config.ts
b9efad07efacd89997ccf7ec1197bf1afb904187f9a369760d0e38317e280dc3  src/adapters/sw/fallback.ts
a6d8d0785302df7315728cb31340ec866d00be4106e4ed0466c116d79286f112  src/adapters/sw/shell.html
2a6878fe3952cd1df3a0d4f70eb13048133b0d20b9f4eeb69f771c59c74ca2a8  src/adapters/sw/sw.ts
dbb52a2ee7133f796394d6636f7f152b81b8fdc3c8c3bc43602370917d83495d  tools/build.ts
689ab3d1823e28e265be9d906b6515e8e22893e354cd02041b3104864bffb6a6  tools/chains.ts
87bcfb6ff9a1ade9f2c58f624a1cb4c68734bba0ee684d42cf517bdef659b60a  tools/inline.ts
```

## In the blind tree

```
bca93dfab81fbcb4e6a4219caa17dd5382c6470c3ad7c71429e3cbd2e5055aee  src/core/abi.ts
0d9d18656dc2c59b48d3f1d739f6aad4a762c02478df046dece26a84e5aeadd6  src/core/errors.ts
80d8bec647469ecaf89b37f8b229a716e1392fb5dcd907fdef2cc5b7f05f2e45  src/core/ports.ts
f78626dffb83facce869507582fe2199c1d596ed89e7fd245beb65738bb8ccfa  src/core/resolve.ts
872049280291b2f9cbc2a83bbd004da53ac220e2d66086621d88ca22f0906ace  src/core/target.ts
d2d3aa52263cc6537eb8463c3920805450aacab05d25eaae4b497db5825a4719  src/adapters/rpc/fetch.ts
22feeaff61acc6f0eebc4f8f683ac19b350cc0787836a8c01d5101973a851687  src/adapters/rpc/memory.ts
338737e5ad40c795fa6e0ce1485c92254f48e887565d7b7f26d221a55c4059fe  src/adapters/sw/boot.ts
b9c61ca8a9029e50a146ce3ff3854030637f2cdfadaf720e8a8d333af065ab0e  src/adapters/sw/config.ts
b9efad07efacd89997ccf7ec1197bf1afb904187f9a369760d0e38317e280dc3  src/adapters/sw/fallback.ts
a6d8d0785302df7315728cb31340ec866d00be4106e4ed0466c116d79286f112  src/adapters/sw/shell.html
2a6878fe3952cd1df3a0d4f70eb13048133b0d20b9f4eeb69f771c59c74ca2a8  src/adapters/sw/sw.ts
dbb52a2ee7133f796394d6636f7f152b81b8fdc3c8c3bc43602370917d83495d  tools/build.ts
689ab3d1823e28e265be9d906b6515e8e22893e354cd02041b3104864bffb6a6  tools/chains.ts
87bcfb6ff9a1ade9f2c58f624a1cb4c68734bba0ee684d42cf517bdef659b60a  tools/inline.ts
```
