// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxieDuelToken} from "../src/AxieDuelToken.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract AxieDuelTokenTest is Test {
    AxieDuelToken internal token;
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    uint256 internal constant CAP = 1_000_000_000 ether;

    function setUp() public {
        vm.prank(admin);
        token = new AxieDuelToken(admin, CAP);
    }

    function test_MintRespectsCap() public {
        vm.prank(admin);
        token.mint(user, 1000 ether);
        assertEq(token.balanceOf(user), 1000 ether);
        assertEq(token.totalSupply(), 1000 ether);
    }

    function test_RevertsWhenExceedsCap() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ERC20Capped.ERC20ExceededCap.selector, CAP + 1, CAP));
        token.mint(user, CAP + 1);
    }
}
