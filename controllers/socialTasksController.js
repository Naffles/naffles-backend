const socialTasksService = require('../services/socialTasksService');

class SocialTasksController {
  // Create new social task
  async createTask(req, res) {
    try {
      const { communityId } = req.params;
      const creatorId = req.user.id;
      const taskData = req.body;

      const task = await socialTasksService.createSocialTask(communityId, creatorId, taskData);

      res.status(201).json({
        success: true,
        message: 'Social task created successfully',
        data: task
      });
    } catch (error) {
      console.error('Error creating social task:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to create social task',
        error: error.message
      });
    }
  }

  // Update social task
  async updateTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      const task = await socialTasksService.updateSocialTask(taskId, userId, updates);

      res.json({
        success: true,
        message: 'Social task updated successfully',
        data: task
      });
    } catch (error) {
      console.error('Error updating social task:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to update social task',
        error: error.message
      });
    }
  }

  // Get community tasks
  async getCommunityTasks(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user?.id;
      const options = {
        status: req.query.status,
        type: req.query.type,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const tasks = await socialTasksService.getCommunityTasks(communityId, userId, options);

      res.json({
        success: true,
        data: tasks
      });
    } catch (error) {
      console.error('Error getting community tasks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community tasks',
        error: error.message
      });
    }
  }

  // Get specific task details
  async getTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id;

      // Get task with user-specific information if authenticated
      const tasks = await socialTasksService.getCommunityTasks(
        null, // Will be filtered by taskId
        userId,
        { taskId }
      );

      if (tasks.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      res.json({
        success: true,
        data: tasks[0]
      });
    } catch (error) {
      console.error('Error getting task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get task',
        error: error.message
      });
    }
  }

  // Start a task
  async startTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;

      const completion = await socialTasksService.startTask(taskId, userId);

      res.json({
        success: true,
        message: 'Task started successfully',
        data: completion
      });
    } catch (error) {
      console.error('Error starting task:', error);
      const statusCode = error.message.includes('already completed') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to start task',
        error: error.message
      });
    }
  }

  // Submit task completion
  async submitTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;
      const submissionData = req.body;

      const completion = await socialTasksService.submitTaskCompletion(
        taskId,
        userId,
        submissionData
      );

      res.json({
        success: true,
        message: 'Task submitted successfully',
        data: completion
      });
    } catch (error) {
      console.error('Error submitting task:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to submit task',
        error: error.message
      });
    }
  }

  // Verify task completion (admin only)
  async verifyTask(req, res) {
    try {
      const { completionId } = req.params;
      const { approved, notes } = req.body;
      const verifierId = req.user.id;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Approved status must be a boolean'
        });
      }

      const completion = await socialTasksService.verifyTaskCompletion(
        completionId,
        verifierId,
        approved,
        notes
      );

      res.json({
        success: true,
        message: `Task ${approved ? 'approved' : 'rejected'} successfully`,
        data: completion
      });
    } catch (error) {
      console.error('Error verifying task:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to verify task',
        error: error.message
      });
    }
  }

  // Get pending verifications
  async getPendingVerifications(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const options = {
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const verifications = await socialTasksService.getPendingVerifications(
        communityId,
        userId,
        options
      );

      res.json({
        success: true,
        data: verifications
      });
    } catch (error) {
      console.error('Error getting pending verifications:', error);
      const statusCode = error.message.includes('permission') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get pending verifications',
        error: error.message
      });
    }
  }

  // Get task analytics
  async getTaskAnalytics(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const analytics = await socialTasksService.getTaskAnalytics(
        communityId,
        userId,
        timeframe
      );

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting task analytics:', error);
      const statusCode = error.message.includes('permission') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get task analytics',
        error: error.message
      });
    }
  }

  // Get user's task history
  async getUserTaskHistory(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const options = {
        status: req.query.status,
        taskType: req.query.taskType,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const history = await socialTasksService.getUserTaskHistory(
        userId,
        communityId,
        options
      );

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error getting user task history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get task history',
        error: error.message
      });
    }
  }

  // Delete/deactivate task
  async deleteTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;

      // Instead of deleting, we deactivate the task
      const task = await socialTasksService.updateSocialTask(taskId, userId, {
        isActive: false,
        status: 'completed'
      });

      res.json({
        success: true,
        message: 'Task deactivated successfully',
        data: task
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to delete task',
        error: error.message
      });
    }
  }

  // Get task types and their configurations
  async getTaskTypes(req, res) {
    try {
      const taskTypes = [
        {
          type: 'twitter_follow',
          name: 'Twitter Follow',
          description: 'Follow a Twitter account',
          requiredConfig: ['twitterUsername'],
          optionalConfig: ['verificationInstructions'],
          autoVerifiable: false
        },
        {
          type: 'twitter_retweet',
          name: 'Twitter Retweet',
          description: 'Retweet a specific tweet',
          requiredConfig: ['tweetUrl'],
          optionalConfig: ['verificationInstructions'],
          autoVerifiable: false
        },
        {
          type: 'twitter_like',
          name: 'Twitter Like',
          description: 'Like a specific tweet',
          requiredConfig: ['tweetUrl'],
          optionalConfig: ['verificationInstructions'],
          autoVerifiable: false
        },
        {
          type: 'discord_join',
          name: 'Discord Join',
          description: 'Join a Discord server',
          requiredConfig: ['discordServerId', 'discordInviteUrl'],
          optionalConfig: ['requiredRole', 'verificationInstructions'],
          autoVerifiable: false
        },
        {
          type: 'telegram_join',
          name: 'Telegram Join',
          description: 'Join a Telegram channel',
          requiredConfig: ['telegramChannelUrl'],
          optionalConfig: ['verificationInstructions'],
          autoVerifiable: false
        },
        {
          type: 'raffle_entry',
          name: 'Raffle Entry',
          description: 'Enter a specific raffle',
          requiredConfig: ['raffleId'],
          optionalConfig: [],
          autoVerifiable: true
        },
        {
          type: 'custom_url',
          name: 'Custom URL',
          description: 'Visit a custom URL and provide proof',
          requiredConfig: ['targetUrl'],
          optionalConfig: ['verificationMethod', 'verificationInstructions'],
          autoVerifiable: false
        },
        {
          type: 'quiz',
          name: 'Quiz',
          description: 'Complete a quiz with questions',
          requiredConfig: ['questions'],
          optionalConfig: ['passingScore'],
          autoVerifiable: true
        },
        {
          type: 'survey',
          name: 'Survey',
          description: 'Complete a survey',
          requiredConfig: ['questions'],
          optionalConfig: [],
          autoVerifiable: true
        }
      ];

      res.json({
        success: true,
        data: taskTypes
      });
    } catch (error) {
      console.error('Error getting task types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get task types',
        error: error.message
      });
    }
  }
}

module.exports = new SocialTasksController();