const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const addrs = [
    '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
  ];
  for (const a of addrs) {
    const code = await provider.getCode(a);
    console.log(a, code === '0x' ? 'NOT_DEPLOYED' : 'DEPLOYED', code.slice(0, 20));
  }
  const network = await provider.getNetwork();
  console.log('chainId', network.chainId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});