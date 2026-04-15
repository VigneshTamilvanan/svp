/**
 * SQDSR — SecureQR Data Set Representation format
 * Part II, Appendix I
 *
 * Format conventions:
 *   {}  — container / branch node
 *   |   — field separator
 *   ()  — operator block within Ticket Block
 *   []  — ticket info (signed content)
 *   <>  — encrypted content (not used in Scheme 0x03)
 *
 * Full payload structure:
 *   {QR_SVC} | {QR_DYNAMIC_DATA} | {TICKET_BLOCK} | {SIGNATURE}
 *
 * QR_SVC = Security + Version + all Common Data fields (sent as plaintext)
 */

/**
 * Serialise the full dataset into an SQDSR string (before signing).
 * @param {object} dataset — output of buildDataset()
 * @returns {string} SQDSR plaintext
 */
export function serialise(dataset) {
  const { security, version, commonData, dynamicData, ticketBlock } = dataset

  // QR_SVC: Security | Version | Common Data fields
  const svcFields = [
    security.fields[0].hex,
    version.fields[0].hex,
    ...commonData.fields.map(f => f.hex),
  ].join('|')

  // QR Dynamic Data fields
  const dynFields = dynamicData.fields.map(f => f.hex).join('|')

  // Ticket Block — Dynamic Block per operator
  // (operator_id | no_tickets | validator_info | [ticket_fields…])
  const tktFields = ticketBlock.ticket.map(f => f.hex).join('|')
  const tktPart   = `(${ticketBlock.opId}|${ticketBlock.noTkts}|${ticketBlock.valInfo}|[${tktFields}])`

  return `{${svcFields}}|{${dynFields}}|{${tktPart}}`
}

/**
 * Assemble the final QR payload by appending the Base64 signature.
 * @param {string} plaintext — SQDSR string
 * @param {string} signatureB64 — RSA signature, Base64 encoded
 * @returns {string} final payload to encode into QR image
 */
export function assembleFinal(plaintext, signatureB64) {
  return `${plaintext}|{SIG:${signatureB64}}`
}
