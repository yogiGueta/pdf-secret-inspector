#!/usr/bin/env node

/**
 * Test Data Generator for PDF Secret Inspector
 * Creates sample PDF files with and without secrets for testing
 */

const fs = require('fs');
const path = require('path');

// Create test-files directory if it doesn't exist
const testFilesDir = path.join(__dirname, '../../../test-files');
if (!fs.existsSync(testFilesDir)) {
    fs.mkdirSync(testFilesDir, { recursive: true });
}

// Generate test files
console.log('🔍 Generating test PDF files...');

try {
    // Create simple test files for now
    const secretsContent = 'This document contains AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and password=secret123';
    const cleanContent = 'This is a clean document with no sensitive information.';
    
    fs.writeFileSync(path.join(testFilesDir, 'document-with-secrets.txt'), secretsContent);
    console.log('✅ Created: document-with-secrets.txt');
    
    fs.writeFileSync(path.join(testFilesDir, 'clean-document.txt'), cleanContent);
    console.log('✅ Created: clean-document.txt');

    console.log('\n🎉 Test files generated successfully!');
    console.log(`📁 Location: ${testFilesDir}`);
    
} catch (error) {
    console.error('❌ Error generating test files:', error.message);
    process.exit(1);
}
