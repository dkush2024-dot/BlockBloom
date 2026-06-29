// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./Treasury.sol";

contract Election is Ownable {
    string public name;
    uint256 public proposalCount;
    Treasury public treasury;
    uint256 public quorumVotes; // Absolute number of votes required to pass a proposal
    bytes32 public merkleRoot; // Root of the Merkle tree of whitelisted voters

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
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

    event ProposalCreated(uint256 id, address proposer, string description, uint256 endTime, address target, uint256 value);
    event VoteCast(uint256 proposalId, address voter, uint256 optionIndex);
    event ProposalQueued(uint256 proposalId, bytes32 timelockTxId);
    event ProposalExecuted(uint256 proposalId);
    event ProposalCancelled(uint256 proposalId);
    event MerkleRootUpdated(bytes32 newRoot);

    constructor(
        string memory _name,
        uint256 _timelockDelay,
        uint256 _quorumVotes,
        address _admin
    ) Ownable(_admin) {
        name = _name;
        quorumVotes = _quorumVotes;
        // Each Election automatically gets its own Treasury with the specified timelock delay
        treasury = new Treasury(address(this), _timelockDelay);
    }

    /// @notice Set the Merkle Root for the voter whitelist. Only callable by the Election Admin.
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
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
        // We no longer check for a proposal threshold using tokens.
        // Instead, we verify the creator is whitelisted or simply allow the admin to create proposals.
        // To keep it open to any verified student, we can just require a proof, OR 
        // to simplify, only the owner (admin) can create proposals in real elections.
        // Let's assume only the Admin can create proposals for this Election instance.
        require(msg.sender == owner(), "Only Admin can create proposals");
        require(_options.length > 1, "Must have at least 2 options");

        proposalCount++;
        uint256 currentId = proposalCount;

        Proposal storage newProposal = proposals[currentId];
        newProposal.id = currentId;
        newProposal.proposer = msg.sender;
        newProposal.description = _description;
        newProposal.endTime = block.timestamp + (_durationMinutes * 1 minutes);
        newProposal.executed = false;
        newProposal.optionNames = _options;
        newProposal.optionVotes = new uint256[](_options.length);
        newProposal.target = _target;
        newProposal.value = _value;

        emit ProposalCreated(currentId, msg.sender, _description, newProposal.endTime, _target, _value);

        return currentId;
    }

    /// @notice Vote on a proposal using a Merkle Proof to verify eligibility
    function vote(uint256 _proposalId, uint256 _optionIndex, bytes32[] calldata _merkleProof) public {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");

        Proposal storage p = proposals[_proposalId];
        require(block.timestamp <= p.endTime, "Voting has ended");
        require(!hasVoted[_proposalId][msg.sender], "Already voted on this proposal");
        require(_optionIndex < p.optionNames.length, "Invalid option index");
        require(merkleRoot != bytes32(0), "Voter whitelist not set");

        // Verify the voter is in the Merkle tree
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
        require(MerkleProof.verify(_merkleProof, merkleRoot, leaf), "Not whitelisted to vote");

        // Record the vote
        hasVoted[_proposalId][msg.sender] = true;
        p.optionVotes[_optionIndex] += 1; // 1 Student = 1 Vote

        emit VoteCast(_proposalId, msg.sender, _optionIndex);
    }

    /// @notice Execute a passed proposal. Identifies the winning option dynamically.
    ///         For financial proposals, it queues the transaction in the Treasury's timelock
    ///         only if Option 0 (e.g., "Approve") wins.
    function executeProposal(uint256 _proposalId) public {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal ID");

        Proposal storage p = proposals[_proposalId];
        require(block.timestamp > p.endTime, "Voting has not ended yet");
        require(!p.executed, "Proposal already executed");

        uint256 winningVotes = 0;
        uint256 winningOptionIndex = 0;
        uint256 totalVotes = 0;
        uint256 numOptions = p.optionVotes.length;

        for (uint256 i = 0; i < numOptions; i++) {
            uint256 votes = p.optionVotes[i];
            totalVotes += votes;
            if (votes > winningVotes) {
                winningVotes = votes;
                winningOptionIndex = i;
            }
        }
        require(totalVotes > 0, "No votes were cast");

        // Enforce absolute quorum votes
        require(totalVotes >= quorumVotes, "Quorum not met");

        p.executed = true;

        // If this is a financial proposal, queue the transaction in the Treasury
        // Note: Financial proposals only queue if Option 0 ("Approve") won.
        if (p.target != address(0) && p.value > 0 && winningOptionIndex == 0) {
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

    /// @notice Cancel a proposal. Only the proposer can cancel, and only before voting ends.
    function cancelProposal(uint256 _proposalId) public {
        Proposal storage p = proposals[_proposalId];
        require(msg.sender == p.proposer, "Only proposer can cancel");
        require(block.timestamp < p.endTime, "Voting already ended");
        require(!p.executed, "Already executed");
        
        p.endTime = block.timestamp - 1; // Expire immediately
        emit ProposalCancelled(_proposalId);
    }

    function getProposal(uint256 _proposalId) public view returns (
        uint256 id,
        address proposer,
        string memory description,
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
            p.endTime,
            p.executed,
            p.optionNames,
            p.optionVotes,
            p.target,
            p.value
        );
    }
}
