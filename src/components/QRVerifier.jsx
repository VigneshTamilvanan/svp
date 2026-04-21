import { useState } from 'react'
import { verify, clearPublicKeyCache } from '../lib/crypto.js'
import { parseQRString } from '../lib/parser.js'
import PayloadBreakdown from './PayloadBreakdown.jsx'

export default function QRVerifier() {
  const [input,        setInput]        = useState('')
  const [running,      setRunning]      = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)  // { ok, error }
  const [parsedResult, setParsedResult] = useState(null)  // dataset shape for PayloadBreakdown

  async function handleVerify() {
    setRunning(true)
    setVerifyResult(null)
    setParsedResult(null)
    clearPublicKeyCache()   // always fetch the live public key
    try {
      const parsed = parseQRString(input)
      const ok = await verify(parsed.plaintext, parsed.signature)
      setVerifyResult({ ok })
      setParsedResult(parsed)
    } catch (e) {
      setVerifyResult({ ok: false, error: e.message })
    } finally {
      setRunning(false)
    }
  }

  const hasInput = input.trim().length > 0

  return (
    <>
      <div className="card breakdown-card">
        <div className="card-title">QR Signature Verifier</div>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
          Paste any SVP QR string below. The signature is verified against the live public key
          fetched from <code>/api/public-key</code> — the same key the validator team uses.
        </p>

        <textarea
          rows={5}
          placeholder="{03|04|…}|{…}|{(…|[…])}|{SIG:…}"
          value={input}
          onChange={e => { setInput(e.target.value); setVerifyResult(null); setParsedResult(null) }}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontFamily: 'monospace', fontSize: 11,
            padding: '10px 12px', borderRadius: 8,
            border: '1.5px solid #e2e8f0', resize: 'vertical',
            background: '#f8fafc', outline: 'none',
          }}
        />

        <button
          className="btn"
          onClick={handleVerify}
          disabled={!hasInput || running}
          style={{ marginTop: 10 }}
        >
          {running ? '⏳ Verifying…' : '🔍 Verify Signature'}
        </button>

        {verifyResult && (
          <div style={{
            marginTop: 16, borderRadius: 10, overflow: 'hidden',
            border: `2px solid ${verifyResult.ok ? '#86efac' : '#fca5a5'}`,
          }}>
            <div style={{
              padding: '12px 16px',
              background: verifyResult.ok ? '#dcfce7' : '#fee2e2',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>{verifyResult.ok ? '✅' : '❌'}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: verifyResult.ok ? '#15803d' : '#dc2626' }}>
                  {verifyResult.ok ? 'Signature Valid' : 'Signature Invalid'}
                </div>
                <div style={{ fontSize: 12, color: verifyResult.ok ? '#166534' : '#991b1b' }}>
                  {verifyResult.ok
                    ? 'RSA-2048 / SHA-256 verified against current public key'
                    : verifyResult.error || 'Signature did not match — wrong key or tampered payload'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Field-by-field breakdown — reuses PayloadBreakdown component */}
      {parsedResult && <PayloadBreakdown result={parsedResult} defaultOpen={false} />}
    </>
  )
}
