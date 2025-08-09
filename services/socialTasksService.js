const SocialTask = require('../models/community/socialTask');
const SocialTaskCompletion = require('../models/community/socialTaskCompletion');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const communityPointsService = require('./communityPointsService');

class SocialTasksService {
  /**
   * Create a new social task
   * @param {string} communityId - Community ID
   * @param {string} creatorId - Creator user ID
   * @param {Object} taskData - Task configuration data
   * @returns {Promise<Object>} Created task
   */
  async createSocialTask(communityId, creatorId, taskData) {
    try {
      // Verify community exists and user has permission
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const membership = await CommunityMember.findOne({
        userId: creatorId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to create social tasks');
      }

      // Validate task configuration
      const validatedTaskData = this.validateTaskConfiguration(taskData);

      // Create the task
      const task = new SocialTask({
        communityId,
        createdBy: creatorId,
        ...validatedTaskData
      });

      await task.save();

      // Populate creator information
      await task.populate('createdBy', 'username');

      return task;
    } catch (error) {
      console.error('Error creating social task:', error);
      throw error;
    }
  }

  /**
   * Update an existing social task
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID making the update
   * @param {Object} updates - Task updates
   * @returns {Promise<Object>} Updated task
   */
  async updateSocialTask(taskId, userId, updates) {
    try {
      const task = await SocialTask.findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Check permissions
      const membership = await CommunityMember.findOne({
        userId,
        communityId: task.communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to update social tasks');
      }

      // Validate updates
      const validatedUpdates = this.validateTaskConfiguration(updates);

      // Apply updates
      Object.assign(task, validatedUpdates);
      await task.save();

      return task;
    } catch (error) {
      console.error('Error updating social task:', error);
      throw error;
    }
  }

  /**
   * Get social tasks for a community
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID (for availability checking)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of tasks
   */
  async getCommunityTasks(communityId, userId = null, options = {}) {
    try {
      const query = { communityId, isActive: true };

      if (options.status) {
        query.status = options.status;
      }

      if (options.type) {
        query.type = options.type;
      }

      const tasks = await SocialTask.find(query)
        .populate('createdBy', 'username')
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0);

      // If userId provided, check availability and completion status
      if (userId) {
        const userCompletions = await SocialTaskCompletion.find({
          userId,
          communityId,
          isActive: true
        });

        const completionMap = new Map();
        userCompletions.forEach(completion => {
          completionMap.set(completion.taskId.toString(), completion);
        });

        // Get user's completed tasks for requirement checking
        const completedTaskIds = userCompletions
          .filter(c => c.status === 'completed' || c.status === 'approved')
          .map(c => c.taskId.toString());

        // Enhance tasks with user-specific information
        return tasks.map(task => {
          const completion = completionMap.get(task._id.toString());
          const availability = task.isAvailableForUser(userId, 0, completedTaskIds);

          return {
            ...task.toObject(),
            userStatus: {
              completed: !!completion && (completion.status === 'completed' || completion.status === 'approved'),
              inProgress: !!completion && completion.status === 'submitted',
              canStart: availability.available,
              unavailableReason: availability.reason,
              completion: completion || null
            }
          };
        });
      }

      return tasks;
    } catch (error) {
      console.error('Error getting community tasks:', error);
      throw error;
    }
  }

  /**
   * Start a social task for a user
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Task completion record
   */
  async startTask(taskId, userId) {
    try {
      const task = await SocialTask.findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Check if user is a member of the community
      const membership = await CommunityMember.findOne({
        userId,
        communityId: task.communityId,
        isActive: true
      });

      if (!membership) {
        throw new Error('User is not a member of this community');
      }

      // Check if user already has a completion record
      const existingCompletion = await SocialTaskCompletion.findOne({
        userId,
        taskId,
        isActive: true
      });

      if (existingCompletion) {
        if (existingCompletion.status === 'completed' || existingCompletion.status === 'approved') {
          throw new Error('Task already completed');
        }
        return existingCompletion; // Return existing in-progress completion
      }

      // Check task availability
      const completedTasks = await SocialTaskCompletion.find({
        userId,
        communityId: task.communityId,
        status: { $in: ['completed', 'approved'] },
        isActive: true
      }).select('taskId');

      const completedTaskIds = completedTasks.map(c => c.taskId.toString());
      const availability = task.isAvailableForUser(userId, 0, completedTaskIds);

      if (!availability.available) {
        throw new Error(availability.reason);
      }

      // Create completion record
      const completion = new SocialTaskCompletion({
        userId,
        taskId,
        communityId: task.communityId,
        status: 'pending',
        completionTime: {
          startedAt: new Date()
        }
      });

      await completion.save();
      return completion;
    } catch (error) {
      console.error('Error starting task:', error);
      throw error;
    }
  }

  /**
   * Submit task completion
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   * @param {Object} submissionData - Submission data
   * @returns {Promise<Object>} Updated completion record
   */
  async submitTaskCompletion(taskId, userId, submissionData) {
    try {
      const task = await SocialTask.findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      const completion = await SocialTaskCompletion.findOne({
        userId,
        taskId,
        isActive: true
      });

      if (!completion) {
        throw new Error('Task not started. Please start the task first.');
      }

      if (completion.status === 'completed' || completion.status === 'approved') {
        throw new Error('Task already completed');
      }

      // Validate submission data based on task type
      const validatedSubmission = this.validateSubmissionData(task.type, submissionData);

      // Update completion record
      completion.submissionData = validatedSubmission;
      completion.completionTime.submittedAt = new Date();

      // Determine if automatic verification is possible
      if (task.verification.autoVerify && this.canAutoVerify(task.type)) {
        const verificationResult = await this.performAutoVerification(task, validatedSubmission);
        
        if (verificationResult.success) {
          completion.status = 'completed';
          completion.completionTime.completedAt = new Date();
          completion.verification.method = 'automatic';
          completion.verification.verifiedAt = new Date();
          completion.verification.apiResponse = verificationResult.data;

          // Award points
          await this.awardTaskPoints(completion, task);
        } else {
          completion.status = 'submitted'; // Requires manual verification
          completion.verification.verificationNotes = verificationResult.reason;
        }
      } else {
        completion.status = 'submitted'; // Requires manual verification
      }

      await completion.save();

      // Update task statistics
      await this.updateTaskStatistics(taskId);

      return completion;
    } catch (error) {
      console.error('Error submitting task completion:', error);
      throw error;
    }
  }

  /**
   * Verify task completion (manual verification)
   * @param {string} completionId - Completion ID
   * @param {string} verifierId - Verifier user ID
   * @param {boolean} approved - Whether to approve or reject
   * @param {string} notes - Verification notes
   * @returns {Promise<Object>} Updated completion record
   */
  async verifyTaskCompletion(completionId, verifierId, approved, notes = '') {
    try {
      const completion = await SocialTaskCompletion.findById(completionId)
        .populate('taskId');

      if (!completion) {
        throw new Error('Task completion not found');
      }

      // Check verifier permissions
      const membership = await CommunityMember.findOne({
        userId: verifierId,
        communityId: completion.communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to verify tasks');
      }

      // Update completion status
      completion.status = approved ? 'approved' : 'rejected';
      completion.verification.verifiedBy = verifierId;
      completion.verification.verifiedAt = new Date();
      completion.verification.verificationNotes = notes;
      completion.verification.method = 'manual';

      if (approved) {
        completion.completionTime.completedAt = new Date();
        // Award points
        await this.awardTaskPoints(completion, completion.taskId);
      }

      await completion.save();

      // Update task statistics
      await this.updateTaskStatistics(completion.taskId._id);

      return completion;
    } catch (error) {
      console.error('Error verifying task completion:', error);
      throw error;
    }
  }

  /**
   * Get pending verifications for community
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID (must have verification permissions)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Pending verifications
   */
  async getPendingVerifications(communityId, userId, options = {}) {
    try {
      // Check permissions
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to view pending verifications');
      }

      return await SocialTaskCompletion.getPendingVerifications(communityId, options);
    } catch (error) {
      console.error('Error getting pending verifications:', error);
      throw error;
    }
  }

  /**
   * Get task analytics for community
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID (must have analytics permissions)
   * @param {string} timeframe - Time frame for analytics
   * @returns {Promise<Object>} Task analytics
   */
  async getTaskAnalytics(communityId, userId, timeframe = '30d') {
    try {
      // Check permissions
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canViewAnalytics')) {
        throw new Error('Insufficient permissions to view task analytics');
      }

      const [taskStats, completionAnalytics] = await Promise.all([
        SocialTask.getTaskStatistics(communityId, timeframe),
        SocialTaskCompletion.getCommunityTaskAnalytics(communityId, timeframe)
      ]);

      return {
        taskStatistics: taskStats,
        completionAnalytics,
        timeframe
      };
    } catch (error) {
      console.error('Error getting task analytics:', error);
      throw error;
    }
  }

  /**
   * Get user's task history
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} User's task history
   */
  async getUserTaskHistory(userId, communityId, options = {}) {
    try {
      return await SocialTaskCompletion.getUserTaskHistory(userId, communityId, options);
    } catch (error) {
      console.error('Error getting user task history:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validate task configuration
   * @param {Object} taskData - Task data to validate
   * @returns {Object} Validated task data
   */
  validateTaskConfiguration(taskData) {
    const validated = { ...taskData };

    // Validate required fields
    if (!validated.title || validated.title.trim().length === 0) {
      throw new Error('Task title is required');
    }

    if (!validated.type) {
      throw new Error('Task type is required');
    }

    if (!validated.rewards || !validated.rewards.points || validated.rewards.points < 0) {
      throw new Error('Valid point reward is required');
    }

    // Validate type-specific configuration
    switch (validated.type) {
      case 'twitter_follow':
        if (!validated.configuration?.twitterUsername) {
          throw new Error('Twitter username is required for Twitter follow tasks');
        }
        break;
      case 'discord_join':
        if (!validated.configuration?.discordServerId || !validated.configuration?.discordInviteUrl) {
          throw new Error('Discord server ID and invite URL are required for Discord join tasks');
        }
        break;
      case 'telegram_join':
        if (!validated.configuration?.telegramChannelUrl) {
          throw new Error('Telegram channel URL is required for Telegram join tasks');
        }
        break;
      case 'custom_url':
        if (!validated.configuration?.targetUrl) {
          throw new Error('Target URL is required for custom URL tasks');
        }
        break;
      case 'quiz':
        if (!validated.configuration?.questions || validated.configuration.questions.length === 0) {
          throw new Error('Questions are required for quiz tasks');
        }
        break;
    }

    return validated;
  }

  /**
   * Validate submission data
   * @param {string} taskType - Task type
   * @param {Object} submissionData - Submission data
   * @returns {Object} Validated submission data
   */
  validateSubmissionData(taskType, submissionData) {
    const validated = { ...submissionData };

    switch (taskType) {
      case 'twitter_follow':
        if (!validated.twitterHandle) {
          throw new Error('Twitter handle is required');
        }
        break;
      case 'discord_join':
        if (!validated.discordUsername) {
          throw new Error('Discord username is required');
        }
        break;
      case 'telegram_join':
        if (!validated.telegramUsername) {
          throw new Error('Telegram username is required');
        }
        break;
      case 'custom_url':
        if (!validated.proofDescription) {
          throw new Error('Proof description is required');
        }
        break;
      case 'quiz':
        if (!validated.responses || validated.responses.length === 0) {
          throw new Error('Quiz responses are required');
        }
        break;
    }

    return validated;
  }

  /**
   * Check if task type can be auto-verified
   * @param {string} taskType - Task type
   * @returns {boolean} Whether auto-verification is possible
   */
  canAutoVerify(taskType) {
    const autoVerifiableTypes = ['quiz', 'survey'];
    return autoVerifiableTypes.includes(taskType);
  }

  /**
   * Perform automatic verification
   * @param {Object} task - Task object
   * @param {Object} submissionData - Submission data
   * @returns {Promise<Object>} Verification result
   */
  async performAutoVerification(task, submissionData) {
    try {
      switch (task.type) {
        case 'quiz':
          return this.verifyQuizSubmission(task, submissionData);
        case 'survey':
          return { success: true, data: { verified: true } };
        default:
          return { success: false, reason: 'Auto-verification not supported for this task type' };
      }
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * Verify quiz submission
   * @param {Object} task - Task object
   * @param {Object} submissionData - Submission data
   * @returns {Object} Verification result
   */
  verifyQuizSubmission(task, submissionData) {
    const questions = task.configuration.questions;
    const responses = submissionData.responses;

    if (responses.length !== questions.length) {
      return { success: false, reason: 'Incomplete quiz responses' };
    }

    let correctAnswers = 0;
    const verifiedResponses = responses.map((response, index) => {
      const question = questions[index];
      const isCorrect = question.correctAnswer === response.answer;
      if (isCorrect) correctAnswers++;

      return {
        ...response,
        isCorrect
      };
    });

    // Update submission data with verification results
    submissionData.responses = verifiedResponses;

    const score = Math.round((correctAnswers / questions.length) * 100);
    const passed = score >= (task.configuration.passingScore || 70);

    return {
      success: passed,
      data: {
        score,
        correctAnswers,
        totalQuestions: questions.length,
        passed
      },
      reason: passed ? 'Quiz passed' : `Quiz failed with score ${score}%`
    };
  }

  /**
   * Award points for completed task
   * @param {Object} completion - Task completion object
   * @param {Object} task - Task object
   * @returns {Promise<void>}
   */
  async awardTaskPoints(completion, task) {
    try {
      const pointsToAward = task.calculateRewardPoints();
      
      // Award points through community points service
      await communityPointsService.awardCommunityPoints(
        completion.userId,
        completion.communityId,
        'community_task',
        {
          taskId: task._id,
          taskTitle: task.title,
          taskType: task.type,
          pointsAwarded: pointsToAward
        }
      );

      // Update completion record
      completion.rewards.pointsAwarded = pointsToAward;
      completion.rewards.bonusMultiplier = task.rewards.bonusMultiplier;

      await completion.save();
    } catch (error) {
      console.error('Error awarding task points:', error);
      throw error;
    }
  }

  /**
   * Update task statistics
   * @param {string} taskId - Task ID
   * @returns {Promise<void>}
   */
  async updateTaskStatistics(taskId) {
    try {
      const stats = await SocialTaskCompletion.getTaskCompletionStats(taskId);
      
      const task = await SocialTask.findById(taskId);
      if (task) {
        task.stats.totalCompletions = stats.totalCompletions;
        task.stats.uniqueCompletions = stats.uniqueCompletions;
        
        // Calculate total points awarded
        const completions = await SocialTaskCompletion.find({
          taskId,
          status: { $in: ['completed', 'approved'] },
          isActive: true
        });
        
        task.stats.totalPointsAwarded = completions.reduce((sum, c) => sum + (c.rewards.pointsAwarded || 0), 0);
        
        // Calculate average completion time
        const completedWithTime = completions.filter(c => c.completionTime.durationMinutes);
        if (completedWithTime.length > 0) {
          task.stats.averageCompletionTime = completedWithTime.reduce((sum, c) => sum + c.completionTime.durationMinutes, 0) / completedWithTime.length;
        }

        await task.save();
      }
    } catch (error) {
      console.error('Error updating task statistics:', error);
    }
  }
}

module.exports = new SocialTasksService();