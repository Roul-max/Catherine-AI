const { execSync } = require('child_process');
const fs = require('fs');

try {
  const content = execSync('git show HEAD:app/page.tsx').toString();
  fs.writeFileSync('page.old.tsx', content);
  
  const globals = execSync('git show HEAD:app/globals.css').toString();
  fs.writeFileSync('globals.old.css', globals);

  const layout = execSync('git show HEAD:app/layout.tsx').toString();
  fs.writeFileSync('layout.old.tsx', layout);
  
  console.log('Restored to .old files');
} catch(e) {
  console.error('git error', e);
}
