const mongoose = require("mongoose");
const { Schema } = mongoose;

// will show on homepage, featured on homepage
const featuredCommunitySchema = new Schema(
  {
    image: {
      type: String,
      required: true,
      trim: true
    },
    communityName: {
      type: String,
      required: [true, "community must have a name"],
      unique: true,
      index: true,
      maxLength: 100,
      trim: true,
      lowercase: true
    },
    twitterUsername: {
      type: String,
      maxLength: 100,
      trim: true
    },
    discordInviteUrl: {
      type: String,
      maxLength: 100,
      trim: true
    },
    webUrl: {
      type: String,
      maxLength: 100,
      trim: true
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

module.exports = mongoose.model("FeaturedCommunity", featuredCommunitySchema);
