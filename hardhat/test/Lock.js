const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("SimpleVoting", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployVotingFixture() {
    const [owner, otherAccount, voter1, voter2] = await ethers.getSigners();

    const SimpleVoting = await ethers.getContractFactory("SimpleVoting");
    const voting = await SimpleVoting.deploy();

    return { voting, owner, otherAccount, voter1, voter2 };
  }

  describe("Deployment & Initialization", function () {
    it("Should set the right owner", async function () {
      const { voting, owner } = await loadFixture(deployVotingFixture);
      expect(await voting.owner()).to.equal(owner.address);
    });

    it("Should initialize with 0 candidates", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      expect(await voting.totalCandidates()).to.equal(0);
    });

    it("Should initialize with registration open", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      expect(await voting.registrationOpen()).to.be.true;
    });
  });

  describe("Candidate Registration", function () {
    it("Should allow the owner to add a candidate when registration is open", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      
      await voting.addCandidate("Alice", "ALC");
      
      expect(await voting.totalCandidates()).to.equal(1);
      
      const candidate = await voting.candidates(1);
      expect(candidate.name).to.equal("Alice");
      expect(candidate.partySymbol).to.equal("ALC");
      expect(candidate.votes).to.equal(0);
    });

    it("Should not allow non-owners to add a candidate", async function () {
      const { voting, otherAccount } = await loadFixture(deployVotingFixture);
      
      await expect(voting.connect(otherAccount).addCandidate("Bob", "BOB"))
        .to.be.revertedWith("Only the admin can do this");
    });

    it("Should not allow adding a candidate if registration is closed", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      
      await voting.closeRegistration();
      
      await expect(voting.addCandidate("Charlie", "CHL"))
        .to.be.revertedWith("Candidate registration is closed");
    });
  });

  describe("Registration Toggling", function () {
    it("Should allow the owner to close registration", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      
      await voting.closeRegistration();
      expect(await voting.registrationOpen()).to.be.false;
    });

    it("Should not allow non-owners to toggle registration", async function () {
      const { voting, otherAccount } = await loadFixture(deployVotingFixture);
      
      await expect(voting.connect(otherAccount).closeRegistration())
        .to.be.revertedWith("Only the admin can do this");
    });
  });

  describe("Voting", function () {
    async function deployVotingAndRegisterCandidatesFixture() {
      const { voting, owner, otherAccount, voter1, voter2 } = await deployVotingFixture();
      
      // Register candidates
      await voting.addCandidate("Alice", "ALC");
      await voting.addCandidate("Bob", "BOB");
      
      return { voting, owner, otherAccount, voter1, voter2 };
    }

    it("Should not allow voting if registration is still open", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingAndRegisterCandidatesFixture);
      
      await expect(voting.connect(voter1).vote(1))
        .to.be.revertedWith("Voting hasn't started yet. Registration is still open.");
    });

    it("Should allow users to vote and correctly record the vote", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingAndRegisterCandidatesFixture);
      
      await voting.closeRegistration();
      
      await voting.connect(voter1).vote(1);
      
      const candidate1 = await voting.candidates(1);
      expect(candidate1.votes).to.equal(1);
      
      expect(await voting.voters(voter1.address)).to.be.true;
    });

    it("Should revert if a user tries to vote twice", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingAndRegisterCandidatesFixture);
      
      await voting.closeRegistration();
      
      await voting.connect(voter1).vote(1);
      
      await expect(voting.connect(voter1).vote(2))
        .to.be.revertedWith("You have already voted");
    });

    it("Should revert if a user tries to vote for an invalid candidate ID", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingAndRegisterCandidatesFixture);
      
      await voting.closeRegistration();
      
      await expect(voting.connect(voter1).vote(0))
        .to.be.revertedWith("Invalid candidate ID");
        
      await expect(voting.connect(voter1).vote(3)) // Only 2 candidates registered
        .to.be.revertedWith("Invalid candidate ID");
    });
  });

  describe("Getting Results", function () {
    async function deployVotingAndCastVotesFixture() {
      const { voting, owner, otherAccount, voter1, voter2 } = await deployVotingFixture();
      
      // Register candidates
      await voting.addCandidate("Alice", "ALC");
      await voting.addCandidate("Bob", "BOB");
      await voting.addCandidate("Charlie", "CHL");
      
      await voting.closeRegistration();
      
      // voter1 and voter2 vote for Bob (ID 2), otherAccount votes for Charlie (ID 3)
      await voting.connect(voter1).vote(2);
      await voting.connect(voter2).vote(2);
      await voting.connect(otherAccount).vote(3);
      
      return { voting, owner, otherAccount, voter1, voter2 };
    }

    it("Should correctly identify the winner", async function () {
      const { voting } = await loadFixture(deployVotingAndCastVotesFixture);
      
      const [winnerName, winnerSymbol, winnerVotes] = await voting.getWinner();
      
      expect(winnerName).to.equal("Bob");
      expect(winnerSymbol).to.equal("BOB");
      expect(winnerVotes).to.equal(2);
    });

    it("Should handle ties correctly by returning a Tie flag", async function () {
      const { voting, owner, otherAccount, voter1, voter2 } = await loadFixture(deployVotingFixture);
      
      await voting.addCandidate("Alice", "ALC");
      await voting.addCandidate("Bob", "BOB");
      
      await voting.closeRegistration();
      
      // Tie: 1 vote for Alice, 1 vote for Bob
      await voting.connect(voter1).vote(1);
      await voting.connect(voter2).vote(2);
      
      const [winnerName, winnerSymbol, winnerVotes, isTie] = await voting.getWinner();
      
      expect(winnerName).to.equal("Tie");
      expect(winnerSymbol).to.equal("TIE");
      expect(winnerVotes).to.equal(1);
      expect(isTie).to.be.true;
    });
  });
});
