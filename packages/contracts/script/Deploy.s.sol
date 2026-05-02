// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AxieDuelCardNFT} from "../src/AxieDuelCardNFT.sol";
import {AxieDuelToken} from "../src/AxieDuelToken.sol";
import {AxsTokenMock} from "../src/AxsTokenMock.sol";

/**
 * @notice Deploy script para Ronin Saigon Testnet.
 * Uso:
 *   forge script script/Deploy.s.sol:Deploy --rpc-url saigon --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(pk);

        vm.startBroadcast(pk);

        AxieDuelCardNFT nft = new AxieDuelCardNFT(admin);
        console.log("AxieDuelCardNFT:", address(nft));

        AxieDuelToken token = new AxieDuelToken(admin, 1_000_000_000 ether);
        console.log("AxieDuelToken:", address(token));

        AxsTokenMock axs = new AxsTokenMock(admin);
        console.log("AxsTokenMock:", address(axs));

        vm.stopBroadcast();
    }
}
