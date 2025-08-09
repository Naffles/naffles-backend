const { convertToNum } = require("../utils/convert");
const UserStats = require("../models/analytics/userStats");
const { generateId } = require("../utils/sequenceUtil");
const SequenceConstants = require("../utils/constants/SequenceConstants");

function updateTemporaryPointsAsNumberUser(schema) {
	schema.pre("save", async function (next) {
		if (this.isModified("temporaryPoints")) {
			this.temporaryPointsAsNumber = await convertToNum(
				this.temporaryPoints,
				"nafflings",
			);
			this._tempPointsModified = true;
		}
		next();
	});
}

function updateUserStatsTemporaryPointsAsNumberUser(schema) {
	schema.post("save", async function (doc, next) {
		if (doc._tempPointsModified) {
			await UserStats.findOneAndUpdate(
				{ user: doc._id },
				{ $set: { temporaryPointsAsNumber: doc.temporaryPointsAsNumber } },
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			);
		}
		next();
	});
}

function createNewGiveawayPresave(schema) {
	schema.pre("save", async function (next) {
		const session = this.$session();
		if (this.isNew) {
			this.eventId = await generateId(session, {
				prefix: SequenceConstants.GIVEAWAY_EVENT_PREFIX,
				name: SequenceConstants.GIVEAWAY_EVENT_ID,
			});
		}
		next();
	});
}

module.exports = {
	updateTemporaryPointsAsNumberUser,
	updateUserStatsTemporaryPointsAsNumberUser,
	createNewGiveawayPresave,
};
