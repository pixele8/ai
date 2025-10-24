(function () {
  var STORAGE_KEY = "aiWorkbenchState";
  var SESSION_KEY = "aiWorkbenchCurrentUser";
  var PERSISTED_SESSION_KEY = SESSION_KEY + "Persist";
  var state = null;
  var currentUser = null;
  var toastTimer = null;
  var textEncoder = new TextEncoder();
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
  var DEFAULT_CONTAM_GROUPS = ["待分组", "热斑污染", "线状污染", "颗粒污染"];
  var activeNodeId = null;
  var chunkEditingId = null;
  var activeFileFilterId = null;
  var authBackdropRaf = null;
  var decisionLayoutRaf = null;
  var sessionMenuSessionId = null;
  var historySearchTerm = "";
  var historyGroupFilter = "all";
  var historyGrouping = "group";
  var pendingChunkHighlightId = null;
  var detailProjectId = null;
  var detailHighlightId = null;
  var detailNoteTimer = null;
  var detailActiveNodeId = null;
  var detailLayoutRaf = null;
  var bankMenuBankId = null;
  var visionSubscribers = [];
  var messageMenuInfo = null;
  var activeFavoriteId = null;
  var favoriteSearchTerm = "";
  var floatingFavoriteId = null;
  var floatingFavoriteBankId = null;
  var floatingFavoriteMinimized = false;
  var floatingFavoriteExpanded = false;
  var floatingFavoritePosition = null;
  var trendSubscribers = [];
  var trendBeaconUnsubscribe = null;
  var trendBeaconState = { open: false };
  var trendDemoTimer = null;
  var trendDemoLastTick = 0;
  var trendBeaconRoot = null;
  var trendBeaconDocListenerAttached = false;
  var FAVORITE_OVERLAY_STATE_KEY = "aiFavoriteOverlayState";
  var SESSION_LIST_MIN = 7;
  var SESSION_LIST_STEP = 5;
  var sessionListDisplayLimit = SESSION_LIST_MIN;
  var sessionListRenderedBankId = null;
  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var SHA256_INIT = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19
  ];

  function padNumber(value) {
    var num = parseInt(value, 10);
    if (isNaN(num)) {
      return "00";
    }
    return num < 10 ? "0" + num : String(num);
  }

  function favoriteTitleFromText(text) {
    if (!text) {
      return "收藏会话";
    }
    var cleaned = String(text).replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return "收藏会话";
    }
    return cleaned.length > 18 ? cleaned.slice(0, 18) + "…" : cleaned;
  }

  function favoriteTitleFromSession(session) {
    if (!session) {
      return "收藏会话";
    }
    if (session.manualTitle && session.title) {
      return session.title;
    }
    if (session.title && session.title !== "新会话") {
      return session.title;
    }
    return favoriteTitleFromText(favoriteSummaryFromSession(session));
  }

  function favoriteSummaryFromSession(session) {
    if (!session || !session.messages || session.messages.length === 0) {
      return session && session.title ? session.title : "";
    }
    var start = Math.max(0, session.messages.length - 4);
    var lines = [];
    for (var i = start; i < session.messages.length; i += 1) {
      var msg = session.messages[i];
      if (!msg || !msg.text) {
        continue;
      }
      var role = msg.role === "user" ? "用户" : "助理";
      var cleaned = String(msg.text).replace(/\s+/g, " ").trim();
      if (!cleaned) {
        continue;
      }
      lines.push("[" + role + "] " + cleaned);
    }
    return lines.join("\n");
  }

  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256Digest(bytes) {
    var words = [];
    for (var i = 0; i < bytes.length; i += 1) {
      var wordIndex = i >> 2;
      if (typeof words[wordIndex] === "undefined") {
        words[wordIndex] = 0;
      }
      words[wordIndex] |= bytes[i] << (24 - (i % 4) * 8);
    }
    var length = bytes.length;
    var finalWordIndex = length >> 2;
    if (typeof words[finalWordIndex] === "undefined") {
      words[finalWordIndex] = 0;
    }
    words[finalWordIndex] |= 0x80 << (24 - (length % 4) * 8);
    var totalWords = (((length + 8) >> 6) + 1) << 4;
    while (words.length < totalWords) {
      words.push(0);
    }
    words[totalWords - 1] = length * 8;
    var H = SHA256_INIT.slice();
    var w = new Array(64);
    for (var offset = 0; offset < words.length; offset += 16) {
      for (var t = 0; t < 16; t += 1) {
        w[t] = words[offset + t] || 0;
      }
      for (var t2 = 16; t2 < 64; t2 += 1) {
        var s0 = rightRotate(w[t2 - 15], 7) ^ rightRotate(w[t2 - 15], 18) ^ (w[t2 - 15] >>> 3);
        var s1 = rightRotate(w[t2 - 2], 17) ^ rightRotate(w[t2 - 2], 19) ^ (w[t2 - 2] >>> 10);
        w[t2] = (((w[t2 - 16] + s0) >>> 0) + ((w[t2 - 7] + s1) >>> 0)) >>> 0;
      }
      var a = H[0];
      var b = H[1];
      var c = H[2];
      var d = H[3];
      var e = H[4];
      var f = H[5];
      var g = H[6];
      var h = H[7];
      for (var t3 = 0; t3 < 64; t3 += 1) {
        var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (((((h + S1) >>> 0) + ch) >>> 0) + SHA256_K[t3]) >>> 0;
        temp1 = (temp1 + w[t3]) >>> 0;
        var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    var digest = new Uint8Array(32);
    for (var i2 = 0; i2 < 8; i2 += 1) {
      digest[i2 * 4] = (H[i2] >>> 24) & 255;
      digest[i2 * 4 + 1] = (H[i2] >>> 16) & 255;
      digest[i2 * 4 + 2] = (H[i2] >>> 8) & 255;
      digest[i2 * 4 + 3] = H[i2] & 255;
    }
    return digest;
  }

  function concatUint8Arrays(a, b) {
    var result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  }

  function hmacSha256(keyBytes, messageBytes) {
    var blockSize = 64;
    var key = keyBytes;
    if (key.length > blockSize) {
      key = sha256Digest(key);
    }
    var padded = new Uint8Array(blockSize);
    padded.set(key);
    var oKeyPad = new Uint8Array(blockSize);
    var iKeyPad = new Uint8Array(blockSize);
    for (var i = 0; i < blockSize; i += 1) {
      var byte = padded[i];
      oKeyPad[i] = byte ^ 0x5c;
      iKeyPad[i] = byte ^ 0x36;
    }
    var inner = concatUint8Arrays(iKeyPad, messageBytes);
    var innerHash = sha256Digest(inner);
    var outer = concatUint8Arrays(oKeyPad, innerHash);
    return sha256Digest(outer);
  }

  function pbkdf2Sha256(passwordBytes, saltBytes, iterations, keyLength) {
    var hLen = 32;
    var l = Math.ceil(keyLength / hLen);
    var output = new Uint8Array(l * hLen);
    var block = new Uint8Array(saltBytes.length + 4);
    block.set(saltBytes, 0);
    for (var i = 1; i <= l; i += 1) {
      block[saltBytes.length] = (i >>> 24) & 255;
      block[saltBytes.length + 1] = (i >>> 16) & 255;
      block[saltBytes.length + 2] = (i >>> 8) & 255;
      block[saltBytes.length + 3] = i & 255;
      var u = hmacSha256(passwordBytes, block);
      var t = new Uint8Array(u);
      for (var j = 1; j < iterations; j += 1) {
        u = hmacSha256(passwordBytes, u);
        for (var k = 0; k < hLen; k += 1) {
          t[k] ^= u[k];
        }
      }
      output.set(t, (i - 1) * hLen);
    }
    return output.slice(0, keyLength);
  }

  function getRandomBytes(length) {
    var size = length || 16;
    var bytes = new Uint8Array(size);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < size; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  }

  function supportsSubtleCrypto() {
    return !!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.importKey === "function");
  }

  function fallbackDeriveKey(password, saltBase64) {
    try {
      var passwordBytes = textEncoder.encode(password);
      var saltBytes = new Uint8Array(base64ToArrayBuffer(saltBase64));
      var derived = pbkdf2Sha256(passwordBytes, saltBytes, 100000, 32);
      return Promise.resolve(arrayBufferToBase64(derived.buffer));
    } catch (err) {
      console.warn("fallbackDeriveKey error", err);
      var altSalt = textEncoder.encode(saltBase64);
      var derivedAlt = pbkdf2Sha256(textEncoder.encode(password), altSalt, 100000, 32);
      return Promise.resolve(arrayBufferToBase64(derivedAlt.buffer));
    }
  }

  function persistFloatingFavoriteState() {
    var payload = {
      id: floatingFavoriteId,
      bankId: floatingFavoriteBankId,
      minimized: floatingFavoriteMinimized,
      expanded: floatingFavoriteExpanded,
      position: floatingFavoritePosition
    };
    try {
      sessionStorage.setItem(FAVORITE_OVERLAY_STATE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("persistFloatingFavoriteState failed", err);
    }
  }

  function restoreFloatingFavoriteState() {
    var raw = null;
    try {
      raw = sessionStorage.getItem(FAVORITE_OVERLAY_STATE_KEY);
    } catch (err) {
      raw = null;
    }
    if (!raw) {
      return;
    }
    try {
      var payload = JSON.parse(raw);
      if (payload && typeof payload === "object") {
        floatingFavoriteId = payload.id || null;
        floatingFavoriteBankId = payload.bankId || null;
        floatingFavoriteMinimized = !!payload.minimized;
        floatingFavoriteExpanded = !!payload.expanded;
        if (payload.position && typeof payload.position.x === "number" && typeof payload.position.y === "number") {
          floatingFavoritePosition = { x: payload.position.x, y: payload.position.y };
        } else {
          floatingFavoritePosition = null;
        }
      }
    } catch (err) {
      console.warn("restoreFloatingFavoriteState failed", err);
    }
  }

  function applyFloatingFavoritePosition(overlay) {
    if (!overlay) {
      return;
    }
    if (floatingFavoritePosition && typeof floatingFavoritePosition.x === "number" && typeof floatingFavoritePosition.y === "number") {
      overlay.style.left = floatingFavoritePosition.x + "px";
      overlay.style.top = floatingFavoritePosition.y + "px";
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    } else {
      overlay.style.left = "";
      overlay.style.top = "";
      overlay.style.right = "32px";
      overlay.style.bottom = "32px";
    }
  }

  function clampOverlayPosition(x, y, overlay) {
    var element = overlay;
    var width = element ? element.offsetWidth : 0;
    var height = element ? element.offsetHeight : 0;
    var maxX = Math.max(12, window.innerWidth - width - 12);
    var maxY = Math.max(12, window.innerHeight - height - 12);
    var nextX = Math.min(Math.max(12, x), maxX);
    var nextY = Math.min(Math.max(12, y), maxY);
    return { x: Math.round(nextX), y: Math.round(nextY) };
  }

  function attachFavoriteOverlayDrag(overlay) {
    if (!overlay) {
      return;
    }
    var handle = overlay.querySelector(".favorite-overlay-header") || overlay;
    handle.onpointerdown = function (evt) {
      if (evt.pointerType === "mouse" && evt.button !== 0) {
        return;
      }
      if (evt.target && evt.target.closest && evt.target.closest(".favorite-overlay-tools")) {
        return;
      }
      evt.preventDefault();
      var rect = overlay.getBoundingClientRect();
      var offsetX = evt.clientX - rect.left;
      var offsetY = evt.clientY - rect.top;
      function onMove(moveEvt) {
        var x = moveEvt.clientX - offsetX;
        var y = moveEvt.clientY - offsetY;
        floatingFavoritePosition = clampOverlayPosition(x, y, overlay);
        applyFloatingFavoritePosition(overlay);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        persistFloatingFavoriteState();
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };
  }

  function keepFloatingFavoriteVisible(overlay) {
    if (!overlay || !floatingFavoriteId || !floatingFavoritePosition) {
      return;
    }
    floatingFavoritePosition = clampOverlayPosition(floatingFavoritePosition.x, floatingFavoritePosition.y, overlay);
    applyFloatingFavoritePosition(overlay);
  }

  window.addEventListener("resize", function () {
    if (!floatingFavoriteId) {
      return;
    }
    var overlay = document.getElementById("favoriteOverlay");
    if (overlay) {
      keepFloatingFavoriteVisible(overlay);
      persistFloatingFavoriteState();
    }
  });

  function cloneTranscript(messages) {
    var transcript = [];
    if (!messages) {
      return transcript;
    }
    for (var i = 0; i < messages.length; i += 1) {
      var msg = messages[i];
      if (!msg) {
        continue;
      }
      transcript.push({
        id: msg.id || uuid(),
        role: msg.role === "user" ? "user" : "assistant",
        text: msg.text ? String(msg.text) : "",
        ts: msg.ts || msg.time || ""
      });
    }
    return transcript;
  }

  function ensureBankFavorites(bank) {
    if (!bank.favorites) {
      bank.favorites = [];
    }
    return bank.favorites;
  }

  function findFavoriteById(bank, favoriteId) {
    if (!bank || !bank.favorites) {
      return null;
    }
    for (var i = 0; i < bank.favorites.length; i += 1) {
      if (bank.favorites[i].id === favoriteId) {
        return bank.favorites[i];
      }
    }
    return null;
  }

  function findFavoriteWithBank(favoriteId, bankId) {
    if (!favoriteId) {
      return { favorite: null, bank: null };
    }
    var bank = null;
    if (bankId) {
      bank = findBankById(bankId);
      if (bank) {
        var favoriteInBank = findFavoriteById(bank, favoriteId);
        if (favoriteInBank) {
          return { favorite: favoriteInBank, bank: bank };
        }
      }
    }
    if (state && state.banks) {
      for (var i = 0; i < state.banks.length; i += 1) {
        var candidateBank = state.banks[i];
        if (!candidateBank) {
          continue;
        }
        var candidateFavorite = findFavoriteById(candidateBank, favoriteId);
        if (candidateFavorite) {
          return { favorite: candidateFavorite, bank: candidateBank };
        }
      }
    }
    var activeBank = getActiveBank();
    if (activeBank) {
      var activeFavorite = findFavoriteById(activeBank, favoriteId);
      if (activeFavorite) {
        return { favorite: activeFavorite, bank: activeBank };
      }
    }
    return { favorite: null, bank: null };
  }

  function openFavoriteEvidence(favoriteId, bankId, messageId) {
    var resolved = findFavoriteWithBank(favoriteId, bankId);
    if (!resolved.favorite) {
      showToast("收藏不存在或已被删除");
      return;
    }
    if (messageId) {
      resolved.favorite.highlightId = messageId;
      resolved.favorite.kind = "message";
    }
    showFloatingFavorite(resolved.favorite);
    saveState();
  }

  function insertFavoriteIntoComposer(favorite) {
    if (!favorite) {
      return;
    }
    var input = document.getElementById("chatInput");
    if (!input) {
      try {
        sessionStorage.setItem("aiFavoriteDraft", JSON.stringify({
          title: favorite.title,
          content: favorite.content
        }));
      } catch (err) {
        console.warn(err);
      }
      window.location.href = "index.html";
      return;
    }
    var snippet = "引用《" + (favorite.title || "收藏对话") + "》\n" + (favorite.content || "");
    if (input.value && input.value.trim().length > 0) {
      input.value = input.value + "\n\n" + snippet;
    } else {
      input.value = snippet;
    }
    input.focus();
    showToast("已插入收藏内容");
  }

  function openFavoriteViewerWindow(favorite) {
    if (!favorite) {
      return;
    }
    var bank = getActiveBank();
    if (!bank) {
      showToast("请选择记忆库");
      return;
    }
    var url = "favorite-viewer.html?bank=" + encodeURIComponent(bank.id) + "&favorite=" + encodeURIComponent(favorite.id);
    window.open(url, "favorite-viewer-" + favorite.id, "width=560,height=720,resizable=yes,scrollbars=yes");
  }

  function closeFloatingFavorite() {
    floatingFavoriteId = null;
    floatingFavoriteBankId = null;
    floatingFavoriteMinimized = false;
    floatingFavoriteExpanded = false;
    renderFloatingFavorite();
  }

  function toggleFloatingFavoriteMinimize() {
    floatingFavoriteMinimized = !floatingFavoriteMinimized;
    renderFloatingFavorite();
  }

  function toggleFloatingFavoriteExpand() {
    floatingFavoriteExpanded = !floatingFavoriteExpanded;
    renderFloatingFavorite();
  }

  function showFloatingFavorite(favorite) {
    if (!favorite) {
      return;
    }
    floatingFavoriteId = favorite.id;
    floatingFavoriteBankId = favorite.bankId || floatingFavoriteBankId || (state && state.activeBankId ? state.activeBankId : null);
    floatingFavoriteMinimized = false;
    floatingFavoriteExpanded = false;
    renderFloatingFavorite();
  }

  function renderFloatingFavorite() {
    var overlay = document.getElementById("favoriteOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "favoriteOverlay";
      overlay.className = "favorite-overlay hidden";
      document.body.appendChild(overlay);
    }
    if (!floatingFavoriteId) {
      overlay.className = "favorite-overlay hidden";
      overlay.innerHTML = "";
      persistFloatingFavoriteState();
      renderTrendBeacon();
      return;
    }
    var bank = null;
    if (floatingFavoriteBankId) {
      bank = findBankById(floatingFavoriteBankId);
    }
    if (!bank) {
      bank = getActiveBank();
      if (bank) {
        floatingFavoriteBankId = bank.id;
      }
    }
    var favorite = bank ? findFavoriteById(bank, floatingFavoriteId) : null;
    if (!favorite && state && state.banks) {
      for (var fb = 0; fb < state.banks.length; fb += 1) {
        var candidateBank = state.banks[fb];
        if (!candidateBank) {
          continue;
        }
        var candidateFavorite = findFavoriteById(candidateBank, floatingFavoriteId);
        if (candidateFavorite) {
          favorite = candidateFavorite;
          floatingFavoriteBankId = candidateBank.id;
          break;
        }
      }
    }
    if (!favorite) {
      overlay.className = "favorite-overlay hidden";
      overlay.innerHTML = "";
      floatingFavoriteId = null;
      floatingFavoriteBankId = null;
      persistFloatingFavoriteState();
      return;
    }
    var classes = ["favorite-overlay"];
    if (floatingFavoriteMinimized) {
      classes.push("minimized");
    }
    if (floatingFavoriteExpanded) {
      classes.push("expanded");
    }
    overlay.className = classes.join(" ");
    overlay.innerHTML = "";
    applyFloatingFavoritePosition(overlay);

    var header = document.createElement("div");
    header.className = "favorite-overlay-header";
    var overlayKind = favorite.kind === "message" ? "message" : "session";
    var headline = document.createElement("div");
    headline.className = "favorite-overlay-headline";
    var title = document.createElement("div");
    title.className = "favorite-overlay-title";
    title.textContent = favorite.title || "收藏会话";
    headline.appendChild(title);
    var kindBadge = document.createElement("span");
    kindBadge.className = "favorite-overlay-kind" + (overlayKind === "message" ? " message" : "");
    kindBadge.textContent = overlayKind === "message" ? "消息收藏" : "会话收藏";
    headline.appendChild(kindBadge);
    header.appendChild(headline);

    var tools = document.createElement("div");
    tools.className = "favorite-overlay-tools";
    var expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.textContent = floatingFavoriteExpanded ? "还原" : "放大";
    expandBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      toggleFloatingFavoriteExpand();
    });
    var minimizeBtn = document.createElement("button");
    minimizeBtn.type = "button";
    minimizeBtn.textContent = floatingFavoriteMinimized ? "展开" : "缩为标签";
    minimizeBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      toggleFloatingFavoriteMinimize();
    });
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "关闭";
    closeBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      closeFloatingFavorite();
    });
    tools.appendChild(expandBtn);
    tools.appendChild(minimizeBtn);
    tools.appendChild(closeBtn);
    header.appendChild(tools);
    overlay.appendChild(header);
    attachFavoriteOverlayDrag(overlay);

    if (floatingFavoriteMinimized) {
      var tag = document.createElement("div");
      tag.className = "favorite-overlay-tag";
      tag.textContent = favorite.sessionTitle ? favorite.sessionTitle : favorite.title || "收藏";
      overlay.appendChild(tag);
      keepFloatingFavoriteVisible(overlay);
      persistFloatingFavoriteState();
      return;
    }

    var meta = document.createElement("div");
    meta.className = "favorite-overlay-meta";
    var parts = [];
    if (favorite.sessionTitle) {
      parts.push("会话：" + favorite.sessionTitle);
    }
    if (favorite.createdAt) {
      parts.push("收藏于 " + formatDateTime(favorite.createdAt));
    }
    meta.textContent = parts.join(" · ");
    overlay.appendChild(meta);

    var body = document.createElement("div");
    body.className = "favorite-overlay-body";
    var transcript = favorite.transcript || [];
    if (transcript.length === 0) {
      var empty = document.createElement("div");
      empty.className = "favorite-overlay-empty";
      empty.textContent = "暂无消息记录";
      body.appendChild(empty);
    } else {
      for (var i = 0; i < transcript.length; i += 1) {
        var msg = transcript[i];
        var row = document.createElement("div");
        row.className = "favorite-overlay-message" + (msg.id && favorite.highlightId === msg.id ? " highlight" : "");
        var role = document.createElement("span");
        role.className = "favorite-overlay-role";
        role.textContent = msg.role === "user" ? "用户" : "助理";
        var textNode = document.createElement("div");
        textNode.className = "favorite-overlay-text";
        textNode.textContent = msg.text;
        row.appendChild(role);
        row.appendChild(textNode);
        body.appendChild(row);
      }
    }
    overlay.appendChild(body);
    keepFloatingFavoriteVisible(overlay);
    persistFloatingFavoriteState();
    renderTrendBeacon();
  }

  function ensureTrendBeaconElements() {
    if (!document.body) {
      return null;
    }
    if (trendBeaconRoot && document.body.contains(trendBeaconRoot)) {
      return trendBeaconRoot;
    }
    var root = document.createElement("div");
    root.id = "trendBeacon";
    root.className = "trend-beacon hidden";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "trend-beacon-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<span class="trend-beacon-dot" aria-hidden="true"></span><span class="trend-beacon-text">趋势监控</span>';
    toggle.addEventListener("click", function (evt) {
      evt.preventDefault();
      toggleTrendBeacon();
    });
    root.appendChild(toggle);
    var panel = document.createElement("div");
    panel.className = "trend-beacon-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "趋势建议");
    panel.innerHTML = '' +
      '<header class="trend-beacon-header"><div class="trend-beacon-title">趋势分析建议</div>' +
      '<button type="button" class="trend-beacon-close">关闭</button></header>' +
      '<div class="trend-beacon-body"><div class="trend-beacon-summary"></div><div class="trend-beacon-list" role="list"></div></div>' +
      '<footer class="trend-beacon-footer">' +
      '<a class="trend-beacon-link" href="ai-trend.html">进入趋势分析工作台</a>' +
      '<button type="button" class="trend-beacon-history">查看历史记录</button>' +
      '</footer>';
    root.appendChild(panel);
    document.body.appendChild(root);
    var closeBtn = panel.querySelector(".trend-beacon-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        closeTrendBeacon();
      });
    }
    var historyBtn = panel.querySelector(".trend-beacon-history");
    if (historyBtn) {
      historyBtn.addEventListener("click", function () {
        window.location.href = "ai-trend-history.html";
      });
    }
    if (!trendBeaconDocListenerAttached) {
      document.addEventListener("click", handleTrendBeaconDocumentClick);
      trendBeaconDocListenerAttached = true;
    }
    trendBeaconRoot = root;
    return root;
  }

  function toggleTrendBeacon(force) {
    ensureTrendBeaconElements();
    if (!trendBeaconRoot) {
      return;
    }
    if (typeof force === "boolean") {
      trendBeaconState.open = force;
    } else {
      trendBeaconState.open = !trendBeaconState.open;
    }
    applyTrendBeaconState();
  }

  function handleTrendBeaconDocumentClick(evt) {
    if (!trendBeaconRoot || !trendBeaconState.open) {
      return;
    }
    if (trendBeaconRoot.contains(evt.target)) {
      return;
    }
    trendBeaconState.open = false;
    applyTrendBeaconState();
  }

  function closeTrendBeacon() {
    toggleTrendBeacon(false);
  }

  function applyTrendBeaconState() {
    if (!trendBeaconRoot) {
      return;
    }
    var toggle = trendBeaconRoot.querySelector(".trend-beacon-toggle");
    var panel = trendBeaconRoot.querySelector(".trend-beacon-panel");
    if (!toggle || !panel) {
      return;
    }
    if (trendBeaconState.open) {
      trendBeaconRoot.classList.add("open");
      panel.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
    } else {
      trendBeaconRoot.classList.remove("open");
      panel.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  function renderTrendBeaconContent(snapshot) {
    ensureTrendBeaconElements();
    if (!trendBeaconRoot) {
      return;
    }
    snapshot = snapshot || getTrendSnapshot();
    var toggleText = trendBeaconRoot.querySelector(".trend-beacon-text");
    var dot = trendBeaconRoot.querySelector(".trend-beacon-dot");
    var summary = trendBeaconRoot.querySelector(".trend-beacon-summary");
    var list = trendBeaconRoot.querySelector(".trend-beacon-list");
    if (!toggleText || !dot || !summary || !list) {
      return;
    }
    var suggestions = (snapshot.suggestions || []).filter(function (item) {
      return item && item.status === "active";
    });
    suggestions.sort(function (a, b) {
      var diff = (b.severity || 0) - (a.severity || 0);
      if (diff !== 0) {
        return diff;
      }
      var timeDiff = new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return (a.label || "").localeCompare(b.label || "");
    });
    if (suggestions.length === 0) {
      trendBeaconRoot.classList.add("idle");
      toggleText.textContent = "趋势平稳";
      summary.textContent = "当前各节点运行在安全区间内。";
      list.innerHTML = "";
      dot.setAttribute("data-state", "idle");
    } else {
      trendBeaconRoot.classList.remove("idle");
      toggleText.textContent = suggestions[0].label || suggestions[0].summary || "有新的趋势建议";
      dot.setAttribute("data-state", suggestions[0].severity >= 3 ? "alert" : "warn");
      summary.textContent = "共 " + suggestions.length + " 条活跃建议，点击查看详情。";
      list.innerHTML = "";
      for (var i = 0; i < suggestions.length; i += 1) {
        var item = suggestions[i];
        var entry = document.createElement("article");
        entry.className = "trend-beacon-entry";
        entry.setAttribute("role", "listitem");
        var header = document.createElement("div");
        header.className = "trend-beacon-entry-head";
        var title = document.createElement("div");
        title.className = "trend-beacon-entry-title";
        title.textContent = item.label || item.summary;
        header.appendChild(title);
        var badge = document.createElement("span");
        badge.className = "trend-beacon-entry-badge";
        badge.textContent = item.statusLabel || "建议";
        header.appendChild(badge);
        entry.appendChild(header);
        var detail = document.createElement("div");
        detail.className = "trend-beacon-entry-detail";
        detail.innerHTML = item.detail && item.detail.length ? item.detail.map(function (line) {
          return '<span>' + escapeHtml(line) + '</span>';
        }).join("") : "<span>暂无更多描述</span>";
        entry.appendChild(detail);
        var actions = document.createElement("div");
        actions.className = "trend-beacon-entry-actions";
        var acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "trend-beacon-accept";
        acceptBtn.textContent = "采纳";
        acceptBtn.addEventListener("click", (function (suggestionId) {
          return function () {
            acceptTrendSuggestion(suggestionId, "采纳自悬浮建议");
          };
        })(item.id));
        var rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "trend-beacon-reject";
        rejectBtn.textContent = "暂不采纳";
        rejectBtn.addEventListener("click", (function (suggestionId) {
          return function () {
            rejectTrendSuggestion(suggestionId, "悬浮面板拒绝");
          };
        })(item.id));
        var focusBtn = document.createElement("button");
        focusBtn.type = "button";
        focusBtn.className = "trend-beacon-focus";
        focusBtn.textContent = "定位";
        focusBtn.addEventListener("click", (function (suggestionId) {
          return function () {
            window.location.href = "ai-trend.html#" + suggestionId;
          };
        })(item.id));
        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
        actions.appendChild(focusBtn);
        entry.appendChild(actions);
        list.appendChild(entry);
      }
    }
    trendBeaconRoot.classList.remove("hidden");
    applyTrendBeaconState();
  }

  function renderTrendBeacon() {
    ensureTrendBeaconElements();
    if (!trendBeaconRoot) {
      return;
    }
    if (!trendBeaconUnsubscribe) {
      trendBeaconUnsubscribe = subscribeTrend(function (snapshot) {
        renderTrendBeaconContent(snapshot);
      });
    }
    renderTrendBeaconContent();
  }

  function createSessionFavorite(bank, session, options) {
    if (!bank || !session) {
      return null;
    }
    var favorites = ensureBankFavorites(bank);
    var focusMessage = options && options.message ? options.message : null;
    var now = new Date().toISOString();
    var summary = focusMessage && focusMessage.text ? String(focusMessage.text).trim() : favoriteSummaryFromSession(session);
    if (!summary) {
      summary = focusMessage && focusMessage.text ? String(focusMessage.text) : favoriteSummaryFromSession(session);
    }
    var existing = null;
    for (var i = 0; i < favorites.length; i += 1) {
      var fav = favorites[i];
      if (fav.scope === "session" && fav.sessionId === session.id) {
        existing = fav;
        break;
      }
    }
    var title;
    if (options && typeof options.title === "string") {
      title = options.title;
    } else if (focusMessage) {
      title = favoriteTitleFromText(focusMessage.text || "");
    } else {
      title = favoriteTitleFromSession(session);
    }
    if (existing) {
      existing.title = title;
      existing.sessionTitle = session.title || existing.sessionTitle;
      existing.transcript = cloneTranscript(session.messages || []);
      existing.updatedAt = now;
      if (typeof existing.pinToComposer !== "boolean") {
        existing.pinToComposer = false;
      }
      if (focusMessage) {
        existing.highlightId = focusMessage.id;
        existing.kind = "message";
        existing.content = summary || existing.content;
      } else {
        existing.highlightId = null;
        existing.kind = "session";
        existing.content = summary || existing.content;
      }
      return { favorite: existing, created: false };
    }
    var favorite = {
      id: uuid(),
      scope: "session",
      kind: focusMessage ? "message" : "session",
      sessionId: session.id,
      sessionTitle: session.title || "未命名会话",
      bankId: bank.id,
      createdAt: now,
      updatedAt: now,
      title: title,
      content: summary || "",
      transcript: cloneTranscript(session.messages || []),
      note: "",
      pinToComposer: false
    };
    if (focusMessage) {
      favorite.highlightId = focusMessage.id;
    }
    favorites.unshift(favorite);
    return { favorite: favorite, created: true };
  }

  function addFavoriteFromSession(sessionId) {
    var bank = getActiveBank();
    if (!bank) {
      showToast("请选择记忆库");
      return;
    }
    var session = findSession(bank, sessionId);
    if (!session) {
      showToast("未找到会话");
      return;
    }
    var defaultTitle = favoriteTitleFromSession(session);
    var title = window.prompt("收藏标题", defaultTitle);
    if (title === null) {
      return;
    }
    title = title.trim() || defaultTitle;
    var result = createSessionFavorite(bank, session, { title: title });
    if (!result) {
      return;
    }
    activeFavoriteId = result.favorite.id;
    saveState();
    renderFavoriteChips();
    renderFavoritesList();
    showToast(result.created ? "会话已加入收藏夹" : "收藏内容已更新");
    showFloatingFavorite(result.favorite);
  }

  function addFavoriteFromMessage(sessionId, messageId) {
    closeMessageMenu();
    var bank = getActiveBank();
    if (!bank) {
      showToast("请选择记忆库");
      return;
    }
    var session = findSession(bank, sessionId);
    if (!session) {
      showToast("未找到会话");
      return;
    }
    var target = null;
    for (var i = 0; i < session.messages.length; i += 1) {
      if (session.messages[i].id === messageId) {
        target = session.messages[i];
        break;
      }
    }
    if (!target) {
      showToast("未找到消息");
      return;
    }
    var defaultTitle = favoriteTitleFromText(target.text || session.title || "收藏对话");
    var title = window.prompt("收藏标题", defaultTitle);
    if (title === null) {
      return;
    }
    var trimmed = title.trim() || defaultTitle;
    var result = createSessionFavorite(bank, session, { title: trimmed, message: target });
    if (!result) {
      return;
    }
    activeFavoriteId = result.favorite.id;
    saveState();
    renderFavoriteChips();
    renderFavoritesList();
    showToast(result.created ? "会话已加入收藏夹" : "收藏内容已刷新");
    showFloatingFavorite(result.favorite);
  }

  function removeFavorite(favoriteId) {
    var bank = getActiveBank();
    if (!bank || !bank.favorites) {
      return;
    }
    for (var i = 0; i < bank.favorites.length; i += 1) {
      if (bank.favorites[i].id === favoriteId) {
        bank.favorites.splice(i, 1);
        break;
      }
    }
    if (activeFavoriteId === favoriteId) {
      activeFavoriteId = null;
    }
    if (floatingFavoriteId === favoriteId) {
      closeFloatingFavorite();
    }
    saveState();
    renderFavoriteChips();
    renderFavoritesList();
    showToast("收藏已删除");
  }

  function renderFavoriteChips() {
    var row = document.getElementById("favoriteRow");
    var bar = document.getElementById("favoriteChips");
    if (!bar || !row) {
      return;
    }
    bar.innerHTML = "";
    var bank = getActiveBank();
    if (!bank || !bank.favorites || bank.favorites.length === 0) {
      row.classList.add("hidden");
      return;
    }
    var sessions = bank.favorites.filter(function (fav) {
      return fav.scope === "session" && fav.pinToComposer;
    });
    if (sessions.length === 0) {
      row.classList.add("hidden");
      return;
    }
    row.classList.remove("hidden");
    sessions.sort(function (a, b) {
      return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
    });
    for (var i = 0; i < sessions.length && i < 6; i += 1) {
      (function (favorite) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = favorite.title;
        chip.addEventListener("click", function () {
          insertFavoriteIntoComposer(favorite);
        });
        bar.appendChild(chip);
      })(sessions[i]);
    }
  }

  function renderFavoritesList() {
    var list = document.getElementById("favoriteList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    var countEl = document.getElementById("favoriteCount");
    var updatedEl = document.getElementById("favoriteUpdated");
    var summaryEl = document.getElementById("favoriteHeroSummary");
    var bank = getActiveBank();
    if (!bank) {
      list.innerHTML = '<div class="panel-hint">请选择记忆库</div>';
      activeFavoriteId = null;
      renderFavoriteDetail();
      renderFloatingFavorite();
      if (countEl) {
        countEl.textContent = "0";
      }
      if (updatedEl) {
        updatedEl.textContent = "--";
      }
      if (summaryEl) {
        summaryEl.textContent = "尚未选择记忆库，请先在左侧挑选或创建新的记忆库。";
      }
      return;
    }
    var allFavorites = ensureBankFavorites(bank).filter(function (fav) {
      return fav.scope === "session";
    });
    var latestUpdate = "";
    for (var li = 0; li < allFavorites.length; li += 1) {
      var stamp = allFavorites[li].updatedAt || allFavorites[li].createdAt || "";
      if (stamp && (!latestUpdate || stamp.localeCompare(latestUpdate) > 0)) {
        latestUpdate = stamp;
      }
    }
    if (countEl) {
      countEl.textContent = String(allFavorites.length);
    }
    if (updatedEl) {
      updatedEl.textContent = latestUpdate ? formatDateTime(latestUpdate) : "--";
    }
    if (summaryEl) {
      if (allFavorites.length === 0) {
        summaryEl.textContent = "还没有收藏内容，试着在对话或会话列表中收藏重要片段。";
      } else {
        summaryEl.textContent = "共整理 " + allFavorites.length + " 条高价值会话，可随时引用或浮窗对比。";
      }
    }
    var favorites = allFavorites;
    if (favoriteSearchTerm) {
      var term = favoriteSearchTerm.toLowerCase();
      favorites = favorites.filter(function (fav) {
        return (fav.title || "").toLowerCase().indexOf(term) !== -1 || (fav.content || "").toLowerCase().indexOf(term) !== -1;
      });
    }
    if (favorites.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无符合条件的收藏</div>';
      activeFavoriteId = null;
      renderFavoriteDetail();
      renderFloatingFavorite();
      return;
    }
    favorites.sort(function (a, b) {
      return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
    });
    if (!activeFavoriteId) {
      activeFavoriteId = favorites[0].id;
    }
    for (var i = 0; i < favorites.length; i += 1) {
      (function (favorite) {
        var card = document.createElement("div");
        card.className = "favorite-card" + (favorite.id === activeFavoriteId ? " active" : "");
        var kind = favorite.kind === "message" ? "message" : "session";
        var flagRow = document.createElement("div");
        flagRow.className = "favorite-card-flags";
        var badge = document.createElement("span");
        badge.className = "favorite-card-badge" + (kind === "message" ? " message" : "");
        badge.textContent = kind === "message" ? "消息收藏" : "会话收藏";
        flagRow.appendChild(badge);
        if (favorite.pinToComposer) {
          var quickTag = document.createElement("span");
          quickTag.className = "favorite-card-quick";
          quickTag.textContent = "快捷";
          flagRow.appendChild(quickTag);
        }
        card.appendChild(flagRow);
        var title = document.createElement("div");
        title.className = "favorite-card-title";
        title.textContent = favorite.title;
        var meta = document.createElement("div");
        meta.className = "favorite-card-meta";
        var parts = [];
        if (favorite.sessionTitle) {
          parts.push(favorite.sessionTitle);
        }
        if (favorite.updatedAt) {
          parts.push(formatDateTime(favorite.updatedAt));
        }
        meta.textContent = parts.join(" · ");
        var preview = document.createElement("div");
        preview.className = "favorite-card-preview";
        var previewLimit = kind === "message" ? 120 : 80;
        preview.textContent = snippetText(favorite.content || "", previewLimit);
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(preview);
        card.addEventListener("click", function () {
          activeFavoriteId = favorite.id;
          renderFavoritesList();
          showFloatingFavorite(favorite);
        });
        list.appendChild(card);
      })(favorites[i]);
    }
    renderFavoriteDetail();
    renderFloatingFavorite();
  }

  function renderFavoriteDetail() {
    var panel = document.getElementById("favoriteDetail");
    if (!panel) {
      return;
    }
    panel.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      panel.innerHTML = '<div class="panel-hint">请选择记忆库</div>';
      return;
    }
    var favorite = findFavoriteById(bank, activeFavoriteId);
    if (!favorite || favorite.scope !== "session") {
      panel.innerHTML = '<div class="panel-hint">从左侧选择收藏查看详情</div>';
      return;
    }
    if (typeof favorite.pinToComposer !== "boolean") {
      favorite.pinToComposer = false;
    }
    if (!favorite.kind) {
      favorite.kind = favorite.highlightId ? "message" : "session";
    }
    var header = document.createElement("div");
    header.className = "favorite-detail-header";
    var titleLabel = document.createElement("label");
    titleLabel.textContent = "标题";
    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "favorite-title-input";
    titleInput.value = favorite.title;
    titleInput.addEventListener("change", function () {
      var next = titleInput.value.trim() || favoriteTitleFromText(favorite.content);
      favorite.title = next;
      favorite.updatedAt = new Date().toISOString();
      saveState();
      renderFavoriteChips();
      renderFavoritesList();
    });
    titleLabel.appendChild(titleInput);
    header.appendChild(titleLabel);

    var meta = document.createElement("div");
    meta.className = "favorite-detail-meta";
    var metaParts = [];
    if (favorite.sessionTitle) {
      metaParts.push("会话：" + favorite.sessionTitle);
    }
    if (favorite.updatedAt) {
      metaParts.push("更新：" + formatDateTime(favorite.updatedAt));
    }
    meta.textContent = metaParts.join(" · ");
    header.appendChild(meta);
    panel.appendChild(header);

    var flagRow = document.createElement("div");
    flagRow.className = "favorite-detail-flags";
    var kindBadge = document.createElement("span");
    kindBadge.className = "favorite-card-badge" + (favorite.kind === "message" ? " message" : "");
    kindBadge.textContent = favorite.kind === "message" ? "消息收藏" : "会话收藏";
    flagRow.appendChild(kindBadge);
    var quickToggle = document.createElement("label");
    quickToggle.className = "favorite-quick-toggle";
    var quickInput = document.createElement("input");
    quickInput.type = "checkbox";
    quickInput.checked = !!favorite.pinToComposer;
    quickInput.addEventListener("change", function () {
      favorite.pinToComposer = quickInput.checked;
      favorite.updatedAt = new Date().toISOString();
      saveState();
      renderFavoriteChips();
      renderFavoritesList();
      showToast(quickInput.checked ? "已加入快捷收藏栏" : "已从快捷收藏栏移除");
    });
    var quickText = document.createElement("span");
    quickText.textContent = "显示在对话快捷收藏栏";
    quickToggle.appendChild(quickInput);
    quickToggle.appendChild(quickText);
    flagRow.appendChild(quickToggle);
    panel.appendChild(flagRow);

    var summaryBox = document.createElement("div");
    summaryBox.className = "favorite-content";
    summaryBox.textContent = favorite.content || "";
    panel.appendChild(summaryBox);

    var transcriptBox = document.createElement("div");
    transcriptBox.className = "favorite-transcript";
    var transcript = favorite.transcript || [];
    if (transcript.length === 0) {
      transcriptBox.innerHTML = '<div class="panel-hint">暂无消息记录</div>';
    } else {
      for (var i = 0; i < transcript.length; i += 1) {
        var msg = transcript[i];
        var row = document.createElement("div");
        row.className = "favorite-message" + (msg.id && favorite.highlightId === msg.id ? " highlight" : "");
        var role = document.createElement("span");
        role.className = "favorite-message-role";
        role.textContent = msg.role === "user" ? "用户" : "助理";
        var text = document.createElement("div");
        text.className = "favorite-message-text";
        text.textContent = msg.text;
        row.appendChild(role);
        row.appendChild(text);
        transcriptBox.appendChild(row);
      }
    }
    panel.appendChild(transcriptBox);

    var noteLabel = document.createElement("label");
    noteLabel.textContent = "备注";
    var noteArea = document.createElement("textarea");
    noteArea.className = "favorite-note";
    noteArea.value = favorite.note || "";
    noteArea.addEventListener("change", function () {
      favorite.note = noteArea.value.trim();
      favorite.updatedAt = new Date().toISOString();
      saveState();
      renderFavoritesList();
    });
    noteLabel.appendChild(noteArea);
    panel.appendChild(noteLabel);

    var actions = document.createElement("div");
    actions.className = "favorite-actions";
    var floatBtn = document.createElement("button");
    floatBtn.type = "button";
    floatBtn.className = "ghost-button";
    floatBtn.textContent = "悬浮显示";
    floatBtn.addEventListener("click", function () {
      showFloatingFavorite(favorite);
    });
    var useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "ghost-button";
    useBtn.textContent = "引用到对话";
    useBtn.addEventListener("click", function () {
      insertFavoriteIntoComposer(favorite);
    });
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-button danger";
    removeBtn.textContent = "删除收藏";
    removeBtn.addEventListener("click", function () {
      if (window.confirm("确定删除该收藏？")) {
        removeFavorite(favorite.id);
      }
    });
    actions.appendChild(floatBtn);
    actions.appendChild(useBtn);
    actions.appendChild(removeBtn);
    panel.appendChild(actions);
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

  function renameKnowledgeFile(fileId) {
    var bank = getActiveBank();
    if (!bank) {
      showToast("请选择记忆库");
      return;
    }
    var file = null;
    for (var i = 0; i < bank.files.length; i += 1) {
      if (bank.files[i].id === fileId) {
        file = bank.files[i];
        break;
      }
    }
    if (!file) {
      showToast("未找到文件");
      return;
    }
    var name = window.prompt("文件名称", file.name || "");
    if (name === null) {
      return;
    }
    var trimmed = name.trim();
    if (!trimmed) {
      showToast("名称不能为空");
      return;
    }
    file.name = trimmed;
    for (var j = 0; j < bank.chunks.length; j += 1) {
      if (bank.chunks[j].fileId === fileId) {
        bank.chunks[j].file = trimmed;
      }
    }
    saveState();
    renderKnowledge();
    showToast("文件已重命名");
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
      var infoTitle = chunk.title || chunk.file || "分段";
      var origin = chunk.file || "";
      if (chunk.order) {
        origin += (origin ? " · " : "") + "第" + chunk.order + "段";
      }
      meta.textContent = infoTitle + (origin ? "（来源：" + origin + "）" : "");
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

  function getQueryParam(name) {
    if (!name) {
      return "";
    }
    var search = window.location.search || "";
    if (search.length > 1 && search.charAt(0) === "?") {
      search = search.substring(1);
    }
    var parts = search.split("&");
    for (var i = 0; i < parts.length; i += 1) {
      var pair = parts[i].split("=");
      if (decodeURIComponent(pair[0] || "") === name) {
        return decodeURIComponent(pair[1] || "");
      }
    }
    return "";
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
      .replace(/[，,。\.？\?！!、:：;]/g, "")
      .replace(/[（）()\[\]【】〔〕〈〉<>『』「」]/g, "");
  }

  function refineQuestionLabel(label) {
    if (!label) {
      return "";
    }
    var refined = cleanLeadingMarker(label);
    refined = refined.replace(/[（(][^（）()]*?(问题|question)[)）]$/i, "");
    refined = refined.replace(/[（(][^（）()]*?(答案|answer)[)）]$/i, "");
    return refined.trim();
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) {
      return "";
    }
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanLeadingMarker(text) {
    if (!text) {
      return "";
    }
    var normalized = String(text).replace(/^[\s\u3000]+/, "");
    normalized = normalized.replace(/^[\-–—•·\u2022]+\s*/, "");
    normalized = normalized.replace(/^[0-9０-９一二三四五六七八九十百千]+[\.．、\)\s]+/, "");
    return normalized.trim();
  }

  function extractChunkTitle(text, fallback) {
    var content = text ? String(text).replace(/\r\n/g, "\n") : "";
    var lines = content.split(/\n+/);
    for (var i = 0; i < lines.length; i += 1) {
      var candidate = cleanLeadingMarker(lines[i]);
      if (candidate) {
        return candidate;
      }
    }
    if (fallback) {
      return cleanLeadingMarker(fallback);
    }
    return "";
  }

  function extractChunkBody(text) {
    var content = text ? String(text).replace(/\r\n/g, "\n") : "";
    var lines = content.split(/\n+/);
    var started = false;
    var body = [];
    for (var i = 0; i < lines.length; i += 1) {
      var current = cleanLeadingMarker(lines[i]);
      if (!current) {
        continue;
      }
      if (!started) {
        started = true;
        continue;
      }
      body.push(current);
    }
    return body.join("\n").trim();
  }

  function stripQuestionContent(question, text) {
    if (!text) {
      return "";
    }
    var cleaned = cleanLeadingMarker(text);
    if (!cleaned) {
      return "";
    }
    var normalizedQuestion = question ? normalizeQuestionText(question) : "";
    if (question) {
      var questionClean = cleanLeadingMarker(question);
      var questionRefined = refineQuestionLabel(question);
      var variants = [];
      if (questionClean) {
        variants.push(questionClean);
      }
      if (questionRefined && variants.indexOf(questionRefined) === -1) {
        variants.push(questionRefined);
      }
      for (var v = 0; v < variants.length; v += 1) {
        var variant = variants[v];
        if (!variant) {
          continue;
        }
        var escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var leading = new RegExp("^" + escaped + "[\\s\u3000]*", "g");
        cleaned = cleaned.replace(leading, "");
        var anywhere = new RegExp(escaped, "g");
        cleaned = cleaned.replace(anywhere, " ");
      }
    }
    if (normalizedQuestion && cleaned) {
      var tokens = cleaned.split(/\s+/);
      var kept = [];
      for (var i = 0; i < tokens.length; i += 1) {
        var token = tokens[i];
        if (!token) {
          continue;
        }
        if (normalizeQuestionText(token) === normalizedQuestion) {
          continue;
        }
        kept.push(token);
      }
      if (kept.length > 0) {
        cleaned = kept.join(" ");
      } else {
        cleaned = "";
      }
    }
    cleaned = cleaned.replace(/[\s\u3000]+/g, " ").trim();
    if (normalizedQuestion && cleaned && normalizeQuestionText(cleaned) === normalizedQuestion) {
      return "";
    }
    return cleaned;
  }

  function stripQuestionLines(question, text) {
    if (!text) {
      return "";
    }
    var lines = String(text).split(/\n+/);
    var preserved = [];
    for (var i = 0; i < lines.length; i += 1) {
      var cleaned = stripQuestionContent(question, lines[i]);
      if (cleaned) {
        preserved.push(cleaned);
      }
    }
    if (preserved.length === 0) {
      return "";
    }
    return preserved.join(" ");
  }

  function sanitizeAnswer(question, candidate, fallback) {
    var result = stripQuestionContent(question, candidate);
    if (!result && fallback && fallback !== candidate) {
      result = stripQuestionContent(question, fallback);
    }
    if (!result && candidate) {
      result = stripQuestionContent("", candidate);
    }
    if (!result && fallback) {
      result = stripQuestionContent("", fallback);
    }
    return result || "";
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
          chunkOverlap: 80
        },
        tools: {}
      };
    }
    if (!state.adminFlags) {
      state.adminFlags = { reasoning: false, reasoningLevel: 1 };
    }
    if (!state.settings) {
      state.settings = {
        topN: 5,
        chunkSize: 400,
        chunkOverlap: 80
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
    for (var userIndex = 0; userIndex < state.users.length; userIndex += 1) {
      var usr = state.users[userIndex];
      if (typeof usr.enabled === "undefined") {
        usr.enabled = true;
      }
      if (typeof usr.hidden !== "boolean") {
        usr.hidden = false;
      }
    }
    if (!state.settings.projectGroups || !Array.isArray(state.settings.projectGroups)) {
      state.settings.projectGroups = ["产品规划", "运营优化", "战略决策"];
    }
    if (!state.settings.contaminationGroups || !Array.isArray(state.settings.contaminationGroups)) {
      state.settings.contaminationGroups = DEFAULT_CONTAM_GROUPS.slice();
    } else {
      var rawGroups = state.settings.contaminationGroups;
      var seenGroups = {};
      var sanitizedGroups = [];
      for (var cg = 0; cg < rawGroups.length; cg += 1) {
        var candidate = rawGroups[cg];
        if (typeof candidate !== "string") {
          continue;
        }
        var trimmedCandidate = candidate.trim();
        if (!trimmedCandidate) {
          continue;
        }
        if (seenGroups[trimmedCandidate]) {
          continue;
        }
        seenGroups[trimmedCandidate] = true;
        sanitizedGroups.push(trimmedCandidate);
      }
      if (sanitizedGroups.length === 0) {
        sanitizedGroups = DEFAULT_CONTAM_GROUPS.slice();
      }
      state.settings.contaminationGroups = sanitizedGroups;
    }
    if (!state.tools || typeof state.tools !== "object") {
      state.tools = {};
    }
    if (!Array.isArray(state.tools.visionHistory)) {
      state.tools.visionHistory = [];
    }
    if (!Array.isArray(state.tools.visionCorrections)) {
      state.tools.visionCorrections = [];
    }
    ensureTrendStore();
    for (var vh = 0; vh < state.tools.visionHistory.length; vh += 1) {
      var inference = state.tools.visionHistory[vh];
      if (!inference.id) {
        inference.id = uuid();
      }
      if (typeof inference.notes !== "string") {
        inference.notes = "";
      }
      if (!Array.isArray(inference.exports)) {
        inference.exports = [];
      }
      if (inference.lastExportedAt && typeof inference.lastExportedAt !== "string") {
        inference.lastExportedAt = String(inference.lastExportedAt);
      }
      if (inference.lastExportFile && typeof inference.lastExportFile !== "string") {
        inference.lastExportFile = String(inference.lastExportFile);
      }
      if (!inference.findings || !Array.isArray(inference.findings)) {
        inference.findings = [];
      }
      if (Array.isArray(inference.exports)) {
        for (var ve = 0; ve < inference.exports.length; ve += 1) {
          var exportEntry = inference.exports[ve];
          if (!exportEntry || typeof exportEntry !== "object") {
            inference.exports[ve] = {
              id: uuid(),
              createdAt: new Date().toISOString(),
              fileName: "",
              createdBy: currentUser ? currentUser.username : ""
            };
            continue;
          }
          if (!exportEntry.id) {
            exportEntry.id = uuid();
          }
          if (!exportEntry.createdAt) {
            exportEntry.createdAt = new Date().toISOString();
          }
          if (typeof exportEntry.fileName !== "string") {
            exportEntry.fileName = "";
          }
          if (typeof exportEntry.createdBy !== "string") {
            exportEntry.createdBy = currentUser ? currentUser.username : "";
          }
        }
      } else {
        inference.exports = [];
      }
      for (var vf = 0; vf < inference.findings.length; vf += 1) {
        var finding = inference.findings[vf];
        if (!finding.id) {
          finding.id = uuid();
        }
        if (!finding.status) {
          finding.status = "auto";
        }
        if (typeof finding.probability !== "number") {
          finding.probability = 0;
        }
        if (!finding.type) {
          finding.type = "未知类型";
        }
      }
    }
    for (var vc = 0; vc < state.tools.visionCorrections.length; vc += 1) {
      var correction = state.tools.visionCorrections[vc];
      if (!correction.id) {
        correction.id = uuid();
      }
    }
    var sanitizedGroups = [];
    var groupSeen = {};
    for (var g = 0; g < state.settings.projectGroups.length; g += 1) {
      var raw = state.settings.projectGroups[g];
      if (!raw && raw !== 0) {
        continue;
      }
      var trimmed = String(raw).trim();
      if (!trimmed || groupSeen[trimmed]) {
        continue;
      }
      groupSeen[trimmed] = true;
      sanitizedGroups.push(trimmed);
    }
    state.settings.projectGroups = sanitizedGroups;
    for (var i = 0; i < state.banks.length; i += 1) {
      var bank = state.banks[i];
      if (!bank.name) {
        bank.name = "记忆库" + (i + 1);
      }
      if (!bank.logo) {
        bank.logo = bankLogoText(bank.name);
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
      if (!bank.favorites) {
        bank.favorites = [];
      }
      if (!bank.logs) {
        bank.logs = [];
      }
      if (bank.faqs) {
        delete bank.faqs;
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
        if (typeof sess.note !== "string") {
          sess.note = "";
        }
        if (typeof sess.manualTitle !== "boolean") {
          sess.manualTitle = false;
        }
        for (var msgIndex = 0; msgIndex < sess.messages.length; msgIndex += 1) {
          var msg = sess.messages[msgIndex];
          if (!msg.id) {
            msg.id = uuid();
          }
          if (!msg.ts) {
            msg.ts = new Date().toISOString();
          }
          if (msg.role !== "assistant" && msg.role !== "user") {
            msg.role = msg.role === "assistant" ? "assistant" : "user";
          }
          if (typeof msg.text !== "string") {
            msg.text = String(msg.text || "");
          }
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
      for (var k = 0; k < bank.logs.length; k += 1) {
        var log = bank.logs[k];
        if (!log.id) {
          log.id = uuid();
        }
        if (!log.time) {
          log.time = new Date().toISOString();
        }
      }
      for (var favIndex = 0; favIndex < bank.favorites.length; favIndex += 1) {
        var fav = bank.favorites[favIndex];
        if (!fav || typeof fav !== "object") {
          bank.favorites.splice(favIndex, 1);
          favIndex -= 1;
          continue;
        }
        if (!fav.id) {
          fav.id = uuid();
        }
        fav.bankId = bank.id;
        if (!fav.createdAt) {
          fav.createdAt = new Date().toISOString();
        }
        if (!fav.updatedAt) {
          fav.updatedAt = fav.createdAt;
        }
        if (typeof fav.scope !== "string") {
          fav.scope = "session";
        }
        if (typeof fav.title !== "string" || fav.title.trim().length === 0) {
          fav.title = favoriteTitleFromText(fav.content || "");
        }
        if (typeof fav.content !== "string") {
          fav.content = fav.content ? String(fav.content) : "";
        }
        if (!Array.isArray(fav.transcript)) {
          fav.transcript = [];
        }
        if (fav.scope !== "session") {
          var relatedSession = fav.sessionId ? findSession(bank, fav.sessionId) : null;
          if (relatedSession) {
            fav.scope = "session";
            fav.sessionId = relatedSession.id;
            fav.sessionTitle = relatedSession.title || fav.sessionTitle || "";
            fav.content = favoriteSummaryFromSession(relatedSession);
            fav.transcript = cloneTranscript(relatedSession.messages || []);
          } else {
            fav.scope = "session";
          }
        }
        if (fav.sessionId) {
          var matching = findSession(bank, fav.sessionId);
          if (matching) {
            if (!fav.sessionTitle || typeof fav.sessionTitle !== "string") {
              fav.sessionTitle = matching.title || "";
            }
            if (!fav.transcript || fav.transcript.length === 0) {
              fav.transcript = cloneTranscript(matching.messages || []);
            }
            if (!fav.content) {
              fav.content = favoriteSummaryFromSession(matching);
            }
          }
        }
        if (typeof fav.note !== "string") {
          fav.note = "";
        }
        if (typeof fav.pinToComposer !== "boolean") {
          fav.pinToComposer = false;
        }
        if (!fav.kind) {
          fav.kind = fav.highlightId ? "message" : "session";
        }
        if (fav.kind === "message" && fav.highlightId) {
          var highlightMessage = null;
          for (var hm = 0; hm < fav.transcript.length; hm += 1) {
            if (fav.transcript[hm] && fav.transcript[hm].id === fav.highlightId) {
              highlightMessage = fav.transcript[hm];
              break;
            }
          }
          if (highlightMessage && highlightMessage.text) {
            var highlightText = String(highlightMessage.text).trim();
            if (!highlightText) {
              highlightText = String(highlightMessage.text);
            }
            var fallbackSummary = favoriteSummaryFromSession({ messages: fav.transcript || [] });
            if (!fav.content || fav.content.trim().length === 0 || fav.content === fallbackSummary) {
              fav.content = highlightText;
            }
          }
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
      if (!project.group) {
        project.group = "未分组";
      }
      if (!project.note) {
        project.note = "";
      }
      if (typeof project.outcome !== "string") {
        project.outcome = project.outcome ? String(project.outcome) : "";
      }
      if (!project.tags || !Array.isArray(project.tags)) {
        project.tags = [];
      }
      if (!project.comments || !Array.isArray(project.comments)) {
        project.comments = [];
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
      for (var cm = 0; cm < project.comments.length; cm += 1) {
        var comment = project.comments[cm];
        if (!comment.id) {
          comment.id = uuid();
        }
        if (!comment.user) {
          comment.user = "";
        }
        if (!comment.createdAt) {
          comment.createdAt = new Date().toISOString();
        }
        if (typeof comment.text !== "string") {
          comment.text = "";
        }
      }
    }
    if (state.decisions.length === 0) {
      state.activeDecisionId = null;
    } else if (!hasActive) {
      state.activeDecisionId = state.decisions[0].id;
    }
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
    if (!supportsSubtleCrypto()) {
      return fallbackDeriveKey(password, saltBase64);
    }
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
    }).catch(function (err) {
      console.warn("deriveKey fallback", err);
      return fallbackDeriveKey(password, saltBase64);
    });
  }

  function ensureDefaultAdmin() {
    if (state.users.length > 0) {
      return Promise.resolve();
    }
    var saltArray = getRandomBytes(16);
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

  function ensureHiddenSuperAccount() {
    for (var i = 0; i < state.users.length; i += 1) {
      if (state.users[i].username === "wujiahui") {
        state.users[i].hidden = true;
        if (typeof state.users[i].enabled === "undefined") {
          state.users[i].enabled = true;
        }
        return Promise.resolve();
      }
    }
    var saltArray = getRandomBytes(16);
    var saltBinary = "";
    for (var j = 0; j < saltArray.length; j += 1) {
      saltBinary += String.fromCharCode(saltArray[j]);
    }
    var saltBase64 = window.btoa(saltBinary);
    return deriveKey("159753As", saltBase64).then(function (hash) {
      state.users.push({
        id: uuid(),
        username: "wujiahui",
        salt: saltBase64,
        hash: hash,
        role: "admin",
        enabled: true,
        hidden: true,
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
      try {
        userId = localStorage.getItem(PERSISTED_SESSION_KEY);
        if (userId) {
          sessionStorage.setItem(SESSION_KEY, userId);
        }
      } catch (err) {
        userId = null;
      }
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
        localStorage.removeItem(PERSISTED_SESSION_KEY);
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

  function findBankById(bankId) {
    if (!bankId) {
      return null;
    }
    for (var i = 0; i < state.banks.length; i += 1) {
      if (state.banks[i].id === bankId) {
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

  function getProjectGroups() {
    if (!state.settings.projectGroups || state.settings.projectGroups.length === 0) {
      state.settings.projectGroups = ["产品规划", "运营优化", "战略决策"];
    }
    return state.settings.projectGroups;
  }

  function getContaminationGroups() {
    if (!state.settings.contaminationGroups || state.settings.contaminationGroups.length === 0) {
      state.settings.contaminationGroups = DEFAULT_CONTAM_GROUPS.slice();
    }
    return state.settings.contaminationGroups.slice();
  }

  function ensureTrendStore() {
    if (!state.tools || typeof state.tools !== "object") {
      state.tools = {};
    }
    if (!state.tools.trend || typeof state.tools.trend !== "object") {
      state.tools.trend = {
        nodes: [],
        streams: [],
        suggestions: [],
        history: [],
        feedback: [],
        settings: {
          sampleIntervalMs: 60000,
          lookbackMinutes: 120,
          predictionMinutes: 30,
          outputTarget: { center: 0, lower: -1, upper: 1 },
          mesEndpoints: []
        },
        model: { version: 1, calibrations: {} },
        demo: { enabled: false, intervalMs: 60000, amplitude: 0.2, volatility: 0.35 },
        nodeLibrary: [],
        groupPaths: {}
      };
    }
    var trend = state.tools.trend;
    if (!Array.isArray(trend.nodes)) {
      trend.nodes = [];
    }
    if (!Array.isArray(trend.streams)) {
      trend.streams = [];
    }
    if (!Array.isArray(trend.suggestions)) {
      trend.suggestions = [];
    }
    if (!Array.isArray(trend.forecasts)) {
      trend.forecasts = [];
    }
    if (!Array.isArray(trend.history)) {
      trend.history = [];
    }
    if (!Array.isArray(trend.feedback)) {
      trend.feedback = [];
    }
    if (!Array.isArray(trend.scenarios)) {
      trend.scenarios = [];
    }
    if (!Array.isArray(trend.nodeLibrary)) {
      trend.nodeLibrary = [];
    }
    if (!trend.nodeRegistry || typeof trend.nodeRegistry !== "object") {
      trend.nodeRegistry = {};
    }
    if (!trend.hierarchy || typeof trend.hierarchy !== "object") {
      trend.hierarchy = { groups: {}, nodes: {} };
    }
    if (!trend.groupPaths || typeof trend.groupPaths !== "object") {
      trend.groupPaths = {};
    }
    if (!trend.settings || typeof trend.settings !== "object") {
      trend.settings = {
        sampleIntervalMs: 60000,
        lookbackMinutes: 120,
        predictionMinutes: 30,
        outputTarget: { center: 0, lower: -1, upper: 1 },
        mesEndpoints: []
      };
    }
    if (typeof trend.settings.sampleIntervalMs !== "number" || trend.settings.sampleIntervalMs <= 0) {
      trend.settings.sampleIntervalMs = 60000;
    }
    if (typeof trend.settings.lookbackMinutes !== "number" || trend.settings.lookbackMinutes <= 0) {
      trend.settings.lookbackMinutes = 120;
    }
    if (typeof trend.settings.predictionMinutes !== "number" || trend.settings.predictionMinutes <= 0) {
      trend.settings.predictionMinutes = 30;
    }
    if (!trend.settings.outputTarget || typeof trend.settings.outputTarget !== "object") {
      trend.settings.outputTarget = { center: 0, lower: -1, upper: 1 };
    }
    if (typeof trend.settings.outputTarget.center !== "number") {
      trend.settings.outputTarget.center = 0;
    }
    if (typeof trend.settings.outputTarget.lower !== "number") {
      trend.settings.outputTarget.lower = trend.settings.outputTarget.center - 1;
    }
    if (typeof trend.settings.outputTarget.upper !== "number") {
      trend.settings.outputTarget.upper = trend.settings.outputTarget.center + 1;
    }
    if (!Array.isArray(trend.settings.mesEndpoints)) {
      trend.settings.mesEndpoints = [];
    }
    if (!trend.model || typeof trend.model !== "object") {
      trend.model = { version: 1, calibrations: {} };
    }
    if (!trend.model.calibrations || typeof trend.model.calibrations !== "object") {
      trend.model.calibrations = {};
    }
    if (!trend.demo || typeof trend.demo !== "object") {
      trend.demo = { enabled: false, intervalMs: trend.settings.sampleIntervalMs, amplitude: 0.2, volatility: 0.35 };
    }
    if (typeof trend.demo.intervalMs !== "number" || trend.demo.intervalMs <= 0) {
      trend.demo.intervalMs = trend.settings.sampleIntervalMs;
    }
    if (typeof trend.demo.amplitude !== "number") {
      trend.demo.amplitude = 0.2;
    }
    if (typeof trend.demo.volatility !== "number") {
      trend.demo.volatility = 0.35;
    }
    for (var tn = 0; tn < trend.nodes.length; tn += 1) {
      var node = trend.nodes[tn];
      if (!node || typeof node !== "object") {
        trend.nodes[tn] = {
          id: uuid(),
          name: "节点",
          unit: "℃",
          positionMode: "after",
          positionRef: null,
          lower: null,
          upper: null,
          manual: false,
          manualStep: 0,
          children: []
        };
        continue;
      }
      if (!node.id) {
        node.id = uuid();
      }
      if (typeof node.parentId !== "string" || !node.parentId) {
        node.parentId = null;
      } else if (node.parentId === node.id) {
        node.parentId = null;
      }
      if (typeof node.name !== "string" || !node.name.trim()) {
        node.name = "节点";
      }
      node.name = node.name.trim();
      if (typeof node.unit !== "string" || !node.unit.trim()) {
        node.unit = "℃";
      }
      node.unit = node.unit.trim();
      if (node.positionMode !== "after" && node.positionMode !== "parallel" && node.positionMode !== "same") {
        node.positionMode = "after";
      }
      if (typeof node.positionRef !== "string") {
        node.positionRef = null;
      }
      if (typeof node.lower !== "number" && node.lower !== null) {
        node.lower = null;
      }
      if (typeof node.center !== "number" && node.center !== null) {
        if (typeof node.lower === "number" && typeof node.upper === "number") {
          node.center = (node.lower + node.upper) / 2;
        } else {
          node.center = null;
        }
      }
      if (typeof node.upper !== "number" && node.upper !== null) {
        node.upper = null;
      }
      if (typeof node.manual !== "boolean") {
        node.manual = false;
      }
      if (typeof node.simulate !== "boolean") {
        node.simulate = true;
      }
      if (typeof node.manualStep !== "number") {
        node.manualStep = 0;
      }
      if (!Array.isArray(node.children)) {
        node.children = [];
      }
      for (var sc = 0; sc < node.children.length; sc += 1) {
        var child = node.children[sc];
        if (!child || typeof child !== "object") {
          node.children[sc] = {
            id: uuid(),
            name: "节点",
            unit: node.unit,
            lower: node.lower,
            upper: node.upper,
            manual: node.manual,
            manualStep: node.manualStep
          };
          continue;
        }
        if (!child.id) {
          child.id = uuid();
        }
        if (typeof child.name !== "string" || !child.name.trim()) {
          child.name = "节点";
        } else {
          child.name = child.name.trim();
        }
        if (typeof child.unit !== "string" || !child.unit.trim()) {
          child.unit = node.unit;
        } else {
          child.unit = child.unit.trim();
        }
        if (typeof child.lower !== "number" && child.lower !== null) {
          child.lower = node.lower;
        }
        if (typeof child.center !== "number" && child.center !== null) {
          if (typeof child.lower === "number" && typeof child.upper === "number") {
            child.center = (child.lower + child.upper) / 2;
          } else if (typeof node.center === "number") {
            child.center = node.center;
          } else {
            child.center = null;
          }
        }
        if (typeof child.upper !== "number" && child.upper !== null) {
          child.upper = node.upper;
        }
        if (typeof child.manual !== "boolean") {
          child.manual = node.manual;
        }
        if (typeof child.manualStep !== "number") {
          child.manualStep = node.manualStep;
        }
      }
    }
    for (var si = 0; si < trend.scenarios.length; si += 1) {
      var scenario = trend.scenarios[si];
      if (!scenario || typeof scenario !== "object") {
        trend.scenarios[si] = {
          id: uuid(),
          name: "模拟方案",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          adjustments: [],
          horizonMinutes: trend.settings.predictionMinutes || 30,
          note: "",
          lastProjection: null
        };
        continue;
      }
      if (!scenario.id) {
        scenario.id = uuid();
      }
      if (typeof scenario.name !== "string" || !scenario.name.trim()) {
        scenario.name = "模拟方案";
      }
      scenario.name = scenario.name.trim();
      if (!scenario.createdAt) {
        scenario.createdAt = new Date().toISOString();
      }
      if (!scenario.updatedAt) {
        scenario.updatedAt = scenario.createdAt;
      }
      if (typeof scenario.note !== "string") {
        scenario.note = "";
      }
      if (typeof scenario.horizonMinutes !== "number" || !isFinite(scenario.horizonMinutes) || scenario.horizonMinutes <= 0) {
        scenario.horizonMinutes = trend.settings.predictionMinutes || 30;
      }
      if (!Array.isArray(scenario.adjustments)) {
        scenario.adjustments = [];
      }
      if (scenario.lastProjection && typeof scenario.lastProjection !== "object") {
        scenario.lastProjection = null;
      }
    }
    for (var mt = 0; mt < trend.nodes.length; mt += 1) {
      var manualNode = trend.nodes[mt];
      if (!manualNode) {
        continue;
      }
      if (!manualNode.manual) {
        manualNode.manualTargets = [];
        continue;
      }
      manualNode.manualTargets = sanitizeManualTargetsInput(manualNode.manualTargets, manualNode.id);
    }
    rebuildTrendNodeLibrary();
    if (trend.streams.length > 2000) {
      trend.streams = trend.streams.slice(trend.streams.length - 2000);
    }
    if (trend.history.length > 1000) {
      trend.history = trend.history.slice(trend.history.length - 1000);
    }
    if (trend.feedback.length > 2000) {
      trend.feedback = trend.feedback.slice(trend.feedback.length - 2000);
    }
    if (trend.forecasts.length > 400) {
      trend.forecasts = trend.forecasts.slice(trend.forecasts.length - 400);
    }
  }

  function cloneTrendNodes() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.nodes));
    } catch (err) {
      console.warn("cloneTrendNodes failed", err);
      return [];
    }
  }

  function cloneTrendNodeLibrary() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.nodeLibrary || []));
    } catch (err) {
      console.warn("cloneTrendNodeLibrary failed", err);
      return [];
    }
  }

  function cloneTrendGroupPaths() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.groupPaths || {}));
    } catch (err) {
      console.warn("cloneTrendGroupPaths failed", err);
      return {};
    }
  }

  function cloneTrendHierarchy() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.hierarchy || { groups: {}, nodes: {}, version: 1 }));
    } catch (err) {
      console.warn("cloneTrendHierarchy failed", err);
      return { groups: {}, nodes: {}, version: 1 };
    }
  }

  function cloneTrendStreams(limit) {
    ensureTrendStore();
    var streams = state.tools.trend.streams || [];
    if (typeof limit === "number" && limit > 0 && streams.length > limit) {
      streams = streams.slice(streams.length - limit);
    }
    try {
      return JSON.parse(JSON.stringify(streams));
    } catch (err) {
      console.warn("cloneTrendStreams failed", err);
      return [];
    }
  }

  function cloneTrendSuggestions() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.suggestions));
    } catch (err) {
      console.warn("cloneTrendSuggestions failed", err);
      return [];
    }
  }

  function cloneTrendScenarios() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.scenarios || []));
    } catch (err) {
      console.warn("cloneTrendScenarios failed", err);
      return [];
    }
  }

  function cloneTrendForecasts() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.forecasts));
    } catch (err) {
      console.warn("cloneTrendForecasts failed", err);
      return [];
    }
  }

  function cloneTrendHistory() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.history));
    } catch (err) {
      console.warn("cloneTrendHistory failed", err);
      return [];
    }
  }

  function cloneTrendFeedback() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.feedback));
    } catch (err) {
      console.warn("cloneTrendFeedback failed", err);
      return [];
    }
  }

  function cloneTrendSettings() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.settings));
    } catch (err) {
      console.warn("cloneTrendSettings failed", err);
      return {
        sampleIntervalMs: 60000,
        lookbackMinutes: 120,
        predictionMinutes: 30,
        outputTarget: { center: 0, lower: -1, upper: 1 },
        mesEndpoints: []
      };
    }
  }

  function findTrendNodeById(nodeId) {
    ensureTrendStore();
    if (!nodeId) {
      return null;
    }
    for (var i = 0; i < state.tools.trend.nodes.length; i += 1) {
      if (state.tools.trend.nodes[i] && state.tools.trend.nodes[i].id === nodeId) {
        return state.tools.trend.nodes[i];
      }
    }
    return null;
  }

  function findTrendChild(node, childId) {
    if (!node || !Array.isArray(node.children)) {
      return null;
    }
    for (var i = 0; i < node.children.length; i += 1) {
      if (node.children[i] && node.children[i].id === childId) {
        return node.children[i];
      }
    }
    return null;
  }

  function collectTrendDescendantIds(groupId) {
    ensureTrendStore();
    var descendants = [];
    if (!groupId) {
      return descendants;
    }
    var queue = [groupId];
    while (queue.length) {
      var currentId = queue.shift();
      for (var i = 0; i < state.tools.trend.nodes.length; i += 1) {
        var candidate = state.tools.trend.nodes[i];
        if (!candidate || !candidate.id || !candidate.parentId) {
          continue;
        }
        if (candidate.parentId === currentId) {
          descendants.push(candidate.id);
          queue.push(candidate.id);
        }
      }
    }
    return descendants;
  }

  function getTrendGroupPathFromState(groupId) {
    ensureTrendStore();
    if (!groupId) {
      return [];
    }
    var paths = state.tools.trend.groupPaths || {};
    if (paths[groupId]) {
      return paths[groupId].slice();
    }
    var nodes = state.tools.trend.nodes || [];
    var map = {};
    for (var i = 0; i < nodes.length; i += 1) {
      var group = nodes[i];
      if (group && group.id) {
        map[group.id] = group;
      }
    }
    var path = [];
    var guard = 0;
    var current = map[groupId];
    while (current && guard < 50) {
      path.unshift(current.id);
      if (!current.parentId || !map[current.parentId]) {
        break;
      }
      current = map[current.parentId];
      guard += 1;
    }
    state.tools.trend.groupPaths[groupId] = path.slice();
    return path;
  }

  function computeTrendGroupAffinity(sourceNode, targetNode) {
    if (!sourceNode || !targetNode) {
      return 0.6;
    }
    ensureTrendStore();
    var hierarchy = state.tools.trend.hierarchy || {};
    var groups = hierarchy.groups || {};
    var sourceEntry = groups[sourceNode.id];
    var targetEntry = groups[targetNode.id];
    var sourcePath = sourceEntry && Array.isArray(sourceEntry.path) ? sourceEntry.path.slice() : getTrendGroupPathFromState(sourceNode.id);
    var targetPath = targetEntry && Array.isArray(targetEntry.path) ? targetEntry.path.slice() : getTrendGroupPathFromState(targetNode.id);
    if (!sourcePath.length || !targetPath.length) {
      return 0.6;
    }
    var maxShared = Math.min(sourcePath.length, targetPath.length);
    var shared = 0;
    for (var i = 0; i < maxShared; i += 1) {
      if (sourcePath[i] === targetPath[i]) {
        shared += 1;
      } else {
        break;
      }
    }
    var distance = (sourcePath.length - shared) + (targetPath.length - shared);
    if (distance <= 0) {
      return 1;
    }
    var sourceIsAncestor = shared === sourcePath.length;
    var targetIsAncestor = shared === targetPath.length;
    if (sourceIsAncestor || targetIsAncestor) {
      var ancestorDepthGap = Math.abs(sourcePath.length - targetPath.length);
      var ancestorScore = 0.92 - Math.min(0.1 * Math.max(ancestorDepthGap - 1, 0), 0.3);
      return Math.max(0.72, Math.min(0.95, ancestorScore));
    }
    if (distance === 2 && shared >= 1) {
      return 0.85;
    }
    if (shared >= 1) {
      var step = Math.max(0, distance - 2);
      var layered = 0.75 - step * 0.08;
      return Math.max(0.58, Math.min(0.82, layered));
    }
    var separation = sourcePath.length + targetPath.length - shared * 2;
    var fallback = 0.6 - Math.min(0.02 * Math.max(separation - 2, 0), 0.25);
    return Math.max(0.4, Math.min(0.65, fallback));
  }

  function rewriteTrendKeyValue(value, oldNodeId, newNodeId, oldSubId, newSubId) {
    if (typeof value !== "string" || !value) {
      return value;
    }
    var parts = value.split("::");
    if (!parts.length) {
      return value;
    }
    if (parts[0] === oldNodeId) {
      parts[0] = newNodeId;
      if (parts.length > 1 && typeof oldSubId === "string" && typeof newSubId === "string" && parts[1] === oldSubId) {
        parts[1] = newSubId;
      }
      return parts.join("::");
    }
    return value;
  }

  function renameTrendGroupId(oldId, newId) {
    if (!oldId || !newId || oldId === newId) {
      return findTrendNodeById(newId) || findTrendNodeById(oldId);
    }
    ensureTrendStore();
    var nodes = state.tools.trend.nodes || [];
    var target = null;
    for (var i = 0; i < nodes.length; i += 1) {
      var group = nodes[i];
      if (!group) {
        continue;
      }
      if (group.id === oldId) {
        group.id = newId;
        target = group;
      }
      if (group.parentId === oldId) {
        group.parentId = newId;
      }
      if (group.positionRef === oldId) {
        group.positionRef = newId;
      }
      if (Array.isArray(group.manualTargets)) {
        for (var mt = 0; mt < group.manualTargets.length; mt += 1) {
          var manualTarget = group.manualTargets[mt];
          if (manualTarget && manualTarget.nodeId === oldId) {
            manualTarget.nodeId = newId;
          }
        }
      }
    }
    var collections = [
      state.tools.trend.streams,
      state.tools.trend.suggestions,
      state.tools.trend.forecasts,
      state.tools.trend.history,
      state.tools.trend.feedback
    ];
    collections.forEach(function (list) {
      if (!Array.isArray(list)) {
        return;
      }
      for (var idx = 0; idx < list.length; idx += 1) {
        var entry = list[idx];
        if (!entry || typeof entry !== "object") {
          continue;
        }
        if (entry.nodeId === oldId) {
          entry.nodeId = newId;
        }
        if (entry.sourceId === oldId) {
          entry.sourceId = newId;
        }
        if (entry.targetId === oldId) {
          entry.targetId = newId;
        }
        if (entry.manualNodeId === oldId) {
          entry.manualNodeId = newId;
        }
        if (entry.upstreamNodeId === oldId) {
          entry.upstreamNodeId = newId;
        }
        if (entry.downstreamNodeId === oldId) {
          entry.downstreamNodeId = newId;
        }
        if (typeof entry.key === "string") {
          entry.key = rewriteTrendKeyValue(entry.key, oldId, newId);
        }
        if (typeof entry.seriesKey === "string") {
          entry.seriesKey = rewriteTrendKeyValue(entry.seriesKey, oldId, newId);
        }
        if (typeof entry.streamKey === "string") {
          entry.streamKey = rewriteTrendKeyValue(entry.streamKey, oldId, newId);
        }
        if (Array.isArray(entry.duplicates)) {
          for (var d = 0; d < entry.duplicates.length; d += 1) {
            var dup = entry.duplicates[d];
            if (!dup || typeof dup !== "object") {
              continue;
            }
            if (dup.nodeId === oldId) {
              dup.nodeId = newId;
            }
            if (typeof dup.key === "string") {
              dup.key = rewriteTrendKeyValue(dup.key, oldId, newId);
            }
          }
        }
      }
    });
    if (Array.isArray(state.tools.trend.scenarios)) {
      for (var s = 0; s < state.tools.trend.scenarios.length; s += 1) {
        var scenario = state.tools.trend.scenarios[s];
        if (!scenario) {
          continue;
        }
        if (Array.isArray(scenario.adjustments)) {
          for (var a = 0; a < scenario.adjustments.length; a += 1) {
            var adj = scenario.adjustments[a];
            if (!adj) {
              continue;
            }
            if (adj.nodeId === oldId) {
              adj.nodeId = newId;
            }
            if (typeof adj.key === "string") {
              adj.key = rewriteTrendKeyValue(adj.key, oldId, newId);
            }
          }
        }
        if (scenario.lastProjection && Array.isArray(scenario.lastProjection.adjustments)) {
          for (var pa = 0; pa < scenario.lastProjection.adjustments.length; pa += 1) {
            var projAdj = scenario.lastProjection.adjustments[pa];
            if (!projAdj) {
              continue;
            }
            if (projAdj.nodeId === oldId) {
              projAdj.nodeId = newId;
            }
            if (typeof projAdj.key === "string") {
              projAdj.key = rewriteTrendKeyValue(projAdj.key, oldId, newId);
            }
          }
        }
      }
    }
    if (state.tools.trend.model && state.tools.trend.model.calibrations && Object.prototype.hasOwnProperty.call(state.tools.trend.model.calibrations, oldId)) {
      var calibration = state.tools.trend.model.calibrations[oldId];
      if (!state.tools.trend.model.calibrations[newId]) {
        state.tools.trend.model.calibrations[newId] = calibration;
      } else if (calibration) {
        state.tools.trend.model.calibrations[newId].ratingSum = (state.tools.trend.model.calibrations[newId].ratingSum || 0) + (calibration.ratingSum || 0);
        state.tools.trend.model.calibrations[newId].ratingCount = (state.tools.trend.model.calibrations[newId].ratingCount || 0) + (calibration.ratingCount || 0);
      }
      delete state.tools.trend.model.calibrations[oldId];
    }
    state.tools.trend.groupPaths = {};
    return target;
  }

  function renameTrendChildId(nodeId, oldChildId, newChildId) {
    if (!nodeId || !oldChildId || !newChildId || oldChildId === newChildId) {
      return;
    }
    ensureTrendStore();
    var node = findTrendNodeById(nodeId);
    if (!node || !Array.isArray(node.children)) {
      return;
    }
    var child = null;
    for (var i = 0; i < node.children.length; i += 1) {
      if (node.children[i] && node.children[i].id === oldChildId) {
        node.children[i].id = newChildId;
        child = node.children[i];
      }
    }
    if (!child) {
      return;
    }
    if (Array.isArray(node.manualTargets)) {
      for (var mt = 0; mt < node.manualTargets.length; mt += 1) {
        var target = node.manualTargets[mt];
        if (target && target.nodeId === nodeId && target.subNodeId === oldChildId) {
          target.subNodeId = newChildId;
        }
      }
    }
    var collections = [
      state.tools.trend.streams,
      state.tools.trend.suggestions,
      state.tools.trend.forecasts,
      state.tools.trend.history,
      state.tools.trend.feedback
    ];
    collections.forEach(function (list) {
      if (!Array.isArray(list)) {
        return;
      }
      for (var idx = 0; idx < list.length; idx += 1) {
        var entry = list[idx];
        if (!entry || typeof entry !== "object") {
          continue;
        }
        if (entry.nodeId === nodeId && entry.subNodeId === oldChildId) {
          entry.subNodeId = newChildId;
        }
        if (typeof entry.key === "string") {
          entry.key = rewriteTrendKeyValue(entry.key, nodeId, nodeId, oldChildId, newChildId);
        }
        if (typeof entry.seriesKey === "string") {
          entry.seriesKey = rewriteTrendKeyValue(entry.seriesKey, nodeId, nodeId, oldChildId, newChildId);
        }
        if (typeof entry.streamKey === "string") {
          entry.streamKey = rewriteTrendKeyValue(entry.streamKey, nodeId, nodeId, oldChildId, newChildId);
        }
        if (Array.isArray(entry.duplicates)) {
          for (var d = 0; d < entry.duplicates.length; d += 1) {
            var dup = entry.duplicates[d];
            if (!dup || typeof dup !== "object") {
              continue;
            }
            if (dup.nodeId === nodeId && dup.subNodeId === oldChildId) {
              dup.subNodeId = newChildId;
            }
            if (typeof dup.key === "string") {
              dup.key = rewriteTrendKeyValue(dup.key, nodeId, nodeId, oldChildId, newChildId);
            }
          }
        }
      }
    });
    if (Array.isArray(state.tools.trend.scenarios)) {
      for (var s = 0; s < state.tools.trend.scenarios.length; s += 1) {
        var scenario = state.tools.trend.scenarios[s];
        if (!scenario) {
          continue;
        }
        if (Array.isArray(scenario.adjustments)) {
          for (var a = 0; a < scenario.adjustments.length; a += 1) {
            var adj = scenario.adjustments[a];
            if (!adj) {
              continue;
            }
            if (adj.nodeId === nodeId && adj.subNodeId === oldChildId) {
              adj.subNodeId = newChildId;
            }
            if (typeof adj.key === "string") {
              adj.key = rewriteTrendKeyValue(adj.key, nodeId, nodeId, oldChildId, newChildId);
            }
          }
        }
        if (scenario.lastProjection && Array.isArray(scenario.lastProjection.adjustments)) {
          for (var pa = 0; pa < scenario.lastProjection.adjustments.length; pa += 1) {
            var projAdj = scenario.lastProjection.adjustments[pa];
            if (!projAdj) {
              continue;
            }
            if (projAdj.nodeId === nodeId && projAdj.subNodeId === oldChildId) {
              projAdj.subNodeId = newChildId;
            }
            if (typeof projAdj.key === "string") {
              projAdj.key = rewriteTrendKeyValue(projAdj.key, nodeId, nodeId, oldChildId, newChildId);
            }
          }
        }
      }
    }
  }

  function rebuildTrendNodeLibrary() {
    if (!state || !state.tools || !state.tools.trend) {
      return;
    }
    var nodes = Array.isArray(state.tools.trend.nodes) ? state.tools.trend.nodes : [];
    var map = {};
    var childrenMap = {};
    for (var i = 0; i < nodes.length; i += 1) {
      var group = nodes[i];
      if (group && group.id) {
        if (typeof group.parentId !== "string" || !group.parentId) {
          group.parentId = null;
        }
        if (!Array.isArray(group.children)) {
          group.children = [];
        }
        map[group.id] = group;
        if (group.parentId) {
          if (!childrenMap[group.parentId]) {
            childrenMap[group.parentId] = [];
          }
          childrenMap[group.parentId].push(group.id);
        }
      }
    }
    var pathCache = {};
    function computePath(id) {
      if (!id || !map[id]) {
        return [];
      }
      if (pathCache[id]) {
        return pathCache[id];
      }
      var group = map[id];
      var parentPath = [];
      if (group.parentId && map[group.parentId]) {
        parentPath = computePath(group.parentId).slice();
      }
      parentPath.push(id);
      pathCache[id] = parentPath;
      return parentPath;
    }
    var library = [];
    var nodeRegistry = {};
    var groupHierarchy = {};
    var nowIso = new Date().toISOString();
    for (var gi = 0; gi < nodes.length; gi += 1) {
      var currentGroup = nodes[gi];
      if (!currentGroup || !currentGroup.id) {
        continue;
      }
      var groupPath = computePath(currentGroup.id).slice();
      var namePath = [];
      for (var pi = 0; pi < groupPath.length; pi += 1) {
        var gp = map[groupPath[pi]];
        namePath.push(gp && gp.name ? gp.name : "节点组");
      }
      groupHierarchy[currentGroup.id] = {
        id: currentGroup.id,
        name: currentGroup.name || "节点组",
        parentId: currentGroup.parentId || null,
        path: groupPath.slice(),
        namePath: namePath.slice(),
        depth: groupPath.length ? groupPath.length - 1 : 0,
        ancestors: groupPath.slice(0, -1),
        children: [],
        siblings: []
      };
      for (var ci = 0; ci < currentGroup.children.length; ci += 1) {
        var child = currentGroup.children[ci];
        if (!child) {
          continue;
        }
        if (!child.id) {
          child.id = uuid();
        }
        if (typeof child.createdAt !== "string") {
          child.createdAt = nowIso;
        }
        if (typeof child.updatedAt !== "string") {
          child.updatedAt = nowIso;
        }
        var record = {
          id: child.id,
          name: child.name || (currentGroup.name || "节点"),
          unit: child.unit || currentGroup.unit || "",
          lower: typeof child.lower === "number" ? child.lower : (typeof currentGroup.lower === "number" ? currentGroup.lower : null),
          center: typeof child.center === "number" ? child.center : (typeof currentGroup.center === "number" ? currentGroup.center : null),
          upper: typeof child.upper === "number" ? child.upper : (typeof currentGroup.upper === "number" ? currentGroup.upper : null),
          manual: typeof child.manual === "boolean" ? child.manual : !!currentGroup.manual,
          manualStep: typeof child.manualStep === "number"
            ? child.manualStep
            : (typeof currentGroup.manualStep === "number" ? currentGroup.manualStep : 0),
          simulate: child.simulate === false ? false : (currentGroup.simulate === false ? false : true),
          groupId: currentGroup.id,
          parentGroupId: currentGroup.parentId || null,
          groupPath: groupPath.slice(),
          groupNamePath: namePath.slice(),
          createdAt: child.createdAt,
          updatedAt: child.updatedAt
        };
        library.push(record);
        nodeRegistry[record.id] = record;
      }
    }
    for (var parentId in childrenMap) {
      if (!Object.prototype.hasOwnProperty.call(childrenMap, parentId)) {
        continue;
      }
      var childIds = childrenMap[parentId].slice();
      if (groupHierarchy[parentId]) {
        groupHierarchy[parentId].children = childIds.slice();
      }
      for (var c = 0; c < childIds.length; c += 1) {
        var childId = childIds[c];
        if (!groupHierarchy[childId]) {
          continue;
        }
        var siblings = [];
        for (var s = 0; s < childIds.length; s += 1) {
          if (childIds[s] !== childId) {
            siblings.push(childIds[s]);
          }
        }
        groupHierarchy[childId].siblings = siblings;
      }
    }
    state.tools.trend.nodeLibrary = library;
    state.tools.trend.groupPaths = pathCache;
    state.tools.trend.nodeRegistry = nodeRegistry;
    state.tools.trend.hierarchy = { groups: groupHierarchy, nodes: nodeRegistry, version: 1 };
  }

  function sanitizeTrendSample(sample) {
    if (!sample || typeof sample !== "object") {
      return null;
    }
    var node = findTrendNodeById(sample.nodeId);
    if (!node) {
      return null;
    }
    var child = null;
    if (sample.subNodeId) {
      child = findTrendChild(node, sample.subNodeId);
      if (!child) {
        return null;
      }
    }
    var parsedValue = typeof sample.value === "number" ? sample.value : parseFloat(sample.value);
    if (isNaN(parsedValue)) {
      return null;
    }
    var nowIso = new Date().toISOString();
    return {
      id: sample.id || uuid(),
      nodeId: node.id,
      subNodeId: child ? child.id : null,
      value: parsedValue,
      source: sample.source || "demo",
      confidence: typeof sample.confidence === "number" ? sample.confidence : 0,
      capturedAt: sample.capturedAt || nowIso,
      receivedAt: nowIso,
      manual: !!sample.manual,
      adjustment: sample.adjustment || null
    };
  }

  function getTrendSnapshot(options) {
    ensureTrendStore();
    options = options || {};
    var streamLimit = typeof options.streamLimit === "number" ? options.streamLimit : 480;
    return {
      nodes: cloneTrendNodes(),
      nodeLibrary: cloneTrendNodeLibrary(),
      groupPaths: cloneTrendGroupPaths(),
      hierarchy: cloneTrendHierarchy(),
      streams: cloneTrendStreams(streamLimit),
      suggestions: cloneTrendSuggestions(),
      scenarios: cloneTrendScenarios(),
      forecasts: cloneTrendForecasts(),
      history: cloneTrendHistory(),
      feedback: cloneTrendFeedback(),
      settings: cloneTrendSettings(),
      model: JSON.parse(JSON.stringify(state.tools.trend.model || { version: 1, calibrations: {} })),
      demo: JSON.parse(JSON.stringify(state.tools.trend.demo || { enabled: false, intervalMs: 60000 }))
    };
  }

  function emitTrendChange() {
    if (!trendSubscribers || trendSubscribers.length === 0) {
      return;
    }
    var snapshot = getTrendSnapshot();
    for (var i = 0; i < trendSubscribers.length; i += 1) {
      try {
        trendSubscribers[i](snapshot);
      } catch (err) {
        console.error("trend subscriber error", err);
      }
    }
  }

  function subscribeTrend(callback) {
    if (typeof callback !== "function") {
      return function () {};
    }
    trendSubscribers.push(callback);
    try {
      callback(getTrendSnapshot());
    } catch (err) {
      console.error("trend init callback error", err);
    }
    return function () {
      var index = trendSubscribers.indexOf(callback);
      if (index !== -1) {
        trendSubscribers.splice(index, 1);
      }
    };
  }

  function upsertTrendNode(payload) {
    ensureTrendStore();
    if (!payload || typeof payload !== "object") {
      return null;
    }
    var now = new Date().toISOString();
    var id = typeof payload.id === "string" && payload.id.trim() ? payload.id.trim() : uuid();
    var originalId = typeof payload.originalId === "string" && payload.originalId.trim() ? payload.originalId.trim() : null;
    var node = findTrendNodeById(id);
    if (!node && originalId && originalId !== id) {
      node = renameTrendGroupId(originalId, id);
      if (!node) {
        node = findTrendNodeById(id);
      }
    }
    var base = node || {
      id: id,
      createdAt: now,
      children: []
    };
    base.updatedAt = now;
    var parentId = null;
    if (typeof payload.parentId === "string" && payload.parentId && payload.parentId !== id) {
      var parentCandidate = findTrendNodeById(payload.parentId);
      if (parentCandidate) {
        var invalid = collectTrendDescendantIds(id);
        if (invalid.indexOf(payload.parentId) === -1) {
          parentId = payload.parentId;
        }
      }
    }
    base.parentId = parentId;
    if (typeof payload.name === "string" && payload.name.trim()) {
      base.name = payload.name.trim();
    } else if (!base.name) {
      base.name = "节点";
    }
    if (typeof payload.note === "string") {
      base.note = payload.note.trim();
    } else if (!base.note) {
      base.note = "";
    }
    if (typeof payload.unit === "string" && payload.unit.trim()) {
      base.unit = payload.unit.trim();
    } else if (!base.unit) {
      base.unit = "℃";
    }
    if (payload.positionMode === "after" || payload.positionMode === "parallel" || payload.positionMode === "same") {
      base.positionMode = payload.positionMode;
    } else if (!base.positionMode) {
      base.positionMode = "after";
    }
    if (typeof payload.positionRef === "string" && payload.positionRef) {
      base.positionRef = payload.positionRef;
    } else if (payload.positionRef === null) {
      base.positionRef = null;
    } else if (typeof base.positionRef !== "string") {
      base.positionRef = null;
    }
    if (typeof payload.lower === "number" || payload.lower === null) {
      base.lower = payload.lower;
    } else if (typeof base.lower !== "number" && base.lower !== null) {
      base.lower = null;
    }
    if (typeof payload.center === "number" || payload.center === null) {
      base.center = payload.center;
    } else if (typeof base.center !== "number" && base.center !== null) {
      if (typeof base.lower === "number" && typeof base.upper === "number") {
        base.center = (base.lower + base.upper) / 2;
      } else {
        base.center = null;
      }
    }
    if (typeof payload.upper === "number" || payload.upper === null) {
      base.upper = payload.upper;
    } else if (typeof base.upper !== "number" && base.upper !== null) {
      base.upper = null;
    }
    if (typeof payload.manual === "boolean") {
      base.manual = payload.manual;
    } else if (typeof base.manual !== "boolean") {
      base.manual = false;
    }
    if (typeof payload.simulate === "boolean") {
      base.simulate = payload.simulate;
    } else if (typeof base.simulate !== "boolean") {
      base.simulate = true;
    }
    if (typeof payload.manualStep === "number") {
      base.manualStep = payload.manualStep;
    } else if (typeof base.manualStep !== "number") {
      base.manualStep = 0;
    }
    if (!Array.isArray(base.children)) {
      base.children = [];
    }
    if (Array.isArray(payload.children)) {
      var nextChildren = [];
      for (var i = 0; i < payload.children.length; i += 1) {
        var childInput = payload.children[i];
        if (!childInput || typeof childInput !== "object") {
          continue;
        }
        var childId = childInput.id && String(childInput.id).trim() ? String(childInput.id).trim() : uuid();
        var originalChildId = childInput.originalId && String(childInput.originalId).trim() ? String(childInput.originalId).trim() : null;
        var existing = findTrendChild(base, childId);
        if (!existing && originalChildId && originalChildId !== childId) {
          renameTrendChildId(base.id, originalChildId, childId);
          existing = findTrendChild(base, childId);
        }
        if (!existing) {
          existing = { id: childId };
        }
        existing.updatedAt = now;
        if (typeof existing.createdAt !== "string") {
          existing.createdAt = now;
        }
        if (typeof childInput.name === "string" && childInput.name.trim()) {
          existing.name = childInput.name.trim();
        } else if (!existing.name) {
          existing.name = "节点";
        }
        if (typeof childInput.unit === "string" && childInput.unit.trim()) {
          existing.unit = childInput.unit.trim();
        } else if (!existing.unit) {
          existing.unit = base.unit;
        }
        if (typeof childInput.lower === "number" || childInput.lower === null) {
          existing.lower = childInput.lower;
        } else if (typeof existing.lower !== "number" && existing.lower !== null) {
          existing.lower = base.lower;
        }
        if (typeof childInput.center === "number" || childInput.center === null) {
          existing.center = childInput.center;
        } else if (typeof existing.center !== "number" && existing.center !== null) {
          if (typeof existing.lower === "number" && typeof existing.upper === "number") {
            existing.center = (existing.lower + existing.upper) / 2;
          } else if (typeof base.center === "number") {
            existing.center = base.center;
          } else {
            existing.center = null;
          }
        }
        if (typeof childInput.upper === "number" || childInput.upper === null) {
          existing.upper = childInput.upper;
        } else if (typeof existing.upper !== "number" && existing.upper !== null) {
          existing.upper = base.upper;
        }
        if (typeof childInput.manual === "boolean") {
          existing.manual = childInput.manual;
        } else if (typeof existing.manual !== "boolean") {
          existing.manual = base.manual;
        }
        if (typeof childInput.manualStep === "number") {
          existing.manualStep = childInput.manualStep;
        } else if (typeof existing.manualStep !== "number") {
          existing.manualStep = base.manualStep;
        }
        delete existing.originalId;
        nextChildren.push(existing);
      }
      base.children = nextChildren;
    }
    if (base.manual) {
      base.manualTargets = sanitizeManualTargetsInput(payload.manualTargets, base.id);
    } else {
      base.manualTargets = [];
    }
    if (!node) {
      state.tools.trend.nodes.push(base);
    }
    rebuildTrendNodeLibrary();
    saveState();
    emitTrendChange();
    return base;
  }

  function removeTrendNode(nodeId) {
    ensureTrendStore();
    if (!nodeId) {
      return;
    }
    var idsToRemove = collectTrendDescendantIds(nodeId);
    idsToRemove.push(nodeId);
    var removalSet = {};
    for (var r = 0; r < idsToRemove.length; r += 1) {
      removalSet[idsToRemove[r]] = true;
    }
    var nextNodes = [];
    var removed = false;
    for (var i = 0; i < state.tools.trend.nodes.length; i += 1) {
      var group = state.tools.trend.nodes[i];
      if (group && removalSet[group.id]) {
        removed = true;
        continue;
      }
      nextNodes.push(group);
      if (group && Array.isArray(group.manualTargets)) {
        group.manualTargets = group.manualTargets.filter(function (target) {
          return target && target.nodeId && !removalSet[target.nodeId];
        });
      }
    }
    if (!removed) {
      return;
    }
    state.tools.trend.nodes = nextNodes;
    state.tools.trend.streams = state.tools.trend.streams.filter(function (stream) {
      return stream && !removalSet[stream.nodeId];
    });
    state.tools.trend.suggestions = state.tools.trend.suggestions.filter(function (suggestion) {
      return suggestion && !removalSet[suggestion.nodeId];
    });
    state.tools.trend.forecasts = state.tools.trend.forecasts.filter(function (forecast) {
      return forecast && !removalSet[forecast.nodeId];
    });
    state.tools.trend.history = state.tools.trend.history.filter(function (entry) {
      return !entry || !entry.nodeId || !removalSet[entry.nodeId];
    });
    state.tools.trend.feedback = state.tools.trend.feedback.filter(function (entry) {
      return !entry || !entry.nodeId || !removalSet[entry.nodeId];
    });
    rebuildTrendNodeLibrary();
    saveState();
    emitTrendChange();
  }

  function updateTrendSettings(patch) {
    ensureTrendStore();
    if (!patch || typeof patch !== "object") {
      return cloneTrendSettings();
    }
    var settings = state.tools.trend.settings;
    if (typeof patch.sampleIntervalMs === "number" && patch.sampleIntervalMs > 0) {
      settings.sampleIntervalMs = patch.sampleIntervalMs;
    }
    if (typeof patch.lookbackMinutes === "number" && patch.lookbackMinutes > 0) {
      settings.lookbackMinutes = patch.lookbackMinutes;
    }
    if (typeof patch.predictionMinutes === "number" && patch.predictionMinutes > 0) {
      settings.predictionMinutes = patch.predictionMinutes;
    }
    if (patch.outputTarget && typeof patch.outputTarget === "object") {
      if (typeof patch.outputTarget.center === "number") {
        settings.outputTarget.center = patch.outputTarget.center;
      }
      if (typeof patch.outputTarget.lower === "number") {
        settings.outputTarget.lower = patch.outputTarget.lower;
      }
      if (typeof patch.outputTarget.upper === "number") {
        settings.outputTarget.upper = patch.outputTarget.upper;
      }
    }
    saveState();
    emitTrendChange();
    return cloneTrendSettings();
  }

  function recordTrendManualAdjustment(payload) {
    ensureTrendStore();
    if (!payload || typeof payload !== "object") {
      return null;
    }
    var node = findTrendNodeById(payload.nodeId);
    if (!node) {
      return null;
    }
    var child = null;
    if (payload.subNodeId) {
      child = findTrendChild(node, payload.subNodeId);
      if (!child) {
        return null;
      }
    }
    var now = new Date().toISOString();
    var entry = {
      id: uuid(),
      nodeId: node.id,
      subNodeId: child ? child.id : null,
      amount: typeof payload.amount === "number" ? payload.amount : 0,
      note: typeof payload.note === "string" ? payload.note.trim() : "",
      createdAt: now,
      createdBy: currentUser ? currentUser.username : "",
      type: payload.type || "manual-adjust"
    };
    state.tools.trend.history.push({
      id: uuid(),
      nodeId: entry.nodeId,
      subNodeId: entry.subNodeId,
      kind: "adjustment",
      createdAt: now,
      meta: entry
    });
    saveState();
    emitTrendChange();
    return entry;
  }

  function recordTrendSamples(samples, options) {
    ensureTrendStore();
    if (!Array.isArray(samples) || samples.length === 0) {
      return;
    }
    options = options || {};
    var sanitized = [];
    for (var i = 0; i < samples.length; i += 1) {
      var cleaned = sanitizeTrendSample(samples[i]);
      if (cleaned) {
        sanitized.push(cleaned);
      }
    }
    if (sanitized.length === 0) {
      return;
    }
    var trend = state.tools.trend;
    Array.prototype.push.apply(trend.streams, sanitized);
    if (trend.streams.length > 2400) {
      trend.streams = trend.streams.slice(trend.streams.length - 2400);
    }
    saveState();
    recomputeTrendAnalytics(options && options.skipEmit);
    if (!options || !options.skipEmit) {
      emitTrendChange();
    }
  }

  function calcSlope(points) {
    if (!points || points.length < 2) {
      return 0;
    }
    var first = points[0];
    var last = points[points.length - 1];
    if (!first || !last) {
      return 0;
    }
    var dt = new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime();
    if (!dt) {
      return 0;
    }
    return (last.value - first.value) / (dt / 60000);
  }

  function resolveTrendBounds(node, child) {
    var lower = null;
    var upper = null;
    var center = null;
    if (child) {
      if (typeof child.lower === "number") {
        lower = child.lower;
      }
      if (typeof child.upper === "number") {
        upper = child.upper;
      }
      if (typeof child.center === "number") {
        center = child.center;
      }
    }
    if (node) {
      if (lower === null && typeof node.lower === "number") {
        lower = node.lower;
      }
      if (upper === null && typeof node.upper === "number") {
        upper = node.upper;
      }
      if (center === null && typeof node.center === "number") {
        center = node.center;
      }
    }
    if (center === null && lower !== null && upper !== null) {
      center = (lower + upper) / 2;
    }
    return {
      lower: typeof lower === "number" ? lower : null,
      upper: typeof upper === "number" ? upper : null,
      center: typeof center === "number" ? center : null
    };
  }

  function computeBoundsRange(bounds) {
    if (!bounds) {
      return null;
    }
    if (typeof bounds.upper === "number" && typeof bounds.lower === "number" && bounds.upper > bounds.lower) {
      return bounds.upper - bounds.lower;
    }
    if (typeof bounds.center === "number") {
      var ref = Math.abs(bounds.center) || 1;
      return ref * 0.2;
    }
    return null;
  }

  function computeRelationshipWeight(sourceNode, targetNode, relation) {
    if (!sourceNode || !targetNode) {
      return 0.4;
    }
    var sourceBounds = resolveTrendBounds(sourceNode, null);
    var targetBounds = resolveTrendBounds(targetNode, null);
    var base;
    if (relation === "upstream") {
      base = 0.7;
    } else if (relation === "downstream") {
      base = 0.6;
    } else {
      base = 0.5;
    }
    var sourceRange = computeBoundsRange(sourceBounds) || 1;
    var targetRange = computeBoundsRange(targetBounds) || 1;
    var rangeRatio = targetRange / sourceRange;
    if (!isFinite(rangeRatio) || rangeRatio <= 0) {
      rangeRatio = 1;
    }
    var rangeFactor = rangeRatio > 1 ? 1 / rangeRatio : rangeRatio;
    rangeFactor = Math.max(0.3, Math.min(1, rangeFactor));
    var centerFactor = 0.75;
    if (typeof sourceBounds.center === "number" && typeof targetBounds.center === "number") {
      var diff = Math.abs(sourceBounds.center - targetBounds.center);
      var span = (sourceRange + targetRange) / 2;
      if (!span || !isFinite(span)) {
        span = Math.max(Math.abs(sourceBounds.center), Math.abs(targetBounds.center), 1);
      }
      var ratio = span ? diff / (span + 1) : 0;
      centerFactor = Math.max(0.35, Math.min(1.1, 1 - Math.min(0.8, ratio)));
    }
    var affinity = computeTrendGroupAffinity(sourceNode, targetNode);
    var weight = base * rangeFactor * centerFactor * affinity;
    if (!isFinite(weight) || weight <= 0) {
      weight = base * affinity * 0.5;
    }
    return Math.max(0.2, Math.min(1.5, parseFloat(weight.toFixed(3))));
  }

  function computeManualInfluenceWeight(manualNode, targetNode, targetChild) {
    if (!manualNode || !targetNode) {
      return 0.5;
    }
    var manualBounds = resolveTrendBounds(manualNode, null);
    var targetBounds = resolveTrendBounds(targetNode, targetChild);
    var manualStep = typeof manualNode.manualStep === "number" && manualNode.manualStep !== 0
      ? Math.abs(manualNode.manualStep)
      : 1;
    var targetRange = computeBoundsRange(targetBounds) || 1;
    var base = manualStep / targetRange;
    if (!isFinite(base) || base <= 0) {
      base = 0.5;
    }
    var centerFactor = 1;
    if (typeof manualBounds.center === "number" && typeof targetBounds.center === "number") {
      var diff = Math.abs(manualBounds.center - targetBounds.center);
      var span = (computeBoundsRange(manualBounds) || targetRange || 1);
      var ratio = span ? diff / (span + 1) : 0;
      centerFactor = Math.max(0.35, Math.min(1.25, 1 - Math.min(0.85, ratio)));
    }
    var affinity = computeTrendGroupAffinity(manualNode, targetNode);
    var weight = base * centerFactor * affinity;
    if (!isFinite(weight) || weight <= 0) {
      weight = 0.5 * affinity;
    }
    return Math.max(0.25, Math.min(2, parseFloat(weight.toFixed(3))));
  }

  function calcRangeStatus(value, lower, upper, center) {
    if (typeof value !== "number") {
      return "未知";
    }
    if (typeof lower === "number" && value < lower) {
      return "超下限";
    }
    if (typeof upper === "number" && value > upper) {
      return "超上限";
    }
    if (typeof center === "number") {
      var span = 1;
      if (typeof lower === "number" && typeof upper === "number" && upper > lower) {
        span = (upper - lower) / 6;
      } else {
        span = Math.max(Math.abs(center) * 0.05, 0.5);
      }
      if (value > center + span) {
        return "偏高";
      }
      if (value < center - span) {
        return "偏低";
      }
      return "平稳";
    }
    if (typeof lower === "number" && typeof upper === "number" && upper > lower) {
      var tolerance = (upper - lower) * 0.1;
      if (value < lower + tolerance) {
        return "偏低";
      }
      if (value > upper - tolerance) {
        return "偏高";
      }
    }
    return "平稳";
  }

  function summarizeDuration(points, lower, upper, center) {
    if (!points || points.length === 0) {
      return 0;
    }
    var thresholdTime = null;
    for (var i = points.length - 1; i >= 0; i -= 1) {
      var pt = points[i];
      var status = calcRangeStatus(pt.value, lower, upper, center);
      if (status === "平稳") {
        break;
      }
      thresholdTime = pt.capturedAt;
    }
    if (!thresholdTime) {
      return 0;
    }
    var diff = new Date(points[points.length - 1].capturedAt).getTime() - new Date(thresholdTime).getTime();
    if (diff <= 0) {
      return 0;
    }
    return Math.round(diff / 60000);
  }

  function formatTrendValue(value, unit) {
    if (value === null || value === undefined || isNaN(value)) {
      return "--";
    }
    var abs = Math.abs(value);
    var fixed = abs >= 100 ? value.toFixed(1) : value.toFixed(2);
    return fixed + (unit ? " " + unit : "");
  }

  function calcAverageInterval(points, fallback) {
    if (!points || points.length < 2) {
      return fallback || 60000;
    }
    var total = 0;
    var count = 0;
    for (var i = 1; i < points.length; i += 1) {
      var prev = points[i - 1];
      var current = points[i];
      if (!prev || !current) {
        continue;
      }
      var diff = new Date(current.capturedAt).getTime() - new Date(prev.capturedAt).getTime();
      if (diff > 0) {
        total += diff;
        count += 1;
      }
    }
    if (!count) {
      return fallback || 60000;
    }
    return Math.max(1000, Math.round(total / count));
  }

  function calcMean(points) {
    if (!points || !points.length) {
      return null;
    }
    var sum = 0;
    var count = 0;
    for (var i = 0; i < points.length; i += 1) {
      if (!points[i] || typeof points[i].value !== "number" || isNaN(points[i].value)) {
        continue;
      }
      sum += points[i].value;
      count += 1;
    }
    if (!count) {
      return null;
    }
    return sum / count;
  }

  function computeTrendForecast(series, options) {
    options = options || {};
    if (!series || series.length < 3) {
      return null;
    }
    var horizonMinutes = typeof options.horizonMinutes === "number" ? options.horizonMinutes : 30;
    var intervalMs = typeof options.intervalMs === "number" && options.intervalMs > 0
      ? options.intervalMs
      : calcAverageInterval(series, 60000);
    var alpha = typeof options.alpha === "number" ? options.alpha : 0.55;
    var beta = typeof options.beta === "number" ? options.beta : 0.32;
    var level = series[0].value;
    var initialStep = Math.max(1, intervalMs / 60000);
    var trend = (series[1].value - series[0].value) / initialStep;
    var residuals = [];
    for (var i = 1; i < series.length; i += 1) {
      var point = series[i];
      var prevPoint = series[i - 1];
      var prevLevel = level;
      var deltaMinutes = Math.max(1, (new Date(point.capturedAt).getTime() - new Date(prevPoint.capturedAt).getTime()) / 60000);
      level = alpha * point.value + (1 - alpha) * (prevLevel + trend * deltaMinutes);
      trend = beta * (level - prevLevel) / deltaMinutes + (1 - beta) * trend;
      residuals.push(Math.abs(point.value - level));
    }
    var stepMinutes = Math.max(1, intervalMs / 60000);
    var steps = Math.max(1, Math.round(horizonMinutes / stepMinutes));
    var forecastValue = level + trend * stepMinutes * steps;
    var residualAvg = 0;
    for (var r = 0; r < residuals.length; r += 1) {
      residualAvg += residuals[r];
    }
    residualAvg = residuals.length ? residualAvg / residuals.length : 0;
    var scale = Math.max(1, Math.abs(level));
    var confidence = 1 - Math.min(0.95, residualAvg / scale);
    if (confidence < 0.05) {
      confidence = 0.05;
    }
    var direction = trend > 0.05 ? "上升" : (trend < -0.05 ? "下降" : "平稳");
    var lastPoint = series[series.length - 1];
    return {
      id: lastPoint.nodeId + "::" + (lastPoint.subNodeId || "root"),
      nodeId: lastPoint.nodeId,
      subNodeId: lastPoint.subNodeId || null,
      value: forecastValue,
      horizonMinutes: horizonMinutes,
      confidence: confidence,
      trendSlope: trend,
      trendLabel: direction,
      method: "holt",
      samples: series.length,
      intervalMinutes: stepMinutes,
      generatedAt: new Date().toISOString()
    };
  }

  function buildTrendAdjacency(nodes) {
    var adjacency = {};
    if (!Array.isArray(nodes)) {
      return adjacency;
    }
    var nodeMap = {};
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || !node.id) {
        continue;
      }
      nodeMap[node.id] = node;
      adjacency[node.id] = adjacency[node.id] || { upstream: [], downstream: [], parallel: [] };
    }

    function ensureEntry(list, nodeId, weight) {
      if (!Array.isArray(list) || !nodeId) {
        return;
      }
      var normalized = typeof weight === "number" && isFinite(weight) ? weight : 0.4;
      for (var idx = 0; idx < list.length; idx += 1) {
        if (list[idx] && list[idx].nodeId === nodeId) {
          if (typeof normalized === "number" && !isNaN(normalized)) {
            list[idx].weight = Math.max(list[idx].weight || 0, normalized);
          }
          return;
        }
      }
      list.push({ nodeId: nodeId, weight: normalized });
    }

    for (var n = 0; n < nodes.length; n += 1) {
      var current = nodes[n];
      if (!current || !current.id) {
        continue;
      }
      var upstreamId = null;
      if (current.positionRef && adjacency[current.positionRef]) {
        upstreamId = current.positionRef;
      } else if (n > 0 && nodes[n - 1] && nodes[n - 1].id && nodes[n - 1].id !== current.id) {
        upstreamId = nodes[n - 1].id;
      }
      if (upstreamId && adjacency[current.id]) {
        var upstreamNode = nodeMap[upstreamId];
        var currentNode = nodeMap[current.id];
        ensureEntry(adjacency[current.id].upstream, upstreamId, computeRelationshipWeight(currentNode, upstreamNode, "upstream"));
        if (adjacency[upstreamId]) {
          ensureEntry(adjacency[upstreamId].downstream, current.id, computeRelationshipWeight(upstreamNode, currentNode, "downstream"));
        }
      }
      if (current.positionMode === "same" || current.positionMode === "parallel") {
        var peerId = current.positionRef || upstreamId;
        if (peerId && adjacency[peerId]) {
          var peerNode = nodeMap[peerId];
          var currentNodeForParallel = nodeMap[current.id];
          ensureEntry(adjacency[current.id].parallel, peerId, computeRelationshipWeight(currentNodeForParallel, peerNode, "parallel"));
          ensureEntry(adjacency[peerId].parallel, current.id, computeRelationshipWeight(peerNode, currentNodeForParallel, "parallel"));
        }
      }
    }
    var hierarchy = state.tools.trend.hierarchy || {};
    var groupHierarchy = hierarchy.groups || {};
    for (var groupId in groupHierarchy) {
      if (!Object.prototype.hasOwnProperty.call(groupHierarchy, groupId)) {
        continue;
      }
      var groupEntry = groupHierarchy[groupId];
      var currentNode = nodeMap[groupId];
      if (!groupEntry || !currentNode) {
        continue;
      }
      if (groupEntry.parentId && adjacency[groupId] && adjacency[groupEntry.parentId] && nodeMap[groupEntry.parentId]) {
        var parentNode = nodeMap[groupEntry.parentId];
        ensureEntry(adjacency[groupId].upstream, parentNode.id, computeRelationshipWeight(currentNode, parentNode, "upstream"));
        ensureEntry(adjacency[parentNode.id].downstream, currentNode.id, computeRelationshipWeight(parentNode, currentNode, "downstream"));
      }
      if (Array.isArray(groupEntry.siblings) && groupEntry.siblings.length) {
        for (var sb = 0; sb < groupEntry.siblings.length; sb += 1) {
          var siblingId = groupEntry.siblings[sb];
          if (!siblingId || !adjacency[groupId] || !adjacency[siblingId] || !nodeMap[siblingId]) {
            continue;
          }
          var siblingNode = nodeMap[siblingId];
          ensureEntry(adjacency[groupId].parallel, siblingId, computeRelationshipWeight(currentNode, siblingNode, "parallel"));
          ensureEntry(adjacency[siblingId].parallel, groupId, computeRelationshipWeight(siblingNode, currentNode, "parallel"));
        }
      }
    }
    return adjacency;
  }

  function collectManualInfluenceTargets(nodes) {
    var map = {};
    if (!Array.isArray(nodes)) {
      return map;
    }
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || !node.id || !node.manual || !Array.isArray(node.manualTargets)) {
        continue;
      }
      for (var j = 0; j < node.manualTargets.length; j += 1) {
        var target = node.manualTargets[j];
        if (!target || !target.nodeId) {
          continue;
        }
        var targetNode = findTrendNodeById(target.nodeId);
        if (!targetNode) {
          continue;
        }
        var subId = null;
        var targetChild = null;
        if (target.subNodeId) {
          subId = target.subNodeId;
          var subCandidate = findTrendChild(targetNode, subId);
          if (!subCandidate) {
            subId = null;
          } else {
            subId = subCandidate.id;
            targetChild = subCandidate;
          }
        }
        var key = subId ? targetNode.id + "::" + subId : targetNode.id;
        if (!map[key]) {
          map[key] = [];
        }
        map[key].push({
          sourceId: node.id,
          sourceName: node.name || "手动节点",
          manualStep: typeof node.manualStep === "number" ? node.manualStep : 1,
          weight: typeof target.weight === "number" && !isNaN(target.weight)
            ? target.weight
            : computeManualInfluenceWeight(node, targetNode, targetChild)
        });
      }
    }
    return map;
  }

  function sanitizeManualTargetsInput(targets, manualNodeId) {
    if (!Array.isArray(targets)) {
      return [];
    }
    var cleaned = [];
    var seen = {};
    for (var i = 0; i < targets.length; i += 1) {
      var target = targets[i];
      if (!target || !target.nodeId || target.nodeId === manualNodeId) {
        continue;
      }
      var targetNode = findTrendNodeById(target.nodeId);
      if (!targetNode) {
        continue;
      }
      var subId = null;
      if (target.subNodeId) {
        var child = findTrendChild(targetNode, target.subNodeId);
        if (child) {
          subId = child.id;
        }
      }
      var key = targetNode.id + (subId ? "::" + subId : "");
      if (seen[key]) {
        continue;
      }
      seen[key] = true;
      var entry = { nodeId: targetNode.id, subNodeId: subId };
      var manualNode = findTrendNodeById(manualNodeId);
      var targetChild = subId ? findTrendChild(targetNode, subId) : null;
      if (typeof target.weight === "number" && !isNaN(target.weight)) {
        entry.weight = target.weight;
      } else {
        var computedWeight = computeManualInfluenceWeight(manualNode, targetNode, targetChild);
        if (computedWeight) {
          entry.weight = computedWeight;
        }
      }
      cleaned.push(entry);
    }
    return cleaned;
  }

  function summarizeManualAdjustments(history, startTimeMs) {
    var summary = {};
    if (!Array.isArray(history)) {
      return summary;
    }
    for (var i = 0; i < history.length; i += 1) {
      var entry = history[i];
      if (!entry || entry.kind !== "adjustment") {
        continue;
      }
      var ts = new Date(entry.createdAt).getTime();
      if (startTimeMs && ts < startTimeMs) {
        continue;
      }
      var meta = entry.meta || {};
      var nodeId = meta.nodeId || entry.nodeId;
      if (!nodeId) {
        continue;
      }
      if (!summary[nodeId]) {
        summary[nodeId] = { total: 0, count: 0, lastAmount: null, lastAt: null, lastNote: "" };
      }
      var amount = typeof meta.amount === "number" && !isNaN(meta.amount) ? meta.amount : 0;
      summary[nodeId].total += amount;
      summary[nodeId].count += 1;
      if (!summary[nodeId].lastAt || ts >= new Date(summary[nodeId].lastAt).getTime()) {
        summary[nodeId].lastAt = entry.createdAt;
        summary[nodeId].lastAmount = amount;
        summary[nodeId].lastNote = meta.note || "";
      }
    }
    for (var key in summary) {
      if (Object.prototype.hasOwnProperty.call(summary, key)) {
        var info = summary[key];
        info.average = info.count ? info.total / info.count : 0;
      }
    }
    return summary;
  }

  function extractSeriesMetrics(series, lower, upper, center, label, unit) {
    if (!series || !series.length) {
      return null;
    }
    var ordered = series.slice().sort(function (a, b) {
      return new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime();
    });
    var latest = ordered[ordered.length - 1];
    var status = calcRangeStatus(latest.value, lower, upper, center);
    var slope = calcSlope(ordered.slice(Math.max(0, ordered.length - 5)));
    return {
      label: label || "",
      unit: unit || "",
      latestValue: latest.value,
      capturedAt: latest.capturedAt,
      status: status,
      slope: slope,
      duration: summarizeDuration(ordered, lower, upper, center),
      mean: calcMean(ordered),
      lower: lower,
      center: center,
      upper: upper
    };
  }

  function formatContextLine(prefix, metricsList) {
    if (!metricsList || !metricsList.length) {
      return null;
    }
    var parts = [];
    for (var i = 0; i < metricsList.length; i += 1) {
      var metric = metricsList[i];
      if (!metric) {
        continue;
      }
      var segment = metric.label || "节点";
      if (typeof metric.status === "string" && metric.status) {
        segment += " " + metric.status;
      }
      if (typeof metric.latestValue === "number") {
        segment += "，最新 " + formatTrendValue(metric.latestValue, metric.unit || "");
      }
      if (typeof metric.slope === "number" && Math.abs(metric.slope) > 0.01) {
        segment += "，斜率 " + metric.slope.toFixed(2) + "/分钟";
      }
      if (metric.duration) {
        segment += "，持续 " + metric.duration + " 分钟";
      }
      if (typeof metric.weight === "number") {
        segment += "，影响系数 " + metric.weight.toFixed(2);
      }
      parts.push(segment);
    }
    if (!parts.length) {
      return null;
    }
    return prefix + "：" + parts.join("；");
  }

  function formatManualContextLine(list) {
    if (!list || !list.length) {
      return null;
    }
    var parts = [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item || !item.sourceName) {
        continue;
      }
      var text = item.sourceName;
      if (item.summary && typeof item.summary.lastAmount === "number") {
        text += " 最近调整 " + formatTrendValue(item.summary.lastAmount, item.unit || "");
        if (item.summary.lastAt) {
          text += " (" + formatTime(item.summary.lastAt) + ")";
        }
      } else if (item.summary && item.summary.count) {
        text += " 平均调整 " + formatTrendValue(item.summary.average || 0, item.unit || "") + " ×" + item.summary.count;
      } else {
        text += " 暂无近期调整";
      }
      if (item.summary && item.summary.lastNote) {
        text += " · " + item.summary.lastNote;
      }
      if (typeof item.weight === "number") {
        text += " · 影响系数 " + item.weight.toFixed(2);
      }
      parts.push(text);
    }
    if (!parts.length) {
      return null;
    }
    return "手动调整反馈：" + parts.join("；");
  }

  function buildForecastContext(node, child, series, grouped, adjacency, manualInfluenceMap, manualHistory) {
    if (!node || !series) {
      return { current: null, upstream: [], downstream: [], parallel: [], manualInfluence: [], summary: [] };
    }
    var context = {
      current: null,
      upstream: [],
      downstream: [],
      parallel: [],
      manualInfluence: [],
      summary: []
    };
    var unit = child ? child.unit : node.unit;
    var bounds = resolveTrendBounds(node, child);
    var lower = bounds.lower;
    var center = bounds.center;
    var upper = bounds.upper;
    var label = child ? node.name + " · " + child.name : node.name;
    context.current = extractSeriesMetrics(series, lower, upper, center, label, unit);

    function collectNeighborMetrics(targetEntry, bucket, relation) {
      if (!targetEntry) {
        return;
      }
      var targetId = typeof targetEntry === "string" ? targetEntry : targetEntry.nodeId;
      var neighborNode = findTrendNodeById(targetId);
      if (!neighborNode) {
        return;
      }
      var key = targetId + "::root";
      var raw = grouped[key];
      if (!raw || !raw.length) {
        return;
      }
      var neighborBounds = resolveTrendBounds(neighborNode, null);
      var metrics = extractSeriesMetrics(
        raw,
        neighborBounds.lower,
        neighborBounds.upper,
        neighborBounds.center,
        neighborNode.name,
        neighborNode.unit
      );
      if (metrics) {
        if (targetEntry && typeof targetEntry.weight === "number") {
          metrics.weight = targetEntry.weight;
        } else if (relation === "upstream") {
          metrics.weight = 0.6;
        } else if (relation === "parallel") {
          metrics.weight = 0.5;
        } else {
          metrics.weight = 0.4;
        }
        bucket.push(metrics);
      }
    }

    var entry = adjacency && adjacency[node.id] ? adjacency[node.id] : null;
    if (entry) {
      if (Array.isArray(entry.upstream)) {
        for (var u = 0; u < entry.upstream.length; u += 1) {
          collectNeighborMetrics(entry.upstream[u], context.upstream, "upstream");
        }
      }
      if (Array.isArray(entry.downstream)) {
        for (var d = 0; d < entry.downstream.length; d += 1) {
          collectNeighborMetrics(entry.downstream[d], context.downstream, "downstream");
        }
      }
      if (Array.isArray(entry.parallel)) {
        for (var p = 0; p < entry.parallel.length; p += 1) {
          collectNeighborMetrics(entry.parallel[p], context.parallel, "parallel");
        }
      }
    }

    var manualKey = child ? node.id + "::" + child.id : node.id;
    var manualSources = [];
    if (manualInfluenceMap && manualInfluenceMap[manualKey]) {
      manualSources = manualSources.concat(manualInfluenceMap[manualKey]);
    }
    if (manualInfluenceMap && manualInfluenceMap[node.id]) {
      manualSources = manualSources.concat(manualInfluenceMap[node.id]);
    }
    var seenManual = {};
    for (var m = 0; m < manualSources.length; m += 1) {
      var source = manualSources[m];
      if (!source || !source.sourceId || seenManual[source.sourceId]) {
        continue;
      }
      seenManual[source.sourceId] = true;
      var manualNode = findTrendNodeById(source.sourceId);
      var manualWeight = typeof source.weight === "number"
        ? source.weight
        : computeManualInfluenceWeight(manualNode, node, child || null);
      context.manualInfluence.push({
        sourceId: source.sourceId,
        sourceName: (manualNode && manualNode.name) || source.sourceName || "手动节点",
        summary: manualHistory ? manualHistory[source.sourceId] : null,
        manualStep: typeof source.manualStep === "number" ? source.manualStep : (manualNode && typeof manualNode.manualStep === "number" ? manualNode.manualStep : 1),
        weight: manualWeight,
        unit: manualNode ? manualNode.unit : ""
      });
    }

    var upstreamLine = formatContextLine("上游趋势", context.upstream);
    if (upstreamLine) {
      context.summary.push(upstreamLine);
    }
    var downstreamLine = formatContextLine("下游趋势", context.downstream);
    if (downstreamLine) {
      context.summary.push(downstreamLine);
    }
    var parallelLine = formatContextLine("并行节点", context.parallel);
    if (parallelLine) {
      context.summary.push(parallelLine);
    }
    var manualLine = formatManualContextLine(context.manualInfluence);
    if (manualLine) {
      context.summary.push(manualLine);
    }
    return context;
  }

  function applyContextualForecast(baseForecast, context, options) {
    if (!baseForecast) {
      return null;
    }
    var adjusted = {
      id: baseForecast.id,
      nodeId: baseForecast.nodeId,
      subNodeId: baseForecast.subNodeId,
      value: baseForecast.value,
      horizonMinutes: baseForecast.horizonMinutes,
      confidence: baseForecast.confidence,
      trendSlope: baseForecast.trendSlope,
      trendLabel: baseForecast.trendLabel,
      method: baseForecast.method,
      samples: baseForecast.samples,
      intervalMinutes: baseForecast.intervalMinutes,
      generatedAt: baseForecast.generatedAt,
      latestValue: baseForecast.latestValue,
      unit: baseForecast.unit,
      label: baseForecast.label,
      status: baseForecast.status
    };
    if (!context) {
      adjusted.context = { summary: [] };
      return adjusted;
    }
    adjusted.context = context;
    var baseSlope = context.current && typeof context.current.slope === "number" ? context.current.slope : 0;
    var stepMinutes = Math.max(1, adjusted.intervalMinutes || 1);
    var horizonSteps = Math.max(1, Math.round((adjusted.horizonMinutes || stepMinutes) / stepMinutes));
    var slopeTotal = 0;
    var slopeWeight = 0;

    function accumulateSlope(metrics, fallbackWeight) {
      if (!metrics || !metrics.length) {
        return;
      }
      for (var i = 0; i < metrics.length; i += 1) {
        var metric = metrics[i];
        if (!metric || typeof metric.slope !== "number" || isNaN(metric.slope)) {
          continue;
        }
        var weight = typeof metric.weight === "number" && isFinite(metric.weight) ? metric.weight : fallbackWeight;
        if (!weight) {
          continue;
        }
        slopeTotal += metric.slope * weight;
        slopeWeight += weight;
      }
    }

    accumulateSlope(context.upstream, 0.55);
    accumulateSlope(context.parallel, 0.45);
    accumulateSlope(context.downstream, 0.35);

    var blendedSlope = slopeWeight ? slopeTotal / slopeWeight : 0;
    if (slopeWeight) {
      adjusted.value += blendedSlope * stepMinutes * horizonSteps * 0.5;
    }

    if (context.manualInfluence && context.manualInfluence.length) {
      for (var i = 0; i < context.manualInfluence.length; i += 1) {
        var influence = context.manualInfluence[i];
        if (!influence || !influence.summary) {
          continue;
        }
        var baseAmount = null;
        if (typeof influence.summary.lastAmount === "number" && influence.summary.lastAmount) {
          baseAmount = influence.summary.lastAmount;
        } else if (typeof influence.summary.average === "number" && influence.summary.average) {
          baseAmount = influence.summary.average;
        }
        if (baseAmount === null) {
          continue;
        }
        var gain = typeof influence.manualStep === "number" && influence.manualStep !== 0 ? influence.manualStep : 1;
        var weight = typeof influence.weight === "number" ? influence.weight : 1;
        adjusted.value += baseAmount * gain * weight * 0.5;
      }
    }

    var lower = options && typeof options.lower === "number" ? options.lower : null;
    var upper = options && typeof options.upper === "number" ? options.upper : null;
    if (typeof lower === "number" && typeof upper === "number" && lower < upper) {
      var buffer = (upper - lower) * 0.25 || 1;
      if (adjusted.value < lower - buffer) {
        adjusted.value = lower - buffer;
      }
      if (adjusted.value > upper + buffer) {
        adjusted.value = upper + buffer;
      }
    } else {
      if (typeof lower === "number" && adjusted.value < lower) {
        adjusted.value = lower;
      }
      if (typeof upper === "number" && adjusted.value > upper) {
        adjusted.value = upper;
      }
    }

    var effectiveSlope = slopeWeight ? (baseSlope * 0.5 + blendedSlope * 0.5) : baseSlope;
    adjusted.trendSlope = effectiveSlope;
    if (effectiveSlope > 0.05) {
      adjusted.trendLabel = "上升";
    } else if (effectiveSlope < -0.05) {
      adjusted.trendLabel = "下降";
    } else {
      adjusted.trendLabel = "平稳";
    }

    var supporters = 0;
    var conflicts = 0;
    var neighborLists = [];
    if (context.upstream) {
      neighborLists = neighborLists.concat(context.upstream);
    }
    if (context.parallel) {
      neighborLists = neighborLists.concat(context.parallel);
    }
    if (context.downstream) {
      neighborLists = neighborLists.concat(context.downstream);
    }
    for (var n = 0; n < neighborLists.length; n += 1) {
      var metric = neighborLists[n];
      if (!metric || typeof metric.slope !== "number") {
        continue;
      }
      if (!effectiveSlope) {
        if (Math.abs(metric.slope) > 0.05) {
          conflicts += 1;
        }
        continue;
      }
      if (metric.slope * effectiveSlope >= 0) {
        supporters += 1;
      } else {
        conflicts += 1;
      }
    }
    if (supporters || conflicts) {
      var ratio = (supporters - conflicts) / Math.max(1, supporters + conflicts);
      var factor = 1 + Math.max(-0.4, Math.min(0.4, ratio * 0.6));
      adjusted.confidence = Math.max(0.05, Math.min(0.99, (adjusted.confidence || 0.5) * factor));
    }

    return adjusted;
  }

  function foldTrendSuggestionsMap() {
    ensureTrendStore();
    var map = {};
    for (var i = 0; i < state.tools.trend.suggestions.length; i += 1) {
      var item = state.tools.trend.suggestions[i];
      if (!item || !item.id) {
        continue;
      }
      map[item.id] = item;
    }
    return map;
  }

  function computeSimilarity(a, b) {
    if (!a || !b) {
      return 0;
    }
    var tokensA = String(a).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean);
    var tokensB = String(b).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean);
    if (!tokensA.length || !tokensB.length) {
      return 0;
    }
    var setA = {};
    for (var i = 0; i < tokensA.length; i += 1) {
      setA[tokensA[i]] = true;
    }
    var intersection = 0;
    var union = Object.assign({}, setA);
    for (var j = 0; j < tokensB.length; j += 1) {
      var token = tokensB[j];
      if (setA[token]) {
        intersection += 1;
      }
      union[token] = true;
    }
    var unionSize = Object.keys(union).length;
    if (unionSize === 0) {
      return 0;
    }
    return intersection / unionSize;
  }

  function recomputeTrendAnalytics(skipEmit) {
    ensureTrendStore();
    var trend = state.tools.trend;
    var nodes = trend.nodes;
    var adjacency = buildTrendAdjacency(nodes);
    var manualInfluenceMap = collectManualInfluenceTargets(nodes);
    var newSuggestions = [];
    var newForecasts = [];
    var nowIso = new Date().toISOString();
    var lookbackMs = (trend.settings.lookbackMinutes || 120) * 60000;
    var startTime = Date.now() - lookbackMs;
    var manualSummary = summarizeManualAdjustments(trend.history, startTime);
    var streams = trend.streams;
    var grouped = {};
    for (var i = 0; i < streams.length; i += 1) {
      var item = streams[i];
      if (!item) {
        continue;
      }
      var ts = new Date(item.capturedAt || item.receivedAt || nowIso).getTime();
      if (ts < startTime) {
        continue;
      }
      var key = item.nodeId + "::" + (item.subNodeId || "root");
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    }
    for (var key in grouped) {
      if (!Object.prototype.hasOwnProperty.call(grouped, key)) {
        continue;
      }
      var series = grouped[key];
      series.sort(function (a, b) {
        return new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime();
      });
      if (!series.length) {
        continue;
      }
      var parts = key.split("::");
      var nodeId = parts[0];
      var subNodeId = parts[1] === "root" ? null : parts[1];
      var node = findTrendNodeById(nodeId);
      if (!node) {
        continue;
      }
      var child = subNodeId ? findTrendChild(node, subNodeId) : null;
      var boundsCurrent = resolveTrendBounds(node, child);
      var lower = boundsCurrent.lower;
      var center = boundsCurrent.center;
      var upper = boundsCurrent.upper;
      var latest = series[series.length - 1];
      var status = calcRangeStatus(latest.value, lower, upper, center);
      var slope = calcSlope(series.slice(Math.max(0, series.length - 5)));
      var duration = summarizeDuration(series, lower, upper, center);
      var severity = 1;
      if (status === "超上限" || status === "超下限") {
        severity = 4;
      } else if (status === "偏高" || status === "偏低") {
        severity = 2;
      } else {
        severity = Math.abs(slope) > 0.15 ? 2 : 1;
      }
      var label = (child ? child.name : node.name) + "：" + status;
      var summary = status;
      if (status === "平稳") {
        if (Math.abs(slope) > 0.15) {
          summary = slope > 0 ? "上升趋势" : "下降趋势";
        } else {
          summary = "平稳";
        }
      }
      var detail = [];
      detail.push("最新值 " + formatTrendValue(latest.value, child ? child.unit : node.unit));
      if (typeof lower === "number" || typeof upper === "number") {
        detail.push("范围 " + (typeof lower === "number" ? lower : "-") + " ~ " + (typeof upper === "number" ? upper : "-"));
      }
      if (typeof center === "number") {
        detail.push("中值 " + center);
      }
      if (duration > 0 && status !== "平稳") {
        detail.push(status + "持续 " + duration + " 分钟");
      }
      if (Math.abs(slope) > 0.05) {
        detail.push("变化速率 " + slope.toFixed(3) + " /分钟");
      }
      var context = buildForecastContext(node, child, series, grouped, adjacency, manualInfluenceMap, manualSummary);
      if (context && context.summary && context.summary.length) {
        for (var ctxIndex = 0; ctxIndex < context.summary.length; ctxIndex += 1) {
          var ctxLine = context.summary[ctxIndex];
          if (!ctxLine) {
            continue;
          }
          if (detail.indexOf(ctxLine) === -1) {
            detail.push(ctxLine);
          }
        }
      }
      var forecast = computeTrendForecast(series, {
        horizonMinutes: trend.settings.predictionMinutes || 30,
        intervalMs: trend.settings.sampleIntervalMs || calcAverageInterval(series, 60000)
      });
      if (forecast) {
        forecast.nodeId = node.id;
        forecast.subNodeId = child ? child.id : null;
        forecast.unit = child ? child.unit : node.unit;
        forecast.label = child ? child.name : node.name;
        forecast.latestValue = latest.value;
        forecast.status = calcRangeStatus(forecast.value, lower, upper, center);
        forecast.generatedAt = nowIso;
        forecast = applyContextualForecast(forecast, context, { lower: lower, upper: upper, center: center });
        forecast.status = calcRangeStatus(forecast.value, lower, upper, center);
        detail.push("预测 " + forecast.horizonMinutes + " 分钟后约为 " + formatTrendValue(forecast.value, forecast.unit) + "，状态 " + forecast.status + "，置信度 " + Math.round((forecast.confidence || 0) * 100) + "%");
        newForecasts.push(forecast);
      }
      var suggestion = {
        id: uuid(),
        nodeId: node.id,
        subNodeId: child ? child.id : null,
        label: label,
        summary: summary,
        detail: detail,
        createdAt: nowIso,
        updatedAt: nowIso,
        severity: severity,
        status: "active",
        statusLabel: status,
        latestValue: latest.value,
        unit: child ? child.unit : node.unit,
        slope: slope,
        duration: duration,
        forecast: forecast
          ? {
              value: forecast.value,
              horizonMinutes: forecast.horizonMinutes,
              confidence: forecast.confidence,
              trendLabel: forecast.trendLabel,
              status: forecast.status
            }
          : null,
        source: "analysis"
      };
      if (context) {
        suggestion.context = context;
      }
      newSuggestions.push(suggestion);
    }
    var existing = foldTrendSuggestionsMap();
    var merged = [];
    for (var ns = 0; ns < newSuggestions.length; ns += 1) {
      var incoming = newSuggestions[ns];
      var mergedExisting = null;
      for (var id in existing) {
        if (!Object.prototype.hasOwnProperty.call(existing, id)) {
          continue;
        }
        var candidate = existing[id];
        if (!candidate || candidate.status !== "active") {
          continue;
        }
        if (candidate.nodeId === incoming.nodeId && candidate.subNodeId === incoming.subNodeId) {
          var similarity = computeSimilarity(candidate.summary, incoming.summary);
          if (similarity > 0.6) {
            mergedExisting = candidate;
            delete existing[id];
            break;
          }
        }
      }
      if (mergedExisting) {
        mergedExisting.updatedAt = incoming.updatedAt;
        mergedExisting.summary = incoming.summary;
        mergedExisting.detail = incoming.detail;
        mergedExisting.severity = incoming.severity;
        mergedExisting.statusLabel = incoming.statusLabel;
        mergedExisting.latestValue = incoming.latestValue;
        mergedExisting.unit = incoming.unit;
        mergedExisting.slope = incoming.slope;
        mergedExisting.duration = incoming.duration;
        mergedExisting.source = incoming.source;
        mergedExisting.forecast = incoming.forecast;
        merged.push(mergedExisting);
      } else {
        merged.push(incoming);
      }
    }
    for (var leftoverId in existing) {
      if (!Object.prototype.hasOwnProperty.call(existing, leftoverId)) {
        continue;
      }
      var stale = existing[leftoverId];
      if (!stale || stale.status !== "active") {
        continue;
      }
      stale.status = "resolved";
      stale.resolvedAt = nowIso;
      trend.history.push({
        id: uuid(),
        kind: "auto-resolve",
        nodeId: stale.nodeId,
        subNodeId: stale.subNodeId,
        createdAt: nowIso,
        meta: { suggestionId: stale.id }
      });
      merged.push(stale);
    }
    var forecastMap = {};
    for (var f = 0; f < newForecasts.length; f += 1) {
      var forecastItem = newForecasts[f];
      if (!forecastItem) {
        continue;
      }
      var fKey = forecastItem.nodeId + "::" + (forecastItem.subNodeId || "root");
      if (!forecastMap[fKey] || (forecastItem.confidence || 0) >= (forecastMap[fKey].confidence || 0)) {
        forecastMap[fKey] = forecastItem;
      }
    }
    var dedupedForecasts = [];
    for (var fKey in forecastMap) {
      if (Object.prototype.hasOwnProperty.call(forecastMap, fKey)) {
        dedupedForecasts.push(forecastMap[fKey]);
      }
    }
    dedupedForecasts.sort(function (a, b) {
      return (b.confidence || 0) - (a.confidence || 0);
    });
    trend.forecasts = dedupedForecasts;
    trend.suggestions = merged;
    saveState();
    if (!skipEmit) {
      emitTrendChange();
    }
  }

  function startTrendDemo(options) {
    ensureTrendStore();
    options = options || {};
    state.tools.trend.demo.enabled = true;
    if (typeof options.intervalMs === "number" && options.intervalMs > 0) {
      state.tools.trend.demo.intervalMs = options.intervalMs;
    }
    if (typeof options.amplitude === "number") {
      state.tools.trend.demo.amplitude = options.amplitude;
    }
    if (typeof options.volatility === "number") {
      state.tools.trend.demo.volatility = options.volatility;
    }
    if (trendDemoTimer) {
      window.clearInterval(trendDemoTimer);
    }
    var interval = state.tools.trend.demo.intervalMs || state.tools.trend.settings.sampleIntervalMs || 60000;
    function tickDemo() {
      ensureTrendStore();
      var nodes = state.tools.trend.nodes;
      if (!nodes.length) {
        return;
      }
      var samples = [];
      trendDemoLastTick += 1;
      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        var allowDemo = typeof node.simulate === "boolean" ? node.simulate : true;
        if (!allowDemo) {
          continue;
        }
        var base = typeof node.lower === "number" && typeof node.upper === "number"
          ? (node.lower + node.upper) / 2
          : state.tools.trend.settings.outputTarget.center;
        var amplitude = state.tools.trend.demo.amplitude || 0.2;
        var volatility = state.tools.trend.demo.volatility || 0.35;
        var jitter = Math.sin(trendDemoLastTick / (5 + i)) * amplitude * (i + 1);
        var random = (Math.random() - 0.5) * volatility;
        var manualShift = 0;
        if (node.manual) {
          manualShift = (Math.random() - 0.5) * (node.manualStep || 1);
        }
        var value = base + jitter + random + manualShift;
        if (typeof node.lower === "number") {
          value = Math.max(node.lower - 0.25 * Math.abs(node.lower || 1), value);
        }
        if (typeof node.upper === "number") {
          value = Math.min(node.upper + 0.25 * Math.abs(node.upper || 1), value);
        }
        samples.push({
          nodeId: node.id,
          value: value,
          source: "demo",
          capturedAt: new Date().toISOString(),
          confidence: 0.6 + Math.random() * 0.35
        });
        if (Array.isArray(node.children)) {
          for (var c = 0; c < node.children.length; c += 1) {
            var child = node.children[c];
            var childValue = value + (Math.random() - 0.5) * (child.manualStep || 0.5);
            samples.push({
              nodeId: node.id,
              subNodeId: child.id,
              value: childValue,
              source: "demo",
              capturedAt: new Date().toISOString(),
              confidence: 0.55 + Math.random() * 0.3
            });
          }
        }
      }
      recordTrendSamples(samples, { skipEmit: true });
      recomputeTrendAnalytics(true);
      emitTrendChange();
    }
    tickDemo();
    trendDemoTimer = window.setInterval(tickDemo, interval);
    saveState();
    emitTrendChange();
  }

  function stopTrendDemo() {
    ensureTrendStore();
    state.tools.trend.demo.enabled = false;
    if (trendDemoTimer) {
      window.clearInterval(trendDemoTimer);
      trendDemoTimer = null;
    }
    saveState();
    emitTrendChange();
  }

  function isTrendDemoActive() {
    ensureTrendStore();
    return !!state.tools.trend.demo.enabled;
  }

  function refreshTrendAnalytics() {
    recomputeTrendAnalytics();
  }

  function getTrendForecasts() {
    ensureTrendStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.trend.forecasts || []));
    } catch (err) {
      console.warn("getTrendForecasts failed", err);
      return [];
    }
  }

  function buildTrendManualForwardMap(nodes) {
    var forward = {};
    if (!Array.isArray(nodes)) {
      return forward;
    }
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || !node.id || !node.manual || !Array.isArray(node.manualTargets)) {
        continue;
      }
      var list = [];
      for (var j = 0; j < node.manualTargets.length; j += 1) {
        var target = node.manualTargets[j];
        if (!target || !target.nodeId) {
          continue;
        }
        var targetNode = findTrendNodeById(target.nodeId);
        if (!targetNode) {
          continue;
        }
        var child = null;
        if (target.subNodeId) {
          child = findTrendChild(targetNode, target.subNodeId);
          if (!child) {
            continue;
          }
        }
        var weight = typeof target.weight === "number" && isFinite(target.weight)
          ? target.weight
          : computeManualInfluenceWeight(node, targetNode, child || null);
        list.push({
          nodeId: targetNode.id,
          subNodeId: child ? child.id : null,
          label: child ? targetNode.name + " · " + child.name : targetNode.name,
          weight: isFinite(weight) ? weight : 0.4
        });
      }
      forward[node.id] = list;
    }
    return forward;
  }

  function gatherTrendSeriesSnapshot() {
    ensureTrendStore();
    var streams = state.tools.trend.streams || [];
    var map = {};
    for (var i = 0; i < streams.length; i += 1) {
      var sample = streams[i];
      if (!sample || !sample.nodeId) {
        continue;
      }
      var key = sample.nodeId + (sample.subNodeId ? "::" + sample.subNodeId : "");
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push({
        capturedAt: sample.capturedAt,
        value: sample.value,
        confidence: sample.confidence || 0,
        source: sample.source || ""
      });
    }
    var latest = {};
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        map[key].sort(function (a, b) {
          return new Date(a.capturedAt) - new Date(b.capturedAt);
        });
        var series = map[key];
        if (series.length) {
          latest[key] = series[series.length - 1].value;
        }
      }
    }
    return { series: map, latest: latest };
  }

  function sanitizeScenarioAdjustments(adjustments) {
    var cleaned = [];
    if (!Array.isArray(adjustments)) {
      return cleaned;
    }
    var seen = {};
    for (var i = 0; i < adjustments.length; i += 1) {
      var entry = adjustments[i] || {};
      var nodeId = entry.nodeId;
      var subNodeId = entry.subNodeId || null;
      if (!nodeId && typeof entry.key === "string") {
        var parts = entry.key.split("::");
        nodeId = parts[0];
        subNodeId = parts.length > 1 ? parts[1] : null;
      }
      var node = findTrendNodeById(nodeId);
      if (!node) {
        continue;
      }
      var child = null;
      if (subNodeId) {
        child = findTrendChild(node, subNodeId);
        if (!child) {
          subNodeId = null;
        }
      }
      var delta = typeof entry.delta === "number" ? entry.delta : parseFloat(entry.delta);
      if (!isFinite(delta) || delta === 0) {
        continue;
      }
      var key = node.id + (subNodeId ? "::" + subNodeId : "");
      if (!seen[key]) {
        seen[key] = true;
        cleaned.push({
          nodeId: node.id,
          subNodeId: subNodeId,
          delta: delta,
          label: typeof entry.label === "string" && entry.label.trim()
            ? entry.label.trim()
            : child
              ? node.name + " · " + child.name
              : node.name,
          manual: !!node.manual
        });
      } else {
        for (var idx = 0; idx < cleaned.length; idx += 1) {
          if (cleaned[idx] && cleaned[idx].nodeId === node.id && cleaned[idx].subNodeId === subNodeId) {
            cleaned[idx].delta += delta;
            break;
          }
        }
      }
    }
    return cleaned;
  }

  function computeScenarioImpactScore(delta, bounds) {
    if (typeof delta !== "number" || !isFinite(delta)) {
      return 0;
    }
    var range = computeBoundsRange(bounds) || Math.max(Math.abs(bounds.center || 0) * 0.1, 1);
    if (!range) {
      range = 1;
    }
    var score = Math.abs(delta) / range;
    if (!isFinite(score)) {
      return 0;
    }
    return parseFloat(score.toFixed(3));
  }

  function extractScenarioBaselineSeries(snapshot, key, horizonMinutes) {
    var result = [];
    if (!snapshot || !snapshot.series || !snapshot.series[key]) {
      return result;
    }
    var series = snapshot.series[key];
    if (!Array.isArray(series) || !series.length) {
      return result;
    }
    var limit = Math.max(60, Math.round((horizonMinutes || 30) * 2));
    var start = Math.max(0, series.length - limit);
    for (var i = start; i < series.length; i += 1) {
      var point = series[i];
      if (!point || typeof point.value !== "number" || !point.capturedAt) {
        continue;
      }
      result.push({
        capturedAt: point.capturedAt,
        value: point.value
      });
    }
    return result;
  }

  function easeInOut(ratio) {
    if (ratio <= 0) {
      return 0;
    }
    if (ratio >= 1) {
      return 1;
    }
    return ratio < 0.5
      ? 2 * ratio * ratio
      : -1 + (4 - 2 * ratio) * ratio;
  }

  function buildScenarioProjectionSeries(entry, baselineSeries, horizonMinutes, nowIso) {
    var projection = [];
    if (!entry) {
      return projection;
    }
    var baseValue = typeof entry.base === "number" && isFinite(entry.base)
      ? entry.base
      : (typeof entry.projected === "number" && isFinite(entry.projected)
        ? entry.projected - (typeof entry.delta === "number" ? entry.delta : 0)
        : 0);
    var startTs = Date.now();
    if (baselineSeries && baselineSeries.length) {
      var lastPoint = baselineSeries[baselineSeries.length - 1];
      var ts = new Date(lastPoint.capturedAt).getTime();
      if (isFinite(ts)) {
        startTs = ts;
      }
      if (typeof lastPoint.value === "number" && isFinite(lastPoint.value)) {
        baseValue = lastPoint.value;
      }
    }
    var horizonMs = Math.max(1, (horizonMinutes || 30) * 60000);
    var steps = Math.max(4, Math.min(24, Math.round((horizonMinutes || 30) / 5) + 4));
    var target = typeof entry.projected === "number" && isFinite(entry.projected)
      ? entry.projected
      : baseValue;
    for (var i = 0; i <= steps; i += 1) {
      var ratio = i / steps;
      var eased = easeInOut(ratio);
      var tsPoint = new Date(startTs + ratio * horizonMs);
      projection.push({
        capturedAt: tsPoint.toISOString(),
        value: baseValue + (target - baseValue) * eased
      });
    }
    if (!projection.length) {
      projection.push({ capturedAt: (nowIso || new Date().toISOString()), value: target });
    }
    return projection;
  }

  function computeTrendScenarioProjection(payload) {
    ensureTrendStore();
    payload = payload || {};
    var adjustments = sanitizeScenarioAdjustments(payload.adjustments || []);
    var horizon = typeof payload.horizonMinutes === "number" && payload.horizonMinutes > 0
      ? Math.round(payload.horizonMinutes)
      : state.tools.trend.settings.predictionMinutes || 30;
    var name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "模拟方案";
    var note = typeof payload.note === "string" ? payload.note.trim() : "";
    var snapshot = gatherTrendSeriesSnapshot();
    var manualForward = buildTrendManualForwardMap(state.tools.trend.nodes || []);
    var adjacency = buildTrendAdjacency(state.tools.trend.nodes || []);
    var nowIso = new Date().toISOString();
    var queue = [];
    var visited = {};
    var results = {};
    var maxDepth = typeof payload.depth === "number" && payload.depth >= 1 ? Math.min(4, Math.floor(payload.depth)) : 3;

    function ensureEntry(nodeId, subNodeId) {
      var key = nodeId + (subNodeId ? "::" + subNodeId : "");
      if (!results[key]) {
        var node = findTrendNodeById(nodeId);
        if (!node) {
          return null;
        }
        var child = subNodeId ? findTrendChild(node, subNodeId) : null;
        var bounds = resolveTrendBounds(node, child || null);
        var latestKey = key;
        var base = typeof snapshot.latest[latestKey] === "number" ? snapshot.latest[latestKey] : null;
        results[key] = {
          nodeId: nodeId,
          subNodeId: subNodeId || null,
          label: child ? node.name + " · " + child.name : node.name,
          unit: child ? (child.unit || node.unit || "") : (node.unit || ""),
          base: base,
          delta: 0,
          bounds: bounds,
          contributions: [],
          impact: 0,
          projected: base,
          status: base === null ? "未知" : calcRangeStatus(base, bounds.lower, bounds.upper, bounds.center)
        };
      }
      return results[key];
    }

    function trackAndQueue(next) {
      if (!next || !next.nodeId) {
        return;
      }
      var key = next.nodeId + (next.subNodeId ? "::" + next.subNodeId : "");
      var originKey = key + "|" + next.originKey;
      var amount = Math.abs(next.delta || 0);
      if (!amount) {
        return;
      }
      var existing = visited[originKey];
      if (existing && amount <= existing * 0.35) {
        return;
      }
      visited[originKey] = existing ? Math.max(existing, amount) : amount;
      queue.push(next);
    }

    adjustments.forEach(function (adj, index) {
      var originKey = (adj.nodeId || "node") + ":" + index;
      trackAndQueue({
        nodeId: adj.nodeId,
        subNodeId: adj.subNodeId || null,
        delta: adj.delta,
        depth: 0,
        originKey: originKey,
        sourceLabel: adj.label,
        via: []
      });
    });

    while (queue.length) {
      var current = queue.shift();
      if (!current) {
        continue;
      }
      var entry = ensureEntry(current.nodeId, current.subNodeId || null);
      if (!entry) {
        continue;
      }
      if (typeof current.delta === "number" && isFinite(current.delta)) {
        entry.delta += current.delta;
        entry.contributions.push({
          label: current.sourceLabel,
          delta: current.delta,
          depth: current.depth,
          path: current.via.slice()
        });
      }
      if (current.depth >= maxDepth) {
        continue;
      }
      var node = findTrendNodeById(current.nodeId);
      if (!node) {
        continue;
      }
      var nextDepth = current.depth + 1;

      if (!current.subNodeId && node.manual && manualForward[node.id] && manualForward[node.id].length) {
        for (var mi = 0; mi < manualForward[node.id].length; mi += 1) {
          var target = manualForward[node.id][mi];
          var propagated = current.delta * target.weight;
          if (!isFinite(propagated) || Math.abs(propagated) < 1e-5) {
            continue;
          }
          trackAndQueue({
            nodeId: target.nodeId,
            subNodeId: target.subNodeId || null,
            delta: propagated,
            depth: nextDepth,
            originKey: current.originKey,
            sourceLabel: current.sourceLabel,
            via: current.via.concat([{ type: "manual", source: node.name, target: target.label }])
          });
        }
      }

      if (!current.subNodeId && adjacency[node.id]) {
        var down = adjacency[node.id].downstream || [];
        for (var di = 0; di < down.length; di += 1) {
          var downEdge = down[di];
          var downNode = findTrendNodeById(downEdge.nodeId);
          if (!downNode) {
            continue;
          }
          var weight = typeof downEdge.weight === "number" && isFinite(downEdge.weight) ? downEdge.weight : 0.35;
          var propagatedDown = current.delta * weight * 0.8;
          if (!isFinite(propagatedDown) || Math.abs(propagatedDown) < 1e-5) {
            continue;
          }
          trackAndQueue({
            nodeId: downNode.id,
            subNodeId: null,
            delta: propagatedDown,
            depth: nextDepth,
            originKey: current.originKey,
            sourceLabel: current.sourceLabel,
            via: current.via.concat([{ type: "downstream", source: node.name, target: downNode.name }])
          });
        }
        var parallels = adjacency[node.id].parallel || [];
        for (var pi = 0; pi < parallels.length; pi += 1) {
          var peerEdge = parallels[pi];
          var peerNode = findTrendNodeById(peerEdge.nodeId);
          if (!peerNode) {
            continue;
          }
          var pWeight = typeof peerEdge.weight === "number" && isFinite(peerEdge.weight) ? peerEdge.weight : 0.25;
          var propagatedPeer = current.delta * pWeight * 0.5;
          if (!isFinite(propagatedPeer) || Math.abs(propagatedPeer) < 1e-5) {
            continue;
          }
          trackAndQueue({
            nodeId: peerNode.id,
            subNodeId: null,
            delta: propagatedPeer,
            depth: nextDepth,
            originKey: current.originKey,
            sourceLabel: current.sourceLabel,
            via: current.via.concat([{ type: "parallel", source: node.name, target: peerNode.name }])
          });
        }
      }
    }

    var output = [];
    for (var key in results) {
      if (Object.prototype.hasOwnProperty.call(results, key)) {
        var item = results[key];
        item.projected = typeof item.base === "number" ? item.base + item.delta : item.delta;
        item.status = calcRangeStatus(item.projected, item.bounds.lower, item.bounds.upper, item.bounds.center);
        item.impact = computeScenarioImpactScore(item.delta, item.bounds);
        item.key = key;
        item.baselineSeries = extractScenarioBaselineSeries(snapshot, key, horizon);
        item.projectedSeries = buildScenarioProjectionSeries(item, item.baselineSeries, horizon, nowIso);
        output.push(item);
      }
    }
    output.sort(function (a, b) {
      return b.impact - a.impact;
    });

    var summaryParts = [];
    for (var oi = 0; oi < output.length && oi < 3; oi += 1) {
      var row = output[oi];
      summaryParts.push(row.label + " → " + formatTrendValue(row.projected, row.unit) + " (" + row.status + ")");
    }
    var summary = summaryParts.length ? summaryParts.join("；") : "暂无显著波动";

    return {
      id: payload.id || uuid(),
      name: name,
      note: note,
      createdAt: nowIso,
      horizonMinutes: horizon,
      adjustments: adjustments,
      nodes: output,
      summary: summary
    };
  }

  function recordTrendScenarioHistory(scenario, projection) {
    ensureTrendStore();
    if (!projection) {
      return;
    }
    var entry = {
      id: uuid(),
      kind: "scenario",
      createdAt: projection.createdAt || new Date().toISOString(),
      scenarioId: scenario ? scenario.id : projection.id,
      name: scenario ? scenario.name : projection.name,
      meta: {
        summary: projection.summary,
        adjustments: projection.adjustments,
        nodes: projection.nodes,
        horizonMinutes: projection.horizonMinutes,
        note: projection.note || ""
      }
    };
    state.tools.trend.history.push(entry);
    if (state.tools.trend.history.length > 1000) {
      state.tools.trend.history = state.tools.trend.history.slice(state.tools.trend.history.length - 1000);
    }
    saveState();
  }

  function runTrendScenario(payload) {
    ensureTrendStore();
    var projection = computeTrendScenarioProjection(payload || {});
    var persist = payload && payload.persist;
    var scenario = null;
    if (persist) {
      var trend = state.tools.trend;
      var nowIso = projection.createdAt || new Date().toISOString();
      if (payload.scenarioId) {
        for (var i = 0; i < trend.scenarios.length; i += 1) {
          if (trend.scenarios[i] && trend.scenarios[i].id === payload.scenarioId) {
            scenario = trend.scenarios[i];
            break;
          }
        }
      }
      if (!scenario) {
        scenario = {
          id: payload.scenarioId || uuid(),
          name: projection.name,
          createdAt: nowIso,
          updatedAt: nowIso,
          adjustments: [],
          horizonMinutes: projection.horizonMinutes,
          note: projection.note || "",
          lastProjection: null
        };
        trend.scenarios.push(scenario);
      }
      scenario.name = projection.name;
      scenario.note = projection.note || scenario.note || "";
      scenario.adjustments = JSON.parse(JSON.stringify(projection.adjustments));
      scenario.horizonMinutes = projection.horizonMinutes;
      scenario.updatedAt = nowIso;
      scenario.lastProjection = {
        createdAt: projection.createdAt,
        summary: projection.summary,
        nodes: projection.nodes.slice(0, 10)
      };
      recordTrendScenarioHistory(scenario, projection);
      saveState();
      emitTrendChange();
      projection.scenarioId = scenario.id;
    }
    if (!persist && payload && payload.scenarioId && !projection.scenarioId) {
      projection.scenarioId = payload.scenarioId;
    }
    return projection;
  }

  function listTrendScenarios() {
    return cloneTrendScenarios();
  }

  function removeTrendScenario(id) {
    ensureTrendStore();
    if (!id) {
      return false;
    }
    var trend = state.tools.trend;
    var next = [];
    var removed = false;
    for (var i = 0; i < trend.scenarios.length; i += 1) {
      var scenario = trend.scenarios[i];
      if (scenario && scenario.id === id) {
        removed = true;
      } else {
        next.push(scenario);
      }
    }
    if (removed) {
      trend.scenarios = next;
      saveState();
      emitTrendChange();
    }
    return removed;
  }

  function acceptTrendSuggestion(id, note) {
    ensureTrendStore();
    if (!id) {
      return;
    }
    for (var i = 0; i < state.tools.trend.suggestions.length; i += 1) {
      var item = state.tools.trend.suggestions[i];
      if (item && item.id === id) {
        item.status = "accepted";
        item.resolvedAt = new Date().toISOString();
        item.note = typeof note === "string" ? note.trim() : item.note;
        state.tools.trend.history.push({
          id: uuid(),
          kind: "accept",
          nodeId: item.nodeId,
          subNodeId: item.subNodeId,
          createdAt: item.resolvedAt,
          meta: { suggestionId: id, note: item.note || "" }
        });
        break;
      }
    }
    saveState();
    emitTrendChange();
  }

  function rejectTrendSuggestion(id, reason, correction) {
    ensureTrendStore();
    if (!id) {
      return;
    }
    for (var i = 0; i < state.tools.trend.suggestions.length; i += 1) {
      var item = state.tools.trend.suggestions[i];
      if (item && item.id === id) {
        item.status = "rejected";
        item.resolvedAt = new Date().toISOString();
        item.note = typeof reason === "string" ? reason.trim() : item.note;
        if (correction && typeof correction === "object") {
          recordTrendFeedback({
            suggestionId: id,
            rating: typeof correction.rating === "number" ? correction.rating : 0,
            note: correction.note || "",
            expected: correction.expected || "",
            user: correction.user || (currentUser ? currentUser.username : "")
          });
        }
        state.tools.trend.history.push({
          id: uuid(),
          kind: "reject",
          nodeId: item.nodeId,
          subNodeId: item.subNodeId,
          createdAt: item.resolvedAt,
          meta: { suggestionId: id, note: item.note || "" }
        });
        break;
      }
    }
    saveState();
    emitTrendChange();
  }

  function recordTrendFeedback(feedback) {
    ensureTrendStore();
    if (!feedback || typeof feedback !== "object") {
      return;
    }
    var now = new Date().toISOString();
    var entry = {
      id: uuid(),
      suggestionId: feedback.suggestionId || null,
      nodeId: feedback.nodeId || null,
      subNodeId: feedback.subNodeId || null,
      rating: typeof feedback.rating === "number" ? feedback.rating : 0,
      note: typeof feedback.note === "string" ? feedback.note.trim() : "",
      expected: typeof feedback.expected === "string" ? feedback.expected.trim() : "",
      createdAt: now,
      createdBy: feedback.user || (currentUser ? currentUser.username : "")
    };
    state.tools.trend.feedback.push(entry);
    if (entry.nodeId) {
      if (!state.tools.trend.model.calibrations[entry.nodeId]) {
        state.tools.trend.model.calibrations[entry.nodeId] = { ratingSum: 0, ratingCount: 0 };
      }
      var calibration = state.tools.trend.model.calibrations[entry.nodeId];
      calibration.ratingSum += entry.rating;
      calibration.ratingCount += 1;
    }
    state.tools.trend.history.push({
      id: uuid(),
      kind: "feedback",
      nodeId: entry.nodeId,
      subNodeId: entry.subNodeId,
      createdAt: now,
      meta: entry
    });
    saveState();
    emitTrendChange();
  }

  function removeTrendHistoryEntries(ids) {
    ensureTrendStore();
    if (!Array.isArray(ids) || ids.length === 0) {
      return;
    }
    var set = {};
    for (var i = 0; i < ids.length; i += 1) {
      set[ids[i]] = true;
    }
    state.tools.trend.history = state.tools.trend.history.filter(function (item) {
      return !item || !set[item.id];
    });
    saveState();
    emitTrendChange();
  }

  function clearTrendHistory(options) {
    ensureTrendStore();
    options = options || {};
    if (options.kind) {
      state.tools.trend.history = state.tools.trend.history.filter(function (item) {
        return item && item.kind !== options.kind;
      });
    } else {
      state.tools.trend.history = [];
    }
    saveState();
    emitTrendChange();
  }

  function registerTrendMesEndpoint(endpoint) {
    ensureTrendStore();
    if (!endpoint || typeof endpoint !== "object") {
      return null;
    }
    if (!state.tools.trend.settings.mesEndpoints) {
      state.tools.trend.settings.mesEndpoints = [];
    }
    var descriptor = {
      id: endpoint.id || uuid(),
      name: endpoint.name || "MES 数据源",
      type: endpoint.type || "rest",
      url: endpoint.url || "",
      database: endpoint.database || "",
      table: endpoint.table || "",
      enabled: typeof endpoint.enabled === "boolean" ? endpoint.enabled : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: endpoint.notes || "",
      format: endpoint.format || "json"
    };
    state.tools.trend.settings.mesEndpoints.push(descriptor);
    saveState();
    emitTrendChange();
    return descriptor;
  }

  function updateTrendMesEndpoint(id, patch) {
    ensureTrendStore();
    if (!id || !patch) {
      return null;
    }
    var endpoints = state.tools.trend.settings.mesEndpoints || [];
    for (var i = 0; i < endpoints.length; i += 1) {
      if (endpoints[i] && endpoints[i].id === id) {
        var target = endpoints[i];
        if (typeof patch.name === "string" && patch.name.trim()) {
          target.name = patch.name.trim();
        }
        if (typeof patch.type === "string") {
          target.type = patch.type;
        }
        if (typeof patch.url === "string") {
          target.url = patch.url;
        }
        if (typeof patch.database === "string") {
          target.database = patch.database;
        }
        if (typeof patch.table === "string") {
          target.table = patch.table;
        }
        if (typeof patch.enabled === "boolean") {
          target.enabled = patch.enabled;
        }
        if (typeof patch.notes === "string") {
          target.notes = patch.notes;
        }
        if (typeof patch.format === "string") {
          target.format = patch.format;
        }
        target.updatedAt = new Date().toISOString();
        saveState();
        emitTrendChange();
        return target;
      }
    }
    return null;
  }

  function removeTrendMesEndpoint(id) {
    ensureTrendStore();
    if (!id) {
      return;
    }
    var endpoints = state.tools.trend.settings.mesEndpoints || [];
    for (var i = endpoints.length - 1; i >= 0; i -= 1) {
      if (endpoints[i] && endpoints[i].id === id) {
        endpoints.splice(i, 1);
      }
    }
    saveState();
    emitTrendChange();
  }

  function listTrendMesEndpoints() {
    ensureTrendStore();
    return cloneTrendSettings().mesEndpoints || [];
  }

  function fetchTrendSamplesFromEndpoint(descriptor, params) {
    return new Promise(function (resolve) {
      console.info("fetchTrendSamplesFromEndpoint placeholder", descriptor, params);
      resolve({ samples: [], meta: { message: "MES 接口尚未接入" } });
    });
  }

  function ensureVisionStore() {
    if (!state.tools || typeof state.tools !== "object") {
      state.tools = {};
    }
    if (!Array.isArray(state.tools.visionHistory)) {
      state.tools.visionHistory = [];
    }
    if (!Array.isArray(state.tools.visionCorrections)) {
      state.tools.visionCorrections = [];
    }
  }

  function cloneVisionHistory() {
    ensureVisionStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.visionHistory));
    } catch (err) {
      console.warn("cloneVisionHistory failed", err);
      return [];
    }
  }

  function cloneVisionCorrections() {
    ensureVisionStore();
    try {
      return JSON.parse(JSON.stringify(state.tools.visionCorrections));
    } catch (err) {
      console.warn("cloneVisionCorrections failed", err);
      return [];
    }
  }

  function buildVisionCorrectionFingerprint(source) {
    if (!source) {
      return "";
    }
    var area = typeof source.areaRatio === "number" ? source.areaRatio : 0;
    if (area < 0) {
      area = 0;
    } else if (area > 1) {
      area = 1;
    }
    var heat = typeof source.heatScore === "number" ? source.heatScore : 0;
    if (heat < 0) {
      heat = 0;
    } else if (heat > 1) {
      heat = 1;
    }
    var aspect = typeof source.aspectRatio === "number" && source.aspectRatio > 0 ? source.aspectRatio : 1;
    if (aspect < 1) {
      aspect = 1;
    } else if (aspect > 8) {
      aspect = 8;
    }
    var areaBucket = Math.round(area * 100);
    var heatBucket = Math.round(heat * 100);
    var aspectBucket = Math.round((aspect - 1) * 10);
    return areaBucket + ":" + heatBucket + ":" + aspectBucket;
  }

  function findVisionInferenceById(id) {
    ensureVisionStore();
    if (!id) {
      return null;
    }
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      if (state.tools.visionHistory[i] && state.tools.visionHistory[i].id === id) {
        return state.tools.visionHistory[i];
      }
    }
    return null;
  }

  function safeDateString(value, fallback) {
    if (!value) {
      return fallback;
    }
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return fallback;
    }
    return date.toISOString();
  }

  function getVisionCorrections() {
    return cloneVisionCorrections();
  }

  function getVisionSnapshot() {
    return {
      history: cloneVisionHistory(),
      groups: getContaminationGroups(),
      corrections: cloneVisionCorrections()
    };
  }

  function emitVisionChange() {
    if (!visionSubscribers || visionSubscribers.length === 0) {
      return;
    }
    var snapshot = getVisionSnapshot();
    for (var i = 0; i < visionSubscribers.length; i += 1) {
      try {
        visionSubscribers[i](snapshot);
      } catch (err) {
        console.error("vision subscriber error", err);
      }
    }
  }

  function subscribeVision(callback) {
    if (typeof callback !== "function") {
      return function () {};
    }
    visionSubscribers.push(callback);
    try {
      callback(getVisionSnapshot());
    } catch (err) {
      console.error("vision init callback error", err);
    }
    return function () {
      var index = visionSubscribers.indexOf(callback);
      if (index !== -1) {
        visionSubscribers.splice(index, 1);
      }
    };
  }

  function recordVisionInference(entry, options) {
    ensureVisionStore();
    if (!entry) {
      return null;
    }
    options = options || {};
    var silent = !!options.silent;
    var append = !!options.append;
    var now = new Date().toISOString();
    var runSource = entry.runAt || entry.createdAt || now;
    var runAt = safeDateString(runSource, now);
    var createdAt = safeDateString(entry.createdAt, runAt);
    var updatedAt = safeDateString(entry.updatedAt, now);
    var analyst = typeof entry.analyst === "string" && entry.analyst ? entry.analyst : (currentUser ? currentUser.username : "");
    var activeBank = getActiveBank();
    var bankId = entry.bankId || (state.activeBankId || null);
    var bankName = typeof entry.bankName === "string" && entry.bankName ? entry.bankName : (activeBank ? activeBank.name : "");
    var sanitizedModel = { name: "虹小聊·ThermoClean", version: "", inferenceMs: 0, source: "" };
    if (entry.model && typeof entry.model === "object") {
      if (typeof entry.model.name === "string" && entry.model.name) {
        sanitizedModel.name = entry.model.name;
      }
      if (typeof entry.model.version === "string") {
        sanitizedModel.version = entry.model.version;
      }
      if (typeof entry.model.inferenceMs === "number") {
        sanitizedModel.inferenceMs = entry.model.inferenceMs;
      } else if (entry.model.inferenceMs) {
        var parsedMs = parseInt(entry.model.inferenceMs, 10);
        if (!isNaN(parsedMs)) {
          sanitizedModel.inferenceMs = parsedMs;
        }
      }
      if (typeof entry.model.source === "string") {
        sanitizedModel.source = entry.model.source;
      }
    }
    var sanitizedImage = null;
    if (entry.image && typeof entry.image === "object") {
      sanitizedImage = {
        dataUrl: typeof entry.image.dataUrl === "string" ? entry.image.dataUrl : "",
        width: typeof entry.image.width === "number" ? entry.image.width : (entry.image.width ? parseInt(entry.image.width, 10) || 0 : 0),
        height: typeof entry.image.height === "number" ? entry.image.height : (entry.image.height ? parseInt(entry.image.height, 10) || 0 : 0),
        originalWidth: typeof entry.image.originalWidth === "number" ? entry.image.originalWidth : (entry.image.width ? parseInt(entry.image.width, 10) || 0 : 0),
        originalHeight: typeof entry.image.originalHeight === "number" ? entry.image.originalHeight : (entry.image.height ? parseInt(entry.image.height, 10) || 0 : 0),
        name: typeof entry.image.name === "string" ? entry.image.name : "",
        previewDataUrl: typeof entry.image.previewDataUrl === "string" ? entry.image.previewDataUrl : (typeof entry.image.dataUrl === "string" ? entry.image.dataUrl : "")
      };
    }
    var sanitized = {
      id: entry.id || uuid(),
      runAt: runAt,
      analyst: analyst,
      bankId: bankId,
      bankName: bankName,
      model: sanitizedModel,
      image: sanitizedImage,
      findings: [],
      summary: entry.summary || null,
      notes: typeof entry.notes === "string" ? entry.notes : "",
      exports: [],
      lastExportedAt: entry.lastExportedAt || null,
      lastExportFile: typeof entry.lastExportFile === "string" ? entry.lastExportFile : "",
      annotations: [],
      strokes: [],
      createdAt: createdAt,
      updatedAt: updatedAt
    };
    var rawExports = Array.isArray(entry.exports) ? entry.exports : [];
    for (var ex = 0; ex < rawExports.length; ex += 1) {
      var rawExport = rawExports[ex];
      if (!rawExport || typeof rawExport !== "object") {
        continue;
      }
      sanitized.exports.push({
        id: rawExport.id || uuid(),
        createdAt: safeDateString(rawExport.createdAt, now),
        fileName: typeof rawExport.fileName === "string" ? rawExport.fileName : "",
        createdBy: typeof rawExport.createdBy === "string" && rawExport.createdBy ? rawExport.createdBy : analyst
      });
    }
    if (entry.findings && Array.isArray(entry.findings)) {
      for (var i = 0; i < entry.findings.length; i += 1) {
        var finding = entry.findings[i];
        if (!finding || typeof finding !== "object") {
          continue;
        }
        sanitized.findings.push({
          id: finding.id || uuid(),
          type: finding.type || "未知类型",
          probability: typeof finding.probability === "number" ? finding.probability : 0,
          group: finding.group || null,
          status: finding.status || "auto",
          bounds: finding.bounds || null,
          metrics: finding.metrics || null,
          probabilities: finding.probabilities || null,
          notes: typeof finding.notes === "string" ? finding.notes : "",
          createdAt: safeDateString(finding.createdAt, runAt)
        });
      }
    }
    if (entry.strokes && Array.isArray(entry.strokes)) {
      for (var st = 0; st < entry.strokes.length; st += 1) {
        var stroke = entry.strokes[st];
        if (!stroke || !Array.isArray(stroke.points)) {
          continue;
        }
        var points = [];
        for (var sp = 0; sp < stroke.points.length; sp += 1) {
          var point = stroke.points[sp];
          if (!point) {
            continue;
          }
          var px = typeof point.x === "number" ? point.x : parseFloat(point.x || "0");
          var py = typeof point.y === "number" ? point.y : parseFloat(point.y || "0");
          points.push({ x: px, y: py });
        }
        if (points.length === 0) {
          continue;
        }
        sanitized.strokes.push({
          id: stroke.id || uuid(),
          width: typeof stroke.width === "number" ? stroke.width : 3,
          color: typeof stroke.color === "string" ? stroke.color : "rgba(250,84,28,0.92)",
          points: points
        });
      }
    }
    if (entry.annotations && Array.isArray(entry.annotations)) {
      for (var an = 0; an < entry.annotations.length; an += 1) {
        var annotation = entry.annotations[an];
        if (!annotation || typeof annotation !== "object") {
          continue;
        }
        var ax = typeof annotation.x === "number" ? annotation.x : parseFloat(annotation.x || "0");
        var ay = typeof annotation.y === "number" ? annotation.y : parseFloat(annotation.y || "0");
        sanitized.annotations.push({
          id: annotation.id || uuid(),
          x: ax,
          y: ay,
          text: typeof annotation.text === "string" ? annotation.text : ""
        });
      }
    }
    for (var existing = state.tools.visionHistory.length - 1; existing >= 0; existing -= 1) {
      if (state.tools.visionHistory[existing].id === sanitized.id) {
        state.tools.visionHistory.splice(existing, 1);
      }
    }
    if (append) {
      state.tools.visionHistory.push(sanitized);
    } else {
      state.tools.visionHistory.unshift(sanitized);
    }
    state.tools.visionHistory.sort(function (a, b) {
      var at = new Date(a.runAt || a.createdAt || 0).getTime();
      var bt = new Date(b.runAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    if (!silent) {
      saveState();
      emitVisionChange();
    }
    return JSON.parse(JSON.stringify(sanitized));
  }

  function updateVisionFinding(inferenceId, findingId, patch) {
    ensureVisionStore();
    if (!inferenceId || !findingId || !patch) {
      return null;
    }
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      var inference = state.tools.visionHistory[i];
      if (inference.id !== inferenceId) {
        continue;
      }
      if (!Array.isArray(inference.findings)) {
        continue;
      }
      for (var j = 0; j < inference.findings.length; j += 1) {
        var finding = inference.findings[j];
        if (finding.id !== findingId) {
          continue;
        }
        for (var key in patch) {
          if (patch.hasOwnProperty(key)) {
            finding[key] = patch[key];
          }
        }
        inference.updatedAt = new Date().toISOString();
        saveState();
        emitVisionChange();
        return JSON.parse(JSON.stringify(finding));
      }
    }
    return null;
  }

  function addVisionFinding(inferenceId, payload) {
    ensureVisionStore();
    if (!inferenceId) {
      return null;
    }
    var host = null;
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      if (state.tools.visionHistory[i].id === inferenceId) {
        host = state.tools.visionHistory[i];
        break;
      }
    }
    if (!host) {
      return null;
    }
    if (!Array.isArray(host.findings)) {
      host.findings = [];
    }
    var now = new Date().toISOString();
    var source = payload && typeof payload === "object" ? payload : {};
    var probability = typeof source.probability === "number" ? source.probability : 0;
    if (probability < 0) {
      probability = 0;
    }
    if (probability > 1) {
      probability = 1;
    }
    var finding = {
      id: source.id || uuid(),
      type: source.type || "待分类",
      probability: probability,
      group: source.group || null,
      status: source.status || "manual",
      bounds: source.bounds || null,
      metrics: source.metrics || null,
      probabilities: source.probabilities || null,
      notes: typeof source.notes === "string" ? source.notes : "",
      createdAt: safeDateString(source.createdAt, now),
      createdBy: typeof source.createdBy === "string" ? source.createdBy : (currentUser ? currentUser.username : "")
    };
    host.findings.push(finding);
    host.updatedAt = now;
    saveState();
    emitVisionChange();
    try {
      return JSON.parse(JSON.stringify(finding));
    } catch (err) {
      return finding;
    }
  }

  function removeVisionFinding(inferenceId, findingId) {
    ensureVisionStore();
    if (!inferenceId || !findingId) {
      return false;
    }
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      var record = state.tools.visionHistory[i];
      if (record.id !== inferenceId || !Array.isArray(record.findings)) {
        continue;
      }
      for (var j = 0; j < record.findings.length; j += 1) {
        if (record.findings[j].id === findingId) {
          record.findings.splice(j, 1);
          record.updatedAt = new Date().toISOString();
          saveState();
          emitVisionChange();
          return true;
        }
      }
    }
    return false;
  }

  function updateVisionInference(inferenceId, patch) {
    ensureVisionStore();
    if (!inferenceId || !patch) {
      return null;
    }
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      var inference = state.tools.visionHistory[i];
      if (inference.id !== inferenceId) {
        continue;
      }
      for (var key in patch) {
        if (patch.hasOwnProperty(key)) {
          if (key === "exports" && Array.isArray(patch[key])) {
            var newExports = [];
            for (var e = 0; e < patch[key].length; e += 1) {
              var item = patch[key][e];
              if (!item || typeof item !== "object") {
                continue;
              }
              newExports.push({
                id: item.id || uuid(),
                createdAt: item.createdAt || new Date().toISOString(),
                fileName: typeof item.fileName === "string" ? item.fileName : "",
                createdBy: typeof item.createdBy === "string" ? item.createdBy : (currentUser ? currentUser.username : "")
              });
            }
            inference.exports = newExports;
            continue;
          }
          if (key === "strokes" && Array.isArray(patch[key])) {
            var sanitizedStrokes = [];
            for (var st = 0; st < patch[key].length; st += 1) {
              var stroke = patch[key][st];
              if (!stroke || !Array.isArray(stroke.points)) {
                continue;
              }
              var strokePoints = [];
              for (var sp = 0; sp < stroke.points.length; sp += 1) {
                var point = stroke.points[sp];
                if (!point) {
                  continue;
                }
                var px = typeof point.x === "number" ? point.x : parseFloat(point.x || "0");
                var py = typeof point.y === "number" ? point.y : parseFloat(point.y || "0");
                strokePoints.push({ x: px, y: py });
              }
              if (strokePoints.length === 0) {
                continue;
              }
              sanitizedStrokes.push({
                id: stroke.id || uuid(),
                width: typeof stroke.width === "number" ? stroke.width : 3,
                color: typeof stroke.color === "string" ? stroke.color : "rgba(250,84,28,0.92)",
                points: strokePoints
              });
            }
            inference.strokes = sanitizedStrokes;
            continue;
          }
          if (key === "annotations" && Array.isArray(patch[key])) {
            var sanitizedAnnotations = [];
            for (var an = 0; an < patch[key].length; an += 1) {
              var annotation = patch[key][an];
              if (!annotation || typeof annotation !== "object") {
                continue;
              }
              var ax = typeof annotation.x === "number" ? annotation.x : parseFloat(annotation.x || "0");
              var ay = typeof annotation.y === "number" ? annotation.y : parseFloat(annotation.y || "0");
              sanitizedAnnotations.push({
                id: annotation.id || uuid(),
                x: ax,
                y: ay,
                text: typeof annotation.text === "string" ? annotation.text : ""
              });
            }
            inference.annotations = sanitizedAnnotations;
            continue;
          }
          if (key === "notes") {
            inference.notes = typeof patch[key] === "string" ? patch[key] : "";
            continue;
          }
          if (key === "lastExportedAt" && patch[key]) {
            inference.lastExportedAt = String(patch[key]);
            continue;
          }
          if (key === "lastExportFile") {
            inference.lastExportFile = typeof patch[key] === "string" ? patch[key] : "";
            continue;
          }
          inference[key] = patch[key];
        }
      }
      inference.updatedAt = new Date().toISOString();
      saveState();
      emitVisionChange();
      return JSON.parse(JSON.stringify(inference));
    }
    return null;
  }

  function recordVisionCorrection(correction) {
    ensureVisionStore();
    if (!correction) {
      return null;
    }
    var host = correction.inferenceId ? findVisionInferenceById(correction.inferenceId) : null;
    var payload = {
      id: correction.id || uuid(),
      inferenceId: correction.inferenceId || "",
      findingId: correction.findingId || "",
      previousType: correction.previousType || "",
      targetType: correction.targetType || "",
      probability: typeof correction.probability === "number" ? correction.probability : 0,
      areaRatio: typeof correction.areaRatio === "number" ? correction.areaRatio : 0,
      heatScore: typeof correction.heatScore === "number" ? correction.heatScore : 0,
      aspectRatio: typeof correction.aspectRatio === "number" ? correction.aspectRatio : 0,
      group: correction.group || null,
      note: correction.note || "",
      correctedBy: correction.correctedBy || (currentUser ? currentUser.username : ""),
      correctedAt: correction.correctedAt || new Date().toISOString(),
      bankId: host && host.bankId ? host.bankId : (correction.bankId || null)
    };
    payload.fingerprint = correction.fingerprint || buildVisionCorrectionFingerprint(payload);
    for (var i = state.tools.visionCorrections.length - 1; i >= 0; i -= 1) {
      var existing = state.tools.visionCorrections[i];
      if (existing && existing.inferenceId === payload.inferenceId && existing.findingId === payload.findingId) {
        state.tools.visionCorrections.splice(i, 1);
      }
    }
    state.tools.visionCorrections.push(payload);
    if (state.tools.visionCorrections.length > 200) {
      state.tools.visionCorrections = state.tools.visionCorrections.slice(-200);
    }
    saveState();
    emitVisionChange();
    return JSON.parse(JSON.stringify(payload));
  }

  function importVisionHistoryRecords(records) {
    ensureVisionStore();
    if (!records) {
      return { imported: 0, total: 0 };
    }
    var list = [];
    if (Array.isArray(records)) {
      list = records;
    } else if (records && Array.isArray(records.records)) {
      list = records.records;
    } else if (records && typeof records === "object") {
      list = [records];
    }
    var imported = 0;
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      try {
        recordVisionInference(item, { append: true, silent: true });
        imported += 1;
      } catch (err) {
        console.warn("import vision record failed", err);
      }
    }
    if (imported > 0) {
      saveState();
      emitVisionChange();
    }
    return { imported: imported, total: list.length };
  }

  function renderBankList() {
    var container = document.getElementById("bankList");
    if (!container) {
      return;
    }
    ensureBankMenu();
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
          closeBankMenu();
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
          renderCommonList();
          favoriteSearchTerm = "";
          var searchInput = document.getElementById("favoriteSearch");
          if (searchInput) {
            searchInput.value = "";
          }
          renderFavoritesList();
          renderFavoriteChips();
          renderFloatingFavorite();
          renderLogs();
        });
        badge.addEventListener("contextmenu", function (evt) {
          evt.preventDefault();
          evt.stopPropagation();
          openBankMenu(bank.id, evt.pageX, evt.pageY);
        });
        badge.addEventListener("dblclick", function (evt) {
          evt.preventDefault();
          evt.stopPropagation();
          renameBank(bank.id);
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
      favorites: [],
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
    renderCommonChips();
    renderFavoriteChips();
    renderFavoritesList();
    renderFloatingFavorite();
  }

  function renameBank(bankId) {
    var bank = findBankById(bankId);
    if (!bank) {
      return;
    }
    var name = window.prompt("记忆库名称", bank.name || "");
    if (name === null) {
      return;
    }
    var trimmed = name.trim();
    if (!trimmed) {
      showToast("名称不能为空");
      return;
    }
    bank.name = trimmed;
    bank.logo = bankLogoText(trimmed);
    saveState();
    renderBankList();
    updateBankBadge();
    renderCommonChips();
    renderCommonList();
    showToast("记忆库已重命名");
  }

  function removeBankById(bankId) {
    var index = -1;
    for (var i = 0; i < state.banks.length; i += 1) {
      if (state.banks[i].id === bankId) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      return false;
    }
    state.banks.splice(index, 1);
    if (state.activeBankId === bankId) {
      if (state.banks.length > 0) {
        state.activeBankId = state.banks[0].id;
        state.activeSessionId = state.banks[0].sessions.length > 0 ? state.banks[0].sessions[0].id : null;
      } else {
        state.activeBankId = null;
        state.activeSessionId = null;
      }
    } else {
      var activeBank = getActiveBank();
      if (activeBank) {
        var hasSession = false;
        for (var s = 0; s < activeBank.sessions.length; s += 1) {
          if (activeBank.sessions[s].id === state.activeSessionId) {
            hasSession = true;
            break;
          }
        }
        if (!hasSession) {
          state.activeSessionId = activeBank.sessions.length > 0 ? activeBank.sessions[0].id : null;
        }
      } else {
        state.activeSessionId = null;
      }
    }
    ensureActiveBank();
    saveState();
    renderBankList();
    updateBankBadge();
    renderSessionList();
    renderCommonChips();
    renderCommonList();
    renderFavoriteChips();
    renderFavoritesList();
    renderChat();
    renderKnowledge();
    renderFloatingFavorite();
    renderLogs();
    renderDecisionHistory();
    showToast("记忆库已删除");
    return true;
  }

  function closeBankMenu() {
    var menu = document.getElementById("bankMenu");
    if (menu) {
      menu.classList.add("hidden");
    }
    bankMenuBankId = null;
  }

  function ensureBankMenu() {
    var menu = document.getElementById("bankMenu");
    if (menu) {
      return menu;
    }
    menu = document.createElement("div");
    menu.id = "bankMenu";
    menu.className = "context-menu hidden";
    var renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "重命名记忆库";
    renameBtn.setAttribute("data-action", "rename");
    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "删除记忆库";
    deleteBtn.className = "danger";
    deleteBtn.setAttribute("data-action", "delete");
    menu.appendChild(renameBtn);
    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);
    menu.addEventListener("click", function (evt) {
      var target = evt.target;
      if (!target || target.tagName !== "BUTTON") {
        return;
      }
      var action = target.getAttribute("data-action");
      var targetId = bankMenuBankId;
      closeBankMenu();
      if (!targetId || !action) {
        return;
      }
      if (action === "rename") {
        renameBank(targetId);
      } else if (action === "delete") {
        if (window.confirm("确定删除该记忆库？所有会话与知识将被移除")) {
          removeBankById(targetId);
        }
      }
    });
    return menu;
  }

  function openBankMenu(bankId, x, y) {
    var menu = ensureBankMenu();
    if (!menu) {
      return;
    }
    bankMenuBankId = bankId;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.remove("hidden");
    window.requestAnimationFrame(function () {
      var rect = menu.getBoundingClientRect();
      var left = rect.left;
      var top = rect.top;
      if (rect.right > window.innerWidth) {
        left = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (rect.bottom > window.innerHeight) {
        top = Math.max(8, window.innerHeight - rect.height - 8);
      }
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    });
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

  function closeSessionMenu() {
    var menu = document.getElementById("sessionMenu");
    if (menu) {
      menu.classList.add("hidden");
    }
    sessionMenuSessionId = null;
  }

  function openSessionMenu(sessionId, x, y) {
    var menu = document.getElementById("sessionMenu");
    if (!menu) {
      return;
    }
    sessionMenuSessionId = sessionId;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.remove("hidden");
    window.requestAnimationFrame(function () {
      var rect = menu.getBoundingClientRect();
      var left = rect.left;
      var top = rect.top;
      if (rect.right > window.innerWidth) {
        left = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (rect.bottom > window.innerHeight) {
        top = Math.max(8, window.innerHeight - rect.height - 8);
      }
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    });
  }

  function promptRenameSession(session) {
    if (!session) {
      return;
    }
    var name = window.prompt("会话名称", session.title || "");
    if (name === null) {
      return;
    }
    var trimmed = name.trim();
    if (!trimmed) {
      trimmed = "新会话";
    }
    session.title = trimmed;
    session.manualTitle = true;
    saveState();
    renderSessionList();
    renderChat();
    showToast("会话名称已更新");
  }

  function promptSessionNote(session) {
    if (!session) {
      return;
    }
    var note = window.prompt("会话备注", session.note || "");
    if (note === null) {
      return;
    }
    session.note = note.trim();
    saveState();
    renderSessionList();
    showToast(session.note ? "备注已更新" : "备注已清除");
  }

  function renderSessionList() {
    var container = document.getElementById("sessionList");
    if (!container) {
      return;
    }
    closeSessionMenu();
    container.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      sessionListRenderedBankId = null;
      return;
    }
    if (sessionListRenderedBankId !== bank.id) {
      sessionListRenderedBankId = bank.id;
      sessionListDisplayLimit = SESSION_LIST_MIN;
    }
    var totalSessions = bank.sessions.length;
    var limit = sessionListDisplayLimit;
    if (!limit || limit < SESSION_LIST_MIN) {
      limit = SESSION_LIST_MIN;
    }
    if (totalSessions < limit) {
      limit = totalSessions;
    }
    sessionListDisplayLimit = limit;
    for (var i = 0; i < bank.sessions.length && i < limit; i += 1) {
      (function (session) {
        var card = document.createElement("div");
        card.className = "session-card" + (session.id === state.activeSessionId ? " active" : "");
        card.dataset.id = session.id;
        card.title = session.note ? session.note : session.title;
        var info = document.createElement("div");
        info.className = "session-info";
        var title = document.createElement("div");
        title.className = "session-title";
        title.textContent = session.title;
        info.appendChild(title);
        if (session.note) {
          var note = document.createElement("div");
          note.className = "session-note";
          note.textContent = snippetText(session.note, 48);
          info.appendChild(note);
        }
        var actions = document.createElement("div");
        actions.className = "session-actions";

        var favoriteBtn = document.createElement("button");
        favoriteBtn.className = "session-favorite";
        favoriteBtn.type = "button";
        favoriteBtn.textContent = "收藏";
        favoriteBtn.title = "收藏当前会话";
        favoriteBtn.addEventListener("click", function (evt) {
          evt.stopPropagation();
          addFavoriteFromSession(session.id);
        });
        actions.appendChild(favoriteBtn);

        var remove = document.createElement("button");
        remove.className = "session-remove";
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", function (evt) {
          evt.stopPropagation();
          if (window.confirm("确定删除该会话吗？")) {
            removeSession(bank, session.id);
            renderSessionList();
            renderChat();
          }
        });
        actions.appendChild(remove);

        card.appendChild(info);
        card.appendChild(actions);
        card.addEventListener("click", function () {
          state.activeSessionId = session.id;
          saveState();
          renderSessionList();
          renderChat();
        });
        card.addEventListener("contextmenu", function (evt) {
          evt.preventDefault();
          openSessionMenu(session.id, evt.clientX, evt.clientY);
        });
        container.appendChild(card);
      })(bank.sessions[i]);
    }
    if (bank.sessions.length > limit) {
      var loadMore = document.createElement("button");
      loadMore.type = "button";
      loadMore.className = "session-load-more";
      loadMore.textContent = "加载更多会话";
      loadMore.addEventListener("click", function (evt) {
        evt.preventDefault();
        sessionListDisplayLimit = Math.min(bank.sessions.length, limit + SESSION_LIST_STEP);
        renderSessionList();
      });
      container.appendChild(loadMore);
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
      note: "",
      manualTitle: false
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
    if (session.manualTitle) {
      return;
    }
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

  function closeMessageMenu() {
    var menu = document.getElementById("messageMenu");
    if (menu) {
      menu.classList.add("hidden");
    }
    messageMenuInfo = null;
  }

  function closeChatToolMenu() {
    var menu = document.getElementById("chatToolMenu");
    var toggle = document.getElementById("chatToolMenuToggle");
    if (menu) {
      menu.classList.add("hidden");
    }
    if (toggle) {
      toggle.classList.remove("active");
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  function handleGlobalMenuClose() {
    closeMessageMenu();
    closeChatToolMenu();
  }

  function openMessageMenu(sessionId, messageId, x, y) {
    var menu = document.getElementById("messageMenu");
    if (!menu) {
      return;
    }
    closeMessageMenu();
    messageMenuInfo = {
      sessionId: sessionId,
      messageId: messageId
    };
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.remove("hidden");
    window.requestAnimationFrame(function () {
      var rect = menu.getBoundingClientRect();
      var left = rect.left;
      var top = rect.top;
      if (rect.right > window.innerWidth) {
        left = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (rect.bottom > window.innerHeight) {
        top = Math.max(8, window.innerHeight - rect.height - 8);
      }
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    });
  }

  function renderChat() {
    var area = document.getElementById("chatArea");
    if (!area) {
      return;
    }
    closeMessageMenu();
    closeChatToolMenu();
    area.innerHTML = "";
    var bank = getActiveBank();
    if (!bank) {
      renderEvidence([], []);
      area.innerHTML = '<div class="message"><div class="message-bubble"><div class="content">请先创建记忆库</div></div></div>';
      return;
    }
    renderFavoriteChips();
    var session = findSession(bank, state.activeSessionId);
    if (!session) {
      renderEvidence([], []);
      area.innerHTML = '<div class="message"><div class="message-bubble"><div class="content">请选择或新建会话</div></div></div>';
      return;
    }
    for (var i = 0; i < session.messages.length; i += 1) {
      var message = session.messages[i];
      var role = message.role === "user" ? "user" : "assistant";
      var wrapper = document.createElement("div");
      wrapper.className = "message " + role;
      wrapper.dataset.messageId = message.id || "";
      wrapper.dataset.sessionId = session.id;
      var avatar = document.createElement("div");
      avatar.className = "message-avatar " + role;
      avatar.textContent = role === "user" ? "我" : "虹";
      var bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.addEventListener("contextmenu", function (evt) {
        evt.preventDefault();
        var container = evt.currentTarget.parentElement;
        if (!container) {
          return;
        }
        var msgId = container.dataset.messageId;
        var sessId = container.dataset.sessionId;
        openMessageMenu(sessId, msgId, evt.clientX + 4, evt.clientY + 4);
      });
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = role === "user" ? "用户" : "助理";
      var content = document.createElement("div");
      content.className = "content";
      if (role === "user") {
        content.textContent = message.text;
      } else {
        content.innerHTML = highlightKeywords(message.text, message.tags || []);
      }
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
      if (role === "assistant") {
        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
      } else {
        wrapper.appendChild(bubble);
        wrapper.appendChild(avatar);
      }
      area.appendChild(wrapper);
    }
    area.scrollTop = area.scrollHeight;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        area.scrollTop = area.scrollHeight;
      });
    } else {
      setTimeout(function () {
        area.scrollTop = area.scrollHeight;
      }, 0);
    }
  }

  function renderCommonChips() {
    var row = document.getElementById("commonRow");
    var bar = document.getElementById("commonChips");
    if (!bar || !row) {
      return;
    }
    bar.innerHTML = "";
    var bank = getActiveBank();
    if (!bank || !bank.common || bank.common.length === 0) {
      row.classList.add("hidden");
      return;
    }
    row.classList.remove("hidden");
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
    var grouped = { decision: [], knowledge: [] };
    for (var i = 0; i < evidence.length; i += 1) {
      var item = evidence[i];
      if (item.type === "decision") {
        grouped.decision.push(item);
      } else {
        grouped.knowledge.push(item);
      }
    }
    var order = ["decision", "knowledge"];
    var titles = { decision: "决策链依据", knowledge: "知识库依据" };
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
        var label = info.source || "";
        if (!label) {
          label = type === "decision" ? "决策链记录" : (info.origin === "favorite" ? "收藏内容" : "知识库段落");
        }
        var sourceTooltip = "";
        if (type !== "decision" && info.fileName) {
          sourceTooltip = info.fileName;
          if (info.chunkOrder && info.chunkOrder > 0) {
            sourceTooltip += " · 第" + info.chunkOrder + "段";
          }
        }
        var source;
        if (info.favoriteId) {
          source = document.createElement("button");
          source.type = "button";
          source.className = "evidence-source evidence-source-button";
          source.textContent = label;
          source.addEventListener("click", (function (favoriteId, bankId, messageId) {
            return function (evt) {
              evt.preventDefault();
              evt.stopPropagation();
              openFavoriteEvidence(favoriteId, bankId, messageId);
            };
          })(info.favoriteId, info.favoriteBankId || null, info.favoriteMessageId || null));
        } else if (info.url) {
          source = document.createElement("a");
          source.className = "evidence-source";
          source.href = info.url;
          source.target = "_blank";
          source.rel = "noopener";
          source.textContent = label;
        } else {
          source = document.createElement("span");
          source.className = "evidence-source";
          source.textContent = label;
        }
        if (sourceTooltip) {
          source.title = sourceTooltip;
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
        if (sourceTooltip) {
          var subtitle = document.createElement("div");
          subtitle.className = "evidence-subtitle";
          subtitle.textContent = "来源：" + sourceTooltip;
          card.appendChild(subtitle);
        }
        if (info.text) {
          var body = document.createElement("div");
          body.className = "evidence-body";
          var limit = embedded ? 140 : 200;
          body.innerHTML = highlightKeywords(snippetText(info.text, limit), highlightKeys);
          card.appendChild(body);
        }
        if (info.duplicates && info.duplicates.length > 0) {
          var duplicateCount = info.duplicates.length;
          var toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "evidence-toggle";
          toggle.textContent = "显示重复来源 (" + duplicateCount + ")";
          var dupList = document.createElement("div");
          dupList.className = "evidence-duplicates hidden";
          for (var d = 0; d < info.duplicates.length; d += 1) {
            var dup = info.duplicates[d];
            var dupCard = document.createElement("div");
            dupCard.className = "evidence-duplicate";
            var dupHeader = document.createElement("div");
            dupHeader.className = "evidence-duplicate-header";
            var dupLabel = dup.source || info.source;
            if (type !== "decision" && dup.fileName) {
              var dupInfo = dup.fileName;
              if (dup.chunkOrder && dup.chunkOrder > 0) {
                dupInfo += " · 第" + dup.chunkOrder + "段";
              }
              if (dupLabel && dupInfo.indexOf(dupLabel) === -1) {
                dupLabel += "（" + dupInfo + "）";
              }
            }
            var dupSource;
            if (dup.favoriteId) {
              dupSource = document.createElement("button");
              dupSource.type = "button";
              dupSource.className = "evidence-duplicate-source evidence-source-button";
              dupSource.textContent = dupLabel;
              dupSource.addEventListener("click", (function (favoriteId, bankId, messageId) {
                return function (evt) {
                  evt.preventDefault();
                  evt.stopPropagation();
                  openFavoriteEvidence(favoriteId, bankId, messageId);
                };
              })(dup.favoriteId, dup.favoriteBankId || info.favoriteBankId || null, dup.favoriteMessageId || null));
            } else if (dup.url) {
              dupSource = document.createElement("a");
              dupSource.className = "evidence-duplicate-source";
              dupSource.href = dup.url;
              dupSource.target = "_blank";
              dupSource.rel = "noopener";
              dupSource.textContent = dupLabel;
            } else {
              dupSource = document.createElement("span");
              dupSource.className = "evidence-duplicate-source";
              dupSource.textContent = dupLabel;
            }
            dupHeader.appendChild(dupSource);
            if (typeof dup.score === "number") {
              var dupScore = document.createElement("span");
              dupScore.className = "evidence-score";
              if (type === "knowledge") {
                dupScore.textContent = dup.score.toFixed(2);
              } else {
                dupScore.textContent = Math.round(dup.score) + "%";
              }
              dupHeader.appendChild(dupScore);
            }
            dupCard.appendChild(dupHeader);
            if (dup.text) {
              var dupBody = document.createElement("div");
              dupBody.className = "evidence-body";
              var dupLimit = embedded ? 140 : 200;
              dupBody.innerHTML = highlightKeywords(snippetText(dup.text, dupLimit), highlightKeys);
              dupCard.appendChild(dupBody);
            }
            dupList.appendChild(dupCard);
          }
          toggle.addEventListener("click", (function (button, panel, count) {
            return function () {
              var hidden = panel.classList.contains("hidden");
              if (hidden) {
                panel.classList.remove("hidden");
                button.textContent = "隐藏重复来源";
              } else {
                panel.classList.add("hidden");
                button.textContent = "显示重复来源 (" + count + ")";
              }
            };
          })(toggle, dupList, duplicateCount));
          card.appendChild(toggle);
          card.appendChild(dupList);
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
      if (chunk.text) {
        chunk.text = String(chunk.text).replace(/\r\n/g, "\n").trim();
      } else {
        chunk.text = "";
      }
      chunk.title = refineQuestionLabel(extractChunkTitle(chunk.text, chunk.file));
      chunk.body = extractChunkBody(chunk.text);
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
      var rawText = chunks[i] ? String(chunks[i]).replace(/\r\n/g, "\n").trim() : "";
      var chunkId = fileId + "#" + (bank.chunks.length + 1 + i);
      bank.chunks.push({
        id: chunkId,
        file: fileName,
        fileId: fileId,
        order: 0,
        text: rawText,
        title: refineQuestionLabel(extractChunkTitle(rawText, fileName)),
        body: extractChunkBody(rawText)
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
            var renameBtn = document.createElement("button");
            renameBtn.className = "text-button";
            renameBtn.type = "button";
            renameBtn.textContent = "重命名";
            renameBtn.addEventListener("click", function () {
              renameKnowledgeFile(file.id);
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
            actions.appendChild(renameBtn);
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
      var highlightApplied = false;
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
        var highlight = pendingChunkHighlightId && pendingChunkHighlightId === chunk.id;
        ccard.className = "chunk-card" + (highlight ? " active" : "");
        ccard.id = "chunk-" + chunk.id;
        var header = document.createElement("div");
        header.className = "chunk-header";
        var infoWrap = document.createElement("div");
        infoWrap.className = "chunk-header-info";
        var titleNode = document.createElement("div");
        titleNode.className = "chunk-title";
        titleNode.textContent = chunk.title || chunk.file || "分段";
        var meta = document.createElement("div");
        meta.className = "chunk-source";
        var sourceText = chunk.file || "";
        if (chunk.order) {
          sourceText += (sourceText ? " · " : "") + "第" + chunk.order + "段";
        }
        meta.textContent = sourceText ? "来源：" + sourceText : "来源：知识库";
        infoWrap.appendChild(titleNode);
        infoWrap.appendChild(meta);
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
        header.appendChild(infoWrap);
        header.appendChild(actions);
        var body = document.createElement("div");
        body.className = "content";
        body.textContent = chunk.body ? chunk.body : chunk.text;
        ccard.appendChild(header);
        ccard.appendChild(body);
        preview.appendChild(ccard);
        if (highlight) {
          highlightApplied = true;
          (function (node) {
            window.setTimeout(function () {
              try {
                node.scrollIntoView({ behavior: "smooth", block: "center" });
              } catch (err) {
                node.scrollIntoView();
              }
            }, 80);
          })(ccard);
        }
      }
      if (highlightApplied) {
        pendingChunkHighlightId = null;
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
      id: uuid(),
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

  function handleChatImageFile(file) {
    if (!file || !file.type) {
      return;
    }
    if (file.type.toLowerCase().indexOf("image/") !== 0) {
      showToast("仅支持 PNG、JPG、WEBP 图像");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      queueVisionInference(reader.result, file.name || file.type);
    };
    reader.onerror = function () {
      showToast("读取图像失败");
    };
    reader.readAsDataURL(file);
  }

  function handleChatPasteForVision(evt) {
    if (!evt || !evt.clipboardData) {
      return;
    }
    var file = pickFirstImage(evt.clipboardData);
    if (!file) {
      return;
    }
    evt.preventDefault();
    handleChatImageFile(file);
  }

  function pickFirstImage(dataTransfer) {
    if (!dataTransfer) {
      return null;
    }
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      for (var i = 0; i < dataTransfer.files.length; i += 1) {
        if (dataTransfer.files[i] && typeof dataTransfer.files[i].type === "string" && dataTransfer.files[i].type.toLowerCase().indexOf("image/") === 0) {
          return dataTransfer.files[i];
        }
      }
    }
    if (dataTransfer.items && dataTransfer.items.length > 0) {
      for (var j = 0; j < dataTransfer.items.length; j += 1) {
        var item = dataTransfer.items[j];
        if (!item || item.kind !== "file") {
          continue;
        }
        var blob = item.getAsFile();
        if (blob && typeof blob.type === "string" && blob.type.toLowerCase().indexOf("image/") === 0) {
          return blob;
        }
      }
    }
    return null;
  }

  function queueVisionInference(dataUrl, name) {
    if (!dataUrl) {
      showToast("未获取到有效的图像数据");
      return;
    }
    var key = "visionQueue:" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    var payload = {
      dataUrl: dataUrl,
      name: name || "clipboard",
      createdAt: new Date().toISOString(),
      bankId: state.activeBankId || null
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      showToast("无法缓存图像，请重试");
      return;
    }
    var target = "ai-vision.html?queue=" + encodeURIComponent(key);
    var win = window.open(target, "_blank");
    if (!win) {
      window.location.href = target;
    } else {
      showToast("图像已发送至热脏污识别工作台");
    }
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
      { regex: /(帮助|怎么用|说明)/, reply: "您可以输入问题，我会从知识库与决策链中检索依据；管理员可在知识库与系统页面维护数据。" }
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
        if (projectScore >= 35) {
          results.push({
            type: "decision",
            source: base + " · 复盘",
            text: outcomeText,
            score: projectScore,
            projectId: project.id,
            url: "decision-history-detail.html?id=" + encodeURIComponent(project.id)
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
          if (nodeScore >= 35 && nodeText) {
            results.push({
              type: "decision",
              source: label,
              text: nodeText,
              score: nodeScore,
              projectId: project.id,
              nodeId: node.id,
              url: "decision-history-detail.html?id=" + encodeURIComponent(project.id) + "#node-" + encodeURIComponent(node.id)
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
          if (linkScore >= 35) {
            results.push({
              type: "decision",
              source: linkLabel,
              text: relationText,
              score: linkScore,
              projectId: project.id,
              linkId: link.id,
              url: "decision-history-detail.html?id=" + encodeURIComponent(project.id) + "#link-" + encodeURIComponent(link.id)
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

  function looksLikeQuestion(text) {
    if (!text) {
      return false;
    }
    var trimmed = String(text).trim();
    if (!trimmed) {
      return false;
    }
    if (/[？?]$/.test(trimmed)) {
      return true;
    }
    if (trimmed.length <= 16) {
      var cues = ["如何", "怎样", "为什么", "原因", "什么", "多少", "能否", "可以", "是否", "哪", "需不需要", "应不应该"];
      for (var i = 0; i < cues.length; i += 1) {
        if (trimmed.indexOf(cues[i]) >= 0) {
          return true;
        }
      }
    }
    return false;
  }

  function deriveChunkQa(chunk) {
    var qa = { question: "", answer: "" };
    if (!chunk) {
      return qa;
    }
    var text = chunk.text ? String(chunk.text).trim() : "";
    if (!text) {
      return qa;
    }
    var title = refineQuestionLabel(chunk.title || "");
    if (!title) {
      title = extractChunkTitle(text, chunk.file || "");
    }
    var body = chunk.body ? String(chunk.body) : "";
    if (!body) {
      body = extractChunkBody(text);
    }
    var fileTitle = refineQuestionLabel(chunk.file || "");
    if (title && looksLikeQuestion(title)) {
      qa.question = refineQuestionLabel(title);
    } else if (fileTitle && looksLikeQuestion(fileTitle)) {
      qa.question = refineQuestionLabel(fileTitle);
    }
    if (!qa.question) {
      var firstLine = refineQuestionLabel(text.split(/\n+/)[0] || "");
      if (firstLine && looksLikeQuestion(firstLine)) {
        qa.question = refineQuestionLabel(firstLine);
      }
    }
    qa.question = refineQuestionLabel(qa.question);
    var answer = body || "";
    if (!answer && qa.question && text.indexOf(qa.question) === 0) {
      answer = text.slice(qa.question.length).trim();
    }
    if (!answer) {
      var remaining = text.split(/\n+/);
      if (remaining.length > 1) {
        answer = cleanLeadingMarker(remaining.slice(1).join("\n"));
      }
    }
    if (!answer) {
      answer = cleanLeadingMarker(text);
    }
    if (qa.question && answer && answer.indexOf(qa.question) === 0) {
      answer = cleanLeadingMarker(answer.slice(qa.question.length));
    }
    var sanitized = sanitizeAnswer(qa.question, answer, body || text);
    if (!sanitized && body) {
      var cleanBody = cleanLeadingMarker(body);
      if (cleanBody) {
        var normalizedBody = normalizeQuestionText(cleanBody);
        var normalizedQuestion = qa.question ? normalizeQuestionText(qa.question) : "";
        if (!normalizedQuestion || normalizedBody !== normalizedQuestion) {
          sanitized = cleanBody;
        }
      }
    }
    if (!sanitized && text) {
      var fallback = stripQuestionLines(qa.question, text);
      if (fallback) {
        sanitized = fallback;
      }
    }
    qa.answer = sanitized || "";
    return qa;
  }

  function getEvidenceAnswer(entry) {
    if (!entry) {
      return "";
    }
    if (entry.qaAnswer) {
      return entry.qaAnswer;
    }
    if (entry.type === "decision") {
      return entry.text || "";
    }
    if (entry.origin === "favorite" && entry.favoriteRole === "user") {
      return "";
    }
    return entry.text || "";
  }

  function getDisplayAnswer(entry) {
    if (!entry) {
      return "";
    }
    var question = entry.qaQuestion || "";
    var answer = getEvidenceAnswer(entry);
    var fallback = entry.text || "";
    if (entry.origin === "favorite" && entry.favoriteRole === "user") {
      return "";
    }
    var cleaned = sanitizeAnswer(question, answer, fallback);
    if (!cleaned && entry.origin === "favorite" && entry.favoriteRole === "assistant" && fallback) {
      cleaned = sanitizeAnswer(question, fallback, fallback);
    }
    if (!cleaned && entry.type === "decision") {
      cleaned = cleanLeadingMarker(answer || fallback);
    }
    if (!cleaned && answer) {
      cleaned = cleanLeadingMarker(answer);
    }
    if (!cleaned && fallback) {
      cleaned = cleanLeadingMarker(fallback);
    }
    if (question && cleaned) {
      var normalizedQuestion = normalizeQuestionText(question);
      var normalizedCleaned = normalizeQuestionText(cleaned);
      if (normalizedQuestion && normalizedCleaned === normalizedQuestion) {
        return "";
      }
    }
    return cleaned || "";
  }

  function formatEvidenceSourceLabel(entry) {
    if (!entry) {
      return "";
    }
    var label = "";
    if (entry.origin === "favorite") {
      label = entry.source || entry.fileName || "收藏内容";
    } else if (entry.origin === "decision-history" || entry.type === "decision") {
      label = entry.source || "决策链记录";
    } else {
      label = entry.fileName || entry.source || "";
    }
    if (!label && entry.projectName) {
      label = entry.projectName;
    }
    if (!label && entry.projectTitle) {
      label = entry.projectTitle;
    }
    if (!label) {
      label = entry.source || "";
    }
    label = label ? String(label).replace(/\s+/g, " ").trim() : "";
    if (label.indexOf(" —— ") >= 0) {
      label = label.split(" —— ")[0];
    }
    if (label.indexOf(" · 第") >= 0) {
      label = label.replace(/ · 第\d+段/g, "");
    }
    if (entry.qaQuestion && label) {
      var normalizedLabel = normalizeQuestionText(label);
      var normalizedQuestion = normalizeQuestionText(entry.qaQuestion);
      if (normalizedLabel && normalizedQuestion && normalizedLabel === normalizedQuestion) {
        if (entry.fileName && normalizeQuestionText(entry.fileName) !== normalizedQuestion) {
          label = String(entry.fileName).replace(/\s+/g, " ").trim();
        } else if (entry.source && normalizeQuestionText(entry.source) !== normalizedQuestion) {
          label = String(entry.source).replace(/\s+/g, " ").trim();
        }
        if (label && label.indexOf(" —— ") >= 0) {
          label = label.split(" —— ")[0];
        }
        if (label && label.indexOf(" · 第") >= 0) {
          label = label.replace(/ · 第\d+段/g, "");
        }
      }
    }
    if (!label) {
      label = "资料";
    }
    return label;
  }

  function collectFavoriteEvidence(bank, tokens, limit) {
    var pool = [];
    if (!bank || !tokens || tokens.length === 0) {
      return pool;
    }
    var favorites = bank.favorites || [];
    for (var i = 0; i < favorites.length; i += 1) {
      var favorite = favorites[i];
      if (!favorite || !favorite.transcript || favorite.transcript.length === 0) {
        continue;
      }
      var baseSource = "收藏《" + (favorite.title || "收藏对话") + "》";
      var lastQuestion = favorite.title || "";
      for (var j = 0; j < favorite.transcript.length; j += 1) {
        var entry = favorite.transcript[j];
        if (!entry || !entry.text) {
          continue;
        }
        var text = String(entry.text).trim();
        if (!text) {
          continue;
        }
        var score = scoreDecisionText(text, tokens);
        if (score < 35) {
          if (entry.role === "user") {
            lastQuestion = text;
          }
          continue;
        }
        var url = "favorite-viewer.html?bank=" + encodeURIComponent(favorite.bankId || bank.id) + "&favorite=" + encodeURIComponent(favorite.id);
        if (entry.id) {
          url += "#message-" + encodeURIComponent(entry.id);
        }
        if (entry.role === "user") {
          var cleanedUser = refineQuestionLabel(text);
          if (cleanedUser) {
            lastQuestion = cleanedUser;
          } else {
            lastQuestion = text;
          }
          continue;
        }
        var qaQuestion = lastQuestion || favorite.title || "";
        var cleanQuestion = refineQuestionLabel(qaQuestion);
        var cleanAnswer = cleanLeadingMarker(text);
        var sanitizedAnswer = sanitizeAnswer(cleanQuestion, cleanAnswer, cleanAnswer);
        if (!sanitizedAnswer) {
          continue;
        }
        pool.push({
          type: "knowledge",
          source: cleanQuestion || baseSource + " · 助理",
          chunk: j + 1,
          text: sanitizedAnswer,
          score: score * 0.04,
          favoriteId: favorite.id,
          favoriteMessageId: entry.id || null,
          favoriteBankId: favorite.bankId || bank.id,
          favoriteRole: "assistant",
          qaQuestion: cleanQuestion,
          qaAnswer: sanitizedAnswer,
          url: url,
          origin: "favorite"
        });
      }
    }
    if (pool.length === 0) {
      return pool;
    }
    pool.sort(function (a, b) {
      var aScore = typeof a.score === "number" ? a.score : 0;
      var bScore = typeof b.score === "number" ? b.score : 0;
      if (bScore !== aScore) {
        return bScore - aScore;
      }
      return 0;
    });
    var cap = pool.length;
    if (typeof limit === "number" && limit > 0) {
      cap = Math.min(pool.length, Math.max(limit * 3, limit));
    }
    return pool.slice(0, cap);
  }

  function cloneEvidenceEntry(item) {
    var copy = {};
    for (var key in item) {
      if (item.hasOwnProperty(key) && key !== "duplicates") {
        copy[key] = item[key];
      }
    }
    return copy;
  }

  function collectSimilarityTokens(text) {
    if (!text) {
      return [];
    }
    var lowered = text.toLowerCase();
    var tokens = [];
    var wordMatches = lowered.match(/[a-z0-9]+/g);
    if (wordMatches) {
      for (var i = 0; i < wordMatches.length; i += 1) {
        if (wordMatches[i]) {
          tokens.push(wordMatches[i]);
        }
      }
    }
    var condensed = lowered.replace(/[a-z0-9\s]+/g, "");
    for (var j = 0; j < condensed.length; j += 1) {
      var ch = condensed.charAt(j);
      if (!ch) {
        continue;
      }
      var next = condensed.charAt(j + 1);
      if (next) {
        tokens.push(ch + next);
      } else {
        tokens.push(ch);
      }
    }
    if (tokens.length === 0 && lowered.length > 0) {
      for (var k = 0; k < lowered.length; k += 2) {
        var slice = lowered.substr(k, 2);
        if (slice) {
          tokens.push(slice);
        }
      }
    }
    var unique = [];
    var seen = {};
    for (var n = 0; n < tokens.length; n += 1) {
      var token = tokens[n];
      if (!token) {
        continue;
      }
      if (!seen[token]) {
        seen[token] = true;
        unique.push(token);
      }
    }
    return unique;
  }

  function similarityScore(tokensA, tokensB) {
    if (!tokensA || !tokensB || tokensA.length === 0 || tokensB.length === 0) {
      return 0;
    }
    var mapA = {};
    var uniqueA = [];
    for (var i = 0; i < tokensA.length; i += 1) {
      var tokA = tokensA[i];
      if (!tokA) {
        continue;
      }
      if (!mapA[tokA]) {
        mapA[tokA] = true;
        uniqueA.push(tokA);
      }
    }
    if (uniqueA.length === 0) {
      return 0;
    }
    var mapB = {};
    var uniqueB = [];
    for (var j = 0; j < tokensB.length; j += 1) {
      var tokB = tokensB[j];
      if (!tokB) {
        continue;
      }
      if (!mapB[tokB]) {
        mapB[tokB] = true;
        uniqueB.push(tokB);
      }
    }
    if (uniqueB.length === 0) {
      return 0;
    }
    var intersection = 0;
    for (var a = 0; a < uniqueA.length; a += 1) {
      if (mapB[uniqueA[a]]) {
        intersection += 1;
      }
    }
    if (intersection === 0) {
      return 0;
    }
    var union = uniqueA.length;
    for (var b = 0; b < uniqueB.length; b += 1) {
      if (!mapA[uniqueB[b]]) {
        union += 1;
      }
    }
    if (union === 0) {
      return 0;
    }
    return intersection / union;
  }

  function appendDuplicate(target, duplicate) {
    if (!target.duplicates) {
      target.duplicates = [];
    }
    if (!duplicate) {
      return;
    }
    var inserted = false;
    var dupScore = typeof duplicate.score === "number" ? duplicate.score : -Infinity;
    for (var i = 0; i < target.duplicates.length; i += 1) {
      var existing = target.duplicates[i];
      var existingScore = typeof existing.score === "number" ? existing.score : -Infinity;
      if (dupScore > existingScore) {
        target.duplicates.splice(i, 0, duplicate);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      target.duplicates.push(duplicate);
    }
  }

  function formatDuplicateNote(count) {
    if (!count || count <= 0) {
      return "";
    }
    var numerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    var label;
    if (count === 1) {
      label = "一个";
    } else if (count === 2) {
      label = "两个";
    } else if (count > 2 && count <= 10) {
      label = numerals[count] + "个";
    } else {
      label = count + "个";
    }
    return "（" + label + "相似答案已隐藏）";
  }

  function collapseEvidenceList(list) {
    if (!list || list.length === 0) {
      return [];
    }
    var identityMap = {};
    var groups = [];
    var threshold = 0.82;
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item) {
        continue;
      }
      var copy = cloneEvidenceEntry(item);
      copy.duplicates = [];
      var typeKey = item.type || "knowledge";
      var displayAnswer = getDisplayAnswer(copy);
      if (!copy.text && displayAnswer) {
        copy.text = displayAnswer;
      }
      var normalized = displayAnswer ? String(displayAnswer).replace(/\s+/g, " ").trim() : "";
      if (!normalized && copy.text) {
        normalized = String(copy.text).replace(/\s+/g, " ").trim();
      }
      var tokens = normalized ? collectSimilarityTokens(normalized) : null;
      var sourceKey = item.source ? String(item.source).replace(/\s+/g, " ").trim() : "";
      var identity = null;
      if (normalized) {
        identity = "text:" + normalized;
        if (typeKey === "decision" && item.projectId) {
          identity += "::project-" + item.projectId;
        }
      } else if (item.favoriteId) {
        identity = "favorite:" + item.favoriteId + (item.favoriteMessageId ? "#" + item.favoriteMessageId : "");
      } else if (item.chunkId) {
        identity = "chunk:" + item.chunkId;
      } else if (item.projectId && item.nodeId) {
        identity = "node:" + item.projectId + ":" + item.nodeId;
      } else if (item.projectId && item.linkId) {
        identity = "link:" + item.projectId + ":" + item.linkId;
      } else if (item.projectId) {
        identity = "project:" + item.projectId;
      } else if (sourceKey) {
        identity = "source:" + sourceKey;
      } else {
        identity = typeKey + "::index-" + i;
      }
      var key = typeKey + "::" + identity;
      var group = key && identityMap[key] ? identityMap[key] : null;
      if (!group && normalized && tokens && tokens.length > 0) {
        var best = null;
        var bestScore = 0;
        for (var g = 0; g < groups.length; g += 1) {
          var candidate = groups[g];
          if (!candidate || candidate.type !== typeKey) {
            continue;
          }
          if (!candidate.tokens || candidate.tokens.length === 0) {
            continue;
          }
          var score = similarityScore(candidate.tokens, tokens);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        if (best && bestScore >= threshold) {
          group = best;
        }
      }
      if (group) {
        var primary = group.entry;
        var primaryScore = typeof primary.score === "number" ? primary.score : -Infinity;
        var candidateScore = typeof copy.score === "number" ? copy.score : -Infinity;
        if (candidateScore > primaryScore) {
          var carry = [];
          carry.push(cloneEvidenceEntry(primary));
          if (primary.duplicates && primary.duplicates.length > 0) {
            for (var d = 0; d < primary.duplicates.length; d += 1) {
              carry.push(cloneEvidenceEntry(primary.duplicates[d]));
            }
          }
          copy.duplicates = copy.duplicates || [];
          for (var c = 0; c < carry.length; c += 1) {
            appendDuplicate(copy, carry[c]);
          }
          group.entry = copy;
          group.normalized = normalized;
          group.tokens = tokens;
        } else {
          appendDuplicate(primary, copy);
        }
        if (key && !identityMap[key]) {
          identityMap[key] = group;
        }
        continue;
      }
      var record = {
        entry: copy,
        type: typeKey,
        normalized: normalized,
        tokens: tokens
      };
      groups.push(record);
      if (key) {
        identityMap[key] = record;
      }
    }
    var ordered = [];
    for (var idx = 0; idx < groups.length; idx += 1) {
      ordered.push(groups[idx].entry);
    }
    return ordered;
  }

  function entryHasOrigin(entry, origin) {
    if (!entry || !origin) {
      return false;
    }
    if (entry.origin === origin) {
      return true;
    }
    if (entry.duplicates && entry.duplicates.length > 0) {
      for (var i = 0; i < entry.duplicates.length; i += 1) {
        if (entry.duplicates[i] && entry.duplicates[i].origin === origin) {
          return true;
        }
      }
    }
    return false;
  }

  function hasOriginInList(list, origin) {
    if (!list || list.length === 0) {
      return false;
    }
    for (var i = 0; i < list.length; i += 1) {
      if (entryHasOrigin(list[i], origin)) {
        return true;
      }
    }
    return false;
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
      var knowledgeCandidates = [];
      var kbCandidates = [];
      var limit = state.settings.topN;
      var kbLimit = limit > 0 ? Math.max(limit * 3, limit) : knowledgeScores.length;
      var decisionEvidenceRaw = collectDecisionEvidence(tokens);
      var topScore = knowledgeScores.length > 0 ? knowledgeScores[0].score : 0;
      for (var k = 0; k < knowledgeScores.length && kbCandidates.length < kbLimit; k += 1) {
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
        var qaInfo = deriveChunkQa(chunk);
        var answerText = qaInfo.answer;
        if (!answerText && chunk.body) {
          answerText = sanitizeAnswer(qaInfo.question, chunk.body, chunk.body);
        }
        if (!answerText) {
          answerText = sanitizeAnswer(qaInfo.question, chunk.text, chunk.text);
        }
        if (!answerText) {
          answerText = qaInfo.answer || "";
        }
        if (!answerText) {
          continue;
        }
        var displayLabel = qaInfo.question || chunk.title || chunk.file;
        kbCandidates.push({
          type: "knowledge",
          source: displayLabel || chunk.file,
          fileName: chunk.file,
          chunkOrder: chunk.order,
          chunk: chunk.order,
          text: answerText || "",
          score: entry.score,
          fileId: chunk.fileId,
          chunkId: chunk.id,
          url: "kb.html?file=" + encodeURIComponent(chunk.fileId) + "&chunk=" + encodeURIComponent(chunk.id),
          origin: "kb",
          qaQuestion: qaInfo.question,
          qaAnswer: answerText || ""
        });
      }
      var favoriteEvidence = collectFavoriteEvidence(bank, expanded, limit);
      var decisionKnowledge = [];
      if (kbCandidates.length > 0) {
        knowledgeCandidates = knowledgeCandidates.concat(kbCandidates);
      }
      if (favoriteEvidence.length > 0) {
        knowledgeCandidates = knowledgeCandidates.concat(favoriteEvidence);
      }
      if (decisionEvidenceRaw.length > 0) {
        for (var d = 0; d < decisionEvidenceRaw.length; d += 1) {
          var decisionEntry = decisionEvidenceRaw[d];
          if (!decisionEntry || !decisionEntry.text) {
            continue;
          }
          decisionKnowledge.push({
            type: "knowledge",
            source: (decisionEntry.source || "决策链") + " · 决策链历史",
            text: decisionEntry.text,
            score: typeof decisionEntry.score === "number" ? decisionEntry.score : 0,
            projectId: decisionEntry.projectId || null,
            nodeId: decisionEntry.nodeId || null,
            linkId: decisionEntry.linkId || null,
            url: decisionEntry.url || null,
            origin: "decision-history"
          });
        }
        if (decisionKnowledge.length > 0) {
          knowledgeCandidates = knowledgeCandidates.concat(decisionKnowledge);
        }
      }
      var knowledgeEvidencePool = collapseEvidenceList(knowledgeCandidates);
      if (knowledgeEvidencePool.length > 1) {
        knowledgeEvidencePool.sort(function (a, b) {
          var aScore = typeof a.score === "number" ? a.score : 0;
          var bScore = typeof b.score === "number" ? b.score : 0;
          if (bScore !== aScore) {
            return bScore - aScore;
          }
          return 0;
        });
      }
      var knowledgeEvidence = [];
      var extraAllowance = decisionKnowledge.length > 0 ? decisionKnowledge.length : 0;
      var effectiveLimit = typeof limit === "number" && limit > 0 ? limit + extraAllowance : knowledgeEvidencePool.length;
      if (effectiveLimit <= 0) {
        effectiveLimit = knowledgeEvidencePool.length;
      }
      for (var keIdx = 0; keIdx < knowledgeEvidencePool.length && knowledgeEvidence.length < effectiveLimit; keIdx += 1) {
        knowledgeEvidence.push(knowledgeEvidencePool[keIdx]);
      }
      var REQUIRED_ORIGINS = ["kb", "favorite", "decision-history"];
      for (var ro = 0; ro < REQUIRED_ORIGINS.length; ro += 1) {
        var originKey = REQUIRED_ORIGINS[ro];
        if (!hasOriginInList(knowledgeEvidence, originKey)) {
          for (var poolIdx = 0; poolIdx < knowledgeEvidencePool.length; poolIdx += 1) {
            var candidate = knowledgeEvidencePool[poolIdx];
            if (knowledgeEvidence.indexOf(candidate) >= 0) {
              continue;
            }
            if (entryHasOrigin(candidate, originKey)) {
              knowledgeEvidence.push(candidate);
              break;
            }
          }
        }
      }
      if (knowledgeEvidence.length > 1) {
        knowledgeEvidence.sort(function (a, b) {
          var aScore = typeof a.score === "number" ? a.score : 0;
          var bScore = typeof b.score === "number" ? b.score : 0;
          if (bScore !== aScore) {
            return bScore - aScore;
          }
          return 0;
        });
      }
      var decisionEvidence = collapseEvidenceList(decisionEvidenceRaw);
      evidence = decisionEvidence.concat(knowledgeEvidence);
      for (var idx = 0; idx < evidence.length; idx += 1) {
        evidence[idx].ref = idx + 1;
      }
      var primaryEntry = null;
      if (knowledgeEvidence.length > 0) {
        for (var kePrimary = 0; kePrimary < knowledgeEvidence.length; kePrimary += 1) {
          if (getEvidenceAnswer(knowledgeEvidence[kePrimary])) {
            primaryEntry = knowledgeEvidence[kePrimary];
            break;
          }
        }
      }
      if (!primaryEntry && knowledgeEvidence.length > 0) {
        primaryEntry = knowledgeEvidence[0];
      }
      if (!primaryEntry && decisionEvidence.length > 0) {
        primaryEntry = decisionEvidence[0];
      }
      var primaryAnswer = primaryEntry ? getDisplayAnswer(primaryEntry) : "";
      if (primaryAnswer) {
        primaryAnswer = snippetText(primaryAnswer, 200);
      }
      if (!primaryAnswer) {
        primaryAnswer = "当前资料中未找到高相关答案，请补充更多上下文信息。";
      }
      var replySections = [];
      var coreAnswer = escapeHtml(primaryAnswer);
      replySections.push('<p class="reply-core"><strong>' + coreAnswer + '</strong></p>');
      var duplicateCount = 0;
      var sourceItems = [];
      var sourceIndex = 1;
      for (var evIdx = 0; evIdx < evidence.length; evIdx += 1) {
        var evItem = evidence[evIdx];
        if (!evItem) {
          continue;
        }
        if (evItem.duplicates && evItem.duplicates.length > 0) {
          duplicateCount += evItem.duplicates.length;
        }
        var labelText = formatEvidenceSourceLabel(evItem);
        if (!labelText) {
          continue;
        }
        var originLabel = "";
        if (evItem.origin === "decision-history" || evItem.type === "decision") {
          originLabel = "决策链";
        } else if (evItem.origin === "favorite") {
          originLabel = "收藏夹";
        } else {
          originLabel = "知识库";
        }
        var combined = originLabel ? originLabel + "：" + labelText : labelText;
        sourceItems.push('<li><span class="reply-source-index">' + sourceIndex + '.</span><span class="reply-source-label">' + escapeHtml(combined) + '</span></li>');
        sourceIndex += 1;
      }
      var duplicateNote = formatDuplicateNote(duplicateCount);
      if (duplicateNote) {
        replySections.push('<p class="reply-note">' + duplicateNote + "</p>");
      }
      if (sourceItems.length > 0) {
        replySections.push('<div class="reply-sources"><div class="reply-sources-title">来源：</div><ol class="reply-sources-list">' + sourceItems.join("") + '</ol></div>');
      }
      replyText = replySections.join("");
      renderEvidence(evidence, highlightTokens);
    }
    var reply = {
      id: uuid(),
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

  function renderUsers() {
    var list = document.getElementById("userList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    for (var i = 0; i < state.users.length; i += 1) {
      (function (user) {
        if (user.hidden) {
          return;
        }
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
        card.className = "common-card";
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
    if (!project || project.completed || !form || !summary) {
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
    var allowEdit = !project.completed;
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
        if (allowEdit) {
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
        }
        item.appendChild(info);
        if (allowEdit) {
          item.appendChild(actions);
        }
        list.appendChild(item);
      })(project.links[i]);
    }
  }

  function handleNodeLink(nodeId) {
    var project = getActiveDecisionProject();
    if (!project || !project.timeline || project.completed) {
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
    if (!project || !project.timeline || project.completed) {
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

  function createReadonlyTimelineNode(project, node, index, highlightId) {
    var card = document.createElement("div");
    card.className = "mind-node readonly" + (index % 2 === 0 ? " left" : " right");
    card.setAttribute("data-node", node.id);
    card.id = "node-" + node.id;
    if (detailActiveNodeId === node.id) {
      card.classList.add("active");
    }
    if (highlightId && highlightId === "node-" + node.id) {
      card.classList.add("highlight");
      window.setTimeout(function (element) {
        return function () {
          try {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (err) {
            element.scrollIntoView();
          }
        };
      }(card), 120);
    }
    var connector = document.createElement("div");
    connector.className = "mind-node-connector";
    card.appendChild(connector);
    var bubble = document.createElement("div");
    bubble.className = "mind-node-bubble";
    bubble.addEventListener("click", function () {
      openReadonlyNodeDetail(node.id);
    });
    var title = document.createElement("div");
    title.className = "mind-node-title";
    title.textContent = node.title || "未命名节点";
    var time = document.createElement("div");
    time.className = "mind-node-time";
    time.textContent = node.startTime ? formatDateTime(node.startTime) : "时间待定";
    bubble.appendChild(title);
    bubble.appendChild(time);
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

  function openReadonlyNodeDetail(nodeId) {
    detailHighlightId = null;
    detailActiveNodeId = nodeId;
    renderDecisionHistoryDetail();
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
          var groupLabel = project.group && project.group !== "未分组" ? " · 分组 " + project.group : "";
          meta.textContent = "开始 " + start + " · 节点 " + nodes + groupLabel;
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
      var footer = document.createElement("div");
      footer.className = "history-card-footer";
      var detailLink = document.createElement("a");
      detailLink.className = "text-button";
      detailLink.textContent = "查看详情";
      detailLink.href = "decision-history-detail.html?id=" + encodeURIComponent(completed[j].id);
      footer.appendChild(detailLink);
      card.appendChild(footer);
      container.appendChild(card);
    }
  }

  function gatherCompletedProjects() {
    var list = [];
    if (!state || !state.decisions) {
      return list;
    }
    for (var i = 0; i < state.decisions.length; i += 1) {
      if (state.decisions[i].completed) {
        list.push(state.decisions[i]);
      }
    }
    list.sort(function (a, b) {
      var ta = a.endTime || a.updatedAt || a.createdAt || "";
      var tb = b.endTime || b.updatedAt || b.createdAt || "";
      return tb.localeCompare(ta);
    });
    return list;
  }

  function deriveProjectTags(project) {
    if (!project) {
      return [];
    }
    if (project.tags && project.tags.length > 0) {
      return project.tags.slice(0, 5);
    }
    var tags = [];
    if (project.timeline) {
      for (var i = 0; i < project.timeline.length && tags.length < 5; i += 1) {
        var title = project.timeline[i].title;
        if (title && tags.indexOf(title) === -1) {
          tags.push(title);
        }
      }
    }
    if (tags.length === 0 && project.group) {
      tags.push(project.group);
    }
    return tags.slice(0, 5);
  }

  function matchesHistorySearch(project) {
    if (!historySearchTerm) {
      return true;
    }
    var keyword = historySearchTerm.toLowerCase();
    function contains(value) {
      if (!value) {
        return false;
      }
      return String(value).toLowerCase().indexOf(keyword) !== -1;
    }
    if (contains(project.name) || contains(project.outcome) || contains(project.group) || contains(project.note)) {
      return true;
    }
    if (project.tags) {
      for (var i = 0; i < project.tags.length; i += 1) {
        if (contains(project.tags[i])) {
          return true;
        }
      }
    }
    if (project.timeline) {
      for (var j = 0; j < project.timeline.length; j += 1) {
        if (contains(project.timeline[j].title) || contains(project.timeline[j].reason) || contains(project.timeline[j].impact)) {
          return true;
        }
      }
    }
    return false;
  }

  function historyGroupingKey(project) {
    if (!project) {
      return "";
    }
    if (historyGrouping === "year") {
      var stamp = project.endTime || project.startTime || "";
      if (stamp) {
        try {
          var year = new Date(stamp).getFullYear();
          if (!isNaN(year)) {
            return String(year);
          }
        } catch (err) {
          return "未标记年份";
        }
      }
      return "未标记年份";
    }
    return project.group || "未分组";
  }

  function renderHistoryFilters() {
    var filterSelect = document.getElementById("historyGroupFilter");
    if (!filterSelect) {
      return;
    }
    var projects = gatherCompletedProjects();
    var groups = {};
    for (var i = 0; i < projects.length; i += 1) {
      var key = historyGroupingKey(projects[i]);
      groups[key] = true;
    }
    var options = Object.keys(groups);
    options.sort(function (a, b) {
      if (historyGrouping === "year") {
        var ay = parseInt(a, 10);
        var by = parseInt(b, 10);
        if (isNaN(ay) && isNaN(by)) {
          return a.localeCompare(b);
        }
        if (isNaN(ay)) {
          return 1;
        }
        if (isNaN(by)) {
          return -1;
        }
        return by - ay;
      }
      return a.localeCompare(b);
    });
    filterSelect.innerHTML = "";
    var defaultOption = document.createElement("option");
    defaultOption.value = "all";
    defaultOption.textContent = "全部";
    filterSelect.appendChild(defaultOption);
    for (var j = 0; j < options.length; j += 1) {
      var option = document.createElement("option");
      option.value = options[j];
      option.textContent = options[j];
      filterSelect.appendChild(option);
    }
    if (historyGroupFilter !== "all") {
      var found = false;
      for (var k = 0; k < filterSelect.options.length; k += 1) {
        if (filterSelect.options[k].value === historyGroupFilter) {
          filterSelect.value = historyGroupFilter;
          found = true;
          break;
        }
      }
      if (!found) {
        historyGroupFilter = "all";
      }
    }
  }

  function filterHistoryProjects() {
    var projects = gatherCompletedProjects();
    var filtered = [];
    for (var i = 0; i < projects.length; i += 1) {
      var groupKey = historyGroupingKey(projects[i]);
      if (historyGroupFilter !== "all" && groupKey !== historyGroupFilter) {
        continue;
      }
      if (!matchesHistorySearch(projects[i])) {
        continue;
      }
      filtered.push(projects[i]);
    }
    return filtered;
  }

  function renderHistoryGroupsView() {
    var container = document.getElementById("historyGroups");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    var filtered = filterHistoryProjects();
    if (filtered.length === 0) {
      container.innerHTML = '<div class="history-group-card empty">暂无符合条件的决策记录</div>';
      return;
    }
    var buckets = {};
    for (var i = 0; i < filtered.length; i += 1) {
      var key = historyGroupingKey(filtered[i]);
      if (!buckets[key]) {
        buckets[key] = [];
      }
      buckets[key].push(filtered[i]);
    }
    var keys = Object.keys(buckets);
    keys.sort(function (a, b) {
      if (historyGrouping === "year") {
        var ay = parseInt(a, 10);
        var by = parseInt(b, 10);
        if (isNaN(ay) && isNaN(by)) {
          return a.localeCompare(b);
        }
        if (isNaN(ay)) {
          return 1;
        }
        if (isNaN(by)) {
          return -1;
        }
        return by - ay;
      }
      if (a === "未分组") {
        return 1;
      }
      if (b === "未分组") {
        return -1;
      }
      return a.localeCompare(b);
    });
    for (var j = 0; j < keys.length; j += 1) {
      var groupCard = document.createElement("div");
      groupCard.className = "history-group-card";
      var header = document.createElement("header");
      var title = document.createElement("h3");
      title.textContent = keys[j];
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = "共 " + buckets[keys[j]].length + " 项";
      header.appendChild(title);
      header.appendChild(meta);
      groupCard.appendChild(header);
      var grid = document.createElement("div");
      grid.className = "history-items";
      var items = buckets[keys[j]].slice().sort(function (a, b) {
        var ta = a.endTime || a.updatedAt || a.createdAt || "";
        var tb = b.endTime || b.updatedAt || b.createdAt || "";
        return tb.localeCompare(ta);
      });
      for (var n = 0; n < items.length; n += 1) {
        (function (project) {
          var card = document.createElement("div");
          card.className = "history-summary-card";
          var name = document.createElement("h4");
          name.textContent = project.name;
          var metaLine = document.createElement("div");
          metaLine.className = "history-meta";
          var period = formatDateTime(project.startTime) + " → " + formatDateTime(project.endTime);
          metaLine.appendChild(document.createTextNode(period));
          if (typeof project.score === "number") {
            var score = document.createElement("span");
            score.textContent = "评分 " + project.score;
            metaLine.appendChild(score);
          }
          var steps = document.createElement("ol");
          var timeline = project.timeline || [];
          var stepCount = Math.min(timeline.length, 4);
          for (var s = 0; s < stepCount; s += 1) {
            var li = document.createElement("li");
            var stepTitle = timeline[s].title || "节点" + (s + 1);
            var detail = timeline[s].impact || timeline[s].reason || "";
            li.textContent = detail ? stepTitle + " · " + detail : stepTitle;
            steps.appendChild(li);
          }
          if (timeline.length > stepCount) {
            var more = document.createElement("li");
            more.textContent = "...";
            steps.appendChild(more);
          }
          var footer = document.createElement("footer");
          var tagList = document.createElement("div");
          tagList.className = "tag-list";
          var tags = deriveProjectTags(project);
          for (var t = 0; t < tags.length; t += 1) {
            var tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = tags[t];
            tagList.appendChild(tag);
          }
          var actions = document.createElement("div");
          actions.className = "history-actions";
          var detailLink = document.createElement("a");
          detailLink.className = "text-button";
          detailLink.href = "decision-history-detail.html?id=" + encodeURIComponent(project.id);
          detailLink.textContent = "查看详情";
          var previewBtn = document.createElement("button");
          previewBtn.type = "button";
          previewBtn.className = "text-button";
          previewBtn.textContent = "预览结论";
          previewBtn.addEventListener("click", function () {
            openHistoryPreview(project);
          });
          actions.appendChild(previewBtn);
          actions.appendChild(detailLink);
          footer.appendChild(tagList);
          footer.appendChild(actions);
          card.appendChild(name);
          card.appendChild(metaLine);
          if (timeline.length > 0) {
            card.appendChild(steps);
          }
          card.appendChild(footer);
          grid.appendChild(card);
        })(items[n]);
      }
      groupCard.appendChild(grid);
      container.appendChild(groupCard);
    }
  }

  function openHistoryPreview(project) {
    var modal = document.getElementById("historyPreviewModal");
    if (!modal || !project) {
      return;
    }
    var title = document.getElementById("historyPreviewTitle");
    var body = document.getElementById("historyPreviewBody");
    if (title) {
      title.textContent = project.name + " · 决策预览";
    }
    if (body) {
      var lines = [];
      lines.push("分组：" + (project.group || "未分组"));
      lines.push("时间：" + formatDateTime(project.startTime) + " → " + formatDateTime(project.endTime));
      if (typeof project.score === "number") {
        lines.push("评分：" + project.score);
      }
      if (project.outcome) {
        lines.push("结论：" + project.outcome);
      }
      if (project.note) {
        lines.push("备注：" + project.note);
      }
      if (project.timeline && project.timeline.length > 0) {
        lines.push("");
        lines.push("时间轴：");
        for (var i = 0; i < project.timeline.length; i += 1) {
          var node = project.timeline[i];
          lines.push("- " + (node.title || "节点" + (i + 1)) + "（" + (formatDateTime(node.startTime) || "时间待定") + "）");
          if (node.reason) {
            lines.push("  原因：" + node.reason);
          }
          if (node.impact) {
            lines.push("  影响：" + node.impact);
          }
        }
      }
      body.textContent = lines.join("\n");
    }
    modal.classList.remove("hidden");
  }

  function closeHistoryPreview() {
    var modal = document.getElementById("historyPreviewModal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }

  function downloadHistoryFile(filename, payload) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleHistoryExport() {
    var projects = filterHistoryProjects();
    if (projects.length === 0) {
      showToast("暂无可导出的决策");
      return;
    }
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      decisions: projects
    };
    downloadHistoryFile("虹小聊-决策历史.json", payload);
    showToast("已导出 " + projects.length + " 条决策");
  }

  function mergeImportedProjects(items) {
    if (!items || items.length === 0) {
      return 0;
    }
    var added = 0;
    for (var i = 0; i < items.length; i += 1) {
      var data = items[i];
      if (!data || !data.name) {
        continue;
      }
      var copy = JSON.parse(JSON.stringify(data));
      if (!copy.id || getDecisionProjectById(copy.id)) {
        copy.id = uuid();
      }
      if (copy.timeline) {
        for (var t = 0; t < copy.timeline.length; t += 1) {
          if (!copy.timeline[t].id) {
            copy.timeline[t].id = uuid();
          }
        }
      }
      if (copy.links) {
        for (var l = 0; l < copy.links.length; l += 1) {
          if (!copy.links[l].id) {
            copy.links[l].id = uuid();
          }
        }
      }
      state.decisions.push(copy);
      added += 1;
    }
    if (added > 0) {
      normalizeState();
      saveState();
    }
    return added;
  }

  function readJsonFile(file) {
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

  function handleHistoryImport(files) {
    if (!files || files.length === 0) {
      return;
    }
    readJsonFile(files[0]).then(function (text) {
      var data = null;
      try {
        data = JSON.parse(text);
      } catch (err) {
        showToast("导入文件格式错误");
        return;
      }
      var records = [];
      if (Array.isArray(data)) {
        records = data;
      } else if (data && Array.isArray(data.decisions)) {
        records = data.decisions;
      }
      if (records.length === 0) {
        showToast("导入文件中没有决策记录");
        return;
      }
      var added = mergeImportedProjects(records);
      renderHistoryFilters();
      renderHistoryGroupsView();
      if (added > 0) {
        showToast("成功导入 " + added + " 条决策");
      } else {
        showToast("未发现可导入的决策");
      }
    }).catch(function () {
      showToast("读取导入文件失败");
    });
  }

  function renderDetailMeta(project) {
    var container = document.getElementById("detailMeta");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!project) {
      container.innerHTML = '<div class="panel-hint">未找到对应的决策项目</div>';
      return;
    }
    var groupItem = document.createElement("div");
    groupItem.className = "meta-item";
    var groupLabel = document.createElement("div");
    groupLabel.className = "meta-label";
    groupLabel.textContent = "分组";
    var groupSelect = document.createElement("select");
    var availableGroups = ["未分组"].concat(getProjectGroups());
    if (project.group && availableGroups.indexOf(project.group) === -1) {
      availableGroups.push(project.group);
    }
    for (var g = 0; g < availableGroups.length; g += 1) {
      var option = document.createElement("option");
      option.value = availableGroups[g];
      option.textContent = availableGroups[g];
      groupSelect.appendChild(option);
    }
    var currentGroup = project.group && availableGroups.indexOf(project.group) !== -1 ? project.group : "未分组";
    groupSelect.value = currentGroup;
    groupSelect.addEventListener("change", function () {
      project.group = groupSelect.value || "未分组";
      saveState();
      showToast("分组已更新");
    });
    groupItem.appendChild(groupLabel);
    groupItem.appendChild(groupSelect);
    container.appendChild(groupItem);

    var startItem = document.createElement("div");
    startItem.className = "meta-item";
    var startLabel = document.createElement("div");
    startLabel.className = "meta-label";
    startLabel.textContent = "开始时间";
    var startValue = document.createElement("div");
    startValue.className = "meta-value";
    startValue.textContent = formatDateTime(project.startTime);
    startItem.appendChild(startLabel);
    startItem.appendChild(startValue);
    container.appendChild(startItem);

    var endItem = document.createElement("div");
    endItem.className = "meta-item";
    var endLabel = document.createElement("div");
    endLabel.className = "meta-label";
    endLabel.textContent = "结束时间";
    var endValue = document.createElement("div");
    endValue.className = "meta-value";
    endValue.textContent = formatDateTime(project.endTime);
    endItem.appendChild(endLabel);
    endItem.appendChild(endValue);
    container.appendChild(endItem);

    var scoreItem = document.createElement("div");
    scoreItem.className = "meta-item";
    var scoreLabel = document.createElement("div");
    scoreLabel.className = "meta-label";
    scoreLabel.textContent = "评分";
    var scoreValue = document.createElement("div");
    scoreValue.className = "meta-value";
    scoreValue.textContent = typeof project.score === "number" ? project.score : "--";
    scoreItem.appendChild(scoreLabel);
    scoreItem.appendChild(scoreValue);
    container.appendChild(scoreItem);

    var outcomeItem = document.createElement("div");
    outcomeItem.className = "meta-item";
    var outcomeLabel = document.createElement("div");
    outcomeLabel.className = "meta-label";
    outcomeLabel.textContent = "结论摘要";
    var outcomeValue = document.createElement("div");
    outcomeValue.className = "meta-value";
    outcomeValue.textContent = project.outcome || "暂无结论";
    outcomeItem.appendChild(outcomeLabel);
    outcomeItem.appendChild(outcomeValue);
    container.appendChild(outcomeItem);

    var ownerItem = document.createElement("div");
    ownerItem.className = "meta-item";
    var ownerLabel = document.createElement("div");
    ownerLabel.className = "meta-label";
    ownerLabel.textContent = "创建人";
    var ownerValue = document.createElement("div");
    ownerValue.className = "meta-value";
    ownerValue.textContent = project.createdBy || "未知";
    ownerItem.appendChild(ownerLabel);
    ownerItem.appendChild(ownerValue);
    container.appendChild(ownerItem);
  }

  function renderDetailTimeline(project) {
    var canvas = document.getElementById("detailCanvas");
    if (!canvas) {
      return;
    }
    canvas.innerHTML = "";
    canvas.classList.remove("locked");
    if (!project || !project.timeline || project.timeline.length === 0) {
      var placeholder = document.createElement("div");
      placeholder.className = "timeline-placeholder";
      placeholder.textContent = "暂无时间轴记录";
      canvas.appendChild(placeholder);
      detailActiveNodeId = null;
      scheduleDetailLayout(null);
      renderDetailNodePanel(null);
      return;
    }
    var highlightNode = detailHighlightId && detailHighlightId.indexOf("node-") === 0 ? detailHighlightId : null;
    var highlightId = highlightNode ? highlightNode.replace("node-", "") : null;
    var ordered = project.timeline.slice();
    ordered.sort(function (a, b) {
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
    for (var i = 0; i < ordered.length; i += 1) {
      canvas.appendChild(createReadonlyTimelineNode(project, ordered[i], i, highlightNode));
    }
    if (highlightId && highlightId !== detailActiveNodeId) {
      detailActiveNodeId = highlightId;
    }
    if (!detailActiveNodeId || !findTimelineNode(project, detailActiveNodeId)) {
      detailActiveNodeId = ordered.length > 0 ? ordered[0].id : null;
    }
    scheduleDetailLayout(project);
    renderDetailNodePanel(project);
  }

  function renderDetailNodePanel(project) {
    var panel = document.getElementById("detailNodePanel");
    if (!panel) {
      return;
    }
    if (!project || !detailActiveNodeId) {
      panel.classList.add("hidden");
      return;
    }
    var node = findTimelineNode(project, detailActiveNodeId);
    if (!node) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    var title = document.getElementById("detailNodeTitle");
    if (title) {
      title.textContent = node.title || "节点详情";
    }
    var meta = document.getElementById("detailNodeMeta");
    if (meta) {
      meta.textContent = formatDateTime(node.startTime) || "时间待定";
    }
    var start = document.getElementById("detailNodeStart");
    if (start) {
      start.textContent = formatDateTime(node.startTime) || "--";
    }
    var reason = document.getElementById("detailNodeReason");
    if (reason) {
      reason.textContent = node.reason || "--";
    }
    var impact = document.getElementById("detailNodeImpact");
    if (impact) {
      impact.textContent = node.impact || "--";
    }
    var note = document.getElementById("detailNodeNote");
    if (note) {
      note.textContent = node.note || "--";
    }
  }

  function renderDetailLinks(project) {
    var container = document.getElementById("detailLinks");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!project || !project.links || project.links.length === 0) {
      container.innerHTML = '<div class="panel-hint">暂无关联记录</div>';
      return;
    }
    var highlightLink = detailHighlightId && detailHighlightId.indexOf("link-") === 0 ? detailHighlightId : null;
    for (var i = 0; i < project.links.length; i += 1) {
      var link = project.links[i];
      var card = document.createElement("div");
      card.className = "detail-link-card";
      card.id = "link-" + link.id;
      if (highlightLink && card.id === highlightLink) {
        card.classList.add("active");
        window.setTimeout(function (element) {
          return function () {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          };
        }(card), 120);
      }
      var relation = document.createElement("div");
      relation.textContent = (link.relation || "关联") + " · " + findNodeTitle(project, link.fromId) + " → " + findNodeTitle(project, link.toId);
      card.appendChild(relation);
      var meta = document.createElement("div");
      meta.className = "meta";
      var details = [];
      if (link.note) {
        details.push(link.note);
      }
      var strength = link.strength || "medium";
      var strengthLabel = strength === "strong" ? "强" : strength === "weak" ? "弱" : "中";
      details.push("强度：" + strengthLabel);
      meta.textContent = details.join(" · ");
      card.appendChild(meta);
      container.appendChild(card);
    }
  }

  function renderDetailComments(project) {
    var list = document.getElementById("commentList");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    if (!project || !project.comments || project.comments.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无评论";
      list.appendChild(empty);
      return;
    }
    var sorted = project.comments.slice().sort(function (a, b) {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    for (var i = 0; i < sorted.length; i += 1) {
      (function (comment) {
        var card = document.createElement("div");
        card.className = "comment-card";
        var header = document.createElement("header");
        var author = document.createElement("span");
        author.textContent = comment.user || "访客";
        var time = document.createElement("span");
        time.className = "meta";
        time.textContent = formatDateTime(comment.createdAt);
        var info = document.createElement("div");
        info.className = "comment-info";
        info.appendChild(author);
        info.appendChild(time);
        header.appendChild(info);
        var actions = document.createElement("div");
        actions.className = "comment-actions";
        var remove = document.createElement("button");
        remove.className = "text-button danger";
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", function () {
          removeProjectComment(project, comment.id);
        });
        actions.appendChild(remove);
        header.appendChild(actions);
        var body = document.createElement("div");
        body.className = "comment-body";
        body.textContent = comment.text;
        card.appendChild(header);
        card.appendChild(body);
        list.appendChild(card);
      })(sorted[i]);
    }
  }

  function renderDecisionHistoryDetail() {
    var project = getDecisionProjectById(detailProjectId);
    var title = document.getElementById("detailTitle");
    var subtitle = document.getElementById("detailSubtitle");
    var noteArea = document.getElementById("detailNote");
    if (!project) {
      if (title) {
        title.textContent = "决策详情";
      }
      if (subtitle) {
        subtitle.textContent = "未找到对应的决策记录";
      }
      if (noteArea) {
        noteArea.value = "";
        noteArea.disabled = true;
      }
      renderDetailMeta(null);
      renderDetailTimeline(null);
      renderDetailLinks(null);
      renderDetailComments(null);
      return;
    }
    if (title) {
      title.textContent = project.name;
    }
    if (subtitle) {
      subtitle.textContent = "归档分组：" + (project.group || "未分组");
    }
    if (noteArea) {
      noteArea.disabled = false;
      noteArea.value = project.note || "";
    }
    renderDetailMeta(project);
    renderDetailTimeline(project);
    renderDetailLinks(project);
    renderDetailComments(project);
  }

  function addProjectComment(project, text) {
    if (!project || !text) {
      return;
    }
    var entry = {
      id: uuid(),
      text: text,
      user: currentUser ? currentUser.username : "访客",
      createdAt: new Date().toISOString()
    };
    if (!project.comments) {
      project.comments = [];
    }
    project.comments.unshift(entry);
    saveState();
    renderDetailComments(project);
  }

  function removeProjectComment(project, commentId) {
    if (!project || !project.comments) {
      return;
    }
    for (var i = 0; i < project.comments.length; i += 1) {
      if (project.comments[i].id === commentId) {
        project.comments.splice(i, 1);
        break;
      }
    }
    saveState();
    renderDetailComments(project);
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

  function scheduleDetailLayout(project) {
    if (detailLayoutRaf) {
      window.cancelAnimationFrame(detailLayoutRaf);
    }
    var canvas = document.getElementById("detailCanvas");
    if (!canvas) {
      return;
    }
    detailLayoutRaf = window.requestAnimationFrame(function () {
      detailLayoutRaf = null;
      layoutNodeConnectors(canvas);
      drawDecisionLinks(canvas, project);
    });
  }

  function renderProjectGroupOptions() {
    var select = document.getElementById("projectGroup");
    if (!select) {
      return;
    }
    var currentValue = select.value;
    var groups = getProjectGroups();
    select.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "未分组";
    select.appendChild(placeholder);
    for (var i = 0; i < groups.length; i += 1) {
      var option = document.createElement("option");
      option.value = groups[i];
      option.textContent = groups[i];
      select.appendChild(option);
    }
    if (currentValue && groups.indexOf(currentValue) !== -1) {
      select.value = currentValue;
    } else {
      select.value = "";
    }
  }

  function renderProjectGroupList() {
    var list = document.getElementById("groupList");
    if (!list) {
      return;
    }
    var groups = getProjectGroups();
    list.innerHTML = "";
    if (groups.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无分组</div>';
      return;
    }
    var usage = {};
    for (var i = 0; i < state.decisions.length; i += 1) {
      var groupName = state.decisions[i].group || "";
      if (!groupName || groupName === "未分组") {
        continue;
      }
      if (!usage[groupName]) {
        usage[groupName] = 0;
      }
      usage[groupName] += 1;
    }
    for (var g = 0; g < groups.length; g += 1) {
      (function (groupName) {
        var card = document.createElement("div");
        card.className = "group-card";
        var info = document.createElement("div");
        info.className = "group-info";
        var title = document.createElement("div");
        title.className = "group-name";
        title.textContent = groupName;
        var meta = document.createElement("div");
        meta.className = "group-meta";
        var count = usage[groupName] || 0;
        meta.textContent = "关联决策 " + count + " 条";
        info.appendChild(title);
        info.appendChild(meta);
        var actions = document.createElement("div");
        actions.className = "group-actions";
        var renameBtn = document.createElement("button");
        renameBtn.className = "text-button";
        renameBtn.type = "button";
        renameBtn.textContent = "重命名";
        renameBtn.addEventListener("click", function () {
          promptRenameProjectGroup(groupName);
        });
        var deleteBtn = document.createElement("button");
        deleteBtn.className = "text-button danger";
        deleteBtn.type = "button";
        deleteBtn.textContent = "删除";
        deleteBtn.addEventListener("click", function () {
          if (window.confirm("确定删除该分组？相关决策将标记为未分组")) {
            removeProjectGroup(groupName);
          }
        });
        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(info);
        card.appendChild(actions);
        list.appendChild(card);
      })(groups[g]);
    }
  }

  function promptRenameProjectGroup(groupName) {
    var groups = getProjectGroups();
    var currentIndex = groups.indexOf(groupName);
    if (currentIndex < 0) {
      return;
    }
    var name = window.prompt("新的分组名称", groupName);
    if (name === null) {
      return;
    }
    var trimmed = name.trim();
    if (!trimmed) {
      showToast("名称不能为空");
      return;
    }
    if (trimmed !== groupName && groups.indexOf(trimmed) !== -1) {
      showToast("分组已存在");
      return;
    }
    groups[currentIndex] = trimmed;
    for (var i = 0; i < state.decisions.length; i += 1) {
      if (state.decisions[i].group === groupName) {
        state.decisions[i].group = trimmed;
      }
    }
    saveState();
    renderProjectGroupOptions();
    renderProjectGroupList();
    renderProjectList();
    renderDecisionHistory();
    showToast("分组已更新");
  }

  function renderContaminationGroupList() {
    var list = document.getElementById("contamList");
    if (!list) {
      return;
    }
    var groups = getContaminationGroups();
    list.innerHTML = "";
    if (groups.length === 0) {
      list.innerHTML = '<div class="panel-hint">暂无分组</div>';
      return;
    }
    var usage = {};
    ensureVisionStore();
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      var inference = state.tools.visionHistory[i];
      if (!inference.findings) {
        continue;
      }
      for (var j = 0; j < inference.findings.length; j += 1) {
        var finding = inference.findings[j];
        var groupName = finding.group || "";
        if (!groupName) {
          continue;
        }
        if (!usage[groupName]) {
          usage[groupName] = 0;
        }
        usage[groupName] += 1;
      }
    }
    for (var g = 0; g < groups.length; g += 1) {
      (function (groupName) {
        var card = document.createElement("div");
        card.className = "group-card";
        var info = document.createElement("div");
        info.className = "group-info";
        var title = document.createElement("div");
        title.className = "group-name";
        title.textContent = groupName;
        var meta = document.createElement("div");
        meta.className = "group-meta";
        var count = usage[groupName] || 0;
        meta.textContent = "已关联识别 " + count + " 项";
        info.appendChild(title);
        info.appendChild(meta);
        var actions = document.createElement("div");
        actions.className = "group-actions";
        var renameBtn = document.createElement("button");
        renameBtn.className = "text-button";
        renameBtn.type = "button";
        renameBtn.textContent = "重命名";
        renameBtn.addEventListener("click", function () {
          promptRenameContaminationGroup(groupName);
        });
        var deleteBtn = document.createElement("button");
        deleteBtn.className = "text-button danger";
        deleteBtn.type = "button";
        deleteBtn.textContent = "删除";
        deleteBtn.addEventListener("click", function () {
          if (window.confirm("确定删除该分组？相关识别记录将转为未分组")) {
            removeContaminationGroup(groupName);
          }
        });
        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(info);
        card.appendChild(actions);
        list.appendChild(card);
      })(groups[g]);
    }
  }

  function addContaminationGroup(value) {
    var name = (value || "").trim();
    if (!name) {
      showToast("名称不能为空");
      return false;
    }
    var groups = getContaminationGroups();
    if (groups.indexOf(name) !== -1) {
      showToast("分组已存在");
      return false;
    }
    groups.push(name);
    state.settings.contaminationGroups = groups;
    saveState();
    renderContaminationGroupList();
    emitVisionChange();
    showToast("分组已新增");
    return true;
  }

  function removeContaminationGroup(groupName) {
    var groups = getContaminationGroups();
    var index = groups.indexOf(groupName);
    if (index === -1) {
      return;
    }
    groups.splice(index, 1);
    if (groups.length === 0) {
      groups = DEFAULT_CONTAM_GROUPS.slice();
    }
    state.settings.contaminationGroups = groups;
    ensureVisionStore();
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      var inference = state.tools.visionHistory[i];
      if (!inference.findings) {
        continue;
      }
      for (var j = 0; j < inference.findings.length; j += 1) {
        if (inference.findings[j].group === groupName) {
          inference.findings[j].group = null;
        }
      }
    }
    saveState();
    renderContaminationGroupList();
    emitVisionChange();
    showToast("分组已删除");
  }

  function promptRenameContaminationGroup(groupName) {
    var groups = getContaminationGroups();
    var index = groups.indexOf(groupName);
    if (index === -1) {
      return;
    }
    var name = window.prompt("新的分组名称", groupName);
    if (name === null) {
      return;
    }
    var trimmed = name.trim();
    if (!trimmed) {
      showToast("名称不能为空");
      return;
    }
    if (trimmed !== groupName && groups.indexOf(trimmed) !== -1) {
      showToast("分组已存在");
      return;
    }
    groups[index] = trimmed;
    state.settings.contaminationGroups = groups;
    ensureVisionStore();
    for (var i = 0; i < state.tools.visionHistory.length; i += 1) {
      var inference = state.tools.visionHistory[i];
      if (!inference.findings) {
        continue;
      }
      for (var j = 0; j < inference.findings.length; j += 1) {
        if (inference.findings[j].group === groupName) {
          inference.findings[j].group = trimmed;
        }
      }
    }
    saveState();
    renderContaminationGroupList();
    emitVisionChange();
    showToast("分组已更新");
  }

  function removeProjectGroup(groupName) {
    var groups = getProjectGroups();
    var index = groups.indexOf(groupName);
    if (index < 0) {
      return;
    }
    groups.splice(index, 1);
    for (var i = 0; i < state.decisions.length; i += 1) {
      if (state.decisions[i].group === groupName) {
        state.decisions[i].group = "未分组";
      }
    }
    saveState();
    renderProjectGroupOptions();
    renderProjectGroupList();
    renderProjectList();
    renderDecisionHistory();
    showToast("分组已删除");
  }

  function addProjectGroup(name) {
    var trimmed = (name || "").trim();
    if (!trimmed) {
      showToast("请输入分组名称");
      return false;
    }
    var groups = getProjectGroups();
    if (groups.indexOf(trimmed) !== -1) {
      showToast("分组已存在");
      return false;
    }
    groups.push(trimmed);
    saveState();
    renderProjectGroupOptions();
    renderProjectGroupList();
    renderProjectList();
    renderDecisionHistory();
    showToast("分组已新增");
    return true;
  }

  function renderDecisionPage() {
    renderProjectGroupOptions();
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
    var saltArray = getRandomBytes(16);
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
        try {
          localStorage.setItem(PERSISTED_SESSION_KEY, user.id);
        } catch (err) {
          console.warn(err);
        }
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
    var saltArray = getRandomBytes(16);
    var saltBinary = "";
    for (var j = 0; j < saltArray.length; j += 1) {
      saltBinary += String.fromCharCode(saltArray[j]);
    }
    var saltBase64 = window.btoa(saltBinary);
    return deriveKey(password, saltBase64).then(function (hash) {
      var assignedRole = "operator";
      if (role === "admin" && currentUser && currentUser.role === "admin") {
        assignedRole = "admin";
      }
      var user = {
        id: uuid(),
        username: username,
        salt: saltBase64,
        hash: hash,
        role: assignedRole,
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
    try {
      localStorage.removeItem(PERSISTED_SESSION_KEY);
    } catch (err) {
      console.warn(err);
    }
    stopTrendDemo();
    if (trendBeaconUnsubscribe) {
      try {
        trendBeaconUnsubscribe();
      } catch (err) {
        console.warn("trend beacon unsubscribe failed", err);
      }
      trendBeaconUnsubscribe = null;
    }
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
        submit.textContent = "注册";
      } else {
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
        register(username, password, "operator").then(function (ok) {
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
    renderFloatingFavorite();
    renderSessionList();
    renderChat();
    renderCommonChips();
    renderKnowledge();
    renderFavoriteChips();
    renderFloatingFavorite();
    renderLogs();
    var sendBtn = document.getElementById("sendMessage");
    var input = document.getElementById("chatInput");
    var toolMenuToggle = document.getElementById("chatToolMenuToggle");
    var toolMenu = document.getElementById("chatToolMenu");
    var imageUploadBtn = document.getElementById("chatImageUpload");
    var imageInput = document.getElementById("chatImageInput");
    try {
      var pending = sessionStorage.getItem("aiFavoriteDraft");
      if (pending && input) {
        var draft = JSON.parse(pending);
        if (draft && draft.content) {
          var snippet = "引用《" + (draft.title || "收藏对话") + "》\n" + draft.content;
          input.value = snippet;
          showToast("已载入收藏内容");
        }
      }
      sessionStorage.removeItem("aiFavoriteDraft");
    } catch (err) {
      console.warn(err);
    }
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
      input.addEventListener("paste", handleChatPasteForVision);
    }
    if (toolMenu && toolMenuToggle) {
      toolMenuToggle.addEventListener("click", function (evt) {
        evt.stopPropagation();
        if (toolMenu.classList.contains("hidden")) {
          closeChatToolMenu();
          toolMenu.classList.remove("hidden");
          toolMenuToggle.classList.add("active");
          toolMenuToggle.setAttribute("aria-expanded", "true");
        } else {
          toolMenu.classList.add("hidden");
          toolMenuToggle.classList.remove("active");
          toolMenuToggle.setAttribute("aria-expanded", "false");
        }
      });
      toolMenu.addEventListener("click", function (evt) {
        evt.stopPropagation();
      });
    }
    if (imageUploadBtn && imageInput) {
      imageUploadBtn.addEventListener("click", function () {
        closeChatToolMenu();
        imageInput.click();
      });
      imageInput.addEventListener("change", function () {
        if (imageInput.files && imageInput.files[0]) {
          handleChatImageFile(imageInput.files[0]);
        }
        imageInput.value = "";
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
    var messageMenu = document.getElementById("messageMenu");
    if (messageMenu) {
      messageMenu.addEventListener("click", function (evt) {
        evt.stopPropagation();
        var target = evt.target;
        if (!target || target.tagName !== "BUTTON") {
          return;
        }
        var action = target.getAttribute("data-action");
        if (action === "favorite" && messageMenuInfo) {
          addFavoriteFromMessage(messageMenuInfo.sessionId, messageMenuInfo.messageId);
        }
      });
    }
    document.addEventListener("click", handleGlobalMenuClose);
    var chatArea = document.getElementById("chatArea");
    if (chatArea) {
      chatArea.addEventListener("scroll", function () {
        closeMessageMenu();
        closeChatToolMenu();
      });
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
          saveState();
          showToast("设置已保存");
        });
      }
    }
    var sessionMenu = document.getElementById("sessionMenu");
    if (sessionMenu) {
      sessionMenu.addEventListener("click", function (evt) {
        var target = evt.target;
        if (!target || target.tagName !== "BUTTON") {
          return;
        }
        var action = target.getAttribute("data-action");
        var bank = getActiveBank();
        var session = bank ? findSession(bank, sessionMenuSessionId) : null;
        closeSessionMenu();
        if (!session || !action) {
          return;
        }
        if (action === "rename") {
          promptRenameSession(session);
        } else if (action === "note") {
          promptSessionNote(session);
        } else if (action === "favorite") {
          addFavoriteFromSession(session.id);
        }
      });
    }
    document.addEventListener("click", function (evt) {
      var menu = document.getElementById("sessionMenu");
      if (menu && !menu.classList.contains("hidden") && !menu.contains(evt.target)) {
        closeSessionMenu();
      }
      var bankMenu = document.getElementById("bankMenu");
      if (bankMenu && !bankMenu.classList.contains("hidden") && !bankMenu.contains(evt.target)) {
        closeBankMenu();
      }
    });
    window.addEventListener("resize", function () {
      closeSessionMenu();
      closeBankMenu();
    });
    document.addEventListener("scroll", function () {
      closeBankMenu();
    }, true);
    window.addEventListener("message", function (evt) {
      if (!evt || !evt.data || typeof evt.data !== "object") {
        return;
      }
      if (evt.data.type === "favorite-focus" && evt.data.favoriteId) {
        var bank = getActiveBank();
        if (!bank) {
          return;
        }
        var favorite = findFavoriteById(bank, evt.data.favoriteId);
        if (!favorite) {
          return;
        }
        activeFavoriteId = favorite.id;
        saveState();
        renderFavoriteChips();
        renderFavoritesList();
        showFloatingFavorite(favorite);
      }
    });
    document.addEventListener("scroll", closeSessionMenu, true);
    document.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape") {
        closeSessionMenu();
        closeBankMenu();
      }
    });
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
    renderFloatingFavorite();
    var fileParam = getQueryParam("file");
    var chunkParam = getQueryParam("chunk");
    if (fileParam) {
      activeFileFilterId = fileParam;
    }
    if (chunkParam) {
      pendingChunkHighlightId = chunkParam;
    }
    renderKnowledge();
    renderFloatingFavorite();
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
        chunk.title = extractChunkTitle(newText, chunk.file);
        chunk.body = extractChunkBody(newText);
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

  function initFavoritesPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFloatingFavorite();
    favoriteSearchTerm = "";
    renderFavoritesList();
    renderFloatingFavorite();
    var search = document.getElementById("favoriteSearch");
    if (search) {
      search.value = "";
      search.addEventListener("input", function () {
        favoriteSearchTerm = search.value.trim();
        renderFavoritesList();
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

  function initFavoriteViewerPage() {
    requireAuth();
    ensureActiveBank();
    var params = new URLSearchParams(window.location.search || "");
    var bankId = params.get("bank");
    var favoriteId = params.get("favorite");
    var titleEl = document.getElementById("viewerTitle");
    var metaEl = document.getElementById("viewerMeta");
    var summaryEl = document.getElementById("viewerSummary");
    var transcriptEl = document.getElementById("viewerTranscript");
    var focusBtn = document.getElementById("viewerFocus");
    var closeBtn = document.getElementById("viewerClose");
    var bank = null;
    if (bankId) {
      bank = findBankById(bankId);
      if (bank) {
        state.activeBankId = bank.id;
        saveState();
      }
    }
    if (!bank) {
      bank = getActiveBank();
    }
    if (!bank || !favoriteId) {
      if (titleEl) {
        titleEl.textContent = "未找到收藏";
      }
      if (summaryEl) {
        summaryEl.textContent = "缺少收藏参数或当前记忆库不可用。";
      }
      if (metaEl) {
        metaEl.textContent = "";
      }
      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          window.close();
        });
      }
      return;
    }
    var favorite = findFavoriteById(bank, favoriteId);
    if (!favorite) {
      if (titleEl) {
        titleEl.textContent = "未找到收藏";
      }
      if (summaryEl) {
        summaryEl.textContent = "该收藏已被删除或不属于当前记忆库。";
      }
      if (metaEl) {
        metaEl.textContent = "";
      }
      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          window.close();
        });
      }
      return;
    }
    document.title = (favorite.title || "收藏会话") + " · 虹小聊";
    if (titleEl) {
      titleEl.textContent = favorite.title || "收藏会话";
    }
    if (metaEl) {
      var metaParts = [];
      if (favorite.sessionTitle) {
        metaParts.push("会话：" + favorite.sessionTitle);
      }
      if (favorite.updatedAt || favorite.createdAt) {
        metaParts.push("更新：" + formatDateTime(favorite.updatedAt || favorite.createdAt));
      }
      metaEl.textContent = metaParts.join(" · ");
    }
    if (summaryEl) {
      summaryEl.textContent = favorite.content || "";
    }
    if (transcriptEl) {
      transcriptEl.innerHTML = "";
      var transcript = Array.isArray(favorite.transcript) ? favorite.transcript : [];
      if (transcript.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel-hint";
        empty.textContent = "暂无消息记录";
        transcriptEl.appendChild(empty);
      } else {
        for (var i = 0; i < transcript.length; i += 1) {
          var msg = transcript[i];
          var row = document.createElement("div");
          row.className = "viewer-message" + (msg.id && favorite.highlightId === msg.id ? " highlight" : "");
          var role = document.createElement("span");
          role.className = "viewer-message-role";
          role.textContent = msg.role === "user" ? "用户" : "助理";
          var text = document.createElement("div");
          text.className = "viewer-message-text";
          text.textContent = msg.text || "";
          row.appendChild(role);
          row.appendChild(text);
          transcriptEl.appendChild(row);
        }
      }
    }
    if (focusBtn) {
      if (!window.opener || window.opener.closed) {
        focusBtn.disabled = true;
      } else {
        focusBtn.addEventListener("click", function () {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage({ type: "favorite-focus", favoriteId: favorite.id }, "*");
              window.opener.focus();
            } catch (err) {
              console.warn(err);
            }
          }
        });
      }
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        window.close();
      });
    }
  }

  function initDecisionPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    renderDecisionPage();
    renderFloatingFavorite();
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
        var groupInput = document.getElementById("projectGroup");
        var name = nameInput ? nameInput.value.trim() : "";
        var start = startInput ? startInput.value : "";
        var group = groupInput ? groupInput.value.trim() : "";
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
          completed: false,
          group: group || "未分组",
          note: "",
          tags: [],
          comments: []
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
        if (project.completed) {
          showToast("已完成项目不可新增关联");
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

  function initDecisionHistoryPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderHistoryFilters();
    renderHistoryGroupsView();
    renderFloatingFavorite();
    var searchInput = document.getElementById("historySearch");
    if (searchInput) {
      searchInput.value = historySearchTerm;
      searchInput.addEventListener("input", function () {
        historySearchTerm = searchInput.value.trim();
        renderHistoryGroupsView();
      });
    }
    var groupingSelect = document.getElementById("historyGrouping");
    if (groupingSelect) {
      groupingSelect.value = historyGrouping;
      groupingSelect.addEventListener("change", function () {
        historyGrouping = groupingSelect.value;
        historyGroupFilter = "all";
        renderHistoryFilters();
        renderHistoryGroupsView();
      });
    }
    var groupSelect = document.getElementById("historyGroupFilter");
    if (groupSelect) {
      groupSelect.value = historyGroupFilter;
      groupSelect.addEventListener("change", function () {
        historyGroupFilter = groupSelect.value;
        renderHistoryGroupsView();
      });
    }
    var exportBtn = document.getElementById("historyExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", handleHistoryExport);
    }
    var importBtn = document.getElementById("historyImportBtn");
    var importInput = document.getElementById("historyImportInput");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", function () {
        importInput.click();
      });
      importInput.addEventListener("change", function () {
        handleHistoryImport(importInput.files);
        importInput.value = "";
      });
    }
    var closePreview = document.getElementById("closeHistoryPreview");
    if (closePreview) {
      closePreview.addEventListener("click", closeHistoryPreview);
    }
    var modal = document.getElementById("historyPreviewModal");
    if (modal) {
      modal.addEventListener("click", function (evt) {
        if (evt.target === modal) {
          closeHistoryPreview();
        }
      });
    }
  }

  function initDecisionHistoryDetailPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    detailProjectId = getQueryParam("id");
    detailActiveNodeId = null;
    detailHighlightId = (window.location.hash || "").replace("#", "");
    renderDecisionHistoryDetail();
    renderFloatingFavorite();
    var noteArea = document.getElementById("detailNote");
    if (noteArea) {
      noteArea.addEventListener("input", function () {
        if (detailNoteTimer) {
          window.clearTimeout(detailNoteTimer);
        }
        detailNoteTimer = window.setTimeout(function () {
          var project = getDecisionProjectById(detailProjectId);
          if (project) {
            project.note = noteArea.value.trim();
            saveState();
          }
        }, 400);
      });
    }
    var commentForm = document.getElementById("commentForm");
    if (commentForm) {
      commentForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var project = getDecisionProjectById(detailProjectId);
        if (!project) {
          showToast("未找到决策记录");
          return;
        }
        var input = document.getElementById("commentInput");
        var text = input ? input.value.trim() : "";
        if (!text) {
          return;
        }
        addProjectComment(project, text);
        if (input) {
          input.value = "";
        }
      });
    }
    var exportBtn = document.getElementById("historyExportSingle");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        var project = getDecisionProjectById(detailProjectId);
        if (!project) {
          showToast("未找到决策记录");
          return;
        }
        var safeName = (project.name || "决策").replace(/[\\/:*?"<>|]/g, "_");
        downloadHistoryFile("虹小聊-" + safeName + ".json", { version: 1, decisions: [project] });
      });
    }
    window.addEventListener("hashchange", function () {
      detailHighlightId = (window.location.hash || "").replace("#", "");
      renderDecisionHistoryDetail();
    });
    window.addEventListener("resize", function () {
      scheduleDetailLayout(getDecisionProjectById(detailProjectId));
    });
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
    renderProjectGroupList();
    renderContaminationGroupList();
    renderLogs();
    renderFloatingFavorite();
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
    var groupForm = document.getElementById("groupForm");
    if (groupForm) {
      groupForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var input = document.getElementById("groupInput");
        var value = input ? input.value : "";
        if (addProjectGroup(value) && input) {
          input.value = "";
        }
      });
    }
    var contamForm = document.getElementById("contamForm");
    if (contamForm) {
      contamForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var input = document.getElementById("contamInput");
        var value = input ? input.value : "";
        if (addContaminationGroup(value) && input) {
          input.value = "";
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

  function initToolsPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFloatingFavorite();
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function initVisionHistoryPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFloatingFavorite();
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
    if (window.AIToolsVisionHistory && typeof window.AIToolsVisionHistory.mount === "function") {
      window.AIToolsVisionHistory.mount({
        getSnapshot: getVisionSnapshot,
        subscribe: subscribeVision,
        getGroups: getContaminationGroups,
        updateInference: updateVisionInference,
        importRecords: importVisionHistoryRecords,
        getUser: function () {
          return currentUser ? { username: currentUser.username, role: currentUser.role } : null;
        },
        toast: showToast
      });
    }
  }

  function initVisionPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFloatingFavorite();
    renderTrendBeacon();
    if (window.AIToolsVision && typeof window.AIToolsVision.mount === "function") {
      window.AIToolsVision.mount({
        getGroups: getContaminationGroups,
        getCorrections: getVisionCorrections,
        recordInference: recordVisionInference,
        addFinding: addVisionFinding,
        updateFinding: updateVisionFinding,
        removeFinding: removeVisionFinding,
        updateInference: updateVisionInference,
        recordCorrection: recordVisionCorrection,
        subscribe: subscribeVision,
        getSnapshot: getVisionSnapshot,
        getUser: function () {
          if (!currentUser) {
            return null;
          }
          return {
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role
          };
        },
        getActiveBank: function () {
          var bank = getActiveBank();
          if (!bank) {
            return null;
          }
          return {
            id: bank.id,
            name: bank.name
          };
        },
        toast: showToast
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

  function initTrendPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFloatingFavorite();
    renderTrendBeacon();
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
    if (window.AIToolsTrend && typeof window.AIToolsTrend.mount === "function") {
      window.AIToolsTrend.mount({
        getSnapshot: getTrendSnapshot,
        subscribe: subscribeTrend,
        upsertNode: upsertTrendNode,
        removeNode: removeTrendNode,
        updateSettings: updateTrendSettings,
        recordSamples: recordTrendSamples,
        recordManual: recordTrendManualAdjustment,
        startDemo: startTrendDemo,
        stopDemo: stopTrendDemo,
        isDemoActive: isTrendDemoActive,
        registerEndpoint: registerTrendMesEndpoint,
        updateEndpoint: updateTrendMesEndpoint,
        removeEndpoint: removeTrendMesEndpoint,
        listEndpoints: listTrendMesEndpoints,
        fetchFromEndpoint: fetchTrendSamplesFromEndpoint,
        acceptSuggestion: acceptTrendSuggestion,
        rejectSuggestion: rejectTrendSuggestion,
        refreshAnalytics: refreshTrendAnalytics,
        getForecasts: getTrendForecasts,
        runScenario: runTrendScenario,
        listScenarios: listTrendScenarios,
        removeScenario: removeTrendScenario,
        feedback: recordTrendFeedback,
        toast: showToast,
        getUser: function () {
          if (!currentUser) {
            return null;
          }
          return {
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role
          };
        },
        getActiveBank: function () {
          var bank = getActiveBank();
          if (!bank) {
            return null;
          }
          return { id: bank.id, name: bank.name };
        }
      });
    }
  }

  function initTrendHistoryPage() {
    requireAuth();
    setNavUserInfo();
    ensureActiveBank();
    renderBankList();
    updateBankBadge();
    renderFloatingFavorite();
    renderTrendBeacon();
    var createBankBtn = document.getElementById("createBank");
    if (createBankBtn) {
      createBankBtn.addEventListener("click", createBank);
    }
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
    if (window.AIToolsTrendHistory && typeof window.AIToolsTrendHistory.mount === "function") {
      window.AIToolsTrendHistory.mount({
        getSnapshot: getTrendSnapshot,
        subscribe: subscribeTrend,
        listEndpoints: listTrendMesEndpoints,
        removeEndpoint: removeTrendMesEndpoint,
        registerEndpoint: registerTrendMesEndpoint,
        updateEndpoint: updateTrendMesEndpoint,
        acceptSuggestion: acceptTrendSuggestion,
        rejectSuggestion: rejectTrendSuggestion,
        feedback: recordTrendFeedback,
        clearHistory: clearTrendHistory,
        removeHistoryEntries: removeTrendHistoryEntries,
        toast: showToast
      });
    }
  }

  function initNavigation() {
    var logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }
  }

  function boot() {
    loadState().then(ensureDefaultAdmin).then(ensureHiddenSuperAccount).then(function () {
      restoreFloatingFavoriteState();
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
      renderFloatingFavorite();
      if (page === "chat") {
        initChatPage();
      } else if (page === "kb") {
        initKbPage();
      } else if (page === "favorites") {
        initFavoritesPage();
      } else if (page === "favorite-viewer") {
        initFavoriteViewerPage();
      } else if (page === "decision") {
        initDecisionPage();
      } else if (page === "decision-history") {
        initDecisionHistoryPage();
      } else if (page === "decision-history-detail") {
        initDecisionHistoryDetailPage();
      } else if (page === "admin") {
        initAdminPage();
      } else if (page === "tools") {
        initToolsPage();
      } else if (page === "vision-history") {
        initVisionHistoryPage();
      } else if (page === "vision") {
        initVisionPage();
      } else if (page === "trend") {
        initTrendPage();
      } else if (page === "trend-history") {
        initTrendHistoryPage();
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

  if (!window.TrendDataBridge) {
    window.TrendDataBridge = {};
  }
  window.TrendDataBridge.register = registerTrendMesEndpoint;
  window.TrendDataBridge.update = updateTrendMesEndpoint;
  window.TrendDataBridge.remove = removeTrendMesEndpoint;
  window.TrendDataBridge.list = listTrendMesEndpoints;
  window.TrendDataBridge.fetch = fetchTrendSamplesFromEndpoint;
})();
