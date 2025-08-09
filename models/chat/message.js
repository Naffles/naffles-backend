const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  userRef: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  message: {
    type: String,
  },
  profileImage: {
    type: String,
    default: "",
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  game: {
    type: Schema.Types.ObjectId,
    ref: 'ActiveGame',
    index: true
  }
});

module.exports = mongoose.model('Message', messageSchema);
