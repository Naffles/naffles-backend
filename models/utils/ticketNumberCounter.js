const mongoose = require("mongoose");
const { Schema } = mongoose;

const ticketNumberCounterSchema = new Schema({
	raffle: {
		type: Schema.Types.ObjectId,
		ref: "Raffle",
	},
	allowlist: {
		type: Schema.Types.ObjectId,
		ref: "Allowlist",
	},
	eventType: {
		type: String,
		enum: ["raffle", "allowlist"],
		required: true, // Ensure eventType is always set
	},
	ticketNumber: {
		type: Number,
		default: 0,
	},
});

// Create partial unique indexes
ticketNumberCounterSchema.index(
	{ raffle: 1 },
	{ unique: true, partialFilterExpression: { raffle: { $exists: true } } }
);

ticketNumberCounterSchema.index(
	{ allowlist: 1 },
	{ unique: true, partialFilterExpression: { allowlist: { $exists: true } } }
);

const TicketNumberCounter = mongoose.model(
	"TicketNumberCounter",
	ticketNumberCounterSchema
);

module.exports = TicketNumberCounter;
