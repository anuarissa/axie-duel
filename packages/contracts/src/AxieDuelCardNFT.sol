// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  AxieDuelCardNFT
 * @notice ERC-721 para drops Premium del juego Axie Duel (cartas mintadas como NFT en Ronin).
 *         Solo direcciones con MINTER_ROLE pueden acuñar. El backend del juego firma transacciones
 *         desde una wallet hot con MINTER_ROLE para acuñar al jugador tras un drop verificado server-side.
 * @dev    Diseñado para Ronin Saigon Testnet primero, Ronin Mainnet tras auditoría.
 */
contract AxieDuelCardNFT is ERC721, ERC721URIStorage, ERC721Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    event CardMinted(address indexed to, uint256 indexed tokenId, string uri);

    constructor(address admin) ERC721("Axie Duel Card", "AXDC") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /**
     * @notice Acuña una carta NFT al jugador.
     * @dev    Reentrancy-safe gracias a no callbacks. Solo MINTER_ROLE puede invocar.
     */
    function safeMint(address to, uint256 tokenId, string memory uri) external onlyRole(MINTER_ROLE) {
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit CardMinted(to, tokenId, uri);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ── Overrides requeridos por ERC721URIStorage + ERC721Pausable ──

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Pausable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
