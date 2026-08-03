const fs = require('fs');

const files = [
  'index.html', 'about.html', 'contact.html', 'design.html',
  'web.html', 'services.html', 'privacy.html', '404.html'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace nav brand
  content = content.replace(
    /<span class="brand-text">Technoid<span style="color:var\(--brand\)">Fix<\/span><\/span>/g,
    '<span class="brand-text">Technoid<span style="color:var(--accent)">Fix</span></span>'
  );
  
  // Replace footer brand
  content = content.replace(
    /<div class="footer-brand">Technoid<span style="color:var\(--brand\)">Fix<\/span><\/div>/g,
    '<div class="footer-brand">Technoid<span style="color:var(--accent)">Fix</span></div>'
  );
  
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
});
