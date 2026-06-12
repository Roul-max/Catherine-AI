const { execSync } = require('child_process');
const fs = require('fs');

try {
  const content = execSync('git show HEAD:app/page.tsx').toString();
  fs.writeFileSync('app/page.tsx', content);
  
  const globals = execSync('git show HEAD:app/globals.css').toString();
  fs.writeFileSync('app/globals.css', globals);

  const layout = execSync('git show HEAD:app/layout.tsx').toString();
  fs.writeFileSync('app/layout.tsx', layout);
  
  console.log('Restored to original files');
} catch(e) {
  console.error('git error', e);
}
