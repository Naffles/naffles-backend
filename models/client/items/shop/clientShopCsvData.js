const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define schema for storing a single column of CSV data
const clientShopCsvDataSchema = new Schema({
  // Reference to the ClientShop item that the CSV data belongs to
  shopItemRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientShop",
    index: true,
    sparse: true,
  },
  // Store a single column's data as an array of strings, with each string representing a row value in that column
  columnData: {
    type: [String], // A single array where each element is a value from the column of the CSV
    default: [],
  },
  rowCount: {
    type: Number, // To track how many rows are in the column
    default: 0,
  },

}, { timestamps: true });

module.exports = mongoose.model("ClientShopCsvData", clientShopCsvDataSchema);
