# Davy Protocol — Security Fix Application Guide

## Pre-Flight: Verify Your Upgrade Capability

```bash
# 1. Find your UpgradeCap
sui client objects --type 0x2::package::UpgradeCap

# 2. Check upgrade policy (should be "compatible")
sui client object <UPGRADE_CAP_ID> --json | grep policy
```

## Upgrade Compatibility Matrix

| Fix | Upgrade-Safe? | Why |
|-----|---------------|-----|
| #1 CRITICAL: Fill theft | ✅ Yes | Body-only changes (auto-settle in fill functions) |
| #2 HIGH: Rounding | ✅ Yes | Body-only changes (payment-range validation) |
| #3 HIGH: Intent price | ✅ Yes | Additive: new `execute_against_offer_v2()` |
| #4 HIGH: Cap revocation | ✅ Yes | Additive: new `RevocationRegistry` struct + functions |
| #5 MEDIUM: Gated intents | ✅ Yes | Additive: new `execute_against_gated_offer()` |
| #6 MEDIUM: Front-run | ⚠️ Document only | Struct/signature changes need redeploy |
| #7 LOW: Empty module | ✅ Verify only | Check Move.toml, no code change needed |
| #8 LOW: Pool size | ✅ Yes | Body-only change (add assert) |

**All critical/high fixes are upgrade-compatible.** No redeploy required.

## Application Order

Apply in this order (each fix builds on previous):

```
1. fix_01 — MUST be first (changes fill function bodies)
2. fix_02 — Changes same fill functions (price validation)
3. fix_03 — Adds execute_against_offer_v2 (depends on fix_01 auto-settle)
4. fix_04 — Adds RevocationRegistry (independent)
5. fix_05 — Adds execute_against_gated_offer (depends on fix_01 + fix_03 patterns)
6. fix_06 — Documentation only
7. fix_07 — Verification only
8. fix_08 — Independent
```

## After Applying Fixes

```bash
# 1. Build
cd davy && sui move build

# 2. Test
sui move test

# 3. Dry-run upgrade
sui client upgrade --upgrade-capability <CAP_ID> --gas-budget 200000000 --dry-run

# 4. If dry-run passes, execute
sui client upgrade --upgrade-capability <CAP_ID> --gas-budget 200000000

# 5. Post-upgrade: create RevocationRegistry (fix #4)
sui client call \
  --package <NEW_PACKAGE_ID> \
  --module capability \
  --function create_revocation_registry \
  --args <ADMIN_CAP_ID> \
  --gas-budget 10000000
```

## If Upgrade Fails (Redeploy Path)

If Sui's compatibility checker rejects the upgrade:

1. Change all low-level fills to `public(package) fun` (cleaner fix for #1)
2. Add `created_at_ms` field to LiquidityOffer for cooldown (fix #6)
3. Add `clock: &Clock` parameter to `withdraw()` (fix #6)
4. Publish as new package
5. Migrate AdminCap authority to new package
6. Communicate new package ID to all integrators

## Files

```
fixes/
├── fix_01_critical_fill_theft.move.patch      # CRITICAL — apply first
├── fix_02_high_rounding_mismatch.move.patch   # HIGH
├── fix_03_high_intent_price.move.patch        # HIGH
├── fix_04_high_cap_revocation.move.patch      # HIGH
├── fix_05_medium_gated_intent.move.patch      # MEDIUM
├── fix_06_medium_frontrun_withdrawal.move.patch # MEDIUM (doc only for upgrade)
├── fix_07_low_empty_module.move.patch         # LOW (verification)
├── fix_08_low_pool_size.move.patch            # LOW
└── README.md                                   # This file
```
