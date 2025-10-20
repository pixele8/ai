(function () {
  var GROUP_ALL = "all";
  var GROUP_UNGROUPED = "__ungrouped";
  var api = null;
  var unsubscribe = null;
  var currentSnapshot = { history: [], groups: [], corrections: [] };
  var groupList = null;
  var resultsContainer = null;
  var emptyState = null;
  var searchInput = null;
  var groupSelect = null;
  var importBtn = null;
  var importInput = null;
  var exportBtn = null;
  var activeGroup = GROUP_ALL;
  var searchTerm = "";
  var previewCanvas = null;

  function mount(env) {
    api = env || {};
    groupList = document.getElementById("visionHistoryGroupList");
    resultsContainer = document.getElementById("visionHistoryResults");
    emptyState = document.getElementById("visionHistoryEmpty");
    searchInput = document.getElementById("visionHistorySearchInput");
    groupSelect = document.getElementById("visionHistoryGroupFilter");
    importBtn = document.getElementById("visionHistoryImportBtn");
    importInput = document.getElementById("visionHistoryImportInput");
    exportBtn = document.getElementById("visionHistoryExportBtn");
    previewCanvas = document.createElement("canvas");

    bindEvents();
    var snapshot = typeof api.getSnapshot === "function" ? api.getSnapshot() : null;
    handleSnapshot(snapshot);
    if (typeof api.subscribe === "function") {
      unsubscribe = api.subscribe(handleSnapshot);
    }
  }

  function bindEvents() {
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        searchTerm = (searchInput.value || "").trim().toLowerCase();
        renderResults();
      });
    }
    if (groupSelect) {
      groupSelect.addEventListener("change", function () {
        setActiveGroup(groupSelect.value || GROUP_ALL);
      });
    }
    if (importBtn && importInput) {
      importBtn.addEventListener("click", function () {
        importInput.click();
      });
      importInput.addEventListener("change", handleImport);
    }
    if (exportBtn) {
      exportBtn.addEventListener("click", handleExportFiltered);
    }
  }

  function handleSnapshot(snapshot) {
    if (!snapshot) {
      currentSnapshot = { history: [], groups: [], corrections: [] };
    } else {
      currentSnapshot = snapshot;
    }
    renderGroups();
    renderResults();
  }

  function collectGroupStats() {
    var counts = {};
    var configured = Array.isArray(currentSnapshot.groups) ? currentSnapshot.groups.slice() : [];
    for (var i = 0; i < configured.length; i += 1) {
      counts[configured[i]] = 0;
    }
    var ungrouped = 0;
    var history = Array.isArray(currentSnapshot.history) ? currentSnapshot.history : [];
    for (var h = 0; h < history.length; h += 1) {
      var inference = history[h];
      var groups = getInferenceGroups(inference);
      if (groups.length === 0) {
        ungrouped += 1;
        continue;
      }
      for (var g = 0; g < groups.length; g += 1) {
        var name = groups[g];
        if (!counts[name]) {
          counts[name] = 0;
        }
        counts[name] += 1;
      }
    }
    return { total: history.length, counts: counts, ungrouped: ungrouped };
  }

  function renderGroups() {
    if (!groupList && !groupSelect) {
      return;
    }
    var stats = collectGroupStats();
    var groups = Object.keys(stats.counts).sort(function (a, b) {
      return a.localeCompare(b, "zh-Hans-CN");
    });
    if (groupList) {
      groupList.innerHTML = "";
      appendGroupButton({ id: GROUP_ALL, name: "全部记录", count: stats.total });
      for (var i = 0; i < groups.length; i += 1) {
        appendGroupButton({ id: groups[i], name: groups[i], count: stats.counts[groups[i]] });
      }
      appendGroupButton({ id: GROUP_UNGROUPED, name: "未分组", count: stats.ungrouped });
    }
    if (groupSelect) {
      groupSelect.innerHTML = "";
      groupSelect.appendChild(buildOption(GROUP_ALL, "全部分组"));
      for (var j = 0; j < groups.length; j += 1) {
        groupSelect.appendChild(buildOption(groups[j], groups[j] + " (" + stats.counts[groups[j]] + ")"));
      }
      groupSelect.appendChild(buildOption(GROUP_UNGROUPED, "未分组"));
      if (!stats.counts[activeGroup] && activeGroup !== GROUP_ALL && activeGroup !== GROUP_UNGROUPED) {
        activeGroup = GROUP_ALL;
      }
      groupSelect.value = activeGroup;
    }
    highlightActiveGroup();
  }

  function buildOption(value, label) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function appendGroupButton(item) {
    if (!groupList) {
      return;
    }
    var button = document.createElement("button");
    button.type = "button";
    button.className = "vision-history-group" + (activeGroup === item.id ? " active" : "");
    button.setAttribute("data-group", item.id);
    button.textContent = item.name;
    var count = document.createElement("span");
    count.className = "group-count";
    count.textContent = item.count;
    button.appendChild(count);
    button.addEventListener("click", function () {
      setActiveGroup(item.id);
    });
    groupList.appendChild(button);
  }

  function setActiveGroup(groupId) {
    activeGroup = groupId || GROUP_ALL;
    if (groupSelect) {
      groupSelect.value = activeGroup;
    }
    highlightActiveGroup();
    renderResults();
  }

  function highlightActiveGroup() {
    if (!groupList) {
      return;
    }
    var buttons = groupList.querySelectorAll(".vision-history-group");
    for (var i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      if (btn.getAttribute("data-group") === activeGroup) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }

  function getFilteredRecords() {
    var list = Array.isArray(currentSnapshot.history) ? currentSnapshot.history : [];
    var filtered = [];
    var term = searchTerm;
    for (var i = 0; i < list.length; i += 1) {
      var record = list[i];
      if (!matchesGroup(record)) {
        continue;
      }
      if (term && term.length > 0 && !matchesSearch(record, term)) {
        continue;
      }
      filtered.push(record);
    }
    return filtered;
  }

  function matchesGroup(record) {
    if (activeGroup === GROUP_ALL) {
      return true;
    }
    var groups = getInferenceGroups(record);
    if (activeGroup === GROUP_UNGROUPED) {
      return groups.length === 0;
    }
    return groups.indexOf(activeGroup) !== -1;
  }

  function matchesSearch(record, term) {
    var haystack = [];
    if (record.summary && record.summary.dominantType) {
      haystack.push(String(record.summary.dominantType));
    }
    if (record.notes) {
      haystack.push(record.notes);
    }
    haystack = haystack.concat(getInferenceGroups(record));
    if (record.runAt) {
      haystack.push(formatDateTime(record.runAt));
    }
    if (record.findings && Array.isArray(record.findings)) {
      for (var i = 0; i < record.findings.length; i += 1) {
        var finding = record.findings[i];
        if (finding.type) {
          haystack.push(finding.type);
        }
        if (finding.notes) {
          haystack.push(finding.notes);
        }
      }
    }
    var joined = haystack.join(" ").toLowerCase();
    return joined.indexOf(term) !== -1;
  }

  function renderResults() {
    if (!resultsContainer) {
      return;
    }
    var records = getFilteredRecords();
    resultsContainer.innerHTML = "";
    if (!records || records.length === 0) {
      if (emptyState) {
        emptyState.classList.remove("hidden");
      }
      return;
    }
    if (emptyState) {
      emptyState.classList.add("hidden");
    }
    for (var i = 0; i < records.length; i += 1) {
      resultsContainer.appendChild(buildRecordCard(records[i], i));
    }
  }

  function buildRecordCard(record, index) {
    var card = document.createElement("div");
    card.className = "vision-history-card";

    var header = document.createElement("div");
    header.className = "vision-history-card-header";
    var title = document.createElement("div");
    title.className = "vision-history-card-title";
    title.textContent = (record.summary && record.summary.dominantType) ? record.summary.dominantType : "未检测到污染";
    if (typeof index === "number") {
      title.textContent = "#" + (index + 1) + " " + title.textContent;
    }
    var meta = document.createElement("div");
    meta.className = "vision-history-card-meta";
    var runtime = record.model && record.model.inferenceMs ? " · 用时 " + record.model.inferenceMs + "ms" : "";
    meta.textContent = "识别时间 " + formatDateTime(record.runAt) + runtime;
    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);

    var groups = getInferenceGroups(record);
    var tags = document.createElement("div");
    tags.className = "vision-history-tags";
    if (groups.length === 0) {
      var ungroupedTag = document.createElement("div");
      ungroupedTag.className = "vision-history-tag";
      ungroupedTag.textContent = "未分组";
      tags.appendChild(ungroupedTag);
    } else {
      for (var g = 0; g < groups.length; g += 1) {
        var tag = document.createElement("div");
        tag.className = "vision-history-tag";
        tag.textContent = groups[g];
        tags.appendChild(tag);
      }
    }
    card.appendChild(tags);

    if (record.image && record.image.dataUrl) {
      var preview = document.createElement("div");
      preview.className = "vision-history-preview";
      var img = document.createElement("img");
      img.src = record.image.dataUrl;
      img.alt = "识别图预览";
      preview.appendChild(img);
      card.appendChild(preview);
    }

    if (record.findings && record.findings.length > 0) {
      var probabilityBlock = document.createElement("div");
      probabilityBlock.className = "vision-history-probs";
      for (var f = 0; f < record.findings.length; f += 1) {
        probabilityBlock.appendChild(buildFindingSummary(record.findings[f]));
      }
      card.appendChild(probabilityBlock);
    }

    var noteWrap = document.createElement("div");
    noteWrap.className = "vision-history-note";
    var noteLabel = document.createElement("label");
    noteLabel.textContent = "备注";
    var noteArea = document.createElement("textarea");
    noteArea.value = record.notes || "";
    noteLabel.appendChild(noteArea);
    noteWrap.appendChild(noteLabel);
    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary-button";
    saveBtn.textContent = "保存备注";
    saveBtn.addEventListener("click", function () {
      saveNote(record.id, noteArea.value);
    });
    var noteActions = document.createElement("div");
    noteActions.className = "vision-history-card-actions";
    noteActions.appendChild(saveBtn);
    noteWrap.appendChild(noteActions);
    card.appendChild(noteWrap);

    var actions = document.createElement("div");
    actions.className = "vision-history-card-actions";
    var openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "ghost-button";
    openBtn.textContent = "在工作台查看";
    openBtn.addEventListener("click", function () {
      window.location.href = "ai-vision.html?inference=" + encodeURIComponent(record.id);
    });
    var exportImageBtn = document.createElement("button");
    exportImageBtn.type = "button";
    exportImageBtn.className = "ghost-button";
    exportImageBtn.textContent = "导出标注图";
    exportImageBtn.addEventListener("click", function () {
      exportAnnotatedImage(record);
    });
    var exportJsonBtn = document.createElement("button");
    exportJsonBtn.type = "button";
    exportJsonBtn.className = "ghost-button";
    exportJsonBtn.textContent = "导出 JSON";
    exportJsonBtn.addEventListener("click", function () {
      exportRecordJson(record);
    });
    actions.appendChild(openBtn);
    actions.appendChild(exportImageBtn);
    actions.appendChild(exportJsonBtn);
    card.appendChild(actions);

    return card;
  }

  function buildFindingSummary(finding) {
    var block = document.createElement("div");
    block.className = "vision-history-prob";
    var title = document.createElement("strong");
    title.textContent = finding.type + " " + percent(finding.probability);
    block.appendChild(title);
    if (finding.group) {
      var groupLabel = document.createElement("span");
      groupLabel.textContent = "分组：" + finding.group;
      block.appendChild(groupLabel);
    }
    var breakdown = document.createElement("span");
    breakdown.textContent = buildProbabilityBreakdown(finding);
    block.appendChild(breakdown);
    return block;
  }

  function buildProbabilityBreakdown(finding) {
    if (!finding || !finding.probabilities) {
      return "未提供概率分布";
    }
    var pairs = [];
    for (var key in finding.probabilities) {
      if (finding.probabilities.hasOwnProperty(key)) {
        pairs.push({ type: key, score: finding.probabilities[key] });
      }
    }
    pairs.sort(function (a, b) {
      return b.score - a.score;
    });
    if (pairs.length === 0) {
      return "未提供概率分布";
    }
    var top = pairs.slice(0, 3);
    var summary = [];
    for (var i = 0; i < top.length; i += 1) {
      summary.push(top[i].type + " " + percent(top[i].score));
    }
    return summary.join(" · ");
  }

  function saveNote(inferenceId, value) {
    if (!api || typeof api.updateInference !== "function") {
      return;
    }
    api.updateInference(inferenceId, {
      notes: value || "",
      updatedAt: new Date().toISOString()
    });
    notify("备注已保存");
  }

  function exportAnnotatedImage(record) {
    if (!record || !record.image || !record.image.dataUrl) {
      notify("该记录没有图像可导出");
      return;
    }
    var image = new Image();
    image.onload = function () {
      previewCanvas.width = record.image.width || image.width;
      previewCanvas.height = record.image.height || image.height;
      var context = previewCanvas.getContext("2d");
      context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      context.drawImage(image, 0, 0, previewCanvas.width, previewCanvas.height);
      if (record.findings && record.findings.length > 0) {
        context.lineWidth = 2;
        context.font = "bold 14px 'Microsoft YaHei',sans-serif";
        for (var i = 0; i < record.findings.length; i += 1) {
          var item = record.findings[i];
          if (!item.bounds) {
            continue;
          }
          context.strokeStyle = "rgba(79,111,217,0.9)";
          context.fillStyle = "rgba(79,111,217,0.2)";
          context.beginPath();
          context.rect(item.bounds.x, item.bounds.y, item.bounds.width, item.bounds.height);
          context.fill();
          context.stroke();
          context.fillStyle = "rgba(15,23,42,0.9)";
          context.fillText(item.type + " " + percent(item.probability), item.bounds.x + 8, item.bounds.y + 20);
        }
      }
      var iso = new Date().toISOString();
      var fileName = (record.image && record.image.name ? record.image.name.replace(/\.[^.]+$/, "") + "-" : "ThermoClean-") + iso.replace(/[-:TZ.]/g, "").slice(0, 14) + ".png";
      var link = document.createElement("a");
      link.href = previewCanvas.toDataURL("image/png");
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notify("已导出标注图");
    };
    image.onerror = function () {
      notify("图像数据无效，无法导出");
    };
    image.src = record.image.dataUrl;
  }

  function exportRecordJson(record) {
    if (!record) {
      return;
    }
    var payload = {
      exportedAt: new Date().toISOString(),
      record: record
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    var baseName = record.image && record.image.name ? record.image.name.replace(/\.[^.]+$/, "") : record.id;
    link.href = url;
    link.download = baseName + "-thermoclean.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify("已导出 JSON");
  }

  function handleExportFiltered() {
    var records = getFilteredRecords();
    if (!records || records.length === 0) {
      notify("当前筛选下没有可导出的记录");
      return;
    }
    var payload = {
      exportedAt: new Date().toISOString(),
      total: records.length,
      records: records
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "ThermoClean-history-" + payload.exportedAt.replace(/[-:TZ.]/g, "").slice(0, 14) + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify("已导出当前筛选记录");
  }

  function handleImport(evt) {
    if (!importInput || !importInput.files || importInput.files.length === 0) {
      return;
    }
    var file = importInput.files[0];
    importInput.value = "";
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (api && typeof api.importRecords === "function") {
          var result = api.importRecords(data) || { imported: 0, total: 0 };
          notify("已导入 " + result.imported + " 条记录");
        }
      } catch (err) {
        console.error("vision history import error", err);
        notify("导入失败：数据格式不正确");
      }
    };
    reader.onerror = function () {
      notify("读取导入文件失败");
    };
    reader.readAsText(file, "utf-8");
  }

  function getInferenceGroups(record) {
    if (!record || !record.findings || !Array.isArray(record.findings)) {
      return [];
    }
    var groups = [];
    for (var i = 0; i < record.findings.length; i += 1) {
      var group = record.findings[i].group;
      if (!group) {
        continue;
      }
      if (groups.indexOf(group) === -1) {
        groups.push(group);
      }
    }
    return groups;
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
      var month = pad(date.getMonth() + 1);
      var day = pad(date.getDate());
      var hour = pad(date.getHours());
      var minute = pad(date.getMinutes());
      var second = pad(date.getSeconds());
      return year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
    } catch (err) {
      return value;
    }
  }

  function pad(num) {
    return num < 10 ? "0" + num : String(num);
  }

  function percent(value) {
    var val = typeof value === "number" ? value : 0;
    if (val < 0) {
      val = 0;
    }
    if (val > 1) {
      val = 1;
    }
    return Math.round(val * 100) + "%";
  }

  function notify(message) {
    if (api && typeof api.toast === "function") {
      api.toast(message);
    } else {
      console.log(message);
    }
  }

  window.AIToolsVisionHistory = {
    mount: mount
  };
})();
