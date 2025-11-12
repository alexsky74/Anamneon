import crypto from 'crypto';
import fs from 'fs';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ITERATIONS = 100000; // Increased from 1000

/**
 * Derive an encryption key from password using PBKDF2
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Generate a secure random salt
 */
export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Hash password for storage (not for encryption)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored hash
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Encrypt text data
 */
export function encryptText(text: string, password: string): string {
  const salt = generateSalt();
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: salt:iv:authTag:encryptedData
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt text data
 */
export function decryptText(encryptedData: string, password: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [saltHex, ivHex, authTagHex, encrypted] = parts;
  
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(password, salt);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt a file
 */
export async function encryptFile(inputPath: string, outputPath: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const salt = generateSalt();
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    
    // Write salt and IV first
    output.write(salt);
    output.write(iv);
    
    input.on('error', reject);
    output.on('error', reject);
    cipher.on('error', reject);
    
    input.pipe(cipher).pipe(output, { end: false });
    
    input.on('end', () => {
      const authTag = cipher.getAuthTag();
      output.write(authTag);
      output.end();
    });
    
    output.on('finish', resolve);
  });
}

/**
 * Decrypt a file
 */
export async function decryptFile(inputPath: string, outputPath: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Read the entire file first to properly handle auth tag
      const encryptedData = fs.readFileSync(inputPath);
      
      if (encryptedData.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
        reject(new Error('Invalid encrypted file: too small'));
        return;
      }
      
      const salt = encryptedData.subarray(0, SALT_LENGTH);
      const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = encryptedData.subarray(encryptedData.length - TAG_LENGTH);
      const ciphertext = encryptedData.subarray(SALT_LENGTH + IV_LENGTH, encryptedData.length - TAG_LENGTH);
      
      const key = deriveKey(password, salt);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
      
      fs.writeFileSync(outputPath, decrypted);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get user encryption key from session
 * In production, this should be stored securely in memory per session
 */
const userKeys = new Map<string, string>();

export function setUserEncryptionKey(userId: string, password: string): void {
  userKeys.set(userId, password);
}

export function getUserEncryptionKey(userId: string): string | undefined {
  return userKeys.get(userId);
}

export function clearUserEncryptionKey(userId: string): void {
  userKeys.delete(userId);
}

export function clearAllEncryptionKeys(): void {
  userKeys.clear();
}
