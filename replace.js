const fs = require('fs');
const content = fs.readFileSync('.env.example', 'utf-8');
const result = content.replace(/jarvis/g, 'catherine').replace(/Jarvis/g, 'Catherine');
fs.writeFileSync('.env.example', result, 'utf-8');
console.log('done');
