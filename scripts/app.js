(function () {
  var STORAGE_KEY = "aiWorkbenchState";
  var SESSION_KEY = "aiWorkbenchCurrentUser";
  var state = null;
  var currentUser = null;
  var toastTimer = null;
  var textEncoder = new TextEncoder();
  var faqEditingId = null;
  var pendingLinkFromId = null;
  var DECISION_PRESETS = [
    { id: "init", label: "立项评估" },
    { id: "research", label: "调研分析" },
    { id: "plan", label: "方案制定" },
    { id: "review", label: "方案评审" },
    { id: "execute", label: "执行跟踪" },
    { id: "risk", label: "风险应对" },
    { id: "summary", label: "复盘总结" }
  ];

  function padNumber(value) {
    var num = parseInt(value, 10);
    if (isNaN(num)) {
      return "00";
    }
    return num < 10 ? "0" + num : String(num);
  }

  function formatDateTime(value) {
    if (!value) {
      return "--";
    }
    try {
      var date = new Date(value);
      if (isNaN(date.getTime())) {
        return value;
      }
      var year = date.getFullYear();
      var month = padNumber(date.getMonth() + 1);
      var day = padNumber(date.getDate());
      var hour = padNumber(date.getHours());
      var minute = padNumber(date.getMinutes());
      return year + "-" + month + "-" + day + " " + hour + ":" + minute;
    } catch (err) {
      return value;
    }
  }

  function uuid() {
    return "xxxxxx".replace(/[x]/g, function () {
      var r = Math.random() * 16;
      return (r | 0).toString(16);
    }) + Date.now().toString(16);
  }

  function bankLogoText(name) {
    if (!name) {
      return "记";
    }
    var trimmed = String(name).trim();
    if (trimmed.length === 0) {
      return "记";
    }
    var first = trimmed.charAt(0);
    var firstCode = first.charCodeAt(0);
    if (firstCode >= 19968 && firstCode <= 40959) {
      var second = trimmed.charAt(1);
      if (second) {
        var secondCode = second.charCodeAt(0);
        if (secondCode >= 19968 && secondCode <= 40959) {
          return first + second;
        }
      }
      return first;
    }
    return first.toUpperCase();
  }

  function normalizeQuestionText(text) {
    if (!text) {
      return "";
    }
    return String(text)
      .toLowerCase()
      .replace(/[\s\u3000]+/g, "")
      .replace(/[，,。\.？\?！!、:：;]/g, "");
  }

  function snippetText(text, limit) {
    if (!text) {
      return "";
    }
    var clean = String(text).replace(/\s+/g, " ").trim();
    if (!limit) {
      limit = 160;
    }
    if (clean.length <= limit) {
      return clean;
    }
    return clean.slice(0, limit) + "…";
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 3000);
  }

  function saveState() {
    if (!state) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error("保存状态失败", err);
    }
  }

  function loadState() {
    var stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      stored = null;
    }
    if (stored) {
      try {
        state = JSON.parse(stored);
      } catch (err) {
        state = null;
      }
    }
    if (!state) {
      state = {
        users: [],
        banks: [],
        activeBankId: null,
        activeSessionId: null,
        decisions: [],
        activeDecisionId: null,
        adminFlags: { reasoning: false, reasoningLevel: 1 },
        settings: {
          topN: 5,
          chunkSize: 400,
          chunkOverlap: 80,
          faqLow: 40,
          faqHigh: 75
        }
      };
    }
    if (!state.adminFlags) {
      state.adminFlags = { reasoning: false, reasoningLevel: 1 };
    }
    if (!state.settings) {
      state.settings = {
        topN: 5,
        chunkSize: 400,
        chunkOverlap: 80,
        faqLow: 40,
        faqHigh: 75
      };
    }
    if (!state.decisions) {
      state.decisions = [];
    }
    if (typeof state.activeDecisionId === "undefined") {
      state.activeDecisionId = null;
    }
    normalizeState();
    saveState();
    return Promise.resolve();
  }

  function normalizeState() {
    if (!state.users) {
      state.users = [];
    }
    if (!state.banks) {
      state.banks = [];
    }
    if (!state.decisions) {
      state.decisions = [];
    }
    for (var i = 0; i < state.banks.length; i += 1) {
      var bank = state.banks[i];
      if (!bank.name) {
        bank.name = "记忆库" + (i + 1);
      }
      if (!bank.logo) {
        bank.logo = bankLogoText(bank.name);
      }
      if (!bank.faqs) {
        bank.faqs = [];
      }
      if (!bank.files) {
        bank.files = [];
      }
      if (!bank.chunks) {
        bank.chunks = [];
      }
      if (!bank.index) {
        bank.index = { df: {}, postings: {}, docLengths: {}, avgdl: 0, totalDocs: 0 };
      }
      if (!bank.sessions) {
        bank.sessions = [];
      }
      if (!bank.common) {
        bank.common = [];
      }
      if (!bank.logs) {
        bank.logs = [];
      }
      for (var j = 0; j < bank.faqs.length; j += 1) {
        var faq = bank.faqs[j];
        if (!faq.id) {
          faq.id = uuid();
        }
        if (!faq.createdAt) {
          faq.createdAt = new Date().toISOString();
        }
        if (!faq.createdBy) {
          faq.createdBy = "";
        }
        faq.norm = normalizeQuestionText(faq.question);
      }
      for (var k = 0; k < bank.logs.length; k += 1) {
        var log = bank.logs[k];
        if (!log.id) {
          log.id = uuid();
        }
        if (!log.time) {
          log.time = new Date().toISOString();
        }
      }
      for (var m = 0; m < bank.common.length; m += 1) {
        if (!bank.common[m].id) {
          bank.common[m].id = uuid();
        }
      }
    }
    var hasActive = false;
    for (var n = 0; n < state.decisions.length; n += 1) {
      var project = state.decisions[n];
      if (!project.id) {
        project.id = uuid();
      }
      if (state.activeDecisionId === project.id) {
        hasActive = true;
      }
      if (!project.name) {
        project.name = "未命名项目";
      }
      if (!project.startTime) {
        project.startTime = "";
      }
      if (!project.timeline) {
        project.timeline = [];
      }
      if (!project.links) {
        project.links = [];
      }
      if (!project.createdAt) {
        project.createdAt = new Date().toISOString();
      }
      if (typeof project.completed === "undefined") {
        project.completed = false;
      }
      for (var t = 0; t < project.timeline.length; t += 1) {
        var node = project.timeline[t];
        if (!node.id) {
          node.id = uuid();
        }
        if (!node.createdAt) {
          node.createdAt = new Date().toISOString();
        }
        if (!node.title) {
          node.title = "节点";
        }
        if (!node.reason) {
          node.reason = "";
        }
        if (!node.impact) {
          node.impact = "";
        }
        if (!node.note) {
          node.note = "";
        }
        if (!node.startTime) {
          node.startTime = "";
        }
      }
      for (var q = 0; q < project.links.length; q += 1) {
        var link = project.links[q];
        if (!link.id) {
          link.id = uuid();
        }
        if (!link.createdAt) {
          link.createdAt = new Date().toISOString();
        }
      }
    }
    if (state.decisions.length === 0) {
      state.activeDecisionId = null;
    } else if (!hasActive) {
      state.activeDecisionId = state.decisions[0].id;
    }
  }

  function upsertFaq(bank, question, answer, meta) {
    if (!bank || !question || !answer) {
      return null;
    }
    var normalized = normalizeQuestionText(question);
    var existing = null;
    for (var i = 0; i < bank.faqs.length; i += 1) {
      var candidate = bank.faqs[i];
      var currentNorm = candidate.norm || normalizeQuestionText(candidate.question);
      if (currentNorm === normalized) {
        existing = candidate;
        break;
      }
    }
    if (existing) {
      existing.question = question;
      existing.answer = answer;
      existing.norm = normalized;
      existing.updatedAt = meta && meta.updatedAt ? meta.updatedAt : new Date().toISOString();
      existing.updatedBy = meta && meta.updatedBy ? meta.updatedBy : (currentUser ? currentUser.username : "");
      if (meta && meta.createdBy && !existing.createdBy) {
        existing.createdBy = meta.createdBy;
      }
      return { item: existing, created: false };
    }
    var now = meta && meta.createdAt ? meta.createdAt : new Date().toISOString();
    var createdBy = meta && meta.createdBy ? meta.createdBy : (currentUser ? currentUser.username : "");
    var faq = {
      id: uuid(),
      question: question,
      answer: answer,
      createdAt: now,
      createdBy: createdBy,
      norm: normalized
    };
    if (meta && meta.updatedAt) {
      faq.updatedAt = meta.updatedAt;
    }
    if (meta && meta.updatedBy) {
      faq.updatedBy = meta.updatedBy;
    }
    bank.faqs.push(faq);
    return { item: faq, created: true };
  }

  function arrayBufferToBase64(buffer) {
    var binary = "";
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    var binary = window.atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function deriveKey(password, saltBase64) {
    var saltBuffer = base64ToArrayBuffer(saltBase64);
    return window.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    ).then(function (keyMaterial) {
      return window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        256
      );
    }).then(function (bits) {
      return arrayBufferToBase64(bits);
    });
  }

  function ensureDefaultAdmin() {
    if (state.users.length > 0) {
      return Promise.resolve();
    }
    var saltArray = window.crypto.getRandomValues(new Uint8Array(16));
    var saltBinary = "";
    for (var i = 0; i < saltArray.length; i += 1) {
      saltBinary += String.fromCharCode(saltArray[i]);
    }
    var saltBase64 = window.btoa(saltBinary);
    return deriveKey("admin123", saltBase64).then(function (hash) {
      state.users.push({
        id: uuid(),
        username: "admin",
        salt: saltBase64,
        hash: hash,
        role: "admin",
        enabled: true,
        createdAt: new Date().toISOString()
      });
      saveState();
    });
  }

  function loadCurrentUser() {
    var userId = null;
    try {
      userId = sessionStorage.getItem(SESSION_KEY);
    } catch (err) {
      userId = null;
    }
    if (!userId) {
      currentUser = null;
      return;
    }
    currentUser = null;
    for (var i = 0; i < state.users.length; i += 1) {
      if (state.users[i].id === userId) {
        currentUser = state.users[i];
        break;
      }
    }
    if (!currentUser || !currentUser.enabled) {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch (err) {
        console.warn(err);
      }
      currentUser = null;
    }
  }

  function requireAuth() {
    if (!currentUser) {
      window.location.href = "login.html";
    }
  }

  function setNavUserInfo() {
    var info = document.getElementById("userInfo");
    if (info && currentUser) {
      info.textContent = currentUser.username + " · " + (currentUser.role === "admin" ? "管理员" : "操作员");
    }
  }

  function updateBankBadge() {
    var badge = document.getElementById("activeBankBadge");
    if (!badge) {
      return;
    }
    var bank = getActiveBank();
    if (bank) {
      if (!bank.logo) {
        bank.logo = bankLogoText(bank.name);
      }
      badge.innerHTML = "";
      var icon = document.createElement("span");
      icon.className = "bank-logo";
      icon.textContent = bank.logo;
      var label = document.createElement("span");
      label.textContent = bank.name;
      badge.appendChild(icon);
      badge.appendChild(label);
    } else {
      badge.innerHTML = "未选择记忆库";
    }
  }

  function getActiveBank() {
    if (!state.activeBankId) {
      return null;
    }
    for (var i = 0; i < state.banks.length; i += 1) {
      if (state.banks[i].id === state.activeBankId) {
        return state.banks[i];
      }
    }
    return null;
  }

  function ensureActiveBank() {
    if (!state.activeBankId && state.banks.length > 0) {
      state.activeBankId = state.banks[0].id;
      saveState();
    }
  }

  function renderBankList() {
    var container = document.getElementById("bankList");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    for (var i = 0; i < state.banks.length; i += 1) {
      (function (bank) {
        if (!bank.logo) {
          bank.logo = bankLogoText(bank.name);
        }
        var badge = document.createElement("div");
        badge.className = "badge" + (bank.id === state.activeBankId ? " active" : "");
        badge.innerHTML = "";
        var icon = document.createElement("span");
        icon.className = "badge-logo";
        icon.textContent = bank.logo;
        var label = document.createElement("span");
        label.className = "badge-label";
        label.textContent = bank.name;
        badge.appendChild(icon);
        badge.appendChild(label);
        badge.addEventListener("click", function () {
          state.activeBankId = bank.id;
          if (bank.sessions.length > 0) {
            state.activeSessionId = bank.sessions[0].id;
          } else {
            state.activeSessionId = null;
          }
          saveState();
          renderBankList();
          updateBankBadge();
          renderSessionList();
          renderCommonChips();
          renderChat();
          renderKnowledge();
          renderFaqList();
          renderCommonList();
          renderLogs();
        });
        container.appendChild(badge);
      })(state.banks[i]);
    }
  }

  function createBank() {
    var name = window.prompt("输入记忆库名称");
    if (!name) {
      return;
    }
    var bank = {
      id: uuid(),
      name: name,
      logo: bankLogoText(name),
      faqs: [],
      files: [],
      chunks: [],
      index: { df: {}, postings: {}, docLengths: {}, avgdl: 0, totalDocs: 0 },
      sessions: [],
      common: [],
      logs: []
    };
    state.banks.push(bank);
    state.activeBankId = bank.id;
    state.activeSessionId = null;
    saveState();
    renderBankList();
    updateBankBadge();
    renderSessionList();
    renderKnowledge();
    renderFaqList();
    renderCommonChips();
  }
  function removeSession(bank, sessionId) {
    var idx = -1;
    for (var i = 0; i < bank.sessions.length; i += 1) {
      if (bank.sessions[i].id === sessionId) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      bank.sessions.splice(idx, 1);
      if (state.activeSessionId === sessionId) {
        if (bank.sessions.length > 0) {
          state.activeSessionId = bank.sessions[0].id;
        } else {
          state.activeSessionId = null;
        }
      }
      saveState();
    }
  }

  function renderSessionList() {
    var container = document.getElementById("sessionList");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      return;
    }
    for (var i = 0; i < bank.sessions.length; i += 1) {
      (function (session) {
        var card = document.createElement("div");
        card.className = "session-card" + (session.id === state.activeSessionId ? " active" : "");
        var title = document.createElement("div");
        title.className = "session-title";
        title.textContent = session.title;
        var remove = document.createElement("button");
        remove.className = "session-remove";
        remove.type = "button";
        remove.textContent = "×";
        remove.addEventListener("click", function (evt) {
          evt.stopPropagation();
          if (window.confirm("确定删除该会话吗？")) {
            removeSession(bank, session.id);
            renderSessionList();
            renderChat();
          }
        });
        card.appendChild(title);
        card.appendChild(remove);
        card.addEventListener("click", function () {
          state.activeSessionId = session.id;
          saveState();
          renderSessionList();
          renderChat();
        });
        container.appendChild(card);
      })(bank.sessions[i]);
    }
  }

  function createSession() {
    var bank = getActiveBank();
    if (!bank) {
      showToast("请先创建记忆库");
      return;
    }
    var session = {
      id: uuid(),
      title: "新会话",
      messages: []
    };
    bank.sessions.unshift(session);
    state.activeSessionId = session.id;
    saveState();
    renderSessionList();
    renderChat();
  }

  function findSession(bank, sessionId) {
    for (var i = 0; i < bank.sessions.length; i += 1) {
      if (bank.sessions[i].id === sessionId) {
        return bank.sessions[i];
      }
    }
    return null;
  }

  function summarize(text) {
    if (!text) {
      return "";
    }
    if (text.length <= 30) {
      return text;
    }
    return text.slice(0, 27) + "...";
  }

  function autoTitle(session) {
    if (session.messages.length === 0) {
      session.title = "新会话";
      return;
    }
    for (var i = 0; i < session.messages.length; i += 1) {
      if (session.messages[i].role === "user") {
        var text = session.messages[i].text.replace(/\s+/g, " ");
        if (text.length > 0) {
          if (text.length > 24) {
            session.title = text.slice(0, 24);
          } else {
            session.title = text;
          }
          return;
        }
      }
    }
    session.title = "会话";
  }

  function highlightKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) {
      return text;
    }
    var result = text;
    for (var i = 0; i < keywords.length; i += 1) {
      var key = keywords[i];
      if (!key) {
        continue;
      }
      var escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var regex = new RegExp(escaped, "gi");
      result = result.replace(regex, function (match) {
        return '<span class="highlight">' + match + '</span>';
      });
    }
    return result;
  }

  function renderChat() {
    var area = document.getElementById("chatArea");
    if (!area) {
      return;
    }
    area.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      renderEvidence([], []);
      area.innerHTML = '<div class="message"><div class="message-bubble"><div class="content">请先创建记忆库</div></div></div>';
      return;
    }
    var session = findSession(bank, state.activeSessionId);
    if (!session) {
      renderEvidence([], []);
      area.innerHTML = '<div class="message"><div class="message-bubble"><div class="content">请选择或新建会话</div></div></div>';
      return;
    }
    for (var i = 0; i < session.messages.length; i += 1) {
      var message = session.messages[i];
      var wrapper = document.createElement("div");
      wrapper.className = "message" + (message.role === "user" ? " user" : "");
      var bubble = document.createElement("div");
      bubble.className = "message-bubble";
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = message.role === "user" ? "用户" : "助理";
      var content = document.createElement("div");
      content.className = "content";
      content.innerHTML = highlightKeywords(message.text, message.tags || []);
      bubble.appendChild(meta);
      bubble.appendChild(content);
      if (message.evidence && message.evidence.length > 0) {
        var label = document.createElement("div");
        label.className = "meta";
        label.textContent = "证据";
        bubble.appendChild(label);
        for (var j = 0; j < message.evidence.length; j += 1) {
          var ecard = document.createElement("div");
          ecard.className = "evidence-card embedded";
          var titleRow = document.createElement("div");
          titleRow.className = "evidence-title";
          var source = document.createElement("span");
          source.className = "evidence-source";
          source.textContent = message.evidence[j].source + " · 段 " + message.evidence[j].chunk;
          titleRow.appendChild(source);
          if (typeof message.evidence[j].score === "number") {
            var score = document.createElement("span");
            score.className = "evidence-score";
            score.textContent = message.evidence[j].score.toFixed(2);
            titleRow.appendChild(score);
          }
          ecard.appendChild(titleRow);
          if (message.evidence[j].text) {
            var snippet = document.createElement("div");
            snippet.className = "evidence-body";
            snippet.innerHTML = highlightKeywords(
              snippetText(message.evidence[j].text, 160),
              message.evidenceTokens || []
            );
            ecard.appendChild(snippet);
          }
          bubble.appendChild(ecard);
        }
      }
      wrapper.appendChild(bubble);
      area.appendChild(wrapper);
    }
    area.scrollTop = area.scrollHeight;
  }

  function renderCommonChips() {
    var bar = document.getElementById("commonChips");
    if (!bar) {
      return;
    }
    bar.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      return;
    }
    for (var i = 0; i < bank.common.length; i += 1) {
      (function (item) {
        var chip = document.createElement("div");
        chip.className = "chip";
        chip.textContent = item.text;
        chip.addEventListener("click", function () {
          var input = document.getElementById("chatInput");
          if (input) {
            if (input.value && input.value.length > 0) {
              input.value = input.value + " " + item.text;
            } else {
              input.value = item.text;
            }
          }
        });
        bar.appendChild(chip);
      })(bank.common[i]);
    }
  }

  function renderEvidence(evidence, keywords) {
    var panel = document.getElementById("evidencePanel");
    if (!panel) {
      return;
    }
    panel.innerHTML = "";
    if (!evidence || evidence.length === 0) {
      return;
    }
    var highlightKeys = [];
    if (keywords && keywords.length > 0) {
      var mark = {};
      for (var i = 0; i < keywords.length; i += 1) {
        var key = keywords[i];
        if (!key) {
          continue;
        }
        if (!mark[key]) {
          mark[key] = true;
          highlightKeys.push(key);
        }
      }
    }
    for (var i = 0; i < evidence.length; i += 1) {
      var card = document.createElement("div");
      card.className = "evidence-card";
      var header = document.createElement("div");
      header.className = "evidence-title";
      var source = document.createElement("span");
      source.className = "evidence-source";
      source.textContent = evidence[i].source + " · 段 " + evidence[i].chunk;
      header.appendChild(source);
      if (typeof evidence[i].score === "number") {
        var score = document.createElement("span");
        score.className = "evidence-score";
        score.textContent = evidence[i].score.toFixed(2);
        header.appendChild(score);
      }
      card.appendChild(header);
      if (evidence[i].text) {
        var body = document.createElement("div");
        body.className = "evidence-body";
        body.innerHTML = highlightKeywords(snippetText(evidence[i].text, 160), highlightKeys);
        card.appendChild(body);
      }
      panel.appendChild(card);
    }
  }

  function tokenize(text) {
    var tokens = [];
    var buffer = "";
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      var code = ch.charCodeAt(0);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
        buffer += ch.toLowerCase();
      } else {
        if (buffer.length > 0) {
          tokens.push(buffer);
          buffer = "";
        }
        if (code >= 19968 && code <= 40959) {
          var next = text.charAt(i + 1);
          if (next) {
            tokens.push(ch + next);
          } else {
            tokens.push(ch);
          }
        }
      }
    }
    if (buffer.length > 0) {
      tokens.push(buffer);
    }
    return tokens;
  }

  function chunkText(content, chunkSize, overlap) {
    var tokens = [];
    var lines = content.split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
      if (lines[i].trim().length > 0) {
        tokens.push(lines[i].trim());
      }
    }
    var joined = tokens.join("\n");
    var chunks = [];
    var start = 0;
    while (start < joined.length) {
      var end = start + chunkSize;
      if (end > joined.length) {
        end = joined.length;
      }
      var segment = joined.slice(start, end);
      chunks.push(segment);
      if (start + chunkSize >= joined.length) {
        break;
      }
      start = start + chunkSize - overlap;
      if (start < 0) {
        start = 0;
      }
    }
    return chunks;
  }

  function addChunksToIndex(bank, fileName, chunks) {
    for (var i = 0; i < chunks.length; i += 1) {
      var chunkId = fileName + "#" + (bank.index.totalDocs + 1);
      var text = chunks[i];
      var docTokens = tokenize(text);
      var counts = {};
      for (var j = 0; j < docTokens.length; j += 1) {
        var token = docTokens[j];
        if (!counts[token]) {
          counts[token] = 0;
        }
        counts[token] += 1;
      }
      for (var tokenKey in counts) {
        if (counts.hasOwnProperty(tokenKey)) {
          if (!bank.index.df[tokenKey]) {
            bank.index.df[tokenKey] = 0;
          }
          bank.index.df[tokenKey] += 1;
          if (!bank.index.postings[tokenKey]) {
            bank.index.postings[tokenKey] = {};
          }
          bank.index.postings[tokenKey][chunkId] = counts[tokenKey];
        }
      }
      bank.index.docLengths[chunkId] = docTokens.length;
      bank.index.totalDocs += 1;
      bank.chunks.push({
        id: chunkId,
        file: fileName,
        order: i + 1,
        text: text
      });
    }
    var totalLength = 0;
    var docCount = 0;
    for (var docId in bank.index.docLengths) {
      if (bank.index.docLengths.hasOwnProperty(docId)) {
        totalLength += bank.index.docLengths[docId];
        docCount += 1;
      }
    }
    bank.index.avgdl = docCount > 0 ? totalLength / docCount : 0;
  }

  function readFileContent(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function (err) {
        reject(err);
      };
      reader.readAsText(file, "utf-8");
    });
  }

  function normalizeJsonValue(value) {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (!value) {
      return "";
    }
    if (Array.isArray(value)) {
      return value.map(normalizeJsonValue).join("\n");
    }
    var parts = [];
    for (var key in value) {
      if (value.hasOwnProperty(key)) {
        parts.push(key + ": " + normalizeJsonValue(value[key]));
      }
    }
    return parts.join("\n");
  }

  function parseFileContent(name, content) {
    var lower = name.toLowerCase();
    if (lower.indexOf(".csv") >= 0) {
      return content;
    }
    if (lower.indexOf(".json") >= 0) {
      try {
        var data = JSON.parse(content);
        return normalizeJsonValue(data);
      } catch (err) {
        return content;
      }
    }
    if (lower.indexOf(".html") >= 0) {
      var div = document.createElement("div");
      div.innerHTML = content;
      return div.textContent || "";
    }
    return content;
  }

  function renderKnowledge() {
    var fileList = document.getElementById("kbFileList");
    var preview = document.getElementById("chunkPreview");
    if (!fileList && !preview) {
      return;
    }
    var bank = getActiveBank();
    if (fileList) {
      fileList.innerHTML = "";
    }
    if (preview) {
      preview.innerHTML = "";
    }
    if (!bank) {
      return;
    }
    for (var i = 0; i < bank.files.length; i += 1) {
      if (fileList) {
        var fcard = document.createElement("div");
        fcard.className = "file-card";
        fcard.innerHTML = '<strong>' + bank.files[i].name + '</strong><div class="meta">' + bank.files[i].chunks + ' 段 · ' + bank.files[i].size + ' bytes</div>';
        fileList.appendChild(fcard);
      }
    }
    if (preview) {
      for (var j = 0; j < bank.chunks.length; j += 1) {
        if (j > 200) {
          break;
        }
        var ccard = document.createElement("div");
        ccard.className = "chunk-card";
        ccard.innerHTML = '<div class="meta">' + bank.chunks[j].file + ' · 段 ' + bank.chunks[j].order + '</div><div class="content">' + bank.chunks[j].text + '</div>';
        preview.appendChild(ccard);
      }
    }
  }

  function ensureSession() {
    var bank = getActiveBank();
    if (!bank) {
      return null;
    }
    var session = findSession(bank, state.activeSessionId);
    if (!session && bank.sessions.length > 0) {
      session = bank.sessions[0];
      state.activeSessionId = session.id;
      saveState();
    }
    return session;
  }

  function handleSendMessage() {
    var input = document.getElementById("chatInput");
    if (!input) {
      return;
    }
    var text = input.value.trim();
    if (text.length === 0) {
      return;
    }
    var bank = getActiveBank();
    if (!bank) {
      showToast("请先创建记忆库");
      return;
    }
    var session = ensureSession();
    if (!session) {
      createSession();
      session = ensureSession();
    }
    var message = {
      role: "user",
      text: text,
      ts: new Date().toISOString(),
      tags: extractTags(text)
    };
    session.messages.push(message);
    autoTitle(session);
    input.value = "";
    saveState();
    renderSessionList();
    processAssistantReply(bank, session, text);
  }

  function extractTags(text) {
    var tokens = tokenize(text);
    var unique = [];
    var seen = {};
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      if (!seen[token] && token.length > 1) {
        seen[token] = true;
        unique.push(token);
      }
    }
    return unique.slice(0, 5);
  }
  function computeBM25(bank, queryTokens) {
    var scores = {};
    var totalDocs = bank.index.totalDocs;
    if (totalDocs === 0) {
      return [];
    }
    var avgdl = bank.index.avgdl || 1;
    for (var i = 0; i < queryTokens.length; i += 1) {
      var token = queryTokens[i];
      if (!bank.index.postings[token]) {
        continue;
      }
      var df = bank.index.df[token] || 0;
      var idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
      var postings = bank.index.postings[token];
      for (var docId in postings) {
        if (postings.hasOwnProperty(docId)) {
          if (!scores[docId]) {
            scores[docId] = 0;
          }
          var tf = postings[docId];
          var docLen = bank.index.docLengths[docId] || avgdl;
          var numerator = tf * (1.2 + 1);
          var denominator = tf + 1.2 * (1 - 0.75 + 0.75 * (docLen / avgdl));
          scores[docId] += idf * (numerator / denominator);
        }
      }
    }
    var entries = [];
    for (var docIdKey in scores) {
      if (scores.hasOwnProperty(docIdKey)) {
        entries.push({ id: docIdKey, score: scores[docIdKey] });
      }
    }
    entries.sort(function (a, b) {
      return b.score - a.score;
    });
    return entries;
  }

  function lookupChunk(bank, chunkId) {
    for (var i = 0; i < bank.chunks.length; i += 1) {
      if (bank.chunks[i].id === chunkId) {
        return bank.chunks[i];
      }
    }
    return null;
  }

  function smallTalk(text) {
    var patterns = [
      { regex: /(你好|您好|哈喽|hi|hello)/i, reply: "您好，我是认知控制台助理，很高兴为您服务。" },
      { regex: /(谢谢|感谢)/, reply: "感谢您的反馈，如需更多帮助请随时告诉我。" },
      { regex: /(再见|拜拜|下次见)/, reply: "期待再次为您服务，祝您工作顺利。" },
      { regex: /(你是谁|你是誰|身份|介绍)/, reply: "我是部署在本地的知识对话助手，负责检索知识库并给出专业建议。" },
      { regex: /(帮助|怎么用|说明)/, reply: "您可以输入问题，我会从知识库和FAQ中检索答案；管理员可在知识库与FAQ页面维护数据。" }
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      if (patterns[i].regex.test(text)) {
        return patterns[i].reply;
      }
    }
    return null;
  }

  function expandTerms(tokens) {
    var map = {
      "问题": ["疑问", "咨询"],
      "知识": ["内容", "资料"],
      "帮助": ["支援", "协助"],
      "文档": ["资料", "说明"],
      "登录": ["登入", "认证"],
      "错误": ["异常", "故障"],
      "性能": ["效率", "速度"]
    };
    var expanded = tokens.slice();
    for (var i = 0; i < tokens.length; i += 1) {
      var list = map[tokens[i]];
      if (list) {
        for (var j = 0; j < list.length; j += 1) {
          expanded.push(list[j]);
        }
      }
    }
    return expanded;
  }

  function reasoningSummary(texts, level) {
    var points = [];
    for (var i = 0; i < texts.length; i += 1) {
      var snippet = texts[i];
      if (snippet.length > 100) {
        snippet = snippet.slice(0, 100);
      }
      points.push((i + 1) + ". " + snippet);
      if (points.length >= level * 2) {
        break;
      }
    }
    return points.join("\n");
  }

  function logConversation(bank, question, answer, evidence) {
    var entry = {
      id: uuid(),
      time: new Date().toISOString(),
      user: currentUser ? currentUser.username : "访客",
      question: question,
      summary: summarize(answer),
      sources: evidence ? evidence.length : 0
    };
    bank.logs.unshift(entry);
    if (bank.logs.length > 200) {
      bank.logs.length = 200;
    }
  }

  function processAssistantReply(bank, session, text) {
    renderChat();
    renderEvidence([], []);
    var tokens = tokenize(text);
    var highlightTokens = extractTags(text);
    var replyText = smallTalk(text);
    var evidence = [];
    if (!replyText) {
      var expanded = expandTerms(tokens);
      var scored = computeBM25(bank, expanded);
      var top = scored.slice(0, state.settings.topN);
      for (var i = 0; i < top.length; i += 1) {
        var chunk = lookupChunk(bank, top[i].id);
        if (chunk) {
          evidence.push({ source: chunk.file, chunk: chunk.order, text: chunk.text, score: top[i].score });
        }
      }
      renderEvidence(evidence, highlightTokens);
      var best = evidence.length > 0 ? evidence[0] : null;
      var faqResult = matchFaq(bank, text);
      var bestFaq = faqResult.best;
      if (bestFaq && bestFaq.score >= state.settings.faqHigh) {
        replyText = "FAQ直答：" + bestFaq.item.answer;
      } else if (best) {
        replyText = best.text;
        if (bestFaq && bestFaq.score >= state.settings.faqLow) {
          replyText = replyText + "\nFAQ建议：" + bestFaq.item.answer;
        }
      } else if (bestFaq) {
        replyText = "FAQ建议：" + bestFaq.item.answer;
      } else {
        replyText = "当前记忆库暂无相关内容，我会记录您的问题以便后续补充。";
      }
      var reasoningEnabled = state.adminFlags.reasoning;
      var pageToggle = document.getElementById("reasoningToggle");
      if (pageToggle && pageToggle.checked && currentUser && currentUser.role === "admin") {
        reasoningEnabled = true;
      }
      if (reasoningEnabled && evidence.length > 0) {
        var reasoning = reasoningSummary(evidence.map(function (item) { return item.text; }), state.adminFlags.reasoningLevel || 1);
        replyText = replyText + "\n要点：\n" + reasoning;
      }
    }
    var reply = {
      role: "assistant",
      text: replyText,
      ts: new Date().toISOString(),
      evidence: evidence.slice(0, 3),
      evidenceTokens: highlightTokens
    };
    session.messages.push(reply);
    logConversation(bank, text, replyText, evidence);
    saveState();
    renderChat();
    renderLogs();
  }

  function matchFaq(bank, query) {
    var result = { best: null, matches: [] };
    if (!bank || !query) {
      return result;
    }
    for (var i = 0; i < bank.faqs.length; i += 1) {
      var faq = bank.faqs[i];
      var scoreValue = jaccard(query, faq.question);
      var percent = Math.round(scoreValue * 100);
      if (!result.best || percent > result.best.score) {
        result.best = { item: faq, score: percent };
      }
      if (percent >= state.settings.faqLow) {
        result.matches.push({ item: faq, score: percent });
      }
    }
    result.matches.sort(function (a, b) {
      return b.score - a.score;
    });
    if (!result.best || result.best.score < state.settings.faqLow) {
      result.best = null;
    }
    return result;
  }

  function jaccard(a, b) {
    var setA = {};
    var tokensA = tokenize(a);
    for (var i = 0; i < tokensA.length; i += 1) {
      setA[tokensA[i]] = true;
    }
    var setB = {};
    var tokensB = tokenize(b);
    for (var j = 0; j < tokensB.length; j += 1) {
      setB[tokensB[j]] = true;
    }
    var inter = 0;
    var union = 0;
    for (var keyA in setA) {
      if (setA.hasOwnProperty(keyA)) {
        union += 1;
        if (setB[keyA]) {
          inter += 1;
        }
      }
    }
    for (var keyB in setB) {
      if (setB.hasOwnProperty(keyB) && !setA[keyB]) {
        union += 1;
      }
    }
    if (union === 0) {
      return 0;
    }
    return inter / union;
  }

  function resetFaqForm() {
    var form = document.getElementById("faqForm");
    if (!form) {
      return;
    }
    form.reset();
    faqEditingId = null;
    form.removeAttribute("data-editing");
    var mode = document.getElementById("faqFormMode");
    if (mode) {
      mode.textContent = "新增";
    }
  }

  function startFaqEdit(faq) {
    var form = document.getElementById("faqForm");
    if (!form || !faq) {
      return;
    }
    var questionInput = document.getElementById("faqQuestion");
    var answerInput = document.getElementById("faqAnswer");
    if (questionInput) {
      questionInput.value = faq.question || "";
      questionInput.focus();
      questionInput.setSelectionRange(questionInput.value.length, questionInput.value.length);
    }
    if (answerInput) {
      answerInput.value = faq.answer || "";
    }
    faqEditingId = faq.id;
    form.setAttribute("data-editing", faq.id);
    var mode = document.getElementById("faqFormMode");
    if (mode) {
      mode.textContent = "编辑";
    }
  }

  function renderFaqList() {
    var list = document.getElementById("faqList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      return;
    }
    if (bank.faqs.length === 0) {
      list.innerHTML = '<div class="panel-hint">当前记忆库暂无 FAQ</div>';
      return;
    }
    var ordered = bank.faqs.slice().sort(function (a, b) {
      var ta = a.updatedAt || a.createdAt || "";
      var tb = b.updatedAt || b.createdAt || "";
      return tb.localeCompare(ta);
    });
    for (var i = 0; i < ordered.length; i += 1) {
      (function (faq) {
        var card = document.createElement("div");
        card.className = "faq-card";
        if (faqEditingId && faqEditingId === faq.id) {
          card.className += " active";
        }
        var header = document.createElement("header");
        var title = document.createElement("div");
        var qBadge = document.createElement("span");
        qBadge.className = "badge-strong";
        qBadge.textContent = "Q";
        title.appendChild(qBadge);
        title.appendChild(document.createTextNode(" " + faq.question));
        var tools = document.createElement("div");
        tools.className = "card-actions";
        var editBtn = document.createElement("button");
        editBtn.className = "text-button";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", function () {
          startFaqEdit(faq);
        });
        var delBtn = document.createElement("button");
        delBtn.className = "text-button danger";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", function () {
          if (!window.confirm("确定删除该 FAQ？")) {
            return;
          }
          var idx = bank.faqs.indexOf(faq);
          if (idx >= 0) {
            bank.faqs.splice(idx, 1);
          }
          if (faqEditingId === faq.id) {
            resetFaqForm();
          }
          saveState();
          renderFaqList();
        });
        tools.appendChild(editBtn);
        tools.appendChild(delBtn);
        header.appendChild(title);
        header.appendChild(tools);
        var body = document.createElement("div");
        var aBadge = document.createElement("span");
        aBadge.className = "badge-strong";
        aBadge.textContent = "A";
        body.appendChild(aBadge);
        body.appendChild(document.createTextNode(" " + faq.answer));
        var meta = document.createElement("div");
        meta.className = "meta";
        var metaText = "创建人:" + (faq.createdBy || "") + " · 更新时间:" + formatDateTime(faq.updatedAt || faq.createdAt || "");
        if (faq.updatedBy) {
          metaText += " · 更新人:" + faq.updatedBy;
        }
        meta.textContent = metaText;
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(meta);
        list.appendChild(card);
      })(ordered[i]);
    }
  }

  function renderFaqMatch(result) {
    var box = document.getElementById("faqMatchResult");
    if (!box) {
      return;
    }
    box.innerHTML = "";
    if (!result || !result.matches || result.matches.length === 0) {
      box.textContent = "暂无≥" + state.settings.faqLow + "%的候选";
      return;
    }
    for (var i = 0; i < result.matches.length; i += 1) {
      var match = result.matches[i];
      var card = document.createElement("div");
      card.className = "match-card" + (i === 0 ? " best" : "");
      var score = document.createElement("div");
      score.className = "match-score";
      score.textContent = match.score + "%";
      var question = document.createElement("div");
      question.innerHTML = '<strong>问题：</strong>' + match.item.question;
      var answer = document.createElement("div");
      answer.innerHTML = '<strong>答案：</strong>' + match.item.answer;
      card.appendChild(score);
      card.appendChild(question);
      card.appendChild(answer);
      box.appendChild(card);
    }
  }

  function renderKbFaqPreview(items) {
    var box = document.getElementById("kbFaqPreview");
    if (!box) {
      return;
    }
    box.innerHTML = "";
    if (!items) {
      return;
    }
    for (var i = 0; i < items.length; i += 1) {
      (function (item) {
        var card = document.createElement("div");
        card.className = "faq-card";
        card.innerHTML = '<header><div><span class="badge-strong">Q</span> ' + item.question + '</div></header><div><span class="badge-strong">A</span> ' + item.answer + '</div>';
        card.addEventListener("click", function () {
          var bank = getActiveBank();
          if (!bank) {
            return;
          }
          var inserted = upsertFaq(bank, item.question, item.answer, {
            createdBy: currentUser ? currentUser.username : ""
          });
          if (inserted) {
            saveState();
            renderFaqList();
            showToast(inserted.created ? "已导入 FAQ" : "FAQ 已更新");
          }
        });
        box.appendChild(card);
      })(items[i]);
    }
  }

  function extractFaqCandidates(bank) {
    var candidates = [];
    if (!bank) {
      return candidates;
    }
    var seen = {};
    for (var i = 0; i < bank.chunks.length; i += 1) {
      var text = bank.chunks[i].text;
      var sentences = text.split(/[。！？\?\!]/);
      for (var j = 0; j < sentences.length; j += 1) {
        var sentence = sentences[j].trim();
        if (sentence.length === 0) {
          continue;
        }
        if (sentence.charAt(sentence.length - 1) === "?" || sentence.indexOf("什么") === 0 || sentence.indexOf("如何") === 0 || sentence.indexOf("怎样") === 0) {
          var normalized = normalizeQuestionText(sentence);
          if (normalized.length === 0 || seen[normalized]) {
            continue;
          }
          var answerParts = [];
          var next1 = sentences[j + 1] ? sentences[j + 1].trim() : "";
          var next2 = sentences[j + 2] ? sentences[j + 2].trim() : "";
          if (next1.length > 0) {
            answerParts.push(next1);
          }
          if (next2.length > 0) {
            answerParts.push(next2);
          }
          if (answerParts.length === 0) {
            continue;
          }
          seen[normalized] = true;
          candidates.push({ question: sentence, answer: answerParts.join("。") });
        }
      }
    }
    return candidates.slice(0, 50);
  }

  function renderUsers() {
    var list = document.getElementById("userList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    for (var i = 0; i < state.users.length; i += 1) {
      (function (user) {
        var card = document.createElement("div");
        card.className = "user-card";
        var header = document.createElement("header");
        var title = document.createElement("div");
        title.innerHTML = '<span class="badge-small">' + (user.role === "admin" ? "管理员" : "操作员") + '</span> ' + user.username;
        var tools = document.createElement("div");
        var resetBtn = document.createElement("button");
        resetBtn.className = "ghost-button";
        resetBtn.textContent = "重置密码";
        resetBtn.addEventListener("click", function () {
          resetPassword(user);
        });
        var toggleBtn = document.createElement("button");
        toggleBtn.className = "ghost-button";
        toggleBtn.textContent = user.enabled ? "禁用" : "启用";
        toggleBtn.addEventListener("click", function () {
          user.enabled = !user.enabled;
          saveState();
          renderUsers();
        });
        var deleteBtn = document.createElement("button");
        deleteBtn.className = "ghost-button";
        deleteBtn.textContent = "删除";
        deleteBtn.addEventListener("click", function () {
          if (window.confirm("确认删除用户？")) {
            var idx = state.users.indexOf(user);
            if (idx >= 0) {
              state.users.splice(idx, 1);
            }
            saveState();
            renderUsers();
          }
        });
        tools.appendChild(resetBtn);
        tools.appendChild(toggleBtn);
        tools.appendChild(deleteBtn);
        header.appendChild(title);
        header.appendChild(tools);
        var meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = "创建时间:" + (user.createdAt || "") + " · 状态:" + (user.enabled ? "启用" : "禁用");
        card.appendChild(header);
        card.appendChild(meta);
        list.appendChild(card);
      })(state.users[i]);
    }
  }

  function renderCommonList() {
    var list = document.getElementById("commonList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      list.textContent = "请先选择记忆库";
      return;
    }
    for (var i = 0; i < bank.common.length; i += 1) {
      (function (item) {
        var card = document.createElement("div");
        card.className = "faq-card";
        card.innerHTML = '<header><div>' + item.text + '</div><div class="meta">' + (item.createdBy || "") + '</div></header>';
        card.addEventListener("click", function () {
          if (window.confirm("删除该常用问题？")) {
            var idx = bank.common.indexOf(item);
            if (idx >= 0) {
              bank.common.splice(idx, 1);
            }
            saveState();
            renderCommonList();
            renderCommonChips();
          }
        });
        list.appendChild(card);
      })(bank.common[i]);
    }
  }

  function renderLogs() {
    var list = document.getElementById("logList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      list.textContent = "请选择记忆库";
      return;
    }
    if (bank.logs.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无日志</div>';
      return;
    }
    for (var i = 0; i < bank.logs.length; i += 1) {
      (function (entry) {
        var card = document.createElement("div");
        card.className = "log-card";
        var header = document.createElement("header");
        var title = document.createElement("div");
        title.textContent = entry.question;
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var delBtn = document.createElement("button");
        delBtn.className = "text-button danger";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", function () {
          var idx = bank.logs.indexOf(entry);
          if (idx >= 0) {
            bank.logs.splice(idx, 1);
            saveState();
            renderLogs();
          }
        });
        actions.appendChild(delBtn);
        header.appendChild(title);
        header.appendChild(actions);
        var summary = document.createElement("div");
        summary.textContent = "摘要：" + (entry.summary || "");
        var meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = "时间 " + formatDateTime(entry.time) + " · 来源数 " + (entry.sources || 0) + " · 用户 " + (entry.user || "");
        card.appendChild(header);
        card.appendChild(summary);
        card.appendChild(meta);
        list.appendChild(card);
      })(bank.logs[i]);
    }
  }

  function getDecisionProjectById(id) {
    if (!state || !state.decisions) {
      return null;
    }
    for (var i = 0; i < state.decisions.length; i += 1) {
      if (state.decisions[i].id === id) {
        return state.decisions[i];
      }
    }
    return null;
  }

  function getActiveDecisionProject() {
    if (!state) {
      return null;
    }
    return getDecisionProjectById(state.activeDecisionId);
  }

  function deleteDecisionProject(projectId) {
    if (!state || !state.decisions || !projectId) {
      return false;
    }
    for (var i = 0; i < state.decisions.length; i += 1) {
      if (state.decisions[i].id === projectId) {
        state.decisions.splice(i, 1);
        if (state.activeDecisionId === projectId) {
          state.activeDecisionId = null;
        }
        saveState();
        return true;
      }
    }
    return false;
  }

  function sortTimeline(project) {
    if (!project || !project.timeline) {
      return;
    }
    project.timeline.sort(function (a, b) {
      var ta = a.startTime || "";
      var tb = b.startTime || "";
      if (ta && tb) {
        if (ta === tb) {
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        }
        return ta.localeCompare(tb);
      }
      if (ta) {
        return -1;
      }
      if (tb) {
        return 1;
      }
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }

  function renderDecisionPalette() {
    var palette = document.getElementById("decisionPalette");
    if (!palette) {
      return;
    }
    palette.innerHTML = "";
    for (var i = 0; i < DECISION_PRESETS.length; i += 1) {
      var item = document.createElement("div");
      item.className = "palette-item";
      item.draggable = true;
      item.textContent = DECISION_PRESETS[i].label;
      item.dataset.value = DECISION_PRESETS[i].label;
      item.addEventListener("dragstart", function (evt) {
        evt.dataTransfer.setData("text/plain", evt.target.dataset.value);
      });
      palette.appendChild(item);
    }
  }

  function addTimelineNode(project, label) {
    if (!project || !project.timeline) {
      return;
    }
    var node = {
      id: uuid(),
      title: label || "节点",
      startTime: project.startTime || "",
      reason: "",
      impact: "",
      note: "",
      createdAt: new Date().toISOString()
    };
    project.timeline.push(node);
    sortTimeline(project);
  }

  function findTimelineNode(project, id) {
    if (!project || !project.timeline) {
      return null;
    }
    for (var i = 0; i < project.timeline.length; i += 1) {
      if (project.timeline[i].id === id) {
        return project.timeline[i];
      }
    }
    return null;
  }

  function findNodeTitle(project, id) {
    var node = findTimelineNode(project, id);
    if (!node) {
      return "节点";
    }
    return node.title || "节点";
  }

  function hideLinkForm() {
    var form = document.getElementById("linkForm");
    if (form) {
      form.classList.add("hidden");
      form.removeAttribute("data-from");
      form.removeAttribute("data-to");
      form.reset();
    }
    var summary = document.getElementById("linkSummary");
    if (summary) {
      summary.textContent = "";
    }
  }

  function openLinkForm(fromId, toId) {
    var project = getActiveDecisionProject();
    var form = document.getElementById("linkForm");
    var summary = document.getElementById("linkSummary");
    if (!project || !form || !summary) {
      return;
    }
    var fromTitle = findNodeTitle(project, fromId);
    var toTitle = findNodeTitle(project, toId);
    summary.textContent = fromTitle + " → " + toTitle;
    form.classList.remove("hidden");
    form.setAttribute("data-from", fromId);
    form.setAttribute("data-to", toId);
    var relation = document.getElementById("linkRelation");
    if (relation) {
      relation.focus();
    }
  }

  function renderLinkList(project) {
    var list = document.getElementById("linkList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    if (!project || !project.links || project.links.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无关联</div>';
      return;
    }
    for (var i = 0; i < project.links.length; i += 1) {
      (function (link) {
        var item = document.createElement("div");
        item.className = "link-item";
        var info = document.createElement("div");
        var relation = link.relation || "关联";
        var note = link.note ? " · " + link.note : "";
        var fromLabel = document.createElement("strong");
        fromLabel.textContent = findNodeTitle(project, link.fromId);
        var toLabel = document.createElement("strong");
        toLabel.textContent = findNodeTitle(project, link.toId);
        info.appendChild(fromLabel);
        info.appendChild(document.createTextNode(" → "));
        info.appendChild(toLabel);
        var metaInfo = document.createElement("div");
        metaInfo.className = "meta";
        metaInfo.textContent = relation + note;
        info.appendChild(metaInfo);
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var delBtn = document.createElement("button");
        delBtn.className = "text-button danger";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", function () {
          var idx = project.links.indexOf(link);
          if (idx >= 0) {
            project.links.splice(idx, 1);
            saveState();
            renderLinkList(project);
            renderDecisionHistory();
          }
        });
        actions.appendChild(delBtn);
        item.appendChild(info);
        item.appendChild(actions);
        list.appendChild(item);
      })(project.links[i]);
    }
  }

  function createTimelineNode(project, node, locked) {
    var card = document.createElement("div");
    card.className = "timeline-node";
    card.setAttribute("data-node", node.id);
    if (pendingLinkFromId && pendingLinkFromId === node.id) {
      card.classList.add("linking");
    }
    var header = document.createElement("header");
    var titleWrap = document.createElement("div");
    titleWrap.className = "node-title";
    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = node.title || "";
    titleInput.placeholder = "节点名称";
    titleInput.disabled = locked;
    titleInput.addEventListener("input", function () {
      node.title = titleInput.value;
      saveState();
      renderLinkList(project);
    });
    titleWrap.appendChild(titleInput);
    var actions = document.createElement("div");
    actions.className = "node-actions";
    var linkBtn = document.createElement("button");
    linkBtn.className = "text-button";
    linkBtn.textContent = pendingLinkFromId && pendingLinkFromId === node.id ? "取消关联" : "关联";
    linkBtn.disabled = locked;
    linkBtn.addEventListener("click", function () {
      if (locked) {
        return;
      }
      if (!pendingLinkFromId) {
        pendingLinkFromId = node.id;
        hideLinkForm();
        renderActiveProject();
        return;
      }
      if (pendingLinkFromId === node.id) {
        pendingLinkFromId = null;
        hideLinkForm();
        renderActiveProject();
        return;
      }
      openLinkForm(pendingLinkFromId, node.id);
    });
    var delBtn = document.createElement("button");
    delBtn.className = "text-button danger";
    delBtn.textContent = "移除";
    delBtn.disabled = locked;
    delBtn.addEventListener("click", function () {
      if (locked) {
        return;
      }
      var idx = project.timeline.indexOf(node);
      if (idx >= 0) {
        project.timeline.splice(idx, 1);
      }
      for (var i = project.links.length - 1; i >= 0; i -= 1) {
        if (project.links[i].fromId === node.id || project.links[i].toId === node.id) {
          project.links.splice(i, 1);
        }
      }
      if (pendingLinkFromId === node.id) {
        pendingLinkFromId = null;
        hideLinkForm();
      }
      saveState();
      renderActiveProject();
      renderDecisionHistory();
    });
    actions.appendChild(linkBtn);
    actions.appendChild(delBtn);
    header.appendChild(titleWrap);
    header.appendChild(actions);
    var timeLabel = document.createElement("label");
    timeLabel.textContent = "开始时间";
    var timeInput = document.createElement("input");
    timeInput.type = "datetime-local";
    timeInput.value = node.startTime || "";
    timeInput.disabled = locked;
    timeInput.addEventListener("change", function () {
      node.startTime = timeInput.value;
      sortTimeline(project);
      saveState();
      renderActiveProject();
    });
    timeLabel.appendChild(timeInput);
    var reasonLabel = document.createElement("label");
    reasonLabel.textContent = "开始原因";
    var reasonInput = document.createElement("textarea");
    reasonInput.value = node.reason || "";
    reasonInput.placeholder = "说明触发该节点的原因";
    reasonInput.disabled = locked;
    reasonInput.addEventListener("input", function () {
      node.reason = reasonInput.value;
      saveState();
    });
    reasonLabel.appendChild(reasonInput);
    var impactLabel = document.createElement("label");
    impactLabel.textContent = "产生后果";
    var impactInput = document.createElement("textarea");
    impactInput.value = node.impact || "";
    impactInput.placeholder = "记录该节点带来的影响";
    impactInput.disabled = locked;
    impactInput.addEventListener("input", function () {
      node.impact = impactInput.value;
      saveState();
    });
    impactLabel.appendChild(impactInput);
    var noteLabel = document.createElement("label");
    noteLabel.textContent = "备注";
    var noteInput = document.createElement("textarea");
    noteInput.value = node.note || "";
    noteInput.placeholder = "其他补充信息";
    noteInput.disabled = locked;
    noteInput.addEventListener("input", function () {
      node.note = noteInput.value;
      saveState();
    });
    noteLabel.appendChild(noteInput);
    card.appendChild(header);
    card.appendChild(timeLabel);
    card.appendChild(reasonLabel);
    card.appendChild(impactLabel);
    card.appendChild(noteLabel);
    return card;
  }

  function renderActiveProject() {
    var nameEl = document.getElementById("activeProjectName");
    var metaEl = document.getElementById("activeProjectMeta");
    var canvas = document.getElementById("timelineCanvas");
    var completeBtn = document.getElementById("completeProject");
    var project = getActiveDecisionProject();
    if (nameEl) {
      nameEl.textContent = project ? project.name : "未选择项目";
    }
    if (metaEl) {
      var startText = project && project.startTime ? formatDateTime(project.startTime) : "--";
      metaEl.textContent = "开始时间：" + startText;
    }
    if (completeBtn) {
      completeBtn.disabled = !project || project.completed;
    }
    if (!canvas) {
      return;
    }
    canvas.classList.toggle("locked", !project || project.completed);
    canvas.innerHTML = "";
    if (!project) {
      var empty = document.createElement("div");
      empty.className = "timeline-placeholder";
      empty.textContent = "请先创建或选择项目";
      canvas.appendChild(empty);
      renderLinkList(null);
      return;
    }
    sortTimeline(project);
    if (!project.timeline || project.timeline.length === 0) {
      var placeholder = document.createElement("div");
      placeholder.className = "timeline-placeholder";
      placeholder.textContent = "拖动右侧常用项目到此处，开始绘制决策链";
      canvas.appendChild(placeholder);
    } else {
      for (var i = 0; i < project.timeline.length; i += 1) {
        canvas.appendChild(createTimelineNode(project, project.timeline[i], project.completed));
      }
    }
    renderLinkList(project);
  }

  function renderProjectList() {
    var list = document.getElementById("projectList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    if (!state.decisions || state.decisions.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无项目</div>';
      return;
    }
    var ordered = state.decisions.slice().sort(function (a, b) {
      var ta = a.createdAt || "";
      var tb = b.createdAt || "";
      return tb.localeCompare(ta);
    });
    if (!state.activeDecisionId || !getDecisionProjectById(state.activeDecisionId)) {
      state.activeDecisionId = ordered[0].id;
      saveState();
    }
    for (var i = 0; i < ordered.length; i += 1) {
        (function (project) {
          var isActive = state.activeDecisionId === project.id;
          var item = document.createElement("div");
          item.className = "history-item" + (project.completed ? " completed" : "");
          if (isActive) {
            item.className += " active";
          }
          var header = document.createElement("header");
          var title = document.createElement("div");
          title.textContent = project.name;
          var actions = document.createElement("div");
          actions.className = "card-actions";
          var removeBtn = document.createElement("button");
          removeBtn.className = "text-button danger";
          removeBtn.type = "button";
          removeBtn.textContent = "删除";
          removeBtn.addEventListener("click", function (evt) {
            evt.stopPropagation();
            if (!window.confirm("确认删除该项目？")) {
              return;
            }
            if (deleteDecisionProject(project.id)) {
              pendingLinkFromId = null;
              hideLinkForm();
              renderDecisionPage();
              showToast("项目已删除");
            }
          });
          actions.appendChild(removeBtn);
          header.appendChild(title);
          header.appendChild(actions);
          var meta = document.createElement("div");
          meta.className = "meta";
          var start = formatDateTime(project.startTime);
          var nodes = project.timeline ? project.timeline.length : 0;
          meta.textContent = "开始 " + start + " · 节点 " + nodes;
          item.appendChild(header);
          item.appendChild(meta);
          item.addEventListener("click", function () {
            state.activeDecisionId = project.id;
            pendingLinkFromId = null;
            hideLinkForm();
            saveState();
            renderProjectList();
            renderActiveProject();
            renderDecisionHistory();
          });
          list.appendChild(item);
        })(ordered[i]);
    }
  }

  function renderDecisionHistory() {
    var container = document.getElementById("decisionHistory");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!state.decisions || state.decisions.length === 0) {
      container.innerHTML = '<div class="panel-hint">暂无历史记录</div>';
      return;
    }
    var completed = [];
    for (var i = 0; i < state.decisions.length; i += 1) {
      if (state.decisions[i].completed) {
        completed.push(state.decisions[i]);
      }
    }
    if (completed.length === 0) {
      container.innerHTML = '<div class="panel-hint">暂无已完成的决策</div>';
      return;
    }
    completed.sort(function (a, b) {
      var ta = a.endTime || a.updatedAt || a.createdAt || "";
      var tb = b.endTime || b.updatedAt || b.createdAt || "";
      return tb.localeCompare(ta);
    });
    for (var j = 0; j < completed.length; j += 1) {
      var card = document.createElement("div");
      card.className = "history-card";
      var header = document.createElement("header");
      var title = document.createElement("div");
      title.textContent = completed[j].name;
      var score = document.createElement("div");
      score.className = "score";
      score.textContent = typeof completed[j].score === "number" ? "评分 " + completed[j].score : "评分 --";
      header.appendChild(title);
      header.appendChild(score);
      var duration = document.createElement("div");
      duration.className = "meta";
      duration.textContent = formatDateTime(completed[j].startTime) + " → " + formatDateTime(completed[j].endTime);
      var outcome = document.createElement("div");
      outcome.textContent = "效果：" + (completed[j].outcome || "");
      card.appendChild(header);
      card.appendChild(duration);
      card.appendChild(outcome);
      container.appendChild(card);
    }
  }

  function renderDecisionPage() {
    renderDecisionPalette();
    renderProjectList();
    renderActiveProject();
    renderDecisionHistory();
  }

  function handleTimelineDrop(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    var project = getActiveDecisionProject();
    if (!project || project.completed) {
      return;
    }
    var label = evt.dataTransfer.getData("text/plain");
    if (!label) {
      return;
    }
    label = label.trim();
    if (!label) {
      return;
    }
    addTimelineNode(project, label);
    saveState();
    renderActiveProject();
  }

  function resetPassword(user) {
    var newPwd = window.prompt("输入新密码");
    if (!newPwd) {
      return;
    }
    var saltArray = window.crypto.getRandomValues(new Uint8Array(16));
    var saltBinary = "";
    for (var i = 0; i < saltArray.length; i += 1) {
      saltBinary += String.fromCharCode(saltArray[i]);
    }
    var saltBase64 = window.btoa(saltBinary);
    deriveKey(newPwd, saltBase64).then(function (hash) {
      user.salt = saltBase64;
      user.hash = hash;
      saveState();
      showToast("密码已重置");
    });
  }

  function login(username, password) {
    var user = null;
    for (var i = 0; i < state.users.length; i += 1) {
      if (state.users[i].username === username) {
        user = state.users[i];
        break;
      }
    }
    if (!user) {
      showToast("用户不存在");
      return Promise.resolve(false);
    }
    if (!user.enabled) {
      showToast("用户已禁用");
      return Promise.resolve(false);
    }
    return deriveKey(password, user.salt).then(function (hash) {
      if (hash === user.hash) {
        sessionStorage.setItem(SESSION_KEY, user.id);
        currentUser = user;
        return true;
      }
      showToast("密码错误");
      return false;
    });
  }

  function register(username, password, role) {
    if (!username || !password) {
      showToast("请输入完整信息");
      return Promise.resolve(false);
    }
    for (var i = 0; i < state.users.length; i += 1) {
      if (state.users[i].username === username) {
        showToast("用户已存在");
        return Promise.resolve(false);
      }
    }
    var saltArray = window.crypto.getRandomValues(new Uint8Array(16));
    var saltBinary = "";
    for (var j = 0; j < saltArray.length; j += 1) {
      saltBinary += String.fromCharCode(saltArray[j]);
    }
    var saltBase64 = window.btoa(saltBinary);
    return deriveKey(password, saltBase64).then(function (hash) {
      var user = {
        id: uuid(),
        username: username,
        salt: saltBase64,
        hash: hash,
        role: role || "operator",
        enabled: true,
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
      saveState();
      showToast("注册成功，请登录");
      return true;
    });
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    currentUser = null;
    window.location.href = "login.html";
  }

  function handleFileUpload(files) {
    var bank = getActiveBank();
    if (!bank) {
      showToast("请先选择记忆库");
      return;
    }
    var chunkSizeInput = document.getElementById("kbChunkSize");
    var chunkOverlapInput = document.getElementById("kbChunkOverlap");
    var chunkSize = chunkSizeInput && chunkSizeInput.value ? parseInt(chunkSizeInput.value, 10) : state.settings.chunkSize;
    var chunkOverlap = chunkOverlapInput && chunkOverlapInput.value ? parseInt(chunkOverlapInput.value, 10) : state.settings.chunkOverlap;
    var tasks = [];
    for (var i = 0; i < files.length; i += 1) {
      (function (file) {
        tasks.push(readFileContent(file).then(function (content) {
          var text = parseFileContent(file.name, content);
          var chunks = chunkText(text, chunkSize, chunkOverlap);
          addChunksToIndex(bank, file.name, chunks);
          bank.files.push({ name: file.name, chunks: chunks.length, size: file.size });
        }));
      })(files[i]);
    }
    Promise.all(tasks).then(function () {
      saveState();
      renderKnowledge();
      showToast("文件已摄取");
    });
  }

  function initLoginPage() {
    var tabs = document.querySelectorAll(".auth-tab");
    var form = document.getElementById("authForm");
    var roleField = document.getElementById("roleField");
    var submit = document.getElementById("authSubmit");
    var mode = "login";
    function switchMode(target) {
      mode = target;
      for (var i = 0; i < tabs.length; i += 1) {
        if (tabs[i].dataset.mode === target) {
          tabs[i].classList.add("active");
        } else {
          tabs[i].classList.remove("active");
        }
      }
      if (target === "register") {
        roleField.hidden = false;
        submit.textContent = "注册";
      } else {
        roleField.hidden = true;
        submit.textContent = "登录";
      }
    }
    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].addEventListener("click", function (evt) {
        switchMode(evt.target.dataset.mode);
      });
    }
    form.addEventListener("submit", function (evt) {
      evt.preventDefault();
      var username = document.getElementById("username").value.trim();
      var password = document.getElementById("password").value;
      if (mode === "login") {
        login(username, password).then(function (ok) {
          if (ok) {
            window.location.href = "index.html";
          }
        });
      } else {
        var role = document.getElementById("role").value;
        register(username, password, role).then(function (ok) {
          if (ok) {
            switchMode("login");
          }
        });
      }
    });
    if (currentUser) {
      window.location.href = "index.html";
    }
  }

  function initChatPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderSessionList();
    renderChat();
    renderCommonChips();
    renderKnowledge();
    renderFaqList();
    renderLogs();
    var sendBtn = document.getElementById("sendMessage");
    var input = document.getElementById("chatInput");
    if (sendBtn) {
      sendBtn.addEventListener("click", handleSendMessage);
    }
    if (input) {
      input.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter" && !evt.shiftKey) {
          evt.preventDefault();
          handleSendMessage();
        }
      });
    }
    var createSessionBtn = document.getElementById("createSession");
    if (createSessionBtn) {
      createSessionBtn.addEventListener("click", createSession);
    }
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
    var toggle = document.getElementById("settingsToggle");
    var drawer = document.getElementById("settingsDrawer");
    var close = document.getElementById("closeSettings");
    var form = document.getElementById("settingsForm");
    if (!currentUser || currentUser.role !== "admin") {
      if (toggle) {
        toggle.classList.add("hidden");
      }
      if (drawer) {
        drawer.classList.add("hidden");
      }
    } else {
      if (toggle && drawer) {
        toggle.addEventListener("click", function () {
          if (drawer.classList.contains("open")) {
            drawer.classList.remove("open");
          } else {
            drawer.classList.add("open");
            document.getElementById("settingTopN").value = state.settings.topN;
            document.getElementById("settingChunkSize").value = state.settings.chunkSize;
            document.getElementById("settingChunkOverlap").value = state.settings.chunkOverlap;
            document.getElementById("settingReasonLevel").value = state.adminFlags.reasoningLevel || 1;
            document.getElementById("settingFaqLow").value = state.settings.faqLow;
            document.getElementById("settingFaqHigh").value = state.settings.faqHigh;
          }
        });
      }
      if (close && drawer) {
        close.addEventListener("click", function () {
          drawer.classList.remove("open");
        });
      }
      if (form) {
        form.addEventListener("submit", function (evt) {
          evt.preventDefault();
          state.settings.topN = parseInt(document.getElementById("settingTopN").value, 10);
          state.settings.chunkSize = parseInt(document.getElementById("settingChunkSize").value, 10);
          state.settings.chunkOverlap = parseInt(document.getElementById("settingChunkOverlap").value, 10);
          state.adminFlags.reasoningLevel = parseInt(document.getElementById("settingReasonLevel").value, 10);
          state.settings.faqLow = parseInt(document.getElementById("settingFaqLow").value, 10);
          state.settings.faqHigh = parseInt(document.getElementById("settingFaqHigh").value, 10);
          saveState();
          showToast("设置已保存");
        });
      }
    }
    var reasoningToggle = document.getElementById("reasoningToggle");
    if (reasoningToggle) {
      reasoningToggle.checked = state.adminFlags.reasoning;
      if (!currentUser || currentUser.role !== "admin") {
        reasoningToggle.disabled = true;
      }
    }
  }

  function initKbPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderKnowledge();
    var uploader = document.getElementById("kbUploader");
    var processBtn = document.getElementById("processFiles");
    if (processBtn) {
      processBtn.addEventListener("click", function () {
        if (!uploader || !uploader.files || uploader.files.length === 0) {
          showToast("请选择文件");
          return;
        }
        handleFileUpload(uploader.files);
      });
    }
    var manualForm = document.getElementById("manualForm");
    if (manualForm) {
      manualForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var title = document.getElementById("manualTitle").value.trim();
        var body = document.getElementById("manualBody").value.trim();
        if (!title || !body) {
          return;
        }
        var bank = getActiveBank();
        if (!bank) {
          showToast("请选择记忆库");
          return;
        }
        var content = title + "\n" + body;
        var chunks = chunkText(content, state.settings.chunkSize, state.settings.chunkOverlap);
        addChunksToIndex(bank, "手动录入" + Date.now(), chunks);
        bank.files.push({ name: title, chunks: chunks.length, size: body.length });
        saveState();
        renderKnowledge();
        showToast("已保存到记忆库");
        manualForm.reset();
      });
    }
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function initFaqPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFaqList();
    resetFaqForm();
    var bank = getActiveBank();
    if (bank) {
      renderKbFaqPreview(extractFaqCandidates(bank));
    }
    var faqForm = document.getElementById("faqForm");
    if (faqForm) {
      faqForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var bank = getActiveBank();
        if (!bank) {
          showToast("请选择记忆库");
          return;
        }
        var question = document.getElementById("faqQuestion").value.trim();
        var answer = document.getElementById("faqAnswer").value.trim();
        if (!question || !answer) {
          showToast("请填写完整的问题和答案");
          return;
        }
        if (faqEditingId) {
          var target = null;
          for (var i = 0; i < bank.faqs.length; i += 1) {
            if (bank.faqs[i].id === faqEditingId) {
              target = bank.faqs[i];
              break;
            }
          }
          if (!target) {
            showToast("未找到要编辑的 FAQ");
            resetFaqForm();
            renderFaqList();
            return;
          }
          var normalized = normalizeQuestionText(question);
          for (var j = 0; j < bank.faqs.length; j += 1) {
            if (bank.faqs[j].id !== target.id) {
              var existingNorm = bank.faqs[j].norm || normalizeQuestionText(bank.faqs[j].question);
              if (existingNorm === normalized) {
                showToast("已存在相同的问题");
                return;
              }
            }
          }
          target.question = question;
          target.answer = answer;
          target.norm = normalized;
          target.updatedAt = new Date().toISOString();
          target.updatedBy = currentUser ? currentUser.username : "";
          saveState();
          renderFaqList();
          resetFaqForm();
          showToast("FAQ 已更新");
          return;
        }
        var inserted = upsertFaq(bank, question, answer, {
          createdAt: new Date().toISOString(),
          createdBy: currentUser ? currentUser.username : ""
        });
        if (inserted) {
          saveState();
          renderFaqList();
          showToast(inserted.created ? "FAQ 已新增" : "FAQ 已更新");
          resetFaqForm();
        }
      });
    }
    var resetFaqBtn = document.getElementById("resetFaqForm");
    if (resetFaqBtn) {
      resetFaqBtn.addEventListener("click", function () {
        resetFaqForm();
      });
    }
    var exportBtn = document.getElementById("exportFaq");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        var bank = getActiveBank();
        if (!bank) {
          return;
        }
        var data = JSON.stringify(bank.faqs, null, 2);
        var blob = new Blob([data], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "faq.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
    var importInput = document.getElementById("importFaq");
    if (importInput) {
      importInput.addEventListener("change", function (evt) {
        var files = evt.target.files;
        if (!files || files.length === 0) {
          return;
        }
        readFileContent(files[0]).then(function (content) {
          try {
            var arr = JSON.parse(content);
            if (Array.isArray(arr)) {
              var bank = getActiveBank();
              if (bank) {
                var createdCount = 0;
                var updatedCount = 0;
                for (var i = 0; i < arr.length; i += 1) {
                  var item = arr[i];
                  if (!item || !item.question || !item.answer) {
                    continue;
                  }
                  var inserted = upsertFaq(bank, item.question, item.answer, {
                    createdAt: item.createdAt,
                    createdBy: item.createdBy || (currentUser ? currentUser.username : ""),
                    updatedAt: item.updatedAt,
                    updatedBy: item.updatedBy
                  });
                  if (inserted) {
                    if (inserted.created) {
                      createdCount += 1;
                    } else {
                      updatedCount += 1;
                    }
                  }
                }
                saveState();
                renderFaqList();
                showToast("导入完成 新增" + createdCount + "条 · 更新" + updatedCount + "条");
              }
            }
          } catch (err) {
            showToast("导入失败");
          }
        });
      });
    }
    var queryBtn = document.getElementById("matchFaq");
    if (queryBtn) {
      queryBtn.addEventListener("click", function () {
        var bank = getActiveBank();
        if (!bank) {
          return;
        }
        var query = document.getElementById("faqQuery").value;
        if (!query) {
          return;
        }
        var result = matchFaq(bank, query);
        renderFaqMatch(result);
      });
    }
    var extractBtn = document.getElementById("extractFromKb");
    if (extractBtn) {
      extractBtn.addEventListener("click", function () {
        var bank = getActiveBank();
        if (!bank) {
          return;
        }
        renderKbFaqPreview(extractFaqCandidates(bank));
      });
    }
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function initDecisionPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    renderDecisionPage();
    var projectForm = document.getElementById("projectForm");
    var newProjectBtn = document.getElementById("newProject");
    var cancelProjectBtn = document.getElementById("cancelProject");
    function showProjectForm() {
      if (projectForm) {
        projectForm.classList.remove("hidden");
        var nameInput = document.getElementById("projectName");
        if (nameInput) {
          nameInput.focus();
        }
      }
    }
    function hideProjectForm() {
      if (projectForm) {
        projectForm.classList.add("hidden");
        projectForm.reset();
      }
    }
    if (newProjectBtn) {
      newProjectBtn.addEventListener("click", function () {
        if (projectForm && projectForm.classList.contains("hidden")) {
          showProjectForm();
        } else {
          hideProjectForm();
        }
      });
    }
    if (cancelProjectBtn) {
      cancelProjectBtn.addEventListener("click", function () {
        hideProjectForm();
      });
    }
    if (projectForm) {
      projectForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var nameInput = document.getElementById("projectName");
        var startInput = document.getElementById("projectStart");
        var name = nameInput ? nameInput.value.trim() : "";
        var start = startInput ? startInput.value : "";
        if (!name || !start) {
          showToast("请填写项目名称和开始时间");
          return;
        }
        var project = {
          id: uuid(),
          name: name,
          startTime: start,
          createdAt: new Date().toISOString(),
          createdBy: currentUser ? currentUser.username : "",
          timeline: [],
          links: [],
          completed: false
        };
        state.decisions.unshift(project);
        state.activeDecisionId = project.id;
        pendingLinkFromId = null;
        hideLinkForm();
        hideProjectForm();
        saveState();
        renderDecisionPage();
        showToast("项目已创建");
      });
    }
    var canvas = document.getElementById("timelineCanvas");
    if (canvas) {
      canvas.addEventListener("dragover", function (evt) {
        var project = getActiveDecisionProject();
        if (!project || project.completed) {
          return;
        }
        evt.preventDefault();
      }, true);
      canvas.addEventListener("drop", handleTimelineDrop, true);
    }
    var linkForm = document.getElementById("linkForm");
    if (linkForm) {
      linkForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var project = getActiveDecisionProject();
        if (!project) {
          return;
        }
        var fromId = linkForm.getAttribute("data-from");
        var toId = linkForm.getAttribute("data-to");
        if (!fromId || !toId) {
          return;
        }
        var relationInput = document.getElementById("linkRelation");
        var noteInput = document.getElementById("linkNote");
        var relation = relationInput ? relationInput.value.trim() : "";
        var note = noteInput ? noteInput.value.trim() : "";
        project.links.push({
          id: uuid(),
          fromId: fromId,
          toId: toId,
          relation: relation || "关联",
          note: note,
          createdAt: new Date().toISOString()
        });
        pendingLinkFromId = null;
        saveState();
        hideLinkForm();
        renderActiveProject();
        renderDecisionHistory();
      });
    }
    var cancelLinkBtn = document.getElementById("cancelLink");
    if (cancelLinkBtn) {
      cancelLinkBtn.addEventListener("click", function () {
        pendingLinkFromId = null;
        hideLinkForm();
        renderActiveProject();
      });
    }
    var completeBtn = document.getElementById("completeProject");
    if (completeBtn) {
      completeBtn.addEventListener("click", function () {
        var project = getActiveDecisionProject();
        if (!project || project.completed) {
          return;
        }
        var modal = document.getElementById("completeModal");
        if (!modal) {
          return;
        }
        var endInput = document.getElementById("completeEnd");
        var outcomeInput = document.getElementById("completeOutcome");
        var scoreInput = document.getElementById("completeScore");
        if (endInput) {
          endInput.value = project.endTime || "";
        }
        if (outcomeInput) {
          outcomeInput.value = project.outcome || "";
        }
        if (scoreInput) {
          scoreInput.value = project.score || "";
        }
        modal.classList.remove("hidden");
      });
    }
    var completeForm = document.getElementById("completeForm");
    if (completeForm) {
      completeForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var project = getActiveDecisionProject();
        if (!project) {
          return;
        }
        var endInput = document.getElementById("completeEnd");
        var outcomeInput = document.getElementById("completeOutcome");
        var scoreInput = document.getElementById("completeScore");
        project.endTime = endInput ? endInput.value : "";
        project.outcome = outcomeInput ? outcomeInput.value.trim() : "";
        var scoreValue = scoreInput ? parseInt(scoreInput.value, 10) : NaN;
        project.score = isNaN(scoreValue) ? null : scoreValue;
        project.completed = true;
        project.updatedAt = new Date().toISOString();
        pendingLinkFromId = null;
        hideLinkForm();
        saveState();
        renderDecisionPage();
        var modal = document.getElementById("completeModal");
        if (modal) {
          modal.classList.add("hidden");
        }
        completeForm.reset();
        showToast("决策已归档");
      });
    }
    var cancelComplete = document.getElementById("cancelComplete");
    if (cancelComplete) {
      cancelComplete.addEventListener("click", function () {
        var modal = document.getElementById("completeModal");
        var form = document.getElementById("completeForm");
        if (form) {
          form.reset();
        }
        if (modal) {
          modal.classList.add("hidden");
        }
      });
    }
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function initAdminPage() {
    requireAuth();
    if (!currentUser || currentUser.role !== "admin") {
      showToast("仅管理员可访问");
      window.location.href = "index.html";
      return;
    }
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderUsers();
    renderCommonList();
    renderLogs();
    var reasoningSwitch = document.getElementById("globalReasoning");
    var strength = document.getElementById("reasoningStrength");
    if (reasoningSwitch) {
      reasoningSwitch.checked = state.adminFlags.reasoning;
      reasoningSwitch.addEventListener("change", function () {
        state.adminFlags.reasoning = reasoningSwitch.checked;
        saveState();
      });
    }
    if (strength) {
      strength.value = String(state.adminFlags.reasoningLevel || 1);
      strength.addEventListener("change", function () {
        state.adminFlags.reasoningLevel = parseInt(strength.value, 10);
        saveState();
      });
    }
    var addUserBtn = document.getElementById("addUser");
    if (addUserBtn) {
      addUserBtn.addEventListener("click", function () {
        var username = window.prompt("用户名");
        if (!username) {
          return;
        }
        var password = window.prompt("临时密码");
        if (!password) {
          return;
        }
        var role = window.prompt("角色(admin/operator)", "operator");
        register(username, password, role === "admin" ? "admin" : "operator").then(function (ok) {
          if (ok) {
            renderUsers();
          }
        });
      });
    }
    var clearLogsBtn = document.getElementById("clearLogs");
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener("click", function () {
        var bank = getActiveBank();
        if (!bank) {
          return;
        }
        if (window.confirm("确认清空日志？")) {
          bank.logs = [];
          saveState();
          renderLogs();
        }
      });
    }
    var commonList = document.getElementById("commonList");
    if (commonList) {
      commonList.addEventListener("dblclick", function () {
        var bank = getActiveBank();
        if (!bank) {
          return;
        }
        var text = window.prompt("新增常用问题");
        if (!text) {
          return;
        }
        bank.common.push({ id: uuid(), text: text, createdBy: currentUser.username });
        saveState();
        renderCommonList();
        renderCommonChips();
      });
    }
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function initNavigation() {
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function boot() {
    loadState().then(ensureDefaultAdmin).then(function () {
      loadCurrentUser();
      var page = document.body ? document.body.getAttribute("data-page") : "";
      if (page === "login") {
        initLoginPage();
        return;
      }
      if (!currentUser) {
        requireAuth();
        return;
      }
      if (page === "chat") {
        initChatPage();
      } else if (page === "kb") {
        initKbPage();
      } else if (page === "faq") {
        initFaqPage();
      } else if (page === "decision") {
        initDecisionPage();
      } else if (page === "admin") {
        initAdminPage();
      } else {
        initNavigation();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
