'use strict';

/**
 * Reproducible 10k-note Chinese full-text search benchmark.
 *
 * Run: node scripts/benchmark.cjs   (from spike/electron)
 *
 * - Fixed-seed PRNG corpus (10000 notes, ~2KiB body each, zh/en mixed, code
 *   blocks, numbers, punctuation, 4 categories, 3 tags from a fixed pool).
 * - 100 fixed queries: 40 zh (1/2/multi char), 20 zh+en mixed, 20 tag/category,
 *   10 special chars, 10 expected-empty.
 * - Ground truth is construction-determined: marker phrases are injected into
 *   deterministic note batches, then truth = notes whose (title+body+tags)
 *   contains the query string (ASCII case-insensitive). Tag/category queries
 *   use the same substring rule over text that includes the tag list and a
 *   "集合：<category>" body line.
 * - Timing: 20 warmup searches, then 100 queries x 10 rounds in fixed order,
 *   each sample = await vault.search(q, {limit:10}) wall time (segment+SQLite).
 * - Recall@10 = |top10 ∩ truth| / min(10, |truth|), for the 80 relevance queries.
 * - Output: test-results/benchmark.json + console summary. Temp vault removed.
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { openVault } = require('../electron/vault/store.cjs');
const { SEGMENTER_VERSION } = require('../electron/vault/search-index.cjs');

const SEED = 20261120;
const GENERATOR_VERSION = 'bench-corpus-1';
const NOTE_COUNT = 10000;
const TARGET_BODY_BYTES = 2048;
const ROUNDS = 10;
const WARMUP_QUERIES = 20;
const LIMIT = 10;
const P95_BUDGET_MS = 500;
const CATEGORIES = ['灵感', '技术', '项目', '阅读'];

// ---------------------------------------------------------------- PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function int(n) { return Math.floor(rng() * n); }

// ---------------------------------------------------------------- corpus pools
// Common vocabulary only. Rare marker characters (熵鳍燧珩玑岚骁翎曜岑隧戴曲率戴森 etc.)
// are deliberately absent from these pools so marker batches stay distinctive.
const CN_TOPICS = ['分布式系统', '缓存一致性', '消息队列', '服务治理', '负载均衡', '数据库事务', '索引优化', '查询计划', '并发控制', '锁竞争', '内存管理', '垃圾回收', '线程调度', '网络协议', '拥塞窗口', '重传机制', '磁盘调度', '文件系统', '日志结构', '快照隔离'];
const CN_SUBJECTS = ['我们在压测中发现', '复盘会上提到', '文档里写道', '实验结果表明', '监控面板显示', '代码评审时注意到', '线上告警提示', '灰度阶段观察到'];
const CN_PREDICATES = ['吞吐量出现抖动', '延迟明显上升', '错误率保持平稳', '资源占用偏高', '命中率逐步回升', '队列积压严重', '连接数接近上限', '副本同步滞后'];
const CN_ASPECTS = ['边界条件', '失败路径', '回滚策略', '观测指标', '容量规划', '降级预案', '一致性窗口', '冷启动开销'];
const EN_WORDS = ['sqlite', 'rust', 'electron', 'docker', 'redis', 'kafka', 'react', 'vue', 'tcp', 'http', 'gpu', 'cpu', 'ssd', 'api', 'json', 'yaml', 'websocket', 'grpc', 'oauth', 'wasm', 'linux'];
const EN_NOUNS = ['buffer', 'latency', 'throughput', 'shard', 'replica', 'commit', 'rollback', 'snapshot', 'pipeline', 'scheduler'];
const EN_ADJ = ['stable', 'unstable', 'bounded', 'noisy', 'predictable', 'degraded'];
const CODE_SNIPPETS = [
  '```js\nconst total = items.reduce((a, b) => a + b, 0);\nconsole.log(total);\n```',
  '```py\ndef retry(fn, n=3):\n    for i in range(n):\n        try:\n            return fn()\n        except Exception:\n            pass\n```',
  '```sql\nSELECT id, title FROM notes WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 20;\n```',
  '```sh\nfor f in notes/*.md; do wc -c "$f"; done\n```',
];
const TAG_POOL = ['算法', '数据库', '前端', '后端', '网络', '安全', '运维', '测试', '设计', '产品', '读书', '随笔', '工具', '效率', '架构', '性能', '缓存', '并发', '分布式', '编译器', '操作系统', '数学', '物理', '杂记'];

// ---------------------------------------------------------------- queries & markers
// Relevance markers: phrase injected into a deterministic batch of notes.
const ZH_ONE_CHAR = ['熵', '鳍', '燧', '珩', '玑', '岚', '骁', '翎', '曜', '岑'];
const ZH_TWO_CHAR_RARE = ['熵变', '鳍状', '燧石', '珩磨', '玑衡'];
const ZH_TWO_CHAR_COMMON = ['缓存', '索引', '并发', '事务', '线程', '内存', '网络', '磁盘', '日志', '快照'];
const ZH_MULTI = ['量子隧穿效应', '潮汐锁定轨道', '曲率驱动引擎', '戴森球结构', '引力透镜观测', '神经拟态芯片', '光子矩阵计算', '碳基半导体', '拓扑绝缘体', '冷原子钟', '联邦学习框架', '知识图谱嵌入', '向量检索引擎', '增量索引合并', '写放大分析'];
const MIXED = ['SQLite索引', 'Rust所有权', 'Electron主进程', 'Docker容器', 'Redis缓存', 'Kafka吞吐量', 'React组件', 'Vue响应式', 'TCP拥塞控制', 'HTTP缓存策略', 'GPU并行', 'CPU流水线', 'SSD写放大', 'API网关', 'JSON序列化', 'YAML解析', 'WebSocket心跳', 'gRPC流控', 'OAuth令牌', 'WASM沙箱'];
const TAG_QUERIES = ['算法', '数据库', '前端', '后端', '安全', '运维', '读书', '随笔', '工具', '效率', '数学', '物理'];
const CATEGORY_QUERIES = [...CATEGORIES];
const CATEGORY_PHRASES = ['技术调研', '项目复盘', '阅读摘录', '灵感速记'];
const SPECIAL_QUERIES = ['C++', 'c#', 'a&b', '"引用"', '100%', 'node.js', 'foo(bar)', 'a OR b', 'NEAR(x y)', '标题：测试'];
const EMPTY_QUERIES = ['龘靐齉', 'xqzwvjk', '饕餮貔貅', 'zzqqxxjjww', '齾龗齼', 'plmoknijb', '驫驫驫', '麤麤麤', '%%%%', '---'];

// Markers get injected batches (zh one/two-rare/multi, mixed, category phrases).
const MARKERS = [
  ...ZH_ONE_CHAR, ...ZH_TWO_CHAR_RARE, ...ZH_MULTI, ...MIXED, ...CATEGORY_PHRASES,
];
const markerBatches = MARKERS.map((phrase, m) => {
  const size = 20 + (m % 5) * 10; // 20..60 notes
  const start = (m * 173) % NOTE_COUNT;
  const ids = new Set();
  for (let k = 0; k < size; k += 1) ids.add((start + k) % NOTE_COUNT);
  return { phrase, ids };
});
const markersPerNote = Array.from({ length: NOTE_COUNT }, () => []);
for (const { phrase, ids } of markerBatches) {
  for (const i of ids) markersPerNote[i].push(phrase);
}

const QUERIES = [
  ...ZH_ONE_CHAR.map(q => ({ q, group: 'zh', relevance: true })),
  ...ZH_TWO_CHAR_RARE.map(q => ({ q, group: 'zh', relevance: true })),
  ...ZH_TWO_CHAR_COMMON.map(q => ({ q, group: 'zh', relevance: true })),
  ...ZH_MULTI.map(q => ({ q, group: 'zh', relevance: true })),
  ...MIXED.map(q => ({ q, group: 'mixed', relevance: true })),
  ...TAG_QUERIES.map(q => ({ q, group: 'tag_category', relevance: true })),
  ...CATEGORY_QUERIES.map(q => ({ q, group: 'tag_category', relevance: true })),
  ...CATEGORY_PHRASES.map(q => ({ q, group: 'tag_category', relevance: true })),
  ...SPECIAL_QUERIES.map(q => ({ q, group: 'special', relevance: false })),
  ...EMPTY_QUERIES.map(q => ({ q, group: 'empty', relevance: false })),
];
if (QUERIES.length !== 100) throw new Error(`Expected 100 queries, got ${QUERIES.length}`);

// ---------------------------------------------------------------- corpus generation
function buildBody(category, markers, i) {
  const lines = [`集合：${category}。`];
  for (const mk of markers) lines.push(`本节聚焦${mk}，围绕${mk}展开记录与推导，结论见文末。`);
  // Deterministic special-character content so special queries can hit.
  if (i % 50 === 0) lines.push('```cpp\nint c = a + b; // C++ 示例\n```');
  if (i % 50 === 1) lines.push('```csharp\nvar c = a + b; // c# 示例\n```');
  if (i % 50 === 2) lines.push('表达式 a&b 的求值顺序需要确认。');
  if (i % 50 === 3) lines.push('他写下"引用"二字，然后继续。');
  if (i % 50 === 4) lines.push('当前完成度 100%，等待验收。');
  let bytes = Buffer.byteLength(lines.join('\n'), 'utf8');
  while (bytes < TARGET_BODY_BYTES) {
    const kind = int(4);
    let para;
    if (kind === 0) {
      para = `${pick(CN_SUBJECTS)}${pick(CN_PREDICATES)}，${pick(CN_TOPICS)}的${pick(CN_ASPECTS)}需要持续观察。${pick(CN_SUBJECTS)}${pick(CN_PREDICATES)}。`;
    } else if (kind === 1) {
      para = `The ${pick(EN_WORDS)} ${pick(EN_NOUNS)} shows ${pick(EN_ADJ)} ${pick(EN_NOUNS)} under load ${int(9000) + 1000}, see run ${int(999)}.`;
    } else if (kind === 2) {
      para = pick(CODE_SNIPPETS);
    } else {
      para = `指标 ${int(9999)}: p95=${int(400) + 10}ms, qps=${int(50000)}, 错误率 ${int(100) / 10}%，样本 ${int(100000)} 条。`;
    }
    lines.push(para);
    bytes += Buffer.byteLength('\n' + para, 'utf8');
  }
  return lines.join('\n');
}

function generateCorpus() {
  const notes = [];
  const base = Date.parse('2026-01-01T00:00:00Z');
  let bodyBytesTotal = 0;
  for (let i = 0; i < NOTE_COUNT; i += 1) {
    const id = `B-${String(i).padStart(5, '0')}`;
    const category = CATEGORIES[i % 4];
    const markers = markersPerNote[i];
    const title = markers.length > 0 && rng() < 0.5
      ? `${markers[0]}专题 ${id}`
      : `${pick(CN_TOPICS)}笔记 ${id}`;
    const body = buildBody(category, markers, i);
    // 3 distinct tags from the fixed pool.
    const tags = [];
    while (tags.length < 3) {
      const t = pick(TAG_POOL);
      if (!tags.includes(t)) tags.push(t);
    }
    bodyBytesTotal += Buffer.byteLength(body, 'utf8');
    notes.push({
      id, title, body, category, tags,
      createdAt: new Date(base + i * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });
  }
  return { notes, bodyBytesTotal };
}

// Construction-determined ground truth: substring containment over the full
// generated text (title + body + tags), ASCII case-insensitive.
function computeTruth(notes) {
  const haystacks = notes.map(n => `${n.title}\n${n.body}\n${n.tags.join(' ')}`.toLowerCase());
  const truth = new Map();
  for (const { q } of QUERIES) {
    const needle = q.toLowerCase();
    const ids = new Set();
    for (let i = 0; i < notes.length; i += 1) {
      if (haystacks[i].includes(needle)) ids.add(notes[i].id);
    }
    truth.set(q, ids);
  }
  return truth;
}

// ---------------------------------------------------------------- stats helpers
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[idx];
}
function median(sorted) {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const round3 = x => (x == null ? null : Math.round(x * 1000) / 1000);

async function fileSizeOrNull(p) {
  try { return (await fs.stat(p)).size; } catch { return null; }
}

// ---------------------------------------------------------------- main
async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[bench] generating corpus: seed=${SEED} generator=${GENERATOR_VERSION} notes=${NOTE_COUNT}`);
  const { notes, bodyBytesTotal } = generateCorpus();
  const truth = computeTruth(notes);
  for (const { q, group } of QUERIES) {
    if (group === 'empty' && truth.get(q).size > 0) {
      console.warn(`[bench] WARNING: expected-empty query "${q}" has ${truth.get(q).size} truth notes`);
    }
  }
  console.log(`[bench] corpus ready: bodyBytesTotal=${bodyBytesTotal} avgBodyBytes=${Math.round(bodyBytesTotal / NOTE_COUNT)}`);

  const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhd-bench-'));
  console.log(`[bench] temp vault: ${vaultDir}`);
  let vault = null;
  let closed = false;
  try {
    vault = await openVault(vaultDir);

    const saveStart = performance.now();
    for (let i = 0; i < notes.length; i += 1) {
      await vault.saveNote(notes[i]);
      if ((i + 1) % 2000 === 0) console.log(`[bench] saved ${i + 1}/${NOTE_COUNT} (${Math.round((performance.now() - saveStart) / 1000)}s)`);
    }
    const saveMs = performance.now() - saveStart;

    const rebuildStart = performance.now();
    const rebuildInfo = await vault.rebuildIndex();
    const rebuildMs = performance.now() - rebuildStart;
    console.log(`[bench] rebuildIndex: ${round3(rebuildMs)}ms count=${rebuildInfo.count} segmenter=${rebuildInfo.segmenter}`);
    if (rebuildInfo.count !== NOTE_COUNT) throw new Error(`Index count ${rebuildInfo.count} != ${NOTE_COUNT}`);

    // Warmup (not measured).
    for (let w = 0; w < WARMUP_QUERIES; w += 1) {
      await vault.search(QUERIES[w % QUERIES.length].q, { limit: LIMIT });
    }

    // Measured rounds: fixed query order, 10 rounds.
    const perQuery = QUERIES.map(({ q, group, relevance }) => ({
      q, group, relevance,
      truthCount: truth.get(q).size,
      samples: [], errors: [],
      hitCount: null, recallAt10: null,
    }));
    const allSamples = [];
    let errorCount = 0;
    const benchStart = performance.now();
    for (let round = 0; round < ROUNDS; round += 1) {
      for (let qi = 0; qi < perQuery.length; qi += 1) {
        const entry = perQuery[qi];
        const t0 = performance.now();
        try {
          const rows = await vault.search(entry.q, { limit: LIMIT });
          const dt = performance.now() - t0;
          entry.samples.push(dt);
          allSamples.push(dt);
          if (round === 0) {
            entry.hitCount = rows.length;
            if (entry.relevance) {
              const tset = truth.get(entry.q);
              const denom = Math.min(LIMIT, tset.size);
              const hits = rows.filter(r => tset.has(r.id)).length;
              entry.recallAt10 = denom > 0 ? hits / denom : null;
            }
          }
        } catch (error) {
          // store.search does not guard FTS5 syntax errors; count, don't crash.
          errorCount += 1;
          entry.errors.push({ round, message: String(error && error.message || error) });
          console.error(`[bench] search error q="${entry.q}" round=${round}: ${error.message}`);
        }
      }
      console.log(`[bench] round ${round + 1}/${ROUNDS} done (${Math.round((performance.now() - benchStart) / 1000)}s)`);
    }

    allSamples.sort((a, b) => a - b);
    const p95 = percentile(allSamples, 0.95); // 1000 samples -> sorted[949]
    const med = median(allSamples);
    const max = allSamples.length ? allSamples[allSamples.length - 1] : null;
    const min = allSamples.length ? allSamples[0] : null;
    const mean = allSamples.length ? allSamples.reduce((a, b) => a + b, 0) / allSamples.length : null;

    const recallEntries = perQuery.filter(e => e.relevance && e.recallAt10 != null);
    const meanRecall = recallEntries.length
      ? recallEntries.reduce((a, e) => a + e.recallAt10, 0) / recallEntries.length
      : null;
    const specialErrors = perQuery.filter(e => e.group === 'special').reduce((a, e) => a + e.errors.length, 0);
    const emptyUnexpected = perQuery.filter(e => e.group === 'empty' && e.hitCount > 0).map(e => e.q);

    // Close before measuring db files so WAL is checkpointed.
    await vault.close();
    closed = true;
    const indexFiles = {
      sqlite: await fileSizeOrNull(path.join(vaultDir, 'index.sqlite')),
      wal: await fileSizeOrNull(path.join(vaultDir, 'index.sqlite-wal')),
      shm: await fileSizeOrNull(path.join(vaultDir, 'index.sqlite-shm')),
    };

    const report = {
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        processVersions: process.versions,
        segmenterVersion: SEGMENTER_VERSION,
        betterSqlite3Version: require('better-sqlite3/package.json').version,
        corpusSeed: SEED,
        generatorVersion: GENERATOR_VERSION,
        noteCount: NOTE_COUNT,
        targetBodyBytes: TARGET_BODY_BYTES,
        bodyBytesTotal,
        categories: CATEGORIES,
        tagPool: TAG_POOL,
        saveMs: round3(saveMs),
        rebuildMs: round3(rebuildMs),
        rebuildInfo,
        indexFileBytes: indexFiles,
        warmupQueries: WARMUP_QUERIES,
        rounds: ROUNDS,
        queryCount: QUERIES.length,
        searchLimit: LIMIT,
        recallDefinition: 'recall@10 = |top10 ∩ truth| / min(10, |truth|); truth = construction-time substring match over title+body+tags (ASCII case-insensitive)',
        timingDefinition: 'wall time of await vault.search(q,{limit:10}), includes segmentation + SQLite FTS5',
      },
      timing: {
        samples: allSamples.length,
        p95Ms: round3(p95),
        medianMs: round3(med),
        maxMs: round3(max),
        minMs: round3(min),
        meanMs: round3(mean),
        errors: errorCount,
        specialCharErrors: specialErrors,
        p95BudgetMs: P95_BUDGET_MS,
        passP95Under500ms: p95 != null && p95 < P95_BUDGET_MS,
      },
      recall: {
        meanRecallAt10: round3(meanRecall),
        relevanceQueries: perQuery.filter(e => e.relevance).length,
        evaluatedQueries: recallEntries.length,
        emptyQueriesWithUnexpectedHits: emptyUnexpected,
      },
      queries: perQuery.map(e => ({
        q: e.q,
        group: e.group,
        relevance: e.relevance,
        truthCount: e.truthCount,
        hitCount: e.hitCount,
        recallAt10: round3(e.recallAt10),
        avgMs: round3(e.samples.length ? e.samples.reduce((a, b) => a + b, 0) / e.samples.length : null),
        maxMs: round3(e.samples.length ? Math.max(...e.samples) : null),
        samples: e.samples.length,
        errors: e.errors,
      })),
    };

    const outDir = path.join(__dirname, '..', 'test-results');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'benchmark.json');
    await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    console.log('\n========== benchmark summary ==========');
    console.log(`notes=${NOTE_COUNT}  rebuild=${round3(rebuildMs)}ms  index.sqlite=${indexFiles.sqlite} bytes`);
    console.log(`samples=${allSamples.length}  P95=${round3(p95)}ms  median=${round3(med)}ms  max=${round3(max)}ms  mean=${round3(mean)}ms`);
    console.log(`Recall@10 mean=${round3(meanRecall)} (${recallEntries.length} relevance queries)  errors=${errorCount} (special-char errors=${specialErrors})`);
    console.log(`P95 < ${P95_BUDGET_MS}ms: ${report.timing.passP95Under500ms ? 'PASS' : 'FAIL'}`);
    console.log(`report: ${outPath}`);
    console.log('=======================================');
  } finally {
    if (vault && !closed) await vault.close().catch(() => {});
    await fs.rm(vaultDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(err => {
      console.warn(`[bench] cleanup failed for ${vaultDir}: ${err.message}`);
    });
    console.log(`[bench] temp vault cleaned: ${vaultDir}`);
  }
}

main().catch(err => {
  console.error('[bench] FAILED:', err);
  process.exitCode = 1;
});