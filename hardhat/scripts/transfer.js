const hre = require("hardhat");

async function main() {
  const tokenAddress = "0xe7b1710d4066FDc481119fB1Ba7cc2BA4d58B1EB";
  const receiverAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Sending from:", deployer.address);
  
  const Token = await hre.ethers.getContractFactory("BloomToken");
  const token = Token.attach(tokenAddress);
  
  const amount = hre.ethers.parseEther("1000"); // 1000 tokens
  
  console.log(`Transferring 1000 BLOOM tokens to ${receiverAddress}...`);
  const tx = await token.transfer(receiverAddress, amount);
  console.log("Transaction Hash:", tx.hash);
  
  await tx.wait();
  console.log("Transfer successful!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
