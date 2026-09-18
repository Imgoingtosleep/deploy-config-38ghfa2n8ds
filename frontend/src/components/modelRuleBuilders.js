/**
 * Turn what a user types or selects into the Python regex a model rule stores, so
 * nobody has to write regex for the usual cases. Every builder returns a pattern
 * whose group 1 is the model; the backend compiles and tests it.
 */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The rest of a model code: F, 48S6CQ, -L48T4X-A1, /K9 ...
const TAIL = '[A-Za-z0-9]*(?:[-_/.][A-Za-z0-9]+)*';
const START = '(?<![\\w-])';

export const BUILDER_MODES = [
  { key: 'example', label: 'Select from text', hint: 'Recommended' },
  { key: 'prefix', label: 'Starts with' },
  { key: 'after', label: 'After a label' },
  { key: 'regex', label: 'Regex (advanced)' },
];

/** Everything before the first digit, i.e. the product family: 'FortiGate-', 'S', 'WS-C', 'AirEngine ' */
export const familyOf = (example) => {
  const m = (example || '').trim().match(/^[^\d]*/);
  return m ? m[0] : '';
};

/** 'FortiGate-100F' -> models of the same family: FortiGate-60E, FortiGate-3000D ... */
export function patternFromExample(example) {
  const ex = (example || '').trim();
  if (!ex) return '';
  const family = familyOf(ex);
  if (family === ex) return `${START}(${esc(ex).replace(/\s+/g, '\\s+')})(?![\\w-])`;
  return `${START}(${esc(family).replace(/\s+/g, '\\s+')}\\d+${TAIL})`;
}

/** 'FortiGate-' -> any model code starting with it */
export function patternFromPrefix(prefix) {
  const p = (prefix || '').trim();
  if (!p) return '';
  // 'FortiGate-' needs at least one more character, 'S57' may already be the whole model
  const more = /[A-Za-z0-9]$/.test(p) ? '[A-Za-z0-9]*' : '[A-Za-z0-9]+';
  return `${START}(${esc(p)}${more}(?:[-_/.][A-Za-z0-9]+)*)`;
}

/** 'Model' -> the word after 'Model:' / 'Model =' / 'Model ' */
export function patternFromLabel(label) {
  const l = (label || '').trim().replace(/[:=]\s*$/, '').trim();
  if (!l) return '';
  return `${esc(l).replace(/\s+/g, '\\s+')}\\s*[:=]?\\s*([^\\s,;]+)`;
}

export function buildPattern(mode, value, regex) {
  if (mode === 'example') return patternFromExample(value);
  if (mode === 'prefix') return patternFromPrefix(value);
  if (mode === 'after') return patternFromLabel(value);
  return regex || '';
}

/** One line a non-regex user can read: what the rule looks for */
export function describeRule(rule) {
  const v = rule.builder_value;
  if (rule.builder_mode === 'example' && v) {
    const family = familyOf(v);
    return family && family !== v.trim() ? `Models like “${v}” (“${family}” + number)` : `The model “${v}”`;
  }
  if (rule.builder_mode === 'prefix' && v) return `Model starts with “${v}”`;
  if (rule.builder_mode === 'after' && v) return `The word after “${v.replace(/[:=]\s*$/, '')}:”`;
  return 'Custom regex';
}
