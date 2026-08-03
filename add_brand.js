const fs = require('fs');

function addBrandText(file) {
  let content = fs.readFileSync(file, 'utf8');
  // First, check if already added to avoid duplication
  if (content.includes('class="brand-text"')) {
    console.log(`Already added in ${file}`);
    return;
  }
  
  // Find the img tag with class="brand-img"
  const regex = /(<img[^>]+class="brand-img"[^>]*>)/g;
  if (regex.test(content)) {
    content = content.replace(regex, '$1<span class="brand-text">TECHNOIDFIX</span>');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Added brand text to ${file}`);
  } else {
    console.log(`Could not find brand-img in ${file}`);
  }
}

const files = [
  '404.html', 'about.html', 'contact.html', 'design.html',
  'electrical-estimator/index.html', 'index.html', 'privacy.html',
  'services.html', 'web.html'
];

files.forEach(addBrandText);
