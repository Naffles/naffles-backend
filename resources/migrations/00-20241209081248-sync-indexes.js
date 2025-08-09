const mongoose = require('mongoose');

module.exports = {
  async up(db, client) {
    console.log("Synchronizing indexes for all Mongoose models...");

    try {
      // Access all Mongoose models and sync their indexes
      const models = mongoose.models;
      for (const modelName in models) {
        if (Object.hasOwnProperty.call(models, modelName)) {
          const model = models[modelName];
          console.log(`Syncing indexes for model: ${modelName}`);
          await model.syncIndexes(); // Sync indexes for the current model
        }
      }
      console.log("All indexes synchronized successfully.");
    } catch (error) {
      console.error("Error during index synchronization:", error);
      throw error; // Ensure the migration fails if there is an error
    }
  },

  async down(db, client) {
    console.log("Rollback is not applicable for index synchronization.");
    // No rollback implementation needed since syncing indexes is a non-destructive operation
  },
};
