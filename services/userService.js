const UserHistory = require("../models/user/userHistory");

exports.createUserHistory = async (session, userId, options = {}) => {
	const { eventType, eventId, status, amount, details } = options;

	const userHistory = new UserHistory({
		userRef: userId,
		eventType,
		eventId,
		status,
		amount,
		details,
	});

	await userHistory.save({ session });
};
