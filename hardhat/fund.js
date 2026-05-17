const { ethers } = require("hardhat");

async function main() {
  const address = "0x21D7961AbB8F35E9ac8Bc42b0B135e784891330b";
  
  const [sender] = await ethers.getSigners();
  console.log("Sending 100 ETH from", sender.address, "to", address);
  
  const tx = await sender.sendTransaction({
    to: address,
    value: ethers.parseEther("100.0")
  });
  await tx.wait();
  
  const balance = await ethers.provider.getBalance(address);
  console.log("New balance of", address, ":", ethers.formatEther(balance), "ETH");
}

main().catch(console.error);
