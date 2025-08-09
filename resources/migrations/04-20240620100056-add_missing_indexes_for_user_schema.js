module.exports = {
  async up(db, client) {
    // Create ascending and unique index on username field
    await db.collection("users").createIndex({ username: 1 }, { unique: true });
    // Create ascending unique sparse index on the email field
    await db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true });
    // Create text index on the username and email fields
    await db.collection("users").createIndex({ username: "text", email: "text" });
    // Create descending index on the temporaryPointsAsNumber field
    await db.collection("users").createIndex({ temporaryPointsAsNumber: -1 });
  },

  async down(db, client) {
    // Remove the indexes
    await db.collection("users").dropIndex({ username: 1 });
    await db.collection("users").dropIndex({ email: 1 });
    await db.collection("users").dropIndex({ username: "text", email: "text" });
    await db.collection("users").dropIndex({ temporaryPointsAsNumber: -1 });
  }
};
