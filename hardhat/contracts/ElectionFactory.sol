// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Election.sol";

contract ElectionFactory {
    // Mapping from organization ID (string) to their deployed elections
    mapping(string => address[]) public orgElections;
    
    // Global list of all deployed elections
    address[] public allElections;

    event ElectionCreated(
        string orgId,
        address indexed electionAddress,
        address indexed treasuryAddress,
        string name,
        uint256 timelockDelay,
        uint256 quorumVotes,
        address creator
    );

    /// @notice Deploy a new Election for a specific Organization
    /// @param _orgId The MongoDB string ID representing the Organization
    /// @param _name The name of the Election
    /// @param _timelockDelay Time (in seconds) that financial transactions must wait before execution
    /// @param _quorumVotes Absolute number of votes required to pass a proposal
    /// @param _backendAdmin The address of the backend admin wallet
    function createElection(
        string memory _orgId,
        string memory _name,
        uint256 _timelockDelay,
        uint256 _quorumVotes,
        address _backendAdmin
    ) public returns (address) {
        // Deploy the new election: owner is msg.sender, backendAdmin is _backendAdmin
        Election newElection = new Election(_name, _timelockDelay, _quorumVotes, msg.sender, _backendAdmin);
        address electionAddress = address(newElection);
        
        // Track the election globally and per-organization
        orgElections[_orgId].push(electionAddress);
        allElections.push(electionAddress);

        emit ElectionCreated(
            _orgId,
            electionAddress,
            address(newElection.treasury()),
            _name,
            _timelockDelay,
            _quorumVotes,
            msg.sender
        );

        return electionAddress;
    }

    /// @notice Get all elections deployed by a specific organization
    /// @param _orgId The organization ID
    function getElectionsByOrg(string memory _orgId) public view returns (address[] memory) {
        return orgElections[_orgId];
    }
    
    /// @notice Get all deployed elections across the platform
    function getAllElections() public view returns (address[] memory) {
        return allElections;
    }
}
