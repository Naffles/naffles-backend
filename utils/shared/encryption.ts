import crypto from 'crypto';

/**
 * Shared encryption utilities
 */

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag: string;
}

export interface DecryptionInput {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Encryption utility class
 */
export class EncryptionUtil {
  private algorithm: string;
  private secretKey: Buffer;

  constructor(secretKey: string, algorithm: string = 'aes-256-gcm') {
    this.algorithm = algorithm;
    this.secretKey = crypto.scryptSync(secretKey, 'salt', 32);
  }

  /**
   * Encrypt text
   */
  public encrypt(text: string): EncryptionResult {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.secretKey);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: '' // Not using auth tag for basic cipher
    };
  }

  /**
   * Decrypt text
   */
  public decrypt(input: DecryptionInput): string {
    const decipher = crypto.createDecipher(this.algorithm, this.secretKey);

    let decrypted = decipher.update(input.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash password with salt
   */
  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify password against hash
   */
  public verifyPassword(password: string, hashedPassword: string): boolean {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  /**
   * Generate secure random string
   */
  public generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate UUID v4
   */
  public generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Create HMAC signature
   */
  public createHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  public verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Encrypt sensitive data for database storage
   */
  public encryptForStorage(data: any): string {
    const jsonString = JSON.stringify(data);
    const result = this.encrypt(jsonString);
    return JSON.stringify(result);
  }

  /**
   * Decrypt sensitive data from database storage
   */
  public decryptFromStorage(encryptedData: string): any {
    const decryptionInput = JSON.parse(encryptedData) as DecryptionInput;
    const decryptedString = this.decrypt(decryptionInput);
    return JSON.parse(decryptedString);
  }
}

/**
 * Create default encryption utility
 */
export function createEncryptionUtil(secretKey?: string): EncryptionUtil {
  const key = secretKey || process.env.ENCRYPTION_SECRET_KEY;
  if (!key) {
    throw new Error('Encryption secret key is required');
  }
  return new EncryptionUtil(key);
}

// Export default instance
export const encryptionUtil = createEncryptionUtil();