const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = 'mongodb://localhost:27017/naffles_test';
  const client = new MongoClient(uri);
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ MongoDB connection successful');
    
    const db = client.db('naffles_test');
    const result = await db.admin().ping();
    console.log('📊 Ping result:', result);
    
    // Create a test collection
    const collection = db.collection('test');
    await collection.insertOne({ test: true, timestamp: new Date() });
    console.log('✅ Test document inserted');
    
    const count = await collection.countDocuments();
    console.log('📈 Document count:', count);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
  } finally {
    await client.close();
    console.log('🔌 Connection closed');
  }
}

testConnection();