const { Client } = require("twitter-api-sdk");

const getTweetAuthorData = async (id) => {
  const client = new Client(process.env.TWITTER_BEARER_TOKEN);

  const response = await client.tweets.findTweetById(id, {
    "expansions": ["author_id"],
    "user.fields": ["name", "profile_image_url", "url", "username"]
  });

  // Extract user data from the response
  const userData = response.includes?.users?.[0]; // Safe access to the first user in 'includes.users'

  if (userData) {
    const userInfo = {
      username: userData.username,
      name: userData.name,
      profileImageUrl: userData.profile_image_url,
    };

    return userInfo; // Return the user info
  } else {
    console.error("User data not found in the response");
    return null;
  }
};

// Export the function
module.exports = { getTweetAuthorData };
