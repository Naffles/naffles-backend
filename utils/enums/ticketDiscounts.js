const TicketDiscount = (function() {
    const enumValues = [
        { "NO_DISCOUNT": { label: "No discount", value: 0 }},
        { "MIN_DISCOUNT": { label: "1/5/10 free per 5/20/50 sold", value: 1 }},
        { "MAX_DISCOUNT": { label: "2/5/20 free per 5/10/25 sold", value: 2 }},
    ];

    const TicketDiscount = {};

    enumValues.forEach((entry) => {
        const [key, details] = Object.entries(entry)[0];
        TicketDiscount[key] = { ...details };
      });

    TicketDiscount.values = function () {
        return Object.keys(TicketDiscount)
            .filter(key => typeof TicketDiscount[key] === "object")
            .map(key => TicketDiscount[key]);
    };

    TicketDiscount.codes = function () {
        return this.values().map(discount => discount.value);
    }

    TicketDiscount.isValidCode = function (code) {
        return this.codes().includes(code);
      };

    return TicketDiscount;
})();

module.exports = TicketDiscount;