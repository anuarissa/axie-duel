# @axie-duel/contracts

Smart contracts del juego en Solidity 0.8.24 + Foundry.

## Setup (NO ejecutado en Fase 0)

Se ejecuta cuando se llegue a Fase 6 del roadmap:

```bash
# 1. Instalar Foundry (Windows: usar foundryup en PowerShell)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Instalar deps Solidity (libs/openzeppelin-contracts y forge-std)
cd packages/contracts
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

# 3. Build & test
forge build
forge test -vv
```

## Deploy a Saigon Testnet

```bash
# 1. Conseguir RON de testnet: https://faucet.roninchain.com/
# 2. Setear DEPLOYER_PRIVATE_KEY en .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url saigon \
  --broadcast \
  -vvvv
```

## Contratos

- **`AxieDuelCardNFT.sol`** — ERC-721 con `MINTER_ROLE`/`PAUSER_ROLE` (OpenZeppelin AccessControl). Acuña cartas Premium dropeadas en Ranked Premium.
- **`AxieDuelToken.sol`** — ERC-20 capped con cap inicial 1B `$DUEL`. **Decisión pendiente:** podríamos NO desplegarlo y operar solo con RON. Ver master prompt sección 16.

## Auditoría

Antes de mainnet: auditoría externa obligatoria. Recomendado: OpenZeppelin Defender + un auditor de Solidity con experiencia en Ronin.
