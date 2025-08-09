# Setup Instructions

This document provides platform-specific instructions for setting up the Naffles backend development environment.

## Quick Setup (Recommended)

### Windows Users
```powershell
# Use the npm script (easiest method)
npm run setup

# Or run PowerShell script directly
.\scripts\setup-env.ps1

# Or with options
.\scripts\setup-env.ps1 -SkipDocker
```

### Linux/macOS Users
```bash
# Make script executable and run
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh

# Or use npm script
npm run setup:bash
```

## Platform-Specific Solutions

### Windows

#### Method 1: Use PowerShell Script (Recommended)
The PowerShell script (`scripts/setup-env.ps1`) is designed specifically for Windows and doesn't require any additional tools:

```powershell
# Navigate to project directory
cd naffles-backend

# Run setup script
.\scripts\setup-env.ps1

# View help
.\scripts\setup-env.ps1 -Help
```

#### Method 2: Use Git Bash
If you have Git for Windows installed, you can use Git Bash which includes Unix-like commands:

```bash
# Open Git Bash in project directory
# Make script executable
chmod +x scripts/setup-env.sh

# Run the bash script
./scripts/setup-env.sh
```

#### Method 3: Use WSL (Windows Subsystem for Linux)
If you have WSL installed:

```bash
# In WSL terminal
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh
```

#### Method 4: Manual Setup
If you prefer manual setup:

```powershell
# Install dependencies
npm install

# Copy environment file
Copy-Item .env.example .env.development

# Start Docker services (if Docker is installed)
docker-compose -f docker-compose.development.yml up -d

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Linux/macOS

#### Method 1: Use Bash Script (Recommended)
```bash
# Make script executable
chmod +x scripts/setup-env.sh

# Run setup script
./scripts/setup-env.sh
```

#### Method 2: Use npm Script
```bash
npm run setup:bash
```

## Troubleshooting

### Windows: "Execution Policy" Error
If you get an execution policy error when running PowerShell scripts:

```powershell
# Option 1: Run with bypass (one-time)
powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1

# Option 2: Change execution policy (permanent)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Option 3: Use npm script (handles this automatically)
npm run setup
```

### Windows: "chmod command not found"
This is expected on Windows PowerShell. Use one of these alternatives:

1. **Use PowerShell script**: `.\scripts\setup-env.ps1`
2. **Use Git Bash**: Install Git for Windows and use Git Bash terminal
3. **Use WSL**: Install Windows Subsystem for Linux
4. **Use npm scripts**: `npm run setup` or `npm run setup:powershell`

### Linux/macOS: "Permission denied"
```bash
# Make script executable
chmod +x scripts/setup-env.sh

# Or run with bash directly
bash scripts/setup-env.sh
```

### Docker Issues
If Docker commands fail:

```bash
# Check if Docker is running
docker --version
docker-compose --version

# Start Docker Desktop (Windows/macOS)
# Or start Docker service (Linux)
sudo systemctl start docker

# Skip Docker in setup scripts
# Windows:
.\scripts\setup-env.ps1 -SkipDocker

# Linux/macOS:
./scripts/setup-env.sh  # Will warn but continue
```

## Available Setup Scripts

### npm Scripts
```bash
npm run setup              # Default setup (PowerShell on Windows)
npm run setup:powershell   # Use PowerShell script
npm run setup:bash         # Use Bash script
```

### Direct Script Execution
```bash
# PowerShell (Windows)
.\scripts\setup-env.ps1

# Bash (Linux/macOS/Git Bash/WSL)
./scripts/setup-env.sh
```

## What the Setup Scripts Do

1. **Check Prerequisites**
   - Node.js (v18+)
   - npm
   - Docker (optional)
   - Docker Compose (optional)

2. **Install Dependencies**
   - Run `npm install`

3. **Setup Environment**
   - Copy `.env.example` to `.env.development`
   - Prompt for configuration editing

4. **Start Services**
   - Start MongoDB and Redis via Docker Compose
   - Wait for services to be ready

5. **Configure Application**
   - Validate configuration
   - Run database migrations

6. **Verify Setup**
   - Run health checks
   - Display next steps

## Manual Setup Steps

If you prefer to set up manually or the scripts don't work:

1. **Install Node.js dependencies**
   ```bash
   npm install
   ```

2. **Create environment file**
   ```bash
   # Windows
   Copy-Item .env.example .env.development
   
   # Linux/macOS
   cp .env.example .env.development
   ```

3. **Edit environment file**
   - Open `.env.development` in your editor
   - Configure database and Redis connections
   - Set security keys (change default values)

4. **Start database services**
   ```bash
   # Using Docker (recommended)
   docker-compose -f docker-compose.development.yml up -d
   
   # Or install and start manually:
   # - MongoDB: https://docs.mongodb.com/manual/installation/
   # - Redis: https://redis.io/download
   ```

5. **Run database migrations**
   ```bash
   npm run migrate
   ```

6. **Validate configuration**
   ```bash
   npm run validate-config
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

8. **Verify setup**
   ```bash
   # Check health endpoint
   npm run health-check
   
   # Or visit: http://localhost:3000/health
   ```

## Next Steps After Setup

1. **Edit Configuration**
   - Update `.env.development` with your specific settings
   - Configure blockchain RPC URLs if needed
   - Set up external service API keys

2. **Start Development**
   ```bash
   npm run dev  # Start development server
   npm test     # Run tests
   npm run lint # Check code style
   ```

3. **Verify Everything Works**
   - Visit `http://localhost:3000/health`
   - Check that all health checks pass
   - Run the test suite

## Getting Help

If you encounter issues:

1. Check the [Development Setup Guide](./development-setup.md)
2. Review the [Infrastructure Setup Guide](./infrastructure-setup.md)
3. Check service health: `npm run health-check`
4. Validate configuration: `npm run validate-config`
5. Contact the development team

---

*Choose the method that works best for your platform and development environment.*