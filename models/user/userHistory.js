const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userHistorySchema = new Schema({
  userRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  eventType: {
    type: String,
    enum: ['game', 'raffle', 'shop'],
    index: true,
    required: true
  },
  eventId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['lost', 'won', 'purchased', 'sold', 'live'],
    index: true
  },
  amount: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  dateCreated: {
    type: Date,
    default: Date.now,
    required: true
  },
  file: String, // for shop-item (file)
  csvCode: String, // for shop-item (csv)
}, { timestamps: true });

module.exports = mongoose.model("UserHistory", userHistorySchema);