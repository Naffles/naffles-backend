const Joi = require('joi');
const { LOTTERY_TYPES, RAFFLE_TYPES } = require('../../config/config');

/**
 * Validation schemas for raffle operations
 */

const raffleCreationSchema = Joi.object({
    lotteryTypeEnum: Joi.string()
        .valid(...LOTTERY_TYPES)
        .required()
        .messages({
            'any.only': 'lotteryTypeEnum must be one of: ' + LOTTERY_TYPES.join(', '),
            'any.required': 'lotteryTypeEnum is required'
        }),
    
    raffleTypeEnum: Joi.string()
        .valid(...RAFFLE_TYPES)
        .required()
        .messages({
            'any.only': 'raffleTypeEnum must be one of: ' + RAFFLE_TYPES.join(', '),
            'any.required': 'raffleTypeEnum is required'
        }),
    
    perTicketPrice: Joi.string()
        .pattern(/^\d+$/)
        .required()
        .messages({
            'string.pattern.base': 'perTicketPrice must be a valid number string',
            'any.required': 'perTicketPrice is required'
        }),
    
    raffleDurationDays: Joi.number()
        .integer()
        .min(1)
        .max(30)
        .required()
        .messages({
            'number.min': 'raffleDurationDays must be at least 1 day',
            'number.max': 'raffleDurationDays cannot exceed 30 days',
            'any.required': 'raffleDurationDays is required'
        }),
    
    ticketsAvailable: Joi.number()
        .integer()
        .min(1)
        .max(10000)
        .when('raffleTypeEnum', {
            is: 'UNLIMITED',
            then: Joi.optional(),
            otherwise: Joi.required()
        })
        .messages({
            'number.min': 'ticketsAvailable must be at least 1',
            'number.max': 'ticketsAvailable cannot exceed 10,000',
            'any.required': 'ticketsAvailable is required for non-unlimited raffles'
        }),
    
    coinType: Joi.string()
        .lowercase()
        .required()
        .messages({
            'any.required': 'coinType is required'
        }),
    
    discountCode: Joi.number()
        .integer()
        .optional(),
    
    clientProfileId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional()
        .messages({
            'string.pattern.base': 'clientProfileId must be a valid MongoDB ObjectId'
        }),
    
    // NFT Prize validation
    rafflePrize: Joi.when('lotteryTypeEnum', {
        is: 'NFT',
        then: Joi.object({
            contractAddress: Joi.string().required(),
            tokenId: Joi.string().required(),
            chainId: Joi.string().required(),
            collection: Joi.string().optional(),
            floorPrice: Joi.string().optional()
        }).required(),
        otherwise: Joi.when('lotteryTypeEnum', {
            is: 'TOKEN',
            then: Joi.object({
                token: Joi.string().required(),
                amount: Joi.string().pattern(/^\d+$/).required(),
                chainId: Joi.string().required(),
                decimals: Joi.number().integer().min(0).max(18).optional(),
                symbol: Joi.string().optional()
            }).required(),
            otherwise: Joi.when('lotteryTypeEnum', {
                is: 'NAFFLINGS',
                then: Joi.object({
                    nafflings: Joi.string().pattern(/^\d+$/).required()
                }).required(),
                otherwise: Joi.object().optional()
            })
        })
    }),
    
    // Reserve price for unlimited raffles
    reservePrice: Joi.when('raffleTypeEnum', {
        is: 'UNLIMITED',
        then: Joi.string().pattern(/^\d+$/).optional(),
        otherwise: Joi.forbidden()
    }),
    
    // Allowlist specific fields
    allowlistConfig: Joi.when('lotteryTypeEnum', {
        is: 'ALLOWLIST',
        then: Joi.object({
            winnerCount: Joi.number().integer().min(1).max(1000).default(1),
            everyoneWins: Joi.boolean().default(false),
            refundLosingEntries: Joi.boolean().default(false),
            requireCaptcha: Joi.boolean().default(false)
        }).optional(),
        otherwise: Joi.forbidden()
    })
});

const ticketPurchaseSchema = Joi.object({
    quantity: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .required()
        .messages({
            'number.min': 'quantity must be at least 1',
            'number.max': 'quantity cannot exceed 100 tickets per purchase',
            'any.required': 'quantity is required'
        }),
    
    userId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'userId must be a valid MongoDB ObjectId',
            'any.required': 'userId is required'
        }),
    
    eventId: Joi.string()
        .optional()
});

const raffleDrawSchema = Joi.object({
    raffleId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'raffleId must be a valid MongoDB ObjectId',
            'any.required': 'raffleId is required'
        })
});

const raffleCancelSchema = Joi.object({
    raffleId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'raffleId must be a valid MongoDB ObjectId',
            'any.required': 'raffleId is required'
        }),
    
    reason: Joi.string()
        .min(10)
        .max(500)
        .optional()
        .messages({
            'string.min': 'reason must be at least 10 characters',
            'string.max': 'reason cannot exceed 500 characters'
        })
});

const allowlistRaffleSchema = Joi.object({
    raffleName: Joi.string()
        .min(3)
        .max(100)
        .required()
        .messages({
            'string.min': 'raffleName must be at least 3 characters',
            'string.max': 'raffleName cannot exceed 100 characters',
            'any.required': 'raffleName is required'
        }),
    
    blockchain: Joi.string()
        .valid('ethereum', 'polygon', 'solana', 'base', 'bsc')
        .required()
        .messages({
            'any.only': 'blockchain must be one of: ethereum, polygon, solana, base, bsc',
            'any.required': 'blockchain is required'
        }),
    
    description: Joi.string()
        .max(1000)
        .optional()
        .messages({
            'string.max': 'description cannot exceed 1000 characters'
        }),
    
    winnerCount: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(1)
        .messages({
            'number.min': 'winnerCount must be at least 1',
            'number.max': 'winnerCount cannot exceed 1000'
        }),
    
    everyoneWins: Joi.boolean().default(false),
    
    startTime: Joi.date()
        .iso()
        .min('now')
        .required()
        .messages({
            'date.min': 'startTime must be in the future',
            'any.required': 'startTime is required'
        }),
    
    endTime: Joi.date()
        .iso()
        .greater(Joi.ref('startTime'))
        .required()
        .messages({
            'date.greater': 'endTime must be after startTime',
            'any.required': 'endTime is required'
        }),
    
    submitVerifiedEmail: Joi.boolean().default(false),
    requireCaptcha: Joi.boolean().default(false),
    
    // Social task configurations
    twitterTasks: Joi.object({
        enabled: Joi.boolean().default(false),
        follow: Joi.string().optional(),
        retweet: Joi.string().optional(),
        like: Joi.string().optional()
    }).optional(),
    
    joinDiscord: Joi.object({
        enabled: Joi.boolean().default(false),
        serverId: Joi.string().optional(),
        serverName: Joi.string().optional()
    }).optional(),
    
    joinTelegram: Joi.object({
        enabled: Joi.boolean().default(false),
        channelId: Joi.string().optional(),
        channelName: Joi.string().optional()
    }).optional(),
    
    // Payment configuration
    presaleRequirePayment: Joi.object({
        enabled: Joi.boolean().default(false),
        token: Joi.string().when('enabled', {
            is: true,
            then: Joi.required(),
            otherwise: Joi.optional()
        }),
        mintPrice: Joi.number().when('enabled', {
            is: true,
            then: Joi.required().min(0),
            otherwise: Joi.optional()
        }),
        refundLosingEntries: Joi.boolean().default(false)
    }).optional(),
    
    // Wallet constraints
    submitWalletAddress: Joi.object({
        enabled: Joi.boolean().default(false),
        constraints: Joi.array().items(Joi.string()).optional()
    }).optional()
});

/**
 * Validation middleware factory
 */
const createValidationMiddleware = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        
        if (error) {
            const errorDetails = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errorDetails
            });
        }
        
        // Replace req.body with validated and sanitized data
        req.body = value;
        next();
    };
};

module.exports = {
    raffleCreationSchema,
    ticketPurchaseSchema,
    raffleDrawSchema,
    raffleCancelSchema,
    allowlistRaffleSchema,
    createValidationMiddleware,
    
    // Middleware exports
    validateRaffleCreation: createValidationMiddleware(raffleCreationSchema),
    validateTicketPurchase: createValidationMiddleware(ticketPurchaseSchema),
    validateRaffleDraw: createValidationMiddleware(raffleDrawSchema),
    validateRaffleCancel: createValidationMiddleware(raffleCancelSchema),
    validateAllowlistRaffle: createValidationMiddleware(allowlistRaffleSchema)
};