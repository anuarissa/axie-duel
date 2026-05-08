// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AxieDuelCardNFT} from "../src/AxieDuelCardNFT.sol";
import {AxieDuelToken} from "../src/AxieDuelToken.sol";
import {AxsTokenMock} from "../src/AxsTokenMock.sol";

/**
 * @notice Deploy script for Ronin Saigon testnet (chainId 2021).
 *
 * Prerequisites:
 *   1. Foundry installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
 *   2. Saigon RON in deployer wallet (get from https://faucet.roninchain.com/)
 *   3. .env set with: DEPLOYER_PRIVATE_KEY, SAIGON_RPC_URL
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url saigon \
 *     --broadcast \
 *     -vvvv
 *
 * Output: deployed contract addresses are logged with the markers below so they
 * can be grep'd from CI logs and copy-pasted into apps/web/.env.production.
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(pk);

        console.log("=== Axie Duel deploy to Saigon testnet ===");
        console.log("Deployer:", admin);
        console.log("ChainId:", block.chainid);

        vm.startBroadcast(pk);

        // 1. Mock AXS token (used until Sky Mavis grants real $AXS contract on mainnet).
        AxsTokenMock axs = new AxsTokenMock(admin);
        console.log("DEPLOYED:AxsTokenMock:", address(axs));

        // 2. ERC-20 in-game soft-currency (capped 1B). May be retired in favor of pure $AXS.
        AxieDuelToken token = new AxieDuelToken(admin, 1_000_000_000 ether);
        console.log("DEPLOYED:AxieDuelToken:", address(token));

        // 3. ERC-721 game cards (Spells/Traps + future Axie-derived premium drops).
        AxieDuelCardNFT nft = new AxieDuelCardNFT(admin);
        console.log("DEPLOYED:AxieDuelCardNFT:", address(nft));

        vm.stopBroadcast();

        console.log("=== Deploy complete ===");
        console.log("Next: copy addresses to apps/web/.env.production and packages/contracts/deployed-addresses.json");
    }
}
