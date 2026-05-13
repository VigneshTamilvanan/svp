import { useState, useEffect } from 'react'
import { validatePayload, summarise } from '../lib/validator.js'
import { clearPublicKeyCache } from '../lib/crypto.js'

const TAG_CLASS = { '81': 't81', '82': 't82', '83': 't83', '84': 't84', '85': 't85' }

function FieldRow({ tag, field }) {
  return (
    <tr>
      <td><span className={`tag ${TAG_CLASS[tag] || 'tsig'}`}>{tag}</span></td>
      <td className="field-name" dangerouslySetInnerHTML={{ __html: field.name }} />
      <td className="size-col"><span className="size-pill">{field.size}B</span></td>
      <td className="hex-col">{field.hex}</td>
      <td className="desc-col">{field.desc}</td>
    </tr>
  )
}

function SectionRow({ label }) {
  return (
    <tr className="section-row">
      <td colSpan={5} dangerouslySetInnerHTML={{ __html: label }} />
    </tr>
  )
}

function SubRow({ label }) {
  return (
    <tr className="sub-row">
      <td colSpan={5}>{label}</td>
    </tr>
  )
}

function StatusBadge({ status }) {
  const styles = {
    PASS: { background: '#dcfce7', color: '#15803d' },
    FAIL: { background: '#fee2e2', color: '#dc2626' },
    WARN: { background: '#fef9c3', color: '#a16207' },
  }
  const s = styles[status] || {}
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      fontFamily: 'monospace', fontWeight: 700, fontSize: 11, ...s,
    }}>
      {status}
    </span>
  )
}

export default function PayloadBreakdown({ result, defaultOpen = true }) {
  const [open,       setOpen]       = useState(defaultOpen)
  const [tab,        setTab]        = useState('fields')
  const [checks,     setChecks]     = useState(null)
  const [valRunning, setValRunning] = useState(false)

  useEffect(() => {
    setChecks(null)
  }, [result])

  async function runValidation() {
    clearPublicKeyCache()   // always fetch the current public key from /api/public-key
    setValRunning(true)
    try {
      const c = await validatePayload(result)
      setChecks(c)
    } finally {
      setValRunning(false)
    }
  }

  if (!result) return null

  const { dataset, signableStr, finalPayload } = result
  const { security, version, commonData, dynamicData, ticketBlock } = dataset

  return (
    <div className="card breakdown-card">
      <div
        className="card-title"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
      >
        <span>QR Payload Breakdown</span>
        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>{open ? '▲ Collapse' : '▼ Expand'}</span>
      </div>

      {!open && null}
      {open && <>

      <div className="tabs">
        <button className={`tab ${tab === 'fields' ? 'active' : ''}`} onClick={() => setTab('fields')}>
          Field-by-Field
        </button>
        <button className={`tab ${tab === 'raw' ? 'active' : ''}`} onClick={() => setTab('raw')}>
          Raw SQDSR Payload
        </button>
        <button className={`tab ${tab === 'validate' ? 'active' : ''}`} onClick={() => setTab('validate')}>
          Spec Validation
        </button>
      </div>

      {tab === 'fields' && (
        <table className="field-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Tag</th>
              <th>Field</th>
              <th style={{ width: 55, textAlign: 'center' }}>Size</th>
              <th style={{ width: 260 }}>Hex Value</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {/* TAG 81 */}
            <SectionRow label="▶ TAG 81 — QR Security <span>(1 byte, mandatory)</span>" />
            {security.fields.map(f => <FieldRow key={f.name} tag="81" field={f} />)}

            {/* TAG 82 */}
            <SectionRow label="▶ TAG 82 — QR Dataset Version <span>(1 byte, mandatory)</span>" />
            {version.fields.map(f => <FieldRow key={f.name} tag="82" field={f} />)}

            {/* TAG 83 */}
            <SectionRow label="▶ TAG 83 — QR Common Data <span>(62 bytes, mandatory)</span>" />
            {commonData.fields.map(f => <FieldRow key={f.name} tag="83" field={f} />)}

            {/* TAG 84 */}
            <SectionRow label="▶ TAG 84 — QR Dynamic Data <span>(32 bytes, App-maintained)</span>" />
            {dynamicData.fields.map(f => <FieldRow key={f.name} tag="84" field={f} />)}

            {/* TAG 85 */}
            <SectionRow label="▶ TAG 85 — QR Ticket Block — Dynamic Block <span>(mandatory)</span>" />
            <FieldRow tag="85" field={{ name: 'Operator ID',    size: 2, hex: ticketBlock.opId,    desc: 'CMRL — Chennai Metro Rail Limited' }} />
            <FieldRow tag="85" field={{ name: 'No of Tickets',  size: 1, hex: ticketBlock.noTkts,  desc: '1 ticket in this SVP QR' }} />
            <FieldRow tag="85" field={{ name: 'Validator Info', size: 1, hex: ticketBlock.valInfo, desc: `MSN = scanner options | bit0 = ${parseInt(ticketBlock.valInfo, 16) & 1} (${(parseInt(ticketBlock.valInfo, 16) & 1) ? 'AES-encrypted' : 'not encrypted'})` }} />
            <SubRow label={ticketBlock.encrypted ? '↳ Ticket Info 1 — AES-256-ECB encrypted' : '↳ Ticket Info 1 — 28 bytes'} />
            {ticketBlock.ticket.map(f => (
              <FieldRow key={f.name} tag="85" field={{ ...f, name: `&nbsp;&nbsp;↳ ${f.name}` }} />
            ))}

            {/* Signature */}
            <SectionRow label={`▶ Digital Signature — RSA-2048 + SHA-256${ticketBlock.encrypted ? ' (signed over AES-encrypted ticket)' : ''} (Base64, ~172 chars)`} />
            <FieldRow tag="SIG" field={{ name: 'RSA Signature', size: 172, hex: '(see Raw tab)', desc: `RSASSA-PKCS1-v1_5 over QR_SVC#QR_Tkt_Block → Base64${ticketBlock.encrypted ? ' — ticket fields AES-encrypted before signing' : ''}` }} />
          </tbody>
        </table>
      )}

      {tab === 'raw' && (
        <div>
          <div className="raw-label">Signable String (QR_SVC#QR_Tkt_Block — what RSA signs):</div>
          <pre className="raw-box">{signableStr}</pre>
          <div className="raw-label">Final QR Payload (SQDSR + RSA Signature):</div>
          <pre className="raw-box">{finalPayload}</pre>
        </div>
      )}

      {tab === 'validate' && (
        <div>
          {!checks && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <button className="btn" style={{ width: 'auto', padding: '10px 32px' }}
                onClick={runValidation} disabled={valRunning}>
                {valRunning ? '⏳ Running checks…' : '▶ Run Spec Validation'}
              </button>
              <p style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                Verifies all fields against CDAC QR Ticketing Specification v1.0 (Part I + Part II)
              </p>
            </div>
          )}
          {checks && (() => {
            const s = summarise(checks)
            return (
              <div>
                <div style={{
                  display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center',
                  padding: '10px 14px', background: '#f8fafc', borderRadius: 10,
                }}>
                  <strong style={{ fontSize: 13 }}>Results:</strong>
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                    ✓ {s.passed} PASS
                  </span>
                  {s.failed > 0 && (
                    <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      ✗ {s.failed} FAIL
                    </span>
                  )}
                  {s.warned > 0 && (
                    <span style={{ background: '#fef9c3', color: '#a16207', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      ⚠ {s.warned} WARN
                    </span>
                  )}
                  <button onClick={runValidation} disabled={valRunning}
                    style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 12px', background: '#f1f5f9',
                      border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>
                    Re-run
                  </button>
                </div>
                <table className="field-table">
                  <thead>
                    <tr>
                      <th style={{ width: 55 }}>ID</th>
                      <th style={{ width: 80 }}>Status</th>
                      <th style={{ width: 160 }}>Section</th>
                      <th>Check</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map(c => (
                      <tr key={c.id}>
                        <td><span className="size-pill">{c.id}</span></td>
                        <td><StatusBadge status={c.status} /></td>
                        <td className="desc-col">{c.section}</td>
                        <td className="field-name" style={{ fontSize: 12 }}>{c.description}</td>
                        <td className="hex-col" style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>{c.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      </>}
    </div>
  )
}
