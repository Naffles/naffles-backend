const mongoose = require("mongoose");
const { Schema } = mongoose;


const ticketDiscountSchema = new Schema({
    code: {
        type: Number,
        enum: [1, 2, 3],
        default: 1,
        unique: true
    },
    name: {
        type: String,
        enum: [
            "No discount",
            "1/5/10 free per 5/20/50 sold",
            "2/5/20 free per 5/10/25 sold"
        ],
        default: "No discount"
    }
});

module.exports = mongoose.model("TicketDiscount", ticketDiscountSchema);
