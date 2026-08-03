const fs = require('fs');

const files = [
  'index.html', 'about.html', 'contact.html', 'design.html',
  'web.html', 'services.html', 'privacy.html', '404.html'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /<span class="brand-text">TECHNOIDFIX<\/span>/g,
    '<span class="brand-text">Technoid<span style="color:var(--brand)">Fix</span></span>'
  );
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
});
