const mongoose = require("mongoose");
const { Schema } = mongoose;

const allowlistTicketSchema = new Schema(
	{
		allowlistRef: {
			type: Schema.Types.ObjectId,
			ref: "Allowlist",
			index: true,
		},
		ticketNumber: {
			type: Number,
			index: true,
			sparse: true,
		},
		allowlistTicketId: {
			type: Number,
			index: true,
			unique: true,
			sparse: true,
		},
		emailAddress: {
			type: String,
		},
		walletAddressRef: {
			type: Schema.Types.ObjectId,
			ref: "WalletAddress",
		},
		purchasedBy: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		purchaseDate: {
			type: Date,
			index: true,
			sparse: true,
			default: Date.now(),
		},
	},
	{ timestamps: true },
);

const AllowlistTicket = mongoose.model(
	"AllowlistTicket",
	allowlistTicketSchema,
);
module.exports = AllowlistTicket;
