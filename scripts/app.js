(function () {
  var STORAGE_KEY = "aiWorkbenchState";
  var SESSION_KEY = "aiWorkbenchCurrentUser";
  var state = null;
  var currentUser = null;
  var toastTimer = null;
  var textEncoder = new TextEncoder();
  var faqEditingId = null;
  var pendingLinkFromId = null;
  var DEFAULT_DECISION_PRESETS = [
    { id: "init", label: "立项评估" },
    { id: "research", label: "调研分析" },
    { id: "plan", label: "方案制定" },
    { id: "review", label: "方案评审" },
    { id: "execute", label: "执行跟踪" },
    { id: "risk", label: "风险应对" },
    { id: "summary", label: "复盘总结" }
  ];
  var activeNodeId = null;
  var chunkEditingId = null;
  var activeFileFilterId = null;
  var authBackdropRaf = null;
  var decisionLayoutRaf = null;
  var DEFAULT_SESSION_GUIDE = {
    title: "新会话引导",
    description: "请补充本次沟通的目标、关键背景和期望成果，以便虹小聊提供更精准的协助。",
    fields: [
      { id: "goal", label: "沟通目标", placeholder: "希望解决的关键问题" },
      { id: "milestone", label: "关键时间节点", placeholder: "例如上线时间或里程碑" },
      { id: "stakeholder", label: "主要干系人", placeholder: "列出需要同步的角色或团队" }
    ]
  };

  function padNumber(value) {
    var num = parseInt(value, 10);
    if (isNaN(num)) {
      return "00";
    }
    return num < 10 ? "0" + num : String(num);
  }

  function deleteKnowledgeFile(fileId) {
    var bank = getActiveBank();
    if (!bank) {
      return;
    }
    for (var i = bank.files.length - 1; i >= 0; i -= 1) {
      if (bank.files[i].id === fileId) {
        bank.files.splice(i, 1);
      }
    }
    for (var j = bank.chunks.length - 1; j >= 0; j -= 1) {
      if (bank.chunks[j].fileId === fileId) {
        bank.chunks.splice(j, 1);
      }
    }
    if (activeFileFilterId === fileId) {
      activeFileFilterId = null;
    }
    rebuildIndex(bank);
    saveState();
    renderKnowledge();
    showToast("文件及分段已删除");
  }

  function deleteChunk(chunkId) {
    var bank = getActiveBank();
    if (!bank) {
      return;
    }
    for (var i = 0; i < bank.chunks.length; i += 1) {
      if (bank.chunks[i].id === chunkId) {
        bank.chunks.splice(i, 1);
        break;
      }
    }
    if (chunkEditingId === chunkId) {
      closeChunkEditor();
    }
    rebuildIndex(bank);
    saveState();
    renderKnowledge();
    showToast("分段已删除");
  }

  function openChunkEditor(chunkId) {
    var bank = getActiveBank();
    if (!bank) {
      showToast("请选择记忆库");
      return;
    }
    var chunk = lookupChunk(bank, chunkId);
    if (!chunk) {
      showToast("未找到对应分段");
      return;
    }
    chunkEditingId = chunkId;
    var modal = document.getElementById("chunkModal");
    var meta = document.getElementById("chunkMeta");
    var content = document.getElementById("chunkContent");
    if (meta) {
      meta.textContent = chunk.file + " · 段 " + chunk.order;
    }
    if (content) {
      content.value = chunk.text || "";
      content.focus();
    }
    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  function closeChunkEditor() {
    var modal = document.getElementById("chunkModal");
    if (modal) {
      modal.classList.add("hidden");
    }
    chunkEditingId = null;
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

  function clonePresets(list) {
    var copy = [];
    for (var i = 0; i < list.length; i += 1) {
      copy.push({ id: list[i].id, label: list[i].label });
    }
    return copy;
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

  function cancelAuthBackdrop() {
    if (authBackdropRaf !== null) {
      window.cancelAnimationFrame(authBackdropRaf);
      authBackdropRaf = null;
    }
  }

  function initAuthBackdrop() {
    var container = document.querySelector(".auth-backdrop");
    if (!container) {
      cancelAuthBackdrop();
      return;
    }
    cancelAuthBackdrop();
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    var width = container.clientWidth || window.innerWidth || 960;
    var height = container.clientHeight || window.innerHeight || 720;
    var count = Math.max(12, Math.min(28, Math.floor((width + height) / 160)));
    var palette = [
      "rgba(118, 165, 255, 0.65)",
      "rgba(65, 214, 255, 0.6)",
      "rgba(164, 188, 255, 0.68)"
    ];
    var reduceMotion = false;
    if (window.matchMedia) {
      try {
        reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (err) {
        reduceMotion = false;
      }
    }
    var nodes = [];
    for (var i = 0; i < count; i += 1) {
      var el = document.createElement("span");
      el.className = "auth-node";
      el.style.setProperty("--node-color", palette[i % palette.length]);
      container.appendChild(el);
      nodes.push({
        el: el,
        radius: 120 + Math.random() * 240,
        speed: 0.4 + Math.random() * 0.9,
        angle: Math.random() * Math.PI * 2,
        drift: 0.6 + Math.random() * 0.7
      });
    }
    var centerX = width / 2;
    var centerY = height / 2;
    if (reduceMotion) {
      for (var j = 0; j < nodes.length; j += 1) {
        var node = nodes[j];
        var offsetX = Math.cos(node.angle) * node.radius * node.drift;
        var offsetY = Math.sin(node.angle) * node.radius * 0.6;
        node.el.style.transform = "translate3d(" + (centerX + offsetX) + "px, " + (centerY + offsetY) + "px, 0)";
      }
      return;
    }
    function tick() {
      centerX = container.clientWidth / 2;
      centerY = container.clientHeight / 2;
      for (var k = 0; k < nodes.length; k += 1) {
        var item = nodes[k];
        item.angle += 0.0024 * item.speed;
        var x = Math.cos(item.angle) * item.radius * item.drift;
        var y = Math.sin(item.angle) * item.radius * 0.62;
        item.el.style.transform = "translate3d(" + (centerX + x) + "px, " + (centerY + y) + "px, 0)";
      }
      authBackdropRaf = window.requestAnimationFrame(tick);
    }
    tick();
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
        decisionPresets: clonePresets(DEFAULT_DECISION_PRESETS),
        adminFlags: { reasoning: false, reasoningLevel: 1 },
        settings: {
          topN: 5,
          chunkSize: 400,
          chunkOverlap: 80,
          faqLow: 40,
          faqHigh: 75
        },
        sessionGuide: JSON.parse(JSON.stringify(DEFAULT_SESSION_GUIDE))
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
    if (!state.sessionGuide || !state.sessionGuide.fields) {
      state.sessionGuide = JSON.parse(JSON.stringify(DEFAULT_SESSION_GUIDE));
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
    if (!state.decisionPresets || state.decisionPresets.length === 0) {
      state.decisionPresets = clonePresets(DEFAULT_DECISION_PRESETS);
    } else {
      for (var presetIndex = 0; presetIndex < state.decisionPresets.length; presetIndex += 1) {
        var preset = state.decisionPresets[presetIndex];
        if (!preset.id) {
          preset.id = uuid();
        }
        if (!preset.label) {
          preset.label = "节点";
        }
      }
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
      if (!bank.files) {
        bank.files = [];
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
      for (var sessionIndex = 0; sessionIndex < bank.sessions.length; sessionIndex += 1) {
        var sess = bank.sessions[sessionIndex];
        if (!sess.id) {
          sess.id = uuid();
        }
        if (!sess.title) {
          sess.title = "会话";
        }
        if (!sess.messages) {
          sess.messages = [];
        }
        if (!sess.guideAnswers || typeof sess.guideAnswers !== "object") {
          sess.guideAnswers = {};
        }
      }
      var fileMap = {};
      for (var f = 0; f < bank.files.length; f += 1) {
        var file = bank.files[f];
        if (!file.id) {
          file.id = uuid();
        }
        if (typeof file.chunks !== "number") {
          file.chunks = 0;
        }
        if (typeof file.size !== "number") {
          file.size = 0;
        }
        fileMap[file.id] = file;
      }
      for (var c = 0; c < bank.chunks.length; c += 1) {
        var chunk = bank.chunks[c];
        if (!chunk.id) {
          chunk.id = uuid();
        }
        if (!chunk.fileId) {
          var matchedId = null;
          for (var mapIndex = 0; mapIndex < bank.files.length; mapIndex += 1) {
            if (bank.files[mapIndex].name === chunk.file) {
              matchedId = bank.files[mapIndex].id;
              break;
            }
          }
          if (!matchedId) {
            var generated = { id: uuid(), name: chunk.file || "导入文件", chunks: 0, size: 0 };
            bank.files.push(generated);
            fileMap[generated.id] = generated;
            matchedId = generated.id;
          }
          chunk.fileId = matchedId;
        }
      }
      for (var resetIndex = 0; resetIndex < bank.files.length; resetIndex += 1) {
        bank.files[resetIndex].chunks = 0;
        bank.files[resetIndex].size = 0;
      }
      for (var chunkIndex = 0; chunkIndex < bank.chunks.length; chunkIndex += 1) {
        var entry = bank.chunks[chunkIndex];
        var fileEntry = fileMap[entry.fileId];
        if (fileEntry) {
          fileEntry.chunks += 1;
          fileEntry.size += entry.text ? entry.text.length : 0;
          entry.file = fileEntry.name;
        }
      }
      rebuildIndex(bank);
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
        if (!bank.common[m].createdAt) {
          bank.common[m].createdAt = new Date().toISOString();
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
        if (!link.strength) {
          link.strength = "medium";
        }
      }
    }
    if (state.decisions.length === 0) {
      state.activeDecisionId = null;
    } else if (!hasActive) {
      state.activeDecisionId = state.decisions[0].id;
    }
    if (!state.sessionGuide || !state.sessionGuide.fields) {
      state.sessionGuide = JSON.parse(JSON.stringify(DEFAULT_SESSION_GUIDE));
    }
    if (!state.sessionGuide.title) {
      state.sessionGuide.title = DEFAULT_SESSION_GUIDE.title;
    }
    if (!state.sessionGuide.description) {
      state.sessionGuide.description = DEFAULT_SESSION_GUIDE.description;
    }
    for (var fieldIndex = 0; fieldIndex < state.sessionGuide.fields.length; fieldIndex += 1) {
      var field = state.sessionGuide.fields[fieldIndex];
      if (!field.id) {
        field.id = uuid();
      }
      if (!field.label) {
        field.label = "字段" + (fieldIndex + 1);
      }
      if (typeof field.placeholder !== "string") {
        field.placeholder = "";
      }
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
      createdAt: new Date().toISOString(),
      messages: [],
      guideAnswers: {}
    };
    bank.sessions.unshift(session);
    state.activeSessionId = session.id;
    saveState();
    renderSessionList();
    renderChat();
    openGuideModal(session, true);
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

  function updateGuideToggle(session) {
    var toggle = document.getElementById("guideToggle");
    if (!toggle) {
      return;
    }
    var config = state.sessionGuide;
    if (!session || !config || !config.fields || config.fields.length === 0) {
      toggle.classList.add("hidden");
      return;
    }
    toggle.classList.remove("hidden");
    var hasValue = false;
    if (session.guideAnswers) {
      for (var key in session.guideAnswers) {
        if (session.guideAnswers.hasOwnProperty(key) && session.guideAnswers[key]) {
          hasValue = true;
          break;
        }
      }
    }
    toggle.textContent = hasValue ? "查看引导" : "填写引导";
  }

  function renderChat() {
    var area = document.getElementById("chatArea");
    if (!area) {
      return;
    }
    area.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      updateGuideToggle(null);
      renderEvidence([], []);
      area.innerHTML = '<div class="message"><div class="message-bubble"><div class="content">请先创建记忆库</div></div></div>';
      return;
    }
    var session = findSession(bank, state.activeSessionId);
    if (!session) {
      updateGuideToggle(null);
      renderEvidence([], []);
      area.innerHTML = '<div class="message"><div class="message-bubble"><div class="content">请选择或新建会话</div></div></div>';
      return;
    }
    updateGuideToggle(session);
    for (var i = 0; i < session.messages.length; i += 1) {
      var message = session.messages[i];
      var wrapper = document.createElement("div");
      wrapper.className = "message " + (message.role === "user" ? "user" : "assistant");
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
        var embedPanel = document.createElement("div");
        embedPanel.className = "evidence-panel";
        var used = renderEvidenceGroups(
          embedPanel,
          message.evidence,
          message.evidenceTokens || message.tags || [],
          true
        );
        if (used) {
          bubble.appendChild(embedPanel);
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

  function uniqueKeywords(list) {
    var result = [];
    if (!list) {
      return result;
    }
    var mark = {};
    for (var i = 0; i < list.length; i += 1) {
      var key = list[i];
      if (!key) {
        continue;
      }
      if (!mark[key]) {
        mark[key] = true;
        result.push(key);
      }
    }
    return result;
  }

  function renderEvidenceGroups(container, evidence, keywords, embedded) {
    container.innerHTML = "";
    if (!evidence || evidence.length === 0) {
      if (!embedded) {
        var empty = document.createElement("div");
        empty.className = "evidence-empty";
        empty.textContent = "暂无高相关证据";
        container.appendChild(empty);
      }
      return false;
    }
    var highlightKeys = [];
    if (keywords && keywords.length > 0) {
      highlightKeys = uniqueKeywords(keywords);
    }
    var grouped = { faq: [], decision: [], knowledge: [] };
    for (var i = 0; i < evidence.length; i += 1) {
      var item = evidence[i];
      if (item.type === "faq") {
        grouped.faq.push(item);
      } else if (item.type === "decision") {
        grouped.decision.push(item);
      } else {
        grouped.knowledge.push(item);
      }
    }
    var order = ["faq", "decision", "knowledge"];
    var titles = { faq: "FAQ 依据", decision: "决策链依据", knowledge: "知识库依据" };
    var appended = false;
    for (var g = 0; g < order.length; g += 1) {
      var type = order[g];
      var list = grouped[type];
      if (!list || list.length === 0) {
        continue;
      }
      appended = true;
      var block = document.createElement("div");
      block.className = "evidence-group";
      var title = document.createElement("div");
      title.className = "evidence-group-title";
      title.textContent = titles[type];
      block.appendChild(title);
      for (var j = 0; j < list.length; j += 1) {
        var info = list[j];
        var card = document.createElement("div");
        card.className = "evidence-card" + (embedded ? " embedded" : "");
        var header = document.createElement("div");
        header.className = "evidence-title";
        var source = document.createElement("span");
        source.className = "evidence-source";
        if (type === "faq") {
          source.textContent = "FAQ · " + info.source;
        } else if (type === "decision") {
          source.textContent = info.source;
        } else {
          source.textContent = info.source + " · 段 " + info.chunk;
        }
        header.appendChild(source);
        if (typeof info.score === "number") {
          var score = document.createElement("span");
          score.className = "evidence-score";
          if (type === "knowledge") {
            score.textContent = info.score.toFixed(2);
          } else {
            score.textContent = info.score + "%";
          }
          header.appendChild(score);
        }
        card.appendChild(header);
        if (info.text) {
          var body = document.createElement("div");
          body.className = "evidence-body";
          var limit = embedded ? 140 : 200;
          body.innerHTML = highlightKeywords(snippetText(info.text, limit), highlightKeys);
          card.appendChild(body);
        }
        block.appendChild(card);
      }
      container.appendChild(block);
    }
    if (!appended && !embedded) {
      var fallback = document.createElement("div");
      fallback.className = "evidence-empty";
      fallback.textContent = "暂无高相关证据";
      container.appendChild(fallback);
    }
    return appended;
  }

  function renderEvidence(evidence, keywords) {
    var panel = document.getElementById("evidencePanel");
    if (!panel) {
      return;
    }
    renderEvidenceGroups(panel, evidence, keywords, false);
  }

  function getGuideConfig() {
    if (!state || !state.sessionGuide || !state.sessionGuide.fields || state.sessionGuide.fields.length === 0) {
      return null;
    }
    return state.sessionGuide;
  }

  function closeGuideModal() {
    var modal = document.getElementById("guideModal");
    if (modal) {
      modal.classList.add("hidden");
    }
    var form = document.getElementById("guideForm");
    if (form) {
      form.reset();
      form.removeAttribute("data-session");
    }
  }

  function openGuideModal(session, autoFocus) {
    var config = getGuideConfig();
    if (!config) {
      return false;
    }
    if (!session) {
      var bank = getActiveBank();
      session = bank ? findSession(bank, state.activeSessionId) : null;
    }
    if (!session) {
      return false;
    }
    var modal = document.getElementById("guideModal");
    var form = document.getElementById("guideForm");
    var title = document.getElementById("guideTitle");
    var desc = document.getElementById("guideDescription");
    if (!modal || !form) {
      return false;
    }
    form.innerHTML = "";
    form.setAttribute("data-session", session.id);
    if (title) {
      title.textContent = config.title || "会话引导";
    }
    if (desc) {
      desc.textContent = config.description || "";
      desc.classList.toggle("hidden", !config.description);
    }
    var firstField = null;
    for (var i = 0; i < config.fields.length; i += 1) {
      var field = config.fields[i];
      var wrapper = document.createElement("label");
      wrapper.textContent = field.label || ("字段" + (i + 1));
      var textarea = document.createElement("textarea");
      textarea.name = field.id;
      textarea.rows = 3;
      textarea.placeholder = field.placeholder || "";
      textarea.value = session.guideAnswers && session.guideAnswers[field.id] ? session.guideAnswers[field.id] : "";
      wrapper.appendChild(textarea);
      form.appendChild(wrapper);
      if (!firstField) {
        firstField = textarea;
      }
    }
    modal.classList.remove("hidden");
    if (autoFocus && firstField) {
      firstField.focus();
    }
    return true;
  }

  function handleGuideSubmit(evt) {
    evt.preventDefault();
    var form = evt.target;
    if (!form) {
      return;
    }
    var sessionId = form.getAttribute("data-session");
    var bank = getActiveBank();
    var config = getGuideConfig();
    if (!sessionId || !bank || !config) {
      closeGuideModal();
      return;
    }
    var session = findSession(bank, sessionId);
    if (!session) {
      closeGuideModal();
      return;
    }
    var answers = {};
    var hasValue = false;
    for (var i = 0; i < config.fields.length; i += 1) {
      var field = config.fields[i];
      var element = form.elements[field.id];
      var value = element ? element.value.trim() : "";
      answers[field.id] = value;
      if (value) {
        hasValue = true;
      }
    }
    session.guideAnswers = answers;
    session.guideCompletedAt = hasValue ? new Date().toISOString() : null;
    saveState();
    updateGuideToggle(session);
    closeGuideModal();
    showToast("引导信息已保存");
  }

  function skipGuideModal() {
    closeGuideModal();
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

  function rebuildIndex(bank) {
    if (!bank) {
      return;
    }
    if (!bank.files) {
      bank.files = [];
    }
    var fileMap = {};
    for (var fileIndex = 0; fileIndex < bank.files.length; fileIndex += 1) {
      var fileEntry = bank.files[fileIndex];
      if (!fileEntry.id) {
        fileEntry.id = uuid();
      }
      fileEntry.chunks = 0;
      fileEntry.size = 0;
      fileMap[fileEntry.id] = fileEntry;
    }
    if (!bank.index) {
      bank.index = { df: {}, postings: {}, docLengths: {}, avgdl: 0, totalDocs: 0 };
    } else {
      bank.index.df = {};
      bank.index.postings = {};
      bank.index.docLengths = {};
      bank.index.totalDocs = 0;
      bank.index.avgdl = 0;
    }
    var orderMap = {};
    for (var i = 0; i < bank.chunks.length; i += 1) {
      var chunk = bank.chunks[i];
      if (!chunk.fileId) {
        chunk.fileId = uuid();
      }
      if (!fileMap[chunk.fileId]) {
        var newFile = { id: chunk.fileId, name: chunk.file || "导入文件", chunks: 0, size: 0 };
        bank.files.push(newFile);
        fileMap[newFile.id] = newFile;
      }
      if (!orderMap[chunk.fileId]) {
        orderMap[chunk.fileId] = 0;
      }
      orderMap[chunk.fileId] += 1;
      chunk.order = orderMap[chunk.fileId];
      var owner = fileMap[chunk.fileId];
      owner.chunks += 1;
      owner.size += chunk.text ? chunk.text.length : 0;
      var docTokens = tokenize(chunk.text || "");
      var counts = {};
      for (var t = 0; t < docTokens.length; t += 1) {
        var token = docTokens[t];
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
          bank.index.postings[tokenKey][chunk.id] = counts[tokenKey];
        }
      }
      bank.index.docLengths[chunk.id] = docTokens.length;
      bank.index.totalDocs += 1;
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

  function addChunksToIndex(bank, fileName, chunks, fileId) {
    if (!bank || !chunks || chunks.length === 0) {
      return 0;
    }
    if (!fileId) {
      fileId = uuid();
    }
    var added = 0;
    for (var i = 0; i < chunks.length; i += 1) {
      var chunkId = fileId + "#" + (bank.chunks.length + 1 + i);
      bank.chunks.push({
        id: chunkId,
        file: fileName,
        fileId: fileId,
        order: 0,
        text: chunks[i]
      });
      added += 1;
    }
    rebuildIndex(bank);
    return added;
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
    if (!bank) {
      activeFileFilterId = null;
    } else if (activeFileFilterId) {
      var exists = false;
      for (var fileCheck = 0; fileCheck < bank.files.length; fileCheck += 1) {
        if (bank.files[fileCheck].id === activeFileFilterId) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        activeFileFilterId = null;
      }
    }
    if (fileList) {
      fileList.innerHTML = "";
      if (!bank) {
        fileList.innerHTML = '<div class="panel-hint">请选择记忆库</div>';
      } else if (!bank.files || bank.files.length === 0) {
        fileList.innerHTML = '<div class="panel-hint">暂无已摄取的文件</div>';
      } else {
        for (var i = 0; i < bank.files.length; i += 1) {
          (function (file) {
            var card = document.createElement("div");
            card.className = "file-card" + (activeFileFilterId === file.id ? " active" : "");
            var header = document.createElement("header");
            var title = document.createElement("div");
            title.className = "file-title";
            title.textContent = file.name;
            var actions = document.createElement("div");
            actions.className = "card-actions";
            var focusBtn = document.createElement("button");
            focusBtn.className = "text-button";
            focusBtn.type = "button";
            focusBtn.textContent = activeFileFilterId === file.id ? "显示全部" : "查看";
            focusBtn.addEventListener("click", function () {
              if (activeFileFilterId === file.id) {
                activeFileFilterId = null;
              } else {
                activeFileFilterId = file.id;
              }
              renderKnowledge();
            });
            var delBtn = document.createElement("button");
            delBtn.className = "text-button danger";
            delBtn.type = "button";
            delBtn.textContent = "删除";
            delBtn.addEventListener("click", function () {
              if (!window.confirm("确定删除该文件及其所有分段？")) {
                return;
              }
              deleteKnowledgeFile(file.id);
            });
            actions.appendChild(focusBtn);
            actions.appendChild(delBtn);
            header.appendChild(title);
            header.appendChild(actions);
            var meta = document.createElement("div");
            meta.className = "meta";
            meta.textContent = file.chunks + " 段 · " + file.size + " bytes";
            card.appendChild(header);
            card.appendChild(meta);
            fileList.appendChild(card);
          })(bank.files[i]);
        }
      }
    }
    if (preview) {
      preview.innerHTML = "";
      if (!bank) {
        preview.innerHTML = '<div class="panel-hint">请选择记忆库</div>';
        return;
      }
      if (!bank.chunks || bank.chunks.length === 0) {
        preview.innerHTML = '<div class="panel-hint">暂无分段内容</div>';
        return;
      }
      var displayed = 0;
      for (var j = 0; j < bank.chunks.length; j += 1) {
        var chunk = bank.chunks[j];
        if (activeFileFilterId && chunk.fileId !== activeFileFilterId) {
          continue;
        }
        displayed += 1;
        if (displayed > 250) {
          break;
        }
        var ccard = document.createElement("div");
        ccard.className = "chunk-card";
        var header = document.createElement("div");
        header.className = "chunk-header";
        var meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = chunk.file + " · 段 " + chunk.order;
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var editBtn = document.createElement("button");
        editBtn.className = "text-button";
        editBtn.type = "button";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", function (id) {
          return function () {
            openChunkEditor(id);
          };
        }(chunk.id));
        var delBtn = document.createElement("button");
        delBtn.className = "text-button danger";
        delBtn.type = "button";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", function (id) {
          return function () {
            if (!window.confirm("确定删除该分段？")) {
              return;
            }
            deleteChunk(id);
          };
        }(chunk.id));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        header.appendChild(meta);
        header.appendChild(actions);
        var body = document.createElement("div");
        body.className = "content";
        body.textContent = chunk.text;
        ccard.appendChild(header);
        ccard.appendChild(body);
        preview.appendChild(ccard);
      }
      if (displayed === 0) {
        preview.innerHTML = '<div class="panel-hint">所选文件暂无分段</div>';
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
      { regex: /(你好|您好|哈喽|hi|hello)/i, reply: "您好，我是虹小聊助理，很高兴为您服务。" },
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

  function scoreDecisionText(text, tokens) {
    if (!text || !tokens || tokens.length === 0) {
      return 0;
    }
    var normalized = String(text).toLowerCase();
    var seen = {};
    var unique = 0;
    var hits = 0;
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      if (!token) {
        continue;
      }
      var key = token.toLowerCase();
      if (seen[key]) {
        continue;
      }
      seen[key] = true;
      unique += 1;
      if (normalized.indexOf(key) !== -1) {
        hits += 1;
      }
    }
    if (unique === 0) {
      return 0;
    }
    return Math.round((hits / unique) * 100);
  }

  function collectDecisionEvidence(tokens) {
    var results = [];
    if (!tokens || tokens.length === 0 || !state || !state.decisions) {
      return results;
    }
    for (var i = 0; i < state.decisions.length; i += 1) {
      var project = state.decisions[i];
      var base = "项目《" + (project.name || "未命名项目") + "》";
      if (project.outcome) {
        var outcomeText = "效果：" + project.outcome;
        if (typeof project.score === "number") {
          outcomeText += "（评分 " + project.score + "）";
        }
        var projectScore = scoreDecisionText(outcomeText, tokens);
        if (projectScore >= 20) {
          results.push({
            type: "decision",
            source: base + " · 复盘",
            text: outcomeText,
            score: projectScore
          });
        }
      }
      if (project.timeline) {
        for (var j = 0; j < project.timeline.length; j += 1) {
          var node = project.timeline[j];
          var label = base + " · 节点《" + (node.title || "节点") + "》";
          var parts = [];
          if (node.reason) {
            parts.push("原因：" + node.reason);
          }
          if (node.impact) {
            parts.push("影响：" + node.impact);
          }
          if (node.note) {
            parts.push("备注：" + node.note);
          }
          var nodeText = parts.join("；");
          var nodeScore = scoreDecisionText((node.title || "") + " " + nodeText, tokens);
          if (nodeScore >= 20 && nodeText) {
            results.push({
              type: "decision",
              source: label,
              text: nodeText,
              score: nodeScore
            });
          }
        }
      }
      if (project.links) {
        for (var k = 0; k < project.links.length; k += 1) {
          var link = project.links[k];
          var relation = link.relation || "关联";
          var relationText = "关系：" + relation;
          if (link.note) {
            relationText += "，" + link.note;
          }
          var linkLabel = base + " · " + findNodeTitle(project, link.fromId) + " → " + findNodeTitle(project, link.toId);
          var linkScore = scoreDecisionText(relationText, tokens);
          if (linkScore >= 20) {
            results.push({
              type: "decision",
              source: linkLabel,
              text: relationText,
              score: linkScore
            });
          }
        }
      }
    }
    results.sort(function (a, b) {
      return b.score - a.score;
    });
    return results.slice(0, 5);
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
      var knowledgeScores = computeBM25(bank, expanded);
      var faqResult = matchFaq(bank, text);
      var bestFaq = faqResult.best;
      var faqEvidence = [];
      var bestFaqEvidence = null;
      var matches = faqResult.matches || [];
      for (var f = 0; f < matches.length && f < 3; f += 1) {
        var match = matches[f];
        var faqEntry = {
          type: "faq",
          source: match.item.question,
          chunk: "FAQ",
          text: match.item.answer,
          score: match.score
        };
        if (bestFaq && bestFaq.item && match.item && bestFaq.item.id === match.item.id) {
          bestFaqEvidence = faqEntry;
        }
        faqEvidence.push(faqEntry);
      }
      var knowledgeEvidence = [];
      var bestKnowledgeEvidence = null;
      var topScore = knowledgeScores.length > 0 ? knowledgeScores[0].score : 0;
      var limit = state.settings.topN;
      for (var k = 0; k < knowledgeScores.length && knowledgeEvidence.length < limit; k += 1) {
        var entry = knowledgeScores[k];
        if (entry.score <= 0) {
          continue;
        }
        if (topScore > 0 && entry.score < topScore * 0.4) {
          continue;
        }
        var chunk = lookupChunk(bank, entry.id);
        if (!chunk) {
          continue;
        }
        var knowledgeEntry = {
          type: "knowledge",
          source: chunk.file,
          chunk: chunk.order,
          text: chunk.text,
          score: entry.score
        };
        if (!bestKnowledgeEvidence) {
          bestKnowledgeEvidence = knowledgeEntry;
        }
        knowledgeEvidence.push(knowledgeEntry);
      }
      var decisionEvidence = collectDecisionEvidence(tokens);
      var bestDecisionEvidence = decisionEvidence.length > 0 ? decisionEvidence[0] : null;
      evidence = faqEvidence.concat(decisionEvidence, knowledgeEvidence);
      for (var idx = 0; idx < evidence.length; idx += 1) {
        evidence[idx].ref = idx + 1;
      }
      var summaryLines = [];
      if (bestFaq && bestFaq.score >= state.settings.faqHigh && bestFaqEvidence) {
        summaryLines.push("优先参考FAQ答案：" + bestFaqEvidence.text + "（资料" + bestFaqEvidence.ref + "）");
      } else {
        if (bestFaqEvidence) {
          summaryLines.push("FAQ建议：" + snippetText(bestFaqEvidence.text, 80) + "（资料" + bestFaqEvidence.ref + "）");
        }
        if (bestKnowledgeEvidence) {
          summaryLines.push("知识库提示：" + snippetText(bestKnowledgeEvidence.text, 80) + "（资料" + bestKnowledgeEvidence.ref + "）");
        }
        if (bestDecisionEvidence) {
          summaryLines.push("决策链洞察：" + snippetText(bestDecisionEvidence.text, 80) + "（资料" + bestDecisionEvidence.ref + "）");
        }
      }
      if (summaryLines.length === 0) {
        summaryLines.push("当前资料中未找到高相关答案，请补充更多上下文信息。");
      }
      var sections = [];
      if (faqEvidence.length > 0) {
        var faqLines = [];
        for (var fe = 0; fe < faqEvidence.length; fe += 1) {
          faqLines.push("- （资料" + faqEvidence[fe].ref + "）" + snippetText(faqEvidence[fe].text, 100) + " —— " + faqEvidence[fe].source);
        }
        sections.push("FAQ 依据：\n" + faqLines.join("\n"));
      }
      if (decisionEvidence.length > 0) {
        var decisionLines = [];
        for (var de = 0; de < decisionEvidence.length; de += 1) {
          decisionLines.push("- （资料" + decisionEvidence[de].ref + "）" + snippetText(decisionEvidence[de].text, 120) + " —— " + decisionEvidence[de].source);
        }
        sections.push("决策链依据：\n" + decisionLines.join("\n"));
      }
      if (knowledgeEvidence.length > 0) {
        var knowledgeLines = [];
        for (var ke = 0; ke < knowledgeEvidence.length; ke += 1) {
          knowledgeLines.push("- （资料" + knowledgeEvidence[ke].ref + "）" + snippetText(knowledgeEvidence[ke].text, 120) + " —— " + knowledgeEvidence[ke].source + " · 段 " + knowledgeEvidence[ke].chunk);
        }
        var reasoningEnabled = state.adminFlags.reasoning;
        var pageToggle = document.getElementById("reasoningToggle");
        if (pageToggle && pageToggle.checked && currentUser && currentUser.role === "admin") {
          reasoningEnabled = true;
        }
        if (reasoningEnabled) {
          var reasoning = reasoningSummary(knowledgeEvidence.map(function (item) { return item.text; }), state.adminFlags.reasoningLevel || 1);
          if (reasoning) {
            var refs = knowledgeEvidence.map(function (item) { return "资料" + item.ref; }).join("、");
            knowledgeLines.push("- 要点整理（基于" + refs + "）：\n  " + reasoning.split("\n").join("\n  "));
          }
        }
        sections.push("知识库依据：\n" + knowledgeLines.join("\n"));
      }
      replyText = "结论：\n" + summaryLines.map(function (line) { return "- " + line; }).join("\n");
      for (var s = 0; s < sections.length; s += 1) {
        replyText += "\n\n" + sections[s];
      }
      renderEvidence(evidence, highlightTokens);
    }
    var reply = {
      role: "assistant",
      text: replyText,
      ts: new Date().toISOString(),
      evidence: evidence.slice(0, 6),
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
    if (bank.common.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无常用问题</div>';
      return;
    }
    for (var i = 0; i < bank.common.length; i += 1) {
      (function (item) {
        var card = document.createElement("div");
        card.className = "faq-card";
        var header = document.createElement("header");
        var title = document.createElement("div");
        title.textContent = item.text;
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var removeBtn = document.createElement("button");
        removeBtn.className = "text-button danger";
        removeBtn.type = "button";
        removeBtn.textContent = "删除";
        removeBtn.addEventListener("click", function () {
          if (!window.confirm("删除该常用问题？")) {
            return;
          }
          var idx = bank.common.indexOf(item);
          if (idx >= 0) {
            bank.common.splice(idx, 1);
          }
          saveState();
          renderCommonList();
          renderCommonChips();
          showToast("常用问题已删除");
        });
        actions.appendChild(removeBtn);
        header.appendChild(title);
        header.appendChild(actions);
        card.appendChild(header);
        if (item.createdBy || item.createdAt) {
          var meta = document.createElement("div");
          meta.className = "meta";
          var parts = [];
          if (item.createdBy) {
            parts.push("创建:" + item.createdBy);
          }
          if (item.createdAt) {
            parts.push(formatDateTime(item.createdAt));
          }
          meta.textContent = parts.join(" · ");
          card.appendChild(meta);
        }
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
            showToast("日志已删除");
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

  function renderGuideConfig() {
    var box = document.getElementById("guideConfig");
    if (!box) {
      return;
    }
    var config = getGuideConfig();
    box.innerHTML = "";
    if (!config) {
      box.innerHTML = '<div class="panel-hint">尚未配置会话引导表单</div>';
      return;
    }
    var title = document.createElement("h4");
    title.textContent = config.title || "会话引导";
    box.appendChild(title);
    if (config.description) {
      var desc = document.createElement("p");
      desc.textContent = config.description;
      box.appendChild(desc);
    }
    if (!config.fields || config.fields.length === 0) {
      var hint = document.createElement("div");
      hint.className = "panel-hint";
      hint.textContent = "暂无字段";
      box.appendChild(hint);
      return;
    }
    var list = document.createElement("ul");
    for (var i = 0; i < config.fields.length; i += 1) {
      var item = document.createElement("li");
      item.textContent = (i + 1) + ". " + (config.fields[i].label || "字段");
      list.appendChild(item);
    }
    box.appendChild(list);
  }

  function appendGuideFieldRow(field) {
    var list = document.getElementById("guideFieldList");
    if (!list) {
      return;
    }
    var row = document.createElement("div");
    row.className = "guide-field-row";
    row.dataset.id = field && field.id ? field.id : uuid();
    var labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.placeholder = "字段标题";
    labelInput.value = field && field.label ? field.label : "";
    labelInput.setAttribute("data-role", "label");
    var placeholderInput = document.createElement("input");
    placeholderInput.type = "text";
    placeholderInput.placeholder = "填写提示";
    placeholderInput.value = field && field.placeholder ? field.placeholder : "";
    placeholderInput.setAttribute("data-role", "placeholder");
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "text-button danger";
    removeBtn.textContent = "移除";
    removeBtn.addEventListener("click", function () {
      if (row.parentNode) {
        row.parentNode.removeChild(row);
      }
      var remain = document.querySelectorAll("#guideFieldList .guide-field-row");
      if (!remain || remain.length === 0) {
        appendGuideFieldRow();
      }
    });
    row.appendChild(labelInput);
    row.appendChild(placeholderInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }

  function openGuideEditor() {
    var modal = document.getElementById("guideEditModal");
    var titleInput = document.getElementById("guideEditTitle");
    var descInput = document.getElementById("guideEditDesc");
    var list = document.getElementById("guideFieldList");
    var config = state.sessionGuide || JSON.parse(JSON.stringify(DEFAULT_SESSION_GUIDE));
    if (!modal || !list) {
      return false;
    }
    list.innerHTML = "";
    if (titleInput) {
      titleInput.value = config.title || "";
    }
    if (descInput) {
      descInput.value = config.description || "";
    }
    var fields = config.fields && config.fields.length > 0 ? config.fields : DEFAULT_SESSION_GUIDE.fields;
    for (var i = 0; i < fields.length; i += 1) {
      appendGuideFieldRow(fields[i]);
    }
    modal.classList.remove("hidden");
    return true;
  }

  function closeGuideEditor() {
    var modal = document.getElementById("guideEditModal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }

  function saveGuideConfig() {
    var titleInput = document.getElementById("guideEditTitle");
    var descInput = document.getElementById("guideEditDesc");
    var list = document.getElementById("guideFieldList");
    if (!list) {
      closeGuideEditor();
      return;
    }
    var rows = list.querySelectorAll(".guide-field-row");
    var fields = [];
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var labelInput = row.querySelector('input[data-role="label"]');
      var placeholderInput = row.querySelector('input[data-role="placeholder"]');
      var label = labelInput ? labelInput.value.trim() : "";
      var placeholder = placeholderInput ? placeholderInput.value.trim() : "";
      if (!label) {
        continue;
      }
      fields.push({
        id: row.dataset.id || uuid(),
        label: label,
        placeholder: placeholder
      });
    }
    if (fields.length === 0) {
      showToast("请至少保留一个字段");
      return;
    }
    state.sessionGuide = {
      title: titleInput ? titleInput.value.trim() : DEFAULT_SESSION_GUIDE.title,
      description: descInput ? descInput.value.trim() : "",
      fields: fields
    };
    saveState();
    renderGuideConfig();
    closeGuideEditor();
    showToast("会话引导已更新");
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
    var presets = state.decisionPresets || [];
    for (var i = 0; i < presets.length; i += 1) {
      var item = document.createElement("div");
      item.className = "palette-item";
      item.draggable = true;
      item.textContent = presets[i].label;
      item.dataset.value = presets[i].label;
      item.addEventListener("dragstart", function (evt) {
        evt.dataTransfer.setData("text/plain", evt.target.dataset.value);
      });
      palette.appendChild(item);
    }
  }

  function renderPresetEditor() {
    var list = document.getElementById("presetList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    var presets = state.decisionPresets || [];
    if (presets.length === 0) {
      presets = clonePresets(DEFAULT_DECISION_PRESETS);
    }
    for (var i = 0; i < presets.length; i += 1) {
      var row = document.createElement("div");
      row.className = "preset-row";
      row.dataset.id = presets[i].id;
      var input = document.createElement("input");
      input.type = "text";
      input.value = presets[i].label;
      input.placeholder = "常用步骤名称";
      row.appendChild(input);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "text-button danger";
      del.textContent = "删除";
      del.addEventListener("click", function (evt) {
        var target = evt.target.parentNode;
        if (target && target.parentNode && target.parentNode.children.length > 1) {
          target.parentNode.removeChild(target);
        } else {
          showToast("至少保留一个常用节点");
        }
      });
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  function openPresetManager() {
    var modal = document.getElementById("presetModal");
    if (!modal) {
      return;
    }
    renderPresetEditor();
    modal.classList.remove("hidden");
  }

  function closePresetManager() {
    var modal = document.getElementById("presetModal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }

  function addPresetRow() {
    var list = document.getElementById("presetList");
    if (!list) {
      return;
    }
    var row = document.createElement("div");
    row.className = "preset-row";
    row.dataset.id = uuid();
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "常用步骤名称";
    row.appendChild(input);
    var del = document.createElement("button");
    del.type = "button";
    del.className = "text-button danger";
    del.textContent = "删除";
    del.addEventListener("click", function () {
      if (row.parentNode && row.parentNode.children.length > 1) {
        row.parentNode.removeChild(row);
      } else {
        showToast("至少保留一个常用节点");
      }
    });
    row.appendChild(del);
    list.appendChild(row);
    input.focus();
  }

  function savePresetChanges() {
    var list = document.getElementById("presetList");
    if (!list) {
      return;
    }
    var rows = list.querySelectorAll(".preset-row");
    var next = [];
    for (var i = 0; i < rows.length; i += 1) {
      var input = rows[i].querySelector("input");
      if (!input) {
        continue;
      }
      var label = input.value.trim();
      if (!label) {
        continue;
      }
      var id = rows[i].dataset.id || uuid();
      next.push({ id: id, label: label });
    }
    if (next.length === 0) {
      showToast("请至少保留一个常用节点");
      return;
    }
    state.decisionPresets = next;
    saveState();
    renderDecisionPalette();
    closePresetManager();
    showToast("常用节点已更新");
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
        var strength = link.strength || "medium";
        if (strength !== "strong" && strength !== "weak") {
          strength = "medium";
        }
        var badge = document.createElement("span");
        badge.className = "badge-strength " + strength;
        badge.textContent = strength === "strong" ? "强" : (strength === "weak" ? "弱" : "中");
        info.appendChild(badge);
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
            scheduleDecisionLayout(project);
          }
        });
        actions.appendChild(delBtn);
        item.appendChild(info);
        item.appendChild(actions);
        list.appendChild(item);
      })(project.links[i]);
    }
  }

  function handleNodeLink(nodeId) {
    var project = getActiveDecisionProject();
    if (!project || !project.timeline) {
      return;
    }
    if (!pendingLinkFromId) {
      pendingLinkFromId = nodeId;
      hideLinkForm();
      renderActiveProject();
      showToast("请选择另一节点完成关联");
      return;
    }
    if (pendingLinkFromId === nodeId) {
      pendingLinkFromId = null;
      hideLinkForm();
      renderActiveProject();
      return;
    }
    openLinkForm(pendingLinkFromId, nodeId);
  }

  function removeTimelineNode(nodeId) {
    var project = getActiveDecisionProject();
    if (!project || !project.timeline) {
      return;
    }
    for (var i = project.timeline.length - 1; i >= 0; i -= 1) {
      if (project.timeline[i].id === nodeId) {
        project.timeline.splice(i, 1);
      }
    }
    for (var j = project.links.length - 1; j >= 0; j -= 1) {
      if (project.links[j].fromId === nodeId || project.links[j].toId === nodeId) {
        project.links.splice(j, 1);
      }
    }
    if (pendingLinkFromId === nodeId) {
      pendingLinkFromId = null;
      hideLinkForm();
    }
    if (activeNodeId === nodeId) {
      activeNodeId = null;
    }
    saveState();
    renderActiveProject();
    renderDecisionHistory();
    showToast("节点已移除");
  }

  function createTimelineNode(project, node, locked, index) {
    var card = document.createElement("div");
    card.className = "mind-node" + (index % 2 === 0 ? " left" : " right");
    card.setAttribute("data-node", node.id);
    if (activeNodeId === node.id) {
      card.classList.add("active");
    }
    if (pendingLinkFromId && pendingLinkFromId === node.id) {
      card.classList.add("linking");
    }
    var connector = document.createElement("div");
    connector.className = "mind-node-connector";
    card.appendChild(connector);
    var bubble = document.createElement("div");
    bubble.className = "mind-node-bubble";
    var title = document.createElement("div");
    title.className = "mind-node-title";
    title.textContent = node.title || "未命名节点";
    var time = document.createElement("div");
    time.className = "mind-node-time";
    time.textContent = node.startTime ? formatDateTime(node.startTime) : "时间待定";
    bubble.appendChild(title);
    bubble.appendChild(time);
    bubble.addEventListener("click", function () {
      openNodeDetail(node.id);
    });
    card.appendChild(bubble);
    var tags = document.createElement("div");
    tags.className = "mind-node-tags";
    if (node.reason) {
      var reasonTag = document.createElement("span");
      reasonTag.className = "tag";
      reasonTag.textContent = snippetText(node.reason, 24);
      tags.appendChild(reasonTag);
    }
    if (node.impact) {
      var impactTag = document.createElement("span");
      impactTag.className = "tag strong";
      impactTag.textContent = snippetText(node.impact, 24);
      tags.appendChild(impactTag);
    }
    if (node.note) {
      var noteTag = document.createElement("span");
      noteTag.className = "tag muted";
      noteTag.textContent = snippetText(node.note, 24);
      tags.appendChild(noteTag);
    }
    card.appendChild(tags);
    var actions = document.createElement("div");
    actions.className = "mind-node-actions";
    var detailBtn = document.createElement("button");
    detailBtn.className = "chip-button";
    detailBtn.type = "button";
    detailBtn.textContent = "详情";
    detailBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      openNodeDetail(node.id);
    });
    var linkBtn = document.createElement("button");
    linkBtn.className = "chip-button";
    linkBtn.type = "button";
    linkBtn.disabled = locked;
    linkBtn.textContent = pendingLinkFromId && pendingLinkFromId === node.id ? "取消关联" : "关联";
    linkBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      if (locked) {
        return;
      }
      handleNodeLink(node.id);
    });
    actions.appendChild(detailBtn);
    actions.appendChild(linkBtn);
    card.appendChild(actions);
    return card;
  }

  function refreshNodeBubble(node) {
    var wrapper = document.querySelector('[data-node="' + node.id + '"]');
    if (!wrapper) {
      return;
    }
    if (activeNodeId === node.id) {
      wrapper.classList.add("active");
    } else {
      wrapper.classList.remove("active");
    }
    var titleEl = wrapper.querySelector(".mind-node-title");
    if (titleEl) {
      titleEl.textContent = node.title || "未命名节点";
    }
    var timeEl = wrapper.querySelector(".mind-node-time");
    if (timeEl) {
      timeEl.textContent = node.startTime ? formatDateTime(node.startTime) : "时间待定";
    }
    var tagsEl = wrapper.querySelector(".mind-node-tags");
    if (tagsEl) {
      tagsEl.innerHTML = "";
      if (node.reason) {
        var reasonTag = document.createElement("span");
        reasonTag.className = "tag";
        reasonTag.textContent = snippetText(node.reason, 24);
        tagsEl.appendChild(reasonTag);
      }
      if (node.impact) {
        var impactTag = document.createElement("span");
        impactTag.className = "tag strong";
        impactTag.textContent = snippetText(node.impact, 24);
        tagsEl.appendChild(impactTag);
      }
      if (node.note) {
        var noteTag = document.createElement("span");
        noteTag.className = "tag muted";
        noteTag.textContent = snippetText(node.note, 24);
        tagsEl.appendChild(noteTag);
      }
    }
  }

  function openNodeDetail(nodeId) {
    activeNodeId = nodeId;
    renderActiveProject();
  }

  function closeNodeDetailPanel() {
    activeNodeId = null;
    var panel = document.getElementById("nodeDetailPanel");
    if (panel) {
      panel.classList.add("hidden");
    }
    renderActiveProject();
  }

  function renderNodeDetail() {
    var panel = document.getElementById("nodeDetailPanel");
    if (!panel) {
      return;
    }
    var project = getActiveDecisionProject();
    if (!project || !activeNodeId) {
      panel.classList.add("hidden");
      return;
    }
    var node = findTimelineNode(project, activeNodeId);
    if (!node) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    panel.classList.toggle("locked", project.completed);
    var title = document.getElementById("nodeDetailTitle");
    if (title) {
      title.textContent = node.title || "未命名节点";
    }
    var meta = document.getElementById("nodeDetailMeta");
    if (meta) {
      meta.textContent = (project.name || "项目") + " · " + (node.startTime ? formatDateTime(node.startTime) : "时间待定");
    }
    var nameInput = document.getElementById("detailName");
    if (nameInput) {
      nameInput.value = node.title || "";
      nameInput.disabled = project.completed;
    }
    var startInput = document.getElementById("detailStart");
    if (startInput) {
      startInput.value = node.startTime || "";
      startInput.disabled = project.completed;
    }
    var reasonInput = document.getElementById("detailReason");
    if (reasonInput) {
      reasonInput.value = node.reason || "";
      reasonInput.disabled = project.completed;
    }
    var impactInput = document.getElementById("detailImpact");
    if (impactInput) {
      impactInput.value = node.impact || "";
      impactInput.disabled = project.completed;
    }
    var noteInput = document.getElementById("detailNote");
    if (noteInput) {
      noteInput.value = node.note || "";
      noteInput.disabled = project.completed;
    }
    var linkBtn = document.getElementById("detailLink");
    if (linkBtn) {
      linkBtn.disabled = project.completed;
      linkBtn.textContent = pendingLinkFromId ? "选择目标" : "建立关联";
    }
    var removeBtn = document.getElementById("detailRemove");
    if (removeBtn) {
      removeBtn.disabled = project.completed;
    }
  }

  function updateNodeField(field, value) {
    var project = getActiveDecisionProject();
    if (!project || !activeNodeId) {
      return;
    }
    var node = findTimelineNode(project, activeNodeId);
    if (!node) {
      return;
    }
    node[field] = value;
    if (field === "startTime") {
      sortTimeline(project);
      saveState();
      renderActiveProject();
      return;
    }
    saveState();
    refreshNodeBubble(node);
    scheduleDecisionLayout(project);
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
      var panel = document.getElementById("nodeDetailPanel");
      if (panel) {
        panel.classList.add("hidden");
      }
      scheduleDecisionLayout(null);
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
        canvas.appendChild(createTimelineNode(project, project.timeline[i], project.completed, i));
      }
    }
    renderLinkList(project);
    renderNodeDetail();
    scheduleDecisionLayout(project);
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
            activeNodeId = null;
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
      if (completed[j].timeline && completed[j].timeline.length > 0) {
        var steps = document.createElement("ol");
        steps.className = "history-steps";
        var limit = Math.min(completed[j].timeline.length, 5);
        for (var s = 0; s < limit; s += 1) {
          var step = completed[j].timeline[s];
          var item = document.createElement("li");
          var label = step.title || "节点" + (s + 1);
          var when = step.startTime ? formatDateTime(step.startTime) : "时间待定";
          item.innerHTML = '<span class="step-name">' + label + '</span><span class="step-meta">' + when + '</span>';
          steps.appendChild(item);
        }
        if (completed[j].timeline.length > limit) {
          var more = document.createElement("li");
          more.className = "step-more";
          more.textContent = "... 等 " + (completed[j].timeline.length - limit) + " 个步骤";
          steps.appendChild(more);
        }
        card.appendChild(steps);
      }
      container.appendChild(card);
    }
  }

  function layoutNodeConnectors(canvas) {
    if (!canvas) {
      return;
    }
    var nodes = canvas.querySelectorAll(".mind-node");
    if (!nodes || nodes.length === 0) {
      return;
    }
    var canvasRect = canvas.getBoundingClientRect();
    var center = canvasRect.width / 2;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var connector = node.querySelector(".mind-node-connector");
      var bubble = node.querySelector(".mind-node-bubble");
      if (!connector || !bubble) {
        continue;
      }
      var nodeRect = node.getBoundingClientRect();
      var bubbleRect = bubble.getBoundingClientRect();
      var startX = node.classList.contains("left")
        ? bubbleRect.right - nodeRect.left
        : canvasRect.left + center - nodeRect.left;
      var endX = node.classList.contains("left")
        ? canvasRect.left + center - nodeRect.left
        : bubbleRect.left - nodeRect.left;
      var width = Math.max(12, Math.abs(endX - startX));
      var left = Math.min(startX, endX);
      var top = bubbleRect.top - nodeRect.top + bubbleRect.height / 2 - 1;
      connector.style.left = left + "px";
      connector.style.width = width + "px";
      connector.style.top = top + "px";
    }
  }

  function drawDecisionLinks(canvas, project) {
    if (!canvas) {
      return;
    }
    var layer = canvas.querySelector(".link-overlay");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      layer.classList.add("link-overlay");
      canvas.appendChild(layer);
    }
    while (layer.firstChild) {
      layer.removeChild(layer.firstChild);
    }
    if (!project || !project.links || project.links.length === 0) {
      return;
    }
    var canvasRect = canvas.getBoundingClientRect();
    layer.setAttribute("width", canvasRect.width);
    layer.setAttribute("height", canvas.scrollHeight);
    layer.setAttribute("viewBox", "0 0 " + canvasRect.width + " " + canvas.scrollHeight);
    var center = canvasRect.width / 2;
    for (var i = 0; i < project.links.length; i += 1) {
      var link = project.links[i];
      var fromNode = canvas.querySelector('[data-node="' + link.fromId + '"]');
      var toNode = canvas.querySelector('[data-node="' + link.toId + '"]');
      if (!fromNode || !toNode) {
        continue;
      }
      var fromBubble = fromNode.querySelector(".mind-node-bubble");
      var toBubble = toNode.querySelector(".mind-node-bubble");
      if (!fromBubble || !toBubble) {
        continue;
      }
      var fromRect = fromBubble.getBoundingClientRect();
      var toRect = toBubble.getBoundingClientRect();
      var fromX = fromNode.classList.contains("left")
        ? fromRect.right - canvasRect.left
        : fromRect.left - canvasRect.left;
      var toX = toNode.classList.contains("left")
        ? toRect.right - canvasRect.left
        : toRect.left - canvasRect.left;
      var fromY = fromRect.top - canvasRect.top + fromRect.height / 2;
      var toY = toRect.top - canvasRect.top + toRect.height / 2;
      var controlOffset = function (node, x) {
        if (node.classList.contains("left")) {
          return Math.min(160, center - x) + 40;
        }
        return -1 * (Math.min(160, x - center) + 40);
      };
      var c1x = fromX + controlOffset(fromNode, fromX);
      var c2x = toX + controlOffset(toNode, toX);
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M" + fromX + "," + fromY + " C " + c1x + "," + fromY + " " + c2x + "," + toY + " " + toX + "," + toY);
      var strength = link.strength || "medium";
      if (strength !== "strong" && strength !== "weak") {
        strength = "medium";
      }
      path.setAttribute("class", "link-path strength-" + strength);
      path.setAttribute("stroke-linecap", "round");
      layer.appendChild(path);
    }
  }

  function scheduleDecisionLayout(project) {
    if (decisionLayoutRaf) {
      window.cancelAnimationFrame(decisionLayoutRaf);
    }
    var canvas = document.getElementById("timelineCanvas");
    if (!canvas) {
      return;
    }
    decisionLayoutRaf = window.requestAnimationFrame(function () {
      decisionLayoutRaf = null;
      layoutNodeConnectors(canvas);
      drawDecisionLinks(canvas, project);
    });
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
          var fileId = uuid();
          var entry = { id: fileId, name: file.name, chunks: 0, size: file.size };
          bank.files.push(entry);
          entry.chunks = addChunksToIndex(bank, file.name, chunks, fileId);
        }));
      })(files[i]);
    }
    Promise.all(tasks).then(function () {
      saveState();
      renderKnowledge();
      var uploaderEl = document.getElementById("kbUploader");
      if (uploaderEl) {
        uploaderEl.value = "";
      }
      var info = document.getElementById("kbUploadInfo");
      if (info) {
        info.textContent = "未选择文件";
      }
      showToast("文件已摄取");
    });
  }

  function initLoginPage() {
    var tabs = document.querySelectorAll(".auth-tab");
    var form = document.getElementById("authForm");
    var roleField = document.getElementById("roleField");
    var submit = document.getElementById("authSubmit");
    var mode = "login";
    initAuthBackdrop();
    window.addEventListener("resize", initAuthBackdrop);
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
    var guideToggle = document.getElementById("guideToggle");
    if (guideToggle) {
      guideToggle.addEventListener("click", function () {
        var bank = getActiveBank();
        var session = bank ? findSession(bank, state.activeSessionId) : null;
        if (!openGuideModal(session, true)) {
          showToast("请先在系统配置引导表单");
        }
      });
    }
    var guideForm = document.getElementById("guideForm");
    if (guideForm) {
      guideForm.addEventListener("submit", handleGuideSubmit);
    }
    var closeGuideBtn = document.getElementById("closeGuide");
    if (closeGuideBtn) {
      closeGuideBtn.addEventListener("click", closeGuideModal);
    }
    var skipGuideBtn = document.getElementById("skipGuide");
    if (skipGuideBtn) {
      skipGuideBtn.addEventListener("click", skipGuideModal);
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
    if (uploader) {
      uploader.addEventListener("change", function () {
        var info = document.getElementById("kbUploadInfo");
        if (!info) {
          return;
        }
        if (!uploader.files || uploader.files.length === 0) {
          info.textContent = "未选择文件";
          return;
        }
        var names = [];
        for (var i = 0; i < uploader.files.length && i < 3; i += 1) {
          names.push(uploader.files[i].name);
        }
        if (uploader.files.length > 3) {
          names.push("等 " + (uploader.files.length - 3) + " 个文件");
        }
        info.textContent = names.join("，");
      });
    }
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
        var fileId = uuid();
        var entry = { id: fileId, name: title, chunks: 0, size: body.length };
        bank.files.push(entry);
        entry.chunks = addChunksToIndex(bank, title, chunks, fileId);
        saveState();
        renderKnowledge();
        showToast("已保存到记忆库");
        manualForm.reset();
      });
    }
    var chunkForm = document.getElementById("chunkForm");
    if (chunkForm) {
      chunkForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        if (!chunkEditingId) {
          closeChunkEditor();
          return;
        }
        var bank = getActiveBank();
        if (!bank) {
          showToast("请选择记忆库");
          return;
        }
        var chunk = lookupChunk(bank, chunkEditingId);
        if (!chunk) {
          showToast("分段不存在");
          closeChunkEditor();
          return;
        }
        var contentInput = document.getElementById("chunkContent");
        if (!contentInput) {
          return;
        }
        var newText = contentInput.value.trim();
        if (!newText) {
          showToast("请输入分段内容");
          return;
        }
        chunk.text = newText;
        rebuildIndex(bank);
        saveState();
        renderKnowledge();
        closeChunkEditor();
        showToast("分段已更新");
      });
    }
    var chunkCancel = document.getElementById("chunkCancel");
    if (chunkCancel) {
      chunkCancel.addEventListener("click", function () {
        closeChunkEditor();
      });
    }
    var chunkModal = document.getElementById("chunkModal");
    if (chunkModal) {
      chunkModal.addEventListener("click", function (evt) {
        if (evt.target === chunkModal) {
          closeChunkEditor();
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
    window.addEventListener("resize", function () {
      scheduleDecisionLayout(getActiveDecisionProject());
    });
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
    var managePresetBtn = document.getElementById("managePresets");
    if (managePresetBtn) {
      managePresetBtn.addEventListener("click", function () {
        openPresetManager();
      });
    }
    var addPresetBtn = document.getElementById("addPresetRow");
    if (addPresetBtn) {
      addPresetBtn.addEventListener("click", function () {
        addPresetRow();
      });
    }
    var savePresetBtn = document.getElementById("savePreset");
    if (savePresetBtn) {
      savePresetBtn.addEventListener("click", function () {
        savePresetChanges();
      });
    }
    var cancelPresetBtn = document.getElementById("cancelPreset");
    if (cancelPresetBtn) {
      cancelPresetBtn.addEventListener("click", function () {
        closePresetManager();
      });
    }
    var presetModal = document.getElementById("presetModal");
    if (presetModal) {
      presetModal.addEventListener("click", function (evt) {
        if (evt.target === presetModal) {
          closePresetManager();
        }
      });
    }
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
        var strengthInput = document.getElementById("linkStrength");
        var relation = relationInput ? relationInput.value.trim() : "";
        var note = noteInput ? noteInput.value.trim() : "";
        var strengthValue = strengthInput ? strengthInput.value : "medium";
        if (strengthValue !== "strong" && strengthValue !== "weak") {
          strengthValue = "medium";
        }
        project.links.push({
          id: uuid(),
          fromId: fromId,
          toId: toId,
          relation: relation || "关联",
          note: note,
          strength: strengthValue,
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
    var detailClose = document.getElementById("closeNodeDetail");
    if (detailClose) {
      detailClose.addEventListener("click", function () {
        closeNodeDetailPanel();
      });
    }
    var detailName = document.getElementById("detailName");
    if (detailName) {
      detailName.addEventListener("input", function () {
        updateNodeField("title", detailName.value);
        var titleEl = document.getElementById("nodeDetailTitle");
        if (titleEl) {
          titleEl.textContent = detailName.value.trim() || "未命名节点";
        }
      });
    }
    var detailStart = document.getElementById("detailStart");
    if (detailStart) {
      detailStart.addEventListener("change", function () {
        updateNodeField("startTime", detailStart.value);
      });
    }
    var detailReason = document.getElementById("detailReason");
    if (detailReason) {
      detailReason.addEventListener("input", function () {
        updateNodeField("reason", detailReason.value);
      });
    }
    var detailImpact = document.getElementById("detailImpact");
    if (detailImpact) {
      detailImpact.addEventListener("input", function () {
        updateNodeField("impact", detailImpact.value);
      });
    }
    var detailNote = document.getElementById("detailNote");
    if (detailNote) {
      detailNote.addEventListener("input", function () {
        updateNodeField("note", detailNote.value);
      });
    }
    var detailLink = document.getElementById("detailLink");
    if (detailLink) {
      detailLink.addEventListener("click", function () {
        if (!activeNodeId) {
          return;
        }
        handleNodeLink(activeNodeId);
        renderNodeDetail();
      });
    }
    var detailRemove = document.getElementById("detailRemove");
    if (detailRemove) {
      detailRemove.addEventListener("click", function () {
        if (!activeNodeId) {
          return;
        }
        if (!window.confirm("确定移除该节点及其关联？")) {
          return;
        }
        removeTimelineNode(activeNodeId);
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
    var commonForm = document.getElementById("commonForm");
    if (commonForm) {
      commonForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var bank = getActiveBank();
        if (!bank) {
          showToast("请先选择记忆库");
          return;
        }
        var input = document.getElementById("commonInput");
        var text = input ? input.value.trim() : "";
        if (!text) {
          showToast("请输入常用问题");
          return;
        }
        bank.common.push({
          id: uuid(),
          text: text,
          createdBy: currentUser ? currentUser.username : "",
          createdAt: new Date().toISOString()
        });
        saveState();
        renderCommonList();
        renderCommonChips();
        if (input) {
          input.value = "";
        }
        showToast("常用问题已新增");
      });
    }
    renderGuideConfig();
    var editGuideBtn = document.getElementById("editGuide");
    if (editGuideBtn) {
      editGuideBtn.addEventListener("click", function () {
        if (!openGuideEditor()) {
          showToast("暂无可编辑字段，请稍后再试");
        }
      });
    }
    var addGuideFieldBtn = document.getElementById("addGuideField");
    if (addGuideFieldBtn) {
      addGuideFieldBtn.addEventListener("click", function () {
        appendGuideFieldRow();
      });
    }
    var guideEditForm = document.getElementById("guideEditForm");
    if (guideEditForm) {
      guideEditForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        saveGuideConfig();
      });
    }
    var cancelGuideEdit = document.getElementById("cancelGuideEdit");
    if (cancelGuideEdit) {
      cancelGuideEdit.addEventListener("click", function () {
        closeGuideEditor();
      });
    }
    var guideEditModal = document.getElementById("guideEditModal");
    if (guideEditModal) {
      guideEditModal.addEventListener("click", function (evt) {
        if (evt.target === guideEditModal) {
          closeGuideEditor();
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
