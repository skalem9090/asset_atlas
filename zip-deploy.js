/**
 * Create a zip file of the deployment folder
 * Requires: npm install archiver --save-dev
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const DEPLOY_DIR = 'deploy';
const OUTPUT_FILE = 'asset-atlas.zip';

async function createZip() {
  console.log('Creating deployment zip file...\n');

  // Check if deploy directory exists
  if (!fs.existsSync(DEPLOY_DIR)) {
    console.error(`Error: ${DEPLOY_DIR}/ directory not found.`);
    console.error('Please run "npm run deploy" first.');
    process.exit(1);
  }

  // Create output stream
  const output = fs.createWriteStream(OUTPUT_FILE);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  // Listen for completion
  output.on('close', () => {
    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`\n✓ Zip file created: ${OUTPUT_FILE}`);
    console.log(`  Size: ${sizeInMB} MB`);
    console.log(`  Files: ${archive.pointer()} bytes`);
    console.log('\nReady for distribution!');
  });

  // Listen for errors
  archive.on('error', (err) => {
    throw err;
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add the deploy directory contents (not the directory itself)
  archive.directory(DEPLOY_DIR, false);

  // Finalize the archive
  await archive.finalize();
}

// Run
createZip().catch(err => {
  console.error('Failed to create zip:', err);
  process.exit(1);
});
