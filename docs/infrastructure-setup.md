# Infrastructure Setup Guide

This document provides detailed information about the Naffles backend infrastructure setup, configuration, and deployment.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Redis Configuration](#redis-configuration)
5. [Blockchain Integration](#blockchain-integration)
6. [Health Monitoring](#health-monitoring)
7. [Deployment](#deployment)
8. [Troubleshooting](#troubleshooting)

## Architecture Overview

The Naffles backend is built with a microservices-oriented architecture using Node.js and Express.js:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Reverse Proxy │    │   CDN/Static    │
│    (Nginx)      │    │    (Nginx)      │    │    Assets       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────────┐
         │                Express.js App                       │
         │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
         │  │   Routes    │ │Controllers  │ │  Services   │   │
         │  └─────────────┘ └─────────────┘ └─────────────┘   │
         │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
         │  │ Middleware  │ │   Models    │ │  Utilities  │   │
         │  └─────────────┘ └─────────────┘ └─────────────┘   │
         └─────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    MongoDB      │    │     Redis       │    │   Blockchain    │
│   (Database)    │    │   (Cache/       │    │   Networks      │
│                 │    │   Sessions)     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Environment Configuration

### Environment Files

The application supports multiple environment configurations:

- `.env.development` - Local development
- `.env.staging` - Staging environment
- `.env.production` - Production environment
- `.env.test` - Testing environment

### Configuration Management

The `config/environment.ts` file provides a centralized configuration management system:

```typescript
// Example usage
import { environmentManager } from './config/environment';

const config = environmentManager.getConfig();
const dbConfig = environmentManager.getDatabaseConfig();
const redisConfig = environmentManager.getRedisConfig();
```

### Key Configuration Sections

#### Database Configuration
```bash
MONGO_URL=mongodb://localhost:27017/naffles_dev
MONGO_MAX_POOL_SIZE=10
MONGO_SERVER_SELECTION_TIMEOUT=5000
MONGO_SOCKET_TIMEOUT=45000
```

#### Redis Configuration
```bash
REDIS_URL=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional-password
REDIS_DB=0
```

#### Security Configuration
```bash
SESSION_SECRET=your-super-secret-session-key
ENCRYPTION_SECRET_KEY=your-32-character-encryption-key
```

## Database Setup

### MongoDB Configuration

The application uses MongoDB with Mongoose ODM for data persistence.

#### Connection Management

The database connection is managed in `config/database.js`:

```javascript
const connectWithRetry = (runMigrationsFlag = false) => {
  mongoose.connect(process.env.MONGO_URL, {
    useFindAndModify: false,
    autoIndex: process.env.NODE_ENV !== 'production',
  })
  .then(async () => {
    console.log("Successfully connected to DB");
    // Optional migration execution
  })
  .catch((e) => {
    console.error(e);
    setTimeout(() => connectWithRetry(runMigrationsFlag), 5000);
  });
};
```

#### Migration System

Database migrations are managed using `migrate-mongo`:

```bash
# Run migrations
npm run migrate

# Rollback migrations
npm run migrate-down
```

#### Connection Pooling

MongoDB connection pooling is configured for optimal performance:

- **Development**: 5 connections
- **Staging**: 10 connections  
- **Production**: 20 connections

## Redis Configuration

### Redis Client Setup

Redis is used for session storage, caching, and distributed locking:

```javascript
const client = redis.createClient({
  host: REDIS_URL,
  port: REDIS_PORT,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});
```

### Session Management

Sessions are stored in Redis using `express-session`:

```javascript
const sessionMiddleware = session({
  store: new RedisStore({ client }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV !== "localhost",
    httpOnly: process.env.NODE_ENV !== "localhost",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
```

### Distributed Locking

Redlock is used for distributed locking across multiple Redis instances:

```javascript
const redlock = new Redlock([client], {
  driftFactor: 0.01,
  retryCount: 10,
  retryDelay: 200,
  retryJitter: 200,
});
```

## Blockchain Integration

### Multi-Chain Support

The application supports multiple blockchain networks:

- **Ethereum** (Mainnet, Sepolia)
- **Polygon** (Mainnet, Mumbai)
- **Solana** (Mainnet, Devnet)
- **Base** (Mainnet, Goerli)

### Blockchain Utilities

Located in `utils/blockchain/`, these utilities provide:

#### Ethereum Integration (`ethereum.ts`)
```typescript
// Get provider for specific chain
const provider = getEthereumProvider(chainId);

// Send native tokens
const txHash = await sendNativeToken(chainId, toAddress, amount);

// Send ERC20 tokens
const txHash = await sendERC20Token(chainId, tokenAddress, toAddress, amount, decimals);
```

#### Solana Integration (`solana.ts`)
```typescript
// Get Solana connection
const connection = getSolanaConnection();

// Send SOL
const signature = await sendSOL(toAddress, amount);

// Send SPL tokens
const signature = await sendSPLToken(tokenAddress, toAddress, amount);
```

#### Validation Utilities (`validation.ts`)
```typescript
// Validate addresses
const isValid = isValidAddress(address, chainId);

// Validate transaction hashes
const isValidTx = isValidTransactionHash(hash, chainId);

// Validate token amounts
const isValidAmount = isValidTokenAmount(amount, decimals);
```

### Treasury Management

Treasury wallets are configured per chain:

```bash
ETH_TREASURY_WALLET=0x...
ETH_TREASURY_PRIVATE_KEY=0x...
SOL_TREASURY_WALLET=...
SOL_TREASURY_PRIVATE_KEY=...
```

## Health Monitoring

### Health Check Endpoints

The application provides comprehensive health monitoring:

#### Basic Health Check
```
GET /health
```
Returns basic service status for load balancers.

#### Detailed Health Check
```
GET /health/detailed
```
Returns comprehensive status including:
- MongoDB connection status
- Redis connection status
- Memory usage
- Disk space
- External service status

#### Readiness Check
```
GET /ready
```
Indicates if the service is ready to accept traffic.

#### Liveness Check
```
GET /live
```
Indicates if the service is alive (for Kubernetes).

#### Metrics Endpoint
```
GET /metrics
```
Returns performance metrics and system information.

### Health Check Response Format

```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "service": "naffles-backend",
    "version": "1.0.0",
    "uptime": 3600,
    "environment": "development",
    "checks": {
      "mongodb": {
        "status": "healthy",
        "responseTime": 5,
        "host": "localhost",
        "database": "naffles_dev"
      },
      "redis": {
        "status": "healthy",
        "responseTime": 2,
        "host": "localhost",
        "port": 6379
      }
    }
  }
}
```

## Deployment

### Docker Configuration

The application includes Docker configurations for different environments:

#### Development
```bash
docker-compose -f docker-compose.development.yml up
```

#### Staging
```bash
docker-compose -f docker-compose.staging.yml up
```

#### Production
```bash
docker-compose -f docker-compose.production.yml up
```

### Environment-Specific Deployment

Each environment has specific configurations:

- **Development**: Debug logging, relaxed security, local services
- **Staging**: Production-like setup with test data
- **Production**: Optimized performance, strict security, monitoring

### CI/CD Pipeline

The application supports automated deployment through:

1. **Build Stage**: TypeScript compilation, dependency installation
2. **Test Stage**: Unit tests, integration tests, security scans
3. **Deploy Stage**: Docker image building, container deployment

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check MongoDB status
docker ps | grep mongo

# Check connection string
echo $MONGO_URL

# Test connection
npm run test-db-connection
```

#### Redis Connection Issues
```bash
# Check Redis status
docker ps | grep redis

# Test Redis connection
npm run test-redis-connection
```

#### Memory Issues
```bash
# Check memory usage
GET /metrics

# Monitor heap usage
node --inspect index.js
```

### Logging

Application logs are structured and include:

- **Error Level**: Critical errors requiring immediate attention
- **Warn Level**: Warning conditions that should be monitored
- **Info Level**: General operational messages
- **Debug Level**: Detailed debugging information (development only)

### Performance Monitoring

Monitor key metrics:

- **Response Time**: API endpoint response times
- **Memory Usage**: Heap and RSS memory consumption
- **Database Performance**: Query execution times
- **Redis Performance**: Cache hit/miss ratios
- **Error Rates**: Application and system error frequencies

### Security Considerations

- **Environment Variables**: Never commit sensitive data to version control
- **API Keys**: Rotate regularly and use environment-specific keys
- **Database Access**: Use connection pooling and read replicas
- **Rate Limiting**: Configure appropriate limits for different endpoints
- **CORS**: Configure strict CORS policies for production

## Support

For additional support:

1. Check the application logs
2. Review health check endpoints
3. Consult the API documentation
4. Contact the development team

---

*This documentation is maintained by the Naffles development team. Last updated: January 2024*