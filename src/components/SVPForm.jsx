import { STATIONS, LINE_ICON } from '../constants/stations.js'

export default function SVPForm({ values, onChange, onGenerate, loading }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  return (
    <div className="card">
      <div className="card-title">SVP Configuration</div>

      <div className="form-group">
        <label>Source Station</label>
        <select value={values.srcCode} onChange={set('srcCode')}>
          {STATIONS.map(s => (
            <option key={s.code} value={s.code}>
              {LINE_ICON[s.line]} {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Destination Station</label>
        <select value={values.dstCode} onChange={set('dstCode')}>
          {STATIONS.map(s => (
            <option key={s.code} value={s.code}>
              {LINE_ICON[s.line]} {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>SVP Balance (₹)</label>
          <input
            type="number" min="50" max="10000" step="50"
            value={values.balanceRupees}
            onChange={set('balanceRupees')}
          />
          <div className="form-hint">Min ₹50 floor always held</div>
        </div>
        <div className="form-group">
          <label>Ticket Fare (₹)</label>
          <input
            type="number" min="5" max="200" step="5"
            value={values.fareRupees}
            onChange={set('fareRupees')}
          />
        </div>
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

      <button className="btn" onClick={onGenerate} disabled={loading}>
        {loading ? '⏳ Generating…' : '⚡ Generate SVP QR'}
      </button>
    </div>
  )
}
