# Naffles Backend

Backend service for the Naffles platform - a blockchain-based raffle and gaming platform supporting multiple networks including Ethereum and Solana.

## 🚀 Quick Start

### Windows Users
```powershell
# Automated setup (recommended)
npm run setup

# Or run PowerShell script directly
.\scripts\setup-env.ps1
```

### Linux/macOS Users
```bash
# Automated setup
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh

# Or use npm script
npm run setup:bash
```

### Manual Setup (All Platforms)
```bash
# Install dependencies
npm install

# Set up environment
# Windows: Copy-Item .env.example .env.development
# Linux/macOS: cp .env.example .env.development

# Start local services
docker-compose -f docker-compose.development.yml up -d

# Run migrations
npm run migrate

# Start development server
npm run dev
```

## 📚 Documentation

- [Development Setup Guide](./docs/development-setup.md)
- [Infrastructure Setup Guide](./docs/infrastructure-setup.md)
- [Raffle API Documentation](./docs/raffle-api.md)
- [Testing Guide](./tests/README.md)

## 🏗️ Architecture

This application is hosted on Google Cloud, using Docker for containerization and NGINX as a reverse proxy to efficiently manage requests to the Node.js application. It leverages MongoDB for database operations and Redis for caching, providing a robust backend for blockchain-based gaming applications.

**Core Technologies:**
- **Framework**: Express.js with TypeScript support
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis for sessions and caching
- **Blockchain**: Multi-chain support (Ethereum, Solana, Polygon, Base)
- **Real-time**: Socket.IO for live updates
- **Queue**: Bull for background job processing

*Directory Structure*

- /config: Configuration files for the application.
- /controllers: Controllers to handle business logic.
- /middleware: Middleware functions for request processing.
- /models: Mongoose schemas/models for database operations.
- /nginx: NGINX configuration files.
- /node_modules: Node.js libraries (not committed to Git).
- /routes: Routes to handle API requests via Express.
- /services: Services for business logic.
- /uploads: Temp/Storage for uploaded files.
- /utils: Utility scripts and helper functions.

*Prerequisites*
- Docker and Docker Compose
- Access to Google Cloud for deployment

*Local Development*
To run the application locally:

1. Clone the repository.
2. Navigate to the project directory.
3. Build and start the application using Docker Compose:
```
docker-compose -f docker-compose.yml -f docker-compose.localhost.yml build
docker-compose -f docker-compose.yml -f docker-compose.localhost.yml up -d
```


## 🔧 Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript files
npm run build:watch  # Build TypeScript files in watch mode
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run lint         # Check code style with ESLint
npm run lint:fix     # Fix code style issues automatically
npm run format       # Format code with Prettier
npm run migrate      # Run database migrations
npm run migrate-down # Rollback database migrations
npm run health-check # Check service health status
npm run validate-config # Validate environment configuration
```

## 🏥 Health Monitoring

The service provides comprehensive health check endpoints for monitoring and load balancer integration:

- `GET /health` - Basic health status (lightweight for load balancers)
- `GET /health/detailed` - Detailed system status with dependency checks
- `GET /ready` - Readiness check for Kubernetes and container orchestration
- `GET /live` - Liveness check for Kubernetes pod management
- `GET /metrics` - Performance metrics and system information

Example health check response:
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "healthy",
    "uptime": 3600,
    "checks": {
      "mongodb": { "status": "healthy", "responseTime": 5 },
      "redis": { "status": "healthy", "responseTime": 2 }
    }
  }
}
```

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Redis Sessions**: Distributed session storage with automatic expiration
- **Rate Limiting**: Configurable request rate limiting per endpoint
- **Input Validation**: Comprehensive request validation and sanitization
- **Environment Configuration**: Secure environment-based configuration management
- **CORS Protection**: Configurable cross-origin resource sharing policies
- **Helmet Security**: Security headers and protection middleware

## 🌍 Multi-Environment Support

The application supports multiple deployment environments with specific configurations:

```bash
# Development Environment
npm run dev
docker-compose -f docker-compose.development.yml up

# Staging Environment  
npm run docker:staging
docker-compose -f docker-compose.staging.yml up

# Production Environment
npm run docker:prod
docker-compose -f docker-compose.production.yml up
```

Each environment has its own configuration file (`.env.development`, `.env.staging`, `.env.production`) with appropriate settings for database connections, external services, and security parameters.

## 📊 Core Features

### Raffle System
- **Multi-type Raffles**: Support for NFT, token, and allowlist raffles
- **Ticket Management**: Automated ticket sales and distribution
- **Prize Validation**: Automated asset verification and escrow
- **Winner Selection**: Chainlink VRF integration for verifiable randomness

### Blockchain Integration
- **Multi-chain Support**: Ethereum, Solana, Polygon, Base networks
- **Wallet Management**: Treasury wallet operations and user balance tracking
- **Transaction Monitoring**: Real-time blockchain transaction tracking
- **Gas Optimization**: Smart gas price estimation and optimization

### Real-time Features
- **Live Updates**: Socket.IO for real-time raffle countdown and notifications
- **Event Broadcasting**: Real-time winner announcements and system events
- **User Notifications**: Instant updates for raffle participation and results

## 🧪 Testing

Comprehensive test suite covering all major functionality:

```bash
npm test                    # Run all tests
npm run test:coverage      # Run with coverage report
npm run test:watch         # Run tests in watch mode
npm run test:raffle        # Run raffle-specific tests
npm run test:vrf           # Run VRF integration tests
npm run test:asset         # Run asset validation tests
```

### Test Coverage
- **Unit Tests**: Individual function and module testing
- **Integration Tests**: Service interaction and API endpoint testing
- **Blockchain Tests**: Mocked blockchain interaction testing
- **Database Tests**: MongoDB operations and data integrity testing

## 🐳 Docker Support

Complete Docker containerization with multi-stage builds:

```bash
# Development with hot reload
docker-compose -f docker-compose.development.yml up

# Staging environment
docker-compose -f docker-compose.staging.yml up

# Production deployment
docker-compose -f docker-compose.production.yml up
```

### Container Features
- **Multi-stage Builds**: Optimized production images
- **Health Checks**: Built-in container health monitoring
- **Volume Management**: Persistent data storage
- **Network Configuration**: Secure inter-service communication

## 🚀 Deployment

### Prerequisites
- Docker and Docker Compose
- MongoDB (v5.0+)
- Redis (v6.0+)
- Node.js (v18+) for local development

### Production Deployment
1. Configure environment variables in `.env.production`
2. Set up SSL certificates and domain configuration
3. Configure monitoring and logging services
4. Deploy using Docker Compose or Kubernetes

### Monitoring
- Health check endpoints for load balancer integration
- Structured logging for centralized log management
- Performance metrics collection
- Error tracking and alerting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Run the test suite (`npm test`)
5. Check code style (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📝 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For support and questions:
1. Check the [Development Setup Guide](./docs/development-setup.md)
2. Review the [Infrastructure Documentation](./docs/infrastructure-setup.md)
3. Check service health endpoints
4. Contact the development team

---

*Built with ❤️ by the Naffles team*