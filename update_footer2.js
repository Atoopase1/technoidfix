const fs = require('fs');

const NEW_FOOTER = `  <!-- Footer -->
  <footer class="footer" role="contentinfo">
    <div class="footer-glow"></div>
    <div class="footer-inner">
      <div class="footer-grid">

        <!-- Column 1: Brand -->
        <div class="footer-col-brand">
          <div class="footer-brand">Technoid<span style="color:var(--brand)">Fix</span></div>
          <div class="footer-tagline">Expert Repair · Creative Design · Web Development · Kumasi, Ghana</div>
          <div class="footer-socials">
            <a href="https://www.tiktok.com/@technoid_chris_atoopase" target="_blank" rel="noopener" aria-label="TikTok"><i class="fab fa-tiktok"></i></a>
            <a href="https://x.com/technoidchris" target="_blank" rel="noopener" aria-label="X/Twitter"><i class="fab fa-x-twitter"></i></a>
            <a href="https://youtube.com/@techniod_chris" target="_blank" rel="noopener" aria-label="YouTube"><i class="fab fa-youtube"></i></a>
            <a href="https://www.facebook.com/profile.php?id=100015011820419" target="_blank" rel="noopener" aria-label="Facebook"><i class="fab fa-facebook"></i></a>
          </div>
          <div class="footer-explore">
            <a href="https://tekstore.netlify.app" target="_blank" rel="noopener"><i class="fas fa-shopping-cart"></i> Tekstore</a>
            <a href="https://tekgame.netlify.app/" target="_blank" rel="noopener"><i class="fas fa-gamepad"></i> Technoid Game</a>
            <a href="https://tekyel.vercel.app/" target="_blank" rel="noopener"><i class="fas fa-comments"></i> Tekyel</a>
            <a href="https://jobbeacon.vercel.app/" target="_blank" rel="noopener"><i class="fas fa-search"></i> JobBeacon</a>
          </div>
        </div>

        <!-- Column 2: Quick Links -->
        <div>
          <div class="footer-col-title">Quick Links</div>
          <div class="footer-links">
            <a href="index.html">Home</a>
            <a href="about.html">About</a>
            <a href="services.html">Services</a>
            <a href="design.html">Design</a>
            <a href="web.html">Web Dev</a>
            <a href="contact.html">Contact</a>
            <a href="privacy.html">Privacy</a>
          </div>
        </div>

        <!-- Column 3: Contact -->
        <div>
          <div class="footer-col-title">Contact</div>
          <div class="footer-contact-list">
            <div class="footer-contact-item">
              <i class="fas fa-map-marker-alt"></i>
              <span>Kumasi, Ghana</span>
            </div>
            <div class="footer-contact-item">
              <i class="fas fa-phone"></i>
              <span><a href="tel:+233544833571">+233 54 483 3571</a></span>
            </div>
            <div class="footer-contact-item">
              <i class="fas fa-envelope"></i>
              <span><a href="mailto:atoopase@icloud.com">atoopase@icloud.com</a></span>
            </div>
            <div class="footer-contact-item">
              <i class="fas fa-clock"></i>
              <span>Mon – Sat, 8am – 6pm GMT</span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div class="footer-bottom-bar">
      <p class="footer-bottom">&copy; <span class="year"></span> Technoid Chris Atoopase. All rights reserved. &nbsp;|&nbsp; <a href="privacy.html">Privacy</a></p>
      <span class="footer-status-badge"><span class="footer-status-dot"></span> All systems operational</span>
    </div>
  </footer>`;

const files = [
  'contact.html', 'design.html', 'web.html'
];

// Pattern for these files: match old footer content block ending before </body>
files.forEach(file => {
  if (!fs.existsSync(file)) { console.log(`Skipping ${file} (not found)`); return; }
  let content = fs.readFileSync(file, 'utf8');

  // These pages have footer content (footer-brand, social-links, etc.) but not wrapped in <footer>
  // Find from "<!-- Footer -->" or from footer-brand to the wa-float button
  // Strategy: find the footer-brand div and replace backwards to the previous comment/structure

  // Match: from a line containing footer-brand up to (not including) <!-- WhatsApp
  const oldFooterRe = /\s*<div class="footer-brand">[\s\S]*?<\/div>\s*\n\s*(?=\s*<!--)/;
  
  // Alternative: find the block from <!-- Explore More strip or <div class="footer" 
  const altRe = /<div[^>]*class="footer"[^>]*>[\s\S]*?(?=\s*<!--\s*(WhatsApp|Settings))/;
  
  // Check for a wrapping footer div
  const wrapperMatch = content.match(/<div[^>]*class="(?:[^"]*\s)?footer(?:\s[^"]*)?"[^>]*>/);
  if (!wrapperMatch) {
    // Look for the start of footer content
    const idx = content.indexOf('<div class="footer-brand">');
    if (idx === -1) { console.log(`No footer marker in ${file}`); return; }
    
    // Walk backwards to find the start of the section (usually after </section> or after closing of a block)
    const before = content.substring(0, idx);
    // Find last </section> or </div> before the footer content
    const sectionEnd = Math.max(
      before.lastIndexOf('</section>'),
      before.lastIndexOf('\n\n    </div>\n'),
    );
    
    const footerStart = sectionEnd !== -1 ? sectionEnd + (before.lastIndexOf('</section>') === sectionEnd ? '</section>'.length : '\n\n    </div>\n'.length) : idx;
    
    // Find end: wa-float comment
    const waIdx = content.indexOf('<!-- WhatsApp', idx);
    const settingsIdx = content.indexOf('<!-- Settings Modal', idx);
    
    let footerEnd;
    if (settingsIdx !== -1 && (settingsIdx < waIdx || waIdx === -1)) {
      footerEnd = settingsIdx;
    } else if (waIdx !== -1) {
      footerEnd = waIdx;
    } else {
      footerEnd = content.indexOf('</body>', idx);
    }
    
    const toReplace = content.substring(footerStart, footerEnd);
    content = content.substring(0, footerStart) + '\n\n' + NEW_FOOTER + '\n\n  ' + content.substring(footerEnd);
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated footer in ${file}`);
  } else {
    content = content.replace(/<div[^>]*class="(?:[^"]*\s)?footer(?:\s[^"]*)?"[^>]*>[\s\S]*?(?=\s*<!--\s*(WhatsApp|Settings))/,
      NEW_FOOTER + '\n\n  ');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated footer (div) in ${file}`);
  }
});
