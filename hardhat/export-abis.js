const fs = require("fs");
const path = require("path");

function main() {
  console.log("\n📦 Extracting ABIs from Hardhat artifacts...");

  // Paths to the compiled Hardhat artifacts
  const electionFactoryArtifactPath = path.join(__dirname, "artifacts/contracts/ElectionFactory.sol/ElectionFactory.json");
  const electionArtifactPath = path.join(__dirname, "artifacts/contracts/Election.sol/Election.json");
  const bloomTokenArtifactPath = path.join(__dirname, "artifacts/contracts/BloomToken.sol/BloomToken.json");

  // Check if they exist (need to compile first if not)
  if (!fs.existsSync(electionFactoryArtifactPath) || !fs.existsSync(electionArtifactPath)) {
    console.error("❌ Artifacts not found! Please run 'npx hardhat compile' first.");
    process.exit(1);
  }

  const factoryABI = JSON.parse(fs.readFileSync(electionFactoryArtifactPath, "utf8")).abi;
  const electionABI = JSON.parse(fs.readFileSync(electionArtifactPath, "utf8")).abi;
  const tokenABI = JSON.parse(fs.readFileSync(bloomTokenArtifactPath, "utf8")).abi;

  // 1. Update frontend/src/contracts.json
  const frontendContractsPath = path.join(__dirname, "../frontend/src/contracts.json");
  if (fs.existsSync(frontendContractsPath)) {
    const contracts = JSON.parse(fs.readFileSync(frontendContractsPath, "utf8"));
    
    // Replace old DAOFactory and Governance with ElectionFactory and Election
    delete contracts.DAOFactory;
    delete contracts.Governance;

    contracts.ElectionFactory = {
      address: contracts.ElectionFactory?.address || "",
      abi: factoryABI
    };
    contracts.Election = {
      abi: electionABI
    };
    if (contracts.BloomToken) {
      contracts.BloomToken.abi = tokenABI;
    }

    fs.writeFileSync(frontendContractsPath, JSON.stringify(contracts, null, 2));
    console.log("✅ Updated frontend/src/contracts.json with new ABIs!");
  } else {
    console.warn("⚠️ Could not find frontend/src/contracts.json");
  }

  // 2. Export raw ABIs for Backend (Kushagra)
  const backendAbisDir = path.join(__dirname, "../backend/src/blockchain/abis");
  if (!fs.existsSync(backendAbisDir)) {
    fs.mkdirSync(backendAbisDir, { recursive: true });
  }

  fs.writeFileSync(path.join(backendAbisDir, "ElectionFactory.json"), JSON.stringify(factoryABI, null, 2));
  fs.writeFileSync(path.join(backendAbisDir, "Election.json"), JSON.stringify(electionABI, null, 2));
  fs.writeFileSync(path.join(backendAbisDir, "BloomToken.json"), JSON.stringify(tokenABI, null, 2));
  console.log("✅ Exported ABIs to backend/src/blockchain/abis/!");

  console.log("\n🎉 Phase 3 ABI synchronization complete! Nikhil and Kushagra now have the updated data they need.");
}

main();
