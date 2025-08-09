const mongoose = require("mongoose");
const { Schema } = mongoose;

const ticketSaleSchema = new Schema(
	{
		raffle: {
			type: Schema.Types.ObjectId,
			ref: "Raffle",
			required: true,
			index: true,
		},
		raffleTickets: [
			{
				type: Schema.Types.ObjectId,
				ref: "RaffleTicket",
				required: true,
				index: true,
			},
		],
		// Total cost of tickets purchased
		total: {
			type: String,
			required: true,
			default: "0",
			index: true,
		},
		saleType: {
			type: String,
			enum: ["purchase", "free"],
			default: "purchase",
		},
		buyerRef: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
	},
	{ timestamps: true },
);

const TicketSale = mongoose.model("TicketSale", ticketSaleSchema);
module.exports = TicketSale;
