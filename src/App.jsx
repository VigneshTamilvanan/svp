import { useState, useEffect, useRef } from 'react'
import SVPForm from './components/SVPForm.jsx'
import QRDisplay from './components/QRDisplay.jsx'
import PayloadBreakdown from './components/PayloadBreakdown.jsx'
import { buildDataset, refreshDataset } from './lib/dataset.js'
import { serialise, assembleFinal } from './lib/sqdsr.js'
import { sign } from './lib/crypto.js'

const DEFAULT_FORM = {
  balanceRupees: 500,
  mobile:        '9876543210',
  txnRef:        'UPI20260415123456789012',
  refreshSecs:   30,
}

export default function App() {
  const [form,      setForm]      = useState(DEFAULT_FORM)
  const [result,    setResult]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [countdown, setCountdown] = useState(0)

  // Keep a ref to the latest result + form so the auto-refresh closure
  // always sees current values without re-creating the interval.
  const resultRef = useRef(null)
  const formRef   = useRef(form)
  useEffect(() => { resultRef.current = result }, [result])
  useEffect(() => { formRef.current   = form   }, [form])

  // ── Countdown ticker ──────────────────────────────────────
  // Starts (or restarts) whenever a new QR is generated.
  // Uses the serial number as a stable key for the effect.
  const serial = result?.dataset?.commonData?.serial
  useEffect(() => {
    if (!serial) { setCountdown(0); return }
    const secs = Math.max(5, Number(formRef.current.refreshSecs) || 30)
    setCountdown(secs)
    const id = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [serial]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-refresh when countdown reaches 0 ────────────────
  useEffect(() => {
    if (countdown <= 0 && resultRef.current && !loading) {
      doRefresh()
    }
  }, [countdown]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Full generate (new ticket, new serial) ────────────────
  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const dataset = buildDataset({
        ...form,
        balanceRupees: Number(form.balanceRupees),
      })

      const plaintext    = serialise(dataset)
      const signature    = await sign(plaintext)
      const finalPayload = assembleFinal(plaintext, signature)

      setResult({ dataset, plaintext, signature, finalPayload })
    } catch (e) {
      console.error(e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Soft refresh — only rebuilds TAG 84 + re-signs ───────
  async function doRefresh() {
    const prev = resultRef.current
    const f    = formRef.current
    if (!prev) return
    try {
      const svpBalancePaisa = Number(f.balanceRupees) * 100
      const dataset         = refreshDataset(prev.dataset, svpBalancePaisa)
      const plaintext       = serialise(dataset)
      const signature       = await sign(plaintext)
      const finalPayload    = assembleFinal(plaintext, signature)
      setResult({ dataset, plaintext, signature, finalPayload })

      // Reset countdown to the current interval setting
      const secs = Math.max(5, Number(f.refreshSecs) || 30)
      setCountdown(secs)
    } catch (e) {
      console.error('QR refresh failed:', e)
    }
  }

  const refreshSecs = Math.max(5, Number(form.refreshSecs) || 30)

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <span className="logo-c1">C</span><span className="logo-1">1</span>
        </div>
        <div className="header-divider" />
        <div>
          <h1>Chennai One — SVP QR Generator</h1>
          <p>CDAC QR Ticketing Spec v1.0 · Part I (Dataset) + Part II (SecureQR Scheme 0x03 — RSA-2048 / SHA-256)</p>
        </div>
      </header>

      <main className="page">
        {error && <div className="error-banner">⚠ {error}</div>}

        <div className="grid-top">
          <SVPForm
            values={form}
            onChange={setForm}
            onGenerate={handleGenerate}
            loading={loading}
          />
          <QRDisplay
            result={result}
            countdown={countdown}
            refreshSecs={refreshSecs}
          />
        </div>

        <PayloadBreakdown result={result} />
      </main>
    </>
  )
}
