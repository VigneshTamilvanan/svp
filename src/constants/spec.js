/**
 * CDAC QR Ticketing Specification v1.0
 * Part I — QR Code Dataset
 * Part II — Security Scheme
 */

// ── Tags (Part I, Table 5.1) ─────────────────────────────
export const TAG = {
  QR_SECURITY:       0x81,   // 1 byte
  DATASET_VERSION:   0x82,   // 1 byte
  COMMON_DATA:       0x83,   // 62 bytes
  DYNAMIC_DATA:      0x84,   // 32 bytes
  TICKET_BLOCK:      0x85,   // up to 640 bytes
}

// ── Security Schemes (Part II, Table 4.2) ────────────────
export const SECURITY_SCHEME = {
  NONE:              0x00,
  CHECKSUM:          0x01,
  CRYPTO_CHECKSUM:   0x02,
  RSA_SIGN:          0x03,   // ← used here: RSA-2048 + SHA-256, no encryption
  SECURE_QR_ALPHA:   0x04,   // RSA sign + partial AES encryption
  SECURE_QR_BETA:    0x05,
  SECURE_QR_GAMMA:   0x06,
}

// ── Dataset Version (Part I, Table 5.3) ──────────────────
// v1.0 = binary 00000100 = 0x04
// Bits 3-8 = major revision (000001), bits 1-2 = minor revision (00)
export const DATASET_VERSION = 0x04

// ── Transaction Types (Part I, Table 4.1) ────────────────
export const TXN_TYPE = {
  PURCHASE:     0x41,   // QR Purchase — TOM / App / TG
  TRANSACTION:  0x42,   // QR Transaction — Ticket or Exit
  VERIFICATION: 0x43,   // QR Verification — Entry
  ERROR:        0x44,   // QR Error — Inspector or exit
  UPDATE:       0x45,   // QR Update — Any
}

// ── QR Status States (Part I, Table 5.6) ─────────────────
export const QR_STATE = {
  INACTIVE: 0,
  ACTIVE:   1,
  ENTRY:    2,
  EXIT:     3,
  TAP:      4,
  INVALID:  5,
}

// ── Language Codes (Part I, Appendix IV Table AN4) ───────
// English=0, Hindi=1, Tamil=5
export const LANG = {
  ENGLISH: 0x00,
  HINDI:   0x01,
  TAMIL:   0x05,
}

// ── Common Data field sizes in bytes (Part I, Table 5.4) ─
// Sum = 1+2+1+8+4+4+22+4+3+3+10 = 62 ✓
export const COMMON_DATA_FIELDS = {
  LANGUAGE:      1,
  TG_ID:         2,
  TXN_TYPE:      1,
  SERIAL_NO:     8,
  GEN_DATETIME:  4,
  REQUESTER_ID:  4,
  TXN_REF:       22,
  TOTAL_FARE:    4,
  BOOKING_LAT:   3,
  BOOKING_LONG:  3,
  MOBILE:        10,
}

// ── Dynamic Data field sizes (Part I, Table 5.5) ─────────
// Sum = 4+3+3+3+19 = 32 ✓
export const DYNAMIC_DATA_FIELDS = {
  QR_UPDATED_TIME: 4,
  QR_STATUS:       3,
  LATITUDE:        3,
  LONGITUDE:       3,
  OP_SPECIFIC:     19,
}

// ── Ticket field sizes (Part I, Table 5.11 / Figure 3) ───
// Order: Group Size, Src, Dst, Activation Date, Product ID, Service ID,
//        Ticket Fare, Validity, Duration, Op-specific Ticket Data
// Sum = 1+2+2+4+2+1+4+2+2+8 = 28 ✓
export const TICKET_FIELDS = {
  GROUP_SIZE:    1,
  SRC_STATION:   2,
  DST_STATION:   2,
  ACTIVATION_DT: 4,
  PRODUCT_ID:    2,
  SERVICE_ID:    1,
  TICKET_FARE:   4,
  VALIDITY:      2,
  DURATION:      2,
  OP_TICKET_DATA:8,
}

// ── Dynamic Block header per operator ────────────────────
export const DYNAMIC_BLOCK_HEADER = {
  OPERATOR_ID:    2,
  NO_OF_TICKETS:  1,
  VALIDATOR_INFO: 1,
}

// ── QR Requesting Source (Part I §4, Ticket Serial No) ───
export const QR_SOURCE = {
  UNDEFINED:  0b00,   // bits 31-30 = 00
  MOBILE:     0b01,   // bits 31-30 = 01  → 0x40000000
  WEBCLIENT:  0b10,   // bits 31-30 = 10  → 0x80000000
  TOM:        0b11,   // bits 31-30 = 11  → 0xC0000000
}

// ── SVP Product defaults ─────────────────────────────────
export const SVP_DEFAULTS = {
  VALIDITY_MINS:  480,    // 8 hours
  DURATION_MINS:  180,    // 3 hours per journey (max-fare timeout)
  MIN_BALANCE:    5000,   // ₹50 in paisa — hard floor
  MAX_BALANCE:    1000000,// ₹10,000 in paisa
}
