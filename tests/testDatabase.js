const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

class TestDatabase {
  constructor() {
    this.mongod = null;
    this.connection = null;
  }

  async start() {
    try {
      console.log('🚀 Starting in-memory MongoDB...');
      
      this.mongod = await MongoMemoryServer.create({
        instance: {
          port: 27018, // Use different port to avoid conflicts
          dbName: 'naffles_test'
        }
      });

      const uri = this.mongod.getUri();
      console.log('📊 MongoDB Memory Server URI:', uri);

      // Connect mongoose
      this.connection = await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });

      console.log('✅ In-memory MongoDB connected successfully');
      return uri;
      
    } catch (error) {
      console.error('❌ Failed to start in-memory MongoDB:', error.message);
      throw error;
    }
  }

  async stop() {
    try {
      if (this.connection) {
        await mongoose.disconnect();
        console.log('🔌 Mongoose disconnected');
      }

      if (this.mongod) {
        await this.mongod.stop();
        console.log('🛑 In-memory MongoDB stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping test database:', error.message);
    }
  }

  async clear() {
    try {
      if (this.connection) {
        const collections = mongoose.connection.collections;
        
        for (const key in collections) {
          const collection = collections[key];
          await collection.deleteMany({});
        }
        
        console.log('🧹 Test database cleared');
      }
    } catch (error) {
      console.error('❌ Error clearing test database:', error.message);
    }
  }

  getUri() {
    return this.mongod ? this.mongod.getUri() : null;
  }

  isRunning() {
    return !!(this.mongod && this.connection);
  }
}

// Singleton instance
const testDb = new TestDatabase();

module.exports = testDb;