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
  var selectionLayer = null;
  var resultsContainer = null;
  var summaryContainer = null;
  var historyPanel = null;
  var historyList = null;
  var historyToggle = null;
  var fileInput = null;
  var uploadButton = null;
  var exportButton = null;
  var addFindingButton = null;
  var noteForm = null;
  var noteInput = null;
  var historySearch = null;
  var draggingTimer = null;
  var selectionBox = null;
  var selectionMode = null;
  var selectionStart = null;
  var isSelecting = false;
  var historyFilter = "";
  var activeInference = null;
  var canvasMetrics = null;
  var resizeTimer = null;

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
    selectionLayer = document.getElementById("visionSelection");
    resultsContainer = document.getElementById("visionFindings");
    summaryContainer = document.getElementById("visionSummary");
    historyPanel = document.getElementById("visionHistory");
    historyList = document.getElementById("visionHistoryList");
    historyToggle = document.getElementById("visionHistoryToggle");
    fileInput = document.getElementById("visionFileInput");
    uploadButton = document.getElementById("visionUploadBtn");
    exportButton = document.getElementById("visionExportBtn");
    addFindingButton = document.getElementById("visionAddFindingBtn");
    noteForm = document.getElementById("visionNoteForm");
    noteInput = document.getElementById("visionNoteInput");
    historySearch = document.getElementById("visionHistorySearch");

    if (!dropzone || !canvas || !overlay || !resultsContainer) {
      return;
    }
    ctx = canvas.getContext("2d");
    if (selectionLayer) {
      selectionLayer.innerHTML = "";
      selectionLayer.classList.add("hidden");
    }
    try {
      var params = new URLSearchParams(window.location.search);
      var target = params.get("inference");
      if (target) {
        activeInferenceId = target;
      }
    } catch (err) {}
    bindEvents();
    window.addEventListener("resize", handleResize);
    renderEmptyState();
    if (typeof api.subscribe === "function") {
      unsubscribe = api.subscribe(handleSnapshot);
    } else if (typeof api.getSnapshot === "function") {
      handleSnapshot(api.getSnapshot());
    }
  }

  function bindEvents() {
    dropzone.addEventListener("paste", handlePaste);
    dropzone.addEventListener("click", function (evt) {
      if (selectionMode) {
        evt.preventDefault();
        return;
      }
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
        if (selectionMode) {
          exitSelectionMode();
        }
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
    if (exportButton) {
      exportButton.addEventListener("click", function (evt) {
        evt.preventDefault();
        handleExport();
      });
    }
    if (addFindingButton) {
      addFindingButton.addEventListener("click", function (evt) {
        evt.preventDefault();
        handleManualFinding();
      });
    }
    if (noteForm) {
      noteForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        handleNoteSubmit();
      });
    }
    if (historySearch) {
      historySearch.addEventListener("input", function () {
        historyFilter = (historySearch.value || "").trim();
        renderHistory();
      });
    }
    if (canvas) {
      canvas.addEventListener("mousedown", handleCanvasMouseDown);
    }
    document.addEventListener("mousemove", handleCanvasMouseMove);
    document.addEventListener("mouseup", handleCanvasMouseUp);
    document.addEventListener("keydown", handleKeyDown);
  }

  function handleResize() {
    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(function () {
      resizeTimer = null;
      syncOverlayGeometry();
    }, 120);
  }

  function computeCanvasMetrics() {
    if (!dropzone || !canvas) {
      return null;
    }
    if (!canvas.width || !canvas.height) {
      return null;
    }
    var dropRect = dropzone.getBoundingClientRect();
    var canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) {
      return null;
    }
    return {
      offsetX: canvasRect.left - dropRect.left,
      offsetY: canvasRect.top - dropRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
      scaleX: canvasRect.width / canvas.width,
      scaleY: canvasRect.height / canvas.height
    };
  }

  function syncOverlayGeometry() {
    if (!dropzone || !canvas) {
      return;
    }
    canvasMetrics = computeCanvasMetrics();
    if (!canvasMetrics) {
      return;
    }
    if (overlay) {
      overlay.style.left = canvasMetrics.offsetX + "px";
      overlay.style.top = canvasMetrics.offsetY + "px";
      overlay.style.width = canvasMetrics.width + "px";
      overlay.style.height = canvasMetrics.height + "px";
      overlay.style.pointerEvents = "none";
    }
    if (selectionLayer) {
      selectionLayer.style.left = canvasMetrics.offsetX + "px";
      selectionLayer.style.top = canvasMetrics.offsetY + "px";
      selectionLayer.style.width = canvasMetrics.width + "px";
      selectionLayer.style.height = canvasMetrics.height + "px";
      selectionLayer.style.pointerEvents = "none";
    }
    realignOverlayBoxes();
    realignSelectionBox();
  }

  function realignOverlayBoxes() {
    if (!overlay || !canvasMetrics) {
      return;
    }
    var nodes = overlay.querySelectorAll(".overlay-box");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var rawX = parseFloat(node.getAttribute("data-x") || "0");
      var rawY = parseFloat(node.getAttribute("data-y") || "0");
      var rawWidth = parseFloat(node.getAttribute("data-width") || "0");
      var rawHeight = parseFloat(node.getAttribute("data-height") || "0");
      node.style.left = rawX * canvasMetrics.scaleX + "px";
      node.style.top = rawY * canvasMetrics.scaleY + "px";
      node.style.width = rawWidth * canvasMetrics.scaleX + "px";
      node.style.height = rawHeight * canvasMetrics.scaleY + "px";
    }
  }

  function realignSelectionBox() {
    if (!selectionBox || !canvasMetrics) {
      return;
    }
    var rawX = parseFloat(selectionBox.getAttribute("data-x") || "0");
    var rawY = parseFloat(selectionBox.getAttribute("data-y") || "0");
    var rawWidth = parseFloat(selectionBox.getAttribute("data-width") || "0");
    var rawHeight = parseFloat(selectionBox.getAttribute("data-height") || "0");
    selectionBox.style.left = rawX * canvasMetrics.scaleX + "px";
    selectionBox.style.top = rawY * canvasMetrics.scaleY + "px";
    selectionBox.style.width = rawWidth * canvasMetrics.scaleX + "px";
    selectionBox.style.height = rawHeight * canvasMetrics.scaleY + "px";
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

  function ensureSelectionBox() {
    if (!selectionLayer) {
      return null;
    }
    if (!selectionBox) {
      selectionBox = document.createElement("div");
      selectionBox.className = "vision-selection-box";
      selectionLayer.appendChild(selectionBox);
    }
    return selectionBox;
  }

  function exitSelectionMode() {
    selectionMode = null;
    selectionStart = null;
    isSelecting = false;
    if (selectionLayer) {
      selectionLayer.classList.add("hidden");
      selectionLayer.innerHTML = "";
      selectionBox = null;
    }
    if (dropzone) {
      dropzone.classList.remove("selecting");
    }
  }

  function handleCanvasMouseDown(evt) {
    if (!selectionMode || !canvas) {
      return;
    }
    evt.preventDefault();
    if (!canvasMetrics) {
      syncOverlayGeometry();
    }
    var rect = canvas.getBoundingClientRect();
    var scaleX = rect.width ? canvas.width / rect.width : 1;
    var scaleY = rect.height ? canvas.height / rect.height : 1;
    var x = clamp((evt.clientX - rect.left) * scaleX, 0, canvas.width);
    var y = clamp((evt.clientY - rect.top) * scaleY, 0, canvas.height);
    selectionStart = { x: x, y: y };
    isSelecting = true;
    if (selectionLayer) {
      selectionLayer.classList.remove("hidden");
    }
    ensureSelectionBox();
    updateSelectionBox(x, y, x, y);
  }

  function handleCanvasMouseMove(evt) {
    if (!isSelecting || !selectionStart || !canvas || !selectionBox) {
      return;
    }
    if (!canvasMetrics) {
      syncOverlayGeometry();
    }
    var rect = canvas.getBoundingClientRect();
    var scaleX = rect.width ? canvas.width / rect.width : 1;
    var scaleY = rect.height ? canvas.height / rect.height : 1;
    var x = clamp((evt.clientX - rect.left) * scaleX, 0, canvas.width);
    var y = clamp((evt.clientY - rect.top) * scaleY, 0, canvas.height);
    updateSelectionBox(selectionStart.x, selectionStart.y, x, y);
  }

  function handleCanvasMouseUp(evt) {
    if (!isSelecting || !selectionStart || !canvas) {
      return;
    }
    handleCanvasMouseMove(evt);
    finalizeSelection();
  }

  function handleKeyDown(evt) {
    if (evt.key === "Escape" && selectionMode) {
      exitSelectionMode();
    }
  }

  function updateSelectionBox(x1, y1, x2, y2) {
    if (!selectionBox) {
      return;
    }
    var left = Math.min(x1, x2);
    var top = Math.min(y1, y2);
    var width = Math.abs(x2 - x1);
    var height = Math.abs(y2 - y1);
    selectionBox.setAttribute("data-x", left);
    selectionBox.setAttribute("data-y", top);
    selectionBox.setAttribute("data-width", width);
    selectionBox.setAttribute("data-height", height);
    if (!canvasMetrics) {
      syncOverlayGeometry();
    }
    if (canvasMetrics) {
      selectionBox.style.left = left * canvasMetrics.scaleX + "px";
      selectionBox.style.top = top * canvasMetrics.scaleY + "px";
      selectionBox.style.width = width * canvasMetrics.scaleX + "px";
      selectionBox.style.height = height * canvasMetrics.scaleY + "px";
    } else {
      selectionBox.style.left = left + "px";
      selectionBox.style.top = top + "px";
      selectionBox.style.width = width + "px";
      selectionBox.style.height = height + "px";
    }
  }

  function finalizeSelection() {
    if (!selectionBox || !selectionMode) {
      exitSelectionMode();
      return;
    }
    var width = parseFloat(selectionBox.getAttribute("data-width") || "0");
    var height = parseFloat(selectionBox.getAttribute("data-height") || "0");
    if (width < 12 || height < 12) {
      notify("圈选区域过小，请重新尝试");
      exitSelectionMode();
      return;
    }
    var bounds = {
      x: Math.round(parseFloat(selectionBox.getAttribute("data-x") || "0")),
      y: Math.round(parseFloat(selectionBox.getAttribute("data-y") || "0")),
      width: Math.round(width),
      height: Math.round(height)
    };
    var patch = {
      bounds: bounds,
      status: "corrected",
      correctedBy: getCurrentUser(),
      correctedAt: new Date().toISOString()
    };
    if (api && typeof api.updateFinding === "function") {
      api.updateFinding(selectionMode.inferenceId, selectionMode.findingId, patch);
    }
    if (api && typeof api.recordCorrection === "function") {
      var base = selectionMode.finding || {};
      var totalArea = canvas.width * canvas.height || 1;
      var ratio = totalArea > 0 ? bounds.width * bounds.height / totalArea : 0;
      api.recordCorrection({
        inferenceId: selectionMode.inferenceId,
        findingId: selectionMode.findingId,
        previousType: base.type || "",
        targetType: base.type || "",
        probability: base.probability || 0,
        areaRatio: ratio,
        heatScore: base.metrics && base.metrics.heatScore ? base.metrics.heatScore : 0,
        group: base.group || null,
        note: "圈选主体调整",
        correctedBy: getCurrentUser(),
        correctedAt: new Date().toISOString()
      });
    }
    notify("主体区域已更新");
    exitSelectionMode();
  }

  function enterSelectionMode(inferenceId, findingId, finding) {
    if (!dropzone || !canvas) {
      return;
    }
    var snapshot = null;
    if (finding) {
      try {
        snapshot = JSON.parse(JSON.stringify(finding));
      } catch (err) {
        snapshot = finding;
      }
    }
    selectionMode = { inferenceId: inferenceId, findingId: findingId, finding: snapshot };
    isSelecting = false;
    selectionStart = null;
    syncOverlayGeometry();
    if (selectionLayer) {
      selectionLayer.innerHTML = "";
      selectionLayer.classList.remove("hidden");
    }
    dropzone.classList.add("selecting");
    notify("请在图像上拖动框选目标区域，按 Esc 取消");
  }

  function handleExport() {
    if (!activeInference || !canvas || canvas.width === 0 || canvas.height === 0) {
      notify("暂无识别结果可导出");
      return;
    }
    try {
      var exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      var exportCtx = exportCanvas.getContext("2d");
      exportCtx.drawImage(canvas, 0, 0);
      if (activeInference.findings && activeInference.findings.length > 0) {
        exportCtx.lineWidth = 2;
        exportCtx.font = "bold 14px 'Microsoft YaHei',sans-serif";
        for (var i = 0; i < activeInference.findings.length; i += 1) {
          var item = activeInference.findings[i];
          if (!item.bounds) {
            continue;
          }
          exportCtx.strokeStyle = "rgba(79,111,217,0.9)";
          exportCtx.fillStyle = "rgba(79,111,217,0.2)";
          exportCtx.beginPath();
          exportCtx.rect(item.bounds.x, item.bounds.y, item.bounds.width, item.bounds.height);
          exportCtx.fill();
          exportCtx.stroke();
          exportCtx.fillStyle = "rgba(15,23,42,0.9)";
          exportCtx.fillText(item.type + " " + percent(item.probability), item.bounds.x + 8, item.bounds.y + 20);
        }
      }
      var iso = new Date().toISOString();
      var fileName = "ThermoClean-" + iso.replace(/[-:TZ.]/g, "").slice(0, 14) + ".png";
      var link = document.createElement("a");
      link.href = exportCanvas.toDataURL("image/png");
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (api && typeof api.updateInference === "function") {
        var exports = activeInference.exports ? activeInference.exports.slice() : [];
        exports.unshift({
          id: makeId("export"),
          createdAt: iso,
          fileName: fileName,
          createdBy: getCurrentUser()
        });
        if (exports.length > 10) {
          exports = exports.slice(0, 10);
        }
        api.updateInference(activeInference.id, {
          lastExportedAt: iso,
          lastExportFile: fileName,
          exports: exports
        });
      }
      notify("标注图已导出");
    } catch (err) {
      console.error("export failed", err);
      notify("导出失败，请重试");
    }
  }

  function handleManualFinding() {
    if (addFindingButton && addFindingButton.disabled) {
      notify("请先完成一次识别后再新增结果");
      return;
    }
    if (!activeInference || !activeInference.id) {
      notify("请先导入图像并完成一次识别");
      return;
    }
    if (!api || typeof api.addFinding !== "function") {
      notify("当前环境不支持新增识别结果");
      return;
    }
    var created = api.addFinding(activeInference.id, {
      type: "待分类",
      probability: 0,
      status: "manual",
      notes: "",
      createdAt: new Date().toISOString(),
      createdBy: getCurrentUser()
    });
    if (!created || !created.id) {
      notify("新增识别结果失败，请稍后再试");
      return;
    }
    notify("已新增识别结果，请圈选主体区域");
    window.requestAnimationFrame(function () {
      enterSelectionMode(activeInference.id, created.id, created);
    });
  }

  function handleRemoveFinding(inferenceId, findingId) {
    if (!inferenceId || !findingId) {
      return;
    }
    if (!api || typeof api.removeFinding !== "function") {
      notify("当前环境不支持删除识别结果");
      return;
    }
    if (!window.confirm("确定要删除该识别结果吗？")) {
      return;
    }
    exitSelectionMode();
    var removed = api.removeFinding(inferenceId, findingId);
    if (removed) {
      notify("识别结果已删除");
      focusOverlay(null);
    } else {
      notify("未能删除识别结果");
    }
  }

  function handleNoteSubmit() {
    if (!noteInput || !activeInference) {
      return;
    }
    var note = noteInput.value || "";
    if (api && typeof api.updateInference === "function") {
      api.updateInference(activeInference.id, { notes: note });
    }
    notify("识别备注已保存");
  }

  function updateExportState(inference) {
    if (!exportButton) {
      return;
    }
    if (!inference) {
      exportButton.disabled = true;
      return;
    }
    exportButton.disabled = false;
  }

  function updateAddButtonState(inference) {
    if (!addFindingButton) {
      return;
    }
    if (!inference) {
      addFindingButton.disabled = true;
      addFindingButton.setAttribute("aria-disabled", "true");
      return;
    }
    addFindingButton.disabled = false;
    addFindingButton.setAttribute("aria-disabled", "false");
  }

  function updateNoteForm(inference) {
    if (!noteForm) {
      return;
    }
    if (!inference) {
      noteForm.classList.add("hidden");
      return;
    }
    noteForm.classList.remove("hidden");
    if (noteInput) {
      noteInput.value = inference.notes || "";
    }
  }

  function handleSnapshot(snapshot) {
    exitSelectionMode();
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
    activeInference = null;
    updateExportState(null);
    updateAddButtonState(null);
    updateNoteForm(null);
    focusOverlay(null);
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
    exitSelectionMode();
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
      var bounds = dropzone ? dropzone.getBoundingClientRect() : null;
      var maxWidth = 1024;
      if (bounds && bounds.width) {
        maxWidth = Math.max(320, Math.min(1080, Math.floor(bounds.width) - 48));
      }
      var maxHeight = 640;
      if (window.innerHeight) {
        maxHeight = Math.max(280, Math.min(620, Math.round(window.innerHeight * 0.6)));
      }
      var dimensions = fitSize(image.width, image.height, maxWidth, maxHeight);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
      syncOverlayGeometry();
      window.requestAnimationFrame(syncOverlayGeometry);
      if (placeholder) {
        placeholder.classList.add("hidden");
      }
      canvas.classList.remove("hidden");
      overlay.classList.remove("hidden");
      if (selectionLayer) {
        selectionLayer.classList.add("hidden");
        selectionLayer.innerHTML = "";
        selectionBox = null;
      }
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
      activeInference = stored;
      updateAddButtonState(stored);
      if (api && typeof api.getSnapshot === "function") {
        handleSnapshot(api.getSnapshot());
      } else {
        drawInference(stored);
        renderFindings(stored);
        updateSummary(stored, analysis.summary);
        updateExportState(stored);
        updateAddButtonState(stored);
        updateNoteForm(stored);
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
    var cell = Math.max(12, Math.round(Math.min(width, height) / 32));
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
    var threshold = stats.mean + stats.std * 0.55;
    if (threshold < stats.mean * 1.05) {
      threshold = stats.mean * 1.05;
    }
    var upperBound = maxHeat * 0.88;
    if (threshold > upperBound) {
      threshold = upperBound;
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
    var padding = Math.max(4, Math.round(cellSize * 0.6));
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width, maxX + padding);
    maxY = Math.min(height, maxY + padding);
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
    exitSelectionMode();
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
    activeInference = inference;
    drawInference(inference);
    renderFindings(inference);
    updateSummary(inference, inference.summary || null);
    updateExportState(inference);
    updateAddButtonState(inference);
    updateNoteForm(inference);
    highlightHistoryActive();
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
      syncOverlayGeometry();
      window.requestAnimationFrame(syncOverlayGeometry);
      canvas.classList.remove("hidden");
      overlay.classList.remove("hidden");
      if (placeholder) {
        placeholder.classList.add("hidden");
      }
      clearOverlay();
      focusOverlay(null);
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
    var x = clamp(finding.bounds.x, 0, canvas.width);
    var y = clamp(finding.bounds.y, 0, canvas.height);
    var width = clamp(finding.bounds.width, 1, canvas.width - x);
    var height = clamp(finding.bounds.height, 1, canvas.height - y);
    var box = document.createElement("div");
    box.className = "overlay-box";
    box.setAttribute("data-id", finding.id);
    box.setAttribute("data-x", x);
    box.setAttribute("data-y", y);
    box.setAttribute("data-width", width);
    box.setAttribute("data-height", height);
    if (!canvasMetrics) {
      syncOverlayGeometry();
    }
    if (canvasMetrics) {
      box.style.left = x * canvasMetrics.scaleX + "px";
      box.style.top = y * canvasMetrics.scaleY + "px";
      box.style.width = width * canvasMetrics.scaleX + "px";
      box.style.height = height * canvasMetrics.scaleY + "px";
    } else {
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = width + "px";
      box.style.height = height + "px";
    }
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
    focusOverlay(null);
    realignOverlayBoxes();
  }

  function buildFindingCard(inference, finding, index) {
    var card = document.createElement("div");
    card.className = "vision-card";
    card.setAttribute("data-status", finding.status || "auto");
    card.addEventListener("mouseenter", function () {
      focusOverlay(finding.id);
    });
    card.addEventListener("mouseleave", function () {
      focusOverlay(null);
    });
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
    var selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "ghost-button";
    selectBtn.textContent = "圈选主体";
    selectBtn.addEventListener("click", function () {
      exitSelectionMode();
      enterSelectionMode(inference.id, finding.id, finding);
    });
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
      notify("订正已提交");
    });
    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "ghost-button danger-button";
    deleteBtn.textContent = "删除结果";
    deleteBtn.addEventListener("click", function () {
      handleRemoveFinding(inference.id, finding.id);
    });
    actions.appendChild(selectBtn);
    actions.appendChild(confirmBtn);
    actions.appendChild(correctBtn);
    actions.appendChild(deleteBtn);

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
    var exportText = inference.lastExportedAt ? '<div class="vision-summary-meta">最近导出 ' + formatDateTime(inference.lastExportedAt) + '</div>' : "";
    summaryContainer.innerHTML = '<div class="vision-summary-status">' + typeText + '</div><div class="vision-summary-meta">识别时间 ' + runText + '</div>' + exportText;
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
    var records = currentSnapshot.history.slice();
    var filter = historyFilter ? historyFilter.toLowerCase() : "";
    var hasFilter = filter.length > 0;
    var matched = [];
    for (var i = 0; i < records.length; i += 1) {
      var inference = records[i];
      if (!hasFilter) {
        matched.push(inference);
        continue;
      }
      var note = inference.notes ? inference.notes.toLowerCase() : "";
      var type = inference.summary && inference.summary.dominantType ? inference.summary.dominantType.toLowerCase() : "";
      var timeText = formatDateTime(inference.runAt).toLowerCase();
      if (note.indexOf(filter) !== -1 || type.indexOf(filter) !== -1 || timeText.indexOf(filter) !== -1) {
        matched.push(inference);
      }
    }
    if (matched.length === 0) {
      var none = document.createElement("div");
      none.className = "vision-empty";
      none.textContent = "未找到匹配的记录";
      historyList.appendChild(none);
      return;
    }
    for (var j = 0; j < matched.length; j += 1) {
      historyList.appendChild(buildHistoryItem(matched[j]));
    }
    highlightHistoryActive();
  }

  function buildHistoryItem(inference) {
    var item = document.createElement("div");
    item.className = "vision-history-item";
    item.setAttribute("data-id", inference.id);
    var title = document.createElement("div");
    title.className = "history-title";
    var type = inference.summary && inference.summary.dominantType ? inference.summary.dominantType : (inference.findings && inference.findings.length > 0 ? inference.findings[0].type : "未检测");
    title.textContent = type;
    var meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = formatDateTime(inference.runAt);
    var note = null;
    if (inference.notes) {
      note = document.createElement("div");
      note.className = "history-note";
      note.textContent = inference.notes;
    }
    var exportMeta = null;
    if (inference.lastExportedAt) {
      exportMeta = document.createElement("div");
      exportMeta.className = "history-meta";
      exportMeta.textContent = "最近导出 " + formatDateTime(inference.lastExportedAt);
    }
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
    if (note) {
      item.appendChild(note);
    }
    if (exportMeta) {
      item.appendChild(exportMeta);
    }
    item.appendChild(actions);
    return item;
  }

  function highlightHistoryActive() {
    if (!historyList) {
      return;
    }
    var cards = historyList.querySelectorAll(".vision-history-item");
    for (var i = 0; i < cards.length; i += 1) {
      cards[i].classList.remove("active");
      if (activeInferenceId && cards[i].getAttribute("data-id") === activeInferenceId) {
        cards[i].classList.add("active");
      }
    }
  }

  function focusOverlay(findingId) {
    if (!overlay) {
      return;
    }
    var boxes = overlay.querySelectorAll(".overlay-box");
    for (var i = 0; i < boxes.length; i += 1) {
      var box = boxes[i];
      if (findingId && box.getAttribute("data-id") === findingId) {
        box.classList.add("active");
      } else {
        box.classList.remove("active");
      }
    }
  }

  window.AIToolsVision = {
    mount: mount
  };
})();
