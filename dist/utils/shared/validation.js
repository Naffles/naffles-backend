"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
exports.isValidPassword = isValidPassword;
exports.isValidUsername = isValidUsername;
exports.isValidURL = isValidURL;
exports.isValidPhoneNumber = isValidPhoneNumber;
exports.sanitizeString = sanitizeString;
exports.validateObject = validateObject;
exports.validatePagination = validatePagination;
exports.validateDateRange = validateDateRange;
exports.validateFileUpload = validateFileUpload;
exports.isValidJSON = isValidJSON;
exports.isValidObjectId = isValidObjectId;
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidPassword(password) {
    const errors = [];
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
function isValidUsername(username) {
    const errors = [];
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
function isValidURL(url) {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
function isValidPhoneNumber(phone) {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
}
function sanitizeString(input) {
    return input.trim().replace(/[<>]/g, '');
}
function validateObject(obj, schema) {
    const errors = [];
    for (const [key, rules] of Object.entries(schema)) {
        const value = obj[key];
        if (rules.required && (value === undefined || value === null || value === '')) {
            errors.push(`${key} is required`);
            continue;
        }
        if (!rules.required && (value === undefined || value === null || value === '')) {
            continue;
        }
        if (rules.type && typeof value !== rules.type) {
            errors.push(`${key} must be of type ${rules.type}`);
            continue;
        }
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
        if (rules.type === 'number') {
            if (rules.min !== undefined && value < rules.min) {
                errors.push(`${key} must be at least ${rules.min}`);
            }
            if (rules.max !== undefined && value > rules.max) {
                errors.push(`${key} must be no more than ${rules.max}`);
            }
        }
        if (rules.type === 'array') {
            if (rules.minItems && value.length < rules.minItems) {
                errors.push(`${key} must have at least ${rules.minItems} items`);
            }
            if (rules.maxItems && value.length > rules.maxItems) {
                errors.push(`${key} must have no more than ${rules.maxItems} items`);
            }
        }
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
function validatePagination(page, limit) {
    const errors = [];
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
function validateDateRange(startDate, endDate) {
    const errors = [];
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
function validateFileUpload(file, allowedTypes, maxSize) {
    const errors = [];
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
function isValidJSON(jsonString) {
    try {
        JSON.parse(jsonString);
        return true;
    }
    catch {
        return false;
    }
}
function isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}
//# sourceMappingURL=validation.js.map