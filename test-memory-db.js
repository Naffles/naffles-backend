const testDb = require('./tests/testDatabase');
const mongoose = require('mongoose');

async function testMemoryDatabase() {
  try {
    console.log('🧪 Testing in-memory MongoDB setup...');
    
    // Start the in-memory database
    const uri = await testDb.start();
    
    // Test basic operations
    const TestSchema = new mongoose.Schema({
      name: String,
      value: Number,
      createdAt: { type: Date, default: Date.now }
    });
    
    const TestModel = mongoose.model('Test', TestSchema);
    
    // Insert test data
    console.log('📝 Inserting test data...');
    const testDoc = new TestModel({
      name: 'Test Document',
      value: 42
    });
    
    await testDoc.save();
    console.log('✅ Document saved:', testDoc._id);
    
    // Query test data
    console.log('🔍 Querying test data...');
    const found = await TestModel.findOne({ name: 'Test Document' });
    console.log('✅ Document found:', found.name, found.value);
    
    // Count documents
    const count = await TestModel.countDocuments();
    console.log('📊 Document count:', count);
    
    // Clear database
    await testDb.clear();
    const countAfterClear = await TestModel.countDocuments();
    console.log('🧹 Document count after clear:', countAfterClear);
    
    console.log('🎉 In-memory database test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Stop the database
    await testDb.stop();
    console.log('🏁 Test completed');
  }
}

testMemoryDatabase();