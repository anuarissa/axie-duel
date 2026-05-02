// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxsTokenMock} from "../src/AxsTokenMock.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract AxsTokenMockTest is Test {
    AxsTokenMock internal axs;
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal stranger = address(0xCAFE);

    function setUp() public {
        vm.prank(admin);
        axs = new AxsTokenMock(admin);
    }

    function test_AdminCanMint() public {
        vm.prank(admin);
        axs.mint(user, 1000 ether);
        assertEq(axs.balanceOf(user), 1000 ether);
    }

    function test_StrangerCannotMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                axs.MINTER_ROLE()
            )
        );
        vm.prank(stranger);
        axs.mint(user, 1 ether);
    }

    function test_UserCanBurnOwnTokens() public {
        vm.prank(admin);
        axs.mint(user, 1000 ether);

        vm.prank(user);
        axs.burn(500 ether);
        assertEq(axs.balanceOf(user), 500 ether);
        assertEq(axs.totalSupply(), 500 ether);
    }

    function test_BurnWithReasonEmitsEvent() public {
        vm.prank(admin);
        axs.mint(user, 100 ether);

        vm.expectEmit(true, false, false, true);
        emit AxsTokenMock.AxsBurned(user, 50 ether, "mint:premium-card");
        vm.prank(user);
        axs.burnWithReason(50 ether, "mint:premium-card");
    }
}
