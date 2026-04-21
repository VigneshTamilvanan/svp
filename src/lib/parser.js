/**
 * SQDSR Parser — reconstructs a dataset object from a raw QR string.
 * The returned shape mirrors what buildDataset() produces so it can be
 * passed directly to PayloadBreakdown and the spec validator.
 *
 * Expected format:
 *   {sec|ver|lang|tgId|txnType|serial|genDt|reqId|txnRef|fare|lat|lon|mobile}
 *   |{updatedTime|qrStatus|lat|lon|opDyn}
 *   |{(opId|noTkts|valInfo|[grp|src|dst|actDt|prod|svc|fare|validity|dur|opTkt])}
 *   |{SIG:<base64>}
 */

import { serialDisplay } from './dataset.js'
import { CMRL } from '../constants/stations.js'

function hex2int(h) { return parseInt(h, 16) }

export function parseQRString(raw) {
  const trimmed = raw.trim()

  // ── Split off signature ───────────────────────────────────
  const sigIdx = trimmed.lastIndexOf('|{SIG:')
  if (sigIdx === -1) throw new Error('No |{SIG:…} block found')
  const plaintext = trimmed.slice(0, sigIdx)
  const signature = trimmed.slice(sigIdx + 6, -1)   // strip |{SIG: and trailing }
  if (!signature) throw new Error('Signature block is empty')

  // ── Split the three SQDSR blocks ─────────────────────────
  const m = plaintext.match(/^\{([^}]+)\}\|\{([^}]+)\}\|\{(\(.+\))\}$/)
  if (!m) throw new Error('SQDSR structure invalid — expected {SVC}|{DYN}|{(TKT)}')
  const [, svcRaw, dynRaw, tktRaw] = m

  // ── TAG 81 + 82 + TAG 83 (SVC block — 13 pipe-separated fields) ──
  const svc = svcRaw.split('|')
  if (svc.length !== 13)
    throw new Error(`SVC block: expected 13 fields, got ${svc.length}`)

  const [
    secHex, verHex, langHex, tgIdHex, txnTypeHex,
    serialHex, genDtHex, reqIdHex, txnRefHex,
    totalFareHex, bLatHex, bLonHex, mobileHex,
  ] = svc

  const genDt = hex2int(genDtHex)

  const security = {
    tag: '81', label: 'QR Security', totalBytes: 1, hex: secHex,
    fields: [{
      name: 'Security Scheme', size: 1, hex: secHex,
      desc: `Scheme 0x${secHex} — ${hex2int(secHex) === 0x03 ? 'RSA-2048 + SHA-256 digital signing, no encryption' : 'Unknown scheme'}`,
    }],
  }

  const version = {
    tag: '82', label: 'QR Dataset Version', totalBytes: 1, hex: verHex,
    fields: [{
      name: 'Version', size: 1, hex: verHex,
      desc: `0x${verHex} ${hex2int(verHex) === 0x04 ? '= v1.0' : '(unknown version)'}`,
    }],
  }

  const commonData = {
    tag: '83', label: 'QR Common Data', totalBytes: 62,
    serial: serialHex, genDt,
    fields: [
      { name: 'Language',            size: 1,  hex: langHex,     desc: `0x${langHex} = ${hex2int(langHex) === 0 ? 'English' : 'Other'}` },
      { name: 'TG ID',               size: 2,  hex: tgIdHex,     desc: `Ticket Generator 0x${tgIdHex}${hex2int(tgIdHex) === CMRL.TG_ID ? ' (CMRL)' : ''}` },
      { name: 'Transaction Type',    size: 1,  hex: txnTypeHex,  desc: `0x${txnTypeHex} = ${hex2int(txnTypeHex) === 0x41 ? 'QR Purchase' : 'Other'}` },
      { name: 'Ticket Serial No',    size: 8,  hex: serialHex,   desc: `Display: ${serialDisplay(serialHex)}` },
      { name: 'QR Gen Datetime',     size: 4,  hex: genDtHex,    desc: `Unix ${genDt} → ${new Date(genDt * 1000).toUTCString()}` },
      { name: 'Requester ID (App ID)', size: 4, hex: reqIdHex,   desc: `App ID: 0x${reqIdHex}` },
      { name: 'TXN Ref No',          size: 22, hex: txnRefHex,   desc: 'Payment gateway reference — 22 alphanumeric chars' },
      { name: 'Total Fare',          size: 4,  hex: totalFareHex, desc: `${hex2int(totalFareHex)} paisa (SVP — fare settled at exit)` },
      { name: 'Booking Latitude',    size: 3,  hex: bLatHex,     desc: hex2int(bLatHex) === 0 ? 'Not provided' : `Lat: 0x${bLatHex}` },
      { name: 'Booking Longitude',   size: 3,  hex: bLonHex,     desc: hex2int(bLonHex) === 0 ? 'Not provided' : `Lon: 0x${bLonHex}` },
      { name: 'Mobile',              size: 10, hex: mobileHex,   desc: `Customer mobile: ${mobileHex}` },
    ],
  }

  // ── TAG 84 (DYN block — 5 pipe-separated fields) ──────────
  const dyn = dynRaw.split('|')
  if (dyn.length !== 5)
    throw new Error(`DYN block: expected 5 fields, got ${dyn.length}`)

  const [updatedTimeHex, qrStatusHex, dLatHex, dLonHex, opDynHex] = dyn
  const updatedTime  = hex2int(updatedTimeHex)
  const balancePaisa = hex2int(opDynHex.slice(0, 8))

  const dynamicData = {
    tag: '84', label: 'QR Dynamic Data', totalBytes: 32,
    fields: [
      { name: 'QR Updated Time',          size: 4,  hex: updatedTimeHex, desc: `Unix ${updatedTime} → ${new Date(updatedTime * 1000).toUTCString()}` },
      { name: 'QR Status',                size: 3,  hex: qrStatusHex,    desc: `Operator+State: 0x${qrStatusHex}` },
      { name: 'Latitude',                 size: 3,  hex: dLatHex,        desc: hex2int(dLatHex) === 0 ? 'Not used' : `Lat: 0x${dLatHex}` },
      { name: 'Longitude',                size: 3,  hex: dLonHex,        desc: hex2int(dLonHex) === 0 ? 'Not used' : `Lon: 0x${dLonHex}` },
      { name: 'Op-specific Dynamic Data', size: 19, hex: opDynHex,       desc: `SVP Balance [4B]: ₹${balancePaisa / 100} | Reserved [15B]: 0x00…` },
    ],
  }

  // ── TAG 85 (TKT block) ────────────────────────────────────
  // Format: (opId|noTkts|valInfo|[f0|f1|…|f9])
  const tktMatch = tktRaw.match(/^\(([^|]+)\|([^|]+)\|([^|]+)\|\[(.+)\]\)$/)
  if (!tktMatch) throw new Error('Ticket block structure invalid — expected (opId|noTkts|valInfo|[…])')
  const [, opIdHex, noTktsHex, valInfoHex, tktFieldsRaw] = tktMatch

  const tkt = tktFieldsRaw.split('|')
  if (tkt.length !== 10)
    throw new Error(`Ticket fields: expected 10, got ${tkt.length}`)

  const [
    grpSizeHex, srcHex, dstHex, actDtHex,
    prodIdHex, svcIdHex, tktFareHex,
    validityHex, durationHex, opTktDataHex,
  ] = tkt

  const actDt       = hex2int(actDtHex)
  const prodId      = hex2int(prodIdHex)
  const tktBalance  = hex2int(opTktDataHex.slice(0, 8))
  const accountId   = opTktDataHex.slice(8)

  const ticketBlock = {
    tag: '85', label: 'QR Ticket Block — Dynamic Block',
    opId: opIdHex, noTkts: noTktsHex, valInfo: valInfoHex,
    ticket: [
      { name: 'Group Size',             size: 1,  hex: grpSizeHex,    desc: `${hex2int(grpSizeHex)} passenger(s)` },
      { name: 'Source Station',         size: 2,  hex: srcHex,        desc: hex2int(srcHex) === 0 ? 'ANY (0x0000) — determined by AFC entry gate at tap-in' : `Station code: 0x${srcHex}` },
      { name: 'Destination Station',    size: 2,  hex: dstHex,        desc: hex2int(dstHex) === 0 ? 'ANY (0x0000) — open journey, determined by AFC exit gate' : `Station code: 0x${dstHex}` },
      { name: 'Activation Datetime',    size: 4,  hex: actDtHex,      desc: new Date(actDt * 1000).toUTCString() },
      { name: 'Product ID',             size: 2,  hex: prodIdHex,     desc: `0x${prodIdHex} = ${prodId === CMRL.PRODUCT_SVP ? 'Store Value Pass (SVP)' : `Product ${prodId}`}` },
      { name: 'Service ID',             size: 1,  hex: svcIdHex,      desc: `0x${svcIdHex} = ${hex2int(svcIdHex) === 1 ? 'Metro Rail' : 'Other service'}` },
      { name: 'Ticket Fare',            size: 4,  hex: tktFareHex,    desc: `${hex2int(tktFareHex)} paisa (SVP — settled by AFC at exit)` },
      { name: 'Validity',               size: 2,  hex: validityHex,   desc: `${hex2int(validityHex)} minutes` },
      { name: 'Duration',               size: 2,  hex: durationHex,   desc: `${hex2int(durationHex)} minutes — max journey timeout` },
      { name: 'Op-specific Ticket Data',size: 8,  hex: opTktDataHex,  desc: `SVP Balance [4B]: ₹${tktBalance / 100} | Account ID [4B]: 0x${accountId}` },
    ],
  }

  return {
    dataset:      { security, version, commonData, dynamicData, ticketBlock },
    plaintext,
    signature,
    finalPayload: trimmed,
  }
}
