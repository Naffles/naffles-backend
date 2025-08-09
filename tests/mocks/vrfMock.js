// Mock VRF service for testing
class VRFMock {
  constructor() {
    this.requests = new Map();
  }
  
  async requestRandomness(params) {
    const requestId = Math.floor(Math.random() * 1000000);
    const randomValue = Math.floor(Math.random() * 1000000);
    
    this.requests.set(requestId, {
      ...params,
      randomValue,
      fulfilled: true,
      timestamp: Date.now()
    });
    
    return { requestId, randomValue };
  }
  
  async getRandomValue(requestId) {
    const request = this.requests.get(requestId);
    return request ? request.randomValue : null;
  }
}

module.exports = new VRFMock();
