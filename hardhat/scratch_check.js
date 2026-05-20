async function main() {
  const f = await ethers.getContractAt('DAOFactory', '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0');
  console.log('Deployed DAOs:', await f.getDeployedDAOs());
}
main().catch(console.error);
