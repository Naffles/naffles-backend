const mongoose = require("mongoose");
const ClientAdminActivityManagement = require("../clientAdminActivityManagement");
const { Schema } = mongoose;

const allowlistSchema = new Schema(
	{
		// Details
		raffleName: {
			type: String,
		},
		blockchain: {
			type: String,
		},
		description: {
			type: String,
			maxLength: 5000,
		},
		banner: {
			type: String,
			default: "",
		},
		// Raffle Setup
		winnerCount: {
			type: Number,
			default: 0,
		},
		everyoneWins: {
			type: Boolean,
			default: false,
		},
		startTime: {
			type: Date,
		},
		endTime: {
			type: Date,
		},
		// Requirements
		submitVerifiedEmail: {
			type: Boolean,
			default: false,
		},
		paymentTerms: {
			enabled: {
				type: Boolean,
				default: false,
			},
			token: {
				type: String,
			},
			mintPrice: {
				type: String,
				default: "0",
			},
			refundLosingEntries: {
				type: Boolean,
				default: false,
			},
			applyProfitGuarantee: {
				pgPct: {
					type: Number,
					max: 1,
				},
				reserveStakePct: {
					type: Number,
					enum: [0, 0.5, 1, 2],
				},
			},
			totalTicketPrice: {
				type: String,
				default: "0",
			},
			totalProfitGuarantee: {
				type: String,
				default: "0",
			},
		},
		submitWalletAddress: {
			enabled: {
				type: Boolean,
				default: true,
			},
			constraints: {
				nft: {
					type: String,
				},
				token: {
					type: String,
				},
			},
		},
		joinDiscord: {
			enabled: {
				type: Boolean,
				default: false,
			},
			clientTaskRef: {
				type: Schema.Types.ObjectId,
				ref: "ClientTask",
				index: true,
			},
		},
		twitterTasks: {
			enabled: {
				type: Boolean,
				default: false,
			},
			clientTaskRef: {
				type: Schema.Types.ObjectId,
				ref: "ClientTask",
				index: true,
			},
		},
		joinTelegram: {
			enabled: {
				type: Boolean,
				default: false,
			},
			clientTaskRef: {
				type: Schema.Types.ObjectId,
				ref: "ClientTask",
				index: true,
			},
		},
		requireCaptcha: {
			type: Boolean,
			default: false,
		},
		allowlistType: {
			type: String,
			enum: ["pre-sale", "free"],
			default: "free",
		},
		// Community
		clientProfileRef: {
			type: Schema.Types.ObjectId,
			ref: "ClientProfile",
			index: true,
			sparse: true,
		},
		status: {
			type: String,
			enum: ["live", "drawing", "ended", "cancelled", "cancelled_zero_entries"],
			default: "live",
			index: true,
		},
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		eventId: {
			type: String,
			required: true,
			unique: true,
		},
		vrf: {
			status: {
				type: String,
				enum: [
					"Pending",
					"In Progress",
					"Fulfilled",
					"Failed",
					"Cancelled",
					"Expired",
				],
				default: "Pending",
			},
			transactionHash: {
				type: String,
				default: null,
			},
			winningTicketNumbers: {
				type: [Number],
				default: [],
			},
		},
		cancelledAt: {
			type: Date,
		},
		winnersGcsKey: String,
	},
	{ timestamps: true },
);

allowlistSchema.pre("save", function (next) {
	// If paymentTerms exists and mintPrice or reserveStakePct is modified
	// recalculate total ticket price
	if (
		this.paymentTerms?.enabled &&
		(this.isModified("paymentTerms.mintPrice") ||
			(this.paymentTerms?.applyProfitGuarantee &&
				this.isModified("paymentTerms.applyProfitGuarantee.reserveStakePct")))
	) {
		const mintPrice = BigInt(this.paymentTerms.mintPrice);
		const reserveStakePct =
			this.paymentTerms.applyProfitGuarantee?.reserveStakePct ?? 0;
		const reserveStake = BigInt(reserveStakePct * 100);

		const total = mintPrice + (mintPrice * reserveStake) / BigInt(100);
		this.paymentTerms.totalTicketPrice = total.toString();
	}

	// If winner is limited (not everyoneWins), paymentTerms exists
	// AND mintPrice or profit guarantee is modified
	// recalculate total profit guarantee to be
	// divided among losing entries
	if (
		this.winnerCount > 0 &&
		this.paymentTerms?.enabled &&
		(this.isModified("paymentTerms.mintPrice") ||
			(this.paymentTerms?.applyProfitGuarantee &&
				this.isModified("paymentTerms.applyProfitGuarantee.pgPct")))
	) {
		const mintPrice = BigInt(this.paymentTerms.mintPrice);
		const pgPct = this.paymentTerms.applyProfitGuarantee.pgPct ?? 0;
		const profitGuarantee = BigInt(pgPct * 100);

		const total =
			((mintPrice * profitGuarantee) / BigInt(100)) * BigInt(this.winnerCount);
		this.paymentTerms.totalProfitGuarantee = total.toString();
	}

	next();
});

allowlistSchema.post("save", async function (doc, next) {
	const session = this.$session();
	try {
		const activity = new ClientAdminActivityManagement({
			clientProfileRef: doc.clientProfileRef,
			adminRef: doc.createdBy,
			itemType: "allowlist-raffle",
			eventId: doc._id,
			details: doc.raffleName,
			startDate: doc.startTime,
			endDate: doc.endTime,
		});

		await activity.save({ session });
		next();
	} catch (err) {
		console.error(
			"Error post-saving of Allowlist to ClientAdminActivityManagement:",
			err,
		);
	}
});

const Allowlist = mongoose.model("Allowlist", allowlistSchema);
module.exports = Allowlist;
