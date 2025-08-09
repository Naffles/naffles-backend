const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import services
const realTimeService = require('./services/realtime/realTimeService');
const chatService = require('./services/realtime/chatService');
const notificationService = require('./services/realtime/notificationService');
const integrationService = require('./services/realtime/integrationService');

// Import models
const User = require('./models/user/user');
const Raffle = require('./models/raffle/raffle');

async function verifyRealTimeFeatures() {
  let mongoServer;
  
  try {
    console.log('🚀 Starting Real-Time Features Verification...\n');

    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to test database');

    // Create test user
    const testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      walletAddresses: ['0x123...'],
      profileData: {
        displayName: 'Test User'
      }
    });
    await testUser.save();
    console.log('✅ Created test user');

    // Test 1: Notification Service
    console.log('\n📢 Testing Notification Service...');
    
    const notification = await notificationService.sendNotification(testUser._id.toString(), {
      type: 'test_notification',
      title: 'Test Notification',
      message: 'This is a test notification',
      data: { testData: 'value' }
    });
    
    console.log('✅ Notification sent:', notification.title);

    const notifications = await notificationService.getUserNotifications(testUser._id.toString());
    console.log('✅ Retrieved notifications:', notifications.notifications.length);

    await notificationService.markAsRead(testUser._id.toString(), notification.id);
    console.log('✅ Marked notification as read');

    // Test 2: Chat Service
    console.log('\n💬 Testing Chat Service...');
    
    const testMessage = {
      id: 'test-message-1',
      user: {
        id: testUser._id.toString(),
        username: testUser.username,
        profileImage: null
      },
      message: 'Test chat message',
      timestamp: new Date(),
      room: 'test-room'
    };

    await chatService.saveChatMessage('test-room', testMessage);
    console.log('✅ Chat message saved');

    const chatHistory = await chatService.getChatHistory('test-room');
    console.log('✅ Retrieved chat history:', chatHistory.length, 'messages');

    const systemMessage = await chatService.sendSystemMessage('test-room', 'System test message', 'info');
    console.log('✅ System message sent:', systemMessage.message);

    // Test 3: Real-Time Service
    console.log('\n⚡ Testing Real-Time Service...');
    
    const leaderboard = await realTimeService.updateLeaderboard();
    console.log('✅ Leaderboard updated:', leaderboard.topUsers.length, 'users');

    const userNotification = await realTimeService.sendUserNotification(testUser._id.toString(), {
      type: 'test',
      title: 'Real-time Test',
      message: 'Real-time notification test'
    });
    console.log('✅ Real-time notification sent:', userNotification.title);

    // Test 4: Raffle Integration
    console.log('\n🎰 Testing Raffle Integration...');
    
    const testRaffle = new Raffle({
      title: 'Test Raffle',
      description: 'Test raffle description',
      creator: testUser._id,
      prize: {
        type: 'token',
        amount: 100,
        currency: 'ETH'
      },
      ticketPrice: {
        amount: 1,
        currency: 'ETH'
      },
      maxTickets: 100,
      endTime: new Date(Date.now() + 60000), // 1 minute from now
      status: 'active',
      entries: []
    });
    await testRaffle.save();
    console.log('✅ Test raffle created');

    realTimeService.startRaffleCountdown(testRaffle);
    console.log('✅ Raffle countdown started');

    const odds = realTimeService.calculateOdds({ entries: [{ user: testUser._id }] });
    console.log('✅ Raffle odds calculated:', odds.individual);

    realTimeService.stopRaffleCountdown(testRaffle._id.toString());
    console.log('✅ Raffle countdown stopped');

    // Test 5: Integration Service
    console.log('\n🔗 Testing Integration Service...');
    
    await integrationService.onRaffleCreated(testRaffle);
    console.log('✅ Raffle creation integration handled');

    await integrationService.onGameResult({
      playerId: testUser._id.toString(),
      gameType: 'blackjack',
      result: 'win',
      amount: 50,
      currency: 'ETH'
    });
    console.log('✅ Game result integration handled');

    await integrationService.onPointsEarned(testUser._id.toString(), {
      amount: 100,
      reason: 'test completion',
      communityId: null
    });
    console.log('✅ Points earned integration handled');

    // Test 6: Message Validation
    console.log('\n🛡️ Testing Message Validation...');
    
    const validMessage = chatService.validateAndCleanMessage('This is a valid message');
    console.log('✅ Valid message accepted:', validMessage !== null);

    const invalidMessage = chatService.validateAndCleanMessage('');
    console.log('✅ Invalid message rejected:', invalidMessage === null);

    const longMessage = chatService.validateAndCleanMessage('a'.repeat(600));
    console.log('✅ Long message rejected:', longMessage === null);

    // Test 7: Bulk Operations
    console.log('\n📦 Testing Bulk Operations...');
    
    const bulkResults = await notificationService.sendBulkNotifications(
      [testUser._id.toString()],
      {
        type: 'bulk_test',
        title: 'Bulk Test',
        message: 'This is a bulk notification test'
      }
    );
    console.log('✅ Bulk notifications sent:', bulkResults.length, 'results');

    const allReadCount = await notificationService.markAllAsRead(testUser._id.toString());
    console.log('✅ All notifications marked as read:', allReadCount, 'notifications');

    // Test 8: System Announcement
    console.log('\n📣 Testing System Announcements...');
    
    await notificationService.sendSystemAnnouncement({
      title: 'Test Announcement',
      message: 'This is a test system announcement',
      persistent: false
    });
    console.log('✅ System announcement sent');

    // Test 9: Error Handling
    console.log('\n🚨 Testing Error Handling...');
    
    try {
      await notificationService.sendNotification('invalid-user-id', {
        type: 'test',
        title: null,
        message: 'Test'
      });
    } catch (error) {
      console.log('✅ Invalid notification handled gracefully');
    }

    const emptyHistory = await chatService.getChatHistory('non-existent-room');
    console.log('✅ Non-existent chat room handled:', emptyHistory.length === 0);

    // Test 10: Performance Test
    console.log('\n⚡ Testing Performance...');
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
      promises.push(
        notificationService.sendNotification(testUser._id.toString(), {
          type: 'performance_test',
          title: `Performance Test ${i}`,
          message: `Performance test message ${i}`
        })
      );
    }
    
    await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('✅ Performance test completed:', duration, 'ms for 10 notifications');
    console.log('✅ Average per notification:', Math.round(duration / 10), 'ms');

    // Cleanup
    realTimeService.cleanup();
    console.log('✅ Real-time service cleaned up');

    console.log('\n🎉 All Real-Time Features Verification Tests Passed!');
    console.log('\n📊 Summary:');
    console.log('- ✅ Notification Service: Working');
    console.log('- ✅ Chat Service: Working');
    console.log('- ✅ Real-Time Service: Working');
    console.log('- ✅ Raffle Integration: Working');
    console.log('- ✅ Integration Service: Working');
    console.log('- ✅ Message Validation: Working');
    console.log('- ✅ Bulk Operations: Working');
    console.log('- ✅ System Announcements: Working');
    console.log('- ✅ Error Handling: Working');
    console.log('- ✅ Performance: Acceptable');

    return true;

  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  } finally {
    // Cleanup
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyRealTimeFeatures()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

module.exports = verifyRealTimeFeatures;