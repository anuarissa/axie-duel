// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxieDuelCardNFT} from "../src/AxieDuelCardNFT.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract AxieDuelCardNFTTest is Test {
    AxieDuelCardNFT internal nft;
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal stranger = address(0xCAFE);

    function setUp() public {
        vm.prank(admin);
        nft = new AxieDuelCardNFT(admin);
    }

    function test_AdminCanMint() public {
        vm.prank(admin);
        nft.safeMint(user, 1, "ipfs://test");
        assertEq(nft.ownerOf(1), user);
        assertEq(nft.tokenURI(1), "ipfs://test");
    }

    function test_StrangerCannotMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                nft.MINTER_ROLE()
            )
        );
        vm.prank(stranger);
        nft.safeMint(user, 1, "ipfs://x");
    }

    function test_PauseBlocksTransfers() public {
        vm.prank(admin);
        nft.safeMint(user, 1, "ipfs://test");

        vm.prank(admin);
        nft.pause();

        vm.expectRevert();
        vm.prank(user);
        nft.transferFrom(user, stranger, 1);
    }
}
