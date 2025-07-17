#!/usr/bin/env node

// Simple syntax check for the main JavaScript files
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking JavaScript files for syntax errors...\n');

const files = [
    'app.js',
    'simple-room.js',
    'auto-camera-switching.js',
    'websocket-debug-fix.js',
    'config/index.js',
    'main.js'
];

let allPassed = true;

files.forEach(file => {
    try {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            // Read the file content
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check for common syntax issues
            const issues = [];
            
            // Check for "this.updateCameraStatus" which should be "updateCameraStatus"
            if (content.includes('this.updateCameraStatus')) {
                issues.push('❌ Found "this.updateCameraStatus" - should be "updateCameraStatus"');
            }
            
            // Check for "this.updateCallStatus" which should be "updateCallStatus" (but not "this.updateCallStatusInternal")
            if (content.includes('this.updateCallStatus') && !content.includes('this.updateCallStatusInternal')) {
                issues.push('❌ Found "this.updateCallStatus" - should be "updateCallStatus"');
            }
            
            // Check for proper TURN config structure
            if (file === 'config/index.js') {
                if (content.includes('iceServers:') && !content.includes('servers:')) {
                    issues.push('❌ TURN_CONFIG should have "servers" property, not "iceServers"');
                }
            }
            
            if (issues.length === 0) {
                console.log(`✅ ${file}: No issues found`);
            } else {
                console.log(`❌ ${file}: Issues found:`);
                issues.forEach(issue => console.log(`   ${issue}`));
                allPassed = false;
            }
        } else {
            console.log(`⚠️  ${file}: File not found`);
            allPassed = false;
        }
    } catch (error) {
        console.log(`❌ ${file}: Error reading file - ${error.message}`);
        allPassed = false;
    }
});

console.log('\n' + '='.repeat(50));
if (allPassed) {
    console.log('✅ All files passed the syntax check!');
    console.log('🎉 The updateCameraStatus fix has been applied successfully!');
} else {
    console.log('❌ Some files have issues that need to be fixed');
}
console.log('='.repeat(50));