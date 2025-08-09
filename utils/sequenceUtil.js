const Sequence = require("../models/sequence");
const moment = require("moment");
const MomentFormatConstants = require("./constants/MomentFormatConstants");

async function getNextSequenceValue(session = null, name, max = 9999) {
	const sequenceDoc = await Sequence.findOneAndUpdate(
		{ name: name },
		{ $inc: { value: 1 } },
		{ new: true, upsert: true, setDefaultsOnInsert: true },
	).session(session);

	// Retrieve the value before updating
	const value = sequenceDoc.value;

	// If the sequence value reaches max,
	// reset `value` to 1 and increment `resets` by 1
	if (sequenceDoc.value === max) {
		console.log("MAX VALUE REACHED, RESETTING...");
		sequenceDoc.value = 1;
		sequenceDoc.resets += 1;
		await sequenceDoc.save({ session });
	}

	return value;
}

async function generateId(session, options = {}) {
	const { prefix, name, format, max = 999 } = options;
	const nextVal = await getNextSequenceValue(session, name, max);
	const nextValStr = nextVal.toString().padStart(max.toString().length, "0");
	const formattedDate = moment().format(format || MomentFormatConstants.YYMMDD);
	// PREFIX + formattedDate + nextVal
	return `${prefix}${formattedDate}${nextValStr}`;
}

async function generateTicketId(session, options = {}) {
	const {
		numberOnly = true,
		name,
		dateFormat,
		max = 9999999, // Max = 10 Mil - 1
	} = options;
	const nextVal = await getNextSequenceValue(session, name, max);
	const nextValStr = nextVal.toString().padStart(max.toString().length, "0");
	const formattedDate = moment().format(
		dateFormat || MomentFormatConstants.YYMMDD,
	);
	if (numberOnly) {
		// Generate Ticket Number that consists of int values only
		// `<date><number>` e.g. 2411084567890
		return Number(`${formattedDate}${nextValStr}`);
	}
}

module.exports = {
	getNextSequenceValue,
	generateId,
	generateTicketId,
};
