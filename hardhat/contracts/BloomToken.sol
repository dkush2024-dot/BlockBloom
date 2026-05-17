// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract BloomToken is ERC20, ERC20Permit, ERC20Votes {
    constructor(uint256 initialSupply) ERC20("BlockBloom Token", "BLOOM") ERC20Permit("BlockBloom Token") {
        // Mint initial supply to the deployer (Admin)
        // initialSupply should be specified in wei (e.g., 1000 * 10**18)
        _mint(msg.sender, initialSupply);
    }

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
