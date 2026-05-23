const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy BloomToken
  const initialSupply = hre.ethers.parseEther("1000000"); // 1 Million tokens
  const Token = await hre.ethers.getContractFactory("BloomToken");
  const token = await Token.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("BloomToken deployed to:", tokenAddress);

  // 2. Deploy DAOFactory
  const Factory = await hre.ethers.getContractFactory("DAOFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("DAOFactory deployed to:", factoryAddress);

  // 3. Output for the backend .env
  console.log("\n✅ Add these to your backend/.env file:");
  console.log(`DAO_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`RPC_URL=http://127.0.0.1:8545`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
