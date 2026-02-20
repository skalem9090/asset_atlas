/**
 * Deployment script for Asset Atlas
 * Creates a clean deployment folder with only production files
 */

const fs = require('fs');
const path = require('path');

const DEPLOY_DIR = 'deploy';

// Files and directories to include in deployment
const INCLUDE = [
  'module.json',
  'README.md',
  'scripts/',
  'styles/',
  'templates/',
  'lang/'
];

// Files and directories to exclude (even if in included directories)
const EXCLUDE = [
  '.map',           // Source maps
  '.ts',            // TypeScript source files
  '__tests__',      // Test files
  'node_modules',   // Dependencies
  '.kiro',          // Kiro files
  'src',            // Source directory
  '.git',           // Git files
  '.gitignore',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'rollup.config.js',
  'jest.config.js',
  'deploy.js',
  // Documentation files (not needed for deployment)
  'ASSET_ATLAS_FOLDER_STRUCTURE.md',
  'COMPLETION_SUMMARY.md',
  'DEPLOYMENT_GUIDE.md',
  'DOCUMENTATION_INDEX.md',
  'FOLDER_SETUP_GUIDE.md',
  'FOUNDRY_DEPLOYMENT_CHECKLIST.md',
  'GUI_DESIGN_IMPLEMENTATION.md',
  'GUI_IMPROVEMENTS_SUMMARY.md',
  'IMPLEMENTATION_STATUS.md',
  'PROJECT_SUMMARY.md',
  'QUICK_REFERENCE.md',
  'QUICK_START.md',
  'SESSION_SUMMARY.md',
  'TESTING_GUIDE.md'
];

/**
 * Check if a path should be excluded
 */
function shouldExclude(filePath) {
  return EXCLUDE.some(pattern => {
    if (pattern.startsWith('.')) {
      // Extension check
      return filePath.endsWith(pattern);
    } else {
      // Directory or file name check
      return filePath.includes(pattern);
    }
  });
}

/**
 * Recursively copy directory
 */
function copyDirectory(src, dest) {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip excluded files/directories
    if (shouldExclude(srcPath)) {
      console.log(`  Skipping: ${srcPath}`);
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

/**
 * Main deployment function
 */
function deploy() {
  console.log('Asset Atlas Deployment Script');
  console.log('==============================\n');

  // Clean deployment directory
  if (fs.existsSync(DEPLOY_DIR)) {
    console.log(`Cleaning existing deployment directory: ${DEPLOY_DIR}`);
    fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
  }

  // Create deployment directory
  console.log(`Creating deployment directory: ${DEPLOY_DIR}\n`);
  fs.mkdirSync(DEPLOY_DIR, { recursive: true });

  // Copy files and directories
  console.log('Copying files...\n');
  
  for (const item of INCLUDE) {
    const srcPath = item.endsWith('/') ? item.slice(0, -1) : item;
    const destPath = path.join(DEPLOY_DIR, srcPath);

    if (!fs.existsSync(srcPath)) {
      console.log(`  Warning: ${srcPath} does not exist, skipping`);
      continue;
    }

    const stats = fs.statSync(srcPath);

    if (stats.isDirectory()) {
      console.log(`Copying directory: ${srcPath}/`);
      copyDirectory(srcPath, destPath);
    } else {
      // Copy single file
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Copied: ${srcPath} -> ${destPath}`);
    }
    console.log('');
  }

  console.log('==============================');
  console.log('Deployment complete!');
  console.log(`\nDeployment package created in: ${DEPLOY_DIR}/`);
  console.log('\nTo install:');
  console.log(`  1. Zip the contents of the ${DEPLOY_DIR}/ folder`);
  console.log('  2. Install the zip file in Foundry VTT');
  console.log('  or');
  console.log(`  3. Copy the ${DEPLOY_DIR}/ folder to your Foundry modules directory`);
}

// Run deployment
try {
  deploy();
} catch (error) {
  console.error('Deployment failed:', error);
  process.exit(1);
}
