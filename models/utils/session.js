// models/Session.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
  key: { type: String, required: true, unique: true },
  cookies: { type: Array, default: [] },
  localStorage: { type: Map, of: String, default: {} },
  bearerToken: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Session", sessionSchema);
