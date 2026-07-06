const { loadFixture, time, mine } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("Election & Treasury (Phase 3)", function () {

  // ─── SHARED FIXTURE ─────────────────────────────────────────────────
  async function deployContractsFixture() {
    const [owner, user1, user2, user3, recipient] = await ethers.getSigners();

    // Deploy Factory
    const ElectionFactory = await ethers.getContractFactory("ElectionFactory");
    const factory = await ElectionFactory.deploy();

    // Generate Merkle Tree for whitelisted voters using single hashing to match Election.sol
    const addresses = [user1.address.toLowerCase(), user2.address.toLowerCase()];
    const leaves = addresses.map(addr => keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr])));
    const mTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const merkleRoot = mTree.getHexRoot();

    // Mock OZ StandardMerkleTree interface using merkletreejs
    const tree = {
      root: merkleRoot,
      getProof: (value) => {
        const addr = Array.isArray(value) ? value[0] : value;
        const leaf = keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr.toLowerCase()]));
        return mTree.getHexProof(leaf);
      }
    };

    return { factory, owner, user1, user2, user3, recipient, tree, merkleRoot };
  }

  // ─── ELECTION FACTORY TESTS ─────────────────────────────────────────
  describe("ElectionFactory", function () {
    it("Should deploy Election contracts and track them by orgId", async function () {
      const { factory, user1 } = await loadFixture(deployContractsFixture);
      const timelockDelay = 60; // 60 seconds for testing
      const quorumVotes = 2;

      await factory.connect(user1).createElection("org_123", "Student Council", timelockDelay, quorumVotes, user1.address);
      await factory.connect(user1).createElection("org_123", "President", timelockDelay, quorumVotes, user1.address);
      await factory.connect(user1).createElection("org_456", "Clubs", timelockDelay, quorumVotes, user1.address);

      const org1Elections = await factory.getElectionsByOrg("org_123");
      expect(org1Elections.length).to.equal(2);
      
      const org2Elections = await factory.getElectionsByOrg("org_456");
      expect(org2Elections.length).to.equal(1);
      
      const allElections = await factory.getAllElections();
      expect(allElections.length).to.equal(3);

      const Election = await ethers.getContractFactory("Election");
      const election = Election.attach(org1Elections[0]);

      expect(await election.name()).to.equal("Student Council");
      expect(await election.owner()).to.equal(user1.address); // The creator is the admin

      // Verify Treasury was auto-deployed
      const treasuryAddr = await election.treasury();
      expect(treasuryAddr).to.not.equal(ethers.ZeroAddress);
    });
  });

  // ─── ELECTION + TREASURY FLOW TESTS ───────────────────────────────
  describe("Election & Treasury Integration", function () {
    const TIMELOCK_DELAY = 60; // 60 seconds for testing

    async function deployElectionFixture() {
      const { factory, owner, user1, user2, user3, recipient, tree, merkleRoot } = await deployContractsFixture();
      const quorumVotes = 2; // Need both user1 and user2 to vote

      // user1 creates the election, so user1 is the admin
      await factory.connect(user1).createElection("org_treasury", "Treasury Election", TIMELOCK_DELAY, quorumVotes, user1.address);
      const elections = await factory.getElectionsByOrg("org_treasury");

      const Election = await ethers.getContractFactory("Election");
      const election = Election.attach(elections[0]);

      // Set the Merkle Root
      await election.connect(user1).setMerkleRoot(merkleRoot);

      const Treasury = await ethers.getContractFactory("Treasury");
      const treasury = Treasury.attach(await election.treasury());

      return { election, treasury, owner, user1, user2, user3, recipient, tree, merkleRoot };
    }

    it("Should allow sending ETH to the Treasury", async function () {
      const { treasury, owner } = await loadFixture(deployElectionFixture);
      const treasuryAddr = await treasury.getAddress();

      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });
      expect(await treasury.getBalance()).to.equal(ethers.parseEther("5"));
    });

    it("Should allow the admin to create a financial proposal", async function () {
      const { election, user1, recipient } = await loadFixture(deployElectionFixture);
      const options = ["Approve", "Reject"];

      await election.connect(user1).createFinancialProposal(
        "Send 1 ETH to recipient",
        10, // 10 minutes
        options,
        recipient.address,
        ethers.parseEther("1")
      );

      expect(await election.proposalCount()).to.equal(1);
      const proposal = await election.getProposal(1);
      expect(proposal.target).to.equal(recipient.address);
      expect(proposal.value).to.equal(ethers.parseEther("1"));
    });

    it("Should NOT allow a non-admin to create a proposal", async function () {
      const { election, user2, recipient } = await loadFixture(deployElectionFixture);
      
      await expect(election.connect(user2).createFinancialProposal(
        "Send 1 ETH to recipient",
        10,
        ["Approve", "Reject"],
        recipient.address,
        ethers.parseEther("1")
      )).to.be.revertedWith("Only Admin can create proposals");
    });

    it("Should allow whitelisted users to vote exactly once using Merkle Proofs", async function () {
      const { election, user1, user2, recipient, tree } = await loadFixture(deployElectionFixture);

      await election.connect(user1).createFinancialProposal(
        "Test Vote", 10, ["Approve", "Reject"], recipient.address, ethers.parseEther("1")
      );

      // Get proofs
      const proofUser1 = tree.getProof([user1.address]);
      const proofUser2 = tree.getProof([user2.address]);

      // User 1 votes Approve
      await election.connect(user1).vote(1, 0, proofUser1);
      // User 2 votes Approve
      await election.connect(user2).vote(1, 0, proofUser2);

      // Verify they can't vote again
      await expect(election.connect(user1).vote(1, 0, proofUser1)).to.be.revertedWith("Already voted on this proposal");
      
      const proposal = await election.getProposal(1);
      expect(proposal.optionVotes[0]).to.equal(2);
    });

    it("Should reject non-whitelisted users from voting", async function () {
      const { election, user1, user3, recipient, tree } = await loadFixture(deployElectionFixture);

      await election.connect(user1).createFinancialProposal(
        "Test Vote", 10, ["Approve", "Reject"], recipient.address, ethers.parseEther("1")
      );

      // user3 tries to use user1's proof (which validates user1's address, not user3's)
      const proofUser1 = tree.getProof([user1.address]);

      await expect(election.connect(user3).vote(1, 0, proofUser1)).to.be.revertedWith("Not whitelisted to vote");
    });

    it("Should execute a passed financial proposal and queue it in the Timelock", async function () {
      const { election, treasury, owner, user1, user2, recipient, tree } = await loadFixture(deployElectionFixture);
      const treasuryAddr = await treasury.getAddress();

      // 1. Fund the Treasury
      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });

      // 2. Create financial proposal
      await election.connect(user1).createFinancialProposal(
        "Send 1 ETH", 10, ["Approve", "Reject"], recipient.address, ethers.parseEther("1")
      );

      // 3. Vote
      await election.connect(user1).vote(1, 0, tree.getProof([user1.address])); // Approve
      await election.connect(user2).vote(1, 0, tree.getProof([user2.address])); // Approve

      // 4. Fast-forward past the voting period
      await time.increase(11 * 60);

      // 5. Execute
      await election.executeProposal(1);
      const proposal = await election.getProposal(1);
      expect(proposal.executed).to.be.true;
    });

    it("Should finalize a proposal after the timelock delay", async function () {
      const { election, treasury, owner, user1, user2, recipient, tree } = await loadFixture(deployElectionFixture);
      const treasuryAddr = await treasury.getAddress();

      // Fund Treasury
      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });

      // Create & Vote
      await election.connect(user1).createFinancialProposal(
        "Send 2 ETH", 10, ["Approve", "Reject"], recipient.address, ethers.parseEther("2")
      );
      await election.connect(user1).vote(1, 0, tree.getProof([user1.address]));
      await election.connect(user2).vote(1, 0, tree.getProof([user2.address]));
      
      await time.increase(11 * 60);
      await election.executeProposal(1);

      // Fast-forward past the timelock delay
      await time.increase(TIMELOCK_DELAY + 1);

      const balanceBefore = await ethers.provider.getBalance(recipient.address);
      await election.finalizeProposal(1);
      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("2"));
    });

    it("Should mark proposal as executed but NOT queue in timelock if Option 0 did not win", async function () {
      const { election, user1, user2, recipient, tree } = await loadFixture(deployElectionFixture);

      await election.connect(user1).createFinancialProposal(
        "Should fail", 10, ["Approve", "Reject"], recipient.address, ethers.parseEther("1")
      );

      // Vote Reject
      await election.connect(user1).vote(1, 1, tree.getProof([user1.address]));
      await election.connect(user2).vote(1, 1, tree.getProof([user2.address]));
      
      await time.increase(11 * 60);

      // Execute proposal successfully
      await election.executeProposal(1);
      const proposal = await election.getProposal(1);
      expect(proposal.executed).to.be.true;
      
      // Timelock transaction should NOT be queued
      await expect(election.finalizeProposal(1)).to.be.revertedWith("Not a financial proposal");
    });

    it("Should revert execution if quorum is not met", async function () {
      const { election, user1, recipient, tree } = await loadFixture(deployElectionFixture);

      await election.connect(user1).createFinancialProposal(
        "Low turnout", 10, ["Approve", "Reject"], recipient.address, ethers.parseEther("1")
      );

      // Only user1 votes (1 vote). Quorum is 2.
      await election.connect(user1).vote(1, 0, tree.getProof([user1.address])); 
      
      await time.increase(11 * 60);

      await expect(election.executeProposal(1)).to.be.revertedWith("Quorum not met");
    });
  // ─── PAUSABLE TESTS ───────────────────────────────────────────────
  describe("Security: Pausable", function () {
    const TIMELOCK_DELAY = 60;

    async function deployElectionFixture() {
      const { factory, owner, user1, user2, user3, recipient, tree, merkleRoot } = await deployContractsFixture();
      const quorumVotes = 2;

      await factory.connect(user1).createElection("org_pausable", "Pausable Election", TIMELOCK_DELAY, quorumVotes, user1.address);
      const elections = await factory.getElectionsByOrg("org_pausable");

      const Election = await ethers.getContractFactory("Election");
      const election = Election.attach(elections[0]);
      
      await election.connect(user1).setMerkleRoot(merkleRoot);

      return { election, owner, user1, user2, tree };
    }

    it("Should allow the admin to pause and unpause the election", async function () {
      const { election, user1 } = await loadFixture(deployElectionFixture);
      
      await election.connect(user1).pause();
      expect(await election.paused()).to.be.true;

      await election.connect(user1).unpause();
      expect(await election.paused()).to.be.false;
    });

    it("Should block proposal creation and voting when paused", async function () {
      const { election, user1, user2, tree } = await loadFixture(deployElectionFixture);
      
      await election.connect(user1).pause();

      await expect(election.connect(user1).createProposal("Test", 10, ["A", "B"])).to.be.revertedWithCustomError(election, "EnforcedPause");

      // Unpause to create a proposal, then pause again to test voting
      await election.connect(user1).unpause();
      await election.connect(user1).createProposal("Test", 10, ["A", "B"]);
      await election.connect(user1).pause();

      const proofUser2 = tree.getProof([user2.address]);
      await expect(election.connect(user2).vote(1, 0, proofUser2)).to.be.revertedWithCustomError(election, "EnforcedPause");
    });
    
    it("Should NOT allow non-admins to pause", async function () {
      const { election, user2 } = await loadFixture(deployElectionFixture);
      await expect(election.connect(user2).pause()).to.be.revertedWithCustomError(election, "OwnableUnauthorizedAccount").withArgs(user2.address);
    });
  });
});
});
