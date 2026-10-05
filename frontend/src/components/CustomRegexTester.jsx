import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Wand2 } from 'lucide-react';
import { getCommandSampleOutput, testCustomRegex } from '../services/api';

// Named groups a 'custom' parser regex reads a neighbor from (local_port is required)
const GROUPS = [
  ['local_port', 'Local port'],
  ['remote_device', 'Neighbor name'],
  ['remote_port', 'Neighbor port'],
  ['remote_ip', 'Neighbor IP'],
  ['remote_model', 'Neighbor model'],
];

const IP_RE = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d+)?$/;
// GE0/0/1, Eth0/0/24, Gi1/0/1, xe-0/0/1, p1, 1/1/1 - not a bare number (hold time, TTL)
const PORT_RE = /^(?=.*[A-Za-z/])[A-Za-z-]*\d+(?:[/.:]\d+)*$/;
// Chassis ID columns: e028.6123.e198, e0-28-61-37-e1-98, e0:28:61:37:e1:98
const MAC_RE = /^(?:[0-9a-f]{4}[.-]){2}[0-9a-f]{4}$|^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

// One table row split into cells: '|' tables by the pipes, others by whitespace
const splitRow = (line) =>
  line.includes('|')
    ? line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
    : line.trim().split(/\s+/);

// Lines that look like a neighbor row: two cells or more, one of them a port
const candidateRows = (sample) =>
  sample
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^[\s\-=+|]+$/.test(line))
    .filter((line) => {
      const cells = splitRow(line);
      return cells.length >= 2 && cells.some((c) => PORT_RE.test(c));
    })
    .slice(0, 12);

// First guess of which cell is which: first port = local, next name = neighbor, next port = its port
const guessMapping = (cells) => {
  const map = cells.map(() => '');
  const take = (group, test) => {
    const i = cells.findIndex((c, idx) => !map[idx] && test(c));
    if (i >= 0) map[i] = group;
  };
  take('local_port', (c) => PORT_RE.test(c));
  take('remote_ip', (c) => IP_RE.test(c));
  take('remote_device', (c) => !PORT_RE.test(c) && !/^\d+$/.test(c) && !IP_RE.test(c) && !MAC_RE.test(c) && c.length > 1);
  take('remote_port', (c) => PORT_RE.test(c));
  return map;
};

// Python regex for rows laid out like the picked one: every cell up to the last mapped one
const buildRegex = (line, map) => {
  const pipe = line.includes('|');
  const last = map.reduce((acc, g, i) => (g ? i : acc), -1);
  if (last < 0) return '';
  const cells = map.slice(0, last + 1).map((group) => {
    // The local port must hold a digit: header and separator lines do not
    if (pipe) {
      if (group === 'local_port') return '(?P<local_port>[^|\\s]*\\d[^|]*?)';
      return group ? `(?P<${group}>[^|]*?)` : '[^|]*?';
    }
    if (group === 'local_port') return '(?P<local_port>\\S*\\d\\S*)';
    return group ? `(?P<${group}>\\S+)` : '\\S+';
  });
  return pipe
    ? `^\\s*\\|?\\s*${cells.join('\\s*\\|\\s*')}\\s*(?:\\||$)`
    : `^\\s*${cells.join('\\s+')}`;
};

/**
 * Try and build a 'custom' parser regex against sample output: fetch the output from a
 * fleet device (or paste it), map the cells of one row to fields to generate the regex,
 * and see the neighbors it reads, exactly as the scan would.
 */
export default function CustomRegexTester({ command, pattern, onUseRegex, fleet = [], driver }) {
  const devices = useMemo(() => fleet.filter((d) => d.host && d.host.trim()), [fleet]);
  const perPort = (command || '').includes('{intf}');
  const [sample, setSample] = useState('');
  const [host, setHost] = useState(devices[0]?.host || '');
  const [intf, setIntf] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [result, setResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [rowIdx, setRowIdx] = useState(0);
  const [mapping, setMapping] = useState([]);

  const rows = useMemo(() => candidateRows(sample), [sample]);
  const row = rows[Math.min(rowIdx, rows.length - 1)] || '';
  const cells = useMemo(() => (row ? splitRow(row) : []), [row]);

  useEffect(() => {
    if (!host && devices[0]) setHost(devices[0].host);
  }, [devices, host]);

  // A new row to map: start from a guess
  useEffect(() => {
    setMapping(guessMapping(cells));
  }, [row]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live result, a moment after the sample or the regex stops changing
  useEffect(() => {
    if (!sample.trim() || !pattern?.trim()) {
      setResult(null);
      return undefined;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setTesting(true);
      try {
        const res = await testCustomRegex(sample, pattern, perPort ? intf.trim() || '{intf}' : null);
        if (!stale) setResult(res);
      } catch (err) {
        if (!stale) setResult({ rows: [], error: err.message || 'Test failed' });
      } finally {
        if (!stale) setTesting(false);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [sample, pattern, intf, perPort]);

  const handleFetch = async () => {
    const dev = devices.find((d) => d.host === host);
    if (!dev || !command) return;
    if (perPort && !intf.trim()) {
      setFetchError('Enter the local port to put in {intf}, e.g. GE0/0/1');
      return;
    }
    setFetching(true);
    setFetchError('');
    try {
      const payload = {
        name: dev.name || '',
        host: dev.host.trim(),
        port: parseInt(dev.port, 10) || 22,
        device_type: dev.device_type || 'autodetect',
        username: dev.username || '',
        password: dev.password || '',
        secret: dev.secret || '',
        connection_mode: 'network',
        profile_id: dev.profile_id || null,
        credential_pool: dev.credential_pool || null,
        fallback_profile_ids: dev.fallback_profile_ids || null,
      };
      const res = await getCommandSampleOutput(payload, command.replace('{intf}', intf.trim()), driver);
      if (res.success) setSample(res.output || '');
      else setFetchError(res.error || 'The command failed');
    } catch (err) {
      setFetchError(err.response?.data?.detail || err.message || 'Could not run the command');
    } finally {
      setFetching(false);
    }
  };

  const built = buildRegex(row, mapping);
  const hasLocal = mapping.includes('local_port');

  return (
    <div className="lldp-rx-tester">
      <div className="lldp-rx-step">
        <span className="lldp-rx-step-no">1</span>
        <span>Sample output — fetch it from a device, or paste it</span>
      </div>
      <div className="lldp-rx-fetch">
        {devices.length > 0 ? (
          <select value={host} onChange={(e) => setHost(e.target.value)}>
            {devices.map((d) => (
              <option key={d.id || d.host} value={d.host}>
                {d.name ? `${d.name} (${d.host})` : d.host}
              </option>
            ))}
          </select>
        ) : (
          <span className="lldp-hint">Add a device to the fleet list to fetch from it</span>
        )}
        {perPort && (
          <input value={intf} onChange={(e) => setIntf(e.target.value)} placeholder="{intf} e.g. GE0/0/1" />
        )}
        <button
          type="button"
          className="lldp-btn-secondary lldp-btn-mini"
          onClick={handleFetch}
          disabled={fetching || !devices.length || !command}
          title={command ? `Run '${command}' on the device` : 'Enter the command first'}
        >
          {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Fetch
        </button>
      </div>
      {fetchError && <span className="lldp-hint error">{fetchError}</span>}
      <textarea
        className="lldp-rx-sample"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
        placeholder="Command output appears here — or paste it"
        rows={6}
        spellCheck={false}
      />

      {rows.length > 0 && (
        <>
          <div className="lldp-rx-step">
            <span className="lldp-rx-step-no">2</span>
            <span>Build the regex: say what each cell of a neighbor row is</span>
          </div>
          {rows.length > 1 && (
            <select className="lldp-rx-rowpick" value={Math.min(rowIdx, rows.length - 1)} onChange={(e) => setRowIdx(Number(e.target.value))}>
              {rows.map((r, i) => (
                <option key={i} value={i}>{r.trim()}</option>
              ))}
            </select>
          )}
          <div className="lldp-rx-cells">
            {cells.map((c, i) => (
              <label key={i} className={`lldp-rx-cell ${mapping[i] ? 'mapped' : ''}`}>
                <code>{c}</code>
                <select
                  value={mapping[i] || ''}
                  onChange={(e) => setMapping((prev) => prev.map((g, j) => (j === i ? e.target.value : g === e.target.value ? '' : g)))}
                >
                  <option value="">— skip —</option>
                  {GROUPS.map(([g, label]) => (
                    <option key={g} value={g}>{label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="lldp-rx-built">
            <code>{built || 'Pick at least the local port'}</code>
            <button
              type="button"
              className="lldp-btn-primary lldp-btn-mini"
              disabled={!built || (!hasLocal && !perPort) || built === pattern}
              onClick={() => onUseRegex(built)}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {built && built === pattern ? 'In use' : 'Use this regex'}
            </button>
          </div>
        </>
      )}

      <div className="lldp-rx-step">
        <span className="lldp-rx-step-no">{rows.length > 0 ? 3 : 2}</span>
        <span>Result — the neighbors the regex reads, as the scan would</span>
        {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </div>
      {!sample.trim() || !pattern?.trim() ? (
        <span className="lldp-hint">{!pattern?.trim() ? 'Write or build a regex to see the result' : 'Add sample output to see the result'}</span>
      ) : result?.error && !result.rows?.length ? (
        <span className="lldp-hint error">{result.error}</span>
      ) : result ? (
        <>
          {result.error && <span className="lldp-hint error">{result.error}</span>}
          <span className={`lldp-hint ${result.rows.length ? 'ok' : 'error'}`}>
            {result.rows.length ? `${result.rows.length} neighbor(s) read` : 'The regex matched nothing in this output'}
          </span>
          {result.rows.length > 0 && (
            <div className="lldp-table-wrap">
              <table className="lldp-table lldp-rx-table">
                <thead>
                  <tr>
                    {GROUPS.map(([g, label]) => (
                      <th key={g}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      {GROUPS.map(([g]) => (
                        <td key={g}>{r[g] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
