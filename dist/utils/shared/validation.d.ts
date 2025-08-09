export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
export declare function isValidEmail(email: string): boolean;
export declare function isValidPassword(password: string): ValidationResult;
export declare function isValidUsername(username: string): ValidationResult;
export declare function isValidURL(url: string): boolean;
export declare function isValidPhoneNumber(phone: string): boolean;
export declare function sanitizeString(input: string): string;
export declare function validateObject(obj: any, schema: Record<string, any>): ValidationResult;
export declare function validatePagination(page?: number, limit?: number): ValidationResult;
export declare function validateDateRange(startDate?: Date, endDate?: Date): ValidationResult;
export declare function validateFileUpload(file: any, allowedTypes: string[], maxSize: number): ValidationResult;
export declare function isValidJSON(jsonString: string): boolean;
export declare function isValidObjectId(id: string): boolean;
//# sourceMappingURL=validation.d.ts.map