const {
  RegExpMatcher,
  TextCensor,
  englishDataset,
  englishRecommendedTransformers,
} = require("obscenity");
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});
const censor = new TextCensor();

const cleanMessage = (message) => {
  // Trim the message to remove leading and trailing whitespace
  message = message.trim();
  // Limit the message to 50 characters
  message = message.substring(0, 50);
  const matches = matcher.getAllMatches(message);
  return censor.applyTo(message, matches);
};

module.exports = { cleanMessage };
