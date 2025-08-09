const mongoose = require("mongoose");
const { Schema } = mongoose;

// will show on homepage, featured on homepage
const featuredTokenSchema = new Schema(
  {
    image: {
      type: String,
      required: true,
      trim: true
    },
    tokenName: {
      type: String,
      required: [true, "token must have a name"],
      unique: true,
      index: true,
      maxLength: 100,
      trim: true,
      lowercase: true
    },
    description: {
      type: String,
      required: true,
      maxLength: 1000,
      trim: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("featuredToken", featuredTokenSchema);
