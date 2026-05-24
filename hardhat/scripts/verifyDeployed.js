const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const addrs = {
    BloomToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    DAOFactory: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
  };

  const factoryAbi = [
    'function getDeployedDAOs() view returns (address[])',
    'function createDAO(string,address,uint256,uint256,uint256) returns (address)'
  ];
  const tokenAbi = [
    'function totalSupply() view returns (uint256)',
    'function name() view returns (string)'
  ];

  const factory = new ethers.Contract(addrs.DAOFactory, factoryAbi, provider);
  const token = new ethers.Contract(addrs.BloomToken, tokenAbi, provider);

  try {
    const codeFactory = await provider.getCode(addrs.DAOFactory);
    const codeToken = await provider.getCode(addrs.BloomToken);
    console.log('DAOFactory code deployed:', codeFactory !== '0x');
    console.log('BloomToken code deployed:', codeToken !== '0x');
    const daos = await factory.getDeployedDAOs();
    console.log('DAOFactory getDeployedDAOs length:', daos.length);
  } catch (err) {
    console.error('verify failed', err);
  }
}

main();