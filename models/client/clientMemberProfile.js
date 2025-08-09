const mongoose = require("mongoose");
const ClientProfile = require("./clientProfile");
const Schema = mongoose.Schema;

const clientMemberProfile = new Schema({
  clientProfileRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientProfile",
    required: true,
    index: true,
  },
  memberRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  points: {
    earned: {
      type: Number,
      default: 0,
      index: true,
    },
    used: {
      type: Number,
      default: 0,
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      index: true,
    }
  }
}, { timestamps: true });

// Create a compound unique index on clientProfileRef and memberRef
clientMemberProfile.index({ clientProfileRef: 1, memberRef: 1 }, { unique: true });

// Pre-save hook to calculate the balance before saving
clientMemberProfile.pre('save', function (next) {
  // Calculate balance by subtracting used points from earned points
  this.points.balance = this.points.earned - this.points.used;
  next();
});

// Post-save hook to sync with UserHistory
clientMemberProfile.post('save', async function (doc, next) {
  try {
    // count then save it on ClientProfile
    const totalMembers = await this.constructor.countDocuments({ clientProfileRef: doc.clientProfileRef });
    await ClientProfile.findByIdAndUpdate(doc.clientProfileRef, { totalMembers });
  } catch (error) {
    console.error("Error syncing with UserHistory:", error);
  }

  next();
});

module.exports = mongoose.model("ClientMemberProfile", clientMemberProfile);
