# Development Setup Guide

This guide will help you set up the Naffles backend for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **MongoDB** (v5.0 or higher)
- **Redis** (v6.0 or higher)
- **Git**

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd naffles-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment configuration**
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your local configuration
   ```

4. **Start local services**
   ```bash
   # Using Docker (recommended)
   docker-compose -f docker-compose.development.yml up -d

   # Or start services manually
   # MongoDB: mongod --dbpath /path/to/data
   # Redis: redis-server
   ```

5. **Run database migrations**
   ```bash
   npm run migrate
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000` with hot reloading enabled.

## Environment Configuration

### Required Environment Variables

Copy `.env.example` to `.env.development` and configure the following:

```bash
# Database
MONGO_URL=mongodb://localhost:27017/naffles_dev

# Redis
REDIS_URL=localhost
REDIS_PORT=6379

# Security (Development keys - change for production)
SESSION_SECRET=dev-session-secret-change-in-production
ENCRYPTION_SECRET_KEY=dev-encryption-key-32-chars-long

# Server
PORT=3000
LOG_LEVEL=debug
```

### Optional Configuration

```bash
# Blockchain (for testing blockchain features)
ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/demo
SOLANA_RPC_URL=https://api.devnet.solana.com

# External Services (for testing integrations)
ALCHEMY_API_KEY=your-alchemy-api-key
COINGECKO_API_KEY=your-coingecko-api-key

# Development Features
DISABLE_EXTERNAL_APIS=false
DISABLE_EMAIL_NOTIFICATIONS=true
```

## Database Setup

### Using Docker (Recommended)

```bash
# Start MongoDB with Docker
docker run -d \
  --name naffles-mongo \
  -p 27017:27017 \
  -v naffles-mongo-data:/data/db \
  mongo:5.0
```

### Manual Installation

1. **Install MongoDB**
   - macOS: `brew install mongodb-community`
   - Ubuntu: `sudo apt install mongodb`
   - Windows: Download from [MongoDB website](https://www.mongodb.com/try/download/community)

2. **Start MongoDB**
   ```bash
   # macOS/Linux
   mongod --dbpath /path/to/data/directory

   # Windows
   mongod.exe --dbpath C:\path\to\data\directory
   ```

3. **Create database**
   ```bash
   mongo
   > use naffles_dev
   > db.createCollection("users")
   ```

### Database Migrations

Run migrations to set up the database schema:

```bash
# Run all pending migrations
npm run migrate

# Rollback last migration
npm run migrate-down

# Check migration status
npx migrate-mongo status
```

## Redis Setup

### Using Docker (Recommended)

```bash
# Start Redis with Docker
docker run -d \
  --name naffles-redis \
  -p 6379:6379 \
  redis:6-alpine
```

### Manual Installation

1. **Install Redis**
   - macOS: `brew install redis`
   - Ubuntu: `sudo apt install redis-server`
   - Windows: Download from [Redis website](https://redis.io/download)

2. **Start Redis**
   ```bash
   # macOS/Linux
   redis-server

   # Windows
   redis-server.exe
   ```

3. **Test Redis connection**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

## Development Workflow

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript files
npm run build:watch  # Build TypeScript files in watch mode

# Database
npm run migrate      # Run database migrations
npm run migrate-down # Rollback database migrations

# Testing
npm test            # Run all tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Linting and Formatting
npm run lint        # Run ESLint
npm run format      # Format code with Prettier
```

### Project Structure

```
naffles-backend/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── models/          # Database models
├── routes/          # API routes
├── services/        # Business logic
├── utils/           # Utility functions
├── tests/           # Test files
├── docs/            # Documentation
└── index.js         # Application entry point
```

### Code Style

The project uses ESLint and Prettier for code formatting:

```bash
# Check code style
npm run lint

# Fix code style issues
npm run lint:fix

# Format code
npm run format
```

### Git Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

3. **Test your changes**
   ```bash
   npm test
   npm run lint
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and create pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/raffle.test.js

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

Tests are organized by functionality:

```
tests/
├── raffle.test.js           # Raffle system tests
├── vrf.test.js             # VRF integration tests
├── assetValidation.test.js # Asset validation tests
├── auth.test.js            # Authentication tests
└── setup.js                # Test setup and mocks
```

### Writing Tests

Example test structure:

```javascript
describe('Feature Tests', () => {
  beforeEach(async () => {
    // Setup test data
  });

  test('should handle feature correctly', async () => {
    // Arrange
    const testData = { /* test input */ };
    
    // Act
    const result = await featureFunction(testData);
    
    // Assert
    expect(result.success).toBe(true);
  });

  afterEach(async () => {
    // Cleanup test data
  });
});
```

## Debugging

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Node.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/index.js",
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--inspect"]
    }
  ]
}
```

### Debug with Chrome DevTools

```bash
# Start with debugging enabled
node --inspect index.js

# Open Chrome and navigate to:
chrome://inspect
```

### Logging

The application uses structured logging:

```javascript
console.log('Info message');
console.warn('Warning message');
console.error('Error message');
console.debug('Debug message'); // Only in development
```

## Health Checks

The application provides health check endpoints for monitoring:

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health check
curl http://localhost:3000/health/detailed

# Readiness check
curl http://localhost:3000/ready

# Metrics
curl http://localhost:3000/metrics
```

## Common Issues

### Windows: chmod command not found

The `chmod` command is not available in Windows PowerShell. Use these alternatives:

```powershell
# Option 1: Use the Node.js setup script (recommended)
npm run setup

# Option 2: Use PowerShell script directly
.\scripts\setup-env.ps1

# Option 3: Use Git Bash (if Git is installed)
# Open Git Bash and run:
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh

# Option 4: Use WSL (Windows Subsystem for Linux)
# In WSL terminal:
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh
```

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/macOS
lsof -i :3000
kill -9 <PID>
```

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
ps aux | grep mongod

# Check MongoDB logs
tail -f /var/log/mongodb/mongod.log
```

### Redis Connection Issues

```bash
# Check if Redis is running
ps aux | grep redis

# Test Redis connection
redis-cli ping
```

### Node.js Version Issues

```bash
# Check Node.js version
node --version

# Use Node Version Manager (nvm)
nvm install 18
nvm use 18
```

## Performance Tips

### Development Optimizations

1. **Use nodemon for hot reloading**
   ```bash
   npm install -g nodemon
   nodemon index.js
   ```

2. **Enable MongoDB query logging**
   ```javascript
   mongoose.set('debug', true);
   ```

3. **Use Redis for session storage**
   - Faster than memory store
   - Persists across server restarts

4. **Optimize database queries**
   - Use indexes for frequently queried fields
   - Use projection to limit returned fields
   - Use aggregation pipelines for complex queries

## Security Considerations

### Development Security

1. **Never commit sensitive data**
   - Use `.env` files for secrets
   - Add `.env*` to `.gitignore`

2. **Use strong development passwords**
   - Even in development, use secure passwords
   - Rotate API keys regularly

3. **Keep dependencies updated**
   ```bash
   npm audit
   npm audit fix
   ```

4. **Use HTTPS in staging/production**
   - Configure SSL certificates
   - Redirect HTTP to HTTPS

## Getting Help

### Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Documentation](https://expressjs.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)

### Support

1. Check the application logs
2. Review health check endpoints
3. Consult this documentation
4. Contact the development team

---

*Happy coding! 🚀*