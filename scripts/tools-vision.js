(function () {
  var api = null;
  var unsubscribe = null;
  var activeInferenceId = null;
  var currentSnapshot = { history: [], groups: [], corrections: [] };
  var dropzone = null;
  var placeholder = null;
  var canvas = null;
  var ctx = null;
  var overlay = null;
  var resultsContainer = null;
  var summaryContainer = null;
  var historyPanel = null;
  var historyList = null;
  var historyToggle = null;
  var fileInput = null;
  var uploadButton = null;
  var draggingTimer = null;

  function makeId(prefix) {
    var base = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    if (!prefix) {
      return base;
    }
    return prefix + "-" + base;
  }

  function clamp(value, min, max) {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
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
    var pct = clamp(Math.round(val * 100), 0, 100);
    return pct + "%";
  }

  function notify(message) {
    if (api && typeof api.toast === "function") {
      api.toast(message);
    } else {
      console.log(message);
    }
  }

  function mount(env) {
    api = env || {};
    dropzone = document.getElementById("visionUpload");
    placeholder = document.getElementById("visionPlaceholder");
    canvas = document.getElementById("visionCanvas");
    overlay = document.getElementById("visionOverlay");
    resultsContainer = document.getElementById("visionFindings");
    summaryContainer = document.getElementById("visionSummary");
    historyPanel = document.getElementById("visionHistory");
    historyList = document.getElementById("visionHistoryList");
    historyToggle = document.getElementById("visionHistoryToggle");
    fileInput = document.getElementById("visionFileInput");
    uploadButton = document.getElementById("visionUploadBtn");

    if (!dropzone || !canvas || !overlay || !resultsContainer) {
      return;
    }
    ctx = canvas.getContext("2d");
    bindEvents();
    renderEmptyState();
    if (typeof api.subscribe === "function") {
      unsubscribe = api.subscribe(handleSnapshot);
    } else if (typeof api.getSnapshot === "function") {
      handleSnapshot(api.getSnapshot());
    }
  }

  function bindEvents() {
    dropzone.addEventListener("paste", handlePaste);
    dropzone.addEventListener("click", function () {
      if (fileInput) {
        fileInput.click();
      }
    });
    dropzone.addEventListener("dragenter", function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      dropzone.classList.add("dragging");
    });
    dropzone.addEventListener("dragover", function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
    });
    dropzone.addEventListener("dragleave", function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      scheduleDragReset();
    });
    dropzone.addEventListener("drop", handleDrop);
    document.addEventListener("paste", handleGlobalPaste);
    if (fileInput) {
      fileInput.addEventListener("change", function (evt) {
        evt.preventDefault();
        if (!fileInput.files || fileInput.files.length === 0) {
          return;
        }
        processFile(fileInput.files[0]);
        fileInput.value = "";
      });
    }
    if (uploadButton) {
      uploadButton.addEventListener("click", function (evt) {
        evt.preventDefault();
        if (fileInput) {
          fileInput.click();
        }
      });
    }
    if (historyToggle && historyPanel) {
      historyToggle.addEventListener("click", function (evt) {
        evt.preventDefault();
        historyPanel.classList.toggle("hidden");
        if (!historyPanel.classList.contains("hidden")) {
          historyToggle.textContent = "收起";
        } else {
          historyToggle.textContent = "历史";
        }
      });
    }
  }

  function scheduleDragReset() {
    if (draggingTimer) {
      window.clearTimeout(draggingTimer);
    }
    draggingTimer = window.setTimeout(function () {
      dropzone.classList.remove("dragging");
      draggingTimer = null;
    }, 160);
  }

  function handleSnapshot(snapshot) {
    if (!snapshot) {
      currentSnapshot = { history: [], groups: [], corrections: [] };
    } else {
      currentSnapshot = snapshot;
      if (!currentSnapshot.history) {
        currentSnapshot.history = [];
      }
      if (!currentSnapshot.groups) {
        currentSnapshot.groups = [];
      }
      if (!currentSnapshot.corrections) {
        currentSnapshot.corrections = [];
      }
    }
    if (currentSnapshot.history.length === 0) {
      activeInferenceId = null;
    } else if (activeInferenceId) {
      var found = false;
      for (var i = 0; i < currentSnapshot.history.length; i += 1) {
        if (currentSnapshot.history[i].id === activeInferenceId) {
          found = true;
          break;
        }
      }
      if (!found) {
        activeInferenceId = currentSnapshot.history[0].id;
      }
    } else {
      activeInferenceId = currentSnapshot.history[0].id;
    }
    renderHistory();
    renderActiveInference();
  }

  function renderEmptyState() {
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="vision-empty">尚未识别任何热脏污区域。请粘贴或上传图像开始分析。</div>';
    }
    if (summaryContainer) {
      summaryContainer.innerHTML = '<div class="vision-summary-status">待命</div><div class="vision-summary-meta">等待图像输入</div>';
    }
  }

  function handlePaste(evt) {
    evt.preventDefault();
    var file = extractImage(evt.clipboardData);
    if (file) {
      processFile(file);
    } else {
      notify("剪贴板中未找到图像数据");
    }
  }

  function handleGlobalPaste(evt) {
    var target = evt.target || evt.srcElement;
    if (!target) {
      return;
    }
    var tag = target.tagName ? target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || target.isContentEditable) {
      return;
    }
    var file = extractImage(evt.clipboardData);
    if (file) {
      evt.preventDefault();
      processFile(file);
    }
  }

  function handleDrop(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    dropzone.classList.remove("dragging");
    if (!evt.dataTransfer || !evt.dataTransfer.files) {
      notify("未检测到有效的文件");
      return;
    }
    if (evt.dataTransfer.files.length === 0) {
      notify("未检测到有效的文件");
      return;
    }
    processFile(evt.dataTransfer.files[0]);
  }

  function extractImage(dataTransfer) {
    if (!dataTransfer) {
      return null;
    }
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      var file = dataTransfer.files[0];
      if (isImage(file)) {
        return file;
      }
      return null;
    }
    if (dataTransfer.items && dataTransfer.items.length > 0) {
      for (var i = 0; i < dataTransfer.items.length; i += 1) {
        var item = dataTransfer.items[i];
        if (item.kind === "file") {
          var blob = item.getAsFile();
          if (blob && isImage(blob)) {
            return blob;
          }
        }
      }
    }
    return null;
  }

  function isImage(file) {
    if (!file || !file.type) {
      return false;
    }
    var type = file.type.toLowerCase();
    return type.indexOf("image/png") === 0 || type.indexOf("image/jpeg") === 0 || type.indexOf("image/jpg") === 0 || type.indexOf("image/webp") === 0;
  }

  function processFile(file) {
    if (!file) {
      return;
    }
    if (!isImage(file)) {
      notify("仅支持 PNG、JPG、WEBP 图像");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      processImage(reader.result, file.name || file.type);
    };
    reader.onerror = function () {
      notify("读取图像失败");
    };
    reader.readAsDataURL(file);
  }

  function processImage(dataUrl, name) {
    var image = new Image();
    image.onload = function () {
      var dimensions = fitSize(image.width, image.height, 1024, 640);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
      if (placeholder) {
        placeholder.classList.add("hidden");
      }
      canvas.classList.remove("hidden");
      overlay.classList.remove("hidden");
      clearOverlay();
      var start = now();
      var analysis = analyzeCanvas(dimensions.width, dimensions.height, currentSnapshot.corrections);
      var elapsed = now() - start;
      var bank = null;
      if (api && typeof api.getActiveBank === "function") {
        bank = api.getActiveBank();
      }
      var runAt = new Date().toISOString();
      var inference = {
        id: makeId("infer"),
        runAt: runAt,
        analyst: getCurrentUser(),
        bankId: bank ? bank.id : null,
        bankName: bank ? bank.name : "",
        model: {
          name: "虹小聊·ThermoClean",
          version: "1.0",
          inferenceMs: Math.round(elapsed),
          source: name || "clipboard"
        },
        image: {
          dataUrl: dataUrl,
          width: dimensions.width,
          height: dimensions.height,
          originalWidth: image.width,
          originalHeight: image.height,
          name: name || "clipboard"
        },
        findings: analysis.findings,
        summary: analysis.summary
      };
      var stored = inference;
      if (api && typeof api.recordInference === "function") {
        stored = api.recordInference(inference) || inference;
      }
      activeInferenceId = stored && stored.id ? stored.id : inference.id;
      if (api && typeof api.getSnapshot === "function") {
        handleSnapshot(api.getSnapshot());
      } else {
        drawInference(stored);
        renderFindings(stored);
        updateSummary(stored, analysis.summary);
      }
      notify("已完成 AI 识别");
    };
    image.onerror = function () {
      notify("无法解析图像数据");
    };
    image.src = dataUrl;
  }

  function now() {
    if (window.performance && typeof window.performance.now === "function") {
      return window.performance.now();
    }
    return Date.now();
  }

  function getCurrentUser() {
    if (!api || typeof api.getUser !== "function") {
      return "";
    }
    var user = api.getUser();
    if (!user || !user.username) {
      return "";
    }
    return user.username;
  }

  function fitSize(width, height, maxWidth, maxHeight) {
    var ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio)
    };
  }

  function analyzeCanvas(width, height, corrections) {
    var data = ctx.getImageData(0, 0, width, height).data;
    var cell = Math.max(18, Math.round(Math.min(width, height) / 24));
    var cols = Math.ceil(width / cell);
    var rows = Math.ceil(height / cell);
    var cells = [];
    var heatValues = [];
    var maxHeat = 0;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var x = c * cell;
        var y = r * cell;
        var sample = sampleHeat(data, width, height, x, y, cell);
        cells.push({ col: c, row: r, heat: sample.heat, weight: sample.weight });
        heatValues.push(sample.heat);
        if (sample.heat > maxHeat) {
          maxHeat = sample.heat;
        }
      }
    }
    var stats = computeStats(heatValues);
    var threshold = stats.mean + stats.std * 0.65;
    if (threshold < stats.mean * 1.2) {
      threshold = stats.mean * 1.2;
    }
    if (threshold > maxHeat * 0.92) {
      threshold = maxHeat * 0.92;
    }
    var hotCells = [];
    for (var i = 0; i < cells.length; i += 1) {
      if (cells[i].heat >= threshold) {
        hotCells.push(cells[i]);
      }
    }
    var clusters = buildClusters(hotCells, cell, cols, rows, width, height);
    var findings = [];
    var summary = {
      clusters: clusters.length,
      dominantType: "",
      runAt: new Date().toISOString()
    };
    var typeCount = {};
    for (var j = 0; j < clusters.length; j += 1) {
      var cluster = clusters[j];
      var features = buildFeatures(cluster, width, height, maxHeat);
      var classification = classifyCluster(features, corrections);
      var finding = {
        id: makeId("finding"),
        type: classification.type,
        probability: classification.score,
        group: null,
        status: "auto",
        bounds: cluster.bounds,
        metrics: {
          areaRatio: features.areaRatio,
          heatScore: features.heatScore,
          aspectRatio: features.aspectRatio,
          coverage: cluster.cells.length
        },
        probabilities: classification.all,
        notes: "",
        createdAt: summary.runAt
      };
      findings.push(finding);
      if (!typeCount[classification.type]) {
        typeCount[classification.type] = 0;
      }
      typeCount[classification.type] += 1;
    }
    var dominant = "";
    var dominantCount = 0;
    for (var key in typeCount) {
      if (typeCount.hasOwnProperty(key) && typeCount[key] > dominantCount) {
        dominantCount = typeCount[key];
        dominant = key;
      }
    }
    summary.dominantType = dominant;
    return { findings: findings, summary: summary };
  }

  function sampleHeat(data, width, height, x, y, size) {
    var stepX = Math.max(1, Math.floor(size / 12));
    var stepY = Math.max(1, Math.floor(size / 12));
    var total = 0;
    var weight = 0;
    for (var offsetY = 0; offsetY < size && (y + offsetY) < height; offsetY += stepY) {
      for (var offsetX = 0; offsetX < size && (x + offsetX) < width; offsetX += stepX) {
        var px = x + offsetX;
        var py = y + offsetY;
        var index = (py * width + px) * 4;
        var r = data[index];
        var g = data[index + 1];
        var b = data[index + 2];
        var heat = r - (g + b) * 0.45;
        if (heat < 0) {
          heat = 0;
        }
        total += heat;
        weight += 1;
      }
    }
    if (weight === 0) {
      return { heat: 0, weight: 0 };
    }
    return { heat: total / weight, weight: weight };
  }

  function computeStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, std: 0 };
    }
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) {
      sum += values[i];
    }
    var mean = sum / values.length;
    var variance = 0;
    for (var j = 0; j < values.length; j += 1) {
      var diff = values[j] - mean;
      variance += diff * diff;
    }
    variance = variance / values.length;
    return { mean: mean, std: Math.sqrt(variance) };
  }

  function buildClusters(cells, cellSize, cols, rows, width, height) {
    var visited = {};
    var clusters = [];
    for (var i = 0; i < cells.length; i += 1) {
      var key = cells[i].row + ":" + cells[i].col;
      if (visited[key]) {
        continue;
      }
      var queue = [cells[i]];
      visited[key] = true;
      var clusterCells = [];
      while (queue.length > 0) {
        var current = queue.pop();
        clusterCells.push(current);
        for (var r = current.row - 1; r <= current.row + 1; r += 1) {
          if (r < 0 || r >= rows) {
            continue;
          }
          for (var c = current.col - 1; c <= current.col + 1; c += 1) {
            if (c < 0 || c >= cols) {
              continue;
            }
            var neighborKey = r + ":" + c;
            if (visited[neighborKey]) {
              continue;
            }
            for (var j = 0; j < cells.length; j += 1) {
              if (cells[j].row === r && cells[j].col === c) {
                visited[neighborKey] = true;
                queue.push(cells[j]);
                break;
              }
            }
          }
        }
      }
      if (clusterCells.length === 0) {
        continue;
      }
      var bounds = computeBounds(clusterCells, cellSize, width, height);
      clusters.push({ cells: clusterCells, bounds: bounds });
    }
    return clusters;
  }

  function computeBounds(cells, cellSize, width, height) {
    var minX = width;
    var minY = height;
    var maxX = 0;
    var maxY = 0;
    for (var i = 0; i < cells.length; i += 1) {
      var cell = cells[i];
      var left = cell.col * cellSize;
      var top = cell.row * cellSize;
      var right = Math.min(width, left + cellSize);
      var bottom = Math.min(height, top + cellSize);
      if (left < minX) {
        minX = left;
      }
      if (top < minY) {
        minY = top;
      }
      if (right > maxX) {
        maxX = right;
      }
      if (bottom > maxY) {
        maxY = bottom;
      }
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(12, maxX - minX),
      height: Math.max(12, maxY - minY)
    };
  }

  function buildFeatures(cluster, width, height, maxHeat) {
    var area = (cluster.bounds.width * cluster.bounds.height) / (width * height);
    var heatSum = 0;
    for (var i = 0; i < cluster.cells.length; i += 1) {
      heatSum += cluster.cells[i].heat;
    }
    var heatAvg = cluster.cells.length > 0 ? heatSum / cluster.cells.length : 0;
    var aspect = cluster.bounds.width > cluster.bounds.height ? cluster.bounds.width / cluster.bounds.height : cluster.bounds.height / cluster.bounds.width;
    if (!isFinite(aspect) || aspect < 1) {
      aspect = 1;
    }
    return {
      areaRatio: clamp(area, 0, 1),
      heatScore: maxHeat > 0 ? clamp(heatAvg / maxHeat, 0, 1) : 0,
      aspectRatio: clamp(aspect, 1, 8)
    };
  }

  function classifyCluster(features, corrections) {
    var base = {
      "热斑污染": features.areaRatio * 0.65 + features.heatScore * 0.45,
      "线状污染": Math.min(1, features.aspectRatio / 3) * 0.7 + features.heatScore * 0.35 + features.areaRatio * 0.1,
      "颗粒污染": (1 - features.areaRatio) * 0.45 + (1 - Math.min(1, features.aspectRatio / 2)) * 0.35 + features.heatScore * 0.2
    };
    if (corrections && corrections.length) {
      for (var i = 0; i < corrections.length; i += 1) {
        var corr = corrections[i];
        var areaDiff = Math.abs((corr.areaRatio || 0) - features.areaRatio);
        var heatDiff = Math.abs((corr.heatScore || 0) - features.heatScore);
        var weight = Math.exp(-((areaDiff / 0.12) * (areaDiff / 0.12) + (heatDiff / 0.18) * (heatDiff / 0.18)));
        if (weight < 0.05) {
          continue;
        }
        if (corr.targetType && typeof base[corr.targetType] === "number") {
          base[corr.targetType] += weight * 0.6;
        }
        if (corr.previousType && typeof base[corr.previousType] === "number") {
          base[corr.previousType] -= weight * 0.25;
        }
      }
    }
    var total = 0;
    var keys = [];
    for (var key in base) {
      if (base.hasOwnProperty(key)) {
        var score = base[key];
        if (score < 0.01) {
          score = 0.01;
        }
        base[key] = score;
        total += score;
        keys.push(key);
      }
    }
    var probabilities = {};
    var bestType = keys.length > 0 ? keys[0] : "热斑污染";
    var bestScore = 0;
    for (var j = 0; j < keys.length; j += 1) {
      var name = keys[j];
      var probability = total > 0 ? base[name] / total : 1 / keys.length;
      probabilities[name] = probability;
      if (probability > bestScore) {
        bestScore = probability;
        bestType = name;
      }
    }
    return { type: bestType, score: clamp(bestScore, 0, 1), all: probabilities };
  }

  function renderActiveInference() {
    if (!currentSnapshot || !currentSnapshot.history || currentSnapshot.history.length === 0) {
      renderEmptyState();
      clearOverlay();
      return;
    }
    var inference = null;
    for (var i = 0; i < currentSnapshot.history.length; i += 1) {
      if (currentSnapshot.history[i].id === activeInferenceId) {
        inference = currentSnapshot.history[i];
        break;
      }
    }
    if (!inference) {
      inference = currentSnapshot.history[0];
      activeInferenceId = inference.id;
    }
    drawInference(inference);
    renderFindings(inference);
    updateSummary(inference, inference.summary || null);
  }

  function drawInference(inference) {
    if (!inference || !inference.image || !inference.image.dataUrl) {
      return;
    }
    var image = new Image();
    image.onload = function () {
      canvas.width = inference.image.width || image.width;
      canvas.height = inference.image.height || image.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.classList.remove("hidden");
      overlay.classList.remove("hidden");
      if (placeholder) {
        placeholder.classList.add("hidden");
      }
      clearOverlay();
      if (inference.findings) {
        for (var i = 0; i < inference.findings.length; i += 1) {
          renderOverlayBox(inference.findings[i]);
        }
      }
    };
    image.src = inference.image.dataUrl;
  }

  function clearOverlay() {
    if (!overlay) {
      return;
    }
    overlay.innerHTML = "";
  }

  function renderOverlayBox(finding) {
    if (!overlay || !finding || !finding.bounds) {
      return;
    }
    var box = document.createElement("div");
    box.className = "overlay-box";
    box.style.left = finding.bounds.x + "px";
    box.style.top = finding.bounds.y + "px";
    box.style.width = finding.bounds.width + "px";
    box.style.height = finding.bounds.height + "px";
    var label = document.createElement("div");
    label.textContent = finding.type;
    var score = document.createElement("span");
    score.className = "overlay-score";
    score.textContent = "置信度 " + percent(finding.probability);
    box.appendChild(label);
    box.appendChild(score);
    overlay.appendChild(box);
  }

  function renderFindings(inference) {
    if (!resultsContainer) {
      return;
    }
    resultsContainer.innerHTML = "";
    if (!inference || !inference.findings || inference.findings.length === 0) {
      resultsContainer.innerHTML = '<div class="vision-empty">模型未检测到显著的热脏污区域。</div>';
      return;
    }
    for (var i = 0; i < inference.findings.length; i += 1) {
      resultsContainer.appendChild(buildFindingCard(inference, inference.findings[i], i));
    }
  }

  function buildFindingCard(inference, finding, index) {
    var card = document.createElement("div");
    card.className = "vision-card";
    card.setAttribute("data-status", finding.status || "auto");
    var header = document.createElement("div");
    header.className = "vision-card-header";
    var titleWrap = document.createElement("div");
    var title = document.createElement("div");
    title.className = "vision-card-title";
    title.textContent = "#" + (index + 1) + " " + finding.type;
    var meta = document.createElement("div");
    meta.className = "vision-card-meta";
    meta.textContent = "识别时间 " + formatDateTime(inference.runAt);
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    var badge = document.createElement("div");
    badge.className = "vision-chip";
    badge.textContent = finding.status === "corrected" ? "已订正" : (finding.status === "validated" ? "已确认" : "自动判定");
    header.appendChild(titleWrap);
    header.appendChild(badge);

    var probability = document.createElement("div");
    probability.className = "vision-probability";
    var bar = document.createElement("div");
    bar.className = "vision-probability-bar";
    var fill = document.createElement("div");
    fill.className = "vision-probability-fill";
    fill.style.width = percent(finding.probability);
    bar.appendChild(fill);
    var probText = document.createElement("div");
    probText.className = "vision-probability-text";
    probText.innerHTML = '<span>可信度</span>' + percent(finding.probability);
    probability.appendChild(bar);
    probability.appendChild(probText);

    var body = document.createElement("div");
    body.className = "vision-card-body";

    var groupLabel = document.createElement("label");
    groupLabel.textContent = "分组";
    var groupSelect = document.createElement("select");
    populateGroupOptions(groupSelect, finding.group);
    groupSelect.addEventListener("change", function () {
      var value = groupSelect.value;
      var patch = {
        group: value || null,
        groupAssignedBy: getCurrentUser(),
        groupAssignedAt: new Date().toISOString()
      };
      if (api && typeof api.updateFinding === "function") {
        api.updateFinding(inference.id, finding.id, patch);
      }
    });
    groupLabel.appendChild(groupSelect);
    body.appendChild(groupLabel);

    var typeLabel = document.createElement("label");
    typeLabel.textContent = "订正类型";
    var typeSelect = document.createElement("select");
    populateTypeOptions(typeSelect, finding);
    typeSelect.value = finding.type;
    typeLabel.appendChild(typeSelect);
    body.appendChild(typeLabel);

    var confidenceLabel = document.createElement("label");
    confidenceLabel.textContent = "订正置信度 (0-100%)";
    var confidenceInput = document.createElement("input");
    confidenceInput.type = "number";
    confidenceInput.min = "0";
    confidenceInput.max = "100";
    confidenceInput.value = Math.round(finding.probability * 100);
    confidenceLabel.appendChild(confidenceInput);
    body.appendChild(confidenceLabel);

    var noteLabel = document.createElement("label");
    noteLabel.textContent = "订正备注";
    var noteInput = document.createElement("textarea");
    noteInput.value = finding.notes || "";
    noteLabel.appendChild(noteInput);
    body.appendChild(noteLabel);

    var actions = document.createElement("div");
    actions.className = "vision-card-actions";
    var confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "ghost-button";
    confirmBtn.textContent = "确认 AI 判定";
    confirmBtn.addEventListener("click", function () {
      if (api && typeof api.updateFinding === "function") {
        api.updateFinding(inference.id, finding.id, {
          status: "validated",
          validatedBy: getCurrentUser(),
          validatedAt: new Date().toISOString()
        });
      }
    });
    var correctBtn = document.createElement("button");
    correctBtn.type = "button";
    correctBtn.className = "primary-button";
    correctBtn.textContent = "提交订正";
    correctBtn.addEventListener("click", function () {
      var newType = typeSelect.value;
      var newProb = parseFloat(confidenceInput.value || "0");
      if (isNaN(newProb)) {
        newProb = finding.probability * 100;
      }
      newProb = clamp(newProb / 100, 0, 1);
      var notes = noteInput.value || "";
      var patch = {
        type: newType,
        probability: newProb,
        status: "corrected",
        notes: notes,
        correctedBy: getCurrentUser(),
        correctedAt: new Date().toISOString()
      };
      if (groupSelect.value) {
        patch.group = groupSelect.value;
      }
      if (api && typeof api.updateFinding === "function") {
        api.updateFinding(inference.id, finding.id, patch);
      }
      if (api && typeof api.recordCorrection === "function") {
        api.recordCorrection({
          inferenceId: inference.id,
          findingId: finding.id,
          previousType: finding.type,
          targetType: newType,
          probability: newProb,
          areaRatio: finding.metrics ? finding.metrics.areaRatio : 0,
          heatScore: finding.metrics ? finding.metrics.heatScore : 0,
          group: patch.group || null,
          note: notes,
          correctedBy: getCurrentUser(),
          correctedAt: new Date().toISOString()
        });
      }
    });
    actions.appendChild(confirmBtn);
    actions.appendChild(correctBtn);

    card.appendChild(header);
    card.appendChild(probability);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  function populateGroupOptions(select, currentValue) {
    select.innerHTML = "";
    var option = document.createElement("option");
    option.value = "";
    option.textContent = "未分组";
    select.appendChild(option);
    var groups = currentSnapshot && currentSnapshot.groups ? currentSnapshot.groups : [];
    for (var i = 0; i < groups.length; i += 1) {
      var item = document.createElement("option");
      item.value = groups[i];
      item.textContent = groups[i];
      select.appendChild(item);
    }
    if (currentValue) {
      select.value = currentValue;
    }
  }

  function populateTypeOptions(select, finding) {
    select.innerHTML = "";
    var options = [];
    if (finding && finding.probabilities) {
      for (var key in finding.probabilities) {
        if (finding.probabilities.hasOwnProperty(key)) {
          options.push(key);
        }
      }
    }
    if (options.indexOf(finding.type) === -1) {
      options.unshift(finding.type);
    }
    var presets = ["热斑污染", "线状污染", "颗粒污染", "未知类型"];
    for (var i = 0; i < presets.length; i += 1) {
      if (options.indexOf(presets[i]) === -1) {
        options.push(presets[i]);
      }
    }
    for (var j = 0; j < options.length; j += 1) {
      var option = document.createElement("option");
      option.value = options[j];
      option.textContent = options[j];
      select.appendChild(option);
    }
  }

  function updateSummary(inference, summary) {
    if (!summaryContainer) {
      return;
    }
    if (!inference) {
      summaryContainer.innerHTML = '<div class="vision-summary-status">待命</div><div class="vision-summary-meta">等待图像输入</div>';
      return;
    }
    var typeText = summary && summary.dominantType ? summary.dominantType : (inference.findings && inference.findings.length > 0 ? inference.findings[0].type : "未检测到异常");
    var runText = formatDateTime(inference.runAt);
    summaryContainer.innerHTML = '<div class="vision-summary-status">' + typeText + '</div><div class="vision-summary-meta">识别时间 ' + runText + '</div>';
  }

  function renderHistory() {
    if (!historyList) {
      return;
    }
    historyList.innerHTML = "";
    if (!currentSnapshot.history || currentSnapshot.history.length === 0) {
      var empty = document.createElement("div");
      empty.className = "vision-empty";
      empty.textContent = "暂无识别记录";
      historyList.appendChild(empty);
      return;
    }
    for (var i = 0; i < currentSnapshot.history.length; i += 1) {
      var inference = currentSnapshot.history[i];
      historyList.appendChild(buildHistoryItem(inference));
    }
  }

  function buildHistoryItem(inference) {
    var item = document.createElement("div");
    item.className = "vision-history-item";
    var title = document.createElement("div");
    title.className = "history-title";
    var type = inference.summary && inference.summary.dominantType ? inference.summary.dominantType : (inference.findings && inference.findings.length > 0 ? inference.findings[0].type : "未检测");
    title.textContent = type;
    var meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = formatDateTime(inference.runAt);
    var actions = document.createElement("div");
    actions.className = "history-actions";
    var analyst = document.createElement("span");
    analyst.className = "history-meta";
    analyst.textContent = inference.analyst ? "分析员 " + inference.analyst : "";
    var view = document.createElement("button");
    view.type = "button";
    view.className = "ghost-button";
    view.textContent = "查看";
    view.addEventListener("click", function () {
      activeInferenceId = inference.id;
      renderActiveInference();
    });
    actions.appendChild(analyst);
    actions.appendChild(view);
    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(actions);
    return item;
  }

  window.AIToolsVision = {
    mount: mount
  };
})();
