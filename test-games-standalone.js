/**
 * Standalone Game Testing Script
 * Test the games without requiring database or full server setup
 */

const blackjackService = require('./services/games/blackjackService');
const coinTossService = require('./services/games/coinTossService');
const rockPaperScissorsService = require('./services/games/rockPaperScissorsService');

async function playBlackjack() {
  console.log('\n🃏 === BLACKJACK GAME TEST ===');
  
  try {
    // Initialize game
    const gameState = await blackjackService.initializeGame('player1', '1000000000000000000');
    console.log('🎯 Game initialized!');
    console.log('👤 Your hand:', gameState.playerHand.map(c => `${c.rank}${c.suit}`).join(', '));
    console.log('🏠 Dealer shows:', `${gameState.dealerHand[0].rank}${gameState.dealerHand[0].suit}`, '+ [Hidden]');
    console.log('📊 Your hand value:', gameState.playerHandValue.value, gameState.playerHandValue.isSoft ? '(soft)' : '(hard)');
    console.log('🎮 Available actions:', gameState.actions.join(', '));
    
    // Simulate hitting if possible
    if (gameState.actions.includes('hit') && gameState.playerHandValue.value < 17) {
      console.log('\n🎯 Taking a hit...');
      const hitState = await blackjackService.processPlayerAction(gameState, 'hit');
      console.log('👤 Your hand:', hitState.playerHand.map(c => `${c.rank}${c.suit}`).join(', '));
      console.log('📊 Your hand value:', hitState.playerHandValue.value, hitState.playerHandValue.isSoft ? '(soft)' : '(hard)');
      
      if (hitState.gamePhase === 'dealer_turn') {
        console.log('\n🏠 Dealer\'s turn...');
        const finalState = await blackjackService.playDealerHand(hitState);
        console.log('🏠 Dealer hand:', finalState.dealerHand.map(c => `${c.rank}${c.suit}`).join(', '));
        console.log('📊 Dealer value:', finalState.dealerHandValue.value);
        
        const outcome = blackjackService.determineOutcome(finalState, '1000000000000000000');
        console.log('🏆 Result:', outcome.winner);
        console.log('💰 Payout:', outcome.playerPayout);
      }
    }
    
  } catch (error) {
    console.error('❌ Blackjack error:', error.message);
  }
}

async function playCoinToss() {
  console.log('\n🪙 === COIN TOSS GAME TEST ===');
  
  try {
    // Initialize game
    const gameState = await coinTossService.initializeGame('player1', '1000000000000000000');
    console.log('🎯 Game initialized!');
    console.log('🎮 Available choices:', gameState.actions.join(', '));
    
    // Make a choice
    const choice = 'heads';
    console.log(`\n🎯 Choosing ${choice}...`);
    const result = await coinTossService.processChoice(gameState, choice);
    
    console.log('🪙 Coin result:', result.coinResult);
    console.log('🎬 Animation:', result.animationType);
    
    const outcome = coinTossService.determineOutcome(result, '1000000000000000000');
    console.log('🏆 Result:', outcome.winner);
    console.log('💰 Payout:', outcome.playerPayout);
    
    // Show animation config
    const animConfig = coinTossService.getAnimationConfig(result.animationType);
    console.log('⏱️ Animation duration:', animConfig.duration + 'ms');
    
  } catch (error) {
    console.error('❌ Coin toss error:', error.message);
  }
}

async function playRockPaperScissors() {
  console.log('\n✂️ === ROCK PAPER SCISSORS GAME TEST ===');
  
  try {
    // Initialize game
    const gameState = await rockPaperScissorsService.initializeGame('player1', '1000000000000000000');
    console.log('🎯 Game initialized!');
    console.log('🎮 Available moves:', gameState.actions.join(', '));
    
    // Make a move
    const move = 'rock';
    console.log(`\n🎯 Playing ${move}...`);
    const result = await rockPaperScissorsService.processPlayerMove(gameState, move);
    
    console.log('👤 Your move:', result.playerMove);
    console.log('🏠 House move:', result.opponentMove);
    console.log('📝 Explanation:', result.lastRoundResult.explanation);
    
    const outcome = rockPaperScissorsService.determineOutcome(result, '1000000000000000000');
    console.log('🏆 Result:', outcome.winner);
    console.log('💰 Payout:', outcome.playerPayout);
    
  } catch (error) {
    console.error('❌ Rock Paper Scissors error:', error.message);
  }
}

async function runGameTests() {
  console.log('🎮 NAFFLES SPECIFIC GAMES - STANDALONE TESTING');
  console.log('='.repeat(50));
  
  await playBlackjack();
  await playCoinToss();
  await playRockPaperScissors();
  
  console.log('\n✅ All game tests completed!');
  console.log('\n📋 What you can do next:');
  console.log('1. Set up MongoDB/Redis to test full API endpoints');
  console.log('2. Test the iFrame demo at /public/iframe-demo.html');
  console.log('3. Run the verification script: node verify-specific-games.js');
  console.log('4. Start the full server: npm run dev (after database setup)');
}

// Run if called directly
if (require.main === module) {
  runGameTests().catch(console.error);
}

module.exports = { playBlackjack, playCoinToss, playRockPaperScissors, runGameTests };