const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const depositSchema = new Schema({
  userRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  trackingNumber: {
    type: Number,
    required: true
  },
  fromAddress: {
    type: String,
    required: true,
    index: true,
  },
  amount: {
    type: String,
    default: "0",
  },
  transactionHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  coinType: {
    type: String,
    required: true,
  },
  network: {
    type: String,
    required: true,
  },
  blockNumber: {
    type: Number,
    sparse: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  }
}, { timestamps: true });

depositSchema.pre("validate", async function (next) {
  if (this.isNew) {
    // Check if this is a new document
    const lastDeposit = await this.constructor.findOne({ userRef: this.userRef })
      .sort({ trackingNumber: -1 });

    if (lastDeposit && lastDeposit.trackingNumber !== undefined) {
      // If last deposit has a trackingNumber, increment it
      this.trackingNumber = lastDeposit.trackingNumber + 1;
    } else {
      // If no deposit or no trackingNumber, calculate the tracking number
      const depositCount = await this.constructor.countDocuments({ userRef: this.userRef });
      this.trackingNumber = depositCount + 1;
    }
  }
  next();
});

module.exports = mongoose.model("Deposit", depositSchema);