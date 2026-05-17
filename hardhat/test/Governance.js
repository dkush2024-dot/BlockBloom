const { loadFixture, time, mine } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Governance & Tokenomics", function () {
  async function deployContractsFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();
    
    // Deploy Token
    const initialSupply = ethers.parseEther("10000"); // 10,000 BLOOM
    const BloomToken = await ethers.getContractFactory("BloomToken");
    const token = await BloomToken.deploy(initialSupply);

    // Deploy Factory
    const DAOFactory = await ethers.getContractFactory("DAOFactory");
    const factory = await DAOFactory.deploy();

    // Distribute tokens
    await token.transfer(user1.address, ethers.parseEther("1000"));
    await token.transfer(user2.address, ethers.parseEther("500"));
    // user3 gets 0 tokens initially

    // Delegate votes (required to activate voting power in ERC20Votes)
    await token.connect(user1).delegate(user1.address);
    await token.connect(user2).delegate(user2.address);

    return { token, factory, owner, user1, user2, user3 };
  }

  describe("BloomToken", function () {
    it("Should mint initial supply to owner", async function () {
      const { token, owner } = await loadFixture(deployContractsFixture);
      const balance = await token.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseEther("8500")); // 10000 - 1500 transferred
    });

    it("Should properly track delegated voting power", async function () {
      const { token, user1 } = await loadFixture(deployContractsFixture);
      const votes = await token.getVotes(user1.address);
      expect(votes).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("DAOFactory & Governance Flow", function () {
    async function deployDAOFixture() {
      const { token, factory, owner, user1, user2, user3 } = await deployContractsFixture();
      
      const proposalThreshold = ethers.parseEther("100"); // 100 BLOOM required to propose
      await factory.createDAO("Token DAO", await token.getAddress(), proposalThreshold);
      
      const daos = await factory.getDeployedDAOs();
      const Governance = await ethers.getContractFactory("Governance");
      const dao = Governance.attach(daos[0]);
      
      return { token, factory, dao, owner, user1, user2, user3 };
    }

    it("Should revert proposal creation if below threshold", async function () {
      const { dao, user3 } = await loadFixture(deployDAOFixture);
      const options = ["Yes", "No"];
      
      // user3 has 0 tokens
      await expect(dao.connect(user3).createProposal("Test", 60, options))
        .to.be.revertedWith("Voting power below proposal threshold");
    });

    it("Should allow proposal creation if above threshold", async function () {
      const { dao, user1 } = await loadFixture(deployDAOFixture);
      const options = ["Yes", "No"];
      
      // user1 has 1000 tokens
      await dao.connect(user1).createProposal("Test Proposal", 60, options);
      expect(await dao.proposalCount()).to.equal(1);
    });

    it("Should weight votes by token balance", async function () {
      const { dao, user1, user2 } = await loadFixture(deployDAOFixture);
      const options = ["Yes", "No"];
      
      await dao.connect(user1).createProposal("Weighted Vote Test", 60, options);
      
      // Mine a block to ensure we are past the snapshot block
      await mine();
      
      await dao.connect(user1).vote(1, 0); // user1 votes Yes (1000 weight)
      await dao.connect(user2).vote(1, 1); // user2 votes No (500 weight)
      
      const proposal = await dao.getProposal(1);
      expect(proposal.optionVotes[0]).to.equal(ethers.parseEther("1000"));
      expect(proposal.optionVotes[1]).to.equal(ethers.parseEther("500"));
    });

    it("Should revert if voting power is zero", async function () {
      const { dao, user1, user3 } = await loadFixture(deployDAOFixture);
      const options = ["Yes", "No"];
      
      await dao.connect(user1).createProposal("Zero Vote Test", 60, options);
      await mine();
      
      // user3 has 0 tokens
      await expect(dao.connect(user3).vote(1, 0))
        .to.be.revertedWith("No voting power");
    });

    it("Should revert if user tries to vote twice", async function () {
        const { dao, user1 } = await loadFixture(deployDAOFixture);
        const options = ["Yes", "No"];
        await dao.connect(user1).createProposal("Double vote Test", 60, options);
        await mine();
        
        await dao.connect(user1).vote(1, 0);
        await expect(dao.connect(user1).vote(1, 0))
          .to.be.revertedWith("Already voted on this proposal");
    });
  });
});
