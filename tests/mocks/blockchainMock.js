// Mock blockchain service for testing
class BlockchainMock {
  constructor() {
    this.transactions = new Map();
    this.blocks = [];
  }
  
  async sendTransaction(tx) {
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);
    this.transactions.set(txHash, { ...tx, status: 'pending' });
    
    // Simulate confirmation after 1 second
    setTimeout(() => {
      this.transactions.set(txHash, { ...tx, status: 'confirmed' });
    }, 1000);
    
    return { hash: txHash };
  }
  
  async getTransactionReceipt(txHash) {
    return this.transactions.get(txHash) || null;
  }
  
  async getBalance(address) {
    return '1000000000000000000'; // 1 ETH in wei
  }
}

module.exports = new BlockchainMock();
