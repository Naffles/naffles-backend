const updateOrAddActivity = async (existingArray, newActivities, Model) => {
    // Get all existing activities from the database in one query
    const existingActivities = new Map(existingArray.map(item => [item.activity, item]));

    const updates = [];
    const inserts = [];

    newActivities.forEach(activity => {
        const existingActivity = existingActivities.get(activity.activity);
        if (existingActivity) {
            // Update existing activity
            existingActivity.points = activity.points;
            updates.push(existingActivity);
        } else {
            // Add new activity
            const newActivity = new Model({
                activity: activity.activity,
                points: activity.points
            });
            inserts.push(newActivity);
        }
    });

    // Save all updates in one go
    if (updates.length > 0) {
        await Model.bulkWrite(
            updates.map(activity => ({
                updateOne: {
                    filter: { _id: activity._id },
                    update: { points: activity.points }
                }
            }))
        );
    }

    // Save all new activities in one go
    if (inserts.length > 0) {
        const insertedActivities = await Model.insertMany(inserts);
        existingArray.push(...insertedActivities.map(activity => activity._id));
    }
};

module.exports = {
    updateOrAddActivity
};