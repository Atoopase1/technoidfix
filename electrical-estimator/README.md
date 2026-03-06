# AI Professional Electrical Wiring Designer
## Full Diagram Generator — IEC 60364 Compliant

---

### Project Structure

```
electrical-project/
├── index.html      — Main HTML structure (4-step wizard UI)
├── styles.css      — All styling (dark industrial theme, responsive)
├── app.js          — Full engineering logic & diagram generation
└── README.md       — This file
```

---

### How to Run

**Option 1 — Direct open (local):**
Simply open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
No build step, no server, no dependencies required.

**Option 2 — Local server (recommended for development):**
```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# Then open: http://localhost:8080
```

---

### Features

- **4-Step Wizard:** Supply config → Room builder → Load selection → Results
- **IEC 60364** compliant cable sizing, voltage drop, and protection coordination
- **Auto circuit splitting** when loads exceed safe limits
- **Diversity factors:** 90% lighting, 75% sockets, cooker diversity rule, 100% heating
- **15% spare capacity** built into all calculations
- **Voltage drop checking:** ≤3% lighting, ≤5% total — auto cable upsizing
- **Full SVG diagrams:** Single Line, DB Layout, Earthing System, Protection Hierarchy
- **Complete material list** with quantities in yards + 15% wastage

### Engineering Standards Applied

| Standard       | Scope                          |
|---------------|-------------------------------|
| IEC 60364-5-52 | Cable current-carrying capacity |
| IEC 60364-4-43 | Overcurrent protection         |
| IEC 60364-5-54 | Earthing & bonding             |
| IEC 61643-11   | SPD Type 2 requirements        |
| IEC 61008      | RCD specifications             |
| BS 7671 (18th) | UK wiring regulations (ref)    |

---

### Default Configuration

- **Voltage:** 230V single-phase (switchable to 3-phase 400V)
- **Frequency:** 50Hz
- **Earthing:** TN-C-S (PME)
- **Cable material:** Copper
- **Installation:** Conduit concealed

---

### Browser Compatibility

Chrome 90+, Firefox 88+, Edge 90+, Safari 14+

---

> ⚠️ **DISCLAIMER:** This tool is for professional use only. All designs must be verified by a qualified electrical engineer and comply with local regulations before installation.
