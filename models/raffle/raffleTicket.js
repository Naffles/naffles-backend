const mongoose = require("mongoose");
const { Schema } = mongoose;

const raffleTicketSchema = new Schema({
	purchasedBy: {
		type: Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true,
	},
	raffle: {
		type: Schema.Types.ObjectId,
		ref: "Raffle",
		required: true,
		index: true,
	},
	naffleTicketId: {
		type: String,
		required: true,
		unique: true,
		index: true,
	},
	isFree: {
		type: Boolean,
		required: true,
		default: false,
	},
	isOpenEntry: {
		type: Boolean,
		required: true,
		default: false,
	},
	ticketNumber: {
		type: Number,
		index: true,
		sparse: true,
	},
});

const RaffleTicket = mongoose.model("RaffleTicket", raffleTicketSchema);
module.exports = RaffleTicket;
