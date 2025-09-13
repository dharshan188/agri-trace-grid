import crypto from 'crypto';
import secp256k1 from 'secp256k1';

/**
 * Generate a new key pair for ECDSA signing
 */
export const generateKeyPair = () => {
  let privateKey: Buffer;
  do {
    privateKey = crypto.randomBytes(32);
  } while (!secp256k1.privateKeyVerify(privateKey));

  const publicKey = secp256k1.publicKeyCreate(privateKey);

  return {
    privateKey: privateKey.toString('hex'),
    publicKey: Buffer.from(publicKey).toString('hex')
  };
};

/**
 * Sign data with private key
 */
export const signData = (data: string, privateKey: string): string => {
  const hash = crypto.createHash('sha256').update(data).digest();
  const privKey = Buffer.from(privateKey, 'hex');
  
  if (!secp256k1.privateKeyVerify(privKey)) {
    throw new Error('Invalid private key');
  }

  const signature = secp256k1.ecdsaSign(hash, privKey);
  return Buffer.from(signature.signature).toString('hex');
};

/**
 * Verify signature
 */
export const verifySignature = (data: string, signature: string, publicKey: string): boolean => {
  try {
    const hash = crypto.createHash('sha256').update(data).digest();
    const sig = Buffer.from(signature, 'hex');
    const pubKey = Buffer.from(publicKey, 'hex');

    return secp256k1.ecdsaVerify(sig, hash, pubKey);
  } catch (error) {
    return false;
  }
};

/**
 * Hash data using SHA-256
 */
export const hashData = (data: any): string => {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
};

/**
 * Create batch hash for canonical representation
 */
export const createBatchHash = (batchData: any): string => {
  // Create canonical representation for consistent hashing
  const canonical = {
    batch_id: batchData.batch_id,
    farmer_id: batchData.farmer_id,
    crop: batchData.crop,
    location: batchData.location,
    metadata: batchData.metadata,
    timestamp: batchData.timestamp || new Date().toISOString()
  };

  return hashData(canonical);
};