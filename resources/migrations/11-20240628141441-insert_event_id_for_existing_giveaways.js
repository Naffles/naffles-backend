const { GIVEAWAY_EVENT_PREFIX } = require("../../utils/constants/PrefixConstants");
const moment = require("moment");

module.exports = {
  async up(db, client) {
    const giveaways = await db.collection("giveaways").find({}).toArray();
    
    for(const giveaway of giveaways) {
      // Set eventId if not already exists
      if(!giveaway.eventId){
        const sequenceDoc = await db.collection("sequences").findOneAndUpdate(
          { name: "giveawayEventId" },
          { 
            $inc: { value: 1 },
            $set: { lastUpdated: new Date() },
            $setOnInsert: { resets: 0 }
          },
          { returnDocument: "after", upsert: true}
        );
        const nextValStr = sequenceDoc.value.toString().padStart(3, "0");
        const formattedDate = moment().format("YYMMDD");
        const nextValue = `${GIVEAWAY_EVENT_PREFIX}${formattedDate}${nextValStr}`;
        await db.collection("giveaways").updateOne({ _id: giveaway._id }, 
          {$set: { eventId: nextValue }});
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  }
};
