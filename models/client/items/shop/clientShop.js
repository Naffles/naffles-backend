const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WalletBalance = require("../../../user/walletBalance");
const ClientAdminActivityManagement = require("../../clientAdminActivityManagement");
const ClientShopTransactionHistory = require("./clientShopTransactionHistory");
const ClientShopCsvData = require("./clientShopCsvData");

const clientShopSchema = new Schema({
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
  buyerRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    index: true,
    sparse: true
  },
  name: {
    type: String,
    trim: true,
    min: 1,
  },
  productType: {
    type: String,
    enum: ['token-pot-crypto', 'token-pot-points', 'csv', 'nft', 'file'],
    index: true,
    sparse: true,
    required: true
  },
  totalCount: { // the total quantity of items to be sold
    type: Number,
    default: 1,
    required: true,
  },
  pot: { // item that being sell
    // Reference to the single column of CSV data
    csvDataRef: {
      type: Schema.Types.ObjectId,
      ref: "ClientShopCsvData",
    },
    // for file and csv (row count on first column)
    quantity: { // items left to be sold
      type: Number,
      default: 1,
      required: true,
    },
    currency: {
      type: String,
      lowercase: true,
      trim: true
    },
    amount: {
      type: String,
      default: '0',
    },
    tokenType: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ['community-token', 'crypto'],
    }
  },
  sell: {
    currency: {
      type: String,
      lowercase: true,
      trim: true
    },
    price: {
      type: String,
      default: '0',
    },
    tokenType: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ['community-token', 'crypto'],
    }
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'canceled'],
    default: 'active',
    index: true,
  },
  // files
  image: String,
  file: String,
  csv: {
    type: String,
    select: false
  },
}, { timestamps: true });

clientShopSchema.pre('remove', async function (next) {
  const session = this.$session(); // Access the existing session passed from deleteTokenPot
  try {
    // Check if the shop item is eligible for a refund (status: 'active' and productType: 'token-pot-crypto')
    if (this.status === 'active' && this.productType === 'token-pot-crypto') {
      const adminWallet = await WalletBalance.findOne({ userRef: this.adminRef }).session(session);

      if (!adminWallet) {
        throw new Error("Admin wallet not found for refund.");
      }

      const potAmount = BigInt(this.pot.amount || '0'); // Convert pot amount to BigInt
      const potCurrency = this.pot.currency;

      if (potAmount > BigInt(0)) {
        // Deduct the amount from itemShopBalances and add it back to balances
        const currentShopBalance = BigInt(adminWallet.itemShopBalances.get(potCurrency) || '0');
        const currentWalletBalance = BigInt(adminWallet.balances.get(potCurrency) || '0');

        // Check if there is enough balance in itemShopBalances to refund
        if (potAmount > currentShopBalance) {
          throw new Error(`Insufficient item shop balance for ${potCurrency} refund.`);
        }

        // Calculate new balances
        const newShopBalance = currentShopBalance - potAmount;
        const newWalletBalance = currentWalletBalance + potAmount;

        // Update the admin wallet with the new balances
        adminWallet.itemShopBalances.set(potCurrency, newShopBalance);
        adminWallet.balances.set(potCurrency, newWalletBalance);

        // Save the admin wallet changes using the passed session
        await adminWallet.save({ session });
      }
    } else if (this.status === 'active' && this.productType === 'csv') {
      // find csv data for deletion
      await ClientShopCsvData.findOneAndDelete({ shopItemRef: mongoose.Types.ObjectId(this._id) }).session(session);
    }

    // Delete the corresponding ClientAdminActivityManagement entry
    await ClientAdminActivityManagement.findOneAndDelete({ eventId: this._id }).session(session);

    next();
  } catch (error) {
    console.error("Error in pre-remove hook of ClientShop:", error);
    next(error);
  }
});

// Post-save hook to sync with ClientAdminActivityManagement
clientShopSchema.post('save', async function (doc, next) {
  const session = this.$session(); // Access the existing session from the save operation
  try {
    // Check if a corresponding ClientAdminActivityManagement exists for the eventId
    let activity = await ClientAdminActivityManagement.findOne({
      eventId: doc._id
    }).session(session);

    if (activity) {
      // Update the existing activity management document
      activity.details = doc.name;
      activity.startDate = doc.createdAt;
    } else {
      // Create a new ClientAdminActivityManagement document
      activity = new ClientAdminActivityManagement({
        clientProfileRef: doc.clientProfileRef,
        adminRef: doc.adminRef,
        itemType: 'shop-item', // Since it's a Shop item task
        eventId: doc._id, // Reference to the task
        details: doc.name,
        startDate: doc.createdAt
      });
    }

    // Save the activity management document using the session
    await activity.save({ session });

    // Create a new transaction history record if the shop item status is 'completed'
    // Make sure that the productType is not a `file` since manually saving the
    // transcation on productType = file
    if (doc.status === 'completed' && doc.productType !== 'file' && doc.productType !== 'csv') {
      const buyer = await WalletBalance.findOne({ userRef: doc.buyerRef }).session(session);
      if (!buyer) {
        throw new Error("Buyer not found for transaction history.");
      }

      const transactionHistory = new ClientShopTransactionHistory({
        shopItemRef: doc._id,
        buyerRef: doc.buyerRef,
        sellerRef: doc.adminRef,
        clientProfileRef: doc.clientProfileRef,
        totalCount: doc.totalCount,
        transaction: {
          item: {
            // quantity: doc.pot.quantity, // this is for file remove this
            amount: doc.pot.amount,
            currency: doc.pot.currency,
            tokenType: doc.pot.tokenType,
          },
          price: {
            amount: doc.sell.price,
            currency: doc.sell.currency,
            tokenType: doc.sell.tokenType,
          }
        },
        product: {
          name: doc.name,
          productType: doc.productType,
          quantity: 1,
        },
        status: 'completed',
      });

      await transactionHistory.save({ session });
    }
  } catch (error) {
    console.error("Error syncing with ClientAdminActivityManagement:", error);
  }

  next();
});

module.exports = mongoose.model("ClientShop", clientShopSchema);