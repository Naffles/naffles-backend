#!/bin/bash

# Naffles Backend Environment Setup Script
# This script helps set up the development environment

set -e

echo "🚀 Setting up Naffles Backend Development Environment"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Node.js is installed
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_status "Node.js is installed: $NODE_VERSION"
        
        # Check if version is 18 or higher
        NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
            print_warning "Node.js version 18 or higher is recommended. Current: $NODE_VERSION"
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
}

# Check if npm is installed
check_npm() {
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_status "npm is installed: $NPM_VERSION"
    else
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
}

# Check if Docker is installed
check_docker() {
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        print_status "Docker is installed: $DOCKER_VERSION"
    else
        print_warning "Docker is not installed. You'll need to install MongoDB and Redis manually."
    fi
}

# Check if Docker Compose is installed
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_VERSION=$(docker-compose --version)
        print_status "Docker Compose is installed: $DOCKER_COMPOSE_VERSION"
    else
        print_warning "Docker Compose is not installed. You'll need to manage services manually."
    fi
}

# Install npm dependencies
install_dependencies() {
    print_info "Installing npm dependencies..."
    npm install
    print_status "Dependencies installed successfully"
}

# Set up environment file
setup_env_file() {
    if [ ! -f ".env.development" ]; then
        print_info "Creating .env.development file..."
        cp .env.example .env.development
        print_status "Environment file created: .env.development"
        print_warning "Please edit .env.development with your local configuration"
    else
        print_status "Environment file already exists: .env.development"
    fi
}

# Start Docker services
start_docker_services() {
    if command -v docker-compose &> /dev/null; then
        print_info "Starting Docker services (MongoDB and Redis)..."
        docker-compose -f docker-compose.development.yml up -d mongo redis
        print_status "Docker services started"
        
        # Wait for services to be ready
        print_info "Waiting for services to be ready..."
        sleep 10
    else
        print_warning "Docker Compose not available. Please start MongoDB and Redis manually."
    fi
}

# Validate configuration
validate_config() {
    print_info "Validating configuration..."
    if npm run validate-config; then
        print_status "Configuration is valid"
    else
        print_error "Configuration validation failed. Please check your .env.development file."
        exit 1
    fi
}

# Run database migrations
run_migrations() {
    print_info "Running database migrations..."
    if npm run migrate; then
        print_status "Database migrations completed"
    else
        print_warning "Database migrations failed. Make sure MongoDB is running."
    fi
}

# Test the setup
test_setup() {
    print_info "Testing the setup..."
    
    # Test health endpoint
    if npm run health-check &> /dev/null; then
        print_status "Health check passed"
    else
        print_warning "Health check failed. The server might not be running."
    fi
}

# Main setup process
main() {
    echo
    print_info "Checking prerequisites..."
    check_node
    check_npm
    check_docker
    check_docker_compose
    
    echo
    print_info "Setting up the project..."
    install_dependencies
    setup_env_file
    
    echo
    print_info "Starting services..."
    start_docker_services
    
    echo
    print_info "Configuring the application..."
    validate_config
    run_migrations
    
    echo
    print_status "Setup completed successfully! 🎉"
    echo
    print_info "Next steps:"
    echo "  1. Edit .env.development with your configuration"
    echo "  2. Run 'npm run dev' to start the development server"
    echo "  3. Visit http://localhost:3000/health to check the service"
    echo
    print_info "Useful commands:"
    echo "  npm run dev          - Start development server"
    echo "  npm test             - Run tests"
    echo "  npm run health-check - Check service health"
    echo "  npm run lint         - Check code style"
    echo
}

# Handle script interruption
trap 'print_error "Setup interrupted"; exit 1' INT

# Run main function
main

exit 0