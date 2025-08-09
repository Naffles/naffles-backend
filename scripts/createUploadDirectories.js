const fs = require('fs');
const path = require('path');

/**
 * Create necessary upload directories for the application
 */
function createUploadDirectories() {
    const directories = [
        'uploads',
        'uploads/csv',
        'uploads/images',
        'uploads/temp'
    ];

    directories.forEach(dir => {
        const fullPath = path.join(__dirname, '..', dir);
        
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`Created directory: ${fullPath}`);
        } else {
            console.log(`Directory already exists: ${fullPath}`);
        }
    });

    // Create .gitkeep files to ensure directories are tracked in git
    directories.forEach(dir => {
        const gitkeepPath = path.join(__dirname, '..', dir, '.gitkeep');
        if (!fs.existsSync(gitkeepPath)) {
            fs.writeFileSync(gitkeepPath, '');
            console.log(`Created .gitkeep in: ${dir}`);
        }
    });
}

// Run if called directly
if (require.main === module) {
    createUploadDirectories();
}

module.exports = { createUploadDirectories };