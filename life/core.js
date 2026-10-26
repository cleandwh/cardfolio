'use strict';
/* ============================================================
   라이프 기록 — 핵심 로직 (화면·브라우저 API 없음, 순수 함수만)
   - 기록 검색 / 합계 계산 / 알림 계산 / 질문 → 관련 기록 + 합계 (설계서 3.3의 1~2번)
   - 나중에 LLM 연결(S2) 때 buildContext()·contextToText()를 그대로 사용한다.
   - 입력 db 모양: { people, events, items, cards, memos } (각각 배열)
   - 날짜는 모두 'YYYY-MM-DD' 문자열. "오늘"은 항상 인자로 받는다(테스트·재현성).
   ============================================================ */
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const utc = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const dayDiff = (a, b) => Math.round((utc(b) - utc(a)) / 86400000); // b - a (일)
  const addDays = (s, n) => { const t = new Date(utc(s) + n * 86400000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  const won = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
  const num = v => { const n = parseFloat(String(v ?? '').replace(/[,\s원]/g, '')); return isFinite(n) ? n : 0; };

  const REL = ['가족', '친척', '친구', '직장', '지인', '기타'];
  const KINDS = ['결혼', '부고', '돌', '개업', '생일', '기타'];
  const DIR = { sent: '보냄', received: '받음' };
  const WAYS = ['현금', '계좌', '선물', '기타'];

  const personName = (db, id) => (db.people.find(p => p.id === id) || {}).name || '';

  /* ---------- 합계 ---------- */
  // 경조사 합계. today를 주면 그 날짜보다 미래인 행사(예정)는 제외한다.
  function sumEvents(events, o = {}) {
    const r = { sent: 0, received: 0, countSent: 0, countReceived: 0, count: 0 };
    for (const e of events) {
      if (o.personId && e.personId !== o.personId) continue;
      if (o.personIds && !o.personIds.includes(e.personId)) continue;
      if (o.kind && e.kind !== o.kind) continue;
      if (o.from && e.date < o.from) continue;
      if (o.to && e.date > o.to) continue;
      if (o.today && e.date > o.today) continue;
      const a = num(e.amount);
      if (e.direction === 'received') { r.received += a; r.countReceived++; } else { r.sent += a; r.countSent++; }
      r.count++;
    }
    r.balance = r.received - r.sent; // 양수: 받은 게 더 많음, 음수: 보낸 게 더 많음
    return r;
  }
  const personTotals = (events, personId, today) => sumEvents(events, { personId, today });

  // 물품 카테고리별 지출 (기간 선택). 합계 큰 순.
  function itemSpend(items, o = {}) {
    const m = new Map(); let total = 0, count = 0;
    for (const i of items) {
      if (o.from && i.date < o.from) continue;
      if (o.to && i.date > o.to) continue;
      const c = (i.category || '').trim() || '미분류', p = num(i.price);
      const x = m.get(c) || { category: c, total: 0, count: 0 }; x.total += p; x.count++; m.set(c, x); total += p; count++;
    }
    return { total, count, byCategory: [...m.values()].sort((a, b) => b.total - a.total) };
  }

  /* ---------- 알림 ---------- */
  // 보증 만료 30일 이내 물품 / 연회비 갱신(이번 달·다음 달) / 다가오는 경조사 / 곧 다가오는 생일
  function alerts(db, today, o = {}) {
    const W = o.warrantyDays ?? 30, E = o.eventDays ?? 30, B = o.birthdayDays ?? 14;
    const out = [];
    for (const i of db.items) {
      if (!i.warrantyEnd) continue;
      const d = dayDiff(today, i.warrantyEnd);
      if (d >= 0 && d <= W) out.push({ kind: 'warranty', id: i.id, days: d, title: i.name, date: i.warrantyEnd, sub: i.asContact || '' });
    }
    const cm = +today.slice(5, 7);
    for (const c of db.cards) {
      const m = parseInt(c.renewMonth, 10);
      if (!(m >= 1 && m <= 12)) continue;
      const ahead = (m - cm + 12) % 12;
      if (ahead <= 1) out.push({ kind: 'card', id: c.id, days: ahead * 30, monthsAhead: ahead, title: c.name, month: m, fee: num(c.fee) });
    }
    for (const e of db.events) {
      if (e.date < today) continue;
      const d = dayDiff(today, e.date);
      if (d <= E) out.push({ kind: 'event', id: e.id, days: d, title: `${personName(db, e.personId) || '(이름 없음)'} ${e.kind || ''}`.trim(), date: e.date, direction: e.direction, amount: num(e.amount) });
    }
    for (const p of db.people) {
      const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p.birthday || '');
      if (!m) continue;
      const y = +today.slice(0, 4);
      let next = `${y}-${m[1]}-${m[2]}`;
      if (next < today) next = `${y + 1}-${m[1]}-${m[2]}`;
      const d = dayDiff(today, next);
      if (d <= B) out.push({ kind: 'birthday', id: p.id, days: d, title: p.name, date: next });
    }
    return out.sort((a, b) => a.days - b.days);
  }

  /* ---------- 검색 ---------- */
  const norm = s => String(s ?? '').normalize('NFC').toLowerCase();

  // 모든 기록을 한 줄씩 검색 가능한 형태로 펼친다.
  function flatten(db) {
    const out = [];
    for (const e of db.events) {
      const pn = personName(db, e.personId);
      out.push({ type: 'event', id: e.id, date: e.date, personId: e.personId, amount: num(e.amount),
        title: `${pn || '(이름 없음)'} · ${e.kind || '경조사'}`,
        sub: `${DIR[e.direction] || '보냄'} ${won(e.amount)}원${e.method ? ' · ' + e.method : ''}${e.relation ? ' · ' + e.relation : ''}`,
        text: norm([pn, e.relation, e.kind, DIR[e.direction], e.direction === 'received' ? '받은 받음' : '보낸 보냄', e.method, e.amount, e.memo, e.date, '경조사'].join(' ')) });
    }
    for (const i of db.items) {
      out.push({ type: 'item', id: i.id, date: i.date, amount: num(i.price),
        title: i.name || '(품명 없음)',
        sub: `${won(i.price)}원${i.store ? ' · ' + i.store : ''}${i.warrantyEnd ? ' · 보증 ~' + i.warrantyEnd : ''}`,
        text: norm([i.name, i.category, i.store, i.cardName, i.asContact, i.memo, i.price, i.date, i.warrantyEnd, '구매 물품'].join(' ')) });
    }
    for (const c of db.cards) {
      out.push({ type: 'card', id: c.id, date: '', amount: num(c.fee),
        title: c.name || '(카드명 없음)',
        sub: `${c.fee ? '연회비 ' + won(c.fee) + '원' : '연회비 없음'}${c.renewMonth ? ' · 갱신 ' + c.renewMonth + '월' : ''}`,
        text: norm([c.name, c.fee, c.renewMonth ? c.renewMonth + '월' : '', c.memo, '카드 연회비'].join(' ')) });
    }
    for (const m of db.memos) {
      const pn = personName(db, m.personId);
      const tags = (m.tags || []).map(t => '#' + t).join(' ');
      out.push({ type: 'memo', id: m.id, date: m.date, personId: m.personId || '', amount: 0,
        title: m.title || (m.body || '').split('\n')[0].slice(0, 30) || '(제목 없음)',
        sub: (m.body || '').replace(/\s+/g, ' ').slice(0, 60) + (tags ? ' ' + tags : ''),
        text: norm([m.title, m.body, tags, pn, m.date, '메모 생각'].join(' ')) });
    }
    for (const p of db.people) {
      out.push({ type: 'person', id: p.id, date: '', personId: p.id, amount: 0,
        title: p.name || '(이름 없음)',
        sub: [p.relation, p.birthday ? '생일 ' + p.birthday.slice(5) : ''].filter(Boolean).join(' · '),
        text: norm([p.name, p.relation, p.birthday, p.memo, '사람'].join(' ')) });
    }
    return out;
  }

  // 통합 검색. q의 모든 단어가 들어 있는 기록만(AND). any:true면 하나라도(OR).
  // types: ['event','item','card','memo','person'], from/to: 기간(날짜 없는 기록은 기간 지정 시 제외)
  function searchRecords(db, o = {}) {
    const toks = norm(o.q).split(/\s+/).filter(Boolean);
    const types = o.types && o.types.length ? o.types : null;
    const res = [];
    for (const r of flatten(db)) {
      if (types && !types.includes(r.type)) continue;
      if (o.from || o.to) { if (!r.date) continue; if (o.from && r.date < o.from) continue; if (o.to && r.date > o.to) continue; }
      if (o.personIds && !o.personIds.includes(r.personId)) continue;
      let hit = 0;
      for (const t of toks) if (r.text.includes(t)) hit++;
      if (toks.length && (o.any ? hit === 0 : hit < toks.length)) continue;
      let score = hit * 10;
      for (const t of toks) if (norm(r.title).includes(t)) score += 5;
      res.push({ ...r, score });
    }
    res.sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
    return o.limit ? res.slice(0, o.limit) : res;
  }

  /* ---------- 질문 → 관련 기록 + 합계 (규칙 기반, LLM 없음) ---------- */
  function parsePeriod(q, today) {
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    const yr = (yy, label) => ({ from: `${yy}-01-01`, to: `${yy}-12-31`, label });
    let r;
    if ((r = /(\d{4})\s*년(?:\s*(\d{1,2})\s*월)?/.exec(q))) {
      if (r[2]) { const mm = +r[2], last = new Date(+r[1], mm, 0).getDate(); return { from: `${r[1]}-${pad(mm)}-01`, to: `${r[1]}-${pad(mm)}-${pad(last)}`, label: `${r[1]}년 ${mm}월` }; }
      return yr(+r[1], `${r[1]}년`);
    }
    if (/재작년/.test(q)) return yr(y - 2, `${y - 2}년`);
    if (/작년|지난해|전년/.test(q)) return yr(y - 1, `${y - 1}년`);
    if (/올해|금년|올 한해/.test(q)) return yr(y, `${y}년`);
    if (/이번\s*달|이달/.test(q)) { const last = new Date(y, m, 0).getDate(); return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}`, label: '이번 달' }; }
    if (/지난\s*달|저번\s*달/.test(q)) { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1, last = new Date(py, pm, 0).getDate(); return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}`, label: '지난달' }; }
    return null;
  }
  const PERIOD_RE = /(\d{4}\s*년(\s*\d{1,2}\s*월)?|재작년|작년|지난해|전년|올해|금년|올\s*한해|이번\s*달|이달|지난\s*달|저번\s*달)/g;
  const STOP = new Set(['얼마', '얼마나', '했어', '했지', '했나', '줬어', '줬지', '준', '받았어', '받았지', '보냈어', '보냈지', '언제', '뭐', '무엇', '어디', '알려줘', '알려', '있어', '있지', '몇', '건', '번', '적', '지금까지', '총', '전부', '모두', '합계', '내가', '나', '내', '했었지', '했었어', '샀어', '샀지', '산', '것', '거', '무슨', '어떤', '다']);
  const TYPE_WORDS = [
    ['event', /경조사|축의|부조|조의|결혼|부고|돌잔치|개업|상조|보냈|받았|줬|준/],
    ['item', /구매|구입|샀|산 |보증|a\/s|as |물품|영수증|가격/i],
    ['card', /카드|연회비/],
    ['memo', /메모|생각|기록해/]
  ];
  const stripParticle = t => { const s = t.replace(/(에게서|한테서|에게|한테|께서|께|으로|에서|에는|이랑|하고|부터|까지|은|는|이|가|을|를|의|에|도|만|과|와|랑|로)$/, ''); return s.length >= 2 ? s : t; };

  // 질문에서 기간·사람·종류·키워드 추출
  function parseQuestion(q, db, today) {
    const period = parsePeriod(q, today);
    const people = db.people.filter(p => p.name && q.includes(p.name)).sort((a, b) => b.name.length - a.name.length);
    const kinds = KINDS.filter(k => k !== '기타' && q.includes(k));
    let rest = q.replace(PERIOD_RE, ' ');
    for (const p of people) rest = rest.split(p.name).join(' ');
    const keywords = rest.split(/[\s,.?!]+/).map(t => t.trim()).filter(Boolean).map(stripParticle).filter(t => t.length >= 2 && !STOP.has(t) && !KINDS.includes(t));
    const types = TYPE_WORDS.filter(([, re]) => re.test(q)).map(([t]) => t);
    return { period, people, kinds, keywords, types };
  }

  // 질문에 필요한 근거를 모은다: 관련 기록(상위 limit건) + 앱이 계산한 합계.
  // LLM에는 이 결과만 넘기고, 숫자는 여기서 계산된 값을 쓴다.
  function buildContext(db, q, o = {}) {
    const today = o.today, limit = o.limit || 20;
    const f = parseQuestion(q, db, today);
    const from = f.period && f.period.from, to = f.period && f.period.to;
    const personIds = f.people.length ? f.people.map(p => p.id) : null;
    // 종류 단서가 없으면 전체, 사람이 지정되면 경조사·메모·사람만이 자연스럽다.
    let types = f.types.length ? f.types : null;
    if (!types && personIds) types = ['event', 'memo', 'person'];
    let recs = searchRecords(db, { q: personIds ? '' : f.keywords.join(' '), any: true, types, from, to, personIds, limit: 0 });
    if (personIds && f.keywords.length) { // 사람이 있으면 키워드는 순위에만 반영
      const kw = f.keywords.map(norm);
      recs = recs.map(r => ({ ...r, score: r.score + kw.filter(k => r.text.includes(k)).length * 10 })).sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
    }
    const kindSel = f.kinds.length === 1 ? f.kinds[0] : undefined;
    const evSum = sumEvents(db.events, { personIds, from, to, kind: kindSel, today });
    const perPerson = f.people.map(p => ({ id: p.id, name: p.name, ...sumEvents(db.events, { personId: p.id, from, to, kind: kindSel, today }) }));
    const spend = itemSpend(db.items.filter(i => !f.keywords.length || f.keywords.some(k => norm([i.name, i.category, i.store].join(' ')).includes(norm(k)))), { from, to });
    return {
      question: q, today, filters: { period: f.period, people: f.people.map(p => p.name), kinds: f.kinds, keywords: f.keywords, types: f.types },
      records: recs.slice(0, limit), totalMatched: recs.length,
      totals: { events: evSum, perPerson, items: { total: spend.total, count: spend.count, byCategory: spend.byCategory } }
    };
  }

  // 컨텍스트를 LLM 프롬프트용 한국어 텍스트로 (S2에서 사용)
  function contextToText(ctx) {
    const L = [];
    const f = ctx.filters;
    L.push(`[질문] ${ctx.question}`);
    L.push(`[오늘] ${ctx.today}`);
    if (f.period) L.push(`[기간] ${f.period.label} (${f.period.from} ~ ${f.period.to})`);
    if (f.people.length) L.push(`[사람] ${f.people.join(', ')}`);
    const t = ctx.totals;
    if (t.events.count) {
      L.push(`[경조사 합계 · 앱이 계산] 보낸 ${won(t.events.sent)}원(${t.events.countSent}건), 받은 ${won(t.events.received)}원(${t.events.countReceived}건)`);
      for (const p of t.perPerson) if (p.count) L.push(`  - ${p.name}: 보낸 ${won(p.sent)}원, 받은 ${won(p.received)}원`);
    }
    if (t.items.count && (f.types.includes('item') || f.keywords.length)) L.push(`[물품 지출 합계 · 앱이 계산] ${won(t.items.total)}원 (${t.items.count}건)`);
    L.push(`[관련 기록 ${ctx.records.length}건${ctx.totalMatched > ctx.records.length ? ` / 전체 ${ctx.totalMatched}건 중` : ''}]`);
    ctx.records.forEach((r, i) => L.push(`${i + 1}. (${{ event: '경조사', item: '물품', card: '카드', memo: '메모', person: '사람' }[r.type]}) ${r.date || ''} ${r.title} — ${r.sub}`.replace(/\s+/g, ' ')));
    return L.join('\n');
  }

  const api = { fmtDate, utc, dayDiff, addDays, won, num, REL, KINDS, DIR, WAYS, sumEvents, personTotals, itemSpend, alerts, flatten, searchRecords, parseQuestion, buildContext, contextToText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LifeCore = api;
})(typeof self !== 'undefined' ? self : this);
