const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const ClientAdminActivityManagement = require("../../clientAdminActivityManagement");
const { VALID_COMMUNITY_TASK } = require("../../../../config/config");

const isRequiredForEarnType = (earnType) => {
  return function () {
    return this.earnType === earnType;
  };
};

const clientTaskSchema = new Schema({
  clientProfileRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientProfile",
    required: true,
    index: true,
  },
  adminRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  points: {
    type: Number,
    required: true,
    min: 0,
  },
  earnType: {
    type: String,
    required: true,
    enum: VALID_COMMUNITY_TASK,
  },
  telegram: {
    channel: {
      type: String,
      required: isRequiredForEarnType('telegram'),
    },
    inviteLink: {
      type: String,
      required: false,
    }
  },
  twitter: {
    link: {
      type: String,
      required: isRequiredForEarnType('twitter'),
    },
    minimumFollowers: {
      type: Number,
      required: isRequiredForEarnType('twitter'),
      min: 0
    },
    accountsToFollow: {
      type: [String],
      required: isRequiredForEarnType('twitter'),
      default: [],
    },
    action: {
      retweet: {
        type: Boolean,
        required: isRequiredForEarnType('twitter'),
      },
      comment: {
        type: Boolean,
        required: isRequiredForEarnType('twitter'),
      },
      like: {
        type: Boolean,
        required: isRequiredForEarnType('twitter'),
      },
      follow: {
        type: Boolean,
        required: isRequiredForEarnType('twitter'),
      }
    }
  },
  discord: {
    server: {
      name: {
        type: String,
        trim: true,
        max: 100,
        required: isRequiredForEarnType('discord'),
      },
      id: {
        type: String,
        trim: true,
        min: 1,
        max: 100,
        required: isRequiredForEarnType('discord'),
      },
    },
    inviteLink: {
      type: String,
      trim: true,
      max: 100,
      required: isRequiredForEarnType('discord'),
    }
  },
  durationInDays: {
    type: Number,
    required: true,
    min: 1,
  },
  endDate: {
    type: Date,
    index: true,
    sparse: true,
  }
}, { timestamps: true });

clientTaskSchema.pre('remove', async function (next) {
  const session = this.$session(); // Access the existing session passed
  try {
    // Delete the corresponding ClientAdminActivityManagement entry
    await ClientAdminActivityManagement.findOneAndDelete({ eventId: this._id }).session(session);
    next();
  } catch (error) {
    console.error("Error in pre-remove hook of ClientTask:", error);
    next(error);
  }
});

// Pre-save hook to calculate and set the endDate before saving the document
clientTaskSchema.pre('save', async function (next) {
  try {
    // Set endDate based on duration
    if (this.isNew || this.isModified('durationInDays')) {
      const startDate = this.createdAt ? this.createdAt.getTime() : Date.now(); // Use current time if createdAt doesn't exist yet
      const durationMs = this.durationInDays * 24 * 60 * 60 * 1000; // Convert duration from days to milliseconds
      this.endDate = new Date(startDate + durationMs);
    }

    next();
  } catch (error) {
    next(error); // Pass any errors to the next middleware
  }
});

// Post-save hook to sync with ClientAdminActivityManagement
clientTaskSchema.post('save', async function (doc, next) {
  const session = this.$session(); // Access the existing session from the save operation
  try {
    // Check if a corresponding ClientAdminActivityManagement exists for the eventId
    let activity = await ClientAdminActivityManagement.findOne({
      eventId: doc._id
    }).session(session);

    let details;
    switch (doc.earnType) {
      case 'telegram':
        details = doc.telegram.channel;
        break;
      case 'twitter':
        details = doc.twitter.link;
        break;
      case 'discord':
        details = doc.discord.inviteLink;
        break;
      default:
        details = 'Unknown Earn Type';
    }

    if (activity) {
      // Update the existing activity management document
      activity.details = details;
      activity.startDate = doc.createdAt;
      activity.endDate = doc.endDate;
    } else {
      // Create a new ClientAdminActivityManagement document
      activity = new ClientAdminActivityManagement({
        clientProfileRef: doc.clientProfileRef,
        adminRef: doc.adminRef,
        itemType: `${doc.earnType}-task`,
        eventId: doc._id, // Reference to the task
        details: details,
        startDate: doc.createdAt,
        endDate: doc.endDate,
      });
    }

    // Save the activity management document using the session
    await activity.save({ session });
  } catch (error) {
    console.error("Error syncing with ClientAdminActivityManagement:", error);
  }

  next();
});

module.exports = mongoose.model("ClientTask", clientTaskSchema);