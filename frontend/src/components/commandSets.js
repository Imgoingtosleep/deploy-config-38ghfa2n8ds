// Command profiles (Health Check / Troubleshoot) as command sets: each set lists the drivers
// it is for and the commands they run, as written. 'default' = any driver no set lists.

export const DEFAULT_DRIVER = 'default';

// Old profiles kept one row per command with a column per vendor. What each driver ran
// before, with the same fallbacks (Comware used the Huawei column, NX-OS the Cisco one)
const LEGACY_COLUMNS = [
  [['huawei'], (r) => r.huawei || r.name],
  [['hp_comware'], (r) => r.comware || r.huawei || r.name],
  [['cisco_ios'], (r) => r.cisco || r.name],
  [['cisco_nxos'], (r) => r.nxos || r.cisco || r.name],
  [['juniper_junos'], (r) => r.juniper || r.name],
  [['aruba_os'], (r) => r.aruba || r.name],
  [['mikrotik_routeros'], (r) => r.mikrotik || r.name],
];

const clean = (sets) =>
  sets
    .map((s) => {
      const pairs = (s.commands || [])
        .map((c, i) => [String(c || '').trim(), String((s.regexes || [])[i] || '').trim()])
        .filter(([c]) => c);
      return { drivers: [...new Set(s.drivers || [])], commands: pairs.map(([c]) => c), regexes: pairs.map(([, r]) => r) };
    })
    .filter((s) => s.drivers.length && s.commands.length);

// The profile's command sets; an old per-vendor profile is converted (vendors with the
// same commands share a set, and other drivers get the Cisco set, as they did before)
export function playbookSets(playbook) {
  if (Array.isArray(playbook?.command_sets) && playbook.command_sets.length) return clean(playbook.command_sets);
  const rows = (playbook?.commands || []).map((c) => (typeof c === 'string' ? { name: c } : c));
  const groups = [];
  LEGACY_COLUMNS.forEach(([drivers, pick]) => {
    const commands = rows.map((r) => String(pick(r) || '').trim());
    if (!commands.some(Boolean)) return;
    const regexes = rows.map((r) => r.regex || '');
    const same = groups.find((g) => g.commands.join('\n') === commands.join('\n'));
    if (same) same.drivers.push(...drivers);
    else groups.push({ drivers: [...drivers], commands, regexes });
  });
  const fallback = groups.find((g) => g.drivers.includes('cisco_ios')) || groups[0];
  if (fallback) fallback.drivers.push(DEFAULT_DRIVER);
  return clean(groups);
}

// Checklist rows for a loaded profile: one per command, remembering its set
export function setItems(sets) {
  return sets.flatMap((s, si) =>
    s.commands.map((c, li) => ({
      id: `set${si}-${li}`,
      name: c,
      setIndex: si,
      drivers: s.drivers,
      regex: s.regexes?.[li] || '',
    }))
  );
}

// Sets to run from the ticked checklist rows; a row with setIndex 'all' (added by hand) goes
// into every set
export function setsFromItems(sets, items) {
  return clean(
    sets.map((s, si) => {
      const rows = items.filter((it) => it.setIndex === si || it.setIndex === 'all');
      return { drivers: s.drivers, commands: rows.map((r) => r.name), regexes: rows.map((r) => r.regex || '') };
    })
  );
}

// Commands a device runs with this profile (the largest set)
export const profileCommandCount = (playbook) =>
  Math.max(0, ...playbookSets(playbook).map((s) => s.commands.length));

export { clean as cleanSets };
