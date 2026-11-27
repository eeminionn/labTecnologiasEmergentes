const statuses = new Set(['present', 'absent', 'unmarked']);
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short' });
const displayDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', dateStyle: 'long' });

export function councilDateLabel(date) {
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(value.getTime()) ? displayDate.format(value) : '';
}

export function attendanceSummary(people) {
  const present = people.filter(person => person.status === 'present').length;
  const absent = people.filter(person => person.status === 'absent').length;
  return `${present} ${present === 1 ? 'presente' : 'presentes'} · ${absent} ${absent === 1 ? 'ausente' : 'ausentes'} · ${people.length - present - absent} sin marcar`;
}

const normalizedName = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').normalize('NFC') : '';
const nameKey = value => normalizedName(value).toLocaleLowerCase('es-CL');

export function createCouncilAttendance(roster, { now = new Date(), storage } = {}) {
  const date = dateKey.format(now);
  const storageKey = `mlr-council-attendance-${date}`;
  const people = new Map(roster.map(({ name }) => [nameKey(name), { name, status: 'unmarked', fixed: true }]));
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) for (const person of saved) {
      const name = normalizedName(person?.name);
      const id = nameKey(name);
      if (!name || name.length > 80 || !statuses.has(person.status)) continue;
      const member = people.get(id);
      if (member) member.status = person.status;
      else people.set(id, { name, status: person.status, fixed: false });
    }
  } catch { /* An unavailable or malformed register starts with the fixed names. */ }

  const list = () => [...people.values()].map(person => ({ ...person }));
  const fixed = () => list().filter(person => person.fixed).map(({ name, status }) => ({ name, status }));
  function save() {
    if (!storage) return false;
    try {
      storage.setItem(storageKey, JSON.stringify(list()));
      return true;
    } catch { return false; }
  }

  return {
    date, list, fixed,
    mark(name, status) {
      const person = people.get(nameKey(name));
      if (!person || !statuses.has(status)) return null;
      person.status = person.status === status ? 'unmarked' : status;
      return save();
    },
    add(value) {
      const name = normalizedName(value);
      if (!name || name.length > 80) return { error: 'Escribe un nombre de hasta 80 caracteres.' };
      const id = nameKey(name);
      if (people.has(id)) return { error: 'Ese nombre ya está en la lista.' };
      people.set(id, { name, status: 'unmarked', fixed: false });
      return { name, saved: save() };
    },
    remove(name) {
      const id = nameKey(name);
      if (people.get(id)?.fixed || !people.delete(id)) return null;
      return save();
    },
  };
}
