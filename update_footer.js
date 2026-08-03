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
  'index.html', 'about.html', 'contact.html', 'design.html',
  'web.html', 'services.html', 'privacy.html', '404.html'
];

files.forEach(file => {
  if (!fs.existsSync(file)) { console.log(`Skipping ${file} (not found)`); return; }
  let content = fs.readFileSync(file, 'utf8');

  // Match existing footer block
  const footerRegex = /<footer[\s\S]*?<\/footer>/i;
  if (footerRegex.test(content)) {
    content = content.replace(footerRegex, NEW_FOOTER.trim());
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated footer in ${file}`);
  } else {
    console.log(`No <footer> found in ${file}`);
  }
});
