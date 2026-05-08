# `@axie-duel/contracts` — Solidity 0.8.24 + Foundry

Three contracts that power Axie Duel's on-chain economy on **Ronin** (Saigon testnet today, mainnet post-Sky Mavis-partnership).

> **Status (May 2026)**: contracts written, internally reviewed, **NOT yet deployed**. Awaiting Sky Mavis Builders Program guidance on Saigon faucet provisioning and the formal audit track.

---

## Contract inventory

| Contract | Type | Purpose |
|---|---|---|
| [`AxsTokenMock.sol`](./src/AxsTokenMock.sol) | ERC-20 | Stand-in for real `$AXS` on testnet. Drops out post-mainnet when we wire to the real Sky Mavis AXS contract. |
| [`AxieDuelToken.sol`](./src/AxieDuelToken.sol) | ERC-20 capped (1B) | Optional in-game soft-currency. May be retired in favor of pure $AXS (decision pending Sky Mavis input). |
| [`AxieDuelCardNFT.sol`](./src/AxieDuelCardNFT.sol) | ERC-721 + AccessControl | Mints **game cards** (Spells / Traps / future Axie-derived drops). Roles: `MINTER_ROLE`, `PAUSER_ROLE`, OpenZeppelin AccessControl. |

> ⚠️ **Important IP note** — the ERC-721 contract mints *game cards*, **not representations of Axie Infinity NFTs**. Axie NFTs from a user's wallet are read-only inputs to our parts → card algorithm. We never tokenize or wrap an Axie.

---

## Quickstart for an auditor / fresh dev

```bash
# 1. Install Foundry (one-time, ~30 s)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Install dependencies (forge-std + OpenZeppelin)
cd packages/contracts
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git

# 3. Build
forge build

# 4. Run unit tests
forge test -vv

# 5. (optional) Coverage report
forge coverage --report summary
```

Tests live in [`test/`](./test) — one suite per contract (`AxsTokenMock.t.sol`, `AxieDuelToken.t.sol`, `AxieDuelCardNFT.t.sol`).

---

## Deploy to Saigon testnet

> Requires: Foundry installed, `~5 RON` testnet balance in deployer wallet, `.env` set up.

### 1. Get testnet RON

Visit https://faucet.roninchain.com/ and request RON for the deployer address.

### 2. Configure `.env`

In `packages/contracts/.env`:

```bash
DEPLOYER_PRIVATE_KEY=0x<your-saigon-deployer-private-key>
SAIGON_RPC_URL=https://saigon-testnet.roninchain.com/rpc
RONIN_MAINNET_RPC_URL=https://api.roninchain.com/rpc   # for later, do NOT broadcast yet
```

> ⚠️ **Never commit `.env` or your private key.** The repo's `.gitignore` excludes `.env` files. Confirm before committing.

### 3. Deploy

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url saigon \
  --broadcast \
  -vvvv
```

The deploy script logs each address with a `DEPLOYED:<name>:<address>` marker so it's grep-friendly:

```bash
forge script ... 2>&1 | grep "^DEPLOYED:"
# DEPLOYED:AxsTokenMock:0x...
# DEPLOYED:AxieDuelToken:0x...
# DEPLOYED:AxieDuelCardNFT:0x...
```

### 4. Verify on Saigon explorer

Sky Mavis uses Sourcify for verification on the [Saigon block explorer](https://saigon-app.roninchain.com/). After deploy:

```bash
forge verify-contract <ADDRESS> src/AxsTokenMock.sol:AxsTokenMock \
  --chain 2021 \
  --verifier sourcify \
  --verifier-url https://sourcify.roninchain.com/server
```

Repeat for `AxieDuelToken` and `AxieDuelCardNFT`.

### 5. Update environment files

Once verified, copy addresses to:

- `apps/web/.env.production` — `NEXT_PUBLIC_AXS_TOKEN_ADDRESS`, `NEXT_PUBLIC_DUEL_TOKEN_ADDRESS`, `NEXT_PUBLIC_CARD_NFT_ADDRESS`
- `apps/api/.env.production` — same vars (server-side)
- `packages/contracts/deployed-addresses.json` — public ledger for the README

---

## Mainnet checklist (do **NOT** run until Sky Mavis greenlight)

- [ ] External audit completed (recommended: OpenZeppelin Defender + a Solidity auditor with Ronin experience)
- [ ] All test suites at 100 % coverage
- [ ] Multisig deployer set (Gnosis Safe on Ronin or equivalent)
- [ ] Pause guardian set (separate address from minter)
- [ ] Initial supply / minting policy reviewed with Sky Mavis legal
- [ ] Saigon contracts running for ≥ 30 days with non-trivial volume
- [ ] Mainnet RON funded for deploy gas + initial liquidity (if applicable)
- [ ] Public bug bounty open for ≥ 14 days before mainnet broadcast

---

## Audit summary (internal review)

These are the items an auditor will verify. Listed here for transparency:

- ✅ All `external` / `public` functions guarded by `AccessControl` where state-mutating
- ✅ No reentrancy surface — no `call` to user-controlled addresses except the standard ERC-20 / ERC-721 transfer flows (which use OpenZeppelin's audited implementations)
- ✅ Cap enforcement on `AxieDuelToken` — `ERC20Capped` from OpenZeppelin
- ✅ Pausable on `AxieDuelCardNFT` for emergency stop
- ✅ No `selfdestruct` paths
- ✅ No `delegatecall` to user input
- ✅ Solidity `^0.8.24` — built-in overflow checks
- ⚠️ Pending: formal audit (out of scope for solo build; planned with grant funds)

## Troubleshooting

- **`forge install` hangs**: try `--no-git` flag (skips submodule init), or set `git config --global protocol.file.allow always`.
- **`forge build` fails on Windows**: run inside WSL or PowerShell as admin; native Windows Foundry is best-effort.
- **Saigon RPC timeouts**: try the alternate endpoint `https://saigon-testnet-rpc.roninchain.com` (load-balanced).
