(function () {
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
    var hour = date.getHours().toString().padStart(2, "0");
    var minute = date.getMinutes().toString().padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hour + ":" + minute;
  }

  function formatNumber(value, unit) {
    if (value === null || value === undefined || isNaN(value)) {
      return "--";
    }
    var abs = Math.abs(value);
    var fixed = abs >= 100 ? value.toFixed(1) : value.toFixed(2);
    return fixed + (unit ? " " + unit : "");
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
    if (!series || !series.length) {
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
      if (value < min) { min = value; }
      if (value > max) { max = value; }
      var ts = new Date(series[i].capturedAt).getTime();
      if (ts < minTime) { minTime = ts; }
      if (ts > maxTime) { maxTime = ts; }
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
    ctx.strokeStyle = options && options.color ? options.color : "#1d4ed8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach(function (point, index) {
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

  function buildRecordFromSuggestion(suggestion, nodeMap) {
    var node = nodeMap[suggestion.nodeId] || null;
    return {
      id: suggestion.id,
      suggestionId: suggestion.id,
      nodeId: suggestion.nodeId,
      nodeName: node ? node.name : "节点",
      status: suggestion.status || "active",
      statusLabel: suggestion.statusLabel || suggestion.status || "建议",
      severity: suggestion.severity || 0,
      summary: suggestion.label || suggestion.summary || "建议",
      detail: suggestion.detail || [],
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt || suggestion.createdAt,
      history: [],
      source: suggestion.source || "analysis"
    };
  }

  function mount(services) {
    if (!services) {
      return;
    }
    var state = {
      services: services,
      snapshot: services.getSnapshot ? services.getSnapshot({}) : null,
      group: "all",
      search: "",
      selectedId: null,
      range: 180,
      records: [],
      unsubscribe: null
    };

    var groupSelect = document.getElementById("trendHistoryGroup");
    var searchInput = document.getElementById("trendHistorySearch");
    var listEl = document.getElementById("trendHistoryList");
    var placeholderEl = document.getElementById("trendHistoryPlaceholder");
    var detailEl = document.getElementById("trendHistoryDetail");
    var titleEl = document.getElementById("trendHistoryDetailTitle");
    var metaEl = document.getElementById("trendHistoryDetailMeta");
    var summaryEl = document.getElementById("trendHistoryDetailSummary");
    var feedbackListEl = document.getElementById("trendHistoryFeedback");
    var endpointEl = document.getElementById("trendHistoryEndpoint");
    var chartCanvas = document.getElementById("trendHistoryChart");
    var chartToolbar = document.querySelector(".trend-history-chart-toolbar");
    var forecastListEl = document.getElementById("trendHistoryForecasts");
    var exportBtn = document.getElementById("trendHistoryExport");
    var clearBtn = document.getElementById("trendHistoryClear");
    var acceptBtn = document.getElementById("trendHistoryAccept");
    var rejectBtn = document.getElementById("trendHistoryReject");

    function syncSnapshot(snapshot) {
      state.snapshot = snapshot || services.getSnapshot({});
      renderForecasts();
      buildRecords();
      renderGroups();
      renderList();
      renderDetail();
    }

    function renderForecasts() {
      if (!forecastListEl) {
        return;
      }
      forecastListEl.innerHTML = "";
      var forecasts = (state.snapshot && state.snapshot.forecasts) || [];
      if (!forecasts.length) {
        var empty = document.createElement("div");
        empty.className = "trend-history-forecast-empty";
        empty.textContent = "暂无预测信息";
        forecastListEl.appendChild(empty);
        return;
      }
      var nodeCache = {};
      (state.snapshot.nodes || []).forEach(function (node) {
        if (node && node.id) {
          nodeCache[node.id] = node;
        }
      });
      forecasts.slice(0, Math.min(forecasts.length, 6)).forEach(function (forecast) {
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
        card.className = "trend-history-forecast-card";
        var head = document.createElement("div");
        head.className = "trend-history-forecast-head";
        var title = document.createElement("div");
        title.className = "trend-history-forecast-title";
        if (child && node) {
          title.textContent = node.name + " · " + child.name;
        } else if (node) {
          title.textContent = node.name;
        } else {
          title.textContent = forecast.label || "节点";
        }
        head.appendChild(title);
        var status = document.createElement("span");
        status.className = "trend-history-forecast-status trend-history-forecast-status-" + (forecast.status || "平稳");
        status.textContent = forecast.status || "平稳";
        head.appendChild(status);
        card.appendChild(head);
        var body = document.createElement("div");
        body.className = "trend-history-forecast-body";
        var valueText = document.createElement("div");
        valueText.textContent = "预测值 " + formatNumber(forecast.value, forecast.unit || (child ? child.unit : node ? node.unit : ""));
        body.appendChild(valueText);
        if (typeof forecast.latestValue === "number") {
          var delta = document.createElement("div");
          delta.className = "trend-history-forecast-delta" + ((forecast.value - forecast.latestValue) >= 0 ? " rise" : " fall");
          delta.textContent = "较当前 " + (forecast.value - forecast.latestValue >= 0 ? "+" : "") + formatNumber(forecast.value - forecast.latestValue, forecast.unit || "");
          body.appendChild(delta);
        }
        card.appendChild(body);
        var meta = document.createElement("div");
        meta.className = "trend-history-forecast-meta";
        meta.textContent = "前瞻 " + (forecast.horizonMinutes || 0) + " 分钟 · 置信度 " + Math.round((forecast.confidence || 0) * 100) + "% · 趋势 " + (forecast.trendLabel || "平稳");
        card.appendChild(meta);
        var footer = document.createElement("div");
        footer.className = "trend-history-forecast-footer";
        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "ghost-button";
        openBtn.textContent = "查看工作台";
        openBtn.addEventListener("click", function () {
          window.location.href = "ai-trend.html#" + forecast.nodeId;
        });
        footer.appendChild(openBtn);
        card.appendChild(footer);
        forecastListEl.appendChild(card);
      });
    }


    function buildRecords() {
      state.records = [];
      if (!state.snapshot) {
        return;
      }
      var nodeMap = {};
      (state.snapshot.nodes || []).forEach(function (node) {
        nodeMap[node.id] = node;
      });
      var suggestionMap = {};
      (state.snapshot.suggestions || []).forEach(function (suggestion) {
        var record = buildRecordFromSuggestion(suggestion, nodeMap);
        suggestionMap[suggestion.id] = record;
        state.records.push(record);
      });
      (state.snapshot.history || []).forEach(function (entry) {
        var suggestionId = entry.meta && entry.meta.suggestionId ? entry.meta.suggestionId : entry.suggestionId;
        if (suggestionId && suggestionMap[suggestionId]) {
          suggestionMap[suggestionId].history.push(entry);
          if (entry.kind === "accept") {
            suggestionMap[suggestionId].status = "accepted";
            suggestionMap[suggestionId].statusLabel = "已采纳";
            suggestionMap[suggestionId].updatedAt = entry.createdAt;
          } else if (entry.kind === "reject") {
            suggestionMap[suggestionId].status = "rejected";
            suggestionMap[suggestionId].statusLabel = "已拒绝";
            suggestionMap[suggestionId].updatedAt = entry.createdAt;
          }
          return;
        }
        if (entry.kind === "adjustment") {
          var node = nodeMap[entry.nodeId];
          state.records.push({
            id: entry.id,
            suggestionId: null,
            nodeId: entry.nodeId,
            nodeName: node ? node.name : "节点",
            status: "manual",
            statusLabel: "手动调整",
            severity: 0,
            summary: (entry.meta && entry.meta.note) || "人工调整",
            detail: ["调整量：" + ((entry.meta && entry.meta.amount) || "未知")],
            createdAt: entry.createdAt,
            updatedAt: entry.createdAt,
            history: [entry],
            source: "manual"
          });
        }
      });
      state.records.sort(function (a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      });
      if (!state.selectedId && state.records.length) {
        state.selectedId = state.records[0].id;
      }
    }

    function renderGroups() {
      if (!groupSelect) {
        return;
      }
      var nodes = (state.snapshot && state.snapshot.nodes) || [];
      var options = [
        { value: "all", label: "全部" },
        { value: "active", label: "活跃" },
        { value: "accepted", label: "已采纳" },
        { value: "rejected", label: "已拒绝" },
        { value: "resolved", label: "自动恢复" },
        { value: "manual", label: "手动调整" }
      ];
      nodes.forEach(function (node) {
        options.push({ value: "node:" + node.id, label: "节点 · " + node.name });
      });
      groupSelect.innerHTML = "";
      options.forEach(function (option) {
        var opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.label;
        if (option.value === state.group) {
          opt.selected = true;
        }
        groupSelect.appendChild(opt);
      });
    }

    function filterRecords() {
      return state.records.filter(function (record) {
        if (state.group === "active" && record.status !== "active") {
          return false;
        }
        if (state.group === "accepted" && record.status !== "accepted") {
          return false;
        }
        if (state.group === "rejected" && record.status !== "rejected") {
          return false;
        }
        if (state.group === "resolved" && record.status !== "resolved") {
          return false;
        }
        if (state.group === "manual" && record.status !== "manual") {
          return false;
        }
        if (state.group.indexOf("node:") === 0) {
          var nodeId = state.group.split(":")[1];
          if (record.nodeId !== nodeId) {
            return false;
          }
        }
        if (state.search) {
          var hay = (record.summary || "") + " " + (record.detail || []).join(" ") + " " + (record.nodeName || "");
          if (hay.toLowerCase().indexOf(state.search.toLowerCase()) === -1) {
            return false;
          }
        }
        return true;
      });
    }

    function renderList() {
      if (!listEl) {
        return;
      }
      listEl.innerHTML = "";
      var filtered = filterRecords();
      if (!filtered.length) {
        var empty = document.createElement("div");
        empty.className = "trend-history-item";
        empty.textContent = "暂无记录";
        listEl.appendChild(empty);
        return;
      }
      filtered.forEach(function (record) {
        var item = document.createElement("div");
        item.className = "trend-history-item" + (record.id === state.selectedId ? " active" : "");
        item.setAttribute("role", "option");
        var title = document.createElement("div");
        title.className = "trend-history-item-title";
        title.textContent = record.summary;
        item.appendChild(title);
        var meta = document.createElement("div");
        meta.className = "trend-history-item-meta";
        meta.textContent = record.statusLabel + " · " + (record.nodeName || "节点") + " · " + formatDateTime(record.updatedAt || record.createdAt);
        item.appendChild(meta);
        item.addEventListener("click", function () {
          state.selectedId = record.id;
          renderList();
          renderDetail();
        });
        listEl.appendChild(item);
      });
    }

    function findRecordById(id) {
      for (var i = 0; i < state.records.length; i += 1) {
        if (state.records[i].id === id) {
          return state.records[i];
        }
      }
      return null;
    }

    function renderDetail() {
      var record = state.selectedId ? findRecordById(state.selectedId) : null;
      if (!record) {
        if (detailEl) {
          detailEl.classList.add("hidden");
        }
        if (placeholderEl) {
          placeholderEl.classList.remove("hidden");
        }
        drawSeries(chartCanvas, []);
        return;
      }
      if (detailEl) {
        detailEl.classList.remove("hidden");
      }
      if (placeholderEl) {
        placeholderEl.classList.add("hidden");
      }
      if (titleEl) {
        titleEl.textContent = record.summary;
      }
      if (metaEl) {
        metaEl.textContent = record.statusLabel + " · " + (record.nodeName || "节点") + " · 更新 " + formatDateTime(record.updatedAt || record.createdAt);
      }
      if (summaryEl) {
        summaryEl.innerHTML = "";
        (record.detail || []).forEach(function (line) {
          var p = document.createElement("p");
          p.textContent = line;
          summaryEl.appendChild(p);
        });
      }
      if (feedbackListEl) {
        feedbackListEl.innerHTML = "";
        var feedback = record.history.filter(function (item) { return item.kind === "feedback"; });
        if (!feedback.length) {
          var empty = document.createElement("li");
          empty.textContent = "暂无反馈";
          feedbackListEl.appendChild(empty);
        } else {
          feedback.forEach(function (item) {
            var li = document.createElement("li");
            li.textContent = formatDateTime(item.createdAt) + " · " + ((item.meta && item.meta.note) || "反馈");
            feedbackListEl.appendChild(li);
          });
        }
      }
      if (endpointEl) {
        endpointEl.innerHTML = "";
        var endpoints = (state.snapshot && state.snapshot.settings && state.snapshot.settings.mesEndpoints) || [];
        if (!endpoints.length) {
          endpointEl.textContent = "未配置 MES 数据源";
        } else {
          endpoints.forEach(function (endpoint) {
            var row = document.createElement("div");
            row.textContent = endpoint.name + " · " + (endpoint.type || "rest");
            endpointEl.appendChild(row);
          });
        }
      }
      renderDetailChart(record);
      if (acceptBtn) {
        acceptBtn.disabled = !record.suggestionId;
      }
      if (rejectBtn) {
        rejectBtn.disabled = !record.suggestionId;
      }
    }

    function renderDetailChart(record) {
      if (!record || !chartCanvas) {
        return;
      }
      var cutoff = Date.now() - state.range * 60000;
      var streams = (state.snapshot && state.snapshot.streams) || [];
      var series = [];
      streams.forEach(function (item) {
        if (!item || item.nodeId !== record.nodeId || item.subNodeId) {
          return;
        }
        var ts = new Date(item.capturedAt).getTime();
        if (ts < cutoff) {
          return;
        }
        series.push({ capturedAt: item.capturedAt, value: item.value });
      });
      series.sort(function (a, b) { return new Date(a.capturedAt) - new Date(b.capturedAt); });
      drawSeries(chartCanvas, series, { color: "#1d4ed8" });
    }

    function exportRecords() {
      var records = filterRecords();
      if (!records.length) {
        services.toast && services.toast("暂无可导出的记录");
        return;
      }
      var rows = ["id,nodeId,nodeName,status,summary,updatedAt"]; 
      records.forEach(function (record) {
        rows.push([
          record.id,
          record.nodeId || "",
          record.nodeName || "",
          record.status,
          '"' + (record.summary || "").replace(/"/g, '""') + '"',
          formatDateTime(record.updatedAt || record.createdAt)
        ].join(","));
      });
      var blob = new Blob([rows.join("\n")], { type: "text/csv" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "trend-history.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    if (groupSelect) {
      groupSelect.addEventListener("change", function () {
        state.group = groupSelect.value;
        renderList();
        renderDetail();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.search = searchInput.value.trim();
        renderList();
        renderDetail();
      });
    }

    if (chartToolbar) {
      chartToolbar.addEventListener("click", function (evt) {
        var target = evt.target;
        if (!target || !target.getAttribute("data-range")) {
          return;
        }
        state.range = parseInt(target.getAttribute("data-range"), 10) || 180;
        renderDetailChart(findRecordById(state.selectedId));
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", exportRecords);
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (window.confirm("确定清理全部历史记录？")) {
          services.clearHistory({});
        }
      });
    }

    if (acceptBtn) {
      acceptBtn.addEventListener("click", function () {
        var record = findRecordById(state.selectedId);
        if (!record || !record.suggestionId) {
          return;
        }
        services.acceptSuggestion(record.suggestionId, "档案中心采纳");
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener("click", function () {
        var record = findRecordById(state.selectedId);
        if (!record || !record.suggestionId) {
          return;
        }
        services.rejectSuggestion(record.suggestionId, "档案中心拒绝");
      });
    }

    if (services.subscribe) {
      state.unsubscribe = services.subscribe(syncSnapshot);
    }
    syncSnapshot(state.snapshot);
  }

  window.AIToolsTrendHistory = { mount: mount };
})();
