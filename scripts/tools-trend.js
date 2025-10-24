(function () {
  function generateId() {
    return "trend-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function formatNumber(value, unit) {
    if (value === null || value === undefined || isNaN(value)) {
      return "--";
    }
    var fixed = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
    return fixed + (unit ? " " + unit : "");
  }

  function formatTime(iso) {
    if (!iso) {
      return "";
    }
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return "";
    }
    return date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0");
  }

  function formatDateTime(iso) {
    if (!iso) {
      return "";
    }
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return "";
    }
    var year = date.getFullYear();
    var month = (date.getMonth() + 1).toString().padStart(2, "0");
    var day = date.getDate().toString().padStart(2, "0");
    return year + "-" + month + "-" + day + " " + formatTime(iso);
  }

  function clone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (err) {
      return null;
    }
  }

  function drawSeries(canvas, series, options) {
    if (!canvas || !canvas.getContext) {
      return;
    }
    var ctx = canvas.getContext("2d");
    var width = canvas.clientWidth || 600;
    var height = canvas.clientHeight || 260;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 30);
    ctx.lineTo(width, height - 30);
    ctx.stroke();
    if (!series || series.length === 0) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无数据", 20, height / 2);
      return;
    }
    var min = series[0].value;
    var max = series[0].value;
    var minTime = new Date(series[0].capturedAt).getTime();
    var maxTime = minTime;
    for (var i = 1; i < series.length; i += 1) {
      var value = series[i].value;
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
      var ts = new Date(series[i].capturedAt).getTime();
      if (ts < minTime) {
        minTime = ts;
      }
      if (ts > maxTime) {
        maxTime = ts;
      }
    }
    if (Math.abs(max - min) < 1e-6) {
      var center = (max + min) / 2;
      max = center + 1;
      min = center - 1;
    }
    var timeDiff = Math.max(maxTime - minTime, 1);
    var padding = 24;
    var top = padding;
    var bottom = height - padding * 1.5;
    ctx.strokeStyle = options && options.color ? options.color : "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j < series.length; j += 1) {
      var point = series[j];
      var tsPoint = new Date(point.capturedAt).getTime();
      var x = padding + ((tsPoint - minTime) / timeDiff) * (width - padding * 2);
      var y = bottom - ((point.value - min) / (max - min)) * (bottom - top);
      if (j === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function mount(services) {
    if (!services) {
      return;
    }
    var state = {
      services: services,
      snapshot: services.getSnapshot ? services.getSnapshot({}) : null,
      editingNodeId: null,
      editingSubNodes: [],
      selectedRange: 180,
      unsubscribe: null
    };

    var nodeListEl = document.getElementById("trendNodeList");
    var nodeForm = document.getElementById("trendNodeForm");
    var nodeNameInput = document.getElementById("trendNodeName");
    var nodeNoteInput = document.getElementById("trendNodeNote");
    var nodeUnitInput = document.getElementById("trendNodeUnit");
    var nodeManualSelect = document.getElementById("trendNodeManual");
    var nodeLowerInput = document.getElementById("trendNodeLower");
    var nodeCenterInput = document.getElementById("trendNodeCenter");
    var nodeUpperInput = document.getElementById("trendNodeUpper");
    var nodePositionSelect = document.getElementById("trendNodePosition");
    var nodeRefField = document.getElementById("trendNodeRefField");
    var nodeRefSelect = document.getElementById("trendNodeRef");
    var manualStepField = document.getElementById("trendManualStepField");
    var manualStepInput = document.getElementById("trendManualStep");
    var manualImpactField = document.getElementById("trendManualImpactField");
    var manualImpactSelect = document.getElementById("trendManualImpact");
    var addNodeBtn = document.getElementById("trendAddNode");
    var deleteNodeBtn = document.getElementById("trendDeleteNode");
    var addSubNodeBtn = document.getElementById("trendAddSubNode");
    var subNodeListEl = document.getElementById("trendSubNodeList");
    var startDemoBtn = document.getElementById("trendStartDemo");
    var stopDemoBtn = document.getElementById("trendStopDemo");
    var manualAdjustBtn = document.getElementById("trendManualAdjust");
    var demoStatusEl = document.getElementById("trendDemoStatus");
    var summaryEl = document.getElementById("trendSummary");
    var targetCenterEl = document.getElementById("trendTargetCenter");
    var targetRangeEl = document.getElementById("trendTargetRange");
    var chartCanvas = document.getElementById("trendChart");
    var chartToolbar = document.querySelector(".trend-chart-toolbar");
    var matrixGridEl = document.getElementById("trendMatrixGrid");
    var forecastListEl = document.getElementById("trendForecastList");
    var forecastRefreshBtn = document.getElementById("trendRefreshForecast");
    var adviceListEl = document.getElementById("trendAdviceList");
    var refreshAdviceBtn = document.getElementById("trendRefreshAdvice");
    var openHistoryBtn = document.getElementById("trendOpenHistory");
    var exportCsvBtn = document.getElementById("trendExportCsv");
    var settingsForm = document.getElementById("trendSettingsForm");
    var sampleIntervalInput = document.getElementById("trendSampleInterval");
    var lookbackInput = document.getElementById("trendLookback");
    var predictionInput = document.getElementById("trendPrediction");
    var targetCenterInput = document.getElementById("trendTargetCenterInput");
    var targetLowerInput = document.getElementById("trendTargetLowerInput");
    var targetUpperInput = document.getElementById("trendTargetUpperInput");
    var endpointListEl = document.getElementById("trendEndpointList");
    var addEndpointBtn = document.getElementById("trendAddEndpoint");
    var feedbackForm = document.getElementById("trendFeedbackForm");
    var feedbackSuggestionSelect = document.getElementById("trendFeedbackSuggestion");
    var feedbackRatingInput = document.getElementById("trendFeedbackRating");
    var feedbackNoteInput = document.getElementById("trendFeedbackNote");
    var outputCard = document.getElementById("trendOutputCard");

    function syncSnapshot(snapshot) {
      state.snapshot = snapshot || services.getSnapshot({});
      if (!state.editingNodeId && state.snapshot && state.snapshot.nodes && state.snapshot.nodes.length) {
        state.editingNodeId = state.snapshot.nodes[0].id;
        state.editingSubNodes = clone(state.snapshot.nodes[0].children) || [];
      }
      render();
    }

    function handleNodeSelection(nodeId) {
      state.editingNodeId = nodeId;
      var node = findNode(nodeId);
      state.editingSubNodes = node ? clone(node.children) || [] : [];
      renderForm();
      renderChart();
    }

    function findNode(nodeId) {
      if (!state.snapshot || !state.snapshot.nodes) {
        return null;
      }
      for (var i = 0; i < state.snapshot.nodes.length; i += 1) {
        var node = state.snapshot.nodes[i];
        if (node && node.id === nodeId) {
          return node;
        }
      }
      return null;
    }

    function findSubNode(nodeId, subNodeId) {
      var node = findNode(nodeId);
      if (!node || !Array.isArray(node.children)) {
        return null;
      }
      for (var i = 0; i < node.children.length; i += 1) {
        if (node.children[i] && node.children[i].id === subNodeId) {
          return node.children[i];
        }
      }
      return null;
    }

    function buildManualTargetValue(nodeId, subNodeId) {
      if (!nodeId) {
        return "";
      }
      return subNodeId ? nodeId + "::" + subNodeId : nodeId;
    }

    function resolveManualTargetLabel(target) {
      if (!target || !target.nodeId) {
        return "";
      }
      var node = findNode(target.nodeId);
      if (!node) {
        return "";
      }
      if (target.subNodeId) {
        var child = findSubNode(target.nodeId, target.subNodeId);
        if (child) {
          return node.name + " · " + child.name;
        }
      }
      return node.name;
    }

    function renderManualImpactOptions(currentNode) {
      if (!manualImpactSelect || !manualImpactField) {
        return;
      }
      manualImpactSelect.innerHTML = "";
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      var selected = {};
      if (currentNode && Array.isArray(currentNode.manualTargets)) {
        currentNode.manualTargets.forEach(function (target) {
          if (!target || !target.nodeId) {
            return;
          }
          var key = buildManualTargetValue(target.nodeId, target.subNodeId || null);
          selected[key] = true;
        });
      }
      nodes.forEach(function (candidate) {
        if (!candidate || !candidate.id || (currentNode && candidate.id === currentNode.id)) {
          return;
        }
        var option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.name;
        if (selected[candidate.id]) {
          option.selected = true;
        }
        manualImpactSelect.appendChild(option);
        if (Array.isArray(candidate.children)) {
          candidate.children.forEach(function (child) {
            if (!child || !child.id) {
              return;
            }
            var childValue = buildManualTargetValue(candidate.id, child.id);
            var childOption = document.createElement("option");
            childOption.value = childValue;
            childOption.textContent = candidate.name + " · " + child.name;
            if (selected[childValue]) {
              childOption.selected = true;
            }
            manualImpactSelect.appendChild(childOption);
          });
        }
      });
      manualImpactField.hidden = !(currentNode && currentNode.manual);
      if (!manualImpactSelect.options.length) {
        manualImpactSelect.disabled = true;
      } else {
        manualImpactSelect.disabled = false;
      }
    }

    function renderNodeList() {
      if (!nodeListEl) {
        return;
      }
      nodeListEl.innerHTML = "";
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      nodes.forEach(function (node) {
        var item = document.createElement("div");
        item.className = "trend-node-item" + (node.id === state.editingNodeId ? " active" : "");
        item.setAttribute("role", "treeitem");
        var title = document.createElement("div");
        title.className = "trend-node-name";
        title.textContent = node.name + " (" + node.unit + ")";
        item.appendChild(title);
        if (node.note) {
          var note = document.createElement("div");
          note.className = "trend-node-note";
          note.textContent = node.note;
          item.appendChild(note);
        }
        var meta = document.createElement("div");
        meta.className = "trend-node-meta";
        var bounds = [];
        if (typeof node.lower === "number") {
          bounds.push("下限 " + node.lower);
        }
        if (typeof node.center === "number") {
          bounds.push("中值 " + node.center);
        }
        if (typeof node.upper === "number") {
          bounds.push("上限 " + node.upper);
        }
        if (node.manual) {
          bounds.push("手动节点");
        }
        if (node.manual && Array.isArray(node.manualTargets) && node.manualTargets.length) {
          var impactLabels = [];
          node.manualTargets.forEach(function (target) {
            var label = resolveManualTargetLabel(target);
            if (label) {
              impactLabels.push(label);
            }
          });
          if (impactLabels.length) {
            bounds.push("影响 " + impactLabels.join("、"));
          }
        }
        meta.textContent = bounds.join(" · ");
        item.appendChild(meta);
        item.addEventListener("click", function () {
          handleNodeSelection(node.id);
        });
        nodeListEl.appendChild(item);
      });
      if (!nodes.length) {
        var empty = document.createElement("div");
        empty.className = "trend-node-empty";
        empty.textContent = "暂无节点组，请先创建。";
        nodeListEl.appendChild(empty);
      }
    }

    function renderForm() {
      var node = state.editingNodeId ? findNode(state.editingNodeId) : null;
      if (!node) {
        nodeNameInput.value = "";
        if (nodeNoteInput) {
          nodeNoteInput.value = "";
        }
        nodeUnitInput.value = "℃";
        nodeManualSelect.value = "false";
        nodeLowerInput.value = "";
        if (nodeCenterInput) {
          nodeCenterInput.value = "";
        }
        nodeUpperInput.value = "";
        nodePositionSelect.value = "after";
        manualStepInput.value = "";
        manualStepField.hidden = true;
        nodeRefField.hidden = true;
        if (manualImpactField) {
          manualImpactField.hidden = true;
        }
        if (manualImpactSelect) {
          manualImpactSelect.innerHTML = "";
        }
        renderSubNodes();
        return;
      }
      nodeNameInput.value = node.name || "";
      if (nodeNoteInput) {
        nodeNoteInput.value = node.note || "";
      }
      nodeUnitInput.value = node.unit || "";
      nodeManualSelect.value = node.manual ? "true" : "false";
      nodeLowerInput.value = typeof node.lower === "number" ? node.lower : "";
      if (nodeCenterInput) {
        nodeCenterInput.value = typeof node.center === "number" ? node.center : "";
      }
      nodeUpperInput.value = typeof node.upper === "number" ? node.upper : "";
      nodePositionSelect.value = node.positionMode || "after";
      manualStepInput.value = typeof node.manualStep === "number" ? node.manualStep : "";
      manualStepField.hidden = !(node.manual || nodeManualSelect.value === "true");
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      nodeRefSelect.innerHTML = "";
      nodes.forEach(function (candidate) {
        if (candidate.id === node.id) {
          return;
        }
        var option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.name;
        nodeRefSelect.appendChild(option);
      });
      if (node.positionRef) {
        nodeRefSelect.value = node.positionRef;
      }
      nodeRefField.hidden = nodePositionSelect.value === "after";
      renderManualImpactOptions(node);
      renderSubNodes();
    }

    function renderSubNodes() {
      if (!subNodeListEl) {
        return;
      }
      subNodeListEl.innerHTML = "";
      var nodes = state.editingSubNodes || [];
      if (!nodes.length) {
        var empty = document.createElement("div");
        empty.className = "trend-subnode-empty";
        empty.textContent = "暂无节点";
        subNodeListEl.appendChild(empty);
        return;
      }
      nodes.forEach(function (item, index) {
        var card = document.createElement("div");
        card.className = "trend-subnode-item";
        var header = document.createElement("div");
        header.className = "trend-subnode-title";
        header.textContent = item.name + " (" + (item.unit || "") + ")";
        card.appendChild(header);
        var info = document.createElement("div");
        info.className = "trend-subnode-meta";
        var parts = [];
        if (typeof item.lower === "number") {
          parts.push("下限 " + item.lower);
        }
        if (typeof item.center === "number") {
          parts.push("中值 " + item.center);
        }
        if (typeof item.upper === "number") {
          parts.push("上限 " + item.upper);
        }
        if (item.manual) {
          parts.push("手动节点");
        }
        info.textContent = parts.join(" · ");
        card.appendChild(info);
        var tools = document.createElement("div");
        tools.className = "trend-subnode-tools";
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ghost-button";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", function () {
          editSubNode(index);
        });
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost-button danger";
        removeBtn.textContent = "删除";
        removeBtn.addEventListener("click", function () {
          state.editingSubNodes.splice(index, 1);
          renderSubNodes();
        });
        tools.appendChild(editBtn);
        tools.appendChild(removeBtn);
        card.appendChild(tools);
        subNodeListEl.appendChild(card);
      });
    }

    function editSubNode(index) {
      var node = state.editingSubNodes[index];
      if (!node) {
        return;
      }
      var name = window.prompt("节点名称", node.name || "");
      if (!name) {
        return;
      }
      var unit = window.prompt("节点单位", node.unit || "");
      var lower = window.prompt("下限 (可空)", typeof node.lower === "number" ? node.lower : "");
      var center = window.prompt("中值 (可空)", typeof node.center === "number" ? node.center : "");
      var upper = window.prompt("上限 (可空)", typeof node.upper === "number" ? node.upper : "");
      var manual = window.confirm("是否为手动调整节点？当前值：" + (node.manual ? "是" : "否"));
      var step = window.prompt("单次标准调整量", typeof node.manualStep === "number" ? node.manualStep : "");
      node.name = name;
      node.unit = unit || node.unit;
      node.lower = lower === "" ? null : parseFloat(lower);
      node.center = center === "" ? null : parseFloat(center);
      node.upper = upper === "" ? null : parseFloat(upper);
      node.manual = manual;
      node.manualStep = step === "" ? node.manualStep : parseFloat(step);
      renderSubNodes();
    }

    function addSubNode() {
      var name = window.prompt("节点名称", "辅助传感器");
      if (!name) {
        return;
      }
      var unit = window.prompt("单位", nodeUnitInput.value || "℃");
      var lower = window.prompt("下限 (可空)", nodeLowerInput.value || "");
      var center = window.prompt("中值 (可空)", nodeCenterInput && nodeCenterInput.value ? nodeCenterInput.value : "");
      var upper = window.prompt("上限 (可空)", nodeUpperInput.value || "");
      var manual = window.confirm("是否为手动调整节点？");
      var step = window.prompt("单次标准调整量", manualStepInput.value || "");
      state.editingSubNodes.push({
        id: generateId(),
        name: name,
        unit: unit || nodeUnitInput.value || "",
        lower: lower === "" ? null : parseFloat(lower),
        center: center === "" ? null : parseFloat(center),
        upper: upper === "" ? null : parseFloat(upper),
        manual: manual,
        manualStep: step === "" ? null : parseFloat(step)
      });
      renderSubNodes();
    }

    function serializeNodeForm() {
      var manual = nodeManualSelect.value === "true";
      var payload = {
        id: state.editingNodeId,
        name: nodeNameInput.value.trim(),
        note: nodeNoteInput && nodeNoteInput.value ? nodeNoteInput.value.trim() : "",
        unit: nodeUnitInput.value.trim() || "℃",
        manual: manual,
        manualStep: manualStepInput.value ? parseFloat(manualStepInput.value) : null,
        lower: nodeLowerInput.value ? parseFloat(nodeLowerInput.value) : null,
        center: nodeCenterInput && nodeCenterInput.value ? parseFloat(nodeCenterInput.value) : null,
        upper: nodeUpperInput.value ? parseFloat(nodeUpperInput.value) : null,
        positionMode: nodePositionSelect.value,
        positionRef: nodeRefSelect.value || null,
        children: clone(state.editingSubNodes) || []
      };
      if (manual && manualImpactSelect) {
        var targets = [];
        for (var i = 0; i < manualImpactSelect.options.length; i += 1) {
          var option = manualImpactSelect.options[i];
          if (!option || !option.selected || !option.value) {
            continue;
          }
          var parts = option.value.split("::");
          var targetNodeId = parts[0];
          var targetSubId = parts.length > 1 ? parts[1] : null;
          if (!targetNodeId) {
            continue;
          }
          targets.push({ nodeId: targetNodeId, subNodeId: targetSubId });
        }
        payload.manualTargets = targets;
      } else {
        payload.manualTargets = [];
      }
      if (!payload.manualStep || isNaN(payload.manualStep)) {
        payload.manualStep = manual ? 1 : 0;
      }
      return payload;
    }

    function renderMetrics() {
      if (!summaryEl) {
        return;
      }
      summaryEl.innerHTML = "";
      var metrics = [];
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      metrics.push({ label: "节点数", value: nodes.length });
      var suggestions = (state.snapshot && state.snapshot.suggestions) || [];
      var activeCount = suggestions.filter(function (item) { return item && item.status === "active"; }).length;
      metrics.push({ label: "活跃建议", value: activeCount });
      var feedback = (state.snapshot && state.snapshot.feedback) || [];
      metrics.push({ label: "反馈记录", value: feedback.length });
      var endpoints = (state.snapshot && state.snapshot.settings && state.snapshot.settings.mesEndpoints) || [];
      metrics.push({ label: "MES 数据源", value: endpoints.length });
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
        summaryEl.appendChild(card);
      });
    }

    function renderTargetCard() {
      if (!targetCenterEl || !targetRangeEl) {
        return;
      }
      var target = state.snapshot && state.snapshot.settings ? state.snapshot.settings.outputTarget : null;
      if (!target) {
        targetCenterEl.textContent = "--";
        targetRangeEl.textContent = "上下限 -- / --";
      } else {
        targetCenterEl.textContent = typeof target.center === "number" ? target.center : "--";
        var lower = typeof target.lower === "number" ? target.lower : "--";
        var upper = typeof target.upper === "number" ? target.upper : "--";
        targetRangeEl.textContent = "上下限 " + lower + " / " + upper;
      }
      if (state.snapshot && state.snapshot.demo && state.snapshot.demo.enabled) {
        outputCard.classList.add("demo-active");
      } else {
        outputCard.classList.remove("demo-active");
      }
    }

    function renderDemoStatus() {
      if (!demoStatusEl) {
        return;
      }
      if (!state.snapshot || !state.snapshot.demo || !state.snapshot.demo.enabled) {
        demoStatusEl.textContent = "演示模式未开启。";
        return;
      }
      var interval = state.snapshot.demo.intervalMs || state.snapshot.settings.sampleIntervalMs;
      demoStatusEl.textContent = "演示模式运行中，采样周期 " + interval + " ms";
    }

    function renderChart() {
      var node = state.editingNodeId ? findNode(state.editingNodeId) : null;
      if (!node) {
        drawSeries(chartCanvas, []);
        return;
      }
      var cutoff = Date.now() - state.selectedRange * 60000;
      var streams = (state.snapshot && state.snapshot.streams) || [];
      var series = [];
      for (var i = 0; i < streams.length; i += 1) {
        var item = streams[i];
        if (!item || item.nodeId !== node.id || item.subNodeId) {
          continue;
        }
        var ts = new Date(item.capturedAt).getTime();
        if (ts < cutoff) {
          continue;
        }
        series.push({
          capturedAt: item.capturedAt,
          value: item.value
        });
      }
      series.sort(function (a, b) {
        return new Date(a.capturedAt) - new Date(b.capturedAt);
      });
      drawSeries(chartCanvas, series, { color: "#2563eb" });
    }

    function collectNodeSeries(nodeId, subNodeId) {
      var all = (state.snapshot && state.snapshot.streams) || [];
      var series = [];
      if (!nodeId) {
        return series;
      }
      var rangeMinutes = state.selectedRange || 180;
      var cutoff = Date.now() - rangeMinutes * 60000;
      for (var i = 0; i < all.length; i += 1) {
        var sample = all[i];
        if (!sample || sample.nodeId !== nodeId) {
          continue;
        }
        if (sample.subNodeId && sample.subNodeId !== subNodeId) {
          continue;
        }
        if (!sample.subNodeId && subNodeId) {
          continue;
        }
        var ts = new Date(sample.capturedAt).getTime();
        if (ts < cutoff) {
          continue;
        }
        series.push({ capturedAt: sample.capturedAt, value: sample.value });
      }
      series.sort(function (a, b) {
        return new Date(a.capturedAt) - new Date(b.capturedAt);
      });
      return series;
    }

    function resolveNodeBounds(group, node) {
      var lower = null;
      var upper = null;
      var center = null;
      if (node) {
        if (typeof node.lower === "number") {
          lower = node.lower;
        }
        if (typeof node.upper === "number") {
          upper = node.upper;
        }
        if (typeof node.center === "number") {
          center = node.center;
        }
      }
      if (group) {
        if (lower === null && typeof group.lower === "number") {
          lower = group.lower;
        }
        if (upper === null && typeof group.upper === "number") {
          upper = group.upper;
        }
        if (center === null && typeof group.center === "number") {
          center = group.center;
        }
      }
      if (center === null && lower !== null && upper !== null) {
        center = (lower + upper) / 2;
      }
      return { lower: lower, upper: upper, center: center };
    }

    function describeLevel(value, bounds) {
      if (value === null || value === undefined || isNaN(value)) {
        return { label: "暂无数据", tone: "idle" };
      }
      if (bounds.upper !== null && value > bounds.upper) {
        return { label: "超上限", tone: "alert" };
      }
      if (bounds.lower !== null && value < bounds.lower) {
        return { label: "超下限", tone: "alert" };
      }
      var span = bounds.upper !== null && bounds.lower !== null ? bounds.upper - bounds.lower : null;
      if (span !== null && span > 0) {
        var highThreshold = bounds.upper - span * 0.1;
        var lowThreshold = bounds.lower + span * 0.1;
        if (value >= highThreshold) {
          return { label: "偏高", tone: "warn" };
        }
        if (value <= lowThreshold) {
          return { label: "偏低", tone: "warn" };
        }
      }
      return { label: "平稳", tone: "ok" };
    }

    function renderNodeMatrix() {
      if (!matrixGridEl) {
        return;
      }
      matrixGridEl.innerHTML = "";
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      if (!nodes.length) {
        var empty = document.createElement("div");
        empty.className = "trend-matrix-empty";
        empty.textContent = "暂无节点数据";
        matrixGridEl.appendChild(empty);
        return;
      }
      nodes.forEach(function (group) {
        var groupNodes = Array.isArray(group.children) && group.children.length ? group.children : [null];
        groupNodes.forEach(function (innerNode) {
          var series = collectNodeSeries(group.id, innerNode ? innerNode.id : null);
          var latest = series.length ? series[series.length - 1] : null;
          var bounds = resolveNodeBounds(group, innerNode);
          var level = describeLevel(latest ? latest.value : null, bounds);
          var slope = calcSlope(series.slice(-Math.min(series.length, 10)));
          var trendLabel = slope > 0.05 ? "上升" : slope < -0.05 ? "下降" : "平稳";
          var card = document.createElement("div");
          card.className = "trend-matrix-card";
          card.setAttribute("role", "listitem");
          var head = document.createElement("div");
          head.className = "trend-matrix-head";
          var title = document.createElement("div");
          title.className = "trend-matrix-title";
          title.textContent = innerNode ? group.name + " · " + innerNode.name : group.name;
          head.appendChild(title);
          var badge = document.createElement("span");
          badge.className = "trend-matrix-status trend-matrix-status-" + level.tone;
          badge.textContent = level.label;
          head.appendChild(badge);
          card.appendChild(head);
          if (group.note && !innerNode) {
            var note = document.createElement("div");
            note.className = "trend-matrix-note";
            note.textContent = group.note;
            card.appendChild(note);
          }
          var valueRow = document.createElement("div");
          valueRow.className = "trend-matrix-value";
          valueRow.textContent = latest ? formatNumber(latest.value, innerNode ? innerNode.unit || group.unit : group.unit) : "--";
          card.appendChild(valueRow);
          var meta = document.createElement("div");
          meta.className = "trend-matrix-meta";
          meta.textContent = (latest ? formatTime(latest.capturedAt) + " 更新" : "无数据") + " · 趋势 " + trendLabel;
          card.appendChild(meta);
          var spark = document.createElement("canvas");
          spark.className = "trend-matrix-spark";
          card.appendChild(spark);
          matrixGridEl.appendChild(card);
          window.requestAnimationFrame(function () {
            drawSeries(spark, series.slice(-20), { color: "#0ea5e9" });
          });
        });
      });
    }

    function renderForecasts() {
      if (!forecastListEl) {
        return;
      }
      forecastListEl.innerHTML = "";
      var forecasts = (state.snapshot && state.snapshot.forecasts) || [];
      if (!forecasts.length) {
        var empty = document.createElement("div");
        empty.className = "trend-forecast-empty";
        empty.textContent = "暂无预测数据";
        forecastListEl.appendChild(empty);
        return;
      }
      var nodeCache = {};
      (state.snapshot.nodes || []).forEach(function (node) {
        if (node && node.id) {
          nodeCache[node.id] = node;
        }
      });
      forecasts.forEach(function (forecast) {
        var node = nodeCache[forecast.nodeId];
        var child = null;
        if (node && forecast.subNodeId) {
          for (var idx = 0; idx < (node.children || []).length; idx += 1) {
            if (node.children[idx] && node.children[idx].id === forecast.subNodeId) {
              child = node.children[idx];
              break;
            }
          }
        }
        var card = document.createElement("div");
        card.className = "trend-forecast-card";
        var head = document.createElement("div");
        head.className = "trend-forecast-head";
        var title = document.createElement("div");
        title.className = "trend-forecast-title";
        if (child && node) {
          title.textContent = node.name + " · " + child.name;
        } else if (node) {
          title.textContent = node.name;
        } else {
          title.textContent = forecast.label || "节点";
        }
        head.appendChild(title);
        var status = document.createElement("span");
        status.className = "trend-forecast-status trend-forecast-status-" + (forecast.status || "平稳");
        status.textContent = forecast.status || "平稳";
        head.appendChild(status);
        card.appendChild(head);
        var valueRow = document.createElement("div");
        valueRow.className = "trend-forecast-value";
        valueRow.textContent = "预测值 " + formatNumber(forecast.value, forecast.unit || (child ? child.unit : node ? node.unit : ""));
        if (typeof forecast.latestValue === "number") {
          var delta = forecast.value - forecast.latestValue;
          var deltaSpan = document.createElement("span");
          deltaSpan.className = "trend-forecast-delta" + (delta >= 0 ? " rise" : " fall");
          deltaSpan.textContent = (delta >= 0 ? "+" : "") + formatNumber(delta, forecast.unit || "");
          valueRow.appendChild(deltaSpan);
        }
        card.appendChild(valueRow);
        var meta = document.createElement("div");
        meta.className = "trend-forecast-meta";
        meta.textContent = "前瞻 " + (forecast.horizonMinutes || 0) + " 分钟 · 置信度 " + Math.round((forecast.confidence || 0) * 100) + "% · 趋势 " + (forecast.trendLabel || "平稳");
        card.appendChild(meta);
        if (forecast.context && forecast.context.summary && forecast.context.summary.length) {
          var ctxList = document.createElement("ul");
          ctxList.className = "trend-forecast-context";
          forecast.context.summary.forEach(function (line) {
            if (!line) {
              return;
            }
            var li = document.createElement("li");
            li.textContent = line;
            ctxList.appendChild(li);
          });
          if (ctxList.children.length) {
            card.appendChild(ctxList);
          }
        }
        if (forecast.method) {
          var method = document.createElement("div");
          method.className = "trend-forecast-method";
          method.textContent = "算法 " + (forecast.method === "holt" ? "Holt 指数平滑" : forecast.method);
          card.appendChild(method);
        }
        var footer = document.createElement("div");
        footer.className = "trend-forecast-footer";
        var focusBtn = document.createElement("button");
        focusBtn.type = "button";
        focusBtn.className = "ghost-button";
        focusBtn.textContent = "查看节点";
        focusBtn.addEventListener("click", function () {
          handleNodeSelection(forecast.nodeId);
        });
        footer.appendChild(focusBtn);
        card.appendChild(footer);
        forecastListEl.appendChild(card);
      });
    }

    function renderAdvice() {
      if (!adviceListEl) {
        return;
      }
      adviceListEl.innerHTML = "";
      var suggestions = (state.snapshot && state.snapshot.suggestions) || [];
      var active = suggestions.filter(function (item) { return item && item.status === "active"; });
      if (!active.length) {
        var empty = document.createElement("div");
        empty.className = "trend-advice-empty";
        empty.textContent = "暂无活跃建议";
        adviceListEl.appendChild(empty);
        return;
      }
      active.sort(function (a, b) {
        return (b.severity || 0) - (a.severity || 0);
      });
      active.forEach(function (item) {
        var card = document.createElement("div");
        card.className = "trend-advice-card";
        var title = document.createElement("strong");
        title.textContent = item.label || item.summary;
        card.appendChild(title);
        var meta = document.createElement("div");
        meta.className = "trend-advice-meta";
        meta.textContent = "评分 " + (item.severity || 0) + " · 更新 " + formatDateTime(item.updatedAt || item.createdAt);
        card.appendChild(meta);
        if (item.forecast && typeof item.forecast.value === "number") {
          var forecastInfo = document.createElement("div");
          forecastInfo.className = "trend-advice-forecast";
          forecastInfo.textContent = "预测 " + (item.forecast.horizonMinutes || 0) + " 分钟后 " + formatNumber(item.forecast.value, item.unit || "") + " · 置信度 " + Math.round(((item.forecast.confidence || 0) * 100)) + "%";
          card.appendChild(forecastInfo);
        }
        if (item.detail && item.detail.length) {
          var list = document.createElement("ul");
          item.detail.forEach(function (line) {
            var li = document.createElement("li");
            li.textContent = line;
            list.appendChild(li);
          });
          card.appendChild(list);
        }
        var actions = document.createElement("div");
        actions.className = "trend-advice-actions";
        var acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "primary-button";
        acceptBtn.textContent = "采纳";
        acceptBtn.addEventListener("click", function () {
          services.acceptSuggestion(item.id, "工作台采纳");
        });
        var rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "ghost-button";
        rejectBtn.textContent = "暂不采纳";
        rejectBtn.addEventListener("click", function () {
          services.rejectSuggestion(item.id, "工作台拒绝");
        });
        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
        card.appendChild(actions);
        adviceListEl.appendChild(card);
      });
    }

    function renderEndpoints() {
      if (!endpointListEl) {
        return;
      }
      endpointListEl.innerHTML = "";
      var endpoints = (state.snapshot && state.snapshot.settings && state.snapshot.settings.mesEndpoints) || [];
      if (!endpoints.length) {
        var empty = document.createElement("div");
        empty.className = "trend-endpoint-empty";
        empty.textContent = "尚未注册 MES 数据源。";
        endpointListEl.appendChild(empty);
        return;
      }
      endpoints.forEach(function (endpoint) {
        var card = document.createElement("div");
        card.className = "trend-endpoint-item";
        var header = document.createElement("header");
        var title = document.createElement("div");
        title.textContent = endpoint.name + " · " + (endpoint.type || "rest");
        header.appendChild(title);
        var status = document.createElement("span");
        status.className = "trend-endpoint-status";
        status.textContent = endpoint.enabled ? "启用" : "禁用";
        header.appendChild(status);
        card.appendChild(header);
        var meta = document.createElement("div");
        meta.className = "trend-endpoint-meta";
        var detail = [];
        if (endpoint.url) {
          detail.push(endpoint.url);
        }
        if (endpoint.database) {
          detail.push("库：" + endpoint.database);
        }
        if (endpoint.table) {
          detail.push("表：" + endpoint.table);
        }
        if (endpoint.notes) {
          detail.push(endpoint.notes);
        }
        meta.textContent = detail.join(" · ");
        card.appendChild(meta);
        var tools = document.createElement("div");
        tools.className = "trend-endpoint-actions";
        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "ghost-button";
        toggleBtn.textContent = endpoint.enabled ? "停用" : "启用";
        toggleBtn.addEventListener("click", function () {
          services.updateEndpoint(endpoint.id, { enabled: !endpoint.enabled });
        });
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ghost-button";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", function () {
          editEndpoint(endpoint);
        });
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost-button danger";
        removeBtn.textContent = "删除";
        removeBtn.addEventListener("click", function () {
          if (window.confirm("确定删除该数据源？")) {
            services.removeEndpoint(endpoint.id);
          }
        });
        tools.appendChild(toggleBtn);
        tools.appendChild(editBtn);
        tools.appendChild(removeBtn);
        card.appendChild(tools);
        endpointListEl.appendChild(card);
      });
    }

    function renderFeedbackOptions() {
      if (!feedbackSuggestionSelect) {
        return;
      }
      feedbackSuggestionSelect.innerHTML = "";
      var suggestions = (state.snapshot && state.snapshot.suggestions) || [];
      suggestions.forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.id;
        var label = item.label || item.summary || "建议";
        option.textContent = label + " · " + (item.statusLabel || item.status || "状态");
        feedbackSuggestionSelect.appendChild(option);
      });
    }

    function editEndpoint(endpoint) {
      var name = window.prompt("数据源名称", endpoint.name || "MES 接口");
      if (!name) {
        return;
      }
      var type = window.prompt("类型 (rest/websocket/database)", endpoint.type || "rest");
      var url = window.prompt("接口地址 (可空)", endpoint.url || "");
      var database = window.prompt("数据库 (可空)", endpoint.database || "");
      var table = window.prompt("表/视图 (可空)", endpoint.table || "");
      var notes = window.prompt("备注", endpoint.notes || "");
      services.updateEndpoint(endpoint.id, {
        name: name,
        type: type,
        url: url,
        database: database,
        table: table,
        notes: notes
      });
    }

    function addEndpoint() {
      var name = window.prompt("数据源名称", "MES REST API");
      if (!name) {
        return;
      }
      var type = window.prompt("类型 (rest/websocket/database)", "rest");
      var url = window.prompt("接口地址", "https://mes.local/api/trend");
      var notes = window.prompt("备注", "待接入实际数据");
      services.registerEndpoint({
        name: name,
        type: type,
        url: url,
        notes: notes
      });
    }

    function exportCsv() {
      if (!state.snapshot || !state.snapshot.streams || !state.snapshot.streams.length) {
        services.toast && services.toast("暂无可导出的数据");
        return;
      }
      var rows = ["nodeId,subNodeId,value,capturedAt,source"]; 
      state.snapshot.streams.forEach(function (item) {
        if (!item) {
          return;
        }
        rows.push([
          item.nodeId,
          item.subNodeId || "",
          item.value,
          item.capturedAt,
          item.source || ""
        ].join(","));
      });
      var blob = new Blob([rows.join("\n")], { type: "text/csv" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "trend-data.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function renderSettingsForm() {
      if (!state.snapshot || !state.snapshot.settings) {
        return;
      }
      sampleIntervalInput.value = state.snapshot.settings.sampleIntervalMs || 60000;
      lookbackInput.value = state.snapshot.settings.lookbackMinutes || 120;
      predictionInput.value = state.snapshot.settings.predictionMinutes || 30;
      var target = state.snapshot.settings.outputTarget || {};
      targetCenterInput.value = typeof target.center === "number" ? target.center : "";
      targetLowerInput.value = typeof target.lower === "number" ? target.lower : "";
      targetUpperInput.value = typeof target.upper === "number" ? target.upper : "";
    }

    function render() {
      renderNodeList();
      renderForm();
      renderMetrics();
      renderTargetCard();
      renderDemoStatus();
      renderChart();
      renderNodeMatrix();
      renderForecasts();
      renderAdvice();
      renderEndpoints();
      renderFeedbackOptions();
      renderSettingsForm();
    }

    if (addNodeBtn) {
      addNodeBtn.addEventListener("click", function () {
        state.editingNodeId = null;
        state.editingSubNodes = [];
        renderForm();
      });
    }

    if (nodeManualSelect) {
      nodeManualSelect.addEventListener("change", function () {
        var isManual = nodeManualSelect.value === "true";
        manualStepField.hidden = !isManual;
        if (manualImpactField) {
          manualImpactField.hidden = !isManual;
        }
        if (isManual) {
          renderManualImpactOptions(findNode(state.editingNodeId));
        } else if (manualImpactSelect) {
          for (var i = 0; i < manualImpactSelect.options.length; i += 1) {
            manualImpactSelect.options[i].selected = false;
          }
        }
      });
    }

    if (nodePositionSelect) {
      nodePositionSelect.addEventListener("change", function () {
        nodeRefField.hidden = nodePositionSelect.value === "after";
      });
    }

    if (nodeForm) {
      nodeForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var payload = serializeNodeForm();
        if (!payload.name) {
          services.toast && services.toast("请输入节点名称");
          return;
        }
        var saved = services.upsertNode(payload);
        state.editingNodeId = saved && saved.id ? saved.id : payload.id;
        services.toast && services.toast("节点组已保存");
      });
    }

    if (deleteNodeBtn) {
      deleteNodeBtn.addEventListener("click", function () {
        if (!state.editingNodeId) {
          return;
        }
        if (window.confirm("确认删除当前节点组？")) {
          services.removeNode(state.editingNodeId);
          state.editingNodeId = null;
          state.editingSubNodes = [];
          render();
        }
      });
    }

    if (addSubNodeBtn) {
      addSubNodeBtn.addEventListener("click", addSubNode);
    }

    if (startDemoBtn) {
      startDemoBtn.addEventListener("click", function () {
        services.startDemo({});
      });
    }

    if (stopDemoBtn) {
      stopDemoBtn.addEventListener("click", function () {
        services.stopDemo();
      });
    }

    if (manualAdjustBtn) {
      manualAdjustBtn.addEventListener("click", function () {
        if (!state.editingNodeId) {
          services.toast && services.toast("请选择节点组");
          return;
        }
        var amountStr = window.prompt("请输入本次调整量", "0.5");
        if (amountStr === null) {
          return;
        }
        var amount = parseFloat(amountStr);
        if (isNaN(amount)) {
          services.toast && services.toast("请输入有效数字");
          return;
        }
        var note = window.prompt("请输入调整备注", "人工调节");
        services.recordManual({
          nodeId: state.editingNodeId,
          amount: amount,
          note: note || ""
        });
      });
    }

    if (chartToolbar) {
      chartToolbar.addEventListener("click", function (evt) {
        var target = evt.target;
        if (!target || !target.getAttribute("data-range")) {
          return;
        }
        state.selectedRange = parseInt(target.getAttribute("data-range"), 10) || 180;
        renderChart();
        renderNodeMatrix();
      });
    }

    if (forecastRefreshBtn) {
      forecastRefreshBtn.addEventListener("click", function () {
        if (services.refreshAnalytics) {
          services.refreshAnalytics();
        }
        services.toast && services.toast("预测已刷新");
      });
    }

    if (refreshAdviceBtn) {
      refreshAdviceBtn.addEventListener("click", function () {
        renderAdvice();
      });
    }

    if (openHistoryBtn) {
      openHistoryBtn.addEventListener("click", function () {
        window.location.href = "ai-trend-history.html";
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", exportCsv);
    }

    if (settingsForm) {
      settingsForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        services.updateSettings({
          sampleIntervalMs: parseInt(sampleIntervalInput.value, 10) || 60000,
          lookbackMinutes: parseInt(lookbackInput.value, 10) || 120,
          predictionMinutes: parseInt(predictionInput.value, 10) || 30,
          outputTarget: {
            center: targetCenterInput.value ? parseFloat(targetCenterInput.value) : 0,
            lower: targetLowerInput.value ? parseFloat(targetLowerInput.value) : null,
            upper: targetUpperInput.value ? parseFloat(targetUpperInput.value) : null
          }
        });
        services.toast && services.toast("设置已更新");
      });
    }

    if (addEndpointBtn) {
      addEndpointBtn.addEventListener("click", addEndpoint);
    }

    if (feedbackForm) {
      feedbackForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var suggestionId = feedbackSuggestionSelect.value;
        if (!suggestionId) {
          services.toast && services.toast("请选择建议");
          return;
        }
        var rating = parseInt(feedbackRatingInput.value, 10) || 0;
        var note = feedbackNoteInput.value || "";
        services.feedback({
          suggestionId: suggestionId,
          rating: rating,
          note: note
        });
        feedbackRatingInput.value = "";
        feedbackNoteInput.value = "";
        services.toast && services.toast("反馈已记录");
      });
    }

    if (services.subscribe) {
      state.unsubscribe = services.subscribe(syncSnapshot);
    }
    syncSnapshot(state.snapshot);
  }

  window.AIToolsTrend = { mount: mount };
})();
