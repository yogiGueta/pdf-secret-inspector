const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

// Create test PDF with secrets
const doc = new jsPDF();

doc.setFontSize(16);
doc.text('Confidential Document', 20, 20);

doc.setFontSize(12);
doc.text('This document contains sensitive information:', 20, 40);
doc.text('AWS Access Key: AKIAIOSFODNN7EXAMPLE', 20, 60);
doc.text('Database URL: mongodb://admin:password123@localhost:27017/mydb', 20, 80);
doc.text('JWT Secret: super-secret-jwt-key-12345', 20, 100);
doc.text('GitHub Token: ghp_1234567890abcdef1234567890abcdef12345678', 20, 120);

// Save the PDF
const pdfPath = path.join(__dirname, 'test-files', 'document-with-secrets.pdf');
fs.writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));

console.log('✅ Created test PDF with secrets:', pdfPath);

// Create clean PDF
const cleanDoc = new jsPDF();
cleanDoc.setFontSize(16);
cleanDoc.text('Clean Document', 20, 20);
cleanDoc.setFontSize(12);
cleanDoc.text('This is a clean document with no sensitive information.', 20, 40);
cleanDoc.text('It contains only regular business content.', 20, 60);

const cleanPdfPath = path.join(__dirname, 'test-files', 'clean-document.pdf');
fs.writeFileSync(cleanPdfPath, Buffer.from(cleanDoc.output('arraybuffer')));

console.log('✅ Created clean test PDF:', cleanPdfPath);
