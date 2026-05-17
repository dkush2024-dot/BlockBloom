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

    // Admin removes an existing candidate during registration using swap-and-delete
    function removeCandidate(uint256 candidateId) public onlyOwner {
        require(registrationOpen, "Candidate registration is closed");
        require(candidateId > 0 && candidateId <= totalCandidates, "Invalid candidate ID");

        // Swap the candidate to be deleted with the last candidate in the mapping
        if (candidateId != totalCandidates) {
            candidates[candidateId] = candidates[totalCandidates];
        }
        
        // Delete the last element and decrement count
        delete candidates[totalCandidates];
        totalCandidates--;
    }

    // Admin can close registration to prevent new candidates being added
    function closeRegistration() public onlyOwner {
        registrationOpen = false;
    }

    function vote(uint256 candidateId) public {
        require(!registrationOpen, "Voting hasn't started yet. Registration is still open.");
        require(msg.sender != owner, "Admin is not allowed to vote in the election.");
        require(!voters[msg.sender], "You have already voted");
        require(candidateId > 0 && candidateId <= totalCandidates, "Invalid candidate ID");

        voters[msg.sender] = true;
        candidates[candidateId].votes++;
    }

    function getWinner() public view returns (string memory winnerName, string memory winnerSymbol, uint256 winnerVotes, bool isTie) {
        uint256 maxVotes = 0;
        uint256 winnerId = 0;
        bool tie = false;

        for (uint256 i = 1; i <= totalCandidates; i++) {
            if (candidates[i].votes > maxVotes) {
                maxVotes = candidates[i].votes;
                winnerId = i;
                tie = false;
            } else if (candidates[i].votes == maxVotes && maxVotes > 0) {
                tie = true;
            }
        }
        
        if (tie) {
            return ("Tie", "TIE", maxVotes, true);
        } else if (winnerId != 0) {
            return (candidates[winnerId].name, candidates[winnerId].partySymbol, candidates[winnerId].votes, false);
        } else {
            return ("None", "NONE", 0, false);
        }
    }
}
