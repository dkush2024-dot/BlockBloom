// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "./Treasury.sol";

contract Governance {
    string public name;
    uint256 public proposalCount;
    ERC20Votes public bloomToken;
    Treasury public treasury;
    uint256 public proposalThreshold; // Minimum tokens required to create a proposal
    uint256 public quorumPercentage; // Percentage of total token supply required to vote (e.g. 10 for 10%)

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        uint256 snapshotBlock; // The block number representing the voting power snapshot
        uint256 endTime;
        bool executed;
        string[] optionNames;
        uint256[] optionVotes;
        // Financial proposal fields (optional: set target to address(0) for non-financial)
        address payable target;
        uint256 value;
        bytes32 timelockTxId; // The ID of the queued transaction in the Treasury
    }

    mapping(uint256 => Proposal) private proposals;
    // proposalId => wallet => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 id, address proposer, string description, uint256 snapshotBlock, uint256 endTime, address target, uint256 value);
    event VoteCast(uint256 proposalId, address voter, uint256 optionIndex, uint256 weight);
    event ProposalQueued(uint256 proposalId, bytes32 timelockTxId);
    event ProposalExecuted(uint256 proposalId);

    constructor(string memory _name, address _tokenAddress, uint256 _proposalThreshold, uint256 _timelockDelay, uint256 _quorumPercentage) {
        name = _name;
        bloomToken = ERC20Votes(_tokenAddress);
        proposalThreshold = _proposalThreshold;
        quorumPercentage = _quorumPercentage;
        // Each DAO automatically gets its own Treasury with the specified timelock delay
        treasury = new Treasury(address(this), _timelockDelay);
    }

    /// @notice Create a standard (non-financial) proposal
    function createProposal(
        string memory _description,
        uint256 _durationMinutes,
        string[] memory _options
    ) public returns (uint256) {
        return _createProposal(_description, _durationMinutes, _options, payable(address(0)), 0);
    }

    /// @notice Create a financial proposal that, if passed, sends ETH from the Treasury
    function createFinancialProposal(
        string memory _description,
        uint256 _durationMinutes,
        string[] memory _options,
        address payable _target,
        uint256 _value
    ) public returns (uint256) {
        require(_target != address(0), "Target address cannot be zero");
        require(_value > 0, "Value must be greater than 0");
        return _createProposal(_description, _durationMinutes, _options, _target, _value);
    }

    /// @dev Internal function that handles both standard and financial proposal creation
    function _createProposal(
        string memory _description,
        uint256 _durationMinutes,
        string[] memory _options,
        address payable _target,
        uint256 _value
    ) internal returns (uint256) {
        require(bloomToken.getVotes(msg.sender) >= proposalThreshold, "Voting power below proposal threshold");
        require(_options.length > 1, "Must have at least 2 options");

        proposalCount++;
        uint256 currentId = proposalCount;

        Proposal storage newProposal = proposals[currentId];
        newProposal.id = currentId;
        newProposal.proposer = msg.sender;
        newProposal.description = _description;
        newProposal.snapshotBlock = block.number;
        newProposal.endTime = block.timestamp + (_durationMinutes * 1 minutes);
        newProposal.executed = false;
        newProposal.optionNames = _options;
        newProposal.optionVotes = new uint256[](_options.length);
        newProposal.target = _target;
        newProposal.value = _value;

        emit ProposalCreated(currentId, msg.sender, _description, newProposal.snapshotBlock, newProposal.endTime, _target, _value);

        return currentId;
    }

    function vote(uint256 _proposalId, uint256 _optionIndex) public {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");

        Proposal storage p = proposals[_proposalId];
        require(block.number > p.snapshotBlock, "Voting starts in the block after proposal creation");
        require(block.timestamp <= p.endTime, "Voting has ended");
        require(!hasVoted[_proposalId][msg.sender], "Already voted on this proposal");
        require(_optionIndex < p.optionNames.length, "Invalid option index");

        uint256 weight = bloomToken.getPastVotes(msg.sender, p.snapshotBlock);
        require(weight > 0, "No voting power");

        hasVoted[_proposalId][msg.sender] = true;
        p.optionVotes[_optionIndex] += weight;

        emit VoteCast(_proposalId, msg.sender, _optionIndex, weight);
    }

    /// @notice Execute a passed proposal. For financial proposals, this queues the
    ///         transaction in the Treasury's timelock. Option 0 must have the most votes.
    function executeProposal(uint256 _proposalId) public {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");

        Proposal storage p = proposals[_proposalId];
        require(block.timestamp > p.endTime, "Voting has not ended yet");
        require(!p.executed, "Proposal already executed");

        // Check that option 0 (e.g., "Yes" / "Approve") won and calculate total votes for quorum
        uint256 winningVotes = p.optionVotes[0];
        uint256 totalVotes = winningVotes;
        for (uint256 i = 1; i < p.optionVotes.length; i++) {
            require(winningVotes >= p.optionVotes[i], "Option 0 did not win");
            totalVotes += p.optionVotes[i];
        }
        require(winningVotes > 0, "No votes were cast");

        // Enforce Quorum
        uint256 totalSupplyAtSnapshot = bloomToken.getPastTotalSupply(p.snapshotBlock);
        uint256 requiredQuorum = (totalSupplyAtSnapshot * quorumPercentage) / 100;
        require(totalVotes >= requiredQuorum, "Quorum not met");

        p.executed = true;

        // If this is a financial proposal, queue the transaction in the Treasury
        if (p.target != address(0) && p.value > 0) {
            bytes32 txId = treasury.queueTransaction(p.target, p.value);
            p.timelockTxId = txId;
            emit ProposalQueued(_proposalId, txId);
        }

        emit ProposalExecuted(_proposalId);
    }

    /// @notice Finalize a financial proposal by executing the timelock transaction.
    ///         Anyone can call this after the timelock delay has passed.
    function finalizeProposal(uint256 _proposalId) public {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");

        Proposal storage p = proposals[_proposalId];
        require(p.executed, "Proposal has not been executed yet");
        require(p.timelockTxId != bytes32(0), "Not a financial proposal");

        treasury.executeTransaction(p.timelockTxId);
    }

    function getProposal(uint256 _proposalId) public view returns (
        uint256 id,
        address proposer,
        string memory description,
        uint256 snapshotBlock,
        uint256 endTime,
        bool executed,
        string[] memory optionNames,
        uint256[] memory optionVotes,
        address target,
        uint256 value
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
            p.optionVotes,
            p.target,
            p.value
        );
    }
}
