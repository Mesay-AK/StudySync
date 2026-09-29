// Escapes regex metacharacters so user input can be safely used inside a
// MongoDB $regex query without enabling regex-injection or ReDoS via
// attacker-supplied patterns (e.g. nested quantifiers like "(a+)+$").
export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
