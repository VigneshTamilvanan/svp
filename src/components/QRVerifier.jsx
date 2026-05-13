import { useState, useEffect } from 'react'
import { verify, clearPublicKeyCache } from '../lib/crypto.js'
import { sign } from '../lib/crypto.js'
import { parseQRString } from '../lib/parser.js'
import { serialise } from '../lib/sqdsr.js'
import PayloadBreakdown from './PayloadBreakdown.jsx'

// ── Shared styles ─────────────────────────────────────────────────────────────
const taStyle = {
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'monospace', fontSize: 11,
  padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid #e2e8f0', resize: 'vertical',
  background: '#f8fafc', outline: 'none',
}
const lblStyle = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 4,
}

function Badge({ ok, text }) {
  return (
    <div style={{
      marginTop: 14, borderRadius: 10, overflow: 'hidden',
      border: `2px solid ${ok ? '#86efac' : '#fca5a5'}`,
    }}>
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        background: ok ? '#dcfce7' : '#fee2e2',
      }}>
        <span style={{ fontSize: 20 }}>{ok ? '✅' : '❌'}</span>
        <div style={{ fontWeight: 800, fontSize: 13, color: ok ? '#15803d' : '#dc2626' }}>{text}</div>
      </div>
    </div>
  )
}

// ── Component Verifier — generate + compare ───────────────────────────────────
function ComponentVerifier({ result }) {
  const [svc,       setSvc]       = useState('')
  const [tkt,       setTkt]       = useState('')
  const [genSig,    setGenSig]    = useState(null)   // generated signature string
  const [running,   setRunning]   = useState(false)
  const [error,     setError]     = useState(null)

  // Auto-fill from current result whenever it changes
  useEffect(() => {
    if (!result) return
    const { dataset } = result
    // Rebuild the SVC and TktBlock strings from the current dataset
    const svcStr = serialise(dataset).split('#')[0]
    const tktStr = serialise(dataset).split('#')[1]
    setSvc(svcStr)
    setTkt(tktStr)
    setGenSig(null)
    setError(null)
  }, [result?.signableStr])

  async function handleGenerate() {
    setRunning(true)
    setGenSig(null)
    setError(null)
    try {
      const plaintext = `${svc.trim()}#${tkt.trim()}`
      // Detect scheme from security byte in SVC: {04{04}{...}} → first char group
      const secMatch = svc.trim().match(/^\{(\w+)\{/)
      const scheme   = secMatch ? parseInt(secMatch[1], 16) : 3
      const { signature, signableStr } = await sign(plaintext, scheme)
      setGenSig({ signature, signableStr })
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const originalSig = result?.signature ?? null
  const match = genSig && originalSig
    ? genSig.signature === originalSig
    : null

  const ready = svc.trim() && tkt.trim()

  return (
    <>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
        {result
          ? 'Auto-filled from generated QR. Edit if needed, then generate signature to compare.'
          : 'Paste QR_SVC and QR_Tkt_Block, then generate signature to compare with the original.'}
      </p>

      <label style={lblStyle}>QR_SVC</label>
      <textarea
        rows={3}
        placeholder="{4{4}{0|1|41|…}}"
        value={svc}
        onChange={e => { setSvc(e.target.value); setGenSig(null); setError(null) }}
        style={taStyle}
      />

      <label style={{ ...lblStyle, marginTop: 10 }}>QR_Tkt_Block</label>
      <textarea
        rows={3}
        placeholder="{(<87|1|11|[…]>)}"
        value={tkt}
        onChange={e => { setTkt(e.target.value); setGenSig(null); setError(null) }}
        style={taStyle}
      />

      <button
        className="btn"
        onClick={handleGenerate}
        disabled={!ready || running}
        style={{ marginTop: 12 }}
      >
        {running ? '⏳ Generating…' : '🔏 Generate Signature'}
      </button>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>Error: {error}</div>
      )}

      {genSig && (
        <div style={{ marginTop: 14 }}>
          <label style={lblStyle}>Generated Signature</label>
          <textarea
            rows={3} readOnly value={genSig.signature}
            style={{ ...taStyle, background: '#f0fdf4', border: '1.5px solid #86efac' }}
          />

          {match !== null && (
            <Badge
              ok={match}
              text={match
                ? 'Signatures match — QR is authentic'
                : 'Signatures do not match — key rotated or payload mismatch'}
            />
          )}

          {match === null && originalSig === null && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
              No QR generated yet — cannot compare. Generate a QR first.
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Full QR verifier (paste full payload) ────────────────────────────────────
function FullQRVerifier() {
  const [input,        setInput]        = useState('')
  const [running,      setRunning]      = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [parsedResult, setParsedResult] = useState(null)

  async function handleVerify() {
    setRunning(true)
    setVerifyResult(null)
    setParsedResult(null)
    clearPublicKeyCache()
    try {
      const parsed = parseQRString(input)
      const ok = await verify(parsed.signableStr, parsed.signature)
      setVerifyResult({ ok })
      setParsedResult(parsed)
    } catch (e) {
      setVerifyResult({ ok: false, error: e.message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
        Paste full QR payload. Signature verified against live public key from <code>/api/public-key</code>.
      </p>
      <textarea
        rows={5}
        placeholder="#<QR_Signature>#<QR_SVC>#<QR_Tkt_Block>#<QR_Dynamic_Data>#"
        value={input}
        onChange={e => { setInput(e.target.value); setVerifyResult(null); setParsedResult(null) }}
        style={taStyle}
      />
      <button className="btn" onClick={handleVerify} disabled={!input.trim() || running} style={{ marginTop: 10 }}>
        {running ? '⏳ Verifying…' : '🔍 Verify Signature'}
      </button>

      {verifyResult && (
        <Badge
          ok={verifyResult.ok}
          text={verifyResult.ok
            ? 'Signature Valid — RSA-2048 / SHA-256 verified'
            : verifyResult.error || 'Signature Invalid — wrong key or tampered payload'}
        />
      )}
      {parsedResult && <PayloadBreakdown result={parsedResult} defaultOpen={false} />}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QRVerifier({ result }) {
  const [tab, setTab] = useState('components')

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
        fontWeight: tab === id ? 700 : 500, fontSize: 12,
        background: tab === id ? '#1a237e' : '#e2e8f0',
        color: tab === id ? '#fff' : '#475569',
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="card breakdown-card">
      <div className="card-title">QR Signature Verifier</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('components', 'Generate & Compare')}
        {tabBtn('full', 'Full QR Payload')}
      </div>
      {tab === 'components'
        ? <ComponentVerifier result={result} />
        : <FullQRVerifier />}
    </div>
  )
}
