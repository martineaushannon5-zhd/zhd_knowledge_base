'use strict';

// Retrieval-augmented QA engine. Refusal and citation integrity are enforced
// here (engine-side), independent of the adapter, so neither a misbehaving
// adapter nor prompt-injection text inside notes can bypass them.
async function ask(vault, query, adapter, { limit = 5 } = {}) {
  const q = typeof query === 'string' ? query.trim() : '';
  const base = { adapter: adapter && adapter.name, retrieved: 0 };
  if (!q) return { ...base, refused: true, reason: 'no-basis', answer: '请先输入一个问题。', citations: [] };

  // vault.search already excludes secret-sensitivity and trashed notes.
  const hits = await vault.search(q, { limit });
  if (!hits || !hits.length) {
    return { ...base, refused: true, reason: 'no-basis', answer: '知识库中没有找到相关依据，无法回答。可以换个关键词，或先记录相关内容。', citations: [] };
  }

  const notes = await Promise.all(hits.map(h => vault.getNote(h.id)));
  const context = notes.filter(n => n && n.sensitivity !== 'secret').map(n => ({ id: n.id, title: n.title, body: n.body }));
  if (!context.length) {
    return { ...base, refused: true, reason: 'no-basis', answer: '知识库中没有可用的相关依据，无法回答。', citations: [] };
  }

  const result = await adapter.generate({ query: q, context });
  const validIds = new Set(context.map(c => c.id));
  const seen = new Set();
  const citations = [];
  for (const id of (result && result.citations) || []) {
    if (validIds.has(id) && !seen.has(id)) { seen.add(id); citations.push({ id, title: context.find(c => c.id === id).title }); }
  }
  const text = (result && typeof result.text === 'string' && result.text.trim()) ? result.text.trim() : '（适配器未返回内容）';
  return { ...base, refused: false, answer: text, citations, retrieved: context.length };
}

module.exports = { ask };
