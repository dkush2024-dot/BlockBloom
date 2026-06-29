const hre = require("hardhat");

async function main() {
  const tokenAddress = "0xe7b1710d4066FDc481119fB1Ba7cc2BA4d58B1EB";
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Delegating votes for:", deployer.address);
  
  const Token = await hre.ethers.getContractFactory("BloomToken");
  const token = Token.attach(tokenAddress);
  
  console.log(`Delegating BLOOM tokens to ${deployer.address}...`);
  const tx = await token.delegate(deployer.address);
  console.log("Transaction Hash:", tx.hash);
  
  await tx.wait();
  console.log("Delegation successful!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
