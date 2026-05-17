// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract Governance {
    string public name;
    uint256 public proposalCount;
    ERC20Votes public bloomToken;
    uint256 public proposalThreshold; // Minimum tokens required to create a proposal

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        uint256 snapshotBlock; // The block number representing the voting power snapshot
        uint256 endTime;
        bool executed;
        string[] optionNames;
        uint256[] optionVotes;
    }

    mapping(uint256 => Proposal) private proposals;
    // proposalId => wallet => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 id, address proposer, string description, uint256 snapshotBlock, uint256 endTime);
    event VoteCast(uint256 proposalId, address voter, uint256 optionIndex, uint256 weight);

    constructor(string memory _name, address _tokenAddress, uint256 _proposalThreshold) {
        name = _name;
        bloomToken = ERC20Votes(_tokenAddress);
        proposalThreshold = _proposalThreshold;
    }

    function createProposal(
        string memory _description,
        uint256 _durationMinutes,
        string[] memory _options
    ) public returns (uint256) {
        // Check proposal threshold using getVotes to get current voting power
        require(bloomToken.getVotes(msg.sender) >= proposalThreshold, "Voting power below proposal threshold");
        require(_options.length > 1, "Must have at least 2 options");
        
        proposalCount++;
        uint256 currentId = proposalCount;
        
        Proposal storage newProposal = proposals[currentId];
        newProposal.id = currentId;
        newProposal.proposer = msg.sender;
        newProposal.description = _description;
        // Snapshot block is the current block. Voting can begin in the next block.
        newProposal.snapshotBlock = block.number;
        newProposal.endTime = block.timestamp + (_durationMinutes * 1 minutes);
        newProposal.executed = false;
        newProposal.optionNames = _options;
        newProposal.optionVotes = new uint256[](_options.length);
        
        emit ProposalCreated(currentId, msg.sender, _description, newProposal.snapshotBlock, newProposal.endTime);
        
        return currentId;
    }

    function vote(uint256 _proposalId, uint256 _optionIndex) public {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");
        
        Proposal storage p = proposals[_proposalId];
        require(block.number > p.snapshotBlock, "Voting starts in the block after proposal creation");
        require(block.timestamp <= p.endTime, "Voting has ended");
        require(!hasVoted[_proposalId][msg.sender], "Already voted on this proposal");
        require(_optionIndex < p.optionNames.length, "Invalid option index");
        
        // Calculate voting weight based on the snapshot at snapshotBlock
        uint256 weight = bloomToken.getPastVotes(msg.sender, p.snapshotBlock);
        require(weight > 0, "No voting power");

        hasVoted[_proposalId][msg.sender] = true;
        p.optionVotes[_optionIndex] += weight;
        
        emit VoteCast(_proposalId, msg.sender, _optionIndex, weight);
    }

    function getProposal(uint256 _proposalId) public view returns (
        uint256 id,
        address proposer,
        string memory description,
        uint256 snapshotBlock,
        uint256 endTime,
        bool executed,
        string[] memory optionNames,
        uint256[] memory optionVotes
    ) {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");
        Proposal storage p = proposals[_proposalId];
        return (
            p.id,
            p.proposer,
            p.description,
            p.snapshotBlock,
            p.endTime,
            p.executed,
            p.optionNames,
            p.optionVotes
        );
    }
}
