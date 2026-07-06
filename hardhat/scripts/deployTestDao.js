const { ethers } = require('hardhat');

async function main() {
  const factoryAddress = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
  const bloomTokenAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  const signer = (await ethers.getSigners())[0];
  const factoryAbi = [
    'function createDAO(string memory _name, address _tokenAddress, uint256 _proposalThreshold, uint256 _timelockDelay, uint256 _quorumPercentage) public returns (address)',
    'event DAOCreated(address indexed daoAddress, address indexed treasuryAddress, string name, address indexed tokenAddress, uint256 proposalThreshold, uint256 timelockDelay, uint256 quorumPercentage, address creator)'
  ];

  const factory = new ethers.Contract(factoryAddress, factoryAbi, signer);
  console.log('Creating test DAO using DAOFactory', factoryAddress);
  const tx = await factory.createDAO('Test DAO', bloomTokenAddress, 1, 60, 10);
  await tx.wait();
  const deployed = await factory.getDeployedDAOs();
  const daoAddress = deployed[deployed.length - 1];
  console.log('Transaction hash:', tx.hash);
  console.log('New DAO address:', daoAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});