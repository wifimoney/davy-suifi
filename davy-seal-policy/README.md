# davy-seal-policy

Seal access control policy package for Davy Protocol.

Separate from the main `davy` package so it can be upgraded independently.

## Directory Layout

```
project-root/
  davy/                 ← existing Davy core package
  davy-seal-policy/     ← this package
    Move.toml
    sources/
      seal_policy.move  ← the seal_approve entry functions
    tests/
      seal_policy_tests.move
```

## Build & Test

```bash
cd davy-seal-policy
sui move build
sui move test
```

## Publish (testnet)

Before publishing, update `Move.toml` to point to the on-chain Davy
package instead of the local path:

```toml
# Comment out local:
# davy = { local = "../davy" }
# Add on-chain reference:
davy = { git = "...", rev = "..." }
```

Then set the `davy` address in `[addresses]` to the published Davy package:

```toml
[addresses]
davy_seal_policy = "0x0"
davy = "0xf53c071b6575ee2e5b1b19158acbbf21944aa6474d7b8e688365015295a7c0a7"
```

```bash
sui client publish --gas-budget 100000000
```

Save the returned package ID — this becomes the Seal policy package ID
used in the TypeScript SDK's `encrypt({ packageId: ... })` calls.

## How It Works

### Encrypted Intents (anti-MEV)

1. App encrypts intent params using `@mysten/seal` SDK with
   `packageId = <this-package>` and `id = intentObjectId`
2. On-chain intent stores ciphertext, not plaintext prices
3. Executor bot requests decryption from Seal key servers
4. Key server dry-runs a PTB calling `seal_approve(id_bytes, &ExecutorCap)`
5. Since the executor owns a valid cap, the call succeeds → key released
6. Bot decrypts params, routes, executes

### Private Offers (dark pool)

1. Maker creates allowlist: `create_and_share_allowlist(offer_id, [addr1, addr2])`
2. Maker encrypts offer terms with `packageId = <this-package>`, `id = offerObjectId`
3. Allowed taker requests decryption → key server dry-runs
   `seal_approve_allowlist(id_bytes, &allowlist, ctx)`
4. Sender is on allowlist → succeeds → key released → taker sees terms
