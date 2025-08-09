const express = require("express");
const router = express.Router();
const rateLimiter = require("../middleware/rateLimiter");
const sendResponse = require("../utils/responseHandler");
const { getFileStream } = require("../services/gcs");

router
  .route("/view")
  .get(rateLimiter({ durationSec: 5 * 60, allowedHits: 500 }), (req, res) => {
    const { path } = req.query;
    if (!path) {
      return sendResponse(res, 404, "Path not found");
    }
    const readStream = getFileStream(path, process.env.GCS_BUCKET_NAME);
    readStream.on("error", (err) => {
      sendResponse(res, 500, "Error downloading file");
    });
    readStream.pipe(res);
  });

module.exports = router;
