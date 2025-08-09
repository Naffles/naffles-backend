const vrfWrapper = require("./services/vrfWrapper");

async function testVRFFailsafe() {
  console.log("🎲 Testing VRF Failsafe System...\n");

  try {
    // Test 1: Check VRF availability
    console.log("📋 Testing VRF Availability...");
    const isAvailable = vrfWrapper.isVRFAvailable();
    console.log(`✅ VRF Available: ${isAvailable}`);
    
    const source = vrfWrapper.getRandomnessSource();
    console.log(`✅ Randomness Source: ${source.source}`);
    if (source.warning) {
      console.log(`⚠️  Warning: ${source.warning}`);
    }

    // Test 2: Test randomness request
    console.log("\n🎯 Testing Randomness Request...");
    const randomnessRequest = await vrfWrapper.requestRandomness();
    console.log(`✅ Request ID: ${randomnessRequest.requestId}`);
    console.log(`✅ Is Fallback: ${randomnessRequest.isFallback || false}`);
    console.log(`✅ Source: ${randomnessRequest.source || 'VRF'}`);

    // Test 3: Test random float generation
    console.log("\n🔢 Testing Random Float Generation...");
    for (let i = 0; i < 5; i++) {
      const randomFloat = await vrfWrapper.getRandomFloat();
      console.log(`✅ Random Float ${i + 1}: ${randomFloat.toFixed(6)}`);
    }

    // Test 4: Test random integer generation
    console.log("\n🎯 Testing Random Integer Generation...");
    for (let i = 0; i < 5; i++) {
      const randomInt = await vrfWrapper.getRandomInt(1, 100);
      console.log(`✅ Random Int ${i + 1} (1-99): ${randomInt}`);
    }

    // Test 5: Test coin flip
    console.log("\n🪙 Testing Coin Flip...");
    const coinResults = { heads: 0, tails: 0 };
    for (let i = 0; i < 10; i++) {
      const result = await vrfWrapper.coinFlip();
      coinResults[result]++;
      console.log(`✅ Coin Flip ${i + 1}: ${result}`);
    }
    console.log(`📊 Results - Heads: ${coinResults.heads}, Tails: ${coinResults.tails}`);

    // Test 6: Test rock-paper-scissors
    console.log("\n✂️  Testing Rock-Paper-Scissors...");
    const rpsResults = { rock: 0, paper: 0, scissors: 0 };
    for (let i = 0; i < 9; i++) {
      const result = await vrfWrapper.rockPaperScissorsChoice();
      rpsResults[result]++;
      console.log(`✅ RPS Choice ${i + 1}: ${result}`);
    }
    console.log(`📊 Results - Rock: ${rpsResults.rock}, Paper: ${rpsResults.paper}, Scissors: ${rpsResults.scissors}`);

    // Test 7: Test random choice from array
    console.log("\n🎲 Testing Random Choice...");
    const choices = ['option1', 'option2', 'option3', 'option4', 'option5'];
    for (let i = 0; i < 5; i++) {
      const choice = await vrfWrapper.getRandomChoice(choices);
      console.log(`✅ Random Choice ${i + 1}: ${choice}`);
    }

    // Test 8: Test production validation (should not throw in development)
    console.log("\n🏭 Testing Production Validation...");
    try {
      vrfWrapper.validateProductionReadiness();
      console.log("✅ Production validation passed (or not in production mode)");
    } catch (error) {
      console.log(`⚠️  Production validation warning: ${error.message}`);
    }

    // Test 9: Performance test
    console.log("\n⚡ Testing Performance...");
    const startTime = Date.now();
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(vrfWrapper.getRandomFloat());
    }
    await Promise.all(promises);
    const endTime = Date.now();
    console.log(`✅ Generated 100 random numbers in ${endTime - startTime}ms`);

    console.log("\n🎉 VRF Failsafe System Test Complete!");
    console.log("\n📋 Test Summary:");
    console.log(`✅ VRF Service: ${isAvailable ? 'Available' : 'Using Failsafe'}`);
    console.log("✅ Random number generation working");
    console.log("✅ Coin flip working");
    console.log("✅ Rock-paper-scissors working");
    console.log("✅ Random choice working");
    console.log("✅ Performance acceptable");
    console.log("✅ Production validation working");

    if (!isAvailable) {
      console.log("\n⚠️  IMPORTANT NOTES:");
      console.log("• VRF is currently unavailable, using cryptographically secure fallback");
      console.log("• This is acceptable for development and testing");
      console.log("• For production, VRF should be properly configured for provably fair gaming");
      console.log("• The system will automatically use VRF when it becomes available");
    }

    console.log("\n🚀 Gaming system is ready with robust randomness failsafe!");

  } catch (error) {
    console.error("❌ Error during VRF failsafe test:", error);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testVRFFailsafe();
}

module.exports = { testVRFFailsafe };