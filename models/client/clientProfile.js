const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Helper function to generate the random name
function generateRandomPointSystemName() {
  // Generate a random 6-letter string
  const randomLetters = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Generate a random 3-digit number
  const randomNumber = Math.floor(100 + Math.random() * 900);

  // Get current datetime in the format YYYYMMDDHHMMSS
  const currentDateTime = new Date().toISOString().replace(/[-:.T]/g, "").slice(0, 14);

  // Combine them together
  return `${randomLetters}${randomNumber}${currentDateTime}`;
}

const clientProfileSchema = new Schema({
  adminRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
    unique: true, // 1 per account
  },
  expiresAt: {
    type: Date,
    index: true,
    sparse: true
  },
  totalMembers: {
    type: Number,
    default: 0,
  },
  name: {
    type: String,
    trim: true,
    max: 30,
    min: 1,
    index: true,
    sparse: true
  },
  description: {
    type: String,
    trim: true,
    max: 100,
    min: 1,
  },
  pointSystem: {
    nameInsensitive: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
      sparse: true,
      max: 30,
      min: 1,
      default: generateRandomPointSystemName, // Use the helper function as the default
    },
    status: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  chatSystem: {
    type: Boolean,
    default: true,
  },
  socials: {
    twitter: {
      type: String,
      trim: true,
      lowercase: true,
      max: 50,
      min: 2
    },
    discord: {
      type: String,
      trim: true,
      lowercase: true,
      max: 50,
      min: 2
    },
    telegram: {
      type: String,
      trim: true,
      lowercase: true,
      max: 50,
      min: 2
    }
  },
  defaultGames: {
    enabled: {
      type: Boolean,
      default: true,
    },
    buyInAmount: {
      type: Number,
      default: 0,
    }
  },
  jackpotPointsAccumulationPerTenSeconds: {
    amount: {
      type: Number,
      default: 0,
    },
    lastUpdated: {
      type: Date,
    }
  },
  pointsJackpot: {
    status: {
      type: Boolean,
      default: true,
      index: true
    },
    periodInDays: {
      type: Number,
      default: 7,
    }
  },
  backgroundImage: {
    type: String,
  },
  icon: {
    type: String,
  }
}, { timestamps: true });

// Create a descending index on createdAt for efficient sorting
clientProfileSchema.index({ createdAt: -1 });

// Pre-save hook to update lastUpdated field
clientProfileSchema.pre('save', function (next) {
  if (this.isNew) {
    this.jackpotPointsAccumulationPerTenSeconds.lastUpdated = this.createdAt;
  }
  next();
});

// Pre-validate hook to remove all whitespace from pointSystem.name
clientProfileSchema.pre('validate', function (next) {
  if (this.pointSystem && this.pointSystem.name) {
    // Remove all whitespace from the name (including in-between letters)
    this.pointSystem.name = this.pointSystem.name.replace(/\s+/g, "");

    // Check if the value contains 'naff'
    if (this.pointSystem.name.includes('naff')) {
      const validationError = new mongoose.Error.ValidationError(this);
      validationError.errors.pointSystemName = new mongoose.Error.ValidatorError({
        message: "The point system name cannot contain 'naff'.",
        path: "pointSystem.name",
      });
      return next(validationError.errors.pointSystemName);
    }
  }
  next();
});

clientProfileSchema.post('save', function (error, doc, next) {
  if (error.name === 'MongoError' && error.code === 11000) {
    // Check for duplicate key error in pointSystem.name
    if (error.keyPattern && error.keyPattern['pointSystem.name']) {
      const validationError = new mongoose.Error.ValidationError(this);
      validationError.errors.pointSystemName = new mongoose.Error.ValidatorError({
        message: "The point system name must be unique. The value provided already exists.",
        path: "pointSystem.name",
        value: this.pointSystem.name
      });
      return next(validationError.errors.pointSystemName);
    }
  }
  next(error); // Pass the original error to the next middleware if not E11000
});


module.exports = mongoose.model("ClientProfile", clientProfileSchema);
