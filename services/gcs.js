const { Storage } = require("@google-cloud/storage");
const { getAsync, setAsync } = require("../config/redisClient");
const { GCS_PROFILE_PICTURE_TTL } = require("../config/config");

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: `./gcs-key-${process.env.NODE_ENV}.json`,
});

const uploadFile = async (file, dir, bucketName) => {
  const bucket = storage.bucket(bucketName);
  const destinationPath = `uploads/${dir}/${file.filename}`;
  try {
    if (file.path) {
      await bucket.upload(file.path, {
        destination: destinationPath,
      });
    } else if (file.buffer) {
      const bucketFile = bucket.file(destinationPath);
      await bucketFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        }
      })
    }
    return destinationPath; // Returning the file path in the bucket as the result (key).
  } catch (err) {
    console.error("Failed to upload file:", err);
    throw err;
  }
};

const getFileStream = (fileKey, bucketName) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileKey);

  return file.createReadStream();
};

const deleteFile = async (fileKey, bucketName = process.env.GCS_BUCKET_NAME) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileKey);

  try {
    await file.delete();
    console.log(`File ${fileKey} deleted successfully.`);
  } catch (err) {
    console.error("Failed to delete file:", err);
    throw err;
  }
};

const getSignedUrl = async (fileKey, bucketName, ttlSeconds) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileKey);

  // These options will allow temporary read access to the file
  const options = {
    action: "read",
    expires: Date.now() + ttlSeconds * 1000, // TTL in milliseconds
  };

  try {
    // Get a v4 signed URL for reading the file
    const [url] = await file.getSignedUrl(options);
    return url;
  } catch (err) {
    console.error("Failed to get signed URL:", err);
    throw err;
  }
};

const getAndOrSetCachedSignedUrl = async (
  fileKey,
  bucketName = process.env.GCS_BUCKET_NAME,
  ttlSeconds = GCS_PROFILE_PICTURE_TTL
) => {
  const cacheKey = `signedUrl:${bucketName}:${fileKey}`;
  // Try fetching the URL from Redis
  const cachedUrl = await getAsync(cacheKey);
  if (cachedUrl) return cachedUrl;

  // Generate a new signed URL if not in cache
  const url = await getSignedUrl(fileKey, bucketName, ttlSeconds);
  // Store the signed URL in Redis with a TTL slightly less than the signed URL TTL
  await setAsync(cacheKey, url, "EX", ttlSeconds - 60); // Cache it for a few seconds less than the actual TTL
  return url;
};

const getDownloadSignedUrl = async (fileKey, bucketName, ttlSeconds) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileKey);

  // These options will allow temporary read access to the file with download intent
  const options = {
    action: "read",
    expires: Date.now() + ttlSeconds * 1000, // TTL in milliseconds
    responseDisposition: 'attachment; filename="' + fileKey.split('/').pop() + '"', // Set to trigger download
  };

  try {
    // Get a v4 signed URL for downloading the file
    const [url] = await file.getSignedUrl(options);
    return url;
  } catch (err) {
    console.error("Failed to get download signed URL:", err);
    throw err;
  }
};


module.exports = { uploadFile, getFileStream, deleteFile, getSignedUrl, getAndOrSetCachedSignedUrl, getDownloadSignedUrl };
