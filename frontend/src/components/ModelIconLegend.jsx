import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Shapes, Wand2 } from 'lucide-react';
import { NodeIcon, ROLE_STYLE } from './topologyIcons';

/**
 * "Which model is drawn with which icon" for the current result: one row per
 * model, with the icon the topology uses, how many devices have it and where
 * the icon came from (a model rule, the built-in guess, or nothing yet).
 *
 * nodes:   report.topology.nodes
 * onTeach: (row) => void — open Model Rules on a sample of that model
 */
export default function ModelIconLegend({ nodes = [], onTeach }) {
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => {
    const byModel = new Map();
    nodes.forEach((n) => {
      const model = n.model || '';
      const role = n.role || 'unknown';
      const key = `${model}|${role}`;
      const row = byModel.get(key) || {
        key,
        model,
        role,
        source: n.role_source || (model ? 'builtin' : 'none'),
        rule: n.role_rule || '',
        devices: [],
      };
      row.devices.push(n.hostname);
      byModel.set(key, row);
    });
    // Models without an icon first - those are the ones worth teaching
    return [...byModel.values()].sort(
      (a, b) =>
        Number(Boolean(a.model)) - Number(Boolean(b.model)) ||
        b.devices.length - a.devices.length ||
        a.model.localeCompare(b.model)
    );
  }, [nodes]);

  if (!rows.length) return null;
  const unknown = rows.filter((r) => !r.model).reduce((n, r) => n + r.devices.length, 0);

  return (
    <div className="lldp-legend">
      <button type="button" className="lldp-legend-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Shapes className="h-3.5 w-3.5" />
        <span>Model &rarr; Icon in this result</span>
        <span className="lldp-legend-count">
          {rows.length} model(s){unknown ? `, ${unknown} device(s) without a model` : ''}
        </span>
      </button>

      {open && (
        <div className="lldp-legend-rows">
          {rows.map((r) => (
            <div className={`lldp-legend-row${r.model ? '' : ' unknown'}`} key={r.key}>
              <svg width={26} height={26} viewBox="-22 -22 44 44">
                <NodeIcon role={r.role} />
              </svg>
              <span className="lldp-legend-model">{r.model || 'no model'}</span>
              <span className="lldp-legend-role">{ROLE_STYLE[r.role]?.label || r.role}</span>
              <span className="lldp-legend-devs" title={r.devices.join(', ')}>
                {r.devices.length} device{r.devices.length > 1 ? 's' : ''}: {r.devices.slice(0, 3).join(', ')}
                {r.devices.length > 3 ? ' ...' : ''}
              </span>
              <span className="lldp-legend-src">
                {r.source === 'rule' ? `rule: ${r.rule}` : r.source === 'builtin' ? 'built-in guess' : 'no model read'}
              </span>
              {onTeach && (
                <button
                  className="lldp-btn-secondary lldp-btn-mini"
                  onClick={() => onTeach(r)}
                  title={
                    r.source === 'rule'
                      ? 'Edit the model rules that decide this icon'
                      : 'Teach the model / pick another icon for it'
                  }
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {r.source === 'rule' ? 'Rules' : r.model ? 'Change icon' : 'Teach'}
                </button>
              )}
            </div>
          ))}
          <span className="lldp-hint">
            A model rule with a device type wins over the built-in guess (AR / NE / ISR / ASR ... are routers, any other
            model read is a switch).
          </span>
        </div>
      )}
    </div>
  );
}
