# Naffles Backend Environment Setup Script (PowerShell)
# This script helps set up the development environment on Windows

param(
    [switch]$SkipDocker,
    [switch]$Help
)

if ($Help) {
    Write-Host "Naffles Backend Environment Setup Script" -ForegroundColor Green
    Write-Host "Usage: .\scripts\setup-env.ps1 [-SkipDocker] [-Help]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -SkipDocker    Skip Docker service setup"
    Write-Host "  -Help          Show this help message"
    exit 0
}

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

Write-Host "🚀 Setting up Naffles Backend Development Environment" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Check if Node.js is installed
function Test-Node {
    try {
        $nodeVersion = node --version
        Write-Status "Node.js is installed: $nodeVersion"
        
        # Check if version is 18 or higher
        $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($majorVersion -lt 18) {
            Write-Warning "Node.js version 18 or higher is recommended. Current: $nodeVersion"
        }
        return $true
    }
    catch {
        Write-Error "Node.js is not installed. Please install Node.js 18 or higher."
        return $false
    }
}

# Check if npm is installed
function Test-Npm {
    try {
        $npmVersion = npm --version
        Write-Status "npm is installed: $npmVersion"
        return $true
    }
    catch {
        Write-Error "npm is not installed. Please install npm."
        return $false
    }
}

# Check if Docker is installed
function Test-Docker {
    try {
        $dockerVersion = docker --version
        Write-Status "Docker is installed: $dockerVersion"
        return $true
    }
    catch {
        Write-Warning "Docker is not installed. You'll need to install MongoDB and Redis manually."
        return $false
    }
}

# Check if Docker Compose is installed
function Test-DockerCompose {
    try {
        $dockerComposeVersion = docker-compose --version
        Write-Status "Docker Compose is installed: $dockerComposeVersion"
        return $true
    }
    catch {
        Write-Warning "Docker Compose is not installed. You'll need to manage services manually."
        return $false
    }
}

# Install npm dependencies
function Install-Dependencies {
    Write-Info "Installing npm dependencies..."
    try {
        npm install
        Write-Status "Dependencies installed successfully"
        return $true
    }
    catch {
        Write-Error "Failed to install dependencies: $_"
        return $false
    }
}

# Set up environment file
function Set-EnvironmentFile {
    if (-not (Test-Path ".env.development")) {
        Write-Info "Creating .env.development file..."
        try {
            Copy-Item ".env.example" ".env.development"
            Write-Status "Environment file created: .env.development"
            Write-Warning "Please edit .env.development with your local configuration"
        }
        catch {
            Write-Error "Failed to create environment file: $_"
            return $false
        }
    }
    else {
        Write-Status "Environment file already exists: .env.development"
    }
    return $true
}

# Start Docker services
function Start-DockerServices {
    if ($SkipDocker) {
        Write-Info "Skipping Docker services as requested"
        return $true
    }

    if (Test-DockerCompose) {
        Write-Info "Starting Docker services (MongoDB and Redis)..."
        try {
            docker-compose -f docker-compose.development.yml up -d mongo redis
            Write-Status "Docker services started"
            
            # Wait for services to be ready
            Write-Info "Waiting for services to be ready..."
            Start-Sleep -Seconds 10
            return $true
        }
        catch {
            Write-Error "Failed to start Docker services: $_"
            return $false
        }
    }
    else {
        Write-Warning "Docker Compose not available. Please start MongoDB and Redis manually."
        return $false
    }
}

# Validate configuration
function Test-Configuration {
    Write-Info "Validating configuration..."
    try {
        npm run validate-config
        Write-Status "Configuration is valid"
        return $true
    }
    catch {
        Write-Error "Configuration validation failed. Please check your .env.development file."
        return $false
    }
}

# Run database migrations
function Invoke-Migrations {
    Write-Info "Running database migrations..."
    try {
        npm run migrate
        Write-Status "Database migrations completed"
        return $true
    }
    catch {
        Write-Warning "Database migrations failed. Make sure MongoDB is running."
        return $false
    }
}

# Test the setup
function Test-Setup {
    Write-Info "Testing the setup..."
    try {
        npm run health-check | Out-Null
        Write-Status "Health check passed"
        return $true
    }
    catch {
        Write-Warning "Health check failed. The server might not be running."
        return $false
    }
}

# Main setup process
function Main {
    Write-Host ""
    Write-Info "Checking prerequisites..."
    
    $nodeOk = Test-Node
    $npmOk = Test-Npm
    $dockerOk = Test-Docker
    $dockerComposeOk = Test-DockerCompose
    
    if (-not $nodeOk -or -not $npmOk) {
        Write-Error "Prerequisites not met. Please install required software."
        exit 1
    }
    
    Write-Host ""
    Write-Info "Setting up the project..."
    
    if (-not (Install-Dependencies)) {
        exit 1
    }
    
    if (-not (Set-EnvironmentFile)) {
        exit 1
    }
    
    Write-Host ""
    Write-Info "Starting services..."
    Start-DockerServices | Out-Null
    
    Write-Host ""
    Write-Info "Configuring the application..."
    Test-Configuration | Out-Null
    Invoke-Migrations | Out-Null
    
    Write-Host ""
    Write-Status "Setup completed successfully! 🎉"
    Write-Host ""
    Write-Info "Next steps:"
    Write-Host "  1. Edit .env.development with your configuration"
    Write-Host "  2. Run 'npm run dev' to start the development server"
    Write-Host "  3. Visit http://localhost:3000/health to check the service"
    Write-Host ""
    Write-Info "Useful commands:"
    Write-Host "  npm run dev          - Start development server"
    Write-Host "  npm test             - Run tests"
    Write-Host "  npm run health-check - Check service health"
    Write-Host "  npm run lint         - Check code style"
    Write-Host ""
}

# Handle script interruption
trap {
    Write-Error "Setup interrupted"
    exit 1
}

# Run main function
try {
    Main
}
catch {
    Write-Error "Setup failed: $_"
    exit 1
}

exit 0