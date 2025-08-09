module.exports = {
	async up(db, client) {
		// Update documents to set the eventType based on the presence of raffle or allowlist
		await db.collection("ticketnumbercounters").updateMany(
			{ raffle: { $exists: true } }, // Match documents with a raffle field
			{ $set: { eventType: "raffle" } }, // Set eventType to 'raffle'
		);

		await db.collection("ticketnumbercounters").updateMany(
			{ allowlist: { $exists: true } }, // Match documents with an allowlist field
			{ $set: { eventType: "allowlist" } }, // Set eventType to 'allowlist'
		);
	},

	async down(db, client) {
		// Roll back by removing the eventType field
		await db.collection("ticketnumbercounters").updateMany(
			{}, // Match all documents
			{ $unset: { eventType: "" } }, // Remove the eventType field
		);
	},
};
