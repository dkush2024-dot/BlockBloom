// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Governance.sol";

contract DAOFactory {
    address[] public deployedDAOs;

    event DAOCreated(
        address indexed daoAddress,
        address indexed treasuryAddress,
        string name,
        address indexed tokenAddress,
        uint256 proposalThreshold,
        uint256 timelockDelay,
        uint256 quorumPercentage,
        address creator
    );

    /// @notice Deploy a new DAO with its own Treasury
    /// @param _name The name of the DAO
    /// @param _tokenAddress The ERC20Votes token used for governance
    /// @param _proposalThreshold Minimum tokens required to create a proposal
    /// @param _timelockDelay Time (in seconds) that financial transactions must wait before execution
    /// @param _quorumPercentage Percentage of total supply required to vote (e.g. 10 for 10%)
    function createDAO(
        string memory _name,
        address _tokenAddress,
        uint256 _proposalThreshold,
        uint256 _timelockDelay,
        uint256 _quorumPercentage
    ) public returns (address) {
        Governance newDAO = new Governance(_name, _tokenAddress, _proposalThreshold, _timelockDelay, _quorumPercentage);
        address daoAddress = address(newDAO);
        deployedDAOs.push(daoAddress);

        emit DAOCreated(
            daoAddress,
            address(newDAO.treasury()),
            _name,
            _tokenAddress,
            _proposalThreshold,
            _timelockDelay,
            _quorumPercentage,
            msg.sender
        );

        return daoAddress;
    }

    function getDeployedDAOs() public view returns (address[] memory) {
        return deployedDAOs;
    }
}
