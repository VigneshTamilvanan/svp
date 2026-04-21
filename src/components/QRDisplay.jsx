import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { CMRL } from '../constants/stations.js'
import { toHex, serialDisplay } from '../lib/dataset.js'
import { SVP_DEFAULTS } from '../constants/spec.js'

function CountdownRing({ countdown, refreshSecs }) {
  const R = 22
  const CIRC = 2 * Math.PI * R
  const frac = Math.max(0, countdown) / refreshSecs
  const urgent = countdown <= Math.min(5, Math.floor(refreshSecs * 0.15))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={54} height={54} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        {/* Track */}
        <circle cx={27} cy={27} r={R} fill="none" stroke="#e2e8f0" strokeWidth={4} />
        {/* Arc */}
        <circle
          cx={27} cy={27} r={R}
          fill="none"
          stroke={urgent ? '#dc2626' : '#1a237e'}
          strokeWidth={4}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
        />
        {/* Centre number — rotated back upright */}
        <text
          x={27} y={27}
          textAnchor="middle" dominantBaseline="central"
          style={{ transform: 'rotate(90deg)', transformOrigin: '27px 27px',
                   fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
                   fill: urgent ? '#dc2626' : '#1e293b' }}
        >
          {countdown}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: urgent ? '#dc2626' : '#475569' }}>
          {urgent ? 'Refreshing soon…' : 'Next refresh in'}
        </div>
        <div>{countdown}s / {refreshSecs}s interval</div>
      </div>
    </div>
  )
}

export default function QRDisplay({ result, countdown, refreshSecs, sessionExpired, onResume, loading }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!result || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, result.finalPayload, {
      width: 220,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
  }, [result])

  if (!result) {
    return (
      <div className="card qr-panel">
        <div className="card-title">Generated QR Code</div>
        <div className="qr-placeholder">
          Fill the form and click<br />
          <strong>Generate SVP QR</strong>
        </div>
      </div>
    )
  }

  const refreshSecsVal = refreshSecs || 30

  const { dataset, finalPayload } = result
  const serial = dataset.commonData.serial
  const bal    = dataset.dynamicData.fields.find(f => f.name === 'Op-specific Dynamic Data')

  const infoRows = [
    { label: 'Journey',         value: 'ANY → ANY (open SVP)',         color: 'blue'  },
    { label: 'SVP Balance',     value: bal ? `₹${parseInt(bal.hex.slice(0, 8), 16) / 100}` : '—', color: 'green' },
    { label: 'Fare',            value: 'Deducted at exit by AFC gate'                  },
    { label: 'Validity',        value: `${SVP_DEFAULTS.VALIDITY_MINS} min (8 hrs)`    },
    { label: 'Journey Timeout', value: `${SVP_DEFAULTS.DURATION_MINS} min — max fare on timeout` },
    { label: 'Product',         value: `SVP (0x${toHex(CMRL.PRODUCT_SVP, 2)})`        },
    { label: 'Security',        value: 'RSA-2048 / SHA-256 — Scheme 0x03'             },
  ]

  return (
    <div className="card qr-panel">
      <div className="card-title">Generated QR Code</div>
      <span className="svp-badge">STORE VALUE PASS</span>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas ref={canvasRef} style={{ opacity: sessionExpired ? 0.25 : 1, transition: 'opacity 0.3s' }} />
        {sessionExpired && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textAlign: 'center', lineHeight: 1.4 }}>
              Session expired<br />
              <span style={{ fontWeight: 400, color: '#64748b' }}>10 min limit reached</span>
            </div>
            <button
              onClick={onResume}
              disabled={loading}
              style={{
                padding: '7px 20px', borderRadius: 8, border: 'none',
                background: '#1a237e', color: '#fff', fontWeight: 700,
                fontSize: 13, cursor: 'pointer',
              }}
            >
              {loading ? 'Resuming…' : 'Resume'}
            </button>
          </div>
        )}
      </div>
      <span className="serial-display">{serialDisplay(serial)}</span>
      {!sessionExpired && countdown > 0 && (
        <CountdownRing countdown={countdown} refreshSecs={refreshSecsVal} />
      )}
      <div className="journey-card">
        {infoRows.map(r => (
          <div className="journey-row" key={r.label}>
            <span className="j-label">{r.label}</span>
            <span className={`j-value ${r.color || ''}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
