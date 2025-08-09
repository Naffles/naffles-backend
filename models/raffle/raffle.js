const mongoose = require("mongoose");
require("mongoose-long")(mongoose);
const { Schema } = mongoose;
const {
	Types: { Long },
} = mongoose;
const { RAFFLE_TYPES, LOTTERY_TYPES } = require("../../config/config");
const TicketDiscount = require("../../utils/enums/ticketDiscounts");
const ClientAdminActivityManagement = require("../client/clientAdminActivityManagement");
const RaffleConstants = require("../../utils/constants/RaffleConstants");
const { convertToNum } = require("../../utils/convert");

const raffleSchema = new Schema(
	{
		rafflePrize: {
			type: Schema.Types.ObjectId,
			ref: "RafflePrize",
			required: true,
			index: true,
		},
		eventId: {
			type: String,
			required: true,
			unique: true,
		},
		coinType: {
			type: String,
			index: true,
			sparse: true,
		},
		lotteryTypeEnum: {
			type: String,
			enum: LOTTERY_TYPES,
			required: true,
			index: true,
		},
		raffleTypeEnum: {
			type: String,
			enum: RAFFLE_TYPES,
			required: true,
			index: true,
		},
		raffleEndDate: {
			type: Date,
			index: true,
			sparse: true,
		},
		raffleDurationDays: {
			type: Number,
			required: true,
			default: 0,
		},
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		status: {
			isActive: {
				type: Boolean,
				default: true,
				index: true,
			},
			wonBy: {
				type: Schema.Types.ObjectId,
				ref: "User",
				default: null,
			},
			isCompleted: {
				type: Boolean,
				default: false,
				index: true,
			},
			completedAt: {
				type: Date,
				default: null,
			},
		},
		vrf: {
			status: {
				type: String,
				enum: [
					"Pending", // default
					"In Progress", // requested for a job successfully
					"Fulfilled", // the vrf has returned a number
					"Failed", // an error occurred when requesting a random number
					"Completed" // the prize and earnings was distributed
				],
				default: "Pending",
			},
			transactionHash: {
				type: String,
				default: null,
			},
			polygonTxHash: {
				type: String,
				default: null,
			},
			winningTicketNumber: {
				type: Number,
				default: 0,
			},
			requestId: {
				type: String,
				default: null,
			},
			failsafeUsed: {
				type: Boolean,
				default: false,
			},
			sourceChain: {
				type: String,
				default: 'ethereum',
			},
			retryCount: {
				type: Number,
				default: 0,
			},
			failureReason: {
				type: String,
				default: null,
			},
			completedAt: {
				type: Date,
				default: null,
			},
		},
		ticketsSold: {
			type: Number,
			required: true,
			default: 0,
		},
		ticketsAvailable: {
			type: Number,
			default: 0,
		},
		ticketsAvailableOpenEntry: {
			type: Number,
			default: 0,
			index: true,
		},
		perTicketPrice: {
			type: String,
			required: true,
			default: "0",
		},
		perTicketPriceNumber: {
			type: Long, // Using Long for handling large numbers
			required: true,
			default: 0,
			select: false,
			index: true,
		},
		discountCode: {
			type: Number,
			enum: TicketDiscount.codes(),
			default: null,
		},
		homepageDurationDays: {
			type: Number,
			default: null,
		},
		isFeatured: {
			type: Boolean,
			default: false,
		},
		isCancelled: {
			type: Boolean,
			default: false,
		},
		cancelledBy: {
			type: Schema.Types.ObjectId,
			ref: "User",
			default: null,
		},
		cancelledAt: {
			type: Date,
			default: null,
		},
		refundProcessed: {
			type: Boolean,
			default: false,
		},
		clientProfileRef: {
			// Community
			type: Schema.Types.ObjectId,
			ref: "ClientProfile",
			index: true,
			sparse: true,
		},
		// Asset validation and escrow fields
		assetValidated: {
			type: Boolean,
			default: false,
		},
		escrowStatus: {
			type: String,
			enum: ["pending", "escrowed", "released", "returned"],
			default: "pending",
		},
		escrowTransactionHash: {
			type: String,
			default: null,
		},
		escrowAddress: {
			type: String,
			default: null,
		},
		// Reserve price for unlimited raffles
		reservePrice: {
			type: String,
			default: null,
		},
		reservePriceNumber: {
			type: Long,
			default: 0,
			select: false,
		},
		reserveMet: {
			type: Boolean,
			default: false,
		},
		// Entry requirements for allowlist raffles
		entryRequirements: [{
			type: {
				type: String,
				enum: ["social_task", "wallet_constraint", "email_verification", "captcha"],
			},
			platform: String, // twitter, discord, telegram
			action: String, // follow, join, retweet, etc.
			target: String, // username, server id, etc.
			required: {
				type: Boolean,
				default: true,
			}
		}],
		// Allowlist specific fields
		allowlistConfig: {
			winnerCount: {
				type: Number,
				default: 1,
			},
			everyoneWins: {
				type: Boolean,
				default: false,
			},
			refundLosingEntries: {
				type: Boolean,
				default: false,
			},
			requireCaptcha: {
				type: Boolean,
				default: false,
			}
		}
	},
	{
		timestamps: true,
		toObject: { virtuals: true },
		toJSON: { virtuals: true },
	},
);

// Add a pre-save middleware
raffleSchema.pre("save", function (next) {
	// Use 'this' to refer to the current document
	if (this.isNew || this.isModified("raffleDurationDays")) {
		if (this.raffleDurationDays !== 0) {
			const start = this.createdAt.getTime();
			const duration = this.raffleDurationDays * 24 * 60 * 60 * 1000;
			this.raffleEndDate = new Date(start + duration);
		}
	}

	if (this.isModified("perTicketPrice")) {
		this.perTicketPriceNumber = Long.fromString(this.perTicketPrice);
	}

	if (this.isModified("reservePrice") && this.reservePrice) {
		this.reservePriceNumber = Long.fromString(this.reservePrice);
	}

	next();
});

raffleSchema.virtual("winner", {
	ref: "User", // The model to use for the reference
	localField: "status.wonBy", // Field in this schema
	foreignField: "_id", // Field in the referenced schema
	justOne: true, // Ensure we get a single document
});

module.exports = mongoose.model("Raffle", raffleSchema);
