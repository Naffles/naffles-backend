const UserLog = require("../models/user/userLog");

exports.logUserEvent = async (activityDetails, socket) => {
    try {
        const newLog = new UserLog(activityDetails);
        await newLog.save();
    } catch (error) {
        console.error('Error logging user activity:', error);
        throw error;
    }
}