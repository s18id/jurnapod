export declare class EncryptionError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Encrypted payload structure
 */
export type EncryptedPayload = {
    ciphertext: string;
    iv: string;
    authTag: string;
};
/**
 * Encrypt a plaintext string using AES-256-GCM
 */
export declare function encrypt(plaintext: string, encryptionKey: string): EncryptedPayload;
/**
 * Decrypt an encrypted payload using AES-256-GCM
 */
export declare function decrypt(payload: EncryptedPayload, encryptionKey: string): string;
/**
 * Check if a string looks like an encrypted payload (JSON with required fields)
 */
export declare function isEncryptedPayload(value: unknown): value is EncryptedPayload;
//# sourceMappingURL=encryption.d.ts.map