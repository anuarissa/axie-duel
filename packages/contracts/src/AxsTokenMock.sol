// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  AxsTokenMock ($AXSM)
 * @notice ERC-20 mock para representar AXS mientras Sky Mavis no nos da partnership
 *         con su token real. Soporta `burn()` y `burnFrom()` (vía ERC20Burnable),
 *         y mint controlado por MINTER_ROLE (backend del juego para distribuir
 *         recompensas de torneos / daily quests).
 *
 * @dev    Cuando obtengamos el AXS real (mainnet: 0x97a9107c1793bc407d6f527b77e7fff4d812bece),
 *         ESTE contrato se DEPRECA. La interfaz pública del backend (AxsService) no cambia:
 *         solo se cambia AXS_TOKEN_ADDRESS en .env y el flag AXS_MODE.
 */
contract AxsTokenMock is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    event AxsMinted(address indexed to, uint256 amount, string reason);
    event AxsBurned(address indexed from, uint256 amount, string reason);

    constructor(address admin) ERC20("Axie Infinity Shards (Mock)", "AXSM") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit AxsMinted(to, amount, "");
    }

    function mintWithReason(address to, uint256 amount, string calldata reason) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit AxsMinted(to, amount, reason);
    }

    function burnWithReason(uint256 amount, string calldata reason) external {
        _burn(_msgSender(), amount);
        emit AxsBurned(_msgSender(), amount, reason);
    }
}
