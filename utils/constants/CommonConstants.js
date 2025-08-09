const GcsConstants = Object.freeze({
	ALLOWLIST_BANNER_DIR: "client-profile/allowlist/banner-images",
	ALLOWLIST_WINNERS_DIR: "client-profile/allowlist/winners-csv",
});

const AllowlistTypes = Object.freeze({
	PRE_SALE: "pre-sale",
	FREE: "free",
});

module.exports = {
	GcsConstants,
	AllowlistTypes,
};
