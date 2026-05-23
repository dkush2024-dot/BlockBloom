const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // Hardcoded addresses from previous deployment
  const factoryAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  const tokenAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

  const Factory = await hre.ethers.getContractAt("DAOFactory", factoryAddress);
  
  console.log("Creating new DAO...");
  
  const threshold = hre.ethers.parseEther("100"); // 100 BLOOM tokens
  const timelockDelay = 86400; // 1 day
  
  const tx = await Factory.createDAO(
    "DeFi Wizards DAO",
    tokenAddress,
    threshold,
    timelockDelay
  );
  
  await tx.wait();
  
  console.log("✅ DAO Created Successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
