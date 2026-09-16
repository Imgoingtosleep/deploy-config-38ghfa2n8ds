import React from 'react';

// Inline SVG attributes (not CSS classes) so exported SVG / PNG keep their colors
export const ROLE_STYLE = {
  router: { fill: '#0e7490', stroke: '#22d3ee', text: '#67e8f9', label: 'Router' },
  switch: { fill: '#3730a3', stroke: '#818cf8', text: '#a5b4fc', label: 'Switch' },
  firewall: { fill: '#9a3412', stroke: '#fb923c', text: '#fdba74', label: 'Firewall' },
  server: { fill: '#166534', stroke: '#4ade80', text: '#86efac', label: 'Server' },
  cloud: { fill: '#1e3a5f', stroke: '#7dd3fc', text: '#bae6fd', label: 'Cloud / ISP' },
  pc: { fill: '#3f3f46', stroke: '#d4d4d8', text: '#e4e4e7', label: 'PC / Host' },
  wireless: { fill: '#6b21a8', stroke: '#c084fc', text: '#d8b4fe', label: 'Wireless AP' },
  unknown: { fill: '#334155', stroke: '#94a3b8', text: '#94a3b8', label: 'Unknown model' },
};

const ARROWS = { stroke: '#ffffff', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

export function NodeIcon({ role, selected }) {
  const s = ROLE_STYLE[role] || ROLE_STYLE.unknown;
  const stroke = selected ? '#fbbf24' : s.stroke;
  const strokeWidth = selected ? 3 : 2;
  const base = { fill: s.fill, stroke, strokeWidth };
  switch (role) {
    case 'router':
      return (
        <g>
          <circle r={18} {...base} />
          <path
            d="M-12,0 L-4,0 M-7,-3 L-4,0 L-7,3 M12,0 L4,0 M7,-3 L4,0 L7,3 M0,-4 L0,-12 M-3,-9 L0,-12 L3,-9 M0,4 L0,12 M-3,9 L0,12 L3,9"
            {...ARROWS}
          />
        </g>
      );
    case 'switch':
      return (
        <g>
          <rect x={-22} y={-14} width={44} height={28} rx={5} {...base} />
          <path d="M-13,-5 L13,-5 M9,-9 L13,-5 L9,-1 M13,5 L-13,5 M-9,1 L-13,5 L-9,9" {...ARROWS} />
        </g>
      );
    case 'firewall':
      return (
        <g>
          <rect x={-20} y={-16} width={40} height={32} rx={3} {...base} />
          <path d="M-20,-5 L20,-5 M-20,6 L20,6 M-6,-16 L-6,-5 M8,-5 L8,6 M-2,6 L-2,16" {...ARROWS} strokeWidth={1.3} />
        </g>
      );
    case 'server':
      return (
        <g>
          <rect x={-14} y={-20} width={28} height={40} rx={3} {...base} />
          <path d="M-8,-11 L8,-11 M-8,-3 L8,-3 M-8,5 L8,5" {...ARROWS} />
          <circle cx={7} cy={13} r={1.8} fill="#ffffff" />
        </g>
      );
    case 'cloud':
      return (
        <path
          d="M-15,12 C-26,12 -26,-2 -16,-3 C-17,-15 -2,-19 3,-9 C8,-16 20,-12 18,-2 C28,-1 27,12 17,12 Z"
          {...base}
        />
      );
    case 'pc':
      return (
        <g>
          <rect x={-18} y={-17} width={36} height={25} rx={3} {...base} />
          <path d="M-7,15 L7,15 M0,8 L0,15" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      );
    case 'wireless':
      return (
        <g>
          <circle r={16} {...base} />
          <path d="M-8,-2 Q0,-10 8,-2 M-4.5,2 Q0,-3 4.5,2" {...ARROWS} />
          <circle cy={6} r={2} fill="#ffffff" />
        </g>
      );
    default:
      return (
        <g>
          <circle r={16} {...base} />
          <text y={5} textAnchor="middle" fill="#e2e8f0" fontSize={14} fontWeight={700}>
            ?
          </text>
        </g>
      );
  }
}
