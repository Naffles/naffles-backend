const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://dev.naffles.com",
    "https://staging.naffles.com",
    "https://www.naffles.com",
    "https://naffles.com",
    "https://dev-naffles-admin-website-6wqfvde2wa-ts.a.run.app",
    "https://prod-naffles-admin-website-6wqfvde2wa-uc.a.run.app",
    "https://dev.admin.naffles.com",
    "https://admin.naffles.com",
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
  optionsSuccessStatus: 200, // Legacy browsers (IE11, various SmartTVs) choke on 204
};

module.exports = corsOptions;
