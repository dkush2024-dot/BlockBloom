const { loadFixture, time, mine } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Governance, Treasury & Tokenomics", function () {

  // ─── SHARED FIXTURE ─────────────────────────────────────────────────
  async function deployContractsFixture() {
    const [owner, user1, user2, user3, recipient] = await ethers.getSigners();

    // Deploy Token (10,000 BLOOM)
    const initialSupply = ethers.parseEther("10000");
    const BloomToken = await ethers.getContractFactory("BloomToken");
    const token = await BloomToken.deploy(initialSupply);

    // Deploy Factory
    const DAOFactory = await ethers.getContractFactory("DAOFactory");
    const factory = await DAOFactory.deploy();

    // Distribute tokens
    await token.transfer(user1.address, ethers.parseEther("1000"));
    await token.transfer(user2.address, ethers.parseEther("500"));
    // user3 gets 0 tokens

    // Delegate votes (required to activate voting power in ERC20Votes)
    await token.connect(owner).delegate(owner.address);
    await token.connect(user1).delegate(user1.address);
    await token.connect(user2).delegate(user2.address);

    return { token, factory, owner, user1, user2, user3, recipient };
  }

  // ─── ACCESS CONTROL (RBAC) TESTS ────────────────────────────────────
  describe("BloomToken — Access Control (RBAC)", function () {
    it("Should assign all roles to the deployer", async function () {
      const { token, owner } = await loadFixture(deployContractsFixture);
      const MINTER_ROLE = await token.MINTER_ROLE();
      const PAUSER_ROLE = await token.PAUSER_ROLE();
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();

      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await token.hasRole(MINTER_ROLE, owner.address)).to.be.true;
      expect(await token.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
    });

    it("Should allow MINTER_ROLE to mint new tokens", async function () {
      const { token, owner, user3 } = await loadFixture(deployContractsFixture);
      await token.connect(owner).mint(user3.address, ethers.parseEther("200"));
      expect(await token.balanceOf(user3.address)).to.equal(ethers.parseEther("200"));
    });

    it("Should revert if non-MINTER tries to mint", async function () {
      const { token, user1 } = await loadFixture(deployContractsFixture);
      await expect(token.connect(user1).mint(user1.address, ethers.parseEther("100")))
        .to.be.reverted;
    });

    it("Should allow PAUSER_ROLE to pause and unpause transfers", async function () {
      const { token, owner, user1 } = await loadFixture(deployContractsFixture);
      await token.connect(owner).pause();

      // Transfers should be blocked while paused
      await expect(token.connect(user1).transfer(owner.address, ethers.parseEther("10")))
        .to.be.reverted;

      await token.connect(owner).unpause();

      // Transfers should work again
      await token.connect(user1).transfer(owner.address, ethers.parseEther("10"));
    });

    it("Should revert if non-PAUSER tries to pause", async function () {
      const { token, user1 } = await loadFixture(deployContractsFixture);
      await expect(token.connect(user1).pause()).to.be.reverted;
    });

    it("Should allow admin to grant MINTER_ROLE to another address", async function () {
      const { token, owner, user1, user3 } = await loadFixture(deployContractsFixture);
      const MINTER_ROLE = await token.MINTER_ROLE();

      await token.connect(owner).grantRole(MINTER_ROLE, user1.address);
      await token.connect(user1).mint(user3.address, ethers.parseEther("50"));
      expect(await token.balanceOf(user3.address)).to.equal(ethers.parseEther("50"));
    });
  });

  // ─── DAO FACTORY TESTS ──────────────────────────────────────────────
  describe("DAOFactory", function () {
    it("Should deploy a Governance contract with its own Treasury", async function () {
      const { factory, token, user1 } = await loadFixture(deployContractsFixture);
      const tokenAddress = await token.getAddress();
      const threshold = ethers.parseEther("100");
      const timelockDelay = 60; // 60 seconds for testing

      await factory.connect(user1).createDAO("Test DAO", tokenAddress, threshold, timelockDelay);

      const daos = await factory.getDeployedDAOs();
      expect(daos.length).to.equal(1);

      const Governance = await ethers.getContractFactory("Governance");
      const dao = Governance.attach(daos[0]);

      expect(await dao.name()).to.equal("Test DAO");

      // Verify Treasury was auto-deployed
      const treasuryAddr = await dao.treasury();
      expect(treasuryAddr).to.not.equal(ethers.ZeroAddress);
    });
  });

  // ─── GOVERNANCE + TREASURY FLOW TESTS ───────────────────────────────
  describe("Governance & Treasury Integration", function () {
    const TIMELOCK_DELAY = 60; // 60 seconds for testing

    async function deployDAOFixture() {
      const { token, factory, owner, user1, user2, user3, recipient } = await deployContractsFixture();
      const tokenAddress = await token.getAddress();
      const threshold = ethers.parseEther("100");

      await factory.createDAO("Treasury DAO", tokenAddress, threshold, TIMELOCK_DELAY);
      const daos = await factory.getDeployedDAOs();

      const Governance = await ethers.getContractFactory("Governance");
      const dao = Governance.attach(daos[0]);

      const Treasury = await ethers.getContractFactory("Treasury");
      const treasury = Treasury.attach(await dao.treasury());

      return { token, dao, treasury, owner, user1, user2, user3, recipient };
    }

    it("Should allow sending ETH to the Treasury", async function () {
      const { treasury, owner } = await loadFixture(deployDAOFixture);
      const treasuryAddr = await treasury.getAddress();

      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });
      expect(await treasury.getBalance()).to.equal(ethers.parseEther("5"));
    });

    it("Should allow creating a financial proposal", async function () {
      const { dao, user1, recipient } = await loadFixture(deployDAOFixture);
      const options = ["Approve", "Reject"];

      await dao.connect(user1).createFinancialProposal(
        "Send 1 ETH to recipient",
        10, // 10 minutes
        options,
        recipient.address,
        ethers.parseEther("1")
      );

      expect(await dao.proposalCount()).to.equal(1);
      const proposal = await dao.getProposal(1);
      expect(proposal.target).to.equal(recipient.address);
      expect(proposal.value).to.equal(ethers.parseEther("1"));
    });

    it("Should execute a passed financial proposal and queue it in the Timelock", async function () {
      const { dao, treasury, owner, user1, user2, recipient } = await loadFixture(deployDAOFixture);
      const treasuryAddr = await treasury.getAddress();

      // 1. Fund the Treasury with 5 ETH
      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });

      // 2. Create financial proposal
      const options = ["Approve", "Reject"];
      await dao.connect(user1).createFinancialProposal(
        "Send 1 ETH to recipient",
        10,
        options,
        recipient.address,
        ethers.parseEther("1")
      );

      // 3. Mine a block to pass the snapshot
      await mine();

      // 4. Vote — user1 (1000 BLOOM) votes Approve, user2 (500 BLOOM) votes Reject
      await dao.connect(user1).vote(1, 0); // Approve
      await dao.connect(user2).vote(1, 1); // Reject

      // 5. Fast-forward past the voting period
      await time.increase(11 * 60); // 11 minutes

      // 6. Execute the proposal (queues it in Treasury Timelock)
      await dao.executeProposal(1);

      // 7. Verify the proposal was marked executed
      const proposal = await dao.getProposal(1);
      expect(proposal.executed).to.be.true;
    });

    it("Should finalize a proposal after the timelock delay", async function () {
      const { dao, treasury, owner, user1, recipient } = await loadFixture(deployDAOFixture);
      const treasuryAddr = await treasury.getAddress();

      // Fund Treasury
      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });

      // Create, vote, and execute proposal
      await dao.connect(user1).createFinancialProposal(
        "Send 2 ETH",
        10,
        ["Approve", "Reject"],
        recipient.address,
        ethers.parseEther("2")
      );
      await mine();
      await dao.connect(user1).vote(1, 0);
      await time.increase(11 * 60);
      await dao.executeProposal(1);

      // Try to finalize BEFORE timelock delay — should revert
      await expect(dao.finalizeProposal(1)).to.be.revertedWith("Timelock delay has not passed");

      // Fast-forward past the timelock delay
      await time.increase(TIMELOCK_DELAY + 1);

      // Record recipient's balance before finalization
      const balanceBefore = await ethers.provider.getBalance(recipient.address);

      // Finalize — the Treasury sends 2 ETH to recipient
      await dao.finalizeProposal(1);

      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("2"));
    });

    it("Should revert execution if Option 0 did not win", async function () {
      const { dao, user1, user2, recipient } = await loadFixture(deployDAOFixture);

      await dao.connect(user1).createFinancialProposal(
        "Should fail",
        10,
        ["Approve", "Reject"],
        recipient.address,
        ethers.parseEther("1")
      );
      await mine();

      // Only user2 votes Reject (option 1)
      await dao.connect(user2).vote(1, 1);
      await time.increase(11 * 60);

      await expect(dao.executeProposal(1)).to.be.revertedWith("Option 0 did not win");
    });

    it("Should revert finalize if timelock has not passed", async function () {
      const { dao, treasury, owner, user1, recipient } = await loadFixture(deployDAOFixture);
      const treasuryAddr = await treasury.getAddress();

      await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("5") });

      await dao.connect(user1).createFinancialProposal(
        "Time test",
        10,
        ["Approve", "Reject"],
        recipient.address,
        ethers.parseEther("1")
      );
      await mine();
      await dao.connect(user1).vote(1, 0);
      await time.increase(11 * 60);
      await dao.executeProposal(1);

      // Immediately try to finalize — should fail
      await expect(dao.finalizeProposal(1)).to.be.revertedWith("Timelock delay has not passed");
    });
  });
});
