(function () {
  'use strict';

  var app = document.getElementById('app');
  var BASE = window.CCAR_Q || [];
  var DOMAINS = [
    { id: 1, name: 'Agentic Architecture & Orchestration', exam: 16 },
    { id: 2, name: 'Tool Design & MCP Integration', exam: 11 },
    { id: 3, name: 'Claude Code Configuration & Workflows', exam: 12 },
    { id: 4, name: 'Prompt Engineering & Structured Output', exam: 12 },
    { id: 5, name: 'Context Management & Reliability', exam: 9 }
  ];
  var EXAM_MINUTES = 120;
  var KEY = 'ccarf-practice-stats-v1';
  var LETTERS = 'ABCDE';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sameSet(x, y) {
    if (x.length !== y.length) return false;
    return x.slice().sort().join(',') === y.slice().sort().join(',');
  }
  function need(q) { return q.t === 'm' ? q.a.length : 1; }
  function letters(idxs) {
    return idxs.slice().sort().map(function (i) { return LETTERS.charAt(i); }).join(', ');
  }
  function domName(id) {
    for (var i = 0; i < DOMAINS.length; i++) if (DOMAINS[i].id === id) return DOMAINS[i].name;
    return '';
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  }

  // Shuffle answer options once per question so the correct letter varies.
  // Explanations never refer to option letters, so remapping is safe.
  var QS = BASE.map(function (q) {
    var order = shuffle(q.o.map(function (_, i) { return i; }));
    var newIndex = {};
    order.forEach(function (oldI, newI) { newIndex[oldI] = newI; });
    return {
      id: q.id,
      d: q.d,
      t: q.t,
      q: q.q,
      e: q.e,
      o: order.map(function (oldI) { return q.o[oldI]; }),
      x: order.map(function (oldI) { return q.x ? q.x[oldI] : ''; }),
      a: q.a.map(function (oldI) { return newIndex[oldI]; })
    };
  });

  var stats = {};
  try { stats = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { stats = {}; }
  function saveStats() {
    try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (e) { /* storage unavailable */ }
  }
  function record(q, ok) {
    var s = stats[q.id] || { seen: 0, right: 0 };
    s.seen += 1;
    if (ok) s.right += 1;
    stats[q.id] = s;
    saveStats();
  }

  var state = {
    view: 'home',
    queue: [],
    i: 0,
    sel: [],
    checked: false,
    log: [],
    mode: 'practice',
    exam: null,
    timer: null,
    confirmSubmit: false,
    confirmReset: false,
    lastKey: ''
  };

  function domainProgress() {
    return DOMAINS.map(function (dm) {
      var pool = QS.filter(function (q) { return q.d === dm.id; });
      var seen = 0, right = 0, attempted = 0;
      pool.forEach(function (q) {
        var s = stats[q.id];
        if (s && s.seen) { attempted += 1; seen += s.seen; right += s.right; }
      });
      return { dm: dm, total: pool.length, attempted: attempted, acc: seen ? Math.round(right / seen * 100) : null };
    });
  }

  // ---------- Views ----------

  function renderHome() {
    var rows = domainProgress().map(function (p) {
      return '<tr><td>' + esc(p.dm.name) + '</td><td class="num">' + p.total + '</td><td class="num">' +
        p.attempted + '</td><td class="num">' + (p.acc === null ? '–' : p.acc + '%') + '</td></tr>';
    }).join('');
    app.innerHTML =
      '<header class="intro">' +
        '<p class="eyebrow">Unofficial practice · Claude Certified Architect – Foundations</p>' +
        '<h1>CCAR-F Practice Exam</h1>' +
        '<p class="lede">' + QS.length + ' original, scenario-based questions in English across the five exam domains. Practise with instant feedback, or sit a timed 60-question simulation.</p>' +
      '</header>' +
      '<div class="notice">Not official Anthropic material. These questions are written from public Anthropic documentation, not from the confidential exam guide. Domain weights are community-reported and not verified by Anthropic.</div>' +
      '<section class="cards">' +
        '<article class="card"><h2>Practice</h2><p>Choose all domains or one. You get feedback and an explanation after every question.</p>' +
          '<button class="btn primary" data-act="setup">Start practice</button></article>' +
        '<article class="card"><h2>Exam simulation</h2><p>60 questions drawn by domain weight. 120 minutes, flag and review, scored at the end.</p>' +
          '<button class="btn primary" data-act="exam">Start simulation</button></article>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Your progress</h2><p class="muted">Stored in this browser only.</p>' +
        '<div class="tablewrap"><table><thead><tr><th>Domain</th><th class="num">Questions</th><th class="num">Attempted</th><th class="num">Accuracy</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<button class="btn ghost" data-act="reset">' + (state.confirmReset ? 'Click again to erase progress' : 'Reset progress') + '</button>' +
      '</section>';
  }

  function renderSetup() {
    var chips = '<button class="chip" data-act="practice-start" data-d="0">All domains <span>' + QS.length + '</span></button>' +
      DOMAINS.map(function (dm) {
        var n = QS.filter(function (q) { return q.d === dm.id; }).length;
        return '<button class="chip" data-act="practice-start" data-d="' + dm.id + '">' + esc(dm.name) + ' <span>' + n + '</span></button>';
      }).join('');
    app.innerHTML =
      '<nav class="crumb"><button class="link" data-act="home">← Home</button></nav>' +
      '<h1>Practice setup</h1>' +
      '<p class="lede">Pick a domain. Questions come in random order, and every answer gets feedback.</p>' +
      '<div class="chips">' + chips + '</div>';
  }

  function optionButtons(q, selected, locked, correctSet) {
    return q.o.map(function (text, i) {
      var on = selected.indexOf(i) > -1;
      var cls = 'opt' + (on ? ' on' : '');
      if (locked) {
        var isRight = correctSet.indexOf(i) > -1;
        if (isRight) cls += ' right';
        else if (on) cls += ' wrong';
      }
      var btn = '<button class="' + cls + '" data-act="opt" data-opt="' + i + '" aria-pressed="' + on + '"' +
        (locked ? ' disabled' : '') + '><span class="letter">' + LETTERS.charAt(i) + '</span><span>' + esc(text) + '</span></button>';
      if (locked && q.x[i]) {
        var good = correctSet.indexOf(i) > -1;
        btn += '<p class="why ' + (good ? 'fits' : 'nofit') + '"><strong>' + (good ? 'Why it fits: ' : 'Why not: ') + '</strong>' + esc(q.x[i]) + '</p>';
      }
      return '<div class="optwrap">' + btn + '</div>';
    }).join('');
  }

  function whyList(q) {
    return '<ul class="whys">' + q.o.map(function (text, i) {
      var good = q.a.indexOf(i) > -1;
      return '<li class="' + (good ? 'fits' : 'nofit') + '"><strong>' + LETTERS.charAt(i) + (good ? ' (correct)' : '') + '.</strong> ' +
        esc(text) + (q.x[i] ? '<br><span class="muted2">' + esc(q.x[i]) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function renderPractice() {
    var n = state.queue.length;
    var q = state.queue[state.i];
    var need1 = need(q);
    var ok = state.checked && sameSet(state.sel, q.a);
    var feedback = '';
    if (state.checked) {
      feedback =
        '<div class="feedback ' + (ok ? 'good' : 'bad') + '"><strong>' + (ok ? 'Correct.' : 'Not quite.') + '</strong> ' +
        'Correct answer: ' + letters(q.a) + '.</div>' +
        '<p class="explain"><strong>Takeaway.</strong> ' + esc(q.e) + '</p>';
    }
    var action = state.checked
      ? '<button class="btn primary" data-act="next">' + (state.i + 1 < n ? 'Next question' : 'See results') + '</button>'
      : '<button class="btn primary" data-act="check"' + (state.sel.length === need1 ? '' : ' disabled') + '>Check answer</button>';
    app.innerHTML =
      '<nav class="crumb"><button class="link" data-act="home">← Home</button><span class="count">' + (state.i + 1) + ' / ' + n + '</span></nav>' +
      '<div class="bar"><span style="width:' + Math.round(state.i / n * 100) + '%"></span></div>' +
      '<article class="qcard">' +
        '<p class="meta">' + esc(domName(q.d)) + ' · ' + (need1 === 1 ? 'Select one' : 'Select ' + need1) + '</p>' +
        '<h2 class="stem">' + esc(q.q) + '</h2>' +
        '<div class="opts">' + optionButtons(q, state.sel, state.checked, q.a) + '</div>' +
        feedback +
        '<div class="actions">' + action + '</div>' +
      '</article>';
  }

  function renderExam() {
    var ex = state.exam;
    var n = ex.qs.length;
    var q = ex.qs[ex.i];
    var need1 = need(q);
    var cur = ex.answers[q.id] || [];
    var answered = ex.qs.filter(function (x) { return (ex.answers[x.id] || []).length > 0; }).length;
    var flagged = ex.qs.filter(function (x) { return ex.flags[x.id]; }).length;
    var nav = ex.qs.map(function (x, idx) {
      var c = ['navbtn'];
      if (idx === ex.i) c.push('cur');
      if ((ex.answers[x.id] || []).length) c.push('ans');
      if (ex.flags[x.id]) c.push('flag');
      return '<button class="' + c.join(' ') + '" data-act="ex-go" data-go="' + idx + '" aria-label="Question ' + (idx + 1) + '">' + (idx + 1) + '</button>';
    }).join('');
    app.innerHTML =
      examHead(answered, n, flagged) +
      '<div class="examgrid">' +
        '<article class="qcard">' +
          '<p class="meta">Question ' + (ex.i + 1) + ' of ' + n + ' · ' + (need1 === 1 ? 'Select one' : 'Select ' + need1) + '</p>' +
          '<h2 class="stem">' + esc(q.q) + '</h2>' +
          '<div class="opts">' + optionButtons(q, cur, false, []) + '</div>' +
          '<div class="actions split">' +
            '<button class="btn ghost" data-act="ex-prev"' + (ex.i === 0 ? ' disabled' : '') + '>Previous</button>' +
            '<button class="btn ' + (ex.flags[q.id] ? 'flagged' : 'ghost') + '" data-act="ex-flag">' + (ex.flags[q.id] ? 'Flagged for review' : 'Flag for review') + '</button>' +
            '<button class="btn ghost" data-act="ex-next"' + (ex.i === n - 1 ? ' disabled' : '') + '>Next</button>' +
          '</div>' +
          '<div class="actions"><button class="btn ghost" data-act="ex-review">Review all questions</button></div>' +
        '</article>' +
        '<aside class="navpanel">' +
          '<p class="label">Questions</p>' +
          '<div class="navgrid">' + nav + '</div>' +
          '<p class="legend"><span class="sw ans"></span>Answered <span class="sw flag"></span>Flagged <span class="sw cur"></span>Current</p>' +
        '</aside>' +
      '</div>';
    updateClock();
  }

  function examHead(answered, n, flagged) {
    return '<div class="examhead">' +
      '<div><span class="label">Time left</span><strong id="clock" class="clock"></strong></div>' +
      '<div><span class="label">Answered</span><strong>' + answered + ' / ' + n + '</strong></div>' +
      '<div><span class="label">Flagged</span><strong>' + flagged + '</strong></div>' +
    '</div>';
  }

  function renderReview() {
    var ex = state.exam;
    var n = ex.qs.length;
    var unanswered = ex.qs.filter(function (x) { return !(ex.answers[x.id] || []).length; }).length;
    var answered = n - unanswered;
    var flagged = ex.qs.filter(function (x) { return ex.flags[x.id]; }).length;
    var rows = ex.qs.map(function (x, idx) {
      var has = (ex.answers[x.id] || []).length > 0;
      return '<li><button class="link" data-act="ex-go" data-go="' + idx + '">Question ' + (idx + 1) + '</button>' +
        '<span class="st">' + (has ? 'Answered' : '<em>Unanswered</em>') + (ex.flags[x.id] ? ' · flagged' : '') + '</span></li>';
    }).join('');
    var submit = state.confirmSubmit
      ? '<button class="btn danger" data-act="ex-submit-yes">Confirm submit</button><button class="btn ghost" data-act="ex-cancel">Cancel</button>'
      : '<button class="btn primary" data-act="ex-submit-ask">Submit exam</button>';
    app.innerHTML =
      examHead(answered, n, flagged) +
      '<h1>Review</h1>' +
      '<p class="lede">' + (unanswered ? unanswered + ' question' + (unanswered === 1 ? ' is' : 's are') + ' unanswered. ' : 'Every question is answered. ') +
      'You can still change answers until you submit.</p>' +
      '<ol class="reviewlist">' + rows + '</ol>' +
      '<div class="actions split"><button class="btn ghost" data-act="ex-back">Back to exam</button><div class="row">' + submit + '</div></div>';
    updateClock();
  }

  function renderResults() {
    var log = state.log;
    var total = log.length;
    var right = log.filter(function (x) { return x.ok; }).length;
    var pct = total ? Math.round(right / total * 100) : 0;
    var perDomain = DOMAINS.map(function (dm) {
      var items = log.filter(function (x) { return x.q.d === dm.id; });
      var r = items.filter(function (x) { return x.ok; }).length;
      return '<tr><td>' + esc(dm.name) + '</td><td class="num">' + r + ' / ' + items.length + '</td><td class="num">' +
        (items.length ? Math.round(r / items.length * 100) + '%' : '–') + '</td></tr>';
    }).join('');
    var review = log.map(function (x, idx) {
      var yours = x.sel.length ? letters(x.sel) : 'No answer';
      var text = x.q.q.length > 120 ? x.q.q.slice(0, 120) + '…' : x.q.q;
      return '<details class="review ' + (x.ok ? 'good' : 'bad') + '"><summary><span class="mark">' + (x.ok ? '✓' : '✗') + '</span> ' +
        (idx + 1) + '. ' + esc(text) + '</summary>' +
        '<p class="fullq">' + esc(x.q.q) + '</p>' +
        '<p><strong>Your answer:</strong> ' + esc(yours) + ' · <strong>Correct:</strong> ' + esc(letters(x.q.a)) + '</p>' +
        whyList(x.q) +
        '<p>' + esc(x.q.e) + '</p></details>';
    }).join('');
    var headline = state.mode === 'exam' ? 'Simulation result' : 'Practice summary';
    var note = state.mode === 'exam'
      ? '<p class="notice">Anthropic does not publish how raw scores map to the scaled score. Third-party sources report a pass mark of 720 out of 1000. The percentage above is not a pass prediction.</p>'
      : '';
    var againBtn = state.mode === 'exam'
      ? '<button class="btn primary" data-act="exam">New simulation</button>'
      : '<button class="btn primary" data-act="setup">Practice again</button>';
    app.innerHTML =
      '<nav class="crumb"><button class="link" data-act="home">← Home</button></nav>' +
      '<p class="eyebrow">' + headline + '</p>' +
      '<h1>' + right + ' of ' + total + ' correct</h1>' +
      '<p class="score">' + pct + '%</p>' +
      note +
      '<section class="panel"><h2>By domain</h2><div class="tablewrap"><table><thead><tr><th>Domain</th><th class="num">Correct</th><th class="num">Accuracy</th></tr></thead><tbody>' + perDomain + '</tbody></table></div></section>' +
      '<section class="panel"><h2>Questions</h2>' + review + '</section>' +
      '<div class="actions">' + againBtn + '</div>';
  }

  var VIEWS = {
    home: renderHome,
    setup: renderSetup,
    practice: renderPractice,
    exam: renderExam,
    review: renderReview,
    results: renderResults
  };

  function render() {
    var key = state.view + ':' + (state.view === 'practice' ? state.i : '') + (state.view === 'exam' || state.view === 'review' ? ':' + (state.exam ? state.exam.i : '') : '');
    VIEWS[state.view]();
    if (key !== state.lastKey) window.scrollTo(0, 0);
    state.lastKey = key;
  }

  // ---------- Practice ----------

  function startPractice(domainId) {
    var pool = QS.filter(function (q) { return domainId === 0 || q.d === domainId; });
    state.mode = 'practice';
    state.queue = shuffle(pool);
    state.i = 0;
    state.sel = [];
    state.checked = false;
    state.log = [];
    state.view = 'practice';
    render();
  }

  function practiceOpt(idx) {
    if (state.checked) return;
    var q = state.queue[state.i];
    var p = state.sel.indexOf(idx);
    if (q.t === 's') state.sel = [idx];
    else if (p > -1) state.sel.splice(p, 1);
    else if (state.sel.length < need(q)) state.sel.push(idx);
  }

  function checkPractice() {
    var q = state.queue[state.i];
    var ok = sameSet(state.sel, q.a);
    state.checked = true;
    record(q, ok);
    state.log.push({ q: q, sel: state.sel.slice(), ok: ok });
  }

  function nextPractice() {
    if (state.i + 1 < state.queue.length) {
      state.i += 1;
      state.sel = [];
      state.checked = false;
    } else {
      state.mode = 'practice';
      state.view = 'results';
    }
  }

  // ---------- Exam ----------

  function startExam() {
    var picked = [];
    DOMAINS.forEach(function (dm) {
      var pool = shuffle(QS.filter(function (q) { return q.d === dm.id; }));
      picked = picked.concat(pool.slice(0, dm.exam));
    });
    stopClock();
    state.mode = 'exam';
    state.exam = {
      qs: shuffle(picked),
      answers: {},
      flags: {},
      i: 0,
      deadline: Date.now() + EXAM_MINUTES * 60000,
      submitted: false
    };
    state.confirmSubmit = false;
    state.view = 'exam';
    startClock();
    render();
  }

  function toggleExamOpt(idx) {
    var ex = state.exam;
    var q = ex.qs[ex.i];
    var cur = (ex.answers[q.id] || []).slice();
    var p = cur.indexOf(idx);
    if (q.t === 's') cur = [idx];
    else if (p > -1) cur.splice(p, 1);
    else cur.push(idx);
    ex.answers[q.id] = cur;
  }

  function submitExam() {
    var ex = state.exam;
    if (!ex || ex.submitted) return;
    ex.submitted = true;
    stopClock();
    state.log = ex.qs.map(function (q) {
      var sel = (ex.answers[q.id] || []).slice().sort();
      var ok = sel.length > 0 && sameSet(sel, q.a);
      if (sel.length) record(q, ok); // unanswered questions do not count as attempted
      return { q: q, sel: sel, ok: ok };
    });
    state.mode = 'exam';
    state.confirmSubmit = false;
    state.view = 'results';
  }

  function updateClock() {
    var el = document.getElementById('clock');
    if (!el || !state.exam) return;
    var left = state.exam.deadline - Date.now();
    el.textContent = fmtTime(left);
    el.classList.toggle('warn', left < 10 * 60000);
  }

  function stopClock() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function startClock() {
    stopClock();
    state.timer = setInterval(function () {
      if (!state.exam || state.exam.submitted) { stopClock(); return; }
      if (Date.now() >= state.exam.deadline) { submitExam(); render(); return; }
      updateClock();
    }, 1000);
  }

  // ---------- Events ----------

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act');
    var ex = state.exam;
    switch (act) {
      case 'home':
        stopClock();
        state.view = 'home';
        state.confirmReset = false;
        break;
      case 'setup':
        state.view = 'setup';
        break;
      case 'reset':
        if (state.confirmReset) { stats = {}; saveStats(); state.confirmReset = false; }
        else { state.confirmReset = true; }
        break;
      case 'practice-start':
        startPractice(parseInt(el.getAttribute('data-d'), 10));
        return;
      case 'opt':
        practiceOpt(parseInt(el.getAttribute('data-opt'), 10));
        break;
      case 'check':
        checkPractice();
        break;
      case 'next':
        nextPractice();
        break;
      case 'exam':
        startExam();
        return;
      case 'ex-opt':
        toggleExamOpt(parseInt(el.getAttribute('data-opt'), 10));
        break;
      case 'ex-prev':
        ex.i = Math.max(0, ex.i - 1);
        break;
      case 'ex-next':
        ex.i = Math.min(ex.qs.length - 1, ex.i + 1);
        break;
      case 'ex-flag':
        var fq = ex.qs[ex.i];
        ex.flags[fq.id] = !ex.flags[fq.id];
        break;
      case 'ex-review':
        state.view = 'review';
        state.confirmSubmit = false;
        break;
      case 'ex-back':
        state.view = 'exam';
        state.confirmSubmit = false;
        break;
      case 'ex-go':
        ex.i = parseInt(el.getAttribute('data-go'), 10);
        state.view = 'exam';
        state.confirmSubmit = false;
        break;
      case 'ex-submit-ask':
        state.confirmSubmit = true;
        break;
      case 'ex-cancel':
        state.confirmSubmit = false;
        break;
      case 'ex-submit-yes':
        submitExam();
        break;
      default:
        return;
    }
    render();
  });

  render();
})();
