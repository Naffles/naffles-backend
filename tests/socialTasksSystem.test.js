const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index'); // Assuming main app file
const SocialTask = require('../models/community/socialTask');
const SocialTaskCompletion = require('../models/community/socialTaskCompletion');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const socialTasksService = require('../services/socialTasksService');

describe('Social Tasks System', () => {
  let testUser, testAdmin, testCommunity, authToken, adminToken;

  beforeAll(async () => {
    // Setup test database connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await SocialTask.deleteMany({});
    await SocialTaskCompletion.deleteMany({});
    await Community.deleteMany({});
    await CommunityMember.deleteMany({});

    // Create test users
    testUser = {
      id: new mongoose.Types.ObjectId(),
      username: 'testuser',
      email: 'test@example.com'
    };

    testAdmin = {
      id: new mongoose.Types.ObjectId(),
      username: 'testadmin',
      email: 'admin@example.com'
    };

    // Create test community
    testCommunity = new Community({
      name: 'Test Community',
      slug: 'test-community',
      creatorId: testAdmin.id,
      pointsConfiguration: {
        pointsName: 'Test Points',
        pointsSymbol: 'TP'
      }
    });
    await testCommunity.save();

    // Create memberships
    const adminMembership = new CommunityMember({
      userId: testAdmin.id,
      communityId: testCommunity._id,
      role: 'creator',
      permissions: {
        canManagePoints: true,
        canManageAchievements: true,
        canManageMembers: true,
        canModerateContent: true,
        canViewAnalytics: true
      }
    });
    await adminMembership.save();

    const userMembership = new CommunityMember({
      userId: testUser.id,
      communityId: testCommunity._id,
      role: 'member'
    });
    await userMembership.save();

    // Mock auth tokens
    authToken = 'mock-auth-token';
    adminToken = 'mock-admin-token';
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Social Task Creation and Configuration', () => {
    test('should create a Twitter follow task', async () => {
      const taskData = {
        title: 'Follow Our Twitter',
        description: 'Follow our official Twitter account for updates',
        type: 'twitter_follow',
        configuration: {
          twitterUsername: 'naffles_official',
          verificationInstructions: 'Please provide your Twitter handle'
        },
        rewards: {
          points: 50,
          bonusMultiplier: 1.5
        },
        verification: {
          requiresApproval: true,
          autoVerify: false
        }
      };

      const task = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        taskData
      );

      expect(task).toBeDefined();
      expect(task.title).toBe('Follow Our Twitter');
      expect(task.type).toBe('twitter_follow');
      expect(task.configuration.twitterUsername).toBe('naffles_official');
      expect(task.rewards.points).toBe(50);
      expect(task.rewards.bonusMultiplier).toBe(1.5);
      expect(task.status).toBe('draft');
    });

    test('should create a Discord join task', async () => {
      const taskData = {
        title: 'Join Our Discord',
        description: 'Join our Discord server to connect with the community',
        type: 'discord_join',
        configuration: {
          discordServerId: '123456789',
          discordServerName: 'Naffles Community',
          discordInviteUrl: 'https://discord.gg/naffles',
          requiredRole: 'Member'
        },
        rewards: {
          points: 100
        },
        status: 'active'
      };

      const task = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        taskData
      );

      expect(task.type).toBe('discord_join');
      expect(task.configuration.discordServerId).toBe('123456789');
      expect(task.configuration.discordInviteUrl).toBe('https://discord.gg/naffles');
      expect(task.rewards.points).toBe(100);
    });

    test('should create a quiz task with auto-verification', async () => {
      const taskData = {
        title: 'Community Knowledge Quiz',
        description: 'Test your knowledge about our community',
        type: 'quiz',
        configuration: {
          questions: [
            {
              question: 'What is the name of our community token?',
              type: 'multiple_choice',
              options: ['Test Points', 'Community Coins', 'Naffles Points'],
              correctAnswer: 'Test Points'
            },
            {
              question: 'What year was Naffles founded?',
              type: 'text',
              correctAnswer: '2024'
            }
          ],
          passingScore: 80
        },
        rewards: {
          points: 200
        },
        verification: {
          autoVerify: true
        },
        status: 'active'
      };

      const task = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        taskData
      );

      expect(task.type).toBe('quiz');
      expect(task.configuration.questions).toHaveLength(2);
      expect(task.configuration.passingScore).toBe(80);
      expect(task.verification.autoVerify).toBe(true);
    });

    test('should validate required configuration fields', async () => {
      const invalidTaskData = {
        title: 'Invalid Twitter Task',
        type: 'twitter_follow',
        // Missing twitterUsername in configuration
        configuration: {},
        rewards: { points: 50 }
      };

      await expect(
        socialTasksService.createSocialTask(
          testCommunity._id,
          testAdmin.id,
          invalidTaskData
        )
      ).rejects.toThrow('Twitter username is required for Twitter follow tasks');
    });

    test('should prevent non-admin from creating tasks', async () => {
      const taskData = {
        title: 'Unauthorized Task',
        type: 'twitter_follow',
        configuration: { twitterUsername: 'test' },
        rewards: { points: 50 }
      };

      await expect(
        socialTasksService.createSocialTask(
          testCommunity._id,
          testUser.id,
          taskData
        )
      ).rejects.toThrow('Insufficient permissions to create social tasks');
    });
  });

  describe('Task Participation and Completion', () => {
    let testTask;

    beforeEach(async () => {
      testTask = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Test Twitter Task',
          type: 'twitter_follow',
          configuration: { twitterUsername: 'test_account' },
          rewards: { points: 50 },
          status: 'active'
        }
      );
    });

    test('should allow user to start a task', async () => {
      const completion = await socialTasksService.startTask(testTask._id, testUser.id);

      expect(completion).toBeDefined();
      expect(completion.userId.toString()).toBe(testUser.id.toString());
      expect(completion.taskId.toString()).toBe(testTask._id.toString());
      expect(completion.status).toBe('pending');
      expect(completion.completionTime.startedAt).toBeDefined();
    });

    test('should prevent starting task twice', async () => {
      await socialTasksService.startTask(testTask._id, testUser.id);

      // Try to start again
      const secondCompletion = await socialTasksService.startTask(testTask._id, testUser.id);
      
      // Should return existing completion, not create new one
      expect(secondCompletion.status).toBe('pending');
    });

    test('should allow user to submit task completion', async () => {
      await socialTasksService.startTask(testTask._id, testUser.id);

      const submissionData = {
        twitterHandle: '@testuser123',
        proofDescription: 'I followed the account as requested'
      };

      const completion = await socialTasksService.submitTaskCompletion(
        testTask._id,
        testUser.id,
        submissionData
      );

      expect(completion.status).toBe('submitted');
      expect(completion.submissionData.twitterHandle).toBe('@testuser123');
      expect(completion.completionTime.submittedAt).toBeDefined();
    });

    test('should prevent submission without starting task', async () => {
      const submissionData = {
        twitterHandle: '@testuser123'
      };

      await expect(
        socialTasksService.submitTaskCompletion(
          testTask._id,
          testUser.id,
          submissionData
        )
      ).rejects.toThrow('Task not started. Please start the task first.');
    });
  });

  describe('Quiz Task Auto-Verification', () => {
    let quizTask;

    beforeEach(async () => {
      quizTask = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Auto-Verified Quiz',
          type: 'quiz',
          configuration: {
            questions: [
              {
                question: 'What is 2 + 2?',
                type: 'multiple_choice',
                options: ['3', '4', '5'],
                correctAnswer: '4'
              },
              {
                question: 'What is the capital of France?',
                type: 'text',
                correctAnswer: 'Paris'
              }
            ],
            passingScore: 70
          },
          rewards: { points: 100 },
          verification: { autoVerify: true },
          status: 'active'
        }
      );
    });

    test('should auto-verify passing quiz submission', async () => {
      await socialTasksService.startTask(quizTask._id, testUser.id);

      const submissionData = {
        responses: [
          { questionIndex: 0, answer: '4' },
          { questionIndex: 1, answer: 'Paris' }
        ]
      };

      const completion = await socialTasksService.submitTaskCompletion(
        quizTask._id,
        testUser.id,
        submissionData
      );

      expect(completion.status).toBe('completed');
      expect(completion.verification.method).toBe('automatic');
      expect(completion.submissionData.responses[0].isCorrect).toBe(true);
      expect(completion.submissionData.responses[1].isCorrect).toBe(true);
    });

    test('should reject failing quiz submission', async () => {
      await socialTasksService.startTask(quizTask._id, testUser.id);

      const submissionData = {
        responses: [
          { questionIndex: 0, answer: '3' }, // Wrong answer
          { questionIndex: 1, answer: 'London' } // Wrong answer
        ]
      };

      const completion = await socialTasksService.submitTaskCompletion(
        quizTask._id,
        testUser.id,
        submissionData
      );

      expect(completion.status).toBe('submitted'); // Not auto-approved due to failing score
      expect(completion.submissionData.responses[0].isCorrect).toBe(false);
      expect(completion.submissionData.responses[1].isCorrect).toBe(false);
    });
  });

  describe('Manual Task Verification', () => {
    let testTask, testCompletion;

    beforeEach(async () => {
      testTask = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Manual Verification Task',
          type: 'twitter_follow',
          configuration: { twitterUsername: 'test_account' },
          rewards: { points: 75 },
          verification: { requiresApproval: true },
          status: 'active'
        }
      );

      await socialTasksService.startTask(testTask._id, testUser.id);
      testCompletion = await socialTasksService.submitTaskCompletion(
        testTask._id,
        testUser.id,
        { twitterHandle: '@testuser123' }
      );
    });

    test('should allow admin to approve task completion', async () => {
      const verifiedCompletion = await socialTasksService.verifyTaskCompletion(
        testCompletion._id,
        testAdmin.id,
        true,
        'Verified Twitter follow'
      );

      expect(verifiedCompletion.status).toBe('approved');
      expect(verifiedCompletion.verification.verifiedBy.toString()).toBe(testAdmin.id.toString());
      expect(verifiedCompletion.verification.verificationNotes).toBe('Verified Twitter follow');
      expect(verifiedCompletion.completionTime.completedAt).toBeDefined();
    });

    test('should allow admin to reject task completion', async () => {
      const verifiedCompletion = await socialTasksService.verifyTaskCompletion(
        testCompletion._id,
        testAdmin.id,
        false,
        'Could not verify Twitter follow'
      );

      expect(verifiedCompletion.status).toBe('rejected');
      expect(verifiedCompletion.verification.verificationNotes).toBe('Could not verify Twitter follow');
      expect(verifiedCompletion.completionTime.completedAt).toBeUndefined();
    });

    test('should prevent non-admin from verifying tasks', async () => {
      await expect(
        socialTasksService.verifyTaskCompletion(
          testCompletion._id,
          testUser.id,
          true,
          'Unauthorized verification'
        )
      ).rejects.toThrow('Insufficient permissions to verify tasks');
    });
  });

  describe('Task Analytics and Dashboard', () => {
    beforeEach(async () => {
      // Create multiple tasks and completions for analytics testing
      const task1 = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Twitter Task',
          type: 'twitter_follow',
          configuration: { twitterUsername: 'test1' },
          rewards: { points: 50 },
          status: 'active'
        }
      );

      const task2 = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Discord Task',
          type: 'discord_join',
          configuration: { 
            discordServerId: '123',
            discordInviteUrl: 'https://discord.gg/test'
          },
          rewards: { points: 100 },
          status: 'active'
        }
      );

      // Create some completions
      await socialTasksService.startTask(task1._id, testUser.id);
      await socialTasksService.submitTaskCompletion(
        task1._id,
        testUser.id,
        { twitterHandle: '@testuser' }
      );
    });

    test('should get community task analytics', async () => {
      const analytics = await socialTasksService.getTaskAnalytics(
        testCommunity._id,
        testAdmin.id,
        '30d'
      );

      expect(analytics).toHaveProperty('taskStatistics');
      expect(analytics).toHaveProperty('completionAnalytics');
      expect(analytics.timeframe).toBe('30d');
    });

    test('should get pending verifications', async () => {
      const pendingVerifications = await socialTasksService.getPendingVerifications(
        testCommunity._id,
        testAdmin.id
      );

      expect(Array.isArray(pendingVerifications)).toBe(true);
      expect(pendingVerifications.length).toBeGreaterThan(0);
      expect(pendingVerifications[0]).toHaveProperty('userId');
      expect(pendingVerifications[0]).toHaveProperty('taskId');
    });

    test('should get user task history', async () => {
      const history = await socialTasksService.getUserTaskHistory(
        testUser.id,
        testCommunity._id
      );

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('taskId');
      expect(history[0]).toHaveProperty('status');
    });

    test('should prevent non-admin from accessing analytics', async () => {
      await expect(
        socialTasksService.getTaskAnalytics(
          testCommunity._id,
          testUser.id,
          '30d'
        )
      ).rejects.toThrow('Insufficient permissions to view task analytics');
    });
  });

  describe('Task Configuration and Management', () => {
    test('should update task configuration', async () => {
      const task = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Original Title',
          type: 'twitter_follow',
          configuration: { twitterUsername: 'original_account' },
          rewards: { points: 50 }
        }
      );

      const updates = {
        title: 'Updated Title',
        rewards: { points: 100 },
        status: 'active'
      };

      const updatedTask = await socialTasksService.updateSocialTask(
        task._id,
        testAdmin.id,
        updates
      );

      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.rewards.points).toBe(100);
      expect(updatedTask.status).toBe('active');
    });

    test('should get available tasks for user', async () => {
      // Create tasks with different statuses
      await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Active Task',
          type: 'twitter_follow',
          configuration: { twitterUsername: 'active' },
          rewards: { points: 50 },
          status: 'active'
        }
      );

      await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Draft Task',
          type: 'discord_join',
          configuration: { 
            discordServerId: '123',
            discordInviteUrl: 'https://discord.gg/test'
          },
          rewards: { points: 100 },
          status: 'draft'
        }
      );

      const tasks = await socialTasksService.getCommunityTasks(
        testCommunity._id,
        testUser.id,
        { status: 'active' }
      );

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Active Task');
      expect(tasks[0].userStatus).toBeDefined();
      expect(tasks[0].userStatus.canStart).toBe(true);
    });
  });

  describe('Points Integration', () => {
    test('should award points when task is completed', async () => {
      const task = await socialTasksService.createSocialTask(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Points Test Task',
          type: 'quiz',
          configuration: {
            questions: [{
              question: 'Test question?',
              type: 'text',
              correctAnswer: 'test'
            }]
          },
          rewards: { points: 150, bonusMultiplier: 2 },
          verification: { autoVerify: true },
          status: 'active'
        }
      );

      await socialTasksService.startTask(task._id, testUser.id);
      
      const completion = await socialTasksService.submitTaskCompletion(
        task._id,
        testUser.id,
        { responses: [{ questionIndex: 0, answer: 'test' }] }
      );

      expect(completion.status).toBe('completed');
      expect(completion.rewards.pointsAwarded).toBe(300); // 150 * 2 multiplier
    });
  });
});