(function () {
  function initTrendOrderModule(services) {
    if (!services || typeof services.getSnapshot !== "function") {
      return;
    }
    var state = {
      snapshot: null,
      orderContext: null,
      currentGroupId: null,
      selected: null,
      unsubscribe: null
    };

    var gridEl = document.getElementById("trendOrderGrid");
    var emptyEl = document.getElementById("trendOrderEmpty");
    var breadcrumbEl = document.getElementById("trendOrderBreadcrumb");
    var backBtn = document.getElementById("trendOrderBackMain");
    var upBtn = document.getElementById("trendOrderUp");
    var newGroupBtn = document.getElementById("trendOrderNewGroup");
    var newNodeBtn = document.getElementById("trendOrderNewNode");
    var consoleBtn = document.getElementById("trendOrderOpenConsole");
    var metricsEl = document.getElementById("trendOrderMetrics");
    var sequenceEl = document.getElementById("trendOrderSequence");
    var refreshBtn = document.getElementById("trendOrderRefresh");
    var formEl = document.getElementById("trendOrderForm");
    var idInput = document.getElementById("trendOrderId");
    var nameInput = document.getElementById("trendOrderName");
    var modeSelect = document.getElementById("trendOrderMode");
    var refSelect = document.getElementById("trendOrderRef");
    var refManual = document.getElementById("trendOrderRefManual");
    var noteInput = document.getElementById("trendOrderNote");
    var resetBtn = document.getElementById("trendOrderReset");
    var hintsEl = document.getElementById("trendOrderHints");

    function mount() {
      refreshSnapshot();
      if (typeof services.subscribe === "function") {
        state.unsubscribe = services.subscribe(function () {
          refreshSnapshot();
        });
      }
    }

    function refreshSnapshot() {
      try {
        state.snapshot = services.getSnapshot({ streamLimit: 0 });
      } catch (err) {
        console.warn("trend order snapshot failed", err);
        state.snapshot = services.getSnapshot();
      }
      if (typeof services.describeOrdering === "function") {
        state.orderContext = services.describeOrdering();
      } else {
        state.orderContext = null;
      }
      renderAll();
    }

    function renderAll() {
      renderBreadcrumb();
      renderGrid();
      renderMetrics();
      renderSequence();
      renderDetail();
    }

    function getGroups() {
      return (state.snapshot && Array.isArray(state.snapshot.nodes)) ? state.snapshot.nodes : [];
    }

    function findGroupById(id) {
      if (!id) {
        return null;
      }
      var groups = getGroups();
      for (var i = 0; i < groups.length; i += 1) {
        if (groups[i] && groups[i].id === id) {
          return groups[i];
        }
      }
      return null;
    }

    function getCurrentGroups() {
      var groups = getGroups();
      if (!state.currentGroupId) {
        return groups.filter(function (group) { return group && !group.parentId; });
      }
      return groups.filter(function (group) { return group && group.parentId === state.currentGroupId; });
    }

    function getCurrentNodes() {
      if (!state.currentGroupId) {
        return [];
      }
      var group = findGroupById(state.currentGroupId);
      if (!group || !Array.isArray(group.children)) {
        return [];
      }
      return group.children;
    }

    function renderBreadcrumb() {
      if (!breadcrumbEl) {
        return;
      }
      var path = [];
      var cursor = state.currentGroupId;
      while (cursor) {
        var group = findGroupById(cursor);
        if (!group) {
          break;
        }
        path.unshift(group);
        cursor = group.parentId || null;
      }
      if (!path.length) {
        breadcrumbEl.textContent = "顶层节点组";
        return;
      }
      var parts = path.map(function (group) { return group.name || group.id; });
      breadcrumbEl.textContent = parts.join(" / ");
    }

    function summarizeRelation(info) {
      if (!info) {
        return "";
      }
      var mode = info.positionMode || "after";
      var ref = info.positionRef || "";
      if (!ref) {
        return mode === "after" ? "默认顺序" : relationLabel(mode);
      }
      var refName = lookupName(ref);
      return relationLabel(mode) + " → " + refName;
    }

    function relationLabel(mode) {
      if (mode === "before") {
        return "位于之前";
      }
      if (mode === "parallel" || mode === "same") {
        return "并行";
      }
      return "位于之后";
    }

    function lookupInfo(id) {
      if (!state.orderContext || !state.orderContext.info) {
        return null;
      }
      return state.orderContext.info[id] || null;
    }

    function lookupName(id) {
      var info = lookupInfo(id);
      if (info && info.name) {
        return info.name;
      }
      if (id === (state.snapshot && state.snapshot.settings && state.snapshot.settings.outputNodeId)) {
        return state.snapshot && state.snapshot.settings ? state.snapshot.settings.outputName || "引出量中心" : "引出量中心";
      }
      return id;
    }

    function renderGrid() {
      if (!gridEl || !emptyEl) {
        return;
      }
      gridEl.innerHTML = "";
      var groups = getCurrentGroups();
      var nodes = getCurrentNodes();
      if ((!groups || !groups.length) && (!nodes || !nodes.length)) {
        emptyEl.style.display = "block";
        return;
      }
      emptyEl.style.display = "none";
      var fragment = document.createDocumentFragment();
      groups.forEach(function (group) {
        if (!group || !group.id) {
          return;
        }
        var card = document.createElement("div");
        card.className = "trend-order-card trend-order-card--group" + (state.selected && state.selected.id === group.id ? " is-active" : "");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.dataset.id = group.id;
        card.dataset.kind = "group";
        var info = lookupInfo(group.id);
        card.innerHTML = [
          '<div class="trend-order-card-title">' + escapeHtml(group.name || group.id) + '</div>',
          '<div class="trend-order-card-meta">ID：' + escapeHtml(group.id) + '</div>',
          '<div class="trend-order-card-order">' + escapeHtml(summarizeRelation(info)) + '</div>'
        ].join("");
        card.addEventListener("click", function () {
          setSelected({ id: group.id, kind: "group" });
        });
        card.addEventListener("dblclick", function () {
          openGroup(group.id);
        });
        fragment.appendChild(card);
      });
      nodes.forEach(function (node) {
        if (!node || !node.id) {
          return;
        }
        var card = document.createElement("div");
        card.className = "trend-order-card trend-order-card--node" + (state.selected && state.selected.id === node.id ? " is-active" : "");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.dataset.id = node.id;
        card.dataset.kind = "node";
        card.dataset.groupId = state.currentGroupId || "";
        var info = lookupInfo(node.id);
        card.innerHTML = [
          '<div class="trend-order-card-title">' + escapeHtml(node.name || node.id) + '</div>',
          '<div class="trend-order-card-meta">ID：' + escapeHtml(node.id) + '</div>',
          '<div class="trend-order-card-order">' + escapeHtml(summarizeRelation(info)) + '</div>'
        ].join("");
        card.addEventListener("click", function () {
          setSelected({ id: node.id, kind: "node", groupId: state.currentGroupId || null });
        });
        fragment.appendChild(card);
      });
      gridEl.appendChild(fragment);
    }

    function renderMetrics() {
      if (!metricsEl) {
        return;
      }
      metricsEl.innerHTML = "";
      var groups = getGroups();
      var totalNodes = 0;
      groups.forEach(function (group) {
        if (group && Array.isArray(group.children)) {
          totalNodes += group.children.length;
        }
      });
      var metrics = [
        { label: "节点组", value: groups.length },
        { label: "节点数量", value: totalNodes },
        { label: "当前目录", value: getCurrentGroups().length + getCurrentNodes().length }
      ];
      metrics.forEach(function (metric) {
        var card = document.createElement("div");
        card.className = "trend-metric-card";
        var label = document.createElement("div");
        label.className = "trend-metric-label";
        label.textContent = metric.label;
        var value = document.createElement("div");
        value.className = "trend-metric-value";
        value.textContent = metric.value;
        card.appendChild(label);
        card.appendChild(value);
        metricsEl.appendChild(card);
      });
    }

    function renderSequence() {
      if (!sequenceEl) {
        return;
      }
      sequenceEl.innerHTML = "";
      var list = typeof services.listSequence === "function" ? services.listSequence() : [];
      if (!list || !list.length) {
        var empty = document.createElement("li");
        empty.textContent = "暂无顺序信息";
        sequenceEl.appendChild(empty);
        return;
      }
      list.slice(0, 12).forEach(function (item) {
        if (!item) {
          return;
        }
        var li = document.createElement("li");
        var name = item.name || item.id;
        var relation = summarizeRelation(lookupInfo(item.id));
        li.textContent = name + " · " + relation;
        sequenceEl.appendChild(li);
      });
    }

    function renderDetail() {
      if (!formEl || !idInput || !nameInput || !modeSelect || !refSelect || !refManual || !noteInput || !hintsEl) {
        return;
      }
      if (!state.selected) {
        formEl.classList.add("disabled");
        idInput.value = "";
        nameInput.value = "";
        noteInput.value = "";
        modeSelect.value = "after";
        refSelect.innerHTML = "";
        refManual.value = "";
        hintsEl.textContent = "请选择左侧节点或节点组配置排序关系。";
        return;
      }
      formEl.classList.remove("disabled");
      var info = lookupInfo(state.selected.id);
      idInput.value = state.selected.id;
      nameInput.value = info && info.name ? info.name : lookupName(state.selected.id);
      modeSelect.value = info && info.positionMode ? info.positionMode : "after";
      populateReferenceOptions(info);
      noteInput.value = info && info.orderNote ? info.orderNote : "";
      renderHints(info);
    }

    function renderHints(info) {
      if (!hintsEl) {
        return;
      }
      if (!info) {
        hintsEl.textContent = "";
        return;
      }
      var lines = [];
      if (info.positionRef) {
        lines.push("当前参考：" + lookupName(info.positionRef));
      }
      var adjacency = state.orderContext && state.orderContext.adjacency ? state.orderContext.adjacency : {};
      var entry = adjacency[info.id];
      if (entry) {
        if (entry.upstream && entry.upstream.length) {
          lines.push("上游节点：" + entry.upstream.map(function (item) { return lookupName(item.nodeId); }).join("、"));
        }
        if (entry.downstream && entry.downstream.length) {
          lines.push("下游节点：" + entry.downstream.map(function (item) { return lookupName(item.nodeId); }).join("、"));
        }
      }
      hintsEl.innerHTML = lines.length ? lines.join("<br>") : "暂无拓扑提示";
    }

    function populateReferenceOptions(info) {
      refSelect.innerHTML = "";
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "无";
      refSelect.appendChild(blank);
      var candidates = [];
      if (state.selected.kind === "group") {
        candidates = getCurrentGroups().filter(function (group) { return group && group.id !== state.selected.id; });
      } else if (state.selected.kind === "node") {
        candidates = getCurrentNodes().filter(function (node) { return node && node.id !== state.selected.id; });
      }
      candidates.forEach(function (candidate) {
        if (!candidate || !candidate.id) {
          return;
        }
        var option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.name || candidate.id;
        refSelect.appendChild(option);
      });
      var outputId = state.snapshot && state.snapshot.settings ? state.snapshot.settings.outputNodeId : "__output__";
      var outputOption = document.createElement("option");
      outputOption.value = outputId;
      outputOption.textContent = (state.snapshot && state.snapshot.settings ? state.snapshot.settings.outputName : "引出量中心") + " (输出)";
      refSelect.appendChild(outputOption);
      var currentRef = info && info.positionRef ? info.positionRef : "";
      var matched = false;
      for (var i = 0; i < refSelect.options.length; i += 1) {
        if (refSelect.options[i].value === currentRef) {
          matched = true;
          break;
        }
      }
      refSelect.value = matched ? currentRef : "";
      refManual.value = matched ? "" : currentRef;
    }

    function setSelected(selection) {
      state.selected = selection;
      renderGrid();
      renderDetail();
    }

    function openGroup(groupId) {
      state.currentGroupId = groupId || null;
      state.selected = null;
      renderAll();
    }

    function navigateUp() {
      if (!state.currentGroupId) {
        return;
      }
      var group = findGroupById(state.currentGroupId);
      state.currentGroupId = group ? group.parentId || null : null;
      state.selected = null;
      renderAll();
    }

    function handleFormSubmit(evt) {
      evt.preventDefault();
      if (!state.selected || typeof services.updateOrdering !== "function") {
        return;
      }
      var refValue = refManual.value.trim() || refSelect.value;
      if (!refValue) {
        refValue = null;
      }
      var payload = {
        id: state.selected.id,
        kind: state.selected.kind,
        groupId: state.selected.groupId || null,
        positionMode: modeSelect.value,
        positionRef: refValue,
        orderNote: noteInput.value.trim()
      };
      services.updateOrdering(payload);
      if (typeof services.toast === "function") {
        services.toast("关系已保存");
      }
      refreshSnapshot();
    }

    function resetDetail() {
      renderDetail();
    }

    function escapeHtml(text) {
      if (text === undefined || text === null) {
        return "";
      }
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        window.location.href = "ai-trend.html";
      });
    }
    if (upBtn) {
      upBtn.addEventListener("click", navigateUp);
    }
    if (newGroupBtn) {
      newGroupBtn.addEventListener("click", function () {
        if (typeof services.toast === "function") {
          services.toast("请在趋势分析工作台中新建节点组");
        }
        window.location.href = "ai-trend.html";
      });
    }
    if (newNodeBtn) {
      newNodeBtn.addEventListener("click", function () {
        if (typeof services.toast === "function") {
          services.toast("请在趋势分析工作台中新建节点");
        }
        window.location.href = "ai-trend.html";
      });
    }
    if (consoleBtn) {
      consoleBtn.addEventListener("click", function () {
        window.location.href = "ai-trend.html";
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        renderSequence();
      });
    }
    if (formEl) {
      formEl.addEventListener("submit", handleFormSubmit);
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", resetDetail);
    }

    mount();
  }

  window.initTrendOrderModule = initTrendOrderModule;
  if (window.__pendingTrendOrderInit) {
    initTrendOrderModule(window.__pendingTrendOrderInit);
    window.__pendingTrendOrderInit = null;
  }
})();
