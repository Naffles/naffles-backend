const mongoose = require("mongoose");
const Message = require("../models/chat/message");
const ActiveGame = require("../models/game/activeGame");
const { getUserProfileImage } = require("../utils/image");
const sendResponse = require("../utils/responseHandler");

exports.getChatHistory = async (req, res) => {
    const { cursor } = req.query;
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 20); // Enforce max limit of 20

    try {
        let query = { message: { $ne: "" } };
        if (cursor) {
            query._id = { $lt: cursor };
        }

        const messages = await Message.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .lean();

        const chatMessages = await Promise.all(
            messages.map(async (message) => {
                const profileImgUrl = await getUserProfileImage(message.profileImage);
                const sender = {
                    username: message.username,
                    profileImage: profileImgUrl,
                    _id: message.userRef
                };

                const globalMessage = {
                    id: message._id,
                    sender: sender,
                    message: message.message,
                    timestamp: message.timestamp
                };

                if (message?.game) {
                    const game = await ActiveGame.findOne({
                        _id: mongoose.Types.ObjectId(message.game),
                        status: "waiting",
                    });

                    if (game) {
                        globalMessage.game = game;
                    }
                }
                return globalMessage;
            })
        );

        // Filter out any null values (messages without active games)
        const validChatMessages = chatMessages.filter((msg) => msg !== null);
        const response = {
            messages: validChatMessages.reverse(),
            nextCursor: messages.length ? messages[messages.length - 1]._id : null
        };

        sendResponse(res, 200, "Successfully fetched old messages", response);
    } catch (error) {
        console.error("Failed to retrieve chat history:", error);
        return sendResponse(res, 500, "Failed to retrieve data", error.message);
    }
};
