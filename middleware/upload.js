const multer = require("multer");
const sendResponse = require("../utils/responseHandler");

// Define file filter to accept both image files and other specific file types
const fileFilter = (req, file, cb) => {
  // Check if the file extension matches allowed types (jpg, jpeg, png, gif, pdf, doc, docx)
  if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|doc|docx|csv)$/)) {
    // Reject the file if it does not have one of the allowed extensions
    return sendResponse(req.res, 400, "Only image files (jpg, jpeg, png) and document files (pdf, doc, docx, csv) are allowed!"); // Access `req.res` to send the response
  }
  cb(null, true); // Accept the file
};

const imageFileFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
    // Reject the file if it does not have one of the following extensions
    return sendResponse(req.res, 400, "Only image files (jpg, jpeg, png) are allowed!"); // Access `req.res` to send the response
  }
  cb(null, true); // Accept the file
};

const storage = multer.memoryStorage();

// Function to generate multer middleware dynamically
const imageUpload = (fields) => {
  const processedFields = fields.map(field => ({
    name: field.name,
    maxCount: field.maxCount || 1, // Default maxCount to 1 if not specified
  }));
  return multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
    fileFilter: imageFileFilter,
  }).fields(processedFields);
};

const fileUpload = (fields) => {
  const processedFields = fields.map(field => ({
    name: field.name,
    maxCount: field.maxCount || 1, // Default maxCount to 1 if not specified
  }));
  return multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
    fileFilter: fileFilter,
  }).fields(processedFields);
};

module.exports = { imageUpload, fileUpload }