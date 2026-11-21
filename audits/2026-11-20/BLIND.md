# Blind tree — 2026-11-20

The legs ran outside the repository, in a tree holding only the scoped files. The commit
below is that tree's own, not this project's, so the hashes are what tie the run to the
source that was read. See `../README.md` § Running blind.

```
review commit     be92f1f7fcb34121bd7c05203411850fbb64dd5f
blind commit      2e5e33557ce24f0df0f5c4859bb91d919b974297
```

## In the repository, at the review commit

```
de20f7a630b5825384362f2853e1d0d3fec60f8c7f4df202f6101b0d7f35131e  src/core/abi.ts
0d9d18656dc2c59b48d3f1d739f6aad4a762c02478df046dece26a84e5aeadd6  src/core/errors.ts
80d8bec647469ecaf89b37f8b229a716e1392fb5dcd907fdef2cc5b7f05f2e45  src/core/ports.ts
eb46eb592ccbeae860f5d8e6f8a95a687aeae49ad5ee7a04ee31f61d3c000b61  src/core/resolve.ts
9b2e3a26042c7dcc2ffcfaa5062ac95e01179d2c50aa6cea77c0f0d9af80ac26  src/core/target.ts
d2d3aa52263cc6537eb8463c3920805450aacab05d25eaae4b497db5825a4719  src/adapters/rpc/fetch.ts
22feeaff61acc6f0eebc4f8f683ac19b350cc0787836a8c01d5101973a851687  src/adapters/rpc/memory.ts
ab5b9444bc45b59ad7f7c6be42088df0c82dc4d8bd9fb07895190567d3a4dd53  src/adapters/sw/boot.ts
025598b7fb0fa2beeb5be5bbc6cef787a38091e75bb4015e3a922531f1c1121e  src/adapters/sw/config.ts
a6d8d0785302df7315728cb31340ec866d00be4106e4ed0466c116d79286f112  src/adapters/sw/shell.html
8cfd8b633d5e8a232c7916f9f8ae9a747dce8fad5055086f0eda293fa0a41ed0  src/adapters/sw/sw.ts
70e84d32634b410e6b1cf6e3a6aa69fd34decc59c1f059ee4e31ae91eca9d759  tools/build.ts
```

## In the blind tree

```
de20f7a630b5825384362f2853e1d0d3fec60f8c7f4df202f6101b0d7f35131e  src/core/abi.ts
0d9d18656dc2c59b48d3f1d739f6aad4a762c02478df046dece26a84e5aeadd6  src/core/errors.ts
80d8bec647469ecaf89b37f8b229a716e1392fb5dcd907fdef2cc5b7f05f2e45  src/core/ports.ts
eb46eb592ccbeae860f5d8e6f8a95a687aeae49ad5ee7a04ee31f61d3c000b61  src/core/resolve.ts
9b2e3a26042c7dcc2ffcfaa5062ac95e01179d2c50aa6cea77c0f0d9af80ac26  src/core/target.ts
d2d3aa52263cc6537eb8463c3920805450aacab05d25eaae4b497db5825a4719  src/adapters/rpc/fetch.ts
22feeaff61acc6f0eebc4f8f683ac19b350cc0787836a8c01d5101973a851687  src/adapters/rpc/memory.ts
ab5b9444bc45b59ad7f7c6be42088df0c82dc4d8bd9fb07895190567d3a4dd53  src/adapters/sw/boot.ts
025598b7fb0fa2beeb5be5bbc6cef787a38091e75bb4015e3a922531f1c1121e  src/adapters/sw/config.ts
a6d8d0785302df7315728cb31340ec866d00be4106e4ed0466c116d79286f112  src/adapters/sw/shell.html
8cfd8b633d5e8a232c7916f9f8ae9a747dce8fad5055086f0eda293fa0a41ed0  src/adapters/sw/sw.ts
70e84d32634b410e6b1cf6e3a6aa69fd34decc59c1f059ee4e31ae91eca9d759  tools/build.ts
```
