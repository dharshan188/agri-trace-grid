import { ethers } from "hardhat";

async function main() {
  console.log("Deploying MerkleAnchor contract...");

  const MerkleAnchor = await ethers.getContractFactory("MerkleAnchor");
  const merkleAnchor = await MerkleAnchor.deploy();

  await merkleAnchor.waitForDeployment();

  const address = await merkleAnchor.getAddress();
  console.log(`MerkleAnchor deployed to: ${address}`);
  
  // Update .env with contract address
  console.log(`\nAdd this to your .env file:`);
  console.log(`MERKLE_ANCHOR_CONTRACT=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});