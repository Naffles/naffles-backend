module.exports = {
  async up(db) {
    await db.collection('users').updateMany(
      { email: "" },
      {
        $unset: { email: "" }  // Remove the email field
      }
    );

    await db.collection('users').updateMany(
      { email: { $exists: true, $ne: null } },  // Only update documents where email exists and is not null
      [
        {
          $set: {
            username: { $toLower: "$username" },
            email: { $toLower: "$email" }
          }
        }
      ]
    );
  },

  async down(db) {
    // If you need to revert the lowercase transformation, you can do so here.
    // Note: This might not be straightforward if you don't have the original casing stored.
    // You might opt to leave this empty or implement logic based on your specific needs.
  }
};
