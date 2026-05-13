/**
 * SQDSR — SecureQR Data Set Representation
 * Part II §5, pages 28-31
 *
 * Final QR format (Table 5.14 / page 31-32):
 *   #<QR_Signature>#<QR_SVC>#<QR_Tkt_Block>#<QR_Dynamic_Data>#
 *
 * Signing scope: QR_SVC + '#' + QR_Tkt_Block  (dynamic data is unsigned)
 * Dynamic data is appended by the APP at render time and refreshed locally —
 * no signing Cloud Function call needed on refresh.
 *
 * QR_SVC      = {sec{ver}{f1|f2|...|f11}}
 * QR_Tkt_Block = {(<opId|noTkts|valInfo|[tkt_fields]>)}
 * QR_Dynamic_Data = {updatedTime|qrStatus|lat|lon|opDyn}
 */

/**
 * Build QR_SVC: {<sec>{<ver>}{common_field|...}}
 */
function buildSVCString(security, version, commonData) {
  const sec    = security.fields[0].hex
  const ver    = version.fields[0].hex
  const common = commonData.fields.map(f => f.hex).join('|')
  return `{${sec}{${ver}}{${common}}}`
}

/**
 * Build QR_Tkt_Block: {(<opId|noTkts|valInfo|[tkt_f1|...|tkt_f10]>)}
 * Scheme 0x03 — no encryption, ticket content in unencrypted [...]
 */
function buildTktBlockString(ticketBlock) {
  const tktFields = ticketBlock.ticket.map(f => f.hex).join('|')
  return `{(<${ticketBlock.opId}|${ticketBlock.noTkts}|${ticketBlock.valInfo}|[${tktFields}]>)}`
}

/**
 * Build QR_Dynamic_Data: {updatedTime||||} per Table 5.14 / page 31-32.
 * Spec renders status, lat, lon, opDyn as empty fields (pipes only).
 * Only the QR Updated Time (first field) carries a value.
 */
export function buildDynamicString(dynamicData) {
  const updatedTime = dynamicData.fields.find(f => f.name === 'QR Updated Time')?.hex ?? '00000000'
  return `{${updatedTime}||||}`
}

/**
 * Serialise the signable portion of the dataset.
 * Returns QR_SVC#QR_Tkt_Block — exactly what gets signed.
 * Dynamic data is excluded (appended unsigned after signing).
 * @param {object} dataset — output of buildDataset()
 * @returns {string} signable SQDSR string
 */
export function serialise(dataset) {
  const { security, version, commonData, ticketBlock } = dataset
  const svc = buildSVCString(security, version, commonData)
  const tkt = buildTktBlockString(ticketBlock)
  return `${svc}#${tkt}`
}

/**
 * Assemble the final QR payload.
 * Format: #<QR_Signature>#<QR_SVC>#<QR_Tkt_Block>#<QR_Dynamic_Data>#
 * @param {string} signableStr   — QR_SVC#QR_Tkt_Block (from serialise())
 * @param {string} signatureB64  — RSA-2048 Base64 signature
 * @param {string} dynamicStr   — {updatedTime|…} (from buildDynamicString())
 * @returns {string} final payload to encode into QR image
 */
export function assembleFinal(signableStr, signatureB64, dynamicStr) {
  return `#${signatureB64}#${signableStr}#${dynamicStr}#`
}
