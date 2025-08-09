const { REDIS_IMAGE_KEY, IMAGE_LINK_EXPIRATION_IN_SECONDS } = require("../config/config");
const { getAsync, setAsync } = require("../config/redisClient");
const { getSignedUrl } = require("../services/gcs");

const imageFileFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
    // Reject the file if it does not have one of the following extensions
    return cb(new Error("Only image files are allowed!"), false);
  }
  cb(null, true); // Accept the file
};

const getUserProfileImage = async (imageLink) => {
  var profileImageUrl;
  if (!imageLink) {
    profileImageUrl = "";
  } else {
    profileImageUrl = await getAsync(`${REDIS_IMAGE_KEY}${imageLink}`)
    if (!profileImageUrl) {
      profileImageUrl = await getSignedUrl(
        imageLink,
        process.env.GCS_BUCKET_NAME,
        IMAGE_LINK_EXPIRATION_IN_SECONDS
      )
      // save url here
      await setAsync(REDIS_IMAGE_KEY, imageLink, "EX", IMAGE_LINK_EXPIRATION_IN_SECONDS);
    }
  }
  return profileImageUrl;
}

const getImage = async (imageLink, redisKey) => {
  if (!imageLink) return "";
  var imageUrl = await getAsync(`${redisKey}${imageLink}`)
  if (!imageUrl) {
    imageUrl = await getSignedUrl(
      imageLink,
      process.env.GCS_BUCKET_NAME,
      IMAGE_LINK_EXPIRATION_IN_SECONDS
    )
    // save url here
    await setAsync(redisKey, imageLink, "EX", IMAGE_LINK_EXPIRATION_IN_SECONDS);
  }
  return imageUrl;
}

module.exports = { imageFileFilter, getUserProfileImage, getImage };
