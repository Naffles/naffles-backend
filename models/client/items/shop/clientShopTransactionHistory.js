const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const UserHistory = require("../../../user/userHistory");
const { convertToNum } = require("../../../../utils/convert");

// Define the ClientShopTransactionHistory schema
const clientShopTransactionHistorySchema = new Schema({
  // Reference to the client shop item involved in the transaction
  shopItemRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientShop",
    required: true,
    index: true,
  },
  // Reference to the buyer of the item
  buyerRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // Reference to the seller of the item (Admin of the ClientProfile)
  sellerRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // Reference to the client profile associated with the shop item
  clientProfileRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientProfile",
    required: true,
    index: true,
  },
  totalCount: {
    type: Number,
    default: 1,
    required: true,
  },
  // Transaction amount and currency
  transaction: {
    item: {
      quantity: { // for file
        type: Number,
      },
      amount: {
        type: String,// Use string to handle BigInt values
      },
      currency: {
        type: String,
        lowercase: true,
        trim: true,
      },
      tokenType: {
        type: String,
        lowercase: true,
        trim: true,
      }
    },
    price: {
      amount: {
        type: String,// Use string to handle BigInt values
      },
      currency: {
        type: String,
        lowercase: true,
        trim: true,
      },
      tokenType: {
        type: String,
        lowercase: true,
        trim: true,
      }
    }
  },
  // Product details
  product: {
    name: {
      type: String,
      trim: true,
      required: true,
      minlength: 1,
    },
    productType: {
      type: String,
      enum: ['token-pot-crypto', 'token-pot-points', 'csv', 'nft', 'file'],
      required: true,
      index: true,
    },
    quantity: { // item quantity before buying it
      type: Number,
      default: 1,
      min: 1,
    },
    file: String,
    csvCode: String,
  },
  // Status of the transaction
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    required: true,
    default: 'completed',
    index: true,
  },
}, { timestamps: true });

// Post-save hook to sync with UserHistory
clientShopTransactionHistorySchema.post('save', async function (doc, next) {
  const session = this.$session();
  try {
    if (doc.status === 'completed') {
      let convertedAmount = doc.transaction.price.amount;
      let amountString;

      if (doc.transaction.price.tokenType !== 'community-token') {
        convertedAmount = await convertToNum(doc.transaction.price.amount, doc.transaction.price.currency);
        amountString = `- ${doc.transaction.price.currency.toUpperCase()} ${convertedAmount}`;
      } else {
        amountString = `- ${convertedAmount} ${doc.transaction.price.currency.toUpperCase()}`;
      }

      let productDetails;
      switch (doc.product.productType) {
        case 'token-pot-crypto':
          const amountConverted = await convertToNum(doc.transaction.item.amount, doc.transaction.item.currency) || 0;
          productDetails = `Crypto Pot - ${doc.transaction.item.currency.toUpperCase()} ${amountConverted}`;
          break;
        case 'token-pot-points':
          productDetails = `Token Pot - ${doc.transaction.item.currency.toUpperCase()} ${doc.transaction.item.amount}`;
          break;
        case 'csv':
          productDetails = `CSV [${doc.product.name}]`;
          break;
        case 'file':
          productDetails = `File [${doc.product.name}]`;
          break;
        case 'nft':
          productDetails = 'NFT Sale';
          break;
        default:
          productDetails = 'Unknown Product';
      }

      // Create UserHistory for the buyer
      const buyerHistory = {
        userRef: doc.buyerRef,
        eventType: 'shop',
        eventId: doc._id,
        status: 'purchased',
        amount: amountString,
        details: `${productDetails}`,
        ...(doc.product.productType == 'file' && { file: doc.product.file }),
        ...(doc.product.productType == 'csv' && { csvCode: doc.product.csvCode }),
      };

      await UserHistory.create([buyerHistory], { session });

      // Create UserHistory for the seller with positive amount
      const sellerAmountString = amountString.replace('-', '+');
      const sellerHistory = {
        userRef: doc.sellerRef,
        eventType: 'shop',
        eventId: doc._id,
        status: 'sold',
        amount: sellerAmountString,
        details: `${productDetails}`,
        ...(doc.product.productType == 'file' && { file: doc.product.file }),
        ...(doc.product.productType == 'csv' && { csvCode: doc.product.csvCode }),
      };

      await UserHistory.create([sellerHistory], { session });
    }
  } catch (error) {
    console.error("Error syncing with UserHistory:", error);
  }

  next();
});

module.exports = mongoose.model("ClientShopTransactionHistory", clientShopTransactionHistorySchema);
