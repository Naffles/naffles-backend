module.exports = {
  async up(db, client) {
    console.log("Adding new activities to PointsEarningActivitiesSettings and updating AdminSettings...");

    const newActivities = [
      "perCommunityTicketPurchase",
      "perCommunityGamePlayed",
      "perCommunitySocialTaskCompleted",
      "perCommunityAllowlistEntered",
      "perCommunityProductPurchased",
    ];

    try {
      const createdActivityIds = [];

      // Add new activities to PointsEarningActivitiesSettings
      for (const activity of newActivities) {
        const exists = await db.collection("pointsearningactivitiessettings").findOne({ activity });
        if (!exists) {
          console.log(`Adding activity: ${activity}`);
          const result = await db.collection("pointsearningactivitiessettings").insertOne({ activity, points: 0 });
          createdActivityIds.push(result.insertedId);
        } else {
          console.log(`Activity already exists: ${activity}`);
          createdActivityIds.push(exists._id);
        }
      }

      console.log("Adding references to AdminSettings...");

      // Add the created activities to AdminSettings' pointsEarningActivities field
      await db.collection("adminsettings").updateOne(
        {}, // Assuming there's only one AdminSettings document
        { $push: { pointsEarningActivities: { $each: createdActivityIds } } }
      );

      console.log("All new activities added and AdminSettings updated successfully.");
    } catch (error) {
      console.error("Error adding activities and updating AdminSettings:", error);
      throw error;
    }
  },

  async down(db, client) {
    console.log("Removing new activities from PointsEarningActivitiesSettings and updating AdminSettings...");

    const newActivities = [
      "perCommunityTicketPurchase",
      "perCommunityGamePlayed",
      "perCommunitySocialTaskCompleted",
      "perCommunityAllowlistEntered",
      "perCommunityProductPurchased",
    ];

    try {
      const activityIdsToRemove = [];

      // Find and remove new activities from PointsEarningActivitiesSettings
      for (const activity of newActivities) {
        console.log(`Removing activity: ${activity}`);
        const result = await db.collection("pointsearningactivitiessettings").findOneAndDelete({ activity });
        if (result.value) {
          activityIdsToRemove.push(result.value._id);
        }
      }

      console.log("Removing references from AdminSettings...");

      // Remove the activities from AdminSettings' pointsEarningActivities field
      await db.collection("adminsettings").updateOne(
        {}, // Assuming there's only one AdminSettings document
        { $pull: { pointsEarningActivities: { $in: activityIdsToRemove } } }
      );

      console.log("All new activities removed and AdminSettings updated successfully.");
    } catch (error) {
      console.error("Error removing activities and updating AdminSettings:", error);
      throw error;
    }
  },
};
