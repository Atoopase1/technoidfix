'use strict';
// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
const state = {
  rooms: [],
  results: null,
  roomIdCounter: 0
};

// ═══════════════════════════════════════════════════════════════════
// ENGINEERING DATA TABLES  (IEC 60364 / BS 7671)
// ═══════════════════════════════════════════════════════════════════

// Cable ampacity in conduit at 30°C (IEC 60364-5-52 Table B.52.3)
const CABLE_AMPACITY = {
  1.5: { conduit: 13.5, trunking: 14.5, 'cable-tray': 17.5, 'free-air': 20 },
  2.5: { conduit: 18,   trunking: 19.5, 'cable-tray': 24,   'free-air': 27 },
  4:   { conduit: 24,   trunking: 26,   'cable-tray': 32,   'free-air': 37 },
  6:   { conduit: 31,   trunking: 34,   'cable-tray': 41,   'free-air': 47 },
  10:  { conduit: 42,   trunking: 46,   'cable-tray': 57,   'free-air': 65 },
  16:  { conduit: 56,   trunking: 61,   'cable-tray': 76,   'free-air': 87 },
  25:  { conduit: 73,   trunking: 80,   'cable-tray': 96,   'free-air': 114 },
  35:  { conduit: 89,   trunking: 99,   'cable-tray': 119,  'free-air': 141 },
  50:  { conduit: 108,  trunking: 119,  'cable-tray': 144,  'free-air': 175 },
  70:  { conduit: 136,  trunking: 151,  'cable-tray': 184,  'free-air': 222 },
  95:  { conduit: 164,  trunking: 182,  'cable-tray': 223,  'free-air': 269 }
};

// Temperature correction factors (IEC 60364-5-52 Table B.52.14, XLPE/PVC 70°C)
const TEMP_FACTORS = { 25: 1.03, 30: 1.00, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71 };

// Voltage drop mV/A/m for copper two-core single-phase (IEC 60364-5-52 Table I)
// For three-phase use VD × √3 / (√3) — same table applies per phase conductor
const VD_MV_AM = {
  1.5: 29, 2.5: 18, 4: 11, 6: 7.3, 10: 4.4, 16: 2.8, 25: 1.75, 35: 1.25, 50: 0.93, 70: 0.64, 95: 0.47
};

// Standard cable sizes (mm²)
const CABLE_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95];

// Standard MCB ratings (A)
const MCB_RATINGS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200];

// Power factor for different load types
// Residential standard: Curve B or C only — no Curve D in IEC 60364 domestic.
// AC/pump: PF = 0.85 to correctly size cable for true current draw.
const LOAD_PF = {
  lighting: 1.0,
  socket:   1.0,
  heavy:    1.0,   // resistive: water heater, shower, cooker
  ac:       0.85,  // inverter/compressor — PF correction only, still Curve C
  pump:     0.85,  // pump motor — PF correction only, still Curve C
  shower:   1.0,
  '3phase': 0.85
};

// ── CABLE → BREAKER BINDING TABLE (IEC 60364 residential, conduit install) ──
// Rule: MCB rating In must never exceed cable current capacity Iz.
// Iz values at 30°C in conduit (IEC 60364-5-52 Table B.52.3):
//   1.5mm² Iz=13.5A → permitted MCBs: 6A, 10A   (In ≤ 13.5A ✓)
//   2.5mm² Iz=18A   → permitted MCBs: 16A        (In=16A ≤ 18A ✓)
//   4mm²   Iz=24A   → permitted MCBs: 20A        (In=20A ≤ 24A ✓) [25A would exceed Iz]
//   6mm²   Iz=31A   → permitted MCBs: 25A        (In=25A ≤ 31A ✓) [32A would exceed Iz]
//   10mm²  Iz=42A   → permitted MCBs: 32A, 40A   (In ≤ 42A ✓)
//   16mm²  Iz=56A   → permitted MCBs: 50A        (In=50A ≤ 56A ✓)
//
// NOTE: 32A breaker requires 10mm² cable (not 6mm²) in conduit installation.
//       6mm² is limited to 25A maximum in conduit.
const CABLE_MCB_MAP = {
  1.5:  { permitted: [6, 10],   max: 10 },
  2.5:  { permitted: [16],      max: 16 },
  4:    { permitted: [20],      max: 20 },   // 25A would exceed 24A Iz — not permitted
  6:    { permitted: [25],      max: 25 },   // 32A would exceed 31A Iz — not permitted
  10:   { permitted: [32, 40],  max: 40 },   // 10mm² needed for 32A and above
  16:   { permitted: [50],      max: 50 },
  25:   { permitted: [63, 80],  max: 80 },
  35:   { permitted: [100],     max: 100 }
};

// ── CABLE GROUPING DERATING FACTORS (IEC 60364-5-52 Table B.52.17) ──
// Applied when multiple circuits share the same conduit/trunking/surface.
// Number of circuits → derating factor applied to cable ampacity.
const GROUPING_FACTORS = { 1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50 };
function getGroupingFactor(n) {
  if (n <= 1) return 1.00;
  if (n >= 9) return 0.50;
  return GROUPING_FACTORS[n] || 0.50;
}

// ── MOTOR vs RESISTIVE LOAD RULES ────────────────────────────────────
// IEC 60364-4-43: For motor circuits, cable must be sized for starting current
// (typically 6× FLC for DOL start). Cable sizing uses 1.25× FLC as minimum.
// For resistive loads, cable is sized directly for operating current — no multiplier.
// Motor starting current for breaker selection = FLC × starting factor:
//   DOL start:    6–8× FLC → Curve C handles up to 10× In (adequate for ≤8×)
//   Star-delta:   2–3× FLC → Curve C handles easily
const MOTOR_TYPES = new Set(['ac', 'pump', 'fridge_motor']); // load types that are motors
const MOTOR_START_FACTOR = 6; // worst-case DOL inrush multiplier for Curve C selection
function getSetting(id) { return document.getElementById(id)?.value || ''; }
/** Parse a numeric value from an input element, returning `def` for NaN/empty/negative */
function getNum(id, def = 0) {
  const raw = parseFloat(document.getElementById(id)?.value);
  return (Number.isFinite(raw) && raw >= 0) ? raw : def;
}
function getBool(id) { return document.getElementById(id)?.checked || false; }

function nextMCB(a) { return MCB_RATINGS.find(r => r >= a) || MCB_RATINGS[MCB_RATINGS.length - 1]; }

function getAmpacity(size, installType) {
  const row = CABLE_AMPACITY[size] || CABLE_AMPACITY[95];
  const type = installType || 'conduit';
  return row[type] || row.conduit;
}

function getTempFactor(temp) { return TEMP_FACTORS[temp] || 1.0; }

function getVD(size) { return VD_MV_AM[size] || VD_MV_AM[1.5]; }

function nextCableSize(current) {
  const idx = CABLE_SIZES.indexOf(current);
  return idx < CABLE_SIZES.length - 1 ? CABLE_SIZES[idx + 1] : current;
}

function selectCableForLoad(amperes, installType, temp) {
  const tf = getTempFactor(temp);
  const reqAmp = amperes / tf;
  for (const size of CABLE_SIZES) {
    if (getAmpacity(size, installType) >= reqAmp) return size;
  }
  return 95;
}

/** Calculate voltage drop as a percentage (IEC 60364-5-52)
 *  Single-phase:  VD(V) = mV/A/m × I × L / 1000
 *  Three-phase:   VD(V) = mV/A/m × I × L × √3 / 1000  (line-to-line voltage)
 *  VD% = VD(V) / V_nominal × 100
 *  Limits: 3% lighting, 5% other (IEC 60364-5-52 cl.525) */
function calcVDpercent(size, amps, lengthM, voltage, threePhase = false) {
  if (!voltage || voltage <= 0) return 0;
  const mVperAm = getVD(size);
  const factor = threePhase ? Math.sqrt(3) : 1;
  const vdV = (mVperAm * amps * lengthM * factor) / 1000;
  return (vdV / voltage) * 100;
}

function autoUpsizeCable(size, amps, lengthM, voltage, maxVDpercent, installType, temp, threePhase = false) {
  let s = size;
  let iter = 0;
  while (iter++ < 10) {
    const vd = calcVDpercent(s, amps, lengthM, voltage, threePhase);
    if (vd <= maxVDpercent) break;
    s = nextCableSize(s);
  }
  // Also check ampacity after temperature derating
  const tf = getTempFactor(temp);
  while (getAmpacity(s, installType) * tf < amps && CABLE_SIZES.indexOf(s) < CABLE_SIZES.length - 1) {
    s = nextCableSize(s);
  }
  return s;
}

function metersToYards(m) { return (m * 1.09361); }
function roundUp15(val) { return Math.ceil(val * 1.15); } // 15% wastage

// ═══════════════════════════════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
function addRoom(name = 'New Room', L = 5, W = 4, H = 2.8, dist = 10, floor = 1) {
  const id = ++state.roomIdCounter;
  const room = {
    id, name, length: L, width: W, height: H, distanceFromDB: dist, floor,
    loads: {
      lighting: { ledQty: 4, ledWatt: 9, spots: 0, chandelier: 0, chandelierWatt: 60, outdoor: 0, emergency: 0, fans: 0 },
      sockets: { std13A: 4, usb: 2, fridge: false, tv: false, outdoor: 0, garage: 0 },
      appliances: {
        cooker: 0, oven: 0, waterHeater: 0, shower: 0,
        ac: 0, washing: 0, dishwasher: 0, microwave: 0,
        pump: 0, custom1: 0, custom2: 0
      }
    }
  };
  state.rooms.push(room);
  renderRooms();
  renderLoadSelection();
}

function quickAdd(name, L, W, H) {
  const dist = getNum('s_meter_dist', 5) + 5 + state.rooms.length * 3;
  addRoom(name, L, W, H, dist, 1);
}

function removeRoom(id) {
  state.rooms = state.rooms.filter(r => r.id !== id);
  renderRooms();
  renderLoadSelection();
}

function getRoomVal(id, field) {
  const el = document.getElementById(`r${id}_${field}`);
  if (!el) return 0;
  if (el.type === 'checkbox') return el.checked;
  return parseFloat(el.value) || 0;
}

function getRoomStr(id, field) {
  const el = document.getElementById(`r${id}_${field}`);
  return el ? el.value : '';
}

function syncRoomData(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;
  room.name = getRoomStr(id, 'name') || room.name;
  room.length = getRoomVal(id, 'L');
  room.width = getRoomVal(id, 'W');
  room.height = getRoomVal(id, 'H');
  room.distanceFromDB = getRoomVal(id, 'dist');
  room.floor = parseInt(getRoomStr(id, 'floor')) || 1;
}

function toggleRoom(id) {
  const body = document.getElementById(`rb_${id}`);
  if (body) body.classList.toggle('collapsed');
}

function renderRooms() {
  const c = document.getElementById('rooms-container');
  if (!state.rooms.length) {
    c.innerHTML = `<div class="sc"><div class="sc-body" style="text-align:center;padding:40px;color:var(--tx2)">No rooms added yet. Use the button below or quick templates.</div></div>`;
    return;
  }
  const floors = getNum('b_floors', 1);
  let fl = ''; for (let f = 1; f <= floors; f++) fl += `<option value="${f}">Floor ${f}</option>`;
  c.innerHTML = state.rooms.map(room => `
  <div class="room-card" id="rc_${room.id}">
    <div class="room-card-hdr" onclick="toggleRoom(${room.id})">
      <span class="rn">ROOM ${room.id}</span>
      <span class="rt">${room.name}</span>
      <span class="rs">${room.length}m × ${room.width}m × ${room.height}m</span>
      <button class="del" onclick="event.stopPropagation();removeRoom(${room.id})" title="Remove Room">✕</button>
    </div>
    <div class="room-card-body" id="rb_${room.id}">
      <div class="fg fg-4">
        <div class="ff">
          <label>Room Name</label>
          <input id="r${room.id}_name" value="${room.name}" oninput="syncRoomData(${room.id});document.querySelector('#rc_${room.id} .rt').textContent=this.value">
        </div>
        <div class="ff">
          <label>Length</label>
          <input type="number" id="r${room.id}_L" value="${room.length}" min="0.5" step="0.1" oninput="syncRoomData(${room.id})">
          <span class="unit">meters</span>
        </div>
        <div class="ff">
          <label>Width</label>
          <input type="number" id="r${room.id}_W" value="${room.width}" min="0.5" step="0.1" oninput="syncRoomData(${room.id})">
          <span class="unit">meters</span>
        </div>
        <div class="ff">
          <label>Height</label>
          <input type="number" id="r${room.id}_H" value="${room.height}" min="1.5" step="0.1" oninput="syncRoomData(${room.id})">
          <span class="unit">meters</span>
        </div>
        <div class="ff">
          <label>Distance from DB</label>
          <input type="number" id="r${room.id}_dist" value="${room.distanceFromDB}" min="1" oninput="syncRoomData(${room.id})">
          <span class="unit">meters (cable run)</span>
        </div>
        <div class="ff">
          <label>Floor</label>
          <select id="r${room.id}_floor" onchange="syncRoomData(${room.id})">${fl}</select>
        </div>
      </div>
    </div>
  </div>`).join('');
}

function renderLoadSelection() {
  const c = document.getElementById('load-selection-container');
  if (!state.rooms.length) {
    c.innerHTML = `<div class="sc"><div class="sc-body" style="color:var(--tx2);text-align:center;padding:30px">No rooms found. Go back to Step 2 and add rooms first.</div></div>`;
    return;
  }
  c.innerHTML = state.rooms.map(room => `
  <div class="sc">
    <div class="sc-hdr">
      <div class="ic">🔌</div>
      <h2>${room.name.toUpperCase()} — ELECTRICAL LOADS</h2>
      <span style="margin-left:auto;font-family:'Share Tech Mono',monospace;font-size:.75rem;color:var(--tx2)">${room.length}m×${room.width}m | ${room.distanceFromDB}m from DB</span>
    </div>
    <div class="sc-body">
      <!-- LIGHTING -->
      <div class="load-section">
        <h3>💡 LIGHTING LOADS</h3>
        <div class="fg fg-4">
          <div class="ff"><label>LED Bulbs (qty)</label><input type="number" id="rl${room.id}_ledQty" value="${room.loads.lighting.ledQty}" min="0" oninput="syncLoad(${room.id})"></div>
          <div class="ff"><label>LED Wattage Each</label><input type="number" id="rl${room.id}_ledWatt" value="${room.loads.lighting.ledWatt}" min="1" max="50" oninput="syncLoad(${room.id})"><span class="unit">W per bulb</span></div>
          <div class="ff"><label>Spotlights (qty)</label><input type="number" id="rl${room.id}_spots" value="${room.loads.lighting.spots}" min="0" oninput="syncLoad(${room.id})"><span class="unit">@ 7W each</span></div>
          <div class="ff"><label>Chandelier (qty)</label><input type="number" id="rl${room.id}_chandelier" value="${room.loads.lighting.chandelier}" min="0" oninput="syncLoad(${room.id})"></div>
          <div class="ff"><label>Chandelier Watts</label><input type="number" id="rl${room.id}_chandelierWatt" value="${room.loads.lighting.chandelierWatt}" min="0" oninput="syncLoad(${room.id})"><span class="unit">W each</span></div>
          <div class="ff"><label>Outdoor Lights</label><input type="number" id="rl${room.id}_outdoor" value="${room.loads.lighting.outdoor}" min="0" oninput="syncLoad(${room.id})"><span class="unit">@ 20W each</span></div>
          <div class="ff"><label>Emergency Lights</label><input type="number" id="rl${room.id}_emergency" value="${room.loads.lighting.emergency}" min="0" oninput="syncLoad(${room.id})"><span class="unit">@ 3W each</span></div>
          <div class="ff"><label>Ceiling Fans</label><input type="number" id="rl${room.id}_fans" value="${room.loads.lighting.fans}" min="0" oninput="syncLoad(${room.id})"><span class="unit">@ 75W each</span></div>
        </div>
      </div>
      <!-- SOCKETS -->
      <div class="load-section">
        <h3>🔌 SOCKET OUTLETS</h3>
        <div class="fg fg-4">
          <div class="ff"><label>13A Sockets</label><input type="number" id="rl${room.id}_std13A" value="${room.loads.sockets.std13A}" min="0" oninput="syncLoad(${room.id})"><span class="unit">outlets</span></div>
          <div class="ff"><label>USB Sockets</label><input type="number" id="rl${room.id}_usb" value="${room.loads.sockets.usb}" min="0" oninput="syncLoad(${room.id})"><span class="unit">outlets</span></div>
          <div class="ff"><label>Outdoor Sockets</label><input type="number" id="rl${room.id}_outdoor_sock" value="${room.loads.sockets.outdoor||0}" min="0" oninput="syncLoad(${room.id})"><span class="unit">IP44+ weatherproof</span></div>
          <div class="ff"><label>Garage Sockets</label><input type="number" id="rl${room.id}_garage_sock" value="${room.loads.sockets.garage||0}" min="0" oninput="syncLoad(${room.id})"><span class="unit">outlets</span></div>
          <div class="ff">
            <label>Dedicated Fridge Socket</label>
            <div class="tog-row" style="margin-top:8px">
              <input type="checkbox" class="tog" id="rl${room.id}_fridge" ${room.loads.sockets.fridge ? 'checked' : ''} onchange="syncLoad(${room.id})">
              <label class="tog-lbl" for="rl${room.id}_fridge">Yes (200W dedicated)</label>
            </div>
          </div>
          <div class="ff">
            <label>TV / Data Outlet</label>
            <div class="tog-row" style="margin-top:8px">
              <input type="checkbox" class="tog" id="rl${room.id}_tv" ${room.loads.sockets.tv ? 'checked' : ''} onchange="syncLoad(${room.id})">
              <label class="tog-lbl" for="rl${room.id}_tv">Yes (coax + data)</label>
            </div>
          </div>
        </div>
      </div>
      <!-- HEAVY APPLIANCES -->
      <div class="load-section">
        <h3>⚡ HEAVY APPLIANCES</h3>
        <div class="fg fg-3">
          <div class="ff"><label>Cooker / Hob</label><input type="number" id="rl${room.id}_cooker" value="${room.loads.appliances.cooker}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW (0 = none)</span></div>
          <div class="ff"><label>Built-in Oven</label><input type="number" id="rl${room.id}_oven" value="${room.loads.appliances.oven||0}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW (2–3kW typical)</span></div>
          <div class="ff"><label>Water Heater (Geyser)</label><input type="number" id="rl${room.id}_waterHeater" value="${room.loads.appliances.waterHeater}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW</span></div>
          <div class="ff"><label>Electric Shower</label><input type="number" id="rl${room.id}_shower" value="${room.loads.appliances.shower}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW (7.5 / 10.5 typical)</span></div>
          <div class="ff"><label>Air Conditioner</label><input type="number" id="rl${room.id}_ac" value="${room.loads.appliances.ac}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW cooling</span></div>
          <div class="ff"><label>Washing Machine</label><input type="number" id="rl${room.id}_washing" value="${room.loads.appliances.washing}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW</span></div>
          <div class="ff"><label>Dishwasher</label><input type="number" id="rl${room.id}_dishwasher" value="${room.loads.appliances.dishwasher||0}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW (1.5–2.5kW typical)</span></div>
          <div class="ff"><label>Microwave</label><input type="number" id="rl${room.id}_microwave" value="${room.loads.appliances.microwave}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW</span></div>
          <div class="ff"><label>Pump (Water / Sump)</label><input type="number" id="rl${room.id}_pump" value="${room.loads.appliances.pump}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW</span></div>
          <div class="ff"><label>Custom Appliance 1</label><input type="number" id="rl${room.id}_custom1_kw" value="${room.loads.appliances.custom1||0}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW</span></div>
          <div class="ff"><label>Custom Appliance 2</label><input type="number" id="rl${room.id}_custom2_kw" value="${room.loads.appliances.custom2||0}" min="0" step="0.1" oninput="syncLoad(${room.id})"><span class="unit">kW</span></div>
        </div>
      </div>
    </div>
  </div>`).join('');
}

function syncLoad(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;
  const g = f => parseFloat(document.getElementById(`rl${id}_${f}`)?.value) || 0;
  const gb = f => document.getElementById(`rl${id}_${f}`)?.checked || false;
  room.loads.lighting = {
    ledQty: g('ledQty'), ledWatt: g('ledWatt'), spots: g('spots'),
    chandelier: g('chandelier'), chandelierWatt: g('chandelierWatt'),
    outdoor: g('outdoor'), emergency: g('emergency'), fans: g('fans')
  };
  room.loads.sockets = {
    std13A: g('std13A'), usb: g('usb'),
    fridge: gb('fridge'), tv: gb('tv'),
    outdoor: g('outdoor_sock'), garage: g('garage_sock')
  };
  room.loads.appliances = {
    cooker: g('cooker'), oven: g('oven'), waterHeater: g('waterHeater'),
    shower: g('shower'), ac: g('ac'), washing: g('washing'),
    dishwasher: g('dishwasher'), microwave: g('microwave'),
    pump: g('pump'), custom1: g('custom1_kw'), custom2: g('custom2_kw')
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP NAVIGATION
// ═══════════════════════════════════════════════════════════════════
let currentStep = 1;
function goStep(n) {
  // Sync room data before leaving step 2/3
  if (currentStep === 2) state.rooms.forEach(r => syncRoomData(r.id));
  if (currentStep === 3) state.rooms.forEach(r => syncLoad(r.id));

  document.querySelectorAll('.step-page').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step-btn').forEach((b, i) => {
    b.classList.remove('active', 'done');
    if (i + 1 === n) b.classList.add('active');
    else if (i + 1 < n) b.classList.add('done');
  });
  currentStep = n;

  if (n === 2) { renderRooms(); }
  if (n === 3) { state.rooms.forEach(r => syncRoomData(r.id)); renderLoadSelection(); }
  if (n === 4) { renderResults(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSupplyType() {
  const t = getSetting('s_type');
  const vEl = document.getElementById('s_voltage');
  if (t === 'three') {
    vEl.value = '400';
  } else {
    vEl.value = '230';
  }
}

function updateFloorCount() {
  const n = getNum('b_floors', 1);
  document.getElementById('b_sub_db').checked = n > 1;
  renderRooms();
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CALCULATIONS ENGINE
// ═══════════════════════════════════════════════════════════════════
function runCalculations() {
  state.rooms.forEach(r => syncLoad(r.id));
  state.rooms.forEach(r => syncRoomData(r.id));
  goStep(4);
}

function calcRoomLoads(room) {
  const l = room.loads.lighting;
  const s = room.loads.sockets;
  const a = room.loads.appliances;

  // Lighting watts
  const lightingW =
    l.ledQty * l.ledWatt + l.spots * 7 + l.chandelier * l.chandelierWatt +
    l.outdoor * 20 + l.emergency * 3 + l.fans * 75;

  // Socket load — 300W per 13A socket (IEC 60364-4 diversity allowance)
  const socketW = s.std13A * 300 + s.usb * 50 + (s.fridge ? 200 : 0) +
                  (s.outdoor || 0) * 300 + (s.garage || 0) * 300;

  // Heavy appliances (all in watts)
  const cookerW     = a.cooker     * 1000;
  const ovenW       = (a.oven      || 0) * 1000;
  const waterW      = a.waterHeater * 1000;
  const showerW     = a.shower     * 1000;
  const acW         = a.ac         * 1000;
  const washingW    = a.washing    * 1000;
  const dishwasherW = (a.dishwasher || 0) * 1000;
  const microwaveW  = a.microwave  * 1000;
  const pumpW       = a.pump       * 1000;
  const custom1W    = (a.custom1   || 0) * 1000;
  const custom2W    = (a.custom2   || 0) * 1000;

  const heavyW = cookerW + ovenW + waterW + showerW + acW + washingW +
                 dishwasherW + microwaveW + pumpW + custom1W + custom2W;

  return {
    lightingW, socketW, cookerW, ovenW, waterW, showerW, acW,
    washingW, dishwasherW, microwaveW, pumpW, heavyW,
    totalW: lightingW + socketW + heavyW,
    details: { l, s, a }
  };
}

function applyDiversity(loads, voltage) {
  if (!voltage || voltage <= 0) voltage = 230;
  let div = 0;
  // Lighting: 90% diversity (IEC 60364 Table 4A)
  div += loads.lightingW * 0.90;
  // Sockets: 75% diversity for general radial circuits
  div += loads.socketW * 0.75;
  // Cooker diversity (BS 7671 Table 4B): first 10A full + 30% remainder
  if (loads.cookerW > 0) {
    const cookerA = loads.cookerW / voltage;
    const first10 = Math.min(cookerA, 10) * voltage;
    const rest    = Math.max(0, cookerA - 10) * voltage * 0.30;
    div += first10 + rest;
  }
  // Oven: 100% (typically runs continuously when on, thermostatic but not diversity-reducible)
  div += (loads.ovenW || 0) * 1.0;
  // Water heater / shower: resistive, 100%
  div += loads.waterW * 1.0;
  div += loads.showerW * 1.0;
  // AC: motor load, 100% diversity + PF correction (apparent power = real / PF)
  div += (loads.acW > 0) ? (loads.acW / 0.85) : 0;
  // Washing machine: 75%
  div += loads.washingW * 0.75;
  // Dishwasher: 75%
  div += (loads.dishwasherW || 0) * 0.75;
  // Microwave: 75%
  div += loads.microwaveW * 0.75;
  // Pump: motor load, 100% + PF correction
  div += (loads.pumpW > 0) ? (loads.pumpW / 0.85) : 0;
  // Custom: 75%
  const custom1W = (loads.details?.a?.custom1 || 0) * 1000;
  const custom2W = (loads.details?.a?.custom2 || 0) * 1000;
  div += (custom1W + custom2W) * 0.75;
  return div;
}

function buildCircuits(room, voltage, installType, temp, circuitsInConduit) {
  const lo = room.loads;
  const l = lo.lighting;
  const s = lo.sockets;
  const a = lo.appliances;
  const circuits = [];
  let cktNum = 1;
  const V = (voltage === 400) ? 230 : (voltage || 230);

  // ── Cable grouping derating (Fix 9) ──────────────────────────────
  // circuitsInConduit = total circuits sharing same conduit run (estimated from total)
  const gf = getGroupingFactor(circuitsInConduit || 1);

  function selectCableAndMCB(amps, isMotor, forceCable, forceMCB) {
    // Fix 2: Only motor loads use 1.25× multiplier for cable sizing.
    // Resistive loads (heaters, lighting, sockets) size cable directly for operating current.
    const cableSizingAmps = isMotor ? (amps * 1.25) : amps;

    // Apply grouping derating: cable must carry current even when derated
    const deRatedReq = cableSizingAmps / gf;

    let cable = forceCable || null;
    if (!cable) {
      for (const sz of [1.5, 2.5, 4, 6, 10, 16, 25, 35]) {
        const iz = getAmpacity(sz, installType) * getTempFactor(temp) * gf;
        if (iz >= cableSizingAmps) { cable = sz; break; }
      }
      cable = cable || 35;
    }

    // Enforce cable→MCB binding
    const iz = getAmpacity(cable, installType) * getTempFactor(temp) * gf;
    const map = CABLE_MCB_MAP[cable];
    let mcbA;
    if (forceMCB) {
      mcbA = forceMCB <= iz ? forceMCB : (map ? map.max : forceMCB);
    } else if (map) {
      mcbA = map.permitted.filter(r => r <= iz).slice(-1)[0] || map.permitted[0];
    } else {
      mcbA = nextMCB(cableSizingAmps);
    }

    // Fix 7: Motor starting current check
    // Curve C MCB handles up to 10× In inrush. For DOL motors (6× FLC):
    // Verify: In (MCB) × 10 ≥ startingCurrent = FLC × MOTOR_START_FACTOR
    // i.e. In ≥ FLC × 6 / 10 = 0.6 × FLC
    // Since our MCB ≥ 1.25 × FLC already, and 1.25 > 0.6 → always satisfied for Curve C.
    // But flag if starting current would exceed 10× MCB (i.e. motor FLC > 1.67 × In):
    let startingCurrentWarning = null;
    if (isMotor) {
      const startI = amps * MOTOR_START_FACTOR; // 6× FLC starting
      if (startI > mcbA * 10) {
        startingCurrentWarning = `Starting current ${startI.toFixed(1)}A may cause nuisance tripping on ${mcbA}A Curve C MCB. Consider Curve D or soft starter.`;
      }
    }

    return { cable, mcbA, startingCurrentWarning };
  }

  const makeCircuit = (name, type, watts, maxVD, forceCable, forceMCB, lightPoints) => {
    if (!watts || watts <= 0) return null;
    const isMotor = MOTOR_TYPES.has(type);
    const pf    = LOAD_PF[type] || 1.0;
    // True operating current
    const amps  = watts / (V * pf);
    const distM = room.distanceFromDB;

    let { cable, mcbA, startingCurrentWarning } = selectCableAndMCB(amps, isMotor, forceCable, forceMCB);

    // Fix 4: Total VD = feeder VD (meter→DB) + final circuit VD (DB→point of use)
    // We have meterDist stored per doFullCalc. For circuit-level check, use distM only,
    // but store feederVDpct for totaling in doFullCalc.
    cable = autoUpsizeCable(cable, amps, distM, V, maxVD, installType, temp, false);

    // Re-validate MCB after VD upsize
    const newIz = getAmpacity(cable, installType) * getTempFactor(temp) * gf;
    const newMap = CABLE_MCB_MAP[cable];
    if (newMap && mcbA > newIz) {
      mcbA = newMap.permitted.filter(r => r <= newIz).slice(-1)[0] || newMap.permitted[0];
    }

    const circuitVDpct = calcVDpercent(cable, amps, distM, V, false);

    // Fix 5 & 10: Clear protection labeling
    // Determine protection device type unambiguously:
    const isSocket   = (type === 'socket'  || type === 'outdoor_socket' || type === 'garage_socket');
    const needsRCBO  = (type === 'heavy'   || type === 'ac' || type === 'shower' ||
                        type === 'pump'    || type === 'oven' || type === 'dishwasher' || type === 'washing');
    const needsRCD   = isSocket;
    // Protection device label:
    // RCBO = combined MCB+RCD in one unit (heavy/motor dedicated circuits)
    // RCBO (socket) = socket circuit gets its own RCBO for maximum discrimination
    // MCB = lighting and non-protected circuits (backed by main RCD)
    let deviceLabel, deviceType;
    if (needsRCBO) {
      deviceLabel = `RCBO ${mcbA}A/30mA Type A, Curve C — ${name}`;
      deviceType  = 'RCBO';
    } else if (needsRCD) {
      deviceLabel = `RCBO ${mcbA}A/30mA Type A, Curve C — ${name}`;
      deviceType  = 'RCBO';
    } else {
      deviceLabel = `MCB ${mcbA}A Curve C — ${name} (protected by main 30mA RCD)`;
      deviceType  = 'MCB';
    }

    const mcbCurve = 'C'; // Residential: Curve C only

    return {
      id: cktNum++, room: room.name, name, type, watts,
      amps: +amps.toFixed(2),
      designAmps: +(isMotor ? amps * 1.25 : amps).toFixed(2),
      cable, mcbA, mcbCurve, distM,
      circuitVDpct: +circuitVDpct.toFixed(2),
      vdPct: +circuitVDpct.toFixed(2), // kept for compatibility
      needsRCD, needsRCBO, deviceType, deviceLabel,
      lightPoints: lightPoints || null,
      pf, isMotor,
      startingCurrentWarning
    };
  };

  // ── LIGHTING (Fix 1) ─────────────────────────────────────────────
  // Primary split criterion: lighting POINTS (not just watts).
  // Max 12 points per circuit. Also check watts limit (1200W / 10A circuit).
  const lightW = l.ledQty * l.ledWatt + l.spots * 7 + l.chandelier * l.chandelierWatt +
                 l.outdoor * 20 + l.emergency * 3 + l.fans * 75;
  const lightPoints = l.ledQty + l.spots + l.chandelier + l.outdoor + l.fans + l.emergency;
  if (lightW > 0 || lightPoints > 0) {
    const byPoints = Math.ceil(lightPoints / 12);       // max 12 points per circuit
    const byWatts  = Math.ceil(lightW / 1200);          // 10A × 230V × ~52% = 1200W limit
    const lightCircuits = Math.max(byPoints, byWatts, 1);
    const wEach    = lightW / lightCircuits;
    const ptEach   = Math.ceil(lightPoints / lightCircuits);
    for (let i = 0; i < lightCircuits; i++) {
      const forcedMCB = wEach <= 800 ? 6 : 10;
      const c = makeCircuit(
        `${room.name} Lighting L${i + 1}`, 'lighting', wEach, 3, 1.5, forcedMCB,
        ptEach
      );
      if (c) circuits.push(c);
    }
  }

  // ── SOCKETS ──────────────────────────────────────────────────────
  // Max 8 outlets per circuit; 2.5mm²/16A RCBO each
  if (s.std13A > 0) {
    const sockCircuits = Math.max(1, Math.ceil(s.std13A / 8));
    const totalW = s.std13A * 300 + s.usb * 50;
    const wEach = totalW / sockCircuits;
    for (let i = 0; i < sockCircuits; i++) {
      const c = makeCircuit(`${room.name} Sockets S${i + 1}`, 'socket', wEach, 5, 2.5, 16);
      if (c) circuits.push(c);
    }
  }
  // Dedicated fridge: 2.5mm²/16A RCBO (fridge has compressor motor — motor starting applies)
  if (s.fridge) {
    const c = makeCircuit(`${room.name} Fridge (Dedicated)`, 'ac', 200, 5, 2.5, 16);
    if (c) circuits.push(c);
  }
  // Fix 8: Outdoor sockets — IP44, dedicated circuit, 30mA RCBO mandatory
  if ((s.outdoor || 0) > 0) {
    const c = makeCircuit(`${room.name} Outdoor Sockets`, 'outdoor_socket', s.outdoor * 300, 5, 2.5, 16);
    if (c) circuits.push(c);
  }
  // Fix 8: Garage sockets — dedicated circuit (tool loads can be heavy)
  if ((s.garage || 0) > 0) {
    const c = makeCircuit(`${room.name} Garage Sockets`, 'garage_socket', s.garage * 300, 5, 2.5, 16);
    if (c) circuits.push(c);
  }

  // ── WATER HEATER ─────────────────────────────────────────────────
  if (a.waterHeater > 0) {
    const whW = a.waterHeater * 1000;
    const whI = whW / V;
    const cable = whI <= 20 ? 4 : 6;
    const mcb   = whI <= 20 ? 20 : 25;
    const c = makeCircuit(`${room.name} Water Heater`, 'heavy', whW, 5, cable, mcb);
    if (c) circuits.push(c);
  }

  // ── COOKER ───────────────────────────────────────────────────────
  if (a.cooker > 0) {
    const ckW = a.cooker * 1000; const ckI = ckW / V;
    const cable = ckI <= 20 ? 4 : ckI <= 25 ? 6 : 10;
    const mcb   = ckI <= 20 ? 20 : ckI <= 25 ? 25 : 32;
    const c = makeCircuit(`${room.name} Cooker/Hob`, 'heavy', ckW, 5, cable, mcb);
    if (c) circuits.push(c);
  }

  // Fix 8: Built-in oven (separate from hob, dedicated circuit)
  if ((a.oven || 0) > 0) {
    const ovW = a.oven * 1000; const ovI = ovW / V;
    const cable = ovI <= 20 ? 4 : 6;
    const mcb   = ovI <= 20 ? 20 : 25;
    const c = makeCircuit(`${room.name} Built-in Oven`, 'oven', ovW, 5, cable, mcb);
    if (c) circuits.push(c);
  }

  // ── ELECTRIC SHOWER ──────────────────────────────────────────────
  if (a.shower > 0) {
    const shW = a.shower * 1000; const shI = shW / V;
    const cable = shI <= 20 ? 4 : shI <= 25 ? 6 : 10;
    const mcb   = shI <= 20 ? 20 : shI <= 25 ? 25 : shI <= 32 ? 32 : 40;
    const c = makeCircuit(`${room.name} Electric Shower`, 'shower', shW, 5, cable, mcb);
    if (c) circuits.push(c);
  }

  // ── AIR CONDITIONER (motor) ───────────────────────────────────────
  if (a.ac > 0) {
    const acW = a.ac * 1000;
    const acI = acW / (V * 0.85); // true current with PF
    const cable = acI <= 12.8 ? 2.5 : acI <= 20 ? 4 : 6;
    const mcb   = acI <= 12.8 ? 16  : acI <= 20 ? 20 : 25;
    const c = makeCircuit(`${room.name} Air Conditioner`, 'ac', acW, 5, cable, mcb);
    if (c) circuits.push(c);
  }

  // ── WASHING MACHINE ──────────────────────────────────────────────
  if (a.washing > 0) {
    const c = makeCircuit(`${room.name} Washing Machine`, 'washing', a.washing * 1000, 5, 4, 20);
    if (c) circuits.push(c);
  }

  // Fix 8: Dishwasher — dedicated circuit (water + heat load)
  if ((a.dishwasher || 0) > 0) {
    const c = makeCircuit(`${room.name} Dishwasher`, 'dishwasher', a.dishwasher * 1000, 5, 4, 20);
    if (c) circuits.push(c);
  }

  // ── MICROWAVE ────────────────────────────────────────────────────
  if (a.microwave > 0) {
    const c = makeCircuit(`${room.name} Microwave`, 'heavy', a.microwave * 1000, 5, 2.5, 16);
    if (c) circuits.push(c);
  }

  // ── PUMP (motor) ─────────────────────────────────────────────────
  if (a.pump > 0) {
    const pmpW = a.pump * 1000;
    const pmpI = pmpW / (V * 0.85);
    const cable = pmpI <= 12.8 ? 2.5 : 4;
    const mcb   = pmpI <= 12.8 ? 16  : 20;
    const c = makeCircuit(`${room.name} Pump`, 'pump', pmpW, 5, cable, mcb);
    if (c) circuits.push(c);
  }

  // ── CUSTOM APPLIANCES ────────────────────────────────────────────
  if ((a.custom1 || 0) > 0) {
    const c = makeCircuit(`${room.name} Appliance 1`, 'heavy', a.custom1 * 1000, 5, 2.5, 16);
    if (c) circuits.push(c);
  }
  if ((a.custom2 || 0) > 0) {
    const c = makeCircuit(`${room.name} Appliance 2`, 'heavy', a.custom2 * 1000, 5, 2.5, 16);
    if (c) circuits.push(c);
  }

  return circuits;
}


function calcWireLength(room, installType) {
  const L = room.length, W = room.width, H = room.height || 2.8;
  const perim = 2 * (L + W);
  const dist = room.distanceFromDB;

  // Lighting: perimeter × 1.2 + vertical drops
  const lightRun = perim * 1.2 + H * (room.loads.lighting.ledQty + room.loads.lighting.spots + room.loads.lighting.chandelier + room.loads.lighting.fans) * 0.5 + dist;
  // Socket: perimeter × 1.1 + vertical drops
  const sockCount = room.loads.sockets.std13A + room.loads.sockets.usb + (room.loads.sockets.fridge ? 1 : 0);
  const sockRun = perim * 1.1 + sockCount * 0.4 + dist;
  // Heavy: direct run × 2 (twin) + some routing
  const heavyRun = dist * 1.2 + H;

  const totalBase = lightRun + sockRun;
  const withWastage = totalBase * 1.15;
  return { lightM: lightRun, sockM: sockRun, heavyM: heavyRun, totalM: withWastage };
}

function doFullCalc() {
  const voltage     = getNum('s_voltage', 230);
  const installType = getSetting('s_install') || 'conduit';
  const temp        = getNum('s_temp', 30);
  const meterDist   = getNum('s_meter_dist', 5);
  const earthing    = getSetting('s_earth') || 'TN-C-S';
  const supplyType  = getSetting('s_type') || 'single';
  const maxDemand   = getNum('s_max_demand', 100);

  // First pass: count total circuits to estimate grouping derating
  // (shared conduit from DB outward — conservatively assume all cables share conduit)
  const totalCircuitEstimate = state.rooms.reduce((sum, r) => {
    const l = r.loads.lighting, s = r.loads.sockets, a = r.loads.appliances;
    const lightPts = l.ledQty + l.spots + l.chandelier + l.outdoor + l.fans;
    return sum +
      Math.max(1, Math.ceil(lightPts / 12)) +
      Math.max(1, Math.ceil(s.std13A / 8)) +
      (s.fridge ? 1 : 0) + (s.outdoor ? 1 : 0) + (s.garage ? 1 : 0) +
      (a.cooker > 0 ? 1 : 0) + (a.oven > 0 ? 1 : 0) +
      (a.waterHeater > 0 ? 1 : 0) + (a.shower > 0 ? 1 : 0) +
      (a.ac > 0 ? 1 : 0) + (a.washing > 0 ? 1 : 0) +
      (a.dishwasher > 0 ? 1 : 0) + (a.pump > 0 ? 1 : 0);
  }, 0);
  // Grouping: cables leaving DB share conduit for first few metres — use actual count
  const circuitsInConduit = Math.min(totalCircuitEstimate, 9);

  let totalConnectedW = 0, totalDiversifiedW = 0;
  const allCircuits = [];
  const wireLengths = { 1.5: 0, 2.5: 0, 4: 0, 6: 0, 10: 0, 16: 0, 25: 0, 35: 0 };
  const warnings    = [];

  state.rooms.forEach(room => {
    const loads = calcRoomLoads(room);
    const divW  = applyDiversity(loads, voltage);
    totalConnectedW   += loads.totalW;
    totalDiversifiedW += divW;
    const ckts = buildCircuits(room, voltage, installType, temp, circuitsInConduit);
    allCircuits.push(...ckts);
    const wl = calcWireLength(room, installType);
    ckts.forEach(c => {
      const sz  = c.cable;
      const key = sz <= 1.5 ? 1.5 : sz <= 2.5 ? 2.5 : sz <= 4 ? 4 : sz <= 6 ? 6 : sz <= 10 ? 10 : sz <= 16 ? 16 : sz <= 25 ? 25 : 35;
      if (c.type === 'lighting')     wireLengths[key] = (wireLengths[key] || 0) + wl.lightM;
      else if (c.type === 'socket' || c.type === 'outdoor_socket' || c.type === 'garage_socket')
                                     wireLengths[key] = (wireLengths[key] || 0) + wl.sockM;
      else                           wireLengths[key] = (wireLengths[key] || 0) + wl.heavyM * 2;
    });
  });

  const designW = totalDiversifiedW * 1.15; // 15% spare capacity

  // Supply current
  let designA;
  if (supplyType === 'three' || voltage === 400) {
    designA = designW / (400 * Math.sqrt(3) * 0.9);
  } else {
    designA = designW / voltage;
  }

  // Fix 3: Main breaker — 63A, 80A, or 100A only for residential single-phase
  // (80A is a standard size used in many markets; added here)
  let mainBreakerStd;
  if (designA * 1.25 <= 63)       mainBreakerStd = 63;
  else if (designA * 1.25 <= 80)  mainBreakerStd = 80;
  else                             mainBreakerStd = 100;

  // Main supply cable
  const mainCableSize = autoUpsizeCable(
    selectCableForLoad(designA, 'free-air', temp),
    designA, meterDist, voltage, 1.5, 'free-air', temp
  );

  // Earth conductor (IEC 60364-5-54 Table 54.1)
  let rawEarth;
  if (mainCableSize <= 16) rawEarth = mainCableSize;
  else if (mainCableSize <= 35) rawEarth = 16;
  else rawEarth = mainCableSize / 2;
  const earthCableSize = CABLE_SIZES.find(s => s >= Math.max(6, rawEarth)) || 95;

  // Feeder voltage drop (meter → DB)
  const feederVDpct = calcVDpercent(mainCableSize, designA, meterDist, voltage);

  // Fix 4: Total VD check = feederVD + circuitVD for each circuit
  // IEC 60364-5-52 cl.525: total from origin to furthest point
  allCircuits.forEach(c => {
    const totalVD = feederVDpct + c.circuitVDpct;
    const limit   = c.type === 'lighting' ? 3 : 5;
    if (totalVD > limit) {
      warnings.push({
        type: 'warn',
        msg: `Circuit "${c.name}": Total VD ${totalVD.toFixed(2)}% (feeder ${feederVDpct.toFixed(2)}% + circuit ${c.circuitVDpct.toFixed(2)}%) exceeds ${limit}% limit. Increase cable to next size.`
      });
    }
  });

  // Fix 6: Earthing — earth resistance targets, not just rod length
  // IEC 60364-4-41 / IEC 60364-5-54:
  //   TT system:    Ra ≤ 50 / I∆n = 50 / 0.03 = 1666Ω (but practical target ≤ 100Ω)
  //   TN-S system:  Ra ≤ 1Ω (bonded to supply neutral)
  //   TN-C-S (PME): Ra ≤ 1Ω, main protective bonding required
  const earthRodLength = earthing === 'TT' ? 3 : 2;
  const earthResTarget = earthing === 'TT' ? '≤ 100Ω (IEC 60364-4-41: Ra ≤ 50/I∆n = 1666Ω, practical target ≤ 100Ω)' :
                         earthing === 'TN-S' ? '≤ 1Ω (bonded to supply neutral)' :
                         '≤ 1Ω (PME — main equipotential bonding required)';

  if (designA > maxDemand) {
    warnings.push({ type: 'error', msg: `Demand ${designA.toFixed(1)}A exceeds meter limit ${maxDemand}A. Load reduction or upgrade required.` });
  }
  if (designA * 1.25 > 100 && supplyType === 'single') {
    warnings.push({ type: 'error', msg: `Total demand ${designA.toFixed(1)}A exceeds 100A single-phase maximum. Consider load reduction or three-phase supply.` });
  }
  if (feederVDpct > 1.5) {
    warnings.push({ type: 'warn', msg: `Feeder VD ${feederVDpct.toFixed(2)}% is high — leaves only ${(3 - feederVDpct).toFixed(2)}% budget for lighting circuits. Consider upsizing supply cable.` });
  }

  // Cable→MCB compliance check
  allCircuits.forEach(c => {
    const iz = getAmpacity(c.cable, installType) * getTempFactor(temp);
    if (c.mcbA > iz) {
      warnings.push({ type: 'error', msg: `Circuit "${c.name}": MCB ${c.mcbA}A > cable ${c.cable}mm² Iz (${iz.toFixed(1)}A). Cable must be upsized.` });
    }
    if (c.startingCurrentWarning) {
      warnings.push({ type: 'warn', msg: `Motor circuit "${c.name}": ${c.startingCurrentWarning}` });
    }
  });

  // Fix 5: RCD coordination — split-load board model
  // Two RCDs on split-load board OR individual RCBOs per circuit.
  // Here we count: RCBOs for all heavy/motor/shower circuits (individual protection).
  // Socket circuits get either group RCD + MCB, or individual RCBOs.
  // Recommendation: use split-load board with 2× 63A/30mA RCDs for socket groups.
  const rcboCircuits   = allCircuits.filter(c => c.deviceType === 'RCBO');
  const mcbCircuits    = allCircuits.filter(c => c.deviceType === 'MCB');
  const socketRCBOs    = allCircuits.filter(c => c.type === 'socket' || c.type === 'outdoor_socket' || c.type === 'garage_socket');
  // For split-load board: all socket/lighting circuits → 2 group RCDs (one per half-board)
  // Group 1: lighting circuits (MCB + main RCD)
  // Group 2: socket circuits (MCB + second RCD) OR individual RCBOs
  const groupRCDCount  = 2; // split-load: 2× 63A/30mA Type A RCDs
  const rcboCount      = rcboCircuits.length;

  const totalWays = allCircuits.length + 4; // +4 spare
  const dbWays = [8, 12, 16, 20, 24, 32, 40].find(w => w >= totalWays) || 40;

  const materials = buildMaterialList(
    allCircuits, wireLengths, mainCableSize, earthCableSize,
    dbWays, mainBreakerStd, earthRodLength, earthing,
    groupRCDCount, earthResTarget
  );

  return {
    voltage, installType, temp, meterDist, earthing, supplyType,
    totalConnectedW, totalDiversifiedW, designW, designA,
    mainBreakerA: mainBreakerStd, mainCableSize, earthCableSize,
    feederVDpct: +feederVDpct.toFixed(2), mainVD: +feederVDpct.toFixed(2),
    earthRodLength, earthResTarget,
    allCircuits, wireLengths, warnings, materials, dbWays,
    groupRCDCount, rcboCount, mcbCount: allCircuits.length,
    spd: getSetting('p_spd_type') || '2',
    circuitsInConduit,
    groupingFactor: getGroupingFactor(circuitsInConduit)
  };
}

function buildMaterialList(circuits, wireLengths, mainCable, earthCable, dbWays, mainBreaker, earthRodLen, earthing, groupRCDCount, earthResTarget) {
  const install = getSetting('s_install') || 'conduit';
  const mat = {};
  const add = (cat, item, qty, unit, spec = '') => {
    if (!mat[cat]) mat[cat] = [];
    mat[cat].push({ item, qty: Math.ceil(qty), unit, spec });
  };

  // CABLES
  const toYd = (m) => Math.ceil(metersToYards(m) * 1.15);
  [1.5, 2.5, 4, 6, 10, 16, 25, 35].forEach(sz => {
    const m = wireLengths[sz] || 0;
    if (m > 0) add('CABLES', `${sz}mm² Twin & Earth Cable`, toYd(m), 'yards', 'Copper, 230V, Thermoplastic');
  });
  add('CABLES', `${mainCable}mm² Single Core SWA Cable`, toYd(getNum('s_meter_dist', 5) * 3), 'yards', 'Armoured, Utility to DB');
  add('CABLES', `${Math.max(6, earthCable)}mm² Green/Yellow Earth Cable`, toYd(20), 'yards', 'Main earthing conductor');
  add('CABLES', '4mm² Green/Yellow Earth Cable', toYd(15), 'yards', 'Supplementary bonding');

  // MAIN PROTECTION
  add('MAIN PROTECTION', 'Utility Meter Tails', 2, 'set', `${mainCable}mm²`);
  add('MAIN PROTECTION', `Main Isolator — ${mainBreaker}A DP Switch`, 1, 'unit', `${mainBreaker}A Double Pole, emergency disconnect`);
  add('MAIN PROTECTION', `Main MCB — ${mainBreaker}A Curve C`, 1, 'unit', `${mainBreaker}A, Curve C, 10kA breaking capacity`);
  add('MAIN PROTECTION', `SPD Type ${getSetting('p_spd_type') || '2'} — with dedicated MCB`, 1, 'unit', '40kA Class II, dedicated 6A MCB, one DB way');

  // Fix 5: RCD coordination — split-load board with 2 group RCDs
  // Recommendation: split-load consumer unit with 2× 63A/30mA Type A RCDs
  // Group A (left): lighting + general MCBs under RCD 1
  // Group B (right): socket MCBs + dedicated appliance RCBOs under RCD 2
  add('MAIN PROTECTION', `RCD Group A — 63A/30mA Type A (Split-load half 1)`, 1, 'unit', '30mA, Type A — lighting + general circuits');
  add('MAIN PROTECTION', `RCD Group B — 63A/30mA Type A (Split-load half 2)`, 1, 'unit', '30mA, Type A — sockets + dedicated circuits');

  // DISTRIBUTION BOARD
  add('DISTRIBUTION BOARD', `Split-Load Consumer Unit / DB — ${dbWays}-way`, 1, 'unit', `Metal, ${dbWays}-way, DIN rail, dual RCD split-load`);
  add('DISTRIBUTION BOARD', 'DIN Rail', 2, 'meter', '35mm');
  add('DISTRIBUTION BOARD', 'Neutral Bar (Main)', 1, 'unit', '24-way insulated busbar — N');
  add('DISTRIBUTION BOARD', 'Earth Bar (PE)', 1, 'unit', '24-way busbar — PE (green/yellow)');
  add('DISTRIBUTION BOARD', 'Phase Busbar Linker', 1, 'set', 'Live distribution link');

  // Fix 10: MCBs — clearly labeled by type and function
  const mcbGroups = {};
  circuits.forEach(c => {
    if (c.deviceType === 'MCB') {
      const k = `MCB ${c.mcbA}A Curve C`;
      mcbGroups[k] = (mcbGroups[k] || 0) + 1;
    }
  });
  Object.entries(mcbGroups).forEach(([k, qty]) => {
    add('MCBs & RCBOs', k, qty, 'unit', '6kA/10kA breaking capacity — backed by group RCD');
  });

  // Fix 10: RCBOs — clearly labeled per circuit
  circuits.filter(c => c.deviceType === 'RCBO').forEach(c => {
    add('MCBs & RCBOs', `RCBO ${c.mcbA}A/30mA Type A Curve C`, 1, 'unit', `${c.name} — self-contained MCB+RCD`);
  });

  // EARTHING — Fix 6: include earth resistance target
  if (earthing === 'TT' || earthing === 'TN-S') {
    add('EARTHING', `Earth Rod (${earthRodLen}m)`, 2, 'unit', 'Copper-clad Steel, 16mm dia');
    add('EARTHING', 'Earth Rod Clamp', 2, 'unit', 'Copper, 16mm');
    add('EARTHING', 'Earth Pit Inspection Cover', 1, 'unit', '300×300mm Concrete');
    add('EARTHING', 'Earth Resistance Test (on completion)', 1, 'test', earthResTarget || '≤ 100Ω for TT system');
  }
  add('EARTHING', 'Main Earth Terminal Bar (MET)', 1, 'unit', 'Brass, 25mm² — connects DB earth bar to earthing system');
  add('EARTHING', 'Main Equipotential Bonding Clamps', 4, 'unit', 'Gas pipe, water pipe, structural steel, building frame');
  add('EARTHING', 'Earth Electrode Inspection Box', 1, 'unit', 'Plastic, UV resistant');
  add('EARTHING', 'Anti-corrosion Tape (buried conductors)', 1, 'roll', 'For buried earth conductors');

  // CONDUIT
  if (install === 'conduit' || install === 'trunking') {
    const totalConLen = Object.values(wireLengths).reduce((a, b) => a + b, 0) * 0.3;
    const conduitYd = toYd(totalConLen);
    add('CONDUIT & TRUNKING', '20mm PVC Conduit', Math.ceil(conduitYd * 0.6), 'yards', 'Concealed wiring runs');
    add('CONDUIT & TRUNKING', '25mm PVC Conduit', Math.ceil(conduitYd * 0.4), 'yards', 'Heavy circuit routes');
    add('CONDUIT & TRUNKING', 'Conduit Junction Boxes (Round)', Math.ceil(circuits.length * 1.5), 'units', 'Junction/switch boxes');
    add('CONDUIT & TRUNKING', 'Conduit Back Boxes (Rectangular)', circuits.length, 'units', 'Socket/light fitting boxes');
    add('CONDUIT & TRUNKING', '20mm Conduit Saddles', Math.ceil(conduitYd * 3), 'units', '300mm spacing per IEC');
    add('CONDUIT & TRUNKING', '25mm Conduit Saddles', Math.ceil(conduitYd * 2), 'units');
    add('CONDUIT & TRUNKING', '20mm Conduit Elbows', Math.ceil(conduitYd * 0.5), 'units');
    add('CONDUIT & TRUNKING', '20mm Conduit Tees', Math.ceil(conduitYd * 0.3), 'units');
    add('CONDUIT & TRUNKING', 'Conduit Solvent / Glue', 2, 'cans', '250ml');
  }
  if (install === 'trunking') {
    add('CONDUIT & TRUNKING', '50×50mm Cable Trunking', toYd(Object.values(wireLengths).reduce((a, b) => a + b, 0) * 0.2), 'yards');
    add('CONDUIT & TRUNKING', 'Trunking Accessories Set', 1, 'set', 'Corners, tees, end caps');
  }

  // ACCESSORIES
  const totalSockets  = state.rooms.reduce((a, r) => a + r.loads.sockets.std13A + r.loads.sockets.usb + (r.loads.sockets.fridge ? 1 : 0), 0);
  const totalSwitches = state.rooms.reduce((a, r) => a + Math.ceil((r.loads.lighting.ledQty + r.loads.lighting.fans) / 2 + r.loads.lighting.spots / 4), 0);
  const totalFans     = state.rooms.reduce((a, r) => a + r.loads.lighting.fans, 0);

  add('WIRING ACCESSORIES', '13A Single Socket Outlet', Math.ceil(totalSockets * 0.4), 'units', 'White, switched, BS 1363');
  add('WIRING ACCESSORIES', '13A Twin Socket Outlet', Math.ceil(totalSockets * 0.3), 'units', 'White, switched, BS 1363');
  add('WIRING ACCESSORIES', '13A Triple Socket Outlet', Math.ceil(totalSockets * 0.1), 'units');
  add('WIRING ACCESSORIES', 'USB-A/C Charger Socket', state.rooms.reduce((a, r) => a + r.loads.sockets.usb, 0), 'units', '13A with dual USB 5V/3A');
  add('WIRING ACCESSORIES', 'IP44 Outdoor Socket Outlet', state.rooms.reduce((a, r) => a + (r.loads.sockets.outdoor || 0), 0), 'units', 'Weatherproof, switched');
  add('WIRING ACCESSORIES', '1-Gang 1-Way Light Switch', Math.ceil(totalSwitches * 0.5), 'units', 'White, 10A');
  add('WIRING ACCESSORIES', '2-Gang 1-Way Light Switch', Math.ceil(totalSwitches * 0.3), 'units', 'White, 10A');
  add('WIRING ACCESSORIES', '2-Gang 2-Way Light Switch', Math.ceil(totalSwitches * 0.2), 'units', '2-way switching (stairs/halls)');
  add('WIRING ACCESSORIES', 'Fan Speed Controller', totalFans, 'units', '3-speed rotary');
  add('WIRING ACCESSORIES', 'Cooker Control Unit (45A DP)', circuits.filter(c => c.name.includes('Cooker')).length, 'units', '45A DP switch with neon indicator');
  add('WIRING ACCESSORIES', 'Fused Connection Unit (FCU)', circuits.filter(c => c.type === 'heavy' && c.watts <= 3000).length, 'units', '13A FCU, switched, with flex outlet');
  add('WIRING ACCESSORIES', 'TV Aerial Socket', state.rooms.reduce((a, r) => a + (r.loads.sockets.tv ? 1 : 0), 0), 'units', 'IEC coax + data');
  add('WIRING ACCESSORIES', 'Data RJ45 Socket (Cat6)', state.rooms.reduce((a, r) => a + (r.loads.sockets.tv ? 1 : 0), 0), 'units', 'Cat6 keystone');

  // FIXINGS
  add('FIXINGS & HARDWARE', 'M3.5 × 25mm Round Head Screws', 200, 'units', 'Accessory fixing');
  add('FIXINGS & HARDWARE', 'M4 × 50mm Wall Plugs', 100, 'units');
  add('FIXINGS & HARDWARE', 'Cable Ties 200mm UV-resistant', 2, 'bags', '100/bag');
  add('FIXINGS & HARDWARE', 'Cable Clips 5mm', 200, 'units', 'Flat twin & earth');
  add('FIXINGS & HARDWARE', 'Cable Clips 6mm', 100, 'units');
  add('FIXINGS & HARDWARE', 'Junction Box 30A (5-way)', Math.ceil(circuits.length * 0.5), 'units');
  add('FIXINGS & HARDWARE', 'Wago 5-way Lever Connectors', Math.ceil(circuits.length * 3), 'units', 'Pack of 25');
  add('FIXINGS & HARDWARE', 'Back Boxes Single 35mm (steel)', Math.ceil(totalSockets * 0.4 + totalSwitches * 0.7), 'units');
  add('FIXINGS & HARDWARE', 'Back Boxes Twin 35mm (steel)', Math.ceil(totalSockets * 0.4), 'units');

  // LABELS & SAFETY
  add('LABELS & SAFETY', 'Circuit Directory Card (DB schedule)', 1, 'unit', 'Identifies each way: device type, circuit name, rating');
  add('LABELS & SAFETY', 'Warning Labels — Danger 230V AC', 10, 'units', 'IEC 60417 standard');
  add('LABELS & SAFETY', 'RCD Monthly Test Reminder Label', groupRCDCount || 2, 'units', 'Press test button monthly');
  add('LABELS & SAFETY', 'Main Isolator Emergency Label', 1, 'unit', '"ISOLATE HERE IN EMERGENCY"');
  add('LABELS & SAFETY', 'Earth Electrode Warning Label', 2, 'units', '"DO NOT REMOVE — EARTH CONNECTION"');
  add('LABELS & SAFETY', 'As-Built Drawing Pouch (inside DB door)', 1, 'unit', 'Holds circuit schedule + SLD');
  add('LABELS & SAFETY', 'Electrical Installation Certificate (EIC)', 1, 'set', 'IEC 60364 completion documentation');

  return mat;
}

// ═══════════════════════════════════════════════════════════════════
// RESULTS RENDERING
// ═══════════════════════════════════════════════════════════════════
function renderResults() {
  const c = document.getElementById('results-container');
  c.innerHTML = '<div class="loader-ring" style="margin:60px auto"></div><div style="text-align:center;color:var(--tx2);margin:10px 0;font-family:\'Orbitron\',monospace;font-size:.85rem;letter-spacing:2px">RUNNING CALCULATIONS...</div>';

  setTimeout(() => {
    if (!state.rooms.length) {
      c.innerHTML = '<div class="sc"><div class="sc-body" style="text-align:center;padding:40px;color:var(--tx2)">No rooms found. Please go back and add rooms first.</div></div>';
      return;
    }
    const R = doFullCalc();
    state.results = R;

    const totalW_kw = (R.totalConnectedW / 1000).toFixed(2);
    const divW_kw = (R.totalDiversifiedW / 1000).toFixed(2);
    const designW_kw = (R.designW / 1000).toFixed(2);
    const totalYards = Object.values(R.wireLengths).reduce((a, m) => a + metersToYards(m), 0);

    const warnHTML = R.warnings.map(w =>
      w.type === 'error'
        ? `<div class="error-box"><span class="wi">🔴</span><p>${w.msg}</p></div>`
        : `<div class="warn-box"><span class="wi">⚠️</span><p>${w.msg}</p></div>`
    ).join('');

    const okHTML = R.warnings.length === 0
      ? `<div class="ok-box"><span class="wi">✅</span><p>All circuits comply with IEC 60364. No undersized cables or protection devices detected.</p></div>`
      : '';

    c.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <h2 style="font-family:'Orbitron',monospace;font-size:clamp(.75rem,3vw,1rem);color:var(--el);line-height:1.3;min-width:0">⚡ FULL ELECTRICAL DESIGN REPORT</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" onclick="window.print()">🖨 Print</button>
        <button class="btn btn-amber btn-sm" onclick="exportSVG()">↓ SVG</button>
        <button class="btn btn-success btn-sm" onclick="goStep(1)">✏ Edit</button>
      </div>
    </div>

    ${warnHTML}${okHTML}

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-val">${totalW_kw}</div><div class="stat-lbl">Connected Load</div><div class="stat-sub">kW Total</div></div>
      <div class="stat-card amber"><div class="stat-val">${divW_kw}</div><div class="stat-lbl">Diversified Load</div><div class="stat-sub">kW After Diversity</div></div>
      <div class="stat-card green"><div class="stat-val">${R.designA.toFixed(1)}A</div><div class="stat-lbl">Design Current</div><div class="stat-sub">+15% Spare Capacity</div></div>
      <div class="stat-card red"><div class="stat-val">${R.mainBreakerA}A</div><div class="stat-lbl">Main Breaker</div><div class="stat-sub">Recommended Rating</div></div>
      <div class="stat-card purple"><div class="stat-val">${R.mainCableSize}mm²</div><div class="stat-lbl">Main Supply Cable</div><div class="stat-sub">Meter → DB</div></div>
      <div class="stat-card amber"><div class="stat-val">${R.mainVD.toFixed(2)}%</div><div class="stat-lbl">Supply VD</div><div class="stat-sub">Voltage Drop</div></div>
      <div class="stat-card"><div class="stat-val">${Math.round(totalYards)}</div><div class="stat-lbl">Total Wire</div><div class="stat-sub">Yards (all circuits)</div></div>
      <div class="stat-card green"><div class="stat-val">${R.allCircuits.length}</div><div class="stat-lbl">Total Circuits</div><div class="stat-sub">In Design</div></div>
      <div class="stat-card"><div class="stat-val">${R.dbWays}</div><div class="stat-lbl">DB Size</div><div class="stat-sub">Ways Required</div></div>
    </div>

    <!-- TABS -->
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('circuits',this)">CIRCUITS</button>
      <button class="tab-btn" onclick="switchTab('materials',this)">MATERIAL LIST</button>
      <button class="tab-btn" onclick="switchTab('sld',this)">SINGLE LINE DIAGRAM</button>
      <button class="tab-btn" onclick="switchTab('dblayout',this)">DB LAYOUT</button>
      <button class="tab-btn" onclick="switchTab('earthing',this)">EARTHING</button>
      <button class="tab-btn" onclick="switchTab('protection',this)">PROTECTION HIERARCHY</button>
    </div>

    <!-- CIRCUIT TABLE -->
    <div class="tab-panel active" id="tab-circuits">
      <div class="sc">
        <div class="sc-hdr"><div class="ic">⚡</div><h2>CIRCUIT SCHEDULE</h2></div>
        <div class="sc-body" style="padding:0">
          <div class="tbl-wrap">
          <table>
            <thead><tr>
              <th>#</th><th>CIRCUIT NAME</th><th>TYPE</th><th>LOAD (W)</th>
              <th>CURRENT (A)</th><th>CABLE</th><th>MCB / PROT.</th>
              <th>LENGTH (m)</th><th>VD%</th><th>STATUS</th>
            </tr></thead>
            <tbody>
            ${R.allCircuits.map(c => `<tr>
              <td class="mono">${c.id}</td>
              <td>${c.name}</td>
              <td><span class="ckt-type ${c.type === 'lighting' ? 'ckt-light' : c.type === 'socket' ? 'ckt-sock' : c.type === 'ac' ? 'ckt-ac' : 'ckt-heavy'}">${c.type.toUpperCase()}</span></td>
              <td class="mono">${c.watts.toFixed(0)}</td>
              <td class="mono">${c.amps.toFixed(2)}</td>
              <td class="mono">${c.cable}mm²</td>
              <td class="mono">${c.needsRCBO ? `RCBO ${c.mcbA}A` : c.needsRCD ? `RCD+MCB ${c.mcbA}A` : `MCB ${c.mcbA}A`}</td>
              <td class="mono">${c.distM}</td>
              <td class="${c.vdPct > 5 ? 'err' : c.vdPct > 3 ? 'warn' : 'ok'}">${c.vdPct.toFixed(2)}%</td>
              <td><span class="pill ${c.vdPct > 5 ? 'pill-red' : c.vdPct > 3 ? 'pill-amber' : 'pill-green'}">${c.vdPct > 5 ? 'FAIL' : 'OK'}</span></td>
            </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      <!-- Supply Summary -->
      <div class="sc">
        <div class="sc-hdr"><div class="ic">🔌</div><h2>MAIN SUPPLY SUMMARY</h2></div>
        <div class="sc-body">
          <div class="fg fg-3">
            <div class="ssb">
              <div class="ssb-lbl">MAIN SUPPLY CABLE</div>
              <div class="ssb-val" style="color:var(--el)">${R.mainCableSize}mm² SWA</div>
              <div class="ssb-sub">Length: ${getNum('s_meter_dist', 5)}m (${metersToYards(getNum('s_meter_dist', 5)).toFixed(1)} yards)<br>Voltage drop: ${R.mainVD.toFixed(2)}% (max 1.5%)</div>
            </div>
            <div class="ssb">
              <div class="ssb-lbl">EARTHING SYSTEM</div>
              <div class="ssb-val" style="color:var(--gr)">${getSetting('s_earth')}</div>
              <div class="ssb-sub">Earth conductor: ${R.earthCableSize}mm² Cu<br>${R.earthing === 'TT' ? `Earth rod: ${R.earthRodLength}m deep` : 'Network earth return'}</div>
            </div>
            <div class="ssb">
              <div class="ssb-lbl">PROTECTION DEVICES</div>
              <div class="ssb-val" style="color:var(--am)">${R.allCircuits.length} Circuits</div>
              <div class="ssb-sub">RCDs: ${R.rcdCount} units<br>RCBOs: ${R.rcboCount} units<br>SPD: Type ${R.spd}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MATERIAL LIST -->
    <div class="tab-panel" id="tab-materials">
      <div class="sc">
        <div class="sc-hdr"><div class="ic">📋</div><h2>COMPLETE PROFESSIONAL SHOPPING LIST</h2>
          <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="copyMaterialList()">📋 Copy List</button>
        </div>
        <div class="sc-body">
          ${renderMaterialList(R.materials)}
        </div>
      </div>
    </div>

    <!-- SINGLE LINE DIAGRAM -->
    <div class="tab-panel" id="tab-sld">
      <div class="diag-wrap">
        <div class="diag-title">SINGLE LINE DIAGRAM — FULL SYSTEM (UTILITY TO FINAL LOAD)
          <span style="font-size:.7rem;color:var(--tx2)">All cable sizes & protection ratings shown</span>
        </div>
        <div class="diag-svg-wrap" id="sld-container">
          ${generateSLD(R)}
        </div>
      </div>
    </div>

    <!-- DB LAYOUT -->
    <div class="tab-panel" id="tab-dblayout">
      <div class="diag-wrap">
        <div class="diag-title">DISTRIBUTION BOARD LAYOUT — ${R.dbWays}-WAY</div>
        <div class="diag-svg-wrap">
          ${generateDBLayout(R)}
        </div>
      </div>
    </div>

    <!-- EARTHING -->
    <div class="tab-panel" id="tab-earthing">
      <div class="diag-wrap">
        <div class="diag-title">EARTHING SYSTEM LAYOUT — ${getSetting('s_earth')}</div>
        <div class="diag-svg-wrap">
          ${generateEarthingDiagram(R)}
        </div>
      </div>
    </div>

    <!-- PROTECTION HIERARCHY -->
    <div class="tab-panel" id="tab-protection">
      <div class="diag-wrap">
        <div class="diag-title">PROTECTION COORDINATION HIERARCHY</div>
        <div class="diag-svg-wrap">
          ${generateProtectionDiagram(R)}
        </div>
      </div>
    </div>
    `;
  }, 200);
}

function renderMaterialList(mat) {
  return Object.entries(mat).map(([cat, items]) => `
  <div class="mat-cat">
    <div class="mat-cat-hdr">── ${cat} ──</div>
    ${items.map(m => `
    <div class="mat-row">
      <span class="mat-item">${m.item}</span>
      <span class="mat-spec">${m.spec}</span>
      <span class="mat-qty">${m.qty}</span>
      <span class="mat-unit">${m.unit}</span>
    </div>`).join('')}
  </div>`).join('');
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════
// SVG GENERATORS
// ═══════════════════════════════════════════════════════════════════

function generateSLD(R) {
  const V = R.voltage;
  const circuits = R.allCircuits;
  const W = 900, colW = 160;
  const groups = { lighting: [], socket: [], heavy: [], shower: [], ac: [] };
  circuits.forEach(c => {
    const g = c.type === 'lighting' ? 'lighting' : c.type === 'socket' ? 'socket' : c.type === 'shower' ? 'shower' : c.type === 'ac' ? 'ac' : 'heavy';
    groups[g].push(c);
  });
  const cols = Object.values(groups).filter(g => g.length > 0);
  const svgW = Math.max(W, cols.length * colW + 300);
  const svgH = Math.max(600, cols.reduce((a, g) => Math.max(a, g.length), 0) * 70 + 400);

  let svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#060b14;font-family:'Share Tech Mono',monospace">`;
  // Defs
  svg += `<defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#00d4ff"/></marker>
    <marker id="arram" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#ffb300"/></marker>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

  const cx = svgW / 2;
  let y = 30;

  // Draw a component box
  const box = (x, cy, w, h, fill, stroke, label1, label2 = '', label3 = '') => {
    let s = `<rect x="${x - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    s += `<text x="${x}" y="${cy - 5}" text-anchor="middle" fill="${stroke}" font-size="10" font-weight="bold">${label1}</text>`;
    if (label2) s += `<text x="${x}" y="${cy + 8}" text-anchor="middle" fill="#9ab4d4" font-size="9">${label2}</text>`;
    if (label3) s += `<text x="${x}" y="${cy + 20}" text-anchor="middle" fill="#9ab4d4" font-size="9">${label3}</text>`;
    return s;
  };
  const line = (x1, y1, x2, y2, color = '#00d4ff', dashed = false, w = 1.5) => {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" ${dashed ? 'stroke-dasharray="4,3"' : ''} marker-end="url(#arr)"/>`;
  };
  const linePlain = (x1, y1, x2, y2, color = '#00d4ff', w = 1.5) => {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;
  };
  const label = (x, y, txt, col = '#9ab4d4', sz = 9) => `<text x="${x}" y="${y}" fill="${col}" font-size="${sz}">${txt}</text>`;

  // UTILITY
  svg += `<rect x="${cx - 60}" y="${y}" width="120" height="36" rx="4" fill="#0a1628" stroke="#888" stroke-width="1.5"/>`;
  svg += `<text x="${cx}" y="${y + 14}" text-anchor="middle" fill="#888" font-size="10" font-weight="bold">UTILITY SUPPLY</text>`;
  svg += `<text x="${cx}" y="${y + 27}" text-anchor="middle" fill="#666" font-size="9">${V}V ${R.supplyType === 'three' ? '3-Phase' : 'Single Phase'} 50Hz</text>`;
  y += 36;

  svg += linePlain(cx, y, cx, y + 20, '#888');
  y += 20;

  // METER
  svg += box(cx, y + 22, 110, 36, '#0a1a0a', '#00cc66', '⊕ UTILITY METER', `Bi-directional digital`);
  y += 44;
  svg += linePlain(cx, y, cx, y + 16, '#00cc66');
  y += 16;

  // MAIN ISOLATOR
  svg += box(cx, y + 20, 110, 34, '#0a1020', '#00d4ff', 'MAIN ISOLATOR', `${R.mainBreakerA}A DP Switch`);
  svg += label(cx + 60, y + 20, '← EMERGENCY OFF', '#ff888888', 8);
  y += 40;
  svg += linePlain(cx, y, cx, y + 16, '#00d4ff');
  y += 16;

  // SPD
  svg += `<rect x="${cx - 45}" y="${y}" width="90" height="32" rx="4" fill="#1a1200" stroke="#ffb300" stroke-width="1.5"/>`;
  svg += `<text x="${cx}" y="${y + 13}" text-anchor="middle" fill="#ffb300" font-size="10" font-weight="bold">SPD TYPE ${R.spd}</text>`;
  svg += `<text x="${cx}" y="${y + 26}" text-anchor="middle" fill="#aa8800" font-size="9">40kA Surge Arrestor</text>`;
  // SPD to earth
  svg += linePlain(cx + 45, y + 16, cx + 90, y + 16, '#ffb300');
  svg += label(cx + 92, y + 20, 'PE', '#ffb300', 9);
  y += 32;
  svg += linePlain(cx, y, cx, y + 16, '#00d4ff');
  y += 16;

  // MAIN MCB
  svg += box(cx, y + 22, 120, 36, '#1a0a0a', '#ff4444', `MAIN MCB ${R.mainBreakerA}A`, `Curve C, 10kA`);
  svg += label(cx + 65, y + 22, `${R.mainCableSize}mm²`, '#00d4ff', 9);
  y += 44;
  svg += linePlain(cx, y, cx, y + 16, '#ff4444');
  y += 16;

  // Main RCD bar
  svg += `<rect x="${cx - 140}" y="${y}" width="280" height="30" rx="4" fill="#0a1a0a" stroke="#00ff88" stroke-width="1.5"/>`;
  svg += `<text x="${cx}" y="${y + 12}" text-anchor="middle" fill="#00ff88" font-size="10" font-weight="bold">MAIN RCD — 100mA Type A</text>`;
  svg += `<text x="${cx}" y="${y + 24}" text-anchor="middle" fill="#008844" font-size="9">63A — Fire & Selectivity Protection</text>`;
  y += 30;

  // Distribution bus
  const busY = y + 20;
  svg += `<rect x="${cx - Math.max(140, cols.length * colW / 2 + 20)}" y="${busY}" width="${Math.max(280, cols.length * colW + 40)}" height="14" rx="2" fill="#1a2a4a" stroke="#00d4ff" stroke-width="2"/>`;
  svg += `<text x="${cx}" y="${busY + 10}" text-anchor="middle" fill="#00d4ff" font-size="9" font-weight="bold">DISTRIBUTION BUS ${V}V</text>`;
  svg += linePlain(cx, y, cx, busY, '#00d4ff');
  y = busY + 14;

  // Draw circuit columns
  const groupNames = ['LIGHTING', 'SOCKETS', 'HEAVY', 'SHOWER', 'AC'];
  const groupColors = ['#00d4ff', '#ffb300', '#ff4444', '#a855f7', '#00ff88'];
  const groupTypes = ['lighting', 'socket', 'heavy', 'shower', 'ac'];
  let colX = cx - Math.max(110, cols.length * colW / 2 - colW / 2) + 30;

  cols.forEach((grp, gi) => {
    const color = groupColors[gi] || '#00d4ff';
    let cy2 = y;
    svg += linePlain(colX, busY + 14, colX, cy2 + 14, '#1a3a5a');
    grp.forEach((c, i) => {
      cy2 += 40;
      svg += `<rect x="${colX - 55}" y="${cy2 - 14}" width="110" height="30" rx="3" fill="${c.needsRCBO ? '#1a0a1a' : '#0a0a1a'}" stroke="${color}" stroke-width="1"/>`;
      svg += `<text x="${colX}" y="${cy2 - 3}" text-anchor="middle" fill="${color}" font-size="8" font-weight="bold">${c.needsRCBO ? 'RCBO' : 'MCB'} ${c.mcbA}A</text>`;
      svg += `<text x="${colX}" y="${cy2 + 8}" text-anchor="middle" fill="#888" font-size="8">${c.cable}mm² | ${c.vdPct.toFixed(1)}%VD</text>`;
      if (i < grp.length - 1) svg += linePlain(colX, cy2 + 16, colX, cy2 + 26, '#1a3a5a');
      if (i === 0) svg += linePlain(colX, y + 14, colX, cy2 - 14, color, 1);
    });
    // Load label at bottom
    cy2 += 40;
    svg += `<rect x="${colX - 50}" y="${cy2 - 12}" width="100" height="22" rx="10" fill="#111" stroke="${color}44" stroke-width="1"/>`;
    svg += `<text x="${colX}" y="${cy2 + 2}" text-anchor="middle" fill="${color}99" font-size="8">${grp.reduce((a, c) => a + c.watts, 0).toFixed(0)}W TOTAL</text>`;
    // Group label at top
    svg += `<text x="${colX}" y="${busY}" text-anchor="middle" fill="${color}" font-size="9" font-weight="bold">${groupNames[gi] || 'LOAD'}</text>`;

    colX += colW;
  });

  // Earth bar at bottom
  const ebY = svgH - 60;
  svg += `<rect x="40" y="${ebY}" width="${svgW - 80}" height="16" rx="2" fill="#001a00" stroke="#00aa00" stroke-width="2"/>`;
  svg += `<text x="${svgW / 2}" y="${ebY + 11}" text-anchor="middle" fill="#00cc00" font-size="9" font-weight="bold">═══ EARTH BAR (PE) ═══ ${R.earthCableSize}mm² GREEN/YELLOW CONDUCTOR ═══ ${R.earthing}</text>`;
  // Neutral bar
  svg += `<rect x="40" y="${ebY - 22}" width="${svgW - 80}" height="14" rx="2" fill="#1a1a00" stroke="#888800" stroke-width="1.5"/>`;
  svg += `<text x="${svgW / 2}" y="${ebY - 12}" text-anchor="middle" fill="#999900" font-size="9" font-weight="bold">══ NEUTRAL BAR (N) ══ Insulated multi-way busbar ══</text>`;

  // Legend
  svg += `<rect x="20" y="20" width="160" height="90" rx="4" fill="#0a1020" stroke="#1e3a5c"/>`;
  svg += `<text x="28" y="36" fill="#00d4ff" font-size="9" font-weight="bold">LEGEND</text>`;
  const lgItems = [['#00d4ff', 'Lighting Circuit'], ['#ffb300', 'Socket Circuit'], ['#ff4444', 'Heavy Load'], ['#a855f7', 'Shower/Wet'], ['#00ff88', 'AC / Split']];
  lgItems.forEach(([c, t], i) => {
    svg += `<rect x="28" y="${44 + i * 13}" width="10" height="6" fill="${c}" rx="1"/>`;
    svg += `<text x="44" y="${51 + i * 13}" fill="#9ab4d4" font-size="8">${t}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function generateDBLayout(R) {
  const circuits = R.allCircuits;
  const cols = 4, bW = 54, bH = 78, padX = 12, padY = 10, margin = 20;
  const rows = Math.ceil((circuits.length + 4) / cols); // +4 for main, RCD, SPD, spare
  const dbW = cols * bW + padX * 2;
  const dbH = rows * bH + padY * 4 + 80;
  const svgW = dbW + margin * 2 + 180;
  const svgH = Math.max(dbH + 80, 350);

  let svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#060b14;font-family:'Share Tech Mono',monospace">`;

  // Panel enclosure
  const px = margin, py = 40;
  svg += `<rect x="${px}" y="${py}" width="${dbW + 40}" height="${dbH + 20}" rx="6" fill="#1a1a1a" stroke="#666" stroke-width="3"/>`;
  svg += `<rect x="${px + 8}" y="${py + 8}" width="${dbW + 24}" height="${dbH + 4}" rx="4" fill="#111" stroke="#444" stroke-width="1.5"/>`;
  svg += `<text x="${px + (dbW + 40) / 2}" y="${py - 12}" text-anchor="middle" fill="#00d4ff" font-size="11" font-weight="bold" font-family="'Orbitron',monospace">DISTRIBUTION BOARD — ${R.dbWays} WAY</text>`;

  const breaker = (x, y, label1, label2, type, rating) => {
    const colors = { main: '#4a1a1a', rcd: '#0a2a0a', rcbo: '#1a0a2a', spd: '#2a1a00', mcb: '#0a0a2a' };
    const strs = { main: '#ff4444', rcd: '#00ff88', rcbo: '#a855f7', spd: '#ffb300', mcb: '#00d4ff' };
    const fc = colors[type] || colors.mcb, sc = strs[type] || strs.mcb;
    let s = `<rect x="${x}" y="${y}" width="${bW - 4}" height="${bH - 4}" rx="3" fill="${fc}" stroke="${sc}" stroke-width="1.5"/>`;
    // Breaker handle
    s += `<rect x="${x + (bW - 4) / 2 - 7}" y="${y + 12}" width="14" height="20" rx="2" fill="#ccc"/>`;
    s += `<rect x="${x + (bW - 4) / 2 - 4}" y="${y + 8}" width="8" height="8" rx="1" fill="${sc}" opacity="0.7"/>`;
    // Trip indicator
    s += `<rect x="${x + (bW - 4) / 2 - 5}" y="${y + 35}" width="10" height="5" rx="1" fill="#ff4444"/>`;
    // Labels
    s += `<text x="${x + (bW - 4) / 2}" y="${y + 50}" text-anchor="middle" fill="${sc}" font-size="9" font-weight="bold">${rating || ''}A</text>`;
    s += `<text x="${x + (bW - 4) / 2}" y="${y + 62}" text-anchor="middle" fill="${sc}" font-size="8">${label1}</text>`;
    s += `<text x="${x + (bW - 4) / 2}" y="${y + 73}" text-anchor="middle" fill="#666" font-size="7">${label2 || ''}</text>`;
    return s;
  };

  // Draw breakers
  const startX = px + padX + margin / 2;
  const startY = py + padY + 30;
  let idx = 0;

  const allBreakers = [
    { label1: 'MAIN', label2: 'ISOLATOR', type: 'main', rating: R.mainBreakerA },
    { label1: 'SPD', label2: `TYPE ${R.spd}`, type: 'spd', rating: '40kA' },
    { label1: 'MAIN RCD', label2: '100mA', type: 'rcd', rating: '63' },
    ...circuits.map(c => ({
      label1: c.needsRCBO ? 'RCBO' : c.needsRCD ? 'RCD' : 'MCB',
      label2: c.name.split(' ').slice(-2).join(' ').substring(0, 8),
      type: c.needsRCBO ? 'rcbo' : c.needsRCD ? 'rcd' : 'mcb',
      rating: c.mcbA
    })),
    { label1: 'SPARE', label2: '', type: 'mcb', rating: '—' },
    { label1: 'SPARE', label2: '', type: 'mcb', rating: '—' },
  ];

  allBreakers.forEach((b, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * bW;
    const y = startY + row * bH;
    svg += breaker(x, y, b.label1, b.label2, b.type, b.rating);
  });

  // Neutral bar
  const nbY = py + padY + startY - py - padY - 22 + Math.ceil(allBreakers.length / cols) * bH + 30;
  svg += `<rect x="${startX - 4}" y="${nbY}" width="${cols * bW + 4}" height="14" rx="2" fill="#333300" stroke="#999900" stroke-width="1.5"/>`;
  svg += `<text x="${startX + cols * bW / 2}" y="${nbY + 10}" text-anchor="middle" fill="#cccc00" font-size="8" font-weight="bold">NEUTRAL BAR</text>`;

  // Earth bar
  svg += `<rect x="${startX - 4}" y="${nbY + 18}" width="${cols * bW + 4}" height="14" rx="2" fill="#002200" stroke="#00aa00" stroke-width="1.5"/>`;
  svg += `<text x="${startX + cols * bW / 2}" y="${nbY + 28}" text-anchor="middle" fill="#00cc00" font-size="8" font-weight="bold">EARTH BAR (PE)</text>`;

  // Legend on right
  const lx = px + dbW + 60;
  svg += `<rect x="${lx}" y="${py}" width="140" height="180" rx="4" fill="#0a1020" stroke="#1e3a5c"/>`;
  svg += `<text x="${lx + 8}" y="${py + 18}" fill="#00d4ff" font-size="10" font-weight="bold">DB LEGEND</text>`;
  const lgItems = [
    ['#4a1a1a', '#ff4444', 'Main Isolator'],
    ['#1a1200', '#ffb300', 'SPD'],
    ['#0a2a0a', '#00ff88', 'RCD'],
    ['#1a0a2a', '#a855f7', 'RCBO'],
    ['#0a0a2a', '#00d4ff', 'MCB'],
  ];
  lgItems.forEach(([bg, stroke, lbl], i) => {
    svg += `<rect x="${lx + 8}" y="${py + 28 + i * 28}" width="30" height="20" rx="2" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>`;
    svg += `<text x="${lx + 46}" y="${py + 41 + i * 28}" fill="#9ab4d4" font-size="9">${lbl}</text>`;
  });

  // Stats
  svg += `<rect x="${lx}" y="${py + 190}" width="140" height="130" rx="4" fill="#0a1020" stroke="#1e3a5c"/>`;
  svg += `<text x="${lx + 8}" y="${py + 208}" fill="#00d4ff" font-size="9" font-weight="bold">DB SUMMARY</text>`;
  const stats = [
    [`Main: ${R.mainBreakerA}A MCB`],
    [`Circuits: ${circuits.length}`],
    [`RCBOs: ${R.rcboCount}`],
    [`RCDs: ${R.rcdCount}`],
    [`DB Size: ${R.dbWays}-way`],
    [`SPD: Type ${R.spd}`],
  ];
  stats.forEach(([t], i) => {
    svg += `<text x="${lx + 8}" y="${py + 224 + i * 16}" fill="#9ab4d4" font-size="8">${t}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function generateEarthingDiagram(R) {
  const svgW = 800, svgH = 500;
  let svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#060b14;font-family:'Share Tech Mono',monospace">`;
  svg += `<defs><marker id="earr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#00cc00"/></marker></defs>`;

  const lp = (x1, y1, x2, y2, c = '#00cc00', w = 1.5) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
  const txt = (x, y, t, c = '#9ab4d4', sz = 9, anc = 'start') => `<text x="${x}" y="${y}" fill="${c}" font-size="${sz}" text-anchor="${anc}">${t}</text>`;
  const rect = (x, y, w, h, bg, stroke, rx = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>`;

  // Building outline
  svg += rect(150, 30, 500, 300, '#0a1020', '#1e3a5c', 8);
  svg += txt(400, 20, 'BUILDING', '#1e3a5c', 10, 'middle');

  // Main DB box
  svg += rect(300, 60, 160, 60, '#0a1628', '#00d4ff', 4);
  svg += txt(380, 85, 'DISTRIBUTION BOARD', '#00d4ff', 9, 'middle');
  svg += txt(380, 100, `${R.mainBreakerA}A Main | ${R.dbWays}-way`, '#9ab4d4', 8, 'middle');

  // Earth bar
  svg += rect(310, 130, 140, 16, '#002200', '#00aa00', 2);
  svg += txt(380, 142, 'EARTH BAR (PE)', '#00cc00', 8, 'middle');

  // MET - Main Earthing Terminal
  svg += rect(310, 200, 140, 30, '#003300', '#00ff88', 4);
  svg += txt(380, 210, 'MAIN EARTHING', '#00ff88', 9, 'middle');
  svg += txt(380, 222, 'TERMINAL (MET)', '#00ff88', 8, 'middle');

  // Bonding points
  svg += rect(160, 100, 90, 24, '#001a00', '#00cc00', 3);
  svg += txt(205, 116, 'GAS PIPE', '#00cc00', 8, 'middle');
  svg += lp(250, 112, 310, 215, '#00cc00', 1.5);
  svg += txt(270, 130, '10mm² Cu', '#00cc00', 7, 'middle');

  svg += rect(160, 145, 90, 24, '#001a00', '#00cc00', 3);
  svg += txt(205, 161, 'WATER PIPE', '#00cc00', 8, 'middle');
  svg += lp(250, 157, 310, 218, '#00cc00', 1.5);

  svg += rect(550, 100, 90, 24, '#001a00', '#00cc00', 3);
  svg += txt(595, 116, 'METAL FRAME', '#00cc00', 8, 'middle');
  svg += lp(550, 112, 450, 215, '#00cc00', 1.5);

  // Earth from DB to MET
  svg += lp(380, 146, 380, 200, '#00ff88', 2);
  svg += txt(388, 170, '4mm² G/Y', '#00ff88', 8);

  // MET to external
  svg += lp(380, 230, 380, 320, '#00ff88', 2.5);
  svg += txt(388, 270, `${R.earthCableSize}mm² Cu`, '#00ff88', 9);

  // Ground level
  svg += `<rect x="0" y="${svgH - 140}" width="${svgW}" height="140" rx="0" fill="#0a0800"/>`;
  svg += `<line x1="0" y1="${svgH - 140}" x2="${svgW}" y2="${svgH - 140}" stroke="#443300" stroke-width="2"/>`;
  svg += txt(700, svgH - 130, 'GROUND LEVEL', '#443300', 9);

  // Earth pit
  svg += rect(340, svgH - 130, 80, 30, '#111', '#00aa00', 4);
  svg += txt(380, svgH - 112, 'EARTH PIT', '#00cc00', 9, 'middle');
  svg += txt(380, svgH - 100, '300×300mm', '#888', 8, 'middle');

  // Earth electrode
  svg += `<line x1="380" y1="${svgH - 100}" x2="380" y2="${svgH - 20}" stroke="#888800" stroke-width="6"/>`;
  svg += txt(394, svgH - 70, 'EARTH ROD', '#999900', 9);
  svg += txt(394, svgH - 58, `${R.earthRodLength}m Copper-clad`, '#666', 8);

  // Second earth rod if TT
  if (R.earthing === 'TT') {
    svg += `<line x1="480" y1="${svgH - 130}" x2="480" y2="${svgH - 20}" stroke="#888800" stroke-width="6"/>`;
    svg += lp(380, svgH - 125, 480, svgH - 125, '#888800', 2);
    svg += txt(494, svgH - 70, '2nd EARTH ROD', '#999900', 9);
    svg += txt(494, svgH - 58, 'TT System — Required', '#666', 8);
  }

  // Connect external earth to pit
  svg += lp(380, 320, 380, svgH - 130, '#00ff88', 2.5);

  // Earthing system label
  svg += rect(600, svgH - 130, 180, 100, '#0a1020', '#1e3a5c', 4);
  svg += txt(610, svgH - 110, 'EARTHING SYSTEM', '#00d4ff', 9);
  svg += txt(610, svgH - 95, `Type: ${R.earthing}`, '#9ab4d4', 9);
  svg += txt(610, svgH - 80, `Rod length: ${R.earthRodLength}m`, '#9ab4d4', 8);
  svg += txt(610, svgH - 65, `Earth cable: ${R.earthCableSize}mm²`, '#9ab4d4', 8);
  svg += txt(610, svgH - 50, 'IEC 60364-5-54', '#666', 7);

  svg += '</svg>';
  return svg;
}

function generateProtectionDiagram(R) {
  const svgW = 800, svgH = 500;
  let svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#060b14;font-family:'Share Tech Mono',monospace">`;

  const levels = [
    { label: 'UTILITY METER', sub: 'Service entrance protection', color: '#888888', y: 40, devices: ['Utility fuse / Cut-out'] },
    { label: 'MAIN ISOLATOR', sub: 'Emergency disconnection', color: '#00cc66', y: 110, devices: [`${R.mainBreakerA}A Double Pole Isolator`] },
    { label: 'SURGE PROTECTION (SPD)', sub: 'Transient overvoltage protection', color: '#ffb300', y: 180, devices: [`Type ${R.spd} SPD — 40kA surge rating`] },
    { label: 'MAIN OVERCURRENT (MCB)', sub: 'Overcurrent & short circuit protection', color: '#ff4444', y: 250, devices: [`${R.mainBreakerA}A MCB Curve C — Protects main cable`] },
    { label: 'EARTH FAULT (RCD)', sub: 'Earth fault & fire protection', color: '#00ff88', y: 320, devices: ['63A/100mA RCD — Selectivity level', '30mA RCDs — Individual socket circuits'] },
    { label: 'CIRCUIT PROTECTION', sub: 'Individual circuit breakers', color: '#00d4ff', y: 390, devices: [`${R.allCircuits.length} circuits: MCBs + ${R.rcboCount} RCBOs`] },
    { label: 'LOAD (FINAL CIRCUIT)', sub: 'Point of use — appliances & outlets', color: '#9ab4d4', y: 460, devices: ['Sockets, luminaires, appliances'] },
  ];

  // Backbone line
  svg += `<line x1="400" y1="30" x2="400" y2="480" stroke="#1e3a5c" stroke-width="3" stroke-dasharray="4,3"/>`;

  levels.forEach((lv, i) => {
    const isLeft = i % 2 === 0;
    const bx = isLeft ? 60 : 500, bw = 280, by = lv.y;
    // Box
    svg += `<rect x="${bx}" y="${by}" width="${bw}" height="55" rx="4" fill="#0a1020" stroke="${lv.color}" stroke-width="2"/>`;
    // Header
    svg += `<rect x="${bx}" y="${by}" width="${bw}" height="20" rx="4" fill="${lv.color}22"/>`;
    svg += `<text x="${bx + 10}" y="${by + 14}" fill="${lv.color}" font-size="9" font-weight="bold">${lv.label}</text>`;
    svg += `<text x="${bx + 10}" y="${by + 30}" fill="#9ab4d4" font-size="8">${lv.sub}</text>`;
    svg += `<text x="${bx + 10}" y="${by + 46}" fill="#666" font-size="7.5">${lv.devices[0]}</text>`;
    // Connector to backbone
    const cx2 = isLeft ? bx + bw : bx;
    svg += `<line x1="${cx2}" y1="${by + 27}" x2="400" y2="${by + 27}" stroke="${lv.color}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
    // Dot on backbone
    svg += `<circle cx="400" cy="${by + 27}" r="4" fill="${lv.color}"/>`;
    // Level number
    svg += `<circle cx="${isLeft ? bx - 12 : bx + bw + 12}" cy="${by + 27}" r="10" fill="${lv.color}22" stroke="${lv.color}" stroke-width="1.5"/>`;
    svg += `<text x="${isLeft ? bx - 12 : bx + bw + 12}" y="${by + 31}" fill="${lv.color}" font-size="9" text-anchor="middle">${i + 1}</text>`;
  });

  // Title
  svg += `<text x="400" y="18" fill="#00d4ff" font-size="11" font-weight="bold" text-anchor="middle" font-family="'Orbitron',monospace">PROTECTION COORDINATION HIERARCHY — IEC 60364</text>`;

  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
function exportSVG() {
  if (!state.results) return;
  const svg = generateSLD(state.results);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'electrical-single-line-diagram.svg'; a.click();
  URL.revokeObjectURL(url);
}

function copyMaterialList() {
  if (!state.results) return;
  const mat = state.results.materials;
  let txt = 'ELECTRICAL MATERIAL LIST\n' + '='.repeat(50) + '\n\n';
  Object.entries(mat).forEach(([cat, items]) => {
    txt += `${cat}\n${'-'.repeat(30)}\n`;
    items.forEach(m => { txt += `  ${m.item.padEnd(40)} ${String(m.qty).padStart(6)} ${m.unit} ${m.spec ? '| ' + m.spec : ''}\n`; });
    txt += '\n';
  });
  navigator.clipboard.writeText(txt).then(() => alert('Material list copied to clipboard!'));
}

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loading-overlay').classList.add('hide');
  }, 800);
  // Add a default house
  quickAdd('Living Room', 6, 4, 2.8);
  quickAdd('Kitchen', 4, 3.5, 2.8);
  quickAdd('Master Bedroom', 5, 4, 2.8);
  quickAdd('Bathroom', 3, 2, 2.4);
  // Set default loads for kitchen
  setTimeout(() => {
    const kitchen = state.rooms.find(r => r.name === 'Kitchen');
    if (kitchen) {
      kitchen.loads.appliances.cooker = 7.2;
      kitchen.loads.appliances.microwave = 1.2;
      kitchen.loads.sockets.std13A = 8;
      kitchen.loads.lighting.ledQty = 6;
      kitchen.loads.lighting.ledWatt = 9;
      kitchen.loads.sockets.fridge = true;
    }
    const lr = state.rooms.find(r => r.name === 'Living Room');
    if (lr) {
      lr.loads.lighting.ledQty = 6;
      lr.loads.lighting.fans = 1;
      lr.loads.sockets.std13A = 6;
      lr.loads.sockets.tv = true;
      lr.loads.appliances.ac = 2.5;
    }
    const mb = state.rooms.find(r => r.name === 'Master Bedroom');
    if (mb) {
      mb.loads.lighting.ledQty = 4;
      mb.loads.sockets.std13A = 4;
      mb.loads.sockets.usb = 2;
      mb.loads.appliances.ac = 1.5;
    }
    const bath = state.rooms.find(r => r.name === 'Bathroom');
    if (bath) {
      bath.loads.lighting.ledQty = 2;
      bath.loads.appliances.shower = 9.5;
      bath.loads.appliances.waterHeater = 3;
    }
    renderRooms();
    renderLoadSelection();
  }, 900);
});
