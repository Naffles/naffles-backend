# Enhanced User Authentication and Account Management System

## Overview

The enhanced authentication system provides comprehensive user management with support for both wallet-based and email/password authentication, session management, and advanced profile features.

## Features

### 1. Multi-Method Authentication
- **Wallet-based authentication** (primary method)
  - Supports Phantom (Solana) and MetaMask (Ethereum) wallets
  - Cryptographic signature verification
  - Multi-chain support
- **Email/password authentication** (secondary method)
  - Traditional credential-based login
  - Email verification required
  - Password strength validation

### 2. Enhanced User Model
- **Profile Data**: Extended user profiles with preferences and settings
- **Founders Keys**: NFT-based benefits and tier system
- **Multi-wallet Support**: Users can connect multiple wallets
- **Activity Tracking**: Login counts, last activity, session history
- **Tier System**: Bronze, Silver, Gold, Platinum, Diamond tiers

### 3. Session Management
- **Redis-based sessions** with 7-day expiration
- **Session activity tracking** and automatic updates
- **Multi-device support** with session validation
- **Secure logout** with session destruction

### 4. Wallet Management
- **Primary wallet designation** for main account operations
- **Wallet metadata** for user-defined labels and information
- **Multi-chain support** with separate balances per chain
- **Wallet verification** and connection tracking

## API Endpoints

### Authentication Endpoints

#### POST /api/users/signup
Register new user with email and password.
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "verificationCode": "123456",
  "username": "optional_username"
}
```

#### POST /api/users/login
Login with email/username and password.
```json
{
  "identifier": "user@example.com",
  "password": "SecurePassword123!"
}
```

#### POST /api/users/login/wallet
Login or register with wallet signature.
```json
{
  "address": "0x1234...",
  "walletType": "metamask",
  "chainId": "1",
  "signature": "0xabc...",
  "timestamp": "2024-12-18T10:00:00Z"
}
```

#### POST /api/users/logout
Logout and destroy session.
```json
{
  "sessionId": "session:userId:timestamp"
}
```

#### POST /api/users/refresh-token
Refresh authentication token.
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

### Profile Management Endpoints

#### GET /api/users/profile
Get complete user profile with wallets and balances.

#### PATCH /api/users/profile/data
Update profile data and preferences.
```json
{
  "profileData": {
    "displayName": "John Doe",
    "bio": "Crypto enthusiast",
    "preferences": {
      "notifications": {
        "email": true,
        "push": false
      }
    }
  }
}
```

#### GET /api/users/profile/wallets
Get all connected wallets for the user.

#### PATCH /api/users/profile/primary-wallet
Set primary wallet for the user.
```json
{
  "address": "0x1234..."
}
```

#### GET /api/users/profile/founders-keys
Get Founders Key benefits and tier information.

#### GET /api/users/profile/activity-summary
Get user activity summary and statistics.

### Wallet Management Endpoints

#### POST /api/users/link-wallet
Link additional wallet to existing account.
```json
{
  "address": "0x5678...",
  "walletType": "phantom",
  "chainId": "solana",
  "signature": "signature_data",
  "timestamp": "2024-12-18T10:00:00Z"
}
```

#### PATCH /api/users/profile/wallet-metadata
Update wallet metadata and labels.
```json
{
  "address": "0x1234...",
  "metadata": {
    "label": "My Main Wallet",
    "network": "mainnet"
  }
}
```

## Authentication Flow

### Wallet Authentication Flow
1. User connects wallet (MetaMask/Phantom)
2. Frontend generates timestamp and message
3. User signs message with wallet
4. Backend verifies signature
5. If wallet exists, login user; if not, create new user
6. Generate JWT token and create session
7. Return user data and authentication tokens

### Email Authentication Flow
1. User requests email verification code
2. System sends verification code to email
3. User submits registration with code
4. System verifies code and creates user
5. User can login with email/password
6. Generate JWT token and create session

## Security Features

### Signature Verification
- **Ethereum**: Uses ethers.js to verify message signatures
- **Solana**: Uses tweetnacl for signature verification
- **Message Format**: Standardized message with timestamp and expiration
- **Replay Protection**: 5-minute signature expiration

### Session Security
- **Redis Storage**: Sessions stored in Redis with TTL
- **Session Validation**: Automatic session activity updates
- **Multi-device Support**: Each login creates separate session
- **Secure Logout**: Complete session destruction

### Input Validation
- **Email Validation**: RFC-compliant email validation
- **Password Strength**: Minimum requirements enforced
- **Address Validation**: Blockchain address format validation
- **Rate Limiting**: Protection against brute force attacks

## Database Schema

### Enhanced User Model
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String, // Hashed
  profileData: {
    displayName: String,
    bio: String,
    preferences: {
      notifications: { email: Boolean, push: Boolean },
      privacy: { showProfile: Boolean, showActivity: Boolean }
    }
  },
  foundersKeys: [{
    tokenId: String,
    contractAddress: String,
    tier: Number,
    benefits: { feeDiscount: Number, priorityAccess: Boolean }
  }],
  tier: String, // bronze, silver, gold, platinum, diamond
  authMethods: { wallet: Boolean, email: Boolean },
  primaryWallet: {
    address: String,
    walletType: String,
    chainId: String
  },
  isVerified: Boolean,
  isBlocked: Boolean,
  lastActiveAt: Date,
  loginCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Enhanced WalletAddress Model
```javascript
{
  _id: ObjectId,
  userRef: ObjectId,
  address: String,
  walletType: String, // phantom, metamask
  chainId: String,
  isPrimary: Boolean,
  isVerified: Boolean,
  connectedAt: Date,
  lastUsedAt: Date,
  metadata: {
    label: String,
    network: String,
    balance: String,
    nftCount: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

## Usage Examples

### Frontend Integration

#### Wallet Connection
```javascript
// MetaMask connection
const connectMetaMask = async () => {
  const accounts = await window.ethereum.request({ 
    method: 'eth_requestAccounts' 
  });
  const address = accounts[0];
  const timestamp = new Date().toISOString();
  const message = `Welcome to Naffles.com!\nPlease confirm your sign-in request.\n\nYour Address: ${address}\nTimestamp: ${timestamp}\n\nThis signature request will expire 5 minutes after the timestamp shown above.`;
  
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, address]
  });

  const response = await fetch('/api/users/login/wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      walletType: 'metamask',
      chainId: '1',
      signature,
      timestamp
    })
  });

  const data = await response.json();
  localStorage.setItem('authToken', data.token);
  localStorage.setItem('sessionId', data.sessionId);
};
```

#### Session Management
```javascript
// Set up axios interceptors for session management
axios.defaults.headers.common['Authorization'] = `Bearer ${localStorage.getItem('authToken')}`;
axios.defaults.headers.common['X-Session-ID'] = localStorage.getItem('sessionId');

// Automatic token refresh
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post('/api/users/refresh-token', {
            refreshToken
          });
          localStorage.setItem('authToken', response.data.token);
          return axios.request(error.config);
        } catch (refreshError) {
          // Redirect to login
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
```

## Migration Guide

### Existing Users
The system includes a migration script that:
1. Updates existing users with new schema fields
2. Initializes authentication methods based on existing data
3. Sets up wallet relationships and primary wallet designation
4. Creates necessary database indexes

### Running Migration
```bash
npm run migrate
```

## Testing

### Unit Tests
- AuthService functionality
- User model methods
- Wallet address validation
- Session management

### Integration Tests
- Authentication endpoints
- Profile management
- Wallet linking
- Session validation

### Running Tests
```bash
npm test
```

## Security Considerations

1. **Never store private keys** - Only addresses and signatures
2. **Validate all signatures** - Prevent signature replay attacks
3. **Use HTTPS only** - Protect tokens in transit
4. **Implement rate limiting** - Prevent brute force attacks
5. **Regular session cleanup** - Remove expired sessions
6. **Input sanitization** - Prevent injection attacks
7. **Audit logging** - Track authentication events

## Performance Optimization

1. **Redis caching** - Fast session lookup
2. **Database indexing** - Optimized queries
3. **Connection pooling** - Efficient database connections
4. **Token caching** - Reduce verification overhead
5. **Lazy loading** - Load profile data on demand

## Monitoring and Logging

- Authentication success/failure rates
- Session creation and destruction
- Wallet connection events
- Profile update activities
- Error rates and types
- Performance metrics

## Performance Optimizations

### Redis Connection Pooling
- Enhanced Redis client with connection pooling
- Automatic reconnection and error handling
- Optimized timeout and retry settings
- Connection monitoring and logging

### Rate Limiting
- Redis-based distributed rate limiting
- Endpoint-specific rate limits
- IP-based threat scoring
- Automatic IP blocking for suspicious activity

### Enhanced Validation
- Comprehensive wallet address validation
- Signature format verification
- Timestamp expiration checking
- Chain-specific validation rules

### Performance Monitoring
- Request timing and performance metrics
- Slow operation detection and alerting
- Performance statistics and analytics
- Automated performance reporting

### Security Monitoring
- Real-time threat detection
- IP-based security scoring
- Suspicious activity tracking
- Automated security responses

## Future Enhancements

1. **Multi-factor authentication** (MFA)
2. **Social login integration** (Google, Twitter, Discord)
3. **Hardware wallet support** (Ledger, Trezor)
4. **Biometric authentication** for mobile
5. **Advanced session management** with device tracking
6. **OAuth 2.0 provider** for third-party integrations
7. **Machine learning-based fraud detection**
8. **Advanced analytics and reporting**