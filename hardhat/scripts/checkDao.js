const ethers = require('ethers');

async function main() {
  const daoAddress = '0x75537828f2ce51be7289709686a69cbfdbb714f1';
  const governanceAbi = [
    'function bloomToken() view returns (address)',
    'function proposalThreshold() view returns (uint256)',
    'function name() view returns (string)'
  ];
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const gov = new ethers.Contract(daoAddress, governanceAbi, provider);

  try {
    const tokenAddr = await gov.bloomToken();
    const threshold = await gov.proposalThreshold();
    const name = await gov.name();
    console.log('DAO name:', name);
    console.log('bloomToken:', tokenAddr);
    console.log('threshold:', threshold.toString());
  } catch (err) {
    console.error('error', err);
  }
}

main();
