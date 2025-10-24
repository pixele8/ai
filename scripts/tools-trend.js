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

  function drawMultiSeries(canvas, datasets, options) {
    if (!canvas || !canvas.getContext) {
      return;
    }
    var sets = Array.isArray(datasets) ? datasets.filter(function (set) {
      return set && Array.isArray(set.data) && set.data.length;
    }) : [];
    var ctx = canvas.getContext("2d");
    var width = canvas.clientWidth || 600;
    var height = canvas.clientHeight || 260;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    if (!sets.length) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无数据", 20, height / 2);
      return;
    }
    var min = sets[0].data[0].value;
    var max = sets[0].data[0].value;
    var minTime = new Date(sets[0].data[0].capturedAt).getTime();
    var maxTime = minTime;
    sets.forEach(function (set) {
      set.data.forEach(function (point) {
        if (typeof point.value !== "number" || !point.capturedAt) {
          return;
        }
        if (point.value < min) { min = point.value; }
        if (point.value > max) { max = point.value; }
        var ts = new Date(point.capturedAt).getTime();
        if (isFinite(ts)) {
          if (ts < minTime) { minTime = ts; }
          if (ts > maxTime) { maxTime = ts; }
        }
      });
    });
    if (!isFinite(minTime) || !isFinite(maxTime)) {
      minTime = Date.now() - 600000;
      maxTime = Date.now();
    }
    if (Math.abs(max - min) < 1e-6) {
      var center = (max + min) / 2;
      max = center + 1;
      min = center - 1;
    }
    var padding = 24;
    var bottom = height - padding * 1.4;
    var top = padding;
    var span = Math.max(maxTime - minTime, 1);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, bottom);
    ctx.lineTo(width - padding, bottom);
    ctx.stroke();
    var palette = (options && options.colors) || ["#94a3b8", "#2563eb", "#f97316", "#10b981"];
    sets.forEach(function (set, index) {
      var color = set.color || palette[index % palette.length];
      ctx.lineWidth = set.lineWidth || 2;
      if (set.dashed) {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = color;
      ctx.beginPath();
      set.data.forEach(function (point, pointIndex) {
        var ts = new Date(point.capturedAt).getTime();
        if (!isFinite(ts)) {
          return;
        }
        var x = padding + ((ts - minTime) / span) * (width - padding * 2);
        var y = bottom - ((point.value - min) / (max - min)) * (bottom - top);
        if (pointIndex === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function mount(services) {
    if (!services) {
      return;
    }

    function createScenarioDraft(snapshot, base) {
      var defaultHorizon = 30;
      if (snapshot && snapshot.settings && typeof snapshot.settings.predictionMinutes === "number" && snapshot.settings.predictionMinutes > 0) {
        defaultHorizon = snapshot.settings.predictionMinutes;
      }
      var draft = {
        id: base && base.id ? base.id : null,
        name: base && base.name ? base.name : "",
        note: base && base.note ? base.note : "",
        horizon: base && typeof base.horizonMinutes === "number" ? base.horizonMinutes : defaultHorizon,
        adjustments: []
      };
      if (base && Array.isArray(base.adjustments)) {
        base.adjustments.forEach(function (adj) {
          if (!adj || !adj.nodeId) {
            return;
          }
          var key = adj.subNodeId ? adj.nodeId + "::" + adj.subNodeId : adj.nodeId;
          draft.adjustments.push({ key: key, delta: typeof adj.delta === "number" ? adj.delta : (typeof adj.amount === "number" ? adj.amount : "") });
        });
      }
      if (!draft.adjustments.length) {
        draft.adjustments.push({ key: "", delta: "" });
      }
      return draft;
    }

    var initialSnapshot = services.getSnapshot ? services.getSnapshot({}) : null;
    var state = {
      services: services,
      snapshot: initialSnapshot,
      nodeLibrary: initialSnapshot && initialSnapshot.nodeLibrary ? initialSnapshot.nodeLibrary : [],
      groupPaths: initialSnapshot && initialSnapshot.groupPaths ? initialSnapshot.groupPaths : {},
      editingNodeId: null,
      editingSubNodes: [],
      selectedRange: 180,
      scenarioDraft: null,
      scenarioResult: null,
      scenarios: services.listScenarios ? services.listScenarios() : [],
      activeScenarioId: null,
      scenarioChartKey: null,
      pendingParentId: null,
      pendingNodeKey: null,
      unsubscribe: null
    };
    state.scenarioDraft = createScenarioDraft(state.snapshot, null);

    function ensureEditingChildren(list) {
      if (!Array.isArray(list)) {
        return [];
      }
      for (var i = 0; i < list.length; i += 1) {
        var item = list[i];
        if (!item || typeof item !== "object") {
          list[i] = { id: generateId(), name: "节点", originalId: null };
          item = list[i];
        }
        if (item.id) {
          item.id = String(item.id).trim();
        }
        if (!item.id) {
          item.id = generateId();
        }
        if (item.originalId) {
          item.originalId = String(item.originalId).trim();
        }
        if (!item.originalId) {
          item.originalId = item.id;
        }
      }
      return list;
    }

    function isGroupIdTaken(candidate, originalId) {
      var value = typeof candidate === "string" ? candidate.trim() : "";
      if (!value) {
        return false;
      }
      if (originalId && value === originalId) {
        return false;
      }
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      for (var i = 0; i < nodes.length; i += 1) {
        var group = nodes[i];
        if (!group || !group.id) {
          continue;
        }
        if (group.id === value) {
          return true;
        }
      }
      return false;
    }

    function generateUniqueGroupId() {
      var attempt = generateId();
      var guard = 0;
      while (isGroupIdTaken(attempt) && guard < 20) {
        attempt = generateId();
        guard += 1;
      }
      return attempt;
    }

    function isNodeIdTaken(candidate, originalId) {
      var value = typeof candidate === "string" ? candidate.trim() : "";
      if (!value) {
        return false;
      }
      if (originalId && value === originalId) {
        return false;
      }
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      for (var i = 0; i < nodes.length; i += 1) {
        var group = nodes[i];
        if (!group || !Array.isArray(group.children)) {
          continue;
        }
        for (var j = 0; j < group.children.length; j += 1) {
          var child = group.children[j];
          if (!child || !child.id) {
            continue;
          }
          if (child.id === value && (!originalId || child.id !== originalId)) {
            return true;
          }
        }
      }
      var editing = state.editingSubNodes || [];
      for (var k = 0; k < editing.length; k += 1) {
        var node = editing[k];
        if (!node || !node.id) {
          continue;
        }
        if (node.id === value && (!originalId || node.originalId !== originalId)) {
          return true;
        }
      }
      return false;
    }

    function promptNodeIdentifier(defaultValue, originalId) {
      var attempt = defaultValue || generateId();
      while (true) {
        var input = window.prompt("节点唯一 ID", attempt);
        if (input === null) {
          return null;
        }
        input = input.trim();
        if (!input) {
          input = generateId();
        }
        if (!isNodeIdTaken(input, originalId)) {
          return input;
        }
        if (services.toast) {
          services.toast("该节点 ID 已存在，请重新输入");
        } else {
          window.alert("该节点 ID 已存在，请重新输入");
        }
        attempt = input;
      }
    }

    var nodeListEl = document.getElementById("trendNodeList");
    var nodeForm = document.getElementById("trendNodeForm");
    var nodeKeyInput = document.getElementById("trendNodeKey");
    var nodeNameInput = document.getElementById("trendNodeName");
    var nodeNoteInput = document.getElementById("trendNodeNote");
    var nodeParentSelect = document.getElementById("trendNodeParent");
    var nodeUnitInput = document.getElementById("trendNodeUnit");
    var nodeManualSelect = document.getElementById("trendNodeManual");
    var nodeSimulationSelect = document.getElementById("trendNodeSimulation");
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
    var scenarioForm = document.getElementById("trendScenarioForm");
    var scenarioNameInput = document.getElementById("trendScenarioName");
    var scenarioNoteInput = document.getElementById("trendScenarioNote");
    var scenarioHorizonInput = document.getElementById("trendScenarioHorizon");
    var scenarioPersistInput = document.getElementById("trendScenarioPersist");
    var scenarioAdjustmentsEl = document.getElementById("trendScenarioAdjustments");
    var scenarioAddAdjustmentBtn = document.getElementById("trendScenarioAddAdjustment");
    var scenarioRunBtn = document.getElementById("trendScenarioRun");
    var scenarioResultEl = document.getElementById("trendScenarioResult");
    var scenarioSavedListEl = document.getElementById("trendScenarioSavedList");
    var scenarioChartCanvas = null;
    var scenarioChartLegend = null;
    var scenarioContributionEl = null;

    function ensureScenarioDraftRows() {
      if (!state.scenarioDraft) {
        state.scenarioDraft = createScenarioDraft(state.snapshot, null);
      }
      if (!Array.isArray(state.scenarioDraft.adjustments)) {
        state.scenarioDraft.adjustments = [];
      }
      if (!state.scenarioDraft.adjustments.length) {
        state.scenarioDraft.adjustments.push({ key: "", delta: "" });
      }
    }

    function buildScenarioOptions() {
      var options = [];
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      nodes.forEach(function (node) {
        if (!node || !node.id) {
          return;
        }
        options.push({ value: node.id, label: node.name, unit: node.unit || "" });
        if (Array.isArray(node.children)) {
          node.children.forEach(function (child) {
            if (!child || !child.id) {
              return;
            }
            options.push({ value: node.id + "::" + child.id, label: node.name + " · " + child.name, unit: child.unit || node.unit || "" });
          });
        }
      });
      return options;
    }

    function findScenarioOption(value, options) {
      options = options || buildScenarioOptions();
      for (var i = 0; i < options.length; i += 1) {
        if (options[i] && options[i].value === value) {
          return options[i];
        }
      }
      return null;
    }

    function parseScenarioKey(value) {
      if (!value) {
        return null;
      }
      var parts = value.split("::");
      return {
        nodeId: parts[0],
        subNodeId: parts.length > 1 ? parts[1] : null
      };
    }

    function syncSnapshot(snapshot) {
      state.snapshot = snapshot || services.getSnapshot({});
      state.nodeLibrary = (state.snapshot && state.snapshot.nodeLibrary) || [];
      state.groupPaths = (state.snapshot && state.snapshot.groupPaths) || {};
      state.scenarios = (state.snapshot && state.snapshot.scenarios) || [];
      var availableNodes = (state.snapshot && state.snapshot.nodes) || [];
      if (state.editingNodeId) {
        var current = findNode(state.editingNodeId);
        if (!current && availableNodes.length) {
          state.editingNodeId = availableNodes[0].id;
          state.editingSubNodes = ensureEditingChildren(clone(availableNodes[0].children) || []);
        } else if (current) {
          state.editingSubNodes = ensureEditingChildren(clone(current.children) || []);
        }
      } else if (availableNodes.length) {
        state.editingNodeId = availableNodes[0].id;
        state.editingSubNodes = ensureEditingChildren(clone(availableNodes[0].children) || []);
      } else {
        state.editingSubNodes = [];
      }
      state.pendingParentId = null;
      if (!state.scenarioDraft) {
        state.scenarioDraft = createScenarioDraft(state.snapshot, null);
      }
      if (!state.scenarioDraft.id && state.snapshot && state.snapshot.settings && typeof state.snapshot.settings.predictionMinutes === "number") {
        state.scenarioDraft.horizon = state.snapshot.settings.predictionMinutes;
      }
      ensureScenarioDraftRows();
      render();
    }

    function handleNodeSelection(nodeId) {
      state.editingNodeId = nodeId;
      var node = findNode(nodeId);
      state.editingSubNodes = node ? ensureEditingChildren(clone(node.children) || []) : [];
      state.pendingParentId = null;
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

    function formatGroupPathLabel(groupId) {
      if (!groupId) {
        return "";
      }
      var path = (state.groupPaths && state.groupPaths[groupId]) || [];
      if (!path.length) {
        var fallback = findNode(groupId);
        return fallback && fallback.name ? fallback.name : "节点组";
      }
      var labels = [];
      for (var i = 0; i < path.length; i += 1) {
        var group = findNode(path[i]);
        if (group && group.name) {
          labels.push(group.name);
        } else {
          labels.push("节点组");
        }
      }
      return labels.join(" / ");
    }

    function collectDescendantIdsLocal(groupId) {
      var result = [];
      if (!groupId || !state.snapshot || !state.snapshot.nodes) {
        return result;
      }
      var nodes = state.snapshot.nodes;
      var queue = [groupId];
      while (queue.length) {
        var current = queue.shift();
        for (var i = 0; i < nodes.length; i += 1) {
          var candidate = nodes[i];
          if (!candidate || !candidate.parentId) {
            continue;
          }
          if (candidate.parentId === current && result.indexOf(candidate.id) === -1) {
            result.push(candidate.id);
            queue.push(candidate.id);
          }
        }
      }
      return result;
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
          var baseLabel = formatGroupPathLabel(node.id) || node.name || "节点组";
          return baseLabel + " · " + child.name;
        }
      }
      return formatGroupPathLabel(node.id) || node.name;
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
      var blocked = {};
      if (currentNode && currentNode.id) {
        blocked[currentNode.id] = true;
        var descendantIds = collectDescendantIdsLocal(currentNode.id);
        for (var b = 0; b < descendantIds.length; b += 1) {
          blocked[descendantIds[b]] = true;
        }
      }
      nodes.forEach(function (candidate) {
        if (!candidate || !candidate.id || blocked[candidate.id]) {
          return;
        }
        var option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = formatGroupPathLabel(candidate.id) || candidate.name;
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
            var baseLabel = formatGroupPathLabel(candidate.id) || candidate.name;
            childOption.textContent = baseLabel + " · " + child.name;
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
      if (!nodes.length) {
        var empty = document.createElement("div");
        empty.className = "trend-node-empty";
        empty.textContent = "暂无节点组，请先创建。";
        nodeListEl.appendChild(empty);
        return;
      }
      var tree = buildGroupTree(nodes);
      renderGroupEntries(tree);

      function buildGroupTree(list) {
        var map = {};
        var roots = [];
        for (var i = 0; i < list.length; i += 1) {
          var group = list[i];
          if (!group || !group.id) {
            continue;
          }
          map[group.id] = {
            data: group,
            id: group.id,
            parentId: group.parentId || null,
            groups: [],
            order: i,
            depth: 0
          };
        }
        for (var key in map) {
          if (!Object.prototype.hasOwnProperty.call(map, key)) {
            continue;
          }
          var entry = map[key];
          if (entry.parentId && map[entry.parentId]) {
            map[entry.parentId].groups.push(entry);
          } else {
            roots.push(entry);
          }
        }
        function assignDepth(entry, depth) {
          entry.depth = depth;
          entry.groups.sort(function (a, b) {
            return a.order - b.order;
          });
          for (var j = 0; j < entry.groups.length; j += 1) {
            assignDepth(entry.groups[j], depth + 1);
          }
        }
        roots.sort(function (a, b) {
          return a.order - b.order;
        });
        for (var r = 0; r < roots.length; r += 1) {
          assignDepth(roots[r], 0);
        }
        return roots;
      }

      function renderGroupEntries(entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (!entry || !entry.data) {
            continue;
          }
          var node = entry.data;
          var item = document.createElement("div");
          item.className = "trend-node-item" + (node.id === state.editingNodeId ? " active" : "");
          item.setAttribute("role", "treeitem");
          item.style.paddingLeft = (entry.depth * 20 + 12) + "px";
          var title = document.createElement("div");
          title.className = "trend-node-name";
          title.textContent = node.name + " (" + (node.unit || "") + ")";
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
          var childCount = Array.isArray(node.children) ? node.children.length : 0;
          bounds.push("节点 " + childCount);
          if (node.manual) {
            bounds.push("手动节点");
          }
          if (node.simulate === false) {
            bounds.push("演示停用");
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
          item.addEventListener("click", function (groupId) {
            return function () {
              handleNodeSelection(groupId);
            };
          }(node.id));
          nodeListEl.appendChild(item);
          if (entry.groups && entry.groups.length) {
            renderGroupEntries(entry.groups);
          }
        }
      }
    }

    function populateParentOptions(currentId) {
      if (!nodeParentSelect) {
        return;
      }
      nodeParentSelect.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "顶层节点组";
      nodeParentSelect.appendChild(placeholder);
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      var blocked = {};
      if (currentId) {
        blocked[currentId] = true;
        var descendants = collectDescendantIdsLocal(currentId);
        for (var i = 0; i < descendants.length; i += 1) {
          blocked[descendants[i]] = true;
        }
      }
      nodes.forEach(function (group) {
        if (!group || !group.id || blocked[group.id]) {
          return;
        }
        var option = document.createElement("option");
        option.value = group.id;
        option.textContent = formatGroupPathLabel(group.id) || group.name;
        nodeParentSelect.appendChild(option);
      });
    }

    function renderForm() {
      var node = state.editingNodeId ? findNode(state.editingNodeId) : null;
      if (!node) {
        if (nodeKeyInput) {
          var pendingKey = state.pendingNodeKey || generateUniqueGroupId();
          state.pendingNodeKey = pendingKey;
          nodeKeyInput.value = pendingKey;
        }
        nodeNameInput.value = "";
        if (nodeNoteInput) {
          nodeNoteInput.value = "";
        }
        nodeUnitInput.value = "℃";
        nodeManualSelect.value = "false";
        if (nodeSimulationSelect) {
          nodeSimulationSelect.value = "true";
        }
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
        if (nodeParentSelect) {
          populateParentOptions(null);
          nodeParentSelect.value = state.pendingParentId || "";
        }
        renderSubNodes();
        return;
      }
      if (nodeKeyInput) {
        nodeKeyInput.value = node.id || "";
      }
      state.pendingNodeKey = null;
      nodeNameInput.value = node.name || "";
      if (nodeNoteInput) {
        nodeNoteInput.value = node.note || "";
      }
      nodeUnitInput.value = node.unit || "";
      nodeManualSelect.value = node.manual ? "true" : "false";
      if (nodeSimulationSelect) {
        nodeSimulationSelect.value = node.simulate === false ? "false" : "true";
      }
      if (nodeParentSelect) {
        populateParentOptions(node.id);
        nodeParentSelect.value = node.parentId || "";
      }
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
        parts.push("ID " + (item.id || "--"));
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
      var baseId = node.id || generateId();
      var originalId = node.originalId || baseId;
      var idValue = promptNodeIdentifier(baseId, originalId);
      if (!idValue) {
        return;
      }
      idValue = idValue.trim();
      if (!idValue) {
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
      node.id = idValue;
      node.originalId = originalId;
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
      var newId = promptNodeIdentifier(generateId(), null);
      if (!newId) {
        return;
      }
      newId = newId.trim();
      if (!newId) {
        return;
      }
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
        id: newId,
        originalId: newId,
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
      var keyValue = nodeKeyInput && nodeKeyInput.value ? nodeKeyInput.value.trim() : "";
      if (!keyValue) {
        keyValue = generateUniqueGroupId();
        if (nodeKeyInput) {
          nodeKeyInput.value = keyValue;
        }
      }
      var payload = {
        id: keyValue,
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
        parentId: nodeParentSelect && nodeParentSelect.value ? nodeParentSelect.value : null,
        children: ensureEditingChildren(clone(state.editingSubNodes) || []),
        simulate: !nodeSimulationSelect || nodeSimulationSelect.value !== "false"
      };
      if (state.editingNodeId && state.editingNodeId !== keyValue) {
        payload.originalId = state.editingNodeId;
      }
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
      metrics.push({ label: "节点组", value: nodes.length });
      var library = state.nodeLibrary || [];
      metrics.push({ label: "节点总数", value: library.length });
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

    function renderScenarioAdjustments() {
      if (!scenarioAdjustmentsEl) {
        return;
      }
      ensureScenarioDraftRows();
      var options = buildScenarioOptions();
      scenarioAdjustmentsEl.innerHTML = "";
      state.scenarioDraft.adjustments.forEach(function (row, index) {
        var wrapper = document.createElement("div");
        wrapper.className = "trend-scenario-adjustment";
        var select = document.createElement("select");
        select.className = "trend-scenario-select";
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "选择节点";
        select.appendChild(placeholder);
        options.forEach(function (opt) {
          var option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.value === row.key) {
            option.selected = true;
          }
          select.appendChild(option);
        });
        select.addEventListener("change", function () {
          state.scenarioDraft.adjustments[index].key = select.value;
          var matched = findScenarioOption(select.value, options);
          var unitEl = wrapper.querySelector(".trend-scenario-unit");
          if (unitEl) {
            unitEl.textContent = matched ? matched.unit : "";
          }
        });
        wrapper.appendChild(select);
        var input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.placeholder = "调整量";
        input.className = "trend-scenario-input";
        input.value = row.delta === null || row.delta === undefined ? "" : row.delta;
        input.addEventListener("input", function () {
          state.scenarioDraft.adjustments[index].delta = input.value;
        });
        wrapper.appendChild(input);
        var unit = document.createElement("span");
        unit.className = "trend-scenario-unit";
        var matched = findScenarioOption(row.key, options);
        unit.textContent = matched ? matched.unit : "";
        wrapper.appendChild(unit);
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost-button danger";
        removeBtn.textContent = "移除";
        removeBtn.addEventListener("click", function () {
          if (!state.scenarioDraft || !Array.isArray(state.scenarioDraft.adjustments)) {
            return;
          }
          if (state.scenarioDraft.adjustments.length <= 1) {
            state.scenarioDraft.adjustments[0] = { key: "", delta: "" };
          } else {
            state.scenarioDraft.adjustments.splice(index, 1);
          }
          renderScenarioAdjustments();
        });
        wrapper.appendChild(removeBtn);
        scenarioAdjustmentsEl.appendChild(wrapper);
      });
    }

    function renderScenarioForm() {
      if (!scenarioForm) {
        return;
      }
      ensureScenarioDraftRows();
      if (scenarioNameInput) {
        scenarioNameInput.value = state.scenarioDraft.name || "";
      }
      if (scenarioNoteInput) {
        scenarioNoteInput.value = state.scenarioDraft.note || "";
      }
      if (scenarioHorizonInput) {
        scenarioHorizonInput.value = state.scenarioDraft.horizon || ((state.snapshot && state.snapshot.settings && state.snapshot.settings.predictionMinutes) || 30);
      }
      renderScenarioAdjustments();
      if (state.activeScenarioId) {
        scenarioForm.classList.add("scenario-editing");
      } else {
        scenarioForm.classList.remove("scenario-editing");
      }
    }

    function scenarioKeyFromEntry(entry) {
      if (!entry) {
        return null;
      }
      if (entry.key) {
        return entry.key;
      }
      return entry.nodeId + (entry.subNodeId ? "::" + entry.subNodeId : "");
    }

    function getScenarioEntryByKey(key) {
      if (!key || !state.scenarioResult || !Array.isArray(state.scenarioResult.nodes)) {
        return null;
      }
      for (var i = 0; i < state.scenarioResult.nodes.length; i += 1) {
        var item = state.scenarioResult.nodes[i];
        if (scenarioKeyFromEntry(item) === key) {
          return item;
        }
      }
      return null;
    }

    function refreshScenarioRowActive() {
      if (!scenarioResultEl) {
        return;
      }
      var rows = scenarioResultEl.querySelectorAll(".trend-scenario-result-row");
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        var key = row ? row.getAttribute("data-key") : null;
        if (!row) {
          continue;
        }
        if (key && state.scenarioChartKey === key) {
          row.classList.add("active");
        } else {
          row.classList.remove("active");
        }
      }
    }

    function renderScenarioChart() {
      if (!scenarioChartCanvas || !state.scenarioResult) {
        return;
      }
      var nodes = state.scenarioResult.nodes || [];
      if (!state.scenarioChartKey && nodes.length) {
        state.scenarioChartKey = scenarioKeyFromEntry(nodes[0]);
      }
      var entry = getScenarioEntryByKey(state.scenarioChartKey);
      if (!entry && nodes.length) {
        entry = nodes[0];
        state.scenarioChartKey = scenarioKeyFromEntry(entry);
      }
      if (!entry) {
        drawMultiSeries(scenarioChartCanvas, []);
        if (scenarioLegend) {
          scenarioLegend.innerHTML = "";
        }
        if (scenarioContributionEl) {
          scenarioContributionEl.innerHTML = "";
        }
        refreshScenarioRowActive();
        return;
      }
      var baseline = Array.isArray(entry.baselineSeries) ? entry.baselineSeries : [];
      var projection = Array.isArray(entry.projectedSeries) ? entry.projectedSeries : [];
      drawMultiSeries(scenarioChartCanvas, [
        { label: "当前趋势", data: baseline, color: "#94a3b8", dashed: true },
        { label: "模拟预测", data: projection, color: "#2563eb" }
      ]);
      if (scenarioLegend) {
        scenarioLegend.innerHTML = "";
        [
          { label: "当前趋势", color: "#94a3b8", dashed: true },
          { label: "模拟预测", color: "#2563eb" }
        ].forEach(function (item) {
          var legendItem = document.createElement("span");
          legendItem.className = "trend-scenario-legend-item" + (item.dashed ? " dashed" : "");
          var dot = document.createElement("span");
          dot.className = "trend-scenario-legend-dot";
          dot.style.backgroundColor = item.color;
          legendItem.appendChild(dot);
          var text = document.createElement("span");
          text.textContent = item.label;
          legendItem.appendChild(text);
          scenarioLegend.appendChild(legendItem);
        });
      }
      if (scenarioContributionEl) {
        scenarioContributionEl.innerHTML = "";
        var title = document.createElement("div");
        title.className = "trend-scenario-contrib-title";
        title.textContent = (entry.label || "节点") + " · 预测 " + formatNumber(entry.projected, entry.unit || "") + " · 状态 " + (entry.status || "未知");
        scenarioContributionEl.appendChild(title);
        var list = document.createElement("ul");
        list.className = "trend-scenario-contrib-list";
        var contributions = Array.isArray(entry.contributions) ? entry.contributions.slice() : [];
        contributions.sort(function (a, b) {
          return Math.abs(b.delta || 0) - Math.abs(a.delta || 0);
        });
        contributions.slice(0, 4).forEach(function (item) {
          if (!item) {
            return;
          }
          var li = document.createElement("li");
          li.className = "trend-scenario-contrib-item";
          li.textContent = (item.label || "调整") + " → " + formatNumber(item.delta, entry.unit || "");
          list.appendChild(li);
        });
        if (!list.children.length) {
          var empty = document.createElement("li");
          empty.className = "trend-scenario-contrib-item";
          empty.textContent = "暂无贡献明细";
          list.appendChild(empty);
        }
        scenarioContributionEl.appendChild(list);
      }
      refreshScenarioRowActive();
    }

    function exportScenarioCsv() {
      if (!state.scenarioResult || !state.scenarioResult.nodes || !state.scenarioResult.nodes.length) {
        return;
      }
      var rows = ["节点,单位,当前值,预测值,变化,状态,影响分"];
      state.scenarioResult.nodes.forEach(function (row) {
        if (!row) {
          return;
        }
        var label = (row.label || "节点").replace(/\"/g, '""');
        rows.push([
          '"' + label + '"',
          row.unit || "",
          typeof row.base === "number" ? row.base.toFixed(4) : "",
          typeof row.projected === "number" ? row.projected.toFixed(4) : "",
          typeof row.delta === "number" ? row.delta.toFixed(4) : "",
          row.status || "",
          typeof row.impact === "number" ? row.impact.toFixed(4) : ""
        ].join(","));
      });
      var blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      var name = state.scenarioResult.name || "scenario";
      link.download = name + "-projection.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function duplicateScenario(scenario) {
      if (!scenario || !services.runScenario) {
        return;
      }
      var baseName = scenario.name || "模拟方案";
      var copyName = baseName + " 副本";
      var projection = services.runScenario({
        adjustments: clone(scenario.adjustments || []),
        horizonMinutes: scenario.horizonMinutes,
        name: copyName,
        note: scenario.note || "",
        persist: true
      });
      if (projection) {
        state.scenarioResult = projection;
        state.scenarioChartKey = null;
        state.activeScenarioId = projection.scenarioId || null;
        if (services.listScenarios) {
          state.scenarios = services.listScenarios();
        }
        renderScenarioResult();
        renderScenarioSaved();
        if (services.toast) {
          services.toast("已复制模拟方案");
        }
      }
    }

    function renderScenarioResult() {
      if (!scenarioResultEl) {
        return;
      }
      scenarioResultEl.innerHTML = "";
      if (!state.scenarioResult) {
        var empty = document.createElement("div");
        empty.className = "trend-scenario-empty";
        empty.textContent = "暂无模拟结果";
        scenarioResultEl.appendChild(empty);
        return;
      }
      var header = document.createElement("div");
      header.className = "trend-scenario-summary";
      header.textContent = state.scenarioResult.summary || "模拟完成";
      scenarioResultEl.appendChild(header);
      var meta = document.createElement("div");
      meta.className = "trend-scenario-meta";
      meta.textContent = "预测 " + (state.scenarioResult.horizonMinutes || 0) + " 分钟 · 生成于 " + formatDateTime(state.scenarioResult.createdAt);
      scenarioResultEl.appendChild(meta);
      if (state.scenarioResult.adjustments && state.scenarioResult.adjustments.length) {
        var adjList = document.createElement("ul");
        adjList.className = "trend-scenario-adjustment-list";
        state.scenarioResult.adjustments.forEach(function (adj) {
          var li = document.createElement("li");
          li.textContent = (adj.label || "节点") + " 调整 " + (typeof adj.delta === "number" ? adj.delta : adj.delta || "");
          adjList.appendChild(li);
        });
        scenarioResultEl.appendChild(adjList);
      }
      var actions = document.createElement("div");
      actions.className = "trend-scenario-result-actions";
      var exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "ghost-button";
      exportBtn.textContent = "导出 CSV";
      exportBtn.addEventListener("click", exportScenarioCsv);
      actions.appendChild(exportBtn);
      scenarioResultEl.appendChild(actions);
      var table = document.createElement("div");
      table.className = "trend-scenario-results";
      var rows = (state.scenarioResult.nodes || []).slice(0, 8);
      rows.forEach(function (row) {
        var item = document.createElement("div");
        item.className = "trend-scenario-result-row";
        var key = scenarioKeyFromEntry(row);
        item.setAttribute("data-key", key || "");
        var name = document.createElement("div");
        name.className = "trend-scenario-result-name";
        name.textContent = row.label;
        item.appendChild(name);
        var value = document.createElement("div");
        value.className = "trend-scenario-result-value";
        value.textContent = formatNumber(row.projected, row.unit || "");
        item.appendChild(value);
        var delta = document.createElement("div");
        delta.className = "trend-scenario-result-delta" + (row.delta >= 0 ? " rise" : " fall");
        var diffText = row.delta >= 0 ? "+" + formatNumber(row.delta, row.unit || "") : formatNumber(row.delta, row.unit || "");
        delta.textContent = "变化 " + diffText;
        item.appendChild(delta);
        var status = document.createElement("div");
        status.className = "trend-scenario-result-status trend-scenario-result-status-" + (row.status || "未知");
        status.textContent = row.status || "未知";
        item.appendChild(status);
        if (!state.scenarioChartKey) {
          state.scenarioChartKey = key;
        }
        if (key && state.scenarioChartKey === key) {
          item.classList.add("active");
        }
        item.addEventListener("click", function () {
          if (!key) {
            return;
          }
          state.scenarioChartKey = key;
          renderScenarioChart();
        });
        table.appendChild(item);
      });
      scenarioResultEl.appendChild(table);
      var chartBlock = document.createElement("div");
      chartBlock.className = "trend-scenario-chart";
      scenarioChartCanvas = document.createElement("canvas");
      scenarioChartCanvas.id = "trendScenarioChart";
      chartBlock.appendChild(scenarioChartCanvas);
      scenarioLegend = document.createElement("div");
      scenarioLegend.className = "trend-scenario-legend";
      chartBlock.appendChild(scenarioLegend);
      scenarioResultEl.appendChild(chartBlock);
      scenarioContributionEl = document.createElement("div");
      scenarioContributionEl.className = "trend-scenario-contrib";
      scenarioResultEl.appendChild(scenarioContributionEl);
      renderScenarioChart();
    }

    function renderScenarioSaved() {
      if (!scenarioSavedListEl) {
        return;
      }
      scenarioSavedListEl.innerHTML = "";
      if (!state.scenarios || !state.scenarios.length) {
        var empty = document.createElement("div");
        empty.className = "trend-scenario-empty";
        empty.textContent = "暂无已保存的模拟";
        scenarioSavedListEl.appendChild(empty);
        return;
      }
      state.scenarios.forEach(function (scenario) {
        if (!scenario) {
          return;
        }
        var card = document.createElement("div");
        card.className = "trend-scenario-card" + (state.activeScenarioId === scenario.id ? " active" : "");
        var title = document.createElement("div");
        title.className = "trend-scenario-card-title";
        title.textContent = scenario.name || "模拟方案";
        card.appendChild(title);
        var meta = document.createElement("div");
        meta.className = "trend-scenario-card-meta";
        meta.textContent = "更新 " + formatDateTime(scenario.updatedAt || scenario.createdAt);
        card.appendChild(meta);
        if (scenario.lastProjection && scenario.lastProjection.summary) {
          var summary = document.createElement("div");
          summary.className = "trend-scenario-card-summary";
          summary.textContent = scenario.lastProjection.summary;
          card.appendChild(summary);
        }
        var actions = document.createElement("div");
        actions.className = "trend-scenario-card-actions";
        var loadBtn = document.createElement("button");
        loadBtn.type = "button";
        loadBtn.className = "ghost-button";
        loadBtn.textContent = "载入";
        loadBtn.addEventListener("click", function () {
          state.activeScenarioId = scenario.id;
          state.scenarioDraft = createScenarioDraft(state.snapshot, scenario);
          state.scenarioDraft.id = scenario.id;
          state.scenarioResult = scenario.lastProjection ? clone(scenario.lastProjection) : null;
          state.scenarioChartKey = null;
          renderScenarioForm();
          renderScenarioResult();
          renderScenarioSaved();
        });
        actions.appendChild(loadBtn);
        var replayBtn = document.createElement("button");
        replayBtn.type = "button";
        replayBtn.className = "ghost-button";
        replayBtn.textContent = "再次模拟";
        replayBtn.addEventListener("click", function () {
          if (!services.runScenario) {
            return;
          }
          var projection = services.runScenario({
            adjustments: clone(scenario.adjustments || []),
            horizonMinutes: scenario.horizonMinutes,
            name: scenario.name,
            note: scenario.note || "",
            scenarioId: scenario.id,
            persist: true
          });
          if (projection) {
            state.scenarioResult = projection;
            state.activeScenarioId = projection.scenarioId || scenario.id;
            state.scenarioChartKey = null;
            if (services.listScenarios) {
              state.scenarios = services.listScenarios();
            }
            renderScenarioResult();
            renderScenarioSaved();
            if (services.toast) {
              services.toast("模拟已刷新");
            }
          }
        });
        actions.appendChild(replayBtn);
        var copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "ghost-button";
        copyBtn.textContent = "复制";
        copyBtn.addEventListener("click", function () {
          duplicateScenario(scenario);
        });
        actions.appendChild(copyBtn);
        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "ghost-button danger";
        deleteBtn.textContent = "删除";
        deleteBtn.addEventListener("click", function () {
          if (!services.removeScenario) {
            return;
          }
          if (window.confirm && !window.confirm("确定删除该模拟方案？")) {
            return;
          }
          if (services.removeScenario(scenario.id)) {
            if (state.activeScenarioId === scenario.id) {
              state.activeScenarioId = null;
              state.scenarioDraft = createScenarioDraft(state.snapshot, null);
              state.scenarioResult = null;
              state.scenarioChartKey = null;
              ensureScenarioDraftRows();
              renderScenarioForm();
              renderScenarioResult();
            }
            if (services.listScenarios) {
              state.scenarios = services.listScenarios();
            }
            renderScenarioSaved();
            if (services.toast) {
              services.toast("模拟方案已删除");
            }
          }
        });
        actions.appendChild(deleteBtn);
        card.appendChild(actions);
        scenarioSavedListEl.appendChild(card);
      });
    }

    function handleScenarioRun(evt) {
      if (evt) {
        evt.preventDefault();
      }
      if (!services.runScenario) {
        return;
      }
      ensureScenarioDraftRows();
      var adjustments = [];
      var invalid = 0;
      var options = buildScenarioOptions();
      state.scenarioDraft.adjustments.forEach(function (row) {
        if (!row || !row.key) {
          return;
        }
        var parsed = parseScenarioKey(row.key);
        if (!parsed || !parsed.nodeId) {
          invalid += 1;
          return;
        }
        var value = typeof row.delta === "number" ? row.delta : parseFloat(row.delta);
        if (!isFinite(value)) {
          invalid += 1;
          return;
        }
        var opt = findScenarioOption(row.key, options);
        adjustments.push({
          nodeId: parsed.nodeId,
          subNodeId: parsed.subNodeId || null,
          delta: value,
          label: opt ? opt.label : row.key
        });
      });
      if (!adjustments.length) {
        if (services.toast) {
          services.toast("请至少配置一个节点并填写调整量");
        }
        return;
      }
      if (invalid && services.toast) {
        services.toast("部分调整量无效，已忽略");
      }
      var payload = {
        adjustments: adjustments,
        horizonMinutes: state.scenarioDraft.horizon || ((state.snapshot && state.snapshot.settings && state.snapshot.settings.predictionMinutes) || 30),
        name: state.scenarioDraft.name || "模拟方案",
        note: state.scenarioDraft.note || "",
        scenarioId: state.scenarioDraft.id || state.activeScenarioId || null,
        persist: scenarioPersistInput ? !!scenarioPersistInput.checked : false
      };
      var projection = services.runScenario(payload);
      if (projection) {
        state.scenarioResult = projection;
        state.scenarioChartKey = null;
        if (payload.persist) {
          state.activeScenarioId = projection.scenarioId || payload.scenarioId || null;
          state.scenarioDraft.id = state.activeScenarioId;
          if (services.listScenarios) {
            state.scenarios = services.listScenarios();
          }
        }
        renderScenarioResult();
        renderScenarioSaved();
        if (services.toast) {
          services.toast("模拟已完成");
        }
      }
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
      renderScenarioForm();
      renderScenarioResult();
      renderScenarioSaved();
    }

    if (addNodeBtn) {
      addNodeBtn.addEventListener("click", function () {
        state.pendingParentId = state.editingNodeId || null;
        state.editingNodeId = null;
        state.pendingNodeKey = generateUniqueGroupId();
        state.editingSubNodes = [];
        renderForm();
      });
    }

    if (nodeKeyInput) {
      nodeKeyInput.addEventListener("change", function () {
        var value = nodeKeyInput.value ? nodeKeyInput.value.trim() : "";
        if (!state.editingNodeId) {
          state.pendingNodeKey = value || state.pendingNodeKey;
        }
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

    if (scenarioAddAdjustmentBtn) {
      scenarioAddAdjustmentBtn.addEventListener("click", function () {
        ensureScenarioDraftRows();
        state.scenarioDraft.adjustments.push({ key: "", delta: "" });
        renderScenarioAdjustments();
      });
    }

    if (scenarioRunBtn) {
      scenarioRunBtn.addEventListener("click", handleScenarioRun);
    }

    if (scenarioForm) {
      scenarioForm.addEventListener("submit", handleScenarioRun);
    }

    if (scenarioNameInput) {
      scenarioNameInput.addEventListener("input", function () {
        state.scenarioDraft.name = scenarioNameInput.value || "";
      });
    }

    if (scenarioNoteInput) {
      scenarioNoteInput.addEventListener("input", function () {
        state.scenarioDraft.note = scenarioNoteInput.value || "";
      });
    }

    if (scenarioHorizonInput) {
      scenarioHorizonInput.addEventListener("change", function () {
        var value = parseInt(scenarioHorizonInput.value, 10);
        if (!isNaN(value) && value > 0) {
          state.scenarioDraft.horizon = value;
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
        if (isGroupIdTaken(payload.id, payload.originalId || state.editingNodeId || null)) {
          services.toast && services.toast("节点组 ID 已存在，请更换");
          return;
        }
        var saved = services.upsertNode(payload);
        state.editingNodeId = saved && saved.id ? saved.id : payload.id;
        state.pendingNodeKey = null;
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
