const mongoose = require("mongoose");
const { Schema } = mongoose;

const sequenceSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
		},
		value: {
			type: Number,
			required: true,
			default: 1,
		},
		resets: {
			type: Number,
			default: 0,
		},
	},
	{ timestamps: true },
);

module.exports = mongoose.model("Sequence", sequenceSchema);
