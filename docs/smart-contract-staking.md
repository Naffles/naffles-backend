# Smart Contract Staking System

## Overview

The Smart Contract Staking System provides blockchain-enforced NFT staking with enterprise-grade security, admin override capabilities, and collection-specific reward management. This system replaces the previous database-only approach with true on-chain NFT locking while maintaining backward compatibility.

## Architecture

### Core Components

1. **Smart Contracts**: Deployed on Ethereum, Polygon, Base, and Solana
2. **SmartContractService**: Interface layer for blockchain interactions
3. **BlockchainVerificationService**: Real-time verification and monitoring
4. **Enhanced StakingService**: Integrated business logic with smart contract support
5. **Admin Controllers**: Emergency controls and contract management

### Security Features

- **Multi-signature admin wallets** for all administrative functions
- **Role-based access control** with designated admin wallet verification
- **Emergency controls** with time-locked operations and mandatory waiting periods
- **Comprehensive audit logging** for all admin operations and security events
- **Real-time monitoring** with anomaly detection and threat alerting
- **Reentrancy protection** and overflow/underflow prevention
- **Input validation** and bounds checking for all functions

## Smart Contract Functions

### Core Staking Functions

#### `stakeNFT(address nftContract, uint256 tokenId, uint8 duration)`
- Transfers NFT to contract and locks for specified duration
- Validates NFT ownership and contract approval
- Creates staking position with cryptographic verification
- Emits `NFTStaked` event with position details

#### `claimNFT(bytes32 positionId)`
- Returns NFT to owner after lock period completion
- Validates position ownership and unlock eligibility
- Updates contract statistics and emits `NFTClaimed` event

### Admin Functions (Multi-signature Required)

#### `adminUnlock(bytes32 positionId, string reason)`
- Emergency unlock with 24-hour time delay
- Requires multi-signature confirmation from admin wallets
- Comprehensive audit logging with justification
- Emits `EmergencyUnlock` event

#### `emergencyWithdrawNFT(bytes32 positionId, address recipient, string reason)`
- Emergency withdrawal to specified recipient
- Multi-signature requirement with extended delay
- Complete audit trail and security event logging

#### `pauseContract()` / `unpauseContract()`
- Emergency pause functionality with automatic unpause after 7 days
- Immediate effect with comprehensive event logging
- Admin-only access with multi-signature requirements

### Collection Management

#### `addCollection(address nftContract, ...rewards)`
- Add new NFT collection with reward structure
- Configure duration-based rewards and multipliers
- Admin validation and approval workflow

#### `updateCollectionRewards(address nftContract, ...rewards)`
- Update existing collection reward structures
- Immediate effect with backward compatibility
- Admin-only access with change logging

## Service Layer

### SmartContractService

Primary interface for blockchain interactions with comprehensive error handling and retry logic.

```javascript
// Stake NFT with smart contract enforcement
const result = await smartContractService.stakeNFT(
  'ethereum',
  nftContractAddress,
  tokenId,
  durationCode,
  userWallet
);

// Admin emergency unlock
const unlockResult = await smartContractService.adminUnlock(
  'ethereum',
  positionId,
  'Emergency unlock requested by user support',
  adminWallet
);
```

### BlockchainVerificationService

Real-time verification and monitoring with caching and batch processing.

```javascript
// Verify staking position against smart contract
const verification = await blockchainVerificationService.verifyStakingStatus(
  'ethereum',
  positionId
);

// Cross-chain staking verification for benefits
const crossChainVerification = await blockchainVerificationService.verifyCrossChainStaking(
  userWallets
);

// Gaming bonus calculation
const bonuses = await blockchainVerificationService.verifyGamingBonuses(
  userWallets
);
```

## Database Integration

### Enhanced StakingPosition Model

```javascript
{
  // Existing fields...
  
  // Smart contract integration
  smartContractPositionId: String,
  onChainVerified: Boolean,
  blockchainTransactionHash: String,
  
  // Transaction details
  stakingTransaction: {
    txHash: String,
    blockNumber: Number,
    gasUsed: String,
    confirmed: Boolean
  },
  
  // Emergency actions
  emergencyUnlock: {
    admin: ObjectId,
    reason: String,
    unlockedAt: Date,
    transactionHash: String
  }
}
```

## Admin Interface

### Emergency Controls

#### Admin Unlock NFT
```http
POST /admin/smart-contract/unlock-nft
{
  "positionId": "position_id",
  "reason": "Detailed justification for emergency unlock"
}
```

#### Emergency Withdraw NFT
```http
POST /admin/smart-contract/emergency-withdraw
{
  "positionId": "position_id",
  "recipientAddress": "0x...",
  "reason": "Detailed justification for emergency withdrawal"
}
```

#### Contract Pause/Unpause
```http
POST /admin/smart-contract/pause-contract
{
  "blockchain": "ethereum"
}

POST /admin/smart-contract/unpause-contract
{
  "blockchain": "ethereum"
}
```

### Monitoring and Verification

#### Position Verification
```http
GET /admin/smart-contract/verify-position/:positionId
```

#### Data Consistency Check
```http
GET /admin/smart-contract/consistency-check?blockchain=ethereum
```

#### Smart Contract Health
```http
GET /admin/smart-contract/health
```

## Security Implementation

### Multi-Signature Requirements

All administrative functions require multi-signature confirmation:

```solidity
modifier onlyMultiSig(bytes32 operationId) {
    require(hasRole(MULTI_SIG_ROLE, msg.sender), "Unauthorized");
    
    if (!multiSigConfirmed[operationId][msg.sender]) {
        multiSigConfirmed[operationId][msg.sender] = true;
        multiSigConfirmations[operationId]++;
    }
    
    require(multiSigConfirmations[operationId] >= multiSigThreshold, "Insufficient confirmations");
    _;
}
```

### Access Control

```solidity
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
bytes32 public constant MULTI_SIG_ROLE = keccak256("MULTI_SIG_ROLE");
```

### Security Monitoring

```javascript
// Automatic security event logging
await securityMonitoringService.logSecurityEvent({
  eventType: 'smart_contract_admin_unlock',
  playerId: adminWallet,
  details: { positionId, reason, transactionHash },
  severity: 'high'
});
```

## Deployment

### Environment Variables

```bash
# Smart contract configuration
SMART_CONTRACT_ENABLED=true
ETHEREUM_STAKING_CONTRACT_ADDRESS=0x...
POLYGON_STAKING_CONTRACT_ADDRESS=0x...
BASE_STAKING_CONTRACT_ADDRESS=0x...
SOLANA_STAKING_PROGRAM_ID=...

# Admin wallet configuration
ETHEREUM_ADMIN_WALLET_ADDRESS=0x...
POLYGON_ADMIN_WALLET_ADDRESS=0x...
BASE_ADMIN_WALLET_ADDRESS=0x...
SOLANA_ADMIN_WALLET_ADDRESS=...

# Private keys (encrypted in production)
ETHEREUM_ADMIN_PRIVATE_KEY=...
POLYGON_ADMIN_PRIVATE_KEY=...
BASE_ADMIN_PRIVATE_KEY=...
SOLANA_ADMIN_PRIVATE_KEY=...
```

### Contract Deployment

1. **Compile Contracts**: Use Hardhat or Foundry for Ethereum-based chains
2. **Deploy to Testnets**: Comprehensive testing on testnets first
3. **Security Audit**: Professional audit by certified auditors
4. **Mainnet Deployment**: Deploy with proper access controls
5. **Verification**: Verify contracts on block explorers

### Migration Process

```bash
# Dry run migration
DRY_RUN=true node scripts/migrateToSmartContracts.js --dry-run

# Live migration with monitoring
SMART_CONTRACT_ENABLED=true node scripts/migrateToSmartContracts.js
```

## Monitoring and Analytics

### Health Checks

```javascript
// Service health monitoring
const health = await smartContractService.getServiceHealth();
console.log('Smart contract health:', health.status);

// Contract statistics
const stats = await smartContractService.getContractStats('ethereum');
console.log('Contract stats:', stats);
```

### Data Consistency

```javascript
// Automated consistency checking
const consistency = await blockchainVerificationService.performDataConsistencyCheck();
console.log('Consistency score:', consistency.consistencyScore);
```

### Anomaly Detection

```javascript
// Detect suspicious patterns
const anomalies = await blockchainVerificationService.detectAnomalies();
console.log('Risk score:', anomalies.riskScore);
```

## Testing

### Unit Tests

```bash
# Run smart contract tests
npm test tests/smartContractStaking.test.js

# Run with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Test smart contract integration
npm run test:integration

# Test admin functions
npm run test:admin
```

### Security Tests

```bash
# Run security test suite
npm run test:security

# Formal verification
npm run verify:contracts
```

## Troubleshooting

### Common Issues

#### Smart Contract Not Responding
```javascript
// Check contract health
const health = await smartContractService.getServiceHealth();
if (health.status !== 'healthy') {
  console.error('Contract health issue:', health);
}
```

#### Transaction Failures
```javascript
// Check gas prices and network congestion
const gasPrice = await provider.getFeeData();
console.log('Current gas price:', gasPrice.gasPrice);
```

#### Verification Failures
```javascript
// Perform manual verification
const verification = await blockchainVerificationService.verifyStakingStatus(
  blockchain,
  positionId,
  false // Don't use cache
);
```

### Emergency Procedures

#### Contract Pause
1. Identify the issue and assess severity
2. Gather multi-signature confirmations from admin wallets
3. Execute pause transaction with detailed reason
4. Notify all stakeholders and users
5. Investigate and resolve the underlying issue
6. Execute unpause when safe to resume

#### Data Inconsistency
1. Run comprehensive consistency check
2. Identify affected positions and users
3. Perform manual verification for critical positions
4. Execute corrective actions with admin approval
5. Update monitoring to prevent recurrence

## Best Practices

### Security
- Always use multi-signature wallets for admin functions
- Implement comprehensive audit logging for all operations
- Regular security audits and penetration testing
- Monitor for suspicious activity and anomalies
- Keep private keys secure and rotate regularly

### Operations
- Perform regular health checks and monitoring
- Maintain comprehensive documentation and runbooks
- Test all emergency procedures regularly
- Keep smart contracts updated with security patches
- Maintain backup and recovery procedures

### Development
- Comprehensive testing before deployment
- Code reviews for all smart contract changes
- Formal verification for critical functions
- Gradual rollout with monitoring
- Maintain backward compatibility when possible

## Support and Maintenance

### Regular Maintenance
- Monthly consistency checks
- Quarterly security audits
- Annual contract upgrades (if needed)
- Continuous monitoring and alerting

### Emergency Support
- 24/7 monitoring for critical issues
- Emergency response team with multi-sig access
- Escalation procedures for security incidents
- Communication plan for user notifications

### Documentation Updates
- Keep documentation current with code changes
- Update runbooks based on operational experience
- Maintain change logs for all modifications
- Regular training for support team

## Conclusion

The Smart Contract Staking System provides enterprise-grade security and functionality for NFT staking operations. With comprehensive admin controls, real-time monitoring, and robust security measures, it ensures the integrity and reliability of the staking platform while maintaining the flexibility needed for operational requirements.

For additional support or questions, please refer to the development team or consult the comprehensive test suites and example implementations provided in the codebase.