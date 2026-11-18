'use strict';

const yaml = require('js-yaml');

const CATEGORIES = ['灵感', '技术', '项目', '阅读'];
const SENSITIVITIES = ['public', 'internal', 'secret'];
const STATUSES = ['active', 'archived', 'trashed'];
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

class FrontmatterError extends Error {
  constructor(message) { super(message); this.name = 'FrontmatterError'; this.code = 'EFRONTMATTER'; }
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(new Date(value).getTime());
}

function validateNoteData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FrontmatterError('Note frontmatter must be a mapping');
  const d = input;
  if (typeof d.id !== 'string' || !ID_PATTERN.test(d.id)) throw new FrontmatterError('Invalid note id');
  if (typeof d.title !== 'string' || d.title.length > 300) throw new FrontmatterError('Invalid note title');
  if (!CATEGORIES.includes(d.category)) throw new FrontmatterError('Unknown category: ' + d.category);
  if (!Array.isArray(d.tags) || d.tags.length > 32 || d.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 64)) throw new FrontmatterError('Invalid tags');
  if (typeof d.favorite !== 'boolean' || typeof d.inbox !== 'boolean') throw new FrontmatterError('Invalid flags');
  if (!SENSITIVITIES.includes(d.sensitivity)) throw new FrontmatterError('Invalid sensitivity');
  if (!STATUSES.includes(d.status)) throw new FrontmatterError('Invalid status');
  if (!isIsoDate(d.createdAt) || !isIsoDate(d.updatedAt)) throw new FrontmatterError('Invalid timestamps');
  if (!Number.isInteger(d.revision) || d.revision < 1) throw new FrontmatterError('Invalid revision');
  if (d.deletedAt != null && !isIsoDate(d.deletedAt)) throw new FrontmatterError('Invalid deletedAt');
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    tags: [...d.tags],
    favorite: d.favorite,
    inbox: d.inbox,
    sensitivity: d.sensitivity,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    revision: d.revision,
    ...(d.deletedAt ? { deletedAt: d.deletedAt } : {}),
  };
}

function parseNote(text) {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) throw new FrontmatterError('Missing or malformed YAML frontmatter');
  let data;
  try {
    data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new FrontmatterError('YAML parse failed: ' + error.message);
  }
  const validated = validateNoteData(data);
  return { data: validated, body: match[2] ?? '' };
}

function serializeNote(data, body) {
  const validated = validateNoteData(data);
  const yamlText = yaml.dump(validated, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true, sortKeys: true });
  return `---\n${yamlText}---\n${body ?? ''}`;
}

module.exports = { parseNote, serializeNote, validateNoteData, FrontmatterError, CATEGORIES, SENSITIVITIES, STATUSES, ID_PATTERN };
