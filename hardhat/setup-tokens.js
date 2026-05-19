const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();
  const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const token = await ethers.getContractAt("BloomToken", tokenAddress);

  // We will setup the first 3 accounts (Account #0, #1, and #2)
  for (let i = 0; i < 3; i++) {
    const account = signers[i];
    console.log(`\n--- Setting up Account #${i}: ${account.address} ---`);

    // Mint 100,000 BLOOM tokens (with 18 decimals)
    const amount = ethers.parseEther("100000.0");
    console.log(`Minting 100,000 BLOOM tokens...`);
    const mintTx = await token.mint(account.address, amount);
    await mintTx.wait();

    // Delegate voting power to self
    console.log(`Delegating voting power to self...`);
    const delegateTx = await token.connect(account).delegate(account.address);
    await delegateTx.wait();

    const balance = await token.balanceOf(account.address);
    const votes = await token.getVotes(account.address);
    console.log(`Balance: ${ethers.formatEther(balance)} BLOOM`);
    console.log(`Voting Power: ${ethers.formatEther(votes)} votes`);
  }
}

main().catch(console.error);
