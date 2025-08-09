/**
 * Shared validation utilities
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Password validation
 */
export function isValidPassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Username validation
 */
export function isValidUsername(username: string): ValidationResult {
  const errors: string[] = [];

  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (username.length > 20) {
    errors.push('Username must be no more than 20 characters long');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
  }

  if (/^[_-]/.test(username) || /[_-]$/.test(username)) {
    errors.push('Username cannot start or end with underscore or hyphen');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * URL validation
 */
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Phone number validation (basic)
 */
export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validate object against schema
 */
export function validateObject(obj: any, schema: Record<string, any>): ValidationResult {
  const errors: string[] = [];

  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];

    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${key} is required`);
      continue;
    }

    // Skip validation if field is not required and empty
    if (!rules.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${key} must be of type ${rules.type}`);
      continue;
    }

    // String validations
    if (rules.type === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters long`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${key} must be no more than ${rules.maxLength} characters long`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${key} format is invalid`);
      }
    }

    // Number validations
    if (rules.type === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${key} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${key} must be no more than ${rules.max}`);
      }
    }

    // Array validations
    if (rules.type === 'array') {
      if (rules.minItems && value.length < rules.minItems) {
        errors.push(`${key} must have at least ${rules.minItems} items`);
      }
      if (rules.maxItems && value.length > rules.maxItems) {
        errors.push(`${key} must have no more than ${rules.maxItems} items`);
      }
    }

    // Custom validation function
    if (rules.validate && typeof rules.validate === 'function') {
      const customResult = rules.validate(value);
      if (customResult !== true) {
        errors.push(typeof customResult === 'string' ? customResult : `${key} is invalid`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page?: number, limit?: number): ValidationResult {
  const errors: string[] = [];

  if (page !== undefined) {
    if (!Number.isInteger(page) || page < 1) {
      errors.push('Page must be a positive integer');
    }
  }

  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push('Limit must be a positive integer between 1 and 100');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate date range
 */
export function validateDateRange(startDate?: Date, endDate?: Date): ValidationResult {
  const errors: string[] = [];

  if (startDate && endDate) {
    if (startDate >= endDate) {
      errors.push('Start date must be before end date');
    }
  }

  if (startDate && startDate > new Date()) {
    errors.push('Start date cannot be in the future');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate file upload
 */
export function validateFileUpload(
  file: any,
  allowedTypes: string[],
  maxSize: number
): ValidationResult {
  const errors: string[] = [];

  if (!file) {
    errors.push('File is required');
    return { isValid: false, errors };
  }

  if (!allowedTypes.includes(file.mimetype)) {
    errors.push(`File type ${file.mimetype} is not allowed`);
  }

  if (file.size > maxSize) {
    errors.push(`File size must be less than ${maxSize} bytes`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate JSON string
 */
export function isValidJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate MongoDB ObjectId
 */
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}