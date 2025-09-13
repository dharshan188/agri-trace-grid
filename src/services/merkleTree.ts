import crypto from 'crypto';
import MerkleLeaf from '@/models/MerkleLeaf';
import { MerkleProof } from '@/types';
import { logger } from '@/utils/logger';

export class MerkleTreeService {
  /**
   * Hash function for tree operations
   */
  private static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Combine two hashes
   */
  private static combineHashes(left: string, right: string): string {
    return this.hash(left + right);
  }

  /**
   * Append a new leaf to the Merkle tree
   */
  static async appendLeaf(leafData: any, type: 'batch' | 'event' | 'anchor', batchId?: string, eventId?: string): Promise<{ index: number; root: string; leaf: string }> {
    const leafHash = crypto.createHash('sha256').update(JSON.stringify(leafData)).digest('hex');
    
    // Get current leaf count to determine index
    const lastLeaf = await MerkleLeaf.findOne().sort({ index: -1 });
    const newIndex = lastLeaf ? lastLeaf.index + 1 : 0;

    // Calculate new root and proof
    const { root, proof } = await this.calculateRootAndProof(newIndex, leafHash);

    // Save the new leaf
    const merkleLeaf = new MerkleLeaf({
      index: newIndex,
      hash: leafHash,
      data: leafData,
      batch_id: batchId,
      event_id: eventId,
      type,
      root_hash: root,
      proof
    });

    await merkleLeaf.save();

    // Update root hash for all previous leaves (in production, this could be optimized)
    await this.updateRootForAllLeaves(root);

    logger.info(`Merkle leaf appended: index=${newIndex}, hash=${leafHash}, root=${root}`);

    return {
      index: newIndex,
      root,
      leaf: leafHash
    };
  }

  /**
   * Calculate root hash and proof for a given leaf
   */
  private static async calculateRootAndProof(leafIndex: number, leafHash: string): Promise<{ root: string; proof: string[] }> {
    const allLeaves = await MerkleLeaf.find().sort({ index: 1 });
    const hashes = allLeaves.map(leaf => leaf.hash);
    
    // Add the new leaf hash
    hashes[leafIndex] = leafHash;

    if (hashes.length === 0) {
      return { root: leafHash, proof: [] };
    }

    if (hashes.length === 1) {
      return { root: hashes[0], proof: [] };
    }

    // Build tree bottom-up and generate proof
    const proof: string[] = [];
    let currentLevel = [...hashes];
    let currentIndex = leafIndex;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        
        // If we're at the position we're proving, add sibling to proof
        if (i === currentIndex || i + 1 === currentIndex) {
          const sibling = i === currentIndex ? right : left;
          if (sibling !== left || i + 1 < currentLevel.length) {
            proof.push(sibling);
          }
        }
        
        nextLevel.push(this.combineHashes(left, right));
      }
      
      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      root: currentLevel[0],
      proof
    };
  }

  /**
   * Update root hash for all existing leaves (simplified approach)
   */
  private static async updateRootForAllLeaves(newRoot: string): Promise<void> {
    await MerkleLeaf.updateMany({}, { root_hash: newRoot });
  }

  /**
   * Get Merkle proof for a specific leaf
   */
  static async getProof(leafIndex: number): Promise<MerkleProof | null> {
    const leaf = await MerkleLeaf.findOne({ index: leafIndex });
    if (!leaf) {
      return null;
    }

    return {
      leaf: leaf.hash,
      proof: leaf.proof,
      leafIndex: leaf.index,
      root: leaf.root_hash
    };
  }

  /**
   * Verify a Merkle proof
   */
  static verifyProof(leaf: string, proof: string[], leafIndex: number, root: string): boolean {
    let computedHash = leaf;
    let currentIndex = leafIndex;

    for (const proofElement of proof) {
      if (currentIndex % 2 === 0) {
        // Current node is left child
        computedHash = this.combineHashes(computedHash, proofElement);
      } else {
        // Current node is right child
        computedHash = this.combineHashes(proofElement, computedHash);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    return computedHash === root;
  }

  /**
   * Get current Merkle root
   */
  static async getCurrentRoot(): Promise<string | null> {
    const lastLeaf = await MerkleLeaf.findOne().sort({ index: -1 });
    return lastLeaf ? lastLeaf.root_hash : null;
  }

  /**
   * Get all leaves for a specific batch
   */
  static async getBatchLeaves(batchId: string): Promise<any[]> {
    return await MerkleLeaf.find({ batch_id: batchId }).sort({ index: 1 });
  }
}