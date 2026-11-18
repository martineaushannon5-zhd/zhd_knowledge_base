'use strict';

// Model adapter contract:
//   adapter = { name, generate({ query, context }) -> Promise<{ text, citations: string[] }> }
//   context = [{ id, title, body }]  (treated as UNTRUSTED data by the QA engine)
// The engine (qa.cjs) owns refusal and citation validation, so a adapter — or
// instructions embedded in note bodies — cannot bypass them.

function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>|[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Offline, extractive, zero-network adapter. It does NOT generate new claims;
// it surfaces retrieved snippets with citations. Clearly labelled so the UI can
// show that no real model is connected.
const OfflineExtractiveAdapter = {
  name: 'offline-extractive',
  async generate({ query, context }) {
    if (!context || !context.length) return { text: '', citations: [] };
    const parts = context.slice(0, 3).map(n => {
      const snippet = stripMarkdown(n.body).slice(0, 160);
      return `《${n.title}》：${snippet}${snippet.length >= 160 ? '…' : ''}`;
    });
    const text = `（离线检索摘要，未连接生成模型）围绕「${query}」，知识库中相关的记录：\n\n${parts.join('\n\n')}`;
    return { text, citations: context.slice(0, 3).map(n => n.id) };
  },
};

// Placeholder for a cloud adapter. Real implementation requires explicit user
// authorization (provider + content egress) and secret handling; it is NOT
// wired up and performs no network calls. Calling it refuses by design.
function createCloudAdapter(config = {}) {
  return {
    name: 'cloud-unconfigured',
    async generate() {
      if (!config.authorized) throw new Error('云模型未获授权：需用户明确同意提供商与内容外发后方可实现与调用');
      throw new Error('云模型适配器尚未实现');
    },
  };
}

module.exports = { OfflineExtractiveAdapter, createCloudAdapter, stripMarkdown };
