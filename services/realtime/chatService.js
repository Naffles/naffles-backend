const io = require('../../config/socket');
const User = require('../../models/user/user');
const { getAsync, setAsync } = require('../../config/redisClient');
const { cleanMessage } = require('../../utils/clean');
const { getUserProfileImage } = require('../../utils/image');

class ChatService {
  constructor() {
    this.chatRooms = new Map();
    this.userCooldowns = new Map();
    this.COOLDOWN_DURATION = 2000; // 2 seconds between messages
    this.MAX_MESSAGE_LENGTH = 500;
    this.MAX_CHAT_HISTORY = 100;
  }

  /**
   * Join global chat room
   */
  async joinGlobalChat(socket, userId) {
    try {
      const user = await User.findById(userId).select('username profileImage');
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }

      socket.join('globalChat');
      
      // Send recent chat history
      const chatHistory = await this.getChatHistory('global');
      socket.emit('chatHistory', {
        room: 'global',
        messages: chatHistory
      });

      // Announce user joined (optional)
      socket.to('globalChat').emit('userJoined', {
        username: user.username,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error joining global chat:', error);
      socket.emit('error', 'Failed to join chat');
      return false;
    }
  }

  /**
   * Join community chat room
   */
  async joinCommunityChat(socket, userId, communityId) {
    try {
      const user = await User.findById(userId).select('username profileImage');
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }

      const roomName = `community:${communityId}`;
      socket.join(roomName);

      // Send recent chat history
      const chatHistory = await this.getChatHistory(communityId);
      socket.emit('chatHistory', {
        room: communityId,
        messages: chatHistory
      });

      return true;
    } catch (error) {
      console.error('Error joining community chat:', error);
      socket.emit('error', 'Failed to join community chat');
      return false;
    }
  }

  /**
   * Join game chat room
   */
  async joinGameChat(socket, userId, gameId) {
    try {
      const user = await User.findById(userId).select('username profileImage');
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }

      const roomName = `game:${gameId}`;
      socket.join(roomName);

      // Send recent chat history
      const chatHistory = await this.getChatHistory(`game:${gameId}`);
      socket.emit('chatHistory', {
        room: gameId,
        messages: chatHistory
      });

      return true;
    } catch (error) {
      console.error('Error joining game chat:', error);
      socket.emit('error', 'Failed to join game chat');
      return false;
    }
  }

  /**
   * Send message to global chat
   */
  async sendGlobalMessage(socket, userId, message) {
    try {
      // Check cooldown
      if (this.isUserOnCooldown(userId)) {
        socket.emit('error', 'Please wait before sending another message');
        return;
      }

      // Validate and clean message
      const cleanedMessage = this.validateAndCleanMessage(message);
      if (!cleanedMessage) {
        socket.emit('error', 'Invalid message');
        return;
      }

      const user = await User.findById(userId).select('username profileImage');
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }

      const profileImageUrl = await getUserProfileImage(user.profileImage);
      
      const chatMessage = {
        id: Date.now().toString(),
        user: {
          id: userId,
          username: user.username,
          profileImage: profileImageUrl
        },
        message: cleanedMessage,
        timestamp: new Date(),
        room: 'global'
      };

      // Save to chat history
      await this.saveChatMessage('global', chatMessage);

      // Broadcast to all users in global chat
      io.to('globalChat').emit('chatMessage', chatMessage);

      // Set cooldown
      this.setUserCooldown(userId);

      return chatMessage;
    } catch (error) {
      console.error('Error sending global message:', error);
      socket.emit('error', 'Failed to send message');
    }
  }

  /**
   * Send message to community chat
   */
  async sendCommunityMessage(socket, userId, communityId, message) {
    try {
      // Check cooldown
      if (this.isUserOnCooldown(userId)) {
        socket.emit('error', 'Please wait before sending another message');
        return;
      }

      // Validate and clean message
      const cleanedMessage = this.validateAndCleanMessage(message);
      if (!cleanedMessage) {
        socket.emit('error', 'Invalid message');
        return;
      }

      const user = await User.findById(userId).select('username profileImage');
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }

      const profileImageUrl = await getUserProfileImage(user.profileImage);
      
      const chatMessage = {
        id: Date.now().toString(),
        user: {
          id: userId,
          username: user.username,
          profileImage: profileImageUrl
        },
        message: cleanedMessage,
        timestamp: new Date(),
        room: communityId
      };

      // Save to chat history
      await this.saveChatMessage(communityId, chatMessage);

      // Broadcast to community chat room
      io.to(`community:${communityId}`).emit('chatMessage', chatMessage);

      // Set cooldown
      this.setUserCooldown(userId);

      return chatMessage;
    } catch (error) {
      console.error('Error sending community message:', error);
      socket.emit('error', 'Failed to send message');
    }
  }

  /**
   * Send message to game chat
   */
  async sendGameMessage(socket, userId, gameId, message) {
    try {
      // Check cooldown
      if (this.isUserOnCooldown(userId)) {
        socket.emit('error', 'Please wait before sending another message');
        return;
      }

      // Validate and clean message
      const cleanedMessage = this.validateAndCleanMessage(message);
      if (!cleanedMessage) {
        socket.emit('error', 'Invalid message');
        return;
      }

      const user = await User.findById(userId).select('username profileImage');
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }

      const profileImageUrl = await getUserProfileImage(user.profileImage);
      
      const chatMessage = {
        id: Date.now().toString(),
        user: {
          id: userId,
          username: user.username,
          profileImage: profileImageUrl
        },
        message: cleanedMessage,
        timestamp: new Date(),
        room: gameId
      };

      // Save to chat history
      await this.saveChatMessage(`game:${gameId}`, chatMessage);

      // Broadcast to game chat room
      io.to(`game:${gameId}`).emit('chatMessage', chatMessage);

      // Set cooldown
      this.setUserCooldown(userId);

      return chatMessage;
    } catch (error) {
      console.error('Error sending game message:', error);
      socket.emit('error', 'Failed to send message');
    }
  }

  /**
   * Send system message to a room
   */
  async sendSystemMessage(room, message, type = 'info') {
    try {
      const systemMessage = {
        id: Date.now().toString(),
        user: {
          id: 'system',
          username: 'System',
          profileImage: null
        },
        message: message,
        timestamp: new Date(),
        room: room,
        type: type,
        isSystem: true
      };

      // Determine the socket room name
      let socketRoom;
      if (room === 'global') {
        socketRoom = 'globalChat';
      } else if (room.startsWith('game:')) {
        socketRoom = room;
      } else {
        socketRoom = `community:${room}`;
      }

      // Save to chat history
      await this.saveChatMessage(room, systemMessage);

      // Broadcast system message
      io.to(socketRoom).emit('chatMessage', systemMessage);

      return systemMessage;
    } catch (error) {
      console.error('Error sending system message:', error);
    }
  }

  /**
   * Validate and clean message
   */
  validateAndCleanMessage(message) {
    if (!message || typeof message !== 'string') {
      return null;
    }

    // Trim whitespace
    message = message.trim();

    // Check length
    if (message.length === 0 || message.length > this.MAX_MESSAGE_LENGTH) {
      return null;
    }

    // Clean message (remove profanity, etc.)
    return cleanMessage(message);
  }

  /**
   * Check if user is on cooldown
   */
  isUserOnCooldown(userId) {
    const lastMessage = this.userCooldowns.get(userId);
    if (!lastMessage) {
      return false;
    }

    return (Date.now() - lastMessage) < this.COOLDOWN_DURATION;
  }

  /**
   * Set user cooldown
   */
  setUserCooldown(userId) {
    this.userCooldowns.set(userId, Date.now());
    
    // Clean up old cooldowns periodically
    setTimeout(() => {
      this.userCooldowns.delete(userId);
    }, this.COOLDOWN_DURATION);
  }

  /**
   * Save chat message to Redis
   */
  async saveChatMessage(room, message) {
    try {
      const key = `chat:${room}`;
      const chatHistory = await getAsync(key) || '[]';
      const messages = JSON.parse(chatHistory);
      
      messages.unshift(message);
      
      // Keep only recent messages
      if (messages.length > this.MAX_CHAT_HISTORY) {
        messages.splice(this.MAX_CHAT_HISTORY);
      }

      await setAsync(key, JSON.stringify(messages));
    } catch (error) {
      console.error('Error saving chat message:', error);
    }
  }

  /**
   * Get chat history for a room
   */
  async getChatHistory(room, limit = 50) {
    try {
      const key = `chat:${room}`;
      const chatHistory = await getAsync(key) || '[]';
      const messages = JSON.parse(chatHistory);
      
      return messages.slice(0, limit);
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Clear chat history for a room
   */
  async clearChatHistory(room) {
    try {
      const key = `chat:${room}`;
      await setAsync(key, '[]');
      
      // Notify users in the room
      let socketRoom;
      if (room === 'global') {
        socketRoom = 'globalChat';
      } else if (room.startsWith('game:')) {
        socketRoom = room;
      } else {
        socketRoom = `community:${room}`;
      }

      io.to(socketRoom).emit('chatCleared', { room });
      
      return true;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
  }

  /**
   * Get online users in a room
   */
  async getOnlineUsers(room) {
    try {
      let socketRoom;
      if (room === 'global') {
        socketRoom = 'globalChat';
      } else if (room.startsWith('game:')) {
        socketRoom = room;
      } else {
        socketRoom = `community:${room}`;
      }

      const sockets = await io.in(socketRoom).fetchSockets();
      const userIds = [];
      
      for (const socket of sockets) {
        const userId = await getAsync(`socketId:${socket.id}`);
        if (userId && !userIds.includes(userId)) {
          userIds.push(userId);
        }
      }

      const users = await User.find({ _id: { $in: userIds } })
        .select('username profileImage')
        .lean();

      return users.map(user => ({
        id: user._id,
        username: user.username,
        profileImage: user.profileImage
      }));
    } catch (error) {
      console.error('Error getting online users:', error);
      return [];
    }
  }

  /**
   * Leave all chat rooms
   */
  leaveAllRooms(socket) {
    socket.leaveAll();
  }
}

module.exports = new ChatService();