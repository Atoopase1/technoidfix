const fs = require('fs');
const glob = require('child_process').execSync;

function stripBOM(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Stripped BOM from ${file}`);
  }
}

function replaceMojibake(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/â€¦/g, '...');
  content = content.replace(/â€”/g, '—');
  content = content.replace(/â€“/g, '–');
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Replaced Mojibake in ${file}`);
}

const files = [
  '404.html', 'about.html', 'contact.html', 'design.html',
  'electrical-estimator/index.html', 'index.html', 'privacy.html',
  'services.html', 'web.html', 'sw.js', 'assets/js/app.js', 'electrical-estimator/app.js'
];

files.forEach(f => {
  stripBOM(f);
  // Safely replace mojibake in all files again (services.html was just restored from git, so it needs it)
  replaceMojibake(f); 
});
