// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleVoting {
    address public owner;

    struct Candidate {
        string name;
        string partySymbol;
        uint256 votes;
    }

    mapping(uint256 => Candidate) public candidates;
    mapping(address => bool) public voters;
    uint256 public totalCandidates = 0;
    bool public registrationOpen = true;

    // Set the deployer as the admin/owner
    constructor() {
        owner = msg.sender;
    }

    // Modifier: only the owner can call functions marked with this
    modifier onlyOwner() {
        require(msg.sender == owner, "Only the admin can do this");
        _;
    }

    // Admin registers a new candidate with a name and party symbol
    function addCandidate(string memory name, string memory partySymbol) public onlyOwner {
        require(registrationOpen, "Candidate registration is closed");
        totalCandidates++;
        candidates[totalCandidates] = Candidate(name, partySymbol, 0);
    }

    // Admin can close registration to prevent new candidates being added
    function closeRegistration() public onlyOwner {
        registrationOpen = false;
    }

    // Admin can reopen registration
    function openRegistration() public onlyOwner {
        registrationOpen = true;
    }

    function vote(uint256 candidateId) public {
        require(!registrationOpen, "Voting hasn't started yet. Registration is still open.");
        require(!voters[msg.sender], "You have already voted");
        require(candidateId > 0 && candidateId <= totalCandidates, "Invalid candidate ID");

        voters[msg.sender] = true;
        candidates[candidateId].votes++;
    }

    function getWinner() public view returns (string memory winnerName, string memory winnerSymbol, uint256 winnerVotes) {
        uint256 maxVotes = 0;
        uint256 winnerId = 0;

        for (uint256 i = 1; i <= totalCandidates; i++) {
            if (candidates[i].votes > maxVotes) {
                maxVotes = candidates[i].votes;
                winnerId = i;
            }
        }
        winnerName = candidates[winnerId].name;
        winnerSymbol = candidates[winnerId].partySymbol;
        winnerVotes = candidates[winnerId].votes;
    }
}
