# chmod Command Solutions for Windows

This document provides comprehensive solutions for the `chmod` command issue on Windows systems.

## The Problem

The `chmod` command is a Unix/Linux command used to change file permissions. It's not available in Windows PowerShell by default, which causes the error:

```
chmod : The term 'chmod' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

## Solutions (Ranked by Ease of Use)

### 1. Use Node.js Setup Script (Recommended) ⭐

**Best for**: All users, cross-platform compatibility

```bash
npm run setup
```

This runs our custom Node.js script that automatically detects your platform and runs the appropriate setup script.

**Advantages**:
- Works on all platforms (Windows, macOS, Linux)
- No additional software required
- Handles platform detection automatically
- Provides clear error messages and fallback options

### 2. Use PowerShell Script Directly

**Best for**: Windows users who prefer PowerShell

```powershell
.\scripts\setup-env.ps1

# With options
.\scripts\setup-env.ps1 -SkipDocker
.\scripts\setup-env.ps1 -Help
```

**Advantages**:
- Native Windows solution
- No additional tools required
- Full feature parity with bash script

### 3. Use Git Bash

**Best for**: Windows users who have Git installed

```bash
# Open Git Bash terminal
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh
```

**Advantages**:
- Provides Unix-like commands on Windows
- Most developers already have Git installed
- Can run original bash scripts without modification

**Requirements**: Git for Windows must be installed

### 4. Use WSL (Windows Subsystem for Linux)

**Best for**: Windows users who use Linux tools regularly

```bash
# In WSL terminal
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh
```

**Advantages**:
- Full Linux compatibility
- Can run any Unix/Linux commands
- Great for developers who work with both Windows and Linux

**Requirements**: WSL must be installed and configured

### 5. Use npm Scripts

**Best for**: Users who prefer npm-based workflows

```bash
# Platform-specific
npm run setup:windows    # Uses PowerShell
npm run setup:unix       # Uses Bash
npm run setup:powershell # Forces PowerShell
npm run setup:bash       # Forces Bash

# Auto-detection
npm run setup            # Detects platform automatically
```

**Advantages**:
- Consistent interface across platforms
- No need to remember script paths
- Handles execution policy issues automatically

## Detailed Instructions by Platform

### Windows Users

#### Option A: Automated Setup (Easiest)
```powershell
# Navigate to project directory
cd naffles-backend

# Run automated setup
npm run setup
```

#### Option B: PowerShell Script
```powershell
# Run PowerShell script directly
.\scripts\setup-env.ps1

# View available options
.\scripts\setup-env.ps1 -Help
```

#### Option C: Git Bash
```bash
# Open Git Bash in project directory
# Make script executable
chmod +x scripts/setup-env.sh

# Run setup
./scripts/setup-env.sh
```

#### Option D: Manual Setup
```powershell
# Install dependencies
npm install

# Copy environment file
Copy-Item .env.example .env.development

# Edit .env.development with your settings
notepad .env.development

# Start Docker services
docker-compose -f docker-compose.development.yml up -d

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Linux/macOS Users

#### Option A: Automated Setup
```bash
npm run setup
```

#### Option B: Direct Script Execution
```bash
# Make script executable
chmod +x scripts/setup-env.sh

# Run setup
./scripts/setup-env.sh
```

## Troubleshooting

### PowerShell Execution Policy Error

If you get an execution policy error:

```powershell
# Option 1: Run with bypass (one-time)
powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1

# Option 2: Change execution policy (permanent)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Option 3: Use npm script (handles this automatically)
npm run setup
```

### Git Bash Not Available

If Git Bash is not available:

1. **Install Git for Windows**: Download from [git-scm.com](https://git-scm.com/download/win)
2. **Use PowerShell script instead**: `.\scripts\setup-env.ps1`
3. **Use Node.js script**: `npm run setup`

### WSL Not Available

If WSL is not available:

1. **Install WSL**: Follow [Microsoft's WSL installation guide](https://docs.microsoft.com/en-us/windows/wsl/install)
2. **Use PowerShell script instead**: `.\scripts\setup-env.ps1`
3. **Use Node.js script**: `npm run setup`

### Script Not Found Errors

If you get "script not found" errors:

```bash
# Check if you're in the right directory
pwd
ls scripts/

# Make sure you're in the naffles-backend directory
cd naffles-backend

# Try the Node.js script
npm run setup
```

## Why This Happens

The `chmod` command is part of the POSIX standard used by Unix-like operating systems (Linux, macOS, etc.). Windows uses a different permission system and doesn't include these commands in PowerShell by default.

### Windows Alternatives to chmod

- **PowerShell**: `Set-ItemProperty` and `Get-Acl`/`Set-Acl`
- **Command Prompt**: `icacls` and `attrib`
- **Git Bash**: Provides Unix-like commands including `chmod`
- **WSL**: Full Linux compatibility

## Best Practices

1. **Use the Node.js setup script** (`npm run setup`) for the most reliable cross-platform experience
2. **Keep both bash and PowerShell scripts** for flexibility
3. **Document platform-specific instructions** in README and setup guides
4. **Provide multiple alternatives** so users can choose what works best for their environment
5. **Test on multiple platforms** to ensure compatibility

## Summary

The `chmod` issue is easily solved with multiple approaches. The recommended solution is to use our Node.js setup script (`npm run setup`) which automatically handles platform detection and provides a consistent experience across all operating systems.

For Windows users specifically:
- **Easiest**: `npm run setup`
- **Native**: `.\scripts\setup-env.ps1`
- **Unix-like**: Use Git Bash or WSL

Choose the method that best fits your development environment and preferences.