#!/usr/bin/env node

/**
 * Build script for ofd.js
 * This script prepares the package for distribution
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));

console.log(`\n📦 Building ofd.js v${packageJson.version}\n`);

// Validate that all necessary files exist
const requiredFiles = [
  'index.js',
  'index.d.ts',
  'package.json',
  'LICENSE',
  'README.md',
  'CHANGELOG.md'
];

console.log('✓ Checking required files...');
let allFilesExist = true;
requiredFiles.forEach(file => {
  const filePath = path.join(projectRoot, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.error('\n❌ Build failed: Required files are missing\n');
  process.exit(1);
}

// Validate package.json
console.log('\n✓ Validating package.json...');
const validations = [
  ['name', 'Package name is set'],
  ['version', 'Package version is set'],
  ['description', 'Package description is set'],
  ['main', 'Main entry point is set'],
  ['license', 'License is set']
];

validations.forEach(([field, message]) => {
  if (packageJson[field]) {
    console.log(`  ✓ ${message}`);
  } else {
    console.log(`  ⚠ ${message} - NOT SET`);
  }
});

// Check for TypeScript definitions
console.log('\n✓ Checking TypeScript definitions...');
const dtsPath = path.join(projectRoot, 'index.d.ts');
if (fs.existsSync(dtsPath)) {
  console.log('  ✓ TypeScript definitions found');
} else {
  console.log('  ⚠ TypeScript definitions not found');
}

console.log('\n✅ Build validation complete!\n');
console.log('📝 Next steps:');
console.log('  1. Run "npm test" to execute tests');
console.log('  2. Run "npm run lint" to check code quality');
console.log('  3. Run "npm publish" to publish to npm\n');
