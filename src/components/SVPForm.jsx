export default function SVPForm({ values, onChange, onGenerate, loading }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  return (
    <div className="card">
      <div className="card-title">SVP Configuration</div>

      <div className="form-group">
        <label>SVP Balance (₹)</label>
        <input
          type="number" min="50" max="10000" step="50"
          value={values.balanceRupees}
          onChange={set('balanceRupees')}
        />
        <div className="form-hint">Min ₹50 floor always held. Fare deducted by AFC at exit.</div>
      </div>

      <div className="form-group">
        <label>Mobile Number</label>
        <input
          type="text" maxLength={10}
          value={values.mobile}
          onChange={set('mobile')}
        />
        <div className="form-hint">10-digit, encoded in QR (Table 5.4)</div>
      </div>

      <div className="form-group">
        <label>
          TXN Reference No
          <span className="badge">22 chars</span>
        </label>
        <input
          type="text" maxLength={22}
          value={values.txnRef}
          onChange={set('txnRef')}
        />
      </div>

      <div className="form-group">
        <label>QR Refresh Interval (seconds)</label>
        <input
          type="number" min="5" max="300" step="5"
          value={values.refreshSecs}
          onChange={set('refreshSecs')}
        />
        <div className="form-hint">TAG 84 QR Updated Time refreshes on this interval (min 5 s)</div>
      </div>

      <div className="form-group">
        <label>Security Scheme</label>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          {[
            { val: 3, label: '0x03 — RSA only', hint: 'Sign only, no encryption' },
            { val: 4, label: '0x04 — AES + RSA', hint: 'Encrypt ticket, then sign' },
          ].map(({ val, label, hint }) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
              <input
                type="radio"
                name="scheme"
                value={val}
                checked={Number(values.scheme) === val}
                onChange={() => onChange({ ...values, scheme: val })}
              />
              <span>
                <strong>{label}</strong>
                <span className="form-hint" style={{ marginTop: 0, display: 'block' }}>{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <button className="btn" onClick={onGenerate} disabled={loading}>
        {loading ? '⏳ Generating…' : '⚡ Generate SVP QR'}
      </button>
    </div>
  )
}
