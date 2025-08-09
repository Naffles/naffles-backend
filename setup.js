#!/usr/bin/env node

/**
 * Cross-platform setup helper for Naffles Backend
 * This Node.js script detects the platform and runs the appropriate setup script
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader() {
  colorLog('cyan', '🚀 Naffles Backend Setup');
  colorLog('cyan', '========================');
  console.log();
}

function printHelp() {
  printHeader();
  console.log('Usage: node setup.js [options]');
  console.log();
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --skip-docker  Skip Docker service setup');
  console.log('  --platform     Force platform detection (windows|unix)');
  console.log();
  console.log('Examples:');
  console.log('  node setup.js');
  console.log('  node setup.js --skip-docker');
  console.log('  node setup.js --platform windows');
  console.log();
}

function detectPlatform() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return 'windows';
  } else if (platform === 'darwin' || platform === 'linux') {
    return 'unix';
  } else {
    colorLog('yellow', `⚠️  Unknown platform: ${platform}, defaulting to unix`);
    return 'unix';
  }
}

function checkScriptExists(scriptPath) {
  return fs.existsSync(scriptPath);
}

function runPowerShellScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    colorLog('blue', `ℹ️  Running PowerShell script: ${scriptPath}`);
    
    const psArgs = [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...args
    ];
    
    const child = spawn('powershell', psArgs, {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PowerShell script exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

function runBashScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    colorLog('blue', `ℹ️  Running Bash script: ${scriptPath}`);
    
    // Try to make script executable first (will fail on Windows, but that's OK)
    try {
      fs.chmodSync(scriptPath, '755');
    } catch (error) {
      // Ignore chmod errors on Windows
    }
    
    const child = spawn('bash', [scriptPath, ...args], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Bash script exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function runSetup(platform, options = {}) {
  const scriptsDir = path.join(__dirname, 'scripts');
  
  try {
    if (platform === 'windows') {
      const psScript = path.join(scriptsDir, 'setup-env.ps1');
      
      if (!checkScriptExists(psScript)) {
        throw new Error(`PowerShell script not found: ${psScript}`);
      }
      
      const args = [];
      if (options.skipDocker) {
        args.push('-SkipDocker');
      }
      
      await runPowerShellScript(psScript, args);
      
    } else {
      const bashScript = path.join(scriptsDir, 'setup-env.sh');
      
      if (!checkScriptExists(bashScript)) {
        throw new Error(`Bash script not found: ${bashScript}`);
      }
      
      await runBashScript(bashScript);
    }
    
    colorLog('green', '✅ Setup completed successfully!');
    console.log();
    colorLog('blue', 'Next steps:');
    console.log('  1. Edit .env.development with your configuration');
    console.log('  2. Run "npm run dev" to start the development server');
    console.log('  3. Visit http://localhost:3000/health to check the service');
    
  } catch (error) {
    colorLog('red', `❌ Setup failed: ${error.message}`);
    console.log();
    colorLog('yellow', 'Alternative setup methods:');
    
    if (platform === 'windows') {
      console.log('  1. Use Git Bash: chmod +x scripts/setup-env.sh && ./scripts/setup-env.sh');
      console.log('  2. Use WSL: chmod +x scripts/setup-env.sh && ./scripts/setup-env.sh');
      console.log('  3. Manual setup: npm install && copy .env.example .env.development');
    } else {
      console.log('  1. Manual setup: npm install && cp .env.example .env.development');
      console.log('  2. Check if bash is installed: which bash');
    }
    
    process.exit(1);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    skipDocker: false,
    platform: null,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--skip-docker':
        options.skipDocker = true;
        break;
      case '--platform':
        if (i + 1 < args.length) {
          options.platform = args[i + 1];
          i++; // Skip next argument
        } else {
          colorLog('red', '❌ --platform requires a value (windows|unix)');
          process.exit(1);
        }
        break;
      default:
        colorLog('yellow', `⚠️  Unknown argument: ${arg}`);
        break;
    }
  }
  
  return options;
}

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    printHelp();
    return;
  }
  
  printHeader();
  
  // Detect or use forced platform
  const platform = options.platform || detectPlatform();
  
  colorLog('blue', `ℹ️  Detected platform: ${platform}`);
  colorLog('blue', `ℹ️  Node.js version: ${process.version}`);
  console.log();
  
  // Validate platform
  if (!['windows', 'unix'].includes(platform)) {
    colorLog('red', `❌ Invalid platform: ${platform}. Must be 'windows' or 'unix'`);
    process.exit(1);
  }
  
  await runSetup(platform, options);
}

// Handle script interruption
process.on('SIGINT', () => {
  colorLog('yellow', '\n⚠️  Setup interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  colorLog('yellow', '\n⚠️  Setup terminated');
  process.exit(1);
});

// Run main function
main().catch((error) => {
  colorLog('red', `❌ Unexpected error: ${error.message}`);
  process.exit(1);
});