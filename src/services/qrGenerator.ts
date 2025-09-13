import QRCode from 'qrcode';
import { QRPayload } from '@/types';
import { logger } from '@/utils/logger';

export class QRGeneratorService {
  /**
   * Generate QR code as PNG data URI
   */
  static async generateQRCode(payload: QRPayload): Promise<string> {
    try {
      const jsonString = JSON.stringify(payload);
      
      const qrOptions = {
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 512
      };

      const qrPng = await QRCode.toDataURL(jsonString, qrOptions);
      
      logger.info(`QR code generated for batch: ${payload.batch_id}`);
      return qrPng;
    } catch (error) {
      logger.error('QR code generation failed:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate QR code as buffer
   */
  static async generateQRBuffer(payload: QRPayload): Promise<Buffer> {
    try {
      const jsonString = JSON.stringify(payload);
      
      const qrOptions = {
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 512
      };

      const buffer = await QRCode.toBuffer(jsonString, qrOptions);
      return buffer;
    } catch (error) {
      logger.error('QR code buffer generation failed:', error);
      throw new Error('Failed to generate QR code buffer');
    }
  }

  /**
   * Validate QR payload structure
   */
  static validateQRPayload(payload: any): payload is QRPayload {
    const required = ['batch_id', 'farmer_id', 'timestamp', 'ipfs_hash', 'merkle_leaf', 'farmer_pubkey', 'signature'];
    
    return required.every(field => payload && typeof payload[field] === 'string');
  }
}