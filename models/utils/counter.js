const mongoose = require("mongoose");
const { Schema } = mongoose;

// Counter schema for maintaining unique sequence numbers
const counterSchema = new Schema({
  name: {
    type: String,
    required: true,
    index: true
  },
  sequenceValue: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("Counter", counterSchema);