const fs = require("fs");
const path = require("path");
const { ObjectId } = require('mongodb');

const transformData = (data) => {
  return data.map(doc => {
    // Convert _id.$oid fields
    if (doc._id && doc._id.$oid) {
      doc._id = new ObjectId(doc._id.$oid);
    }
    // Convert userRef.$oid fields
    if (doc.userRef && doc.userRef.$oid) {
      doc.userRef = new ObjectId(doc.userRef.$oid);
    }
    // Convert user.$oid fields
    if (doc.user && doc.user.$oid) {
      doc.user = new ObjectId(doc.user.$oid);
    }

    // Convert createdAt.$date
    if (doc.createdAt && doc.createdAt.$date) {
      doc.createdAt = new Date(doc.createdAt.$date);
    }
    if (doc.updatedAt && doc.updatedAt.$date) {
      doc.updatedAt = new Date(doc.updatedAt.$date);
    }
    // Convert timestamp.$date
    if (doc.timestamp && doc.timestamp.$date) {
      doc.timestamp = new Date(doc.timestamp.$date);
    }

    // Convert actionId.$oid
    if (doc.actionId && doc.actionId.$oid) {
      doc.actionId = new ObjectId(doc.actionId.$oid);
    }

    // Convert winner.$oid
    if (doc.winner && doc.winner.$oid) {
      doc.winner = new ObjectId(doc.winner.$oid);
    }
    // Convert creator.$oid
    if (doc.creator && doc.creator.$oid) {
      doc.creator = new ObjectId(doc.creator.$oid);
    }
    // Convert challenger.$oid
    if (doc.challenger && doc.challenger.$oid) {
      doc.challenger = new ObjectId(doc.challenger.$oid);
    }
    // Convert game.$oid
    if (doc.game && doc.game.$date) {
      doc.game = new ObjectId(doc.game.$date);
    }

    return doc;
  });
};

module.exports = {
  async up(db, client) {
    const insertDataFromFile = async (collectionName, filename) => {
      const filepath = path.join(__dirname, "../json", filename);
      if (fs.existsSync(filepath)) {
        const collectionData = JSON.parse(fs.readFileSync(filepath, "utf8"));
        const transformedData = transformData(collectionData);
        await db.collection(collectionName).insertMany(transformedData);
      } else {
        console.log(`File not found: ${filepath}. Skipping insertion for ${collectionName}.`);
      }
    };
    const env = process.env.NODE_ENV;

    if(env === "production" || env === "staging") {
      // Insert users
      await insertDataFromFile("users", `naffles-${env}.users.json`);
      // Wallet addresses
      await insertDataFromFile("walletaddresses", `naffles-${env}.walletaddresses.json`);
      // Wallet balances
      await insertDataFromFile("walletbalances", `naffles-${env}.walletbalances.json`);
      // deposits
      await insertDataFromFile("deposits", `naffles-${env}.deposits.json`);
      // withdraws
      await insertDataFromFile("withdraws", `naffles-${env}.withdraws.json`);
      // userdepositandwithdrawhistories
      await insertDataFromFile("userdepositandwithdrawhistories", `naffles-${env}.userdepositandwithdrawhistories.json`);
      // gamehistories
      await insertDataFromFile("gamehistories", `naffles-${env}.gamehistories.json`);
      // gameanalytics
      await insertDataFromFile("gameanalytics", `naffles-${env}.gameanalytics.json`);
      // messages
      await insertDataFromFile("messages", `naffles-${env}.messages.json`);
      // userstats
      await insertDataFromFile("userstats", `naffles-${env}.userstats.json`);
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  }
};
