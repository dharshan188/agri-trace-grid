import { ethers } from "hardhat";
import dotenv from 'dotenv';
import { MerkleTreeService } from '../src/services/merkleTree';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  // Connect to database
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/farm-to-fork');
  console.log("Connected to database");

  // Get current Merkle root
  const currentRoot = await MerkleTreeService.getCurrentRoot();
  if (!currentRoot) {
    console.log("No Merkle root found to anchor");
    return;
  }

  console.log(`Anchoring Merkle root: ${currentRoot}`);

  // Connect to contract
  const contractAddress = process.env.MERKLE_ANCHOR_CONTRACT || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const MerkleAnchor = await ethers.getContractFactory("MerkleAnchor");
  const merkleAnchor = MerkleAnchor.attach(contractAddress);

  // Submit transaction
  const tx = await merkleAnchor.anchor(`0x${currentRoot}`);
  console.log(`Transaction submitted: ${tx.hash}`);

  // Wait for confirmation
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block: ${receipt?.blockNumber}`);
  console.log(`✅ Merkle root anchored successfully!`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});