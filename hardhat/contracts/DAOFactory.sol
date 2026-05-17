// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Governance.sol";

contract DAOFactory {
    address[] public deployedDAOs;

    event DAOCreated(address indexed daoAddress, string name, address indexed tokenAddress, uint256 proposalThreshold, address indexed creator);

    function createDAO(string memory _name, address _tokenAddress, uint256 _proposalThreshold) public returns (address) {
        Governance newDAO = new Governance(_name, _tokenAddress, _proposalThreshold);
        address daoAddress = address(newDAO);
        deployedDAOs.push(daoAddress);
        
        emit DAOCreated(daoAddress, _name, _tokenAddress, _proposalThreshold, msg.sender);
        
        return daoAddress;
    }
    
    function getDeployedDAOs() public view returns (address[] memory) {
        return deployedDAOs;
    }
}
