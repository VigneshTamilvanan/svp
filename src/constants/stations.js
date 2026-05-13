/**
 * Chennai Metro Rail — Station Master
 * Operator-specific station codes assigned by CMRL.
 * Line 1 = Blue (Corridor 1), Line 2 = Green (Corridor 2)
 */

export const CMRL = {
  TG_ID:       0x0001,   // Ticket Generator ID
  OPERATOR_ID: 0x0087,   // Chennai Metro Rail Limited
  SERVICE_ID:  0x01,     // Metro Rail service
  PRODUCT_SVP: 0x0069,   // Store Value Pass product ID (CMRL-assigned: 105 decimal)
  SVP_STATION: 0x00FF,   // SVP open journey station code (CMRL-specific: 255)
}

export const LINE = {
  BLUE:  'Blue',
  GREEN: 'Green',
  BOTH:  'Both',
}

export const STATIONS = [
  // ── Blue Line (Corridor 1) ──────────────────────────────
  { code: 0x01, name: 'Chennai Airport',     line: LINE.BLUE  },
  { code: 0x02, name: 'Meenambakkam',        line: LINE.BLUE  },
  { code: 0x03, name: 'Nanganallur Road',    line: LINE.BLUE  },
  { code: 0x04, name: 'Alandur',             line: LINE.BOTH  },
  { code: 0x05, name: 'St. Thomas Mount',    line: LINE.BOTH  },
  { code: 0x06, name: 'Guindy',              line: LINE.BLUE  },
  { code: 0x07, name: 'Little Mount',        line: LINE.BLUE  },
  { code: 0x08, name: 'Saidapet',            line: LINE.BLUE  },
  { code: 0x09, name: 'Nandanam',            line: LINE.BLUE  },
  { code: 0x0A, name: 'AG-DMS',              line: LINE.BLUE  },
  { code: 0x0B, name: 'Teynampet',           line: LINE.BLUE  },
  { code: 0x0C, name: 'Thousand Lights',     line: LINE.BLUE  },
  { code: 0x0D, name: 'LIC',                 line: LINE.BLUE  },
  { code: 0x0E, name: 'Government Estate',   line: LINE.BLUE  },
  { code: 0x0F, name: 'Central (MGR)',        line: LINE.BOTH  },
  { code: 0x10, name: 'Mannadi',             line: LINE.BLUE  },
  { code: 0x11, name: 'Chennai Beach',       line: LINE.BLUE  },
  // ── Green Line (Corridor 2) ─────────────────────────────
  { code: 0x12, name: 'CMBT',               line: LINE.GREEN },
  { code: 0x13, name: 'Ashok Nagar',         line: LINE.GREEN },
  { code: 0x14, name: 'Vadapalani',          line: LINE.GREEN },
  { code: 0x15, name: 'Arumbakkam',          line: LINE.GREEN },
  { code: 0x16, name: 'Koyambedu',           line: LINE.GREEN },
  { code: 0x17, name: 'CMRL HQ',             line: LINE.GREEN },
  { code: 0x18, name: 'Nehru Park',          line: LINE.GREEN },
  { code: 0x19, name: 'Puratchi Thalaivar',  line: LINE.GREEN },
  { code: 0x1A, name: 'Wimco Nagar',         line: LINE.GREEN },
]

export const LINE_ICON = {
  [LINE.BLUE]:  '🔵',
  [LINE.GREEN]: '🟢',
  [LINE.BOTH]:  '🔵🟢',
}

export function getStation(code) {
  return STATIONS.find(s => s.code === code)
}
