const TicketDiscount = require("../utils/enums/ticketDiscounts");

module.exports = {
    lotteryTypeOptions: [
        { label: "NFT",     value: "NFT" },
        { label: "TOKEN",   value: "TOKEN" }
    ],
    raffleTypeOptions: [
        { label: "Reserve Raffle",          value: "RESERVE" },
        { label: "Unconditional Raffle",    value: "UNCONDITIONAL" },
        { label: "Unlimited Raffle",        value: "UNLIMITED" },
    ],
    raffleDurationOptions: [
        { label: "3 days",  value: "DAYS_THREE" },
        { label: "7 days",  value: "DAYS_SEVEN" },
        { label: "14 days", value: "DAYS_FOURTEEN" },
        { label: "30 days", value: "DAYS_THIRTY" },
    ],
    ticketDiscountOptions: TicketDiscount.values() 
}