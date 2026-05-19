const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Deployed BloomToken address
  
  console.log("Interacting with BloomToken at:", tokenAddress);
  const token = await ethers.getContractAt("BloomToken", tokenAddress);

  // Check balance of deployer
  const balance = await token.balanceOf(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "BLOOM");

  // Check current voting power of deployer
  const votesBefore = await token.getVotes(deployer.address);
  console.log("Deployer voting power before delegation:", ethers.formatEther(votesBefore), "votes");

  // Delegate voting power to self
  console.log("Delegating voting power to self...");
  const tx = await token.delegate(deployer.address);
  await tx.wait();

  const votesAfter = await token.getVotes(deployer.address);
  console.log("Deployer voting power after delegation:", ethers.formatEther(votesAfter), "votes");
}

main().catch(console.error);
