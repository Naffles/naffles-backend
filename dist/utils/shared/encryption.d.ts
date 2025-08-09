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
export declare class EncryptionUtil {
    private algorithm;
    private secretKey;
    constructor(secretKey: string, algorithm?: string);
    encrypt(text: string): EncryptionResult;
    decrypt(input: DecryptionInput): string;
    hashPassword(password: string): string;
    verifyPassword(password: string, hashedPassword: string): boolean;
    generateRandomString(length?: number): string;
    generateUUID(): string;
    createHMAC(data: string, secret: string): string;
    verifyHMAC(data: string, signature: string, secret: string): boolean;
    encryptForStorage(data: any): string;
    decryptFromStorage(encryptedData: string): any;
}
export declare function createEncryptionUtil(secretKey?: string): EncryptionUtil;
export declare const encryptionUtil: EncryptionUtil;
//# sourceMappingURL=encryption.d.ts.map