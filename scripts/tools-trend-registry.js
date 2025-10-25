(function () {
  function formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) {
      return "--";
    }
    var fixed = Number(value).toFixed(3);
    return fixed;
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
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    var hour = String(date.getHours()).padStart(2, "0");
    var minute = String(date.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hour + ":" + minute;
  }

  function drawRegistrySeries(canvas, series) {
    if (!canvas || !canvas.getContext) {
      return;
    }
    var ctx = canvas.getContext("2d");
    var width = canvas.clientWidth || 520;
    var height = canvas.clientHeight || 220;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    if (!series || !series.length) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无数据", 20, height / 2);
      return;
    }
    var sorted = series.slice().sort(function (a, b) {
      return new Date(a.capturedAt) - new Date(b.capturedAt);
    });
    var min = sorted[0].value;
    var max = sorted[0].value;
    var minTime = new Date(sorted[0].capturedAt).getTime();
    var maxTime = minTime;
    for (var i = 1; i < sorted.length; i += 1) {
      var point = sorted[i];
      if (point.value < min) { min = point.value; }
      if (point.value > max) { max = point.value; }
      var ts = new Date(point.capturedAt).getTime();
      if (ts < minTime) { minTime = ts; }
      if (ts > maxTime) { maxTime = ts; }
    }
    if (!isFinite(min) || !isFinite(max) || maxTime === minTime) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无有效数据", 20, height / 2);
      return;
    }
    if (Math.abs(max - min) < 1e-6) {
      var center = (max + min) / 2;
      max = center + 1;
      min = center - 1;
    }
    var padding = 28;
    var top = padding;
    var bottom = height - padding * 1.4;
    var span = Math.max(maxTime - minTime, 1);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    sorted.forEach(function (point, index) {
      var ts = new Date(point.capturedAt).getTime();
      var x = padding + ((ts - minTime) / span) * (width - padding * 2);
      var y = bottom - ((point.value - min) / (max - min)) * (bottom - top);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function cloneLibraryRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }
    return {
      id: record.id || "",
      name: record.name || "节点",
      unit: record.unit || "",
      lower: typeof record.lower === "number" ? record.lower : null,
      center: typeof record.center === "number" ? record.center : null,
      upper: typeof record.upper === "number" ? record.upper : null,
      manual: !!record.manual,
      manualStep: typeof record.manualStep === "number" ? record.manualStep : 0,
      simulate: record.simulate === false ? false : true,
      note: record.note || "",
      groupId: record.groupId || null,
      parentGroupId: record.parentGroupId || null,
      groupPath: Array.isArray(record.groupPath) ? record.groupPath.slice() : [],
      groupNamePath: Array.isArray(record.groupNamePath) ? record.groupNamePath.slice() : [],
      groupNote: record.groupNote || "",
      createdAt: record.createdAt || "",
      updatedAt: record.updatedAt || ""
    };
  }

  function deriveLibraryFromSnapshot(snapshot) {
    if (!snapshot) {
      return [];
    }
    if (Array.isArray(snapshot.nodeLibrary) && snapshot.nodeLibrary.length) {
      return snapshot.nodeLibrary.map(cloneLibraryRecord).filter(Boolean);
    }
    if (snapshot.hierarchy && snapshot.hierarchy.nodes) {
      var hierarchyNodes = snapshot.hierarchy.nodes;
      var entries = [];
      for (var id in hierarchyNodes) {
        if (!Object.prototype.hasOwnProperty.call(hierarchyNodes, id)) {
          continue;
        }
        var derived = cloneLibraryRecord(hierarchyNodes[id]);
        if (derived) {
          if (!derived.id) {
            derived.id = id;
          }
          entries.push(derived);
        }
      }
      return entries;
    }
    if (!Array.isArray(snapshot.nodes) || !snapshot.nodes.length) {
      return [];
    }
    var groups = {};
    snapshot.nodes.forEach(function (group) {
      if (!group || !group.id) {
        return;
      }
      groups[group.id] = {
        id: group.id,
        name: group.name || "节点组",
        parentId: group.parentId || null,
        note: group.note || ""
      };
    });
    function buildGroupPath(id) {
      var ids = [];
      var names = [];
      var guard = 0;
      var currentId = id;
      while (currentId && groups[currentId] && guard < 50) {
        var entry = groups[currentId];
        ids.unshift(entry.id);
        names.unshift(entry.name);
        currentId = entry.parentId;
        guard += 1;
      }
      return {
        ids: ids,
        names: names
      };
    }
    var derivedList = [];
    snapshot.nodes.forEach(function (group) {
      if (!group || !group.id || !Array.isArray(group.children)) {
        return;
      }
      var path = buildGroupPath(group.id);
      group.children.forEach(function (child) {
        if (!child || !child.id) {
          return;
        }
        derivedList.push({
          id: child.id,
          name: child.name || "节点",
          unit: child.unit || "",
          lower: typeof child.lower === "number" ? child.lower : null,
          center: typeof child.center === "number" ? child.center : null,
          upper: typeof child.upper === "number" ? child.upper : null,
          manual: !!child.manual,
          manualStep: typeof child.manualStep === "number" ? child.manualStep : 0,
          simulate: child.simulate === false ? false : true,
          note: child.note || "",
          groupId: group.id,
          parentGroupId: group.parentId || null,
          groupPath: path.ids.slice(),
          groupNamePath: path.names.slice(),
          groupNote: group.note || "",
          createdAt: child.createdAt || group.createdAt || "",
          updatedAt: child.updatedAt || group.updatedAt || ""
        });
      });
    });
    return derivedList;
  }

  window.initTrendRegistryModule = function initTrendRegistryModule(services) {
    if (!services) {
      return;
    }
    var state = {
      snapshot: null,
      library: [],
      group: "",
      search: "",
      manualOnly: false,
      simulatedOnly: false,
      selectedId: null,
      unsubscribe: null,
      fallbackRequested: false
    };

    var statsEl = document.getElementById("trendRegistryStats");
    var groupSelect = document.getElementById("trendRegistryGroup");
    var searchInput = document.getElementById("trendRegistrySearch");
    var manualToggle = document.getElementById("trendRegistryManualOnly");
    var simulatedToggle = document.getElementById("trendRegistrySimulatedOnly");
    var exportBtn = document.getElementById("trendRegistryExport");
    var tableBody = document.getElementById("trendRegistryTable");
    var emptyDetail = document.getElementById("trendRegistryEmpty");
    var inspector = document.getElementById("trendRegistryInspector");
    var detailName = document.getElementById("trendRegistryDetailName");
    var detailPath = document.getElementById("trendRegistryDetailPath");
    var detailConfig = document.getElementById("trendRegistryDetailConfig");
    var detailChart = document.getElementById("trendRegistryDetailChart");
    var detailSuggestions = document.getElementById("trendRegistryDetailSuggestions");
    var jumpBtn = document.getElementById("trendRegistryJump");

    function normalizeLibrary(list) {
      var next = [];
      if (Array.isArray(list) && list.length) {
        next = list.map(cloneLibraryRecord).filter(Boolean);
      }
      if ((!next || !next.length) && state.snapshot) {
        next = deriveLibraryFromSnapshot(state.snapshot);
      }
      return next;
    }

    function applyLibrary(list) {
      state.library = normalizeLibrary(list);
      if (state.selectedId) {
        var exists = state.library.some(function (node) { return node && node.id === state.selectedId; });
        if (!exists) {
          state.selectedId = null;
        }
      }
      if (!state.selectedId && state.library.length) {
        state.selectedId = state.library[0].id;
      }
      renderStats();
      buildGroupOptions();
      renderTable();
      renderDetail();
      if (!state.library.length) {
        attemptIndexedFallback();
      }
    }

    function sync(snapshot) {
      state.snapshot = snapshot || (services.getSnapshot ? services.getSnapshot({}) : null);
      var provided = services.listLibrary ? services.listLibrary() : null;
      if (provided && typeof provided.then === "function") {
        provided.then(function (records) {
          applyLibrary(records);
        }).catch(function (err) {
          console.warn("trend registry async load failed", err);
          applyLibrary(null);
        });
      } else {
        applyLibrary(provided);
      }
    }

    function attemptIndexedFallback() {
      if (state.library && state.library.length) {
        return;
      }
      if (state.fallbackRequested) {
        return;
      }
      if (!window.TrendIndexedStore || typeof window.TrendIndexedStore.loadNodeLibrary !== "function") {
        state.fallbackRequested = true;
        return;
      }
      state.fallbackRequested = true;
      try {
        var promise = window.TrendIndexedStore.loadNodeLibrary();
        if (promise && typeof promise.then === "function") {
          promise.then(function (records) {
            if (records && records.length) {
              state.library = records.slice();
              if (!state.selectedId && state.library.length) {
                state.selectedId = state.library[0].id;
              }
              renderStats();
              buildGroupOptions();
              renderTable();
              renderDetail();
            }
          }).catch(function (err) {
            console.warn("trend registry fallback failed", err);
          });
        }
      } catch (err) {
        console.warn("trend registry fallback error", err);
      }
    }

    function renderStats() {
      if (!statsEl) {
        return;
      }
      statsEl.innerHTML = "";
      var total = state.library.length;
      var manualCount = state.library.filter(function (node) { return node && node.manual; }).length;
      var simulatedCount = state.library.filter(function (node) { return node && node.simulate !== false; }).length;
      var groups = {};
      state.library.forEach(function (node) {
        if (!node) { return; }
        var key = Array.isArray(node.groupPath) && node.groupPath.length ? node.groupPath.join("::") : "__root";
        groups[key] = true;
      });
      var cards = [
        { label: "节点总数", value: total },
        { label: "手动节点", value: manualCount },
        { label: "演示节点", value: simulatedCount },
        { label: "节点组", value: Object.keys(groups).length }
      ];
      cards.forEach(function (metric) {
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
        statsEl.appendChild(card);
      });
    }

    function buildGroupOptions() {
      if (!groupSelect) {
        return;
      }
      var existing = state.library.reduce(function (acc, node) {
        if (!node) { return acc; }
        var key = Array.isArray(node.groupPath) && node.groupPath.length ? node.groupPath.join("::") : "";
        if (!acc[key]) {
          acc[key] = node.groupNamePath && node.groupNamePath.length ? node.groupNamePath.join(" / ") : (key ? key : "未分组");
        }
        return acc;
      }, {});
      var options = Object.keys(existing).sort(function (a, b) {
        return existing[a].localeCompare(existing[b], "zh-Hans-CN");
      });
      var targetValue = "";
      if (state.group && options.indexOf(state.group) !== -1) {
        targetValue = state.group;
      }
      groupSelect.innerHTML = "";
      var allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = "全部节点组";
      groupSelect.appendChild(allOption);
      options.forEach(function (key) {
        var opt = document.createElement("option");
        opt.value = key;
        opt.textContent = existing[key];
        groupSelect.appendChild(opt);
      });
      groupSelect.value = targetValue;
      state.group = groupSelect.value || "";
    }

    function filterLibrary() {
      var list = state.library.filter(function (node) { return !!node; });
      if (state.group) {
        list = list.filter(function (node) {
          var path = Array.isArray(node.groupPath) ? node.groupPath.join("::") : "";
          return path === state.group;
        });
      }
      if (state.manualOnly) {
        list = list.filter(function (node) { return node.manual; });
      }
      if (state.simulatedOnly) {
        list = list.filter(function (node) { return node.simulate !== false; });
      }
      if (state.search) {
        var term = state.search.toLowerCase();
        list = list.filter(function (node) {
          return [node.id, node.name, (node.groupNamePath || []).join(" "), node.unit, node.note]
            .filter(Boolean)
            .some(function (value) {
              return String(value).toLowerCase().indexOf(term) !== -1;
            });
        });
      }
      list.sort(function (a, b) {
        var aName = a.name || "";
        var bName = b.name || "";
        return aName.localeCompare(bName, "zh-Hans-CN");
      });
      return list;
    }

    function getLatestReading(nodeId) {
      var streams = (state.snapshot && state.snapshot.streams) || [];
      var latest = null;
      streams.forEach(function (entry) {
        if (!entry || entry.nodeId !== nodeId) {
          return;
        }
        if (!entry.capturedAt || typeof entry.value !== "number") {
          return;
        }
        if (!latest || new Date(entry.capturedAt) > new Date(latest.capturedAt)) {
          latest = entry;
        }
      });
      return latest;
    }

    function renderTable() {
      if (!tableBody) {
        return;
      }
      tableBody.innerHTML = "";
      var filtered = filterLibrary();
      if (!filtered.length) {
        var empty = document.createElement("div");
        empty.className = "trend-registry-empty";
        empty.textContent = "暂无匹配的节点";
        tableBody.appendChild(empty);
        return;
      }
      filtered.forEach(function (node) {
        var row = document.createElement("div");
        row.className = "trend-registry-row" + (node.id === state.selectedId ? " is-active" : "");
        row.setAttribute("role", "listitem");
        row.dataset.id = node.id;
        var groupLabel = node.groupNamePath && node.groupNamePath.length ? node.groupNamePath.join(" / ") : "未分组";
        var rangeParts = [];
        if (typeof node.lower === "number" && typeof node.upper === "number") {
          rangeParts.push(formatNumber(node.lower) + " ~ " + formatNumber(node.upper));
        }
        if (typeof node.center === "number") {
          rangeParts.push("中值 " + formatNumber(node.center));
        }
        var flags = document.createElement("div");
        if (node.manual) {
          var manualFlag = document.createElement("span");
          manualFlag.className = "registry-flag";
          manualFlag.textContent = "手动" + (node.manualStep ? " · " + formatNumber(node.manualStep) : "");
          flags.appendChild(manualFlag);
        }
        if (node.simulate === false) {
          var demoFlag = document.createElement("span");
          demoFlag.className = "registry-flag muted";
          demoFlag.textContent = "演示停用";
          flags.appendChild(demoFlag);
        } else {
          var activeFlag = document.createElement("span");
          activeFlag.className = "registry-flag";
          activeFlag.textContent = "演示";
          flags.appendChild(activeFlag);
        }
        var latest = getLatestReading(node.id);
        var latestText = "--";
        if (latest) {
          latestText = formatNumber(latest.value) + " @ " + formatDateTime(latest.capturedAt);
        }
        var cells = [
          node.id || "--",
          node.name || "节点",
          groupLabel,
          node.unit || "--",
          rangeParts.join(" · ") || "--",
          flags,
          latestText
        ];
        cells.forEach(function (value) {
          var cell = document.createElement("div");
          if (value && value.nodeType === 1) {
            cell.appendChild(value);
          } else {
            cell.textContent = value;
          }
          row.appendChild(cell);
        });
        row.addEventListener("click", function () {
          state.selectedId = node.id;
          renderTable();
          renderDetail();
        });
        tableBody.appendChild(row);
      });
    }

    function renderDetail() {
      if (!detailName || !emptyDetail || !inspector) {
        return;
      }
      if (!state.selectedId) {
        inspector.classList.add("hidden");
        emptyDetail.classList.remove("hidden");
        return;
      }
      var node = state.library.find(function (item) { return item && item.id === state.selectedId; });
      if (!node) {
        inspector.classList.add("hidden");
        emptyDetail.classList.remove("hidden");
        return;
      }
      emptyDetail.classList.add("hidden");
      inspector.classList.remove("hidden");
      detailName.textContent = node.name || node.id;
      var groupLabel = node.groupNamePath && node.groupNamePath.length ? node.groupNamePath.join(" / ") : "未分组";
      detailPath.textContent = groupLabel;
      detailConfig.innerHTML = "";
      function appendConfig(label, value) {
        var dt = document.createElement("dt");
        dt.textContent = label;
        var dd = document.createElement("dd");
        dd.textContent = value;
        detailConfig.appendChild(dt);
        detailConfig.appendChild(dd);
      }
      appendConfig("节点 ID", node.id || "--");
      appendConfig("所属节点组", groupLabel);
      appendConfig("单位", node.unit || "--");
      appendConfig("下限", typeof node.lower === "number" ? formatNumber(node.lower) : "--");
      appendConfig("中值", typeof node.center === "number" ? formatNumber(node.center) : "--");
      appendConfig("上限", typeof node.upper === "number" ? formatNumber(node.upper) : "--");
      appendConfig("手动节点", node.manual ? "是" : "否");
      appendConfig("演示参与", node.simulate === false ? "停用" : "启用");
      appendConfig("备注", node.note || "--");
      var series = [];
      var streams = (state.snapshot && state.snapshot.streams) || [];
      streams.forEach(function (entry) {
        if (entry && entry.nodeId === node.id && typeof entry.value === "number" && entry.capturedAt) {
          series.push({ capturedAt: entry.capturedAt, value: entry.value });
        }
      });
      series = series.slice(-120);
      drawRegistrySeries(detailChart, series);
      detailSuggestions.innerHTML = "";
      var suggestions = (state.snapshot && state.snapshot.suggestions) || [];
      var related = suggestions.filter(function (item) { return item && item.nodeId === node.id; });
      if (!related.length) {
        var none = document.createElement("div");
        none.className = "trend-registry-suggestion";
        none.textContent = "暂无关联建议";
        detailSuggestions.appendChild(none);
      } else {
        related.sort(function (a, b) {
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });
        related.forEach(function (item) {
          var card = document.createElement("div");
          card.className = "trend-registry-suggestion";
          var title = document.createElement("div");
          title.textContent = (item.label || item.summary || "建议") + " · " + (item.statusLabel || item.status || "待确认");
          card.appendChild(title);
          var meta = document.createElement("div");
          meta.textContent = "评分 " + (item.severity || 0) + " · 更新时间 " + formatDateTime(item.updatedAt || item.createdAt);
          card.appendChild(meta);
          if (Array.isArray(item.detail) && item.detail.length) {
            var list = document.createElement("ul");
            item.detail.forEach(function (line) {
              var li = document.createElement("li");
              li.textContent = line;
              list.appendChild(li);
            });
            card.appendChild(list);
          }
          detailSuggestions.appendChild(card);
        });
      }
      if (jumpBtn) {
        jumpBtn.onclick = function () {
          try {
            window.sessionStorage.setItem("trend:selectedNodeId", node.id);
          } catch (err) {}
          window.open("ai-trend.html", "_blank");
        };
      }
    }

    function exportNodes() {
      var nodes = filterLibrary();
      if (!nodes.length) {
        services.toast && services.toast("暂无可导出的节点");
        return;
      }
      var header = ["id", "name", "group", "unit", "lower", "center", "upper", "manual", "simulate", "note"];
      var rows = [header.join(",")];
      nodes.forEach(function (node) {
        var line = [
          node.id || "",
          '"' + (node.name || "").replace(/"/g, '""') + '"',
          '"' + ((node.groupNamePath || []).join(" / ").replace(/"/g, '""')) + '"',
          node.unit || "",
          typeof node.lower === "number" ? formatNumber(node.lower) : "",
          typeof node.center === "number" ? formatNumber(node.center) : "",
          typeof node.upper === "number" ? formatNumber(node.upper) : "",
          node.manual ? "true" : "false",
          node.simulate === false ? "false" : "true",
          '"' + (node.note || "").replace(/"/g, '""') + '"'
        ];
        rows.push(line.join(","));
      });
      var blob = new Blob([rows.join("\n")], { type: "text/csv" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "trend-registry.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    if (groupSelect) {
      groupSelect.addEventListener("change", function () {
        state.group = groupSelect.value;
        renderTable();
        renderDetail();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.search = searchInput.value.trim().toLowerCase();
        renderTable();
        renderDetail();
      });
    }

    if (manualToggle) {
      manualToggle.addEventListener("change", function () {
        state.manualOnly = manualToggle.checked;
        renderTable();
        renderDetail();
      });
    }

    if (simulatedToggle) {
      simulatedToggle.addEventListener("change", function () {
        state.simulatedOnly = simulatedToggle.checked;
        renderTable();
        renderDetail();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", exportNodes);
    }

    if (services.subscribe) {
      var unsub = services.subscribe(function (snapshot) {
        sync(snapshot);
      });
      if (typeof unsub === "function") {
        state.unsubscribe = unsub;
      } else if (unsub && typeof unsub.unsubscribe === "function") {
        state.unsubscribe = unsub.unsubscribe.bind(unsub);
      }
    }

    sync(services.getSnapshot ? services.getSnapshot({}) : null);

    window.addEventListener("beforeunload", function () {
      if (state.unsubscribe) {
        try { state.unsubscribe(); } catch (err) {}
      }
    });
  };
})();
