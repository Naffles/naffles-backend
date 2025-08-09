const realTimeService = require('./realTimeService');
const notificationService = require('./notificationService');
const chatService = require('./chatService');

class IntegrationService {
  /**
   * Handle raffle creation
   */
  async onRaffleCreated(raffle) {
    try {
      // Start real-time countdown
      realTimeService.startRaffleCountdown(raffle);

      // Send system message to global chat
      await chatService.sendSystemMessage(
        'global',
        `New raffle created: ${raffle.title} by ${raffle.creator.username}`,
        'raffle_created'
      );

      // Update leaderboard if creator gets points
      await realTimeService.updateLeaderboard();

      console.log(`Real-time tracking started for raffle: ${raffle._id}`);
    } catch (error) {
      console.error('Error handling raffle creation:', error);
    }
  }

  /**
   * Handle raffle entry
   */
  async onRaffleEntry(raffle, user, entryData) {
    try {
      // Send confirmation notification to user
      await notificationService.sendNotification(user._id.toString(), {
        type: notificationService.notificationTypes.RAFFLE_ENTRY,
        title: 'Raffle Entry Confirmed',
        message: `Your entry for "${raffle.title}" has been confirmed`,
        data: {
          raffleId: raffle._id.toString(),
          entryCount: entryData.ticketCount || 1
        }
      });

      // Send system message to raffle chat
      await chatService.sendSystemMessage(
        `raffle:${raffle._id}`,
        `${user.username} entered the raffle`,
        'raffle_entry'
      );

      console.log(`Raffle entry processed for user ${user._id} in raffle ${raffle._id}`);
    } catch (error) {
      console.error('Error handling raffle entry:', error);
    }
  }

  /**
   * Handle raffle winner selection
   */
  async onRaffleWinner(raffle, winner) {
    try {
      // Stop countdown
      realTimeService.stopRaffleCountdown(raffle._id.toString());

      // Broadcast winner announcement
      await realTimeService.broadcastWinnerAnnouncement(raffle, winner);

      // Send system message to global chat
      await chatService.sendSystemMessage(
        'global',
        `🎉 ${winner.username} won the raffle: ${raffle.title}!`,
        'winner_announcement'
      );

      // Update leaderboard
      await realTimeService.updateLeaderboard();

      console.log(`Winner announcement sent for raffle ${raffle._id}`);
    } catch (error) {
      console.error('Error handling raffle winner:', error);
    }
  }

  /**
   * Handle game result
   */
  async onGameResult(gameData) {
    try {
      const { playerId, gameType, result, amount, currency } = gameData;

      // Send game notification
      const notificationType = result === 'win' ? 'game_win' : 'game_loss';
      await notificationService.sendGameNotification(playerId, notificationType, {
        game: gameType,
        result: result,
        amount: amount,
        currency: currency
      });

      // Send system message to global chat for big wins
      if (result === 'win' && amount >= 100) {
        const user = await require('../../models/user/user').findById(playerId).select('username');
        if (user) {
          await chatService.sendSystemMessage(
            'global',
            `🎰 ${user.username} won ${amount} ${currency} in ${gameType}!`,
            'big_win'
          );
        }
      }

      // Update leaderboard
      await realTimeService.updateLeaderboard();

      console.log(`Game result processed for player ${playerId}: ${result}`);
    } catch (error) {
      console.error('Error handling game result:', error);
    }
  }

  /**
   * Handle points earned
   */
  async onPointsEarned(userId, pointsData) {
    try {
      const { amount, reason, communityId } = pointsData;

      // Send points notification
      await notificationService.sendNotification(userId, {
        type: notificationService.notificationTypes.POINTS_EARNED,
        title: 'Points Earned!',
        message: `You earned ${amount} points for ${reason}`,
        data: {
          amount: amount,
          reason: reason,
          communityId: communityId
        }
      });

      // Update leaderboard
      await realTimeService.updateLeaderboard();

      console.log(`Points notification sent to user ${userId}: +${amount} points`);
    } catch (error) {
      console.error('Error handling points earned:', error);
    }
  }

  /**
   * Handle achievement unlocked
   */
  async onAchievementUnlocked(userId, achievement) {
    try {
      // Send achievement notification
      await notificationService.sendNotification(userId, {
        type: notificationService.notificationTypes.ACHIEVEMENT_UNLOCKED,
        title: 'Achievement Unlocked!',
        message: `You unlocked: ${achievement.name}`,
        data: {
          achievementId: achievement._id.toString(),
          achievementName: achievement.name,
          description: achievement.description,
          points: achievement.points
        }
      });

      // Send system message to global chat for rare achievements
      if (achievement.rarity === 'legendary' || achievement.rarity === 'epic') {
        const user = await require('../../models/user/user').findById(userId).select('username');
        if (user) {
          await chatService.sendSystemMessage(
            'global',
            `🏆 ${user.username} unlocked the ${achievement.rarity} achievement: ${achievement.name}!`,
            'achievement_unlocked'
          );
        }
      }

      console.log(`Achievement notification sent to user ${userId}: ${achievement.name}`);
    } catch (error) {
      console.error('Error handling achievement unlocked:', error);
    }
  }

  /**
   * Handle community events
   */
  async onCommunityEvent(eventData) {
    try {
      const { type, communityId, userId, data } = eventData;

      switch (type) {
        case 'member_joined':
          await chatService.sendSystemMessage(
            communityId,
            `${data.username} joined the community!`,
            'member_joined'
          );
          break;

        case 'community_created':
          await chatService.sendSystemMessage(
            'global',
            `New community created: ${data.communityName}`,
            'community_created'
          );
          break;

        case 'social_task_completed':
          await notificationService.sendNotification(userId, {
            type: 'social_task_completed',
            title: 'Task Completed!',
            message: `You completed: ${data.taskName}`,
            data: data
          });
          break;

        default:
          console.log(`Unknown community event type: ${type}`);
      }

      console.log(`Community event processed: ${type} for community ${communityId}`);
    } catch (error) {
      console.error('Error handling community event:', error);
    }
  }

  /**
   * Handle system maintenance notifications
   */
  async onSystemMaintenance(maintenanceData) {
    try {
      const { type, message, scheduledTime } = maintenanceData;

      // Send system announcement
      await notificationService.sendSystemAnnouncement({
        title: 'System Maintenance',
        message: message,
        persistent: true,
        data: {
          type: type,
          scheduledTime: scheduledTime
        }
      });

      // Send system message to all chat rooms
      await chatService.sendSystemMessage('global', message, 'maintenance');

      console.log(`System maintenance notification sent: ${type}`);
    } catch (error) {
      console.error('Error handling system maintenance:', error);
    }
  }

  /**
   * Handle user level up
   */
  async onUserLevelUp(userId, levelData) {
    try {
      const { newLevel, rewards } = levelData;

      // Send level up notification
      await notificationService.sendNotification(userId, {
        type: 'level_up',
        title: 'Level Up!',
        message: `Congratulations! You reached level ${newLevel}`,
        data: {
          newLevel: newLevel,
          rewards: rewards
        }
      });

      // Send system message for high levels
      if (newLevel >= 50) {
        const user = await require('../../models/user/user').findById(userId).select('username');
        if (user) {
          await chatService.sendSystemMessage(
            'global',
            `🌟 ${user.username} reached level ${newLevel}!`,
            'level_up'
          );
        }
      }

      console.log(`Level up notification sent to user ${userId}: Level ${newLevel}`);
    } catch (error) {
      console.error('Error handling user level up:', error);
    }
  }

  /**
   * Handle jackpot events
   */
  async onJackpotEvent(eventData) {
    try {
      const { type, amount, winnerId, jackpotType } = eventData;

      switch (type) {
        case 'jackpot_won':
          const winner = await require('../../models/user/user').findById(winnerId).select('username');
          if (winner) {
            // Send winner notification
            await notificationService.sendNotification(winnerId, {
              type: 'jackpot_win',
              title: 'JACKPOT WON!',
              message: `You won the ${jackpotType} jackpot: ${amount} points!`,
              data: {
                amount: amount,
                jackpotType: jackpotType
              }
            });

            // Broadcast to everyone
            await chatService.sendSystemMessage(
              'global',
              `🎰 JACKPOT! ${winner.username} won ${amount} points in the ${jackpotType} jackpot!`,
              'jackpot_won'
            );
          }
          break;

        case 'jackpot_increased':
          // Broadcast jackpot increase
          await chatService.sendSystemMessage(
            'global',
            `💰 ${jackpotType} jackpot increased to ${amount} points!`,
            'jackpot_increased'
          );
          break;

        default:
          console.log(`Unknown jackpot event type: ${type}`);
      }

      console.log(`Jackpot event processed: ${type}`);
    } catch (error) {
      console.error('Error handling jackpot event:', error);
    }
  }
}

module.exports = new IntegrationService();