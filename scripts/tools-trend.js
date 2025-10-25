(function () {
  function generateId() {
    return "trend-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function formatNumber(value, unit) {
    if (value === null || value === undefined || isNaN(value)) {
      return "--";
    }
    var fixed = Number(value).toFixed(3);
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
    options = options || {};
    var ctx = canvas.getContext("2d");
    var width = canvas.clientWidth || 600;
    var height = canvas.clientHeight || 260;
    canvas.width = width;
    canvas.height = height;
    var mini = !!options.mini;
    var paddingLeft = mini ? 12 : 68;
    var paddingRight = mini ? 12 : 28;
    var paddingTop = mini ? 8 : 28;
    var paddingBottom = mini ? 12 : 56;
    var plotWidth = Math.max(20, width - paddingLeft - paddingRight);
    var plotHeight = Math.max(20, height - paddingTop - paddingBottom);

    ctx.clearRect(0, 0, width, height);
    var background = typeof options.background === "string"
      ? options.background
      : (mini ? "transparent" : "#ffffff");
    if (background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    var sanitized = Array.isArray(series)
      ? series
          .filter(function (item) {
            return item && typeof item.value === "number" && item.capturedAt;
          })
          .sort(function (a, b) {
            return new Date(a.capturedAt) - new Date(b.capturedAt);
          })
      : [];

    var lower = typeof options.lower === "number" ? options.lower : null;
    var upper = typeof options.upper === "number" ? options.upper : null;
    var center = typeof options.center === "number" ? options.center : null;

    var minValue = null;
    var maxValue = null;
    var minTime = null;
    var maxTime = null;
    sanitized.forEach(function (point) {
      if (minValue === null || point.value < minValue) {
        minValue = point.value;
      }
      if (maxValue === null || point.value > maxValue) {
        maxValue = point.value;
      }
      var ts = new Date(point.capturedAt).getTime();
      if (!isFinite(ts)) {
        return;
      }
      if (minTime === null || ts < minTime) {
        minTime = ts;
      }
      if (maxTime === null || ts > maxTime) {
        maxTime = ts;
      }
    });

    [lower, upper].forEach(function (bound) {
      if (typeof bound === "number") {
        if (minValue === null || bound < minValue) {
          minValue = bound;
        }
        if (maxValue === null || bound > maxValue) {
          maxValue = bound;
        }
      }
    });

    if (minValue === null || maxValue === null || minTime === null || maxTime === null) {
      if (!mini) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
        ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText("暂无数据", paddingLeft, height / 2);
      }
      return;
    }

    if (Math.abs(maxValue - minValue) < 1e-6) {
      var pad = Math.max(1, Math.abs(maxValue) * 0.05 || 1);
      maxValue += pad;
      minValue -= pad;
    }
    var valueRange = maxValue - minValue;
    var timeRange = Math.max(1, maxTime - minTime);

    var originX = paddingLeft;
    var originY = height - paddingBottom;

    if (!mini) {
      ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, paddingTop);
      ctx.lineTo(originX, originY);
      ctx.lineTo(width - paddingRight, originY);
      ctx.stroke();

      var yTicks = 4;
      ctx.font = "12px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (var i = 0; i <= yTicks; i += 1) {
        var valueTick = minValue + (valueRange * i) / yTicks;
        var y = originY - ((valueTick - minValue) / valueRange) * plotHeight;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(valueTick.toFixed(3), originX - 10, y);
      }

      var xTicks = Math.max(2, Math.min(6, sanitized.length));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (var j = 0; j <= xTicks; j += 1) {
        var ratio = j / xTicks;
        var xTick = originX + ratio * plotWidth;
        var tsTick = minTime + ratio * timeRange;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.beginPath();
        ctx.moveTo(xTick, paddingTop);
        ctx.lineTo(xTick, originY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fillText(formatTime(tsTick), xTick, originY + 8);
      }

      ctx.save();
      ctx.translate(16, paddingTop + plotHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
      ctx.fillText("数值" + (options.unit ? " (" + options.unit + ")" : ""), 0, 0);
      ctx.restore();

      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
      ctx.fillText("时间", originX + plotWidth / 2, height - 8);
    }

    function drawLimitLine(value, color, label) {
      if (typeof value !== "number") {
        return;
      }
      var yPos = originY - ((value - minValue) / valueRange) * plotHeight;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, yPos);
      ctx.lineTo(width - paddingRight, yPos);
      ctx.stroke();
      ctx.restore();
      if (!mini) {
        ctx.fillStyle = color;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(label + " " + value.toFixed(3), width - paddingRight - 6, yPos - 4);
      }
    }

    if (!mini) {
      drawLimitLine(upper, "#ef4444", "上限");
      drawLimitLine(lower, "#0ea5e9", "下限");
      if (typeof center === "number") {
        drawLimitLine(center, "#6366f1", "中值");
      }
    }

    if (!sanitized.length) {
      return;
    }

    ctx.lineWidth = mini ? 1.5 : 2.4;
    ctx.strokeStyle = options.color || "#2563eb";
    ctx.beginPath();
    sanitized.forEach(function (point, index) {
      var ts = new Date(point.capturedAt).getTime();
      var x = originX + ((ts - minTime) / timeRange) * plotWidth;
      var y = originY - ((point.value - minValue) / valueRange) * plotHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function calcSlope(series) {
    if (!Array.isArray(series) || series.length < 2) {
      return 0;
    }
    var first = series[0];
    var last = series[series.length - 1];
    if (!first || !last) {
      return 0;
    }
    var firstTime = new Date(first.capturedAt).getTime();
    var lastTime = new Date(last.capturedAt).getTime();
    if (!isFinite(firstTime) || !isFinite(lastTime) || lastTime === firstTime) {
      return 0;
    }
    var deltaValue = last.value - first.value;
    var deltaMinutes = (lastTime - firstTime) / 60000;
    if (!isFinite(deltaMinutes) || deltaMinutes === 0) {
      return 0;
    }
    return deltaValue / deltaMinutes;
  }

  function classifySlopeLabel(slope, thresholds) {
    thresholds = thresholds || {};
    var tolerance = typeof thresholds.tolerance === "number" ? thresholds.tolerance : 0.002;
    var gentle = typeof thresholds.gentle === "number" ? thresholds.gentle : 0.01;
    var strong = typeof thresholds.strong === "number" ? thresholds.strong : 0.03;
    var extreme = typeof thresholds.extreme === "number" ? thresholds.extreme : 0.08;
    if (Math.abs(slope) <= tolerance) {
      return "平稳";
    }
    if (slope > 0) {
      if (slope >= extreme) {
        return "极速上升";
      }
      if (slope >= strong) {
        return "上升";
      }
      return "缓慢上升";
    }
    if (slope <= -extreme) {
      return "极速下降";
    }
    return "缓慢下降";
  }

  function analyzeTrendProfile(series, options) {
    options = options || {};
    if (!Array.isArray(series) || series.length < 2) {
      return { label: "平稳", slope: 0, durationMinutes: 0, direction: 0 };
    }
    var windowSize = options.windowSize || 30;
    var tolerance = typeof options.tolerance === "number" ? options.tolerance : 0.002;
    var ordered = series
      .filter(function (item) {
        return item && typeof item.value === "number" && item.capturedAt;
      })
      .sort(function (a, b) {
        return new Date(a.capturedAt) - new Date(b.capturedAt);
      });
    if (ordered.length > windowSize) {
      ordered = ordered.slice(ordered.length - windowSize);
    }
    if (ordered.length < 2) {
      return { label: "平稳", slope: 0, durationMinutes: 0, direction: 0 };
    }
    var slope = calcSlope(ordered);
    var label = classifySlopeLabel(slope, options);
    var direction = 0;
    if (slope > tolerance) {
      direction = 1;
    } else if (slope < -tolerance) {
      direction = -1;
    }
    var durationMinutes = 0;
    if (direction !== 0) {
      var end = ordered[ordered.length - 1];
      var endTime = new Date(end.capturedAt).getTime();
      var startTime = endTime;
      for (var i = ordered.length - 2; i >= 0; i -= 1) {
        var current = ordered[i];
        var currentTime = new Date(current.capturedAt).getTime();
        if (!isFinite(currentTime)) {
          continue;
        }
        var deltaMinutes = (endTime - currentTime) / 60000;
        if (deltaMinutes <= 0) {
          continue;
        }
        var deltaValue = end.value - current.value;
        var localSlope = deltaValue / deltaMinutes;
        if (direction > 0 && localSlope <= tolerance) {
          startTime = new Date(ordered[i + 1].capturedAt).getTime();
          break;
        }
        if (direction < 0 && localSlope >= -tolerance) {
          startTime = new Date(ordered[i + 1].capturedAt).getTime();
          break;
        }
        startTime = currentTime;
      }
      if (endTime > startTime) {
        durationMinutes = Math.max(0, Math.round((endTime - startTime) / 60000));
      }
    }
    return {
      label: label,
      slope: slope,
      durationMinutes: durationMinutes,
      direction: direction
    };
  }

  function drawMultiSeries(canvas, datasets, options) {
    if (!canvas || !canvas.getContext) {
      return;
    }
    options = options || {};
    var sets = Array.isArray(datasets)
      ? datasets.filter(function (set) {
          return set && Array.isArray(set.data) && set.data.length;
        })
      : [];
    var ctx = canvas.getContext("2d");
    var width = canvas.clientWidth || 600;
    var height = canvas.clientHeight || 260;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (!sets.length) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无数据", 20, height / 2);
      return;
    }
    var paddingLeft = 68;
    var paddingRight = 32;
    var paddingTop = 28;
    var paddingBottom = 56;
    var plotWidth = Math.max(20, width - paddingLeft - paddingRight);
    var plotHeight = Math.max(20, height - paddingTop - paddingBottom);

    var minValue = null;
    var maxValue = null;
    var minTime = null;
    var maxTime = null;
    sets.forEach(function (set) {
      set.data.forEach(function (point) {
        if (!point || typeof point.value !== "number" || !point.capturedAt) {
          return;
        }
        if (minValue === null || point.value < minValue) {
          minValue = point.value;
        }
        if (maxValue === null || point.value > maxValue) {
          maxValue = point.value;
        }
        var ts = new Date(point.capturedAt).getTime();
        if (!isFinite(ts)) {
          return;
        }
        if (minTime === null || ts < minTime) {
          minTime = ts;
        }
        if (maxTime === null || ts > maxTime) {
          maxTime = ts;
        }
      });
    });

    if (minValue === null || maxValue === null || minTime === null || maxTime === null) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.font = "14px/1.6 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无数据", 20, height / 2);
      return;
    }

    [options.lower, options.upper].forEach(function (bound) {
      if (typeof bound === "number") {
        if (minValue === null || bound < minValue) {
          minValue = bound;
        }
        if (maxValue === null || bound > maxValue) {
          maxValue = bound;
        }
      }
    });

    if (Math.abs(maxValue - minValue) < 1e-6) {
      var pad = Math.max(1, Math.abs(maxValue) * 0.05 || 1);
      maxValue += pad;
      minValue -= pad;
    }

    var originX = paddingLeft;
    var originY = height - paddingBottom;
    var valueRange = maxValue - minValue;
    var timeRange = Math.max(1, maxTime - minTime);

    ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX, paddingTop);
    ctx.lineTo(originX, originY);
    ctx.lineTo(width - paddingRight, originY);
    ctx.stroke();

    ctx.font = "12px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var yTicks = 4;
    for (var i = 0; i <= yTicks; i += 1) {
      var valueTick = minValue + (valueRange * i) / yTicks;
      var y = originY - ((valueTick - minValue) / valueRange) * plotHeight;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(valueTick.toFixed(3), originX - 10, y);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var xTicks = 6;
    for (var j = 0; j <= xTicks; j += 1) {
      var ratio = j / xTicks;
      var xTick = originX + ratio * plotWidth;
      var tsTick = minTime + ratio * timeRange;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.beginPath();
      ctx.moveTo(xTick, paddingTop);
      ctx.lineTo(xTick, originY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.fillText(formatTime(tsTick), xTick, originY + 8);
    }

    ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
    ctx.textBaseline = "bottom";
    ctx.fillText("时间", originX + plotWidth / 2, height - 8);
    ctx.save();
    ctx.translate(18, paddingTop + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("数值" + (options.unit ? " (" + options.unit + ")" : ""), 0, 0);
    ctx.restore();

    function drawReference(value, color, label) {
      if (typeof value !== "number") {
        return;
      }
      var y = originY - ((value - minValue) / valueRange) * plotHeight;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(label + " " + value.toFixed(3), width - paddingRight - 6, y - 4);
    }

    drawReference(options.upper, "#ef4444", "上限");
    drawReference(options.lower, "#0ea5e9", "下限");
    if (typeof options.center === "number") {
      drawReference(options.center, "#6366f1", "中值");
    }

    var palette = options.colors || ["#2563eb", "#f97316", "#10b981", "#0ea5e9", "#6366f1"];
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
        var x = originX + ((ts - minTime) / timeRange) * plotWidth;
        var y = originY - ((point.value - minValue) / valueRange) * plotHeight;
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

  function normalizeSeriesWindow(series, minutes) {
    if (!Array.isArray(series) || !series.length) {
      return [];
    }
    var cutoff = null;
    if (typeof minutes === "number" && minutes > 0) {
      cutoff = Date.now() - minutes * 60000;
    }
    var normalized = series
      .filter(function (point) {
        if (!point || typeof point.value !== "number" || !point.capturedAt) {
          return false;
        }
        if (!cutoff) {
          return true;
        }
        var ts = new Date(point.capturedAt).getTime();
        return isFinite(ts) && ts >= cutoff;
      })
      .map(function (point) {
        return { capturedAt: point.capturedAt, value: point.value };
      })
      .sort(function (a, b) {
        return new Date(a.capturedAt) - new Date(b.capturedAt);
      });
    return normalized;
  }

  function summarizeFluctuations(series) {
    var tolerance = 1e-6;
    var up = 0;
    var down = 0;
    if (Array.isArray(series)) {
      for (var i = 1; i < series.length; i += 1) {
        var prev = series[i - 1];
        var current = series[i];
        if (!prev || !current) {
          continue;
        }
        var delta = current.value - prev.value;
        if (delta > tolerance) {
          up += 1;
        } else if (delta < -tolerance) {
          down += 1;
        }
      }
    }
    var total = up + down;
    return {
      up: up,
      down: down,
      total: total,
      upRatio: total ? up / total : 0,
      downRatio: total ? down / total : 0
    };
  }

  function formatFluctuationSummary(summary) {
    if (!summary || !summary.total) {
      return "波动数据不足";
    }
    var upPercent = Math.round(summary.upRatio * 1000) / 10;
    var downPercent = Math.round(summary.downRatio * 1000) / 10;
    return (
      "上升 " + summary.up + " 次 (" + upPercent + "%) · 下降 " + summary.down + " 次 (" + downPercent + "%)"
    );
  }

  function evaluateTrendProfile(profile) {
    if (!profile) {
      return { text: "数据不足", level: "warning" };
    }
    var label = profile.label || "平稳";
    var duration = profile.durationMinutes || 0;
    var text;
    var level = "normal";
    if (label === "平稳") {
      text = "平稳运行";
    } else if (label === "缓慢上升") {
      text = "缓慢上升，建议关注";
      level = "notice";
    } else if (label === "上升") {
      text = "持续上升，需检查上下游";
      level = "warning";
    } else if (label === "极速上升") {
      text = "极速上升，立即检查";
      level = "critical";
    } else if (label === "缓慢下降") {
      text = "缓慢下降，可观察";
      level = "notice";
    } else if (label === "极速下降" || label === "下降") {
      text = "快速下降，请警惕";
      level = "warning";
    } else {
      text = label;
    }
    if (duration > 0) {
      text += " · 持续 " + duration + " 分钟";
    }
    return { text: text, level: level };
  }

  function computeIntervalProfiles(series, selectedRange) {
    var intervals = [
      { key: "day", label: "日趋势", minutes: 1440 },
      { key: "month", label: "月趋势", minutes: 43200 },
      { key: "quarter", label: "季度趋势", minutes: 129600 }
    ];
    if (selectedRange && selectedRange > 0) {
      intervals.push({ key: "custom", label: "自定义 (" + selectedRange + " 分钟)", minutes: selectedRange });
    }
    var results = [];
    for (var i = 0; i < intervals.length; i += 1) {
      var config = intervals[i];
      var windowSeries = normalizeSeriesWindow(series, config.minutes);
      if (windowSeries.length < 2) {
        results.push({
          label: config.label,
          slope: "--",
          duration: "--",
          evaluation: "数据不足",
          evaluationLevel: "warning",
          fluctuations: "--"
        });
        continue;
      }
      var profile = analyzeTrendProfile(windowSeries, { windowSize: Math.min(windowSeries.length, 60) });
      var evaluation = evaluateTrendProfile(profile);
      var slopeText = typeof profile.slope === "number" ? profile.slope.toFixed(3) : "--";
      var durationText = profile.durationMinutes ? profile.durationMinutes + " 分钟" : "--";
      var fluctuationSummary = formatFluctuationSummary(summarizeFluctuations(windowSeries));
      results.push({
        label: config.label,
        slope: slopeText,
        duration: durationText,
        evaluation: evaluation.text,
        evaluationLevel: evaluation.level,
        fluctuations: fluctuationSummary
      });
    }
    return results;
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

    function listMesEndpoints(includeDisabled) {
      var settings = state && state.snapshot && state.snapshot.settings ? state.snapshot.settings : null;
      if (!settings || !Array.isArray(settings.mesEndpoints)) {
        return [];
      }
      return settings.mesEndpoints.filter(function (endpoint) {
        if (!endpoint || !endpoint.id) {
          return false;
        }
        if (includeDisabled) {
          return true;
        }
        return endpoint.enabled !== false;
      });
    }

    function findMesEndpointById(id) {
      if (!id) {
        return null;
      }
      var endpoints = listMesEndpoints(true);
      for (var i = 0; i < endpoints.length; i += 1) {
        if (endpoints[i] && endpoints[i].id === id) {
          return endpoints[i];
        }
      }
      return null;
    }

    function describeMesEndpoint(endpoint) {
      if (!endpoint) {
        return "";
      }
      var label = endpoint.name || endpoint.id || "MES 数据源";
      if (endpoint.enabled === false) {
        label += "（停用）";
      }
      return label;
    }

    var initialSnapshot = services.getSnapshot ? services.getSnapshot({}) : null;
    var state = {
      services: services,
      snapshot: initialSnapshot,
      nodeLibrary: initialSnapshot && initialSnapshot.nodeLibrary ? initialSnapshot.nodeLibrary : [],
      hierarchy: initialSnapshot && initialSnapshot.hierarchy ? initialSnapshot.hierarchy : { groups: {}, nodes: {} },
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
      explorerPath: [],
      nodeModalState: null,
      groupModalState: null,
      settingsModalState: null,
      endpointModalState: null,
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
        if (typeof item.mesSourceId === "string") {
          item.mesSourceId = item.mesSourceId.trim();
          if (!item.mesSourceId) {
            item.mesSourceId = null;
          }
        } else if (item.mesSourceId === undefined) {
          item.mesSourceId = null;
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

    function generateUniqueNodeId() {
      var attempt = generateId();
      var guard = 0;
      while (isNodeIdTaken(attempt) && guard < 50) {
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

    var explorerContainer = document.getElementById("trendExplorerPanel");
    var explorerGridEl = document.getElementById("trendExplorerGrid");
    var explorerEmptyEl = document.getElementById("trendExplorerEmpty");
    var explorerBreadcrumbEl = document.getElementById("trendExplorerBreadcrumb");
    var explorerUpBtn = document.getElementById("trendExplorerUp");
    var explorerAddGroupBtn = document.getElementById("trendExplorerAddGroup");
    var explorerAddNodeBtn = document.getElementById("trendExplorerAddNode");
    var explorerMenuEl = document.getElementById("trendExplorerMenu");
    var explorerConsoleBtn = document.getElementById("trendOpenConsole");
    var consolePanelEl = document.getElementById("trendConsolePanel");
    var consoleCloseBtn = document.getElementById("trendConsoleClose");
    var explorerMenuContext = null;
    var nodeForm = document.getElementById("trendNodeForm");
    var nodeKeyInput = document.getElementById("trendNodeKey");
    var nodeNameInput = document.getElementById("trendNodeName");
    var nodeNoteInput = document.getElementById("trendNodeNote");
    var nodeParentSelect = document.getElementById("trendNodeParent");
    var nodePositionSelect = document.getElementById("trendNodePosition");
    var nodeRefField = document.getElementById("trendNodeRefField");
    var nodeRefSelect = document.getElementById("trendNodeRef");
    var groupBoundsInfoEl = document.getElementById("trendGroupBoundsInfo");
    var groupAnalyticsEl = document.getElementById("trendGroupAnalytics");
    var addNodeBtn = document.getElementById("trendAddNode");
    var deleteNodeBtn = document.getElementById("trendDeleteNode");
    var addSubNodeBtn = document.getElementById("trendAddSubNode");
    var subNodeListEl = document.getElementById("trendSubNodeList");
    var nodeModalEl = document.getElementById("trendNodeModal");
    var nodeModalForm = document.getElementById("trendNodeModalForm");
    var nodeModalCloseBtn = document.getElementById("trendNodeModalClose");
    var nodeModalCancelBtn = document.getElementById("trendNodeModalCancel");
    var nodeModalDetailBtn = document.getElementById("trendNodeModalDetail");
    var nodeModalEditBtn = document.getElementById("trendNodeModalEdit");
    var nodeModalSaveBtn = document.getElementById("trendNodeModalSave");
    var nodeModalKeyInput = document.getElementById("trendNodeModalKey");
    var nodeModalNameInput = document.getElementById("trendNodeModalName");
    var nodeModalUnitInput = document.getElementById("trendNodeModalUnit");
    var nodeModalSimulateSelect = document.getElementById("trendNodeModalSimulate");
    var nodeModalLowerInput = document.getElementById("trendNodeModalLower");
    var nodeModalCenterInput = document.getElementById("trendNodeModalCenter");
    var nodeModalUpperInput = document.getElementById("trendNodeModalUpper");
    var nodeModalMesSelect = document.getElementById("trendNodeModalMes");
    var nodeModalManualSelect = document.getElementById("trendNodeModalManual");
    var nodeModalManualFields = document.getElementById("trendNodeModalManualFields");
    var nodeModalStepInput = document.getElementById("trendNodeModalStep");
    var nodeModalImpactSelect = document.getElementById("trendNodeModalImpact");
    var nodeModalChart = document.getElementById("trendNodeModalChart");
    var nodeModalMeta = document.getElementById("trendNodeModalMeta");
    var nodeModalAnalytics = document.getElementById("trendNodeModalAnalytics");
    var groupModalEl = document.getElementById("trendGroupModal");
    var groupModalForm = document.getElementById("trendGroupModalForm");
    var groupModalCloseBtn = document.getElementById("trendGroupModalClose");
    var groupModalCancelBtn = document.getElementById("trendGroupModalCancel");
    var groupModalDuplicateBtn = document.getElementById("trendGroupModalDuplicate");
    var groupModalKeyInput = document.getElementById("trendGroupModalKey");
    var groupModalNameInput = document.getElementById("trendGroupModalName");
    var groupModalNoteInput = document.getElementById("trendGroupModalNote");
    var groupModalParentSelect = document.getElementById("trendGroupModalParent");
    var targetModalEl = document.getElementById("trendTargetModal");
    var targetModalForm = document.getElementById("trendTargetModalForm");
    var targetModalCloseBtn = document.getElementById("trendTargetModalClose");
    var targetModalCancelBtn = document.getElementById("trendTargetModalCancel");
    var targetModalLowerInput = document.getElementById("trendTargetModalLower");
    var targetModalCenterInput = document.getElementById("trendTargetModalCenter");
    var targetModalUpperInput = document.getElementById("trendTargetModalUpper");
    var settingsModalEl = document.getElementById("trendSettingsModal");
    var settingsModalCloseBtn = document.getElementById("trendSettingsModalClose");
    var settingsModalForm = document.getElementById("trendSettingsModalForm");
    var settingsModalSampleInput = document.getElementById("trendSettingsModalSample");
    var settingsModalLookbackInput = document.getElementById("trendSettingsModalLookback");
    var settingsModalPredictionInput = document.getElementById("trendSettingsModalPrediction");
    var settingsModalLowerInput = document.getElementById("trendSettingsModalLower");
    var settingsModalCenterInput = document.getElementById("trendSettingsModalCenter");
    var settingsModalUpperInput = document.getElementById("trendSettingsModalUpper");
    var settingsModalAddEndpointBtn = document.getElementById("trendSettingsModalAddEndpoint");
    var settingsModalEndpointList = document.getElementById("trendSettingsModalEndpointList");
    var endpointModalEl = document.getElementById("trendEndpointModal");
    var endpointModalForm = document.getElementById("trendEndpointModalForm");
    var endpointModalCloseBtn = document.getElementById("trendEndpointModalClose");
    var endpointModalCancelBtn = document.getElementById("trendEndpointModalCancel");
    var endpointModalNameInput = document.getElementById("trendEndpointModalName");
    var endpointModalTypeSelect = document.getElementById("trendEndpointModalType");
    var endpointModalEnabledSelect = document.getElementById("trendEndpointModalEnabled");
    var endpointModalUrlInput = document.getElementById("trendEndpointModalUrl");
    var endpointModalDatabaseInput = document.getElementById("trendEndpointModalDatabase");
    var endpointModalTableInput = document.getElementById("trendEndpointModalTable");
    var endpointModalNotesInput = document.getElementById("trendEndpointModalNotes");
    var startDemoBtn = document.getElementById("trendStartDemo");
    var stopDemoBtn = document.getElementById("trendStopDemo");
    var manualAdjustBtn = document.getElementById("trendManualAdjust");
    var demoStatusEl = document.getElementById("trendDemoStatus");
    var summaryEl = document.getElementById("trendSummary");
    var targetCenterEl = document.getElementById("trendTargetCenter");
    var targetRangeEl = document.getElementById("trendTargetRange");
    var targetSummaryEl = document.getElementById("trendTargetSummary");
    var targetSummaryCenterEl = document.getElementById("trendTargetSummaryCenter");
    var targetSummaryRangeEl = document.getElementById("trendTargetSummaryRange");
    var targetSummaryWindowEl = document.getElementById("trendTargetSummaryWindow");
    var targetSummaryContextEl = document.getElementById("trendTargetSummaryContext");
    var targetSummaryStatusEl = document.getElementById("trendTargetSummaryStatus");
    var targetBriefEl = document.getElementById("trendTargetBrief");
    var targetSparkline = document.getElementById("trendTargetSparkline");
    var chartCanvas = document.getElementById("trendChart");
    var chartToolbar = document.querySelector(".trend-chart-toolbar");
    var matrixGridEl = document.getElementById("trendMatrixGrid");
    var libraryListEl = document.getElementById("trendLibraryList");
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
      var outputRecord = buildOutputNodeRecord();
      if (outputRecord) {
        options.push({ value: outputRecord.id, label: outputRecord.name, unit: outputRecord.unit || "" });
      }
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

    function cloneLibraryRecord(record) {
      if (!record || typeof record !== "object") {
        return null;
      }
      var copy = {
        id: record.id || "",
        name: record.name || "节点",
        unit: record.unit || "",
        lower: typeof record.lower === "number" ? record.lower : null,
        center: typeof record.center === "number" ? record.center : null,
        upper: typeof record.upper === "number" ? record.upper : null,
        manual: !!record.manual,
        manualStep: typeof record.manualStep === "number" ? record.manualStep : 0,
        simulate: record.simulate === false ? false : true,
        mesSourceId: record.mesSourceId ? String(record.mesSourceId) : null,
        note: record.note || "",
        groupId: record.groupId || null,
        parentGroupId: record.parentGroupId || null,
        groupPath: Array.isArray(record.groupPath) ? record.groupPath.slice() : [],
        groupNamePath: Array.isArray(record.groupNamePath) ? record.groupNamePath.slice() : [],
        createdAt: record.createdAt || "",
        updatedAt: record.updatedAt || ""
      };
      return copy;
    }

    function extractLibraryFromHierarchy(snapshot) {
      if (!snapshot || !snapshot.hierarchy || !snapshot.hierarchy.nodes) {
        return [];
      }
      var nodesMap = snapshot.hierarchy.nodes;
      var derived = [];
      for (var id in nodesMap) {
        if (!Object.prototype.hasOwnProperty.call(nodesMap, id)) {
          continue;
        }
        var entry = nodesMap[id];
        if (!entry) {
          continue;
        }
        var copy = cloneLibraryRecord(entry);
        if (!copy.id) {
          copy.id = id;
        }
        if (!copy.groupId && copy.groupPath && copy.groupPath.length) {
          copy.groupId = copy.groupPath[copy.groupPath.length - 1];
        }
        derived.push(copy);
      }
      return derived;
    }

    function extractLibraryFromNodes(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.nodes)) {
        return [];
      }
      var derived = [];
      var nowIso = new Date().toISOString();
      var idSeen = {};
      snapshot.nodes.forEach(function (group) {
        if (!group || !group.id || !Array.isArray(group.children)) {
          return;
        }
        var groupPath = [];
        if (snapshot.groupPaths && snapshot.groupPaths[group.id]) {
          groupPath = snapshot.groupPaths[group.id].slice();
        }
        if (!groupPath.length) {
          var ancestors = buildAncestorPath(group.id);
          ancestors.push(group.id);
          groupPath = ancestors;
        }
        var namePath = groupPath.map(function (gid) {
          var node = findNode(gid);
          return node && node.name ? node.name : "节点组";
        });
        group.children.forEach(function (child) {
          if (!child) {
            return;
          }
          var copy = cloneLibraryRecord(child);
          if (!copy.id) {
            copy.id = child.id || generateId();
          }
          if (idSeen[copy.id]) {
            copy.id = generateId();
          }
          idSeen[copy.id] = true;
          copy.groupId = group.id;
          copy.parentGroupId = group.parentId || null;
          copy.groupPath = groupPath.slice();
          copy.groupNamePath = namePath.slice();
          if (!copy.createdAt) {
            copy.createdAt = child.createdAt || group.createdAt || nowIso;
          }
          if (!copy.updatedAt) {
            copy.updatedAt = child.updatedAt || group.updatedAt || nowIso;
          }
          derived.push(copy);
        });
      });
      return derived;
    }

    function resolveNodeLibrary(snapshot) {
      if (snapshot && Array.isArray(snapshot.nodeLibrary) && snapshot.nodeLibrary.length) {
        return snapshot.nodeLibrary.map(cloneLibraryRecord).filter(Boolean);
      }
      var fromHierarchy = extractLibraryFromHierarchy(snapshot);
      if (fromHierarchy.length) {
        return fromHierarchy;
      }
      return extractLibraryFromNodes(snapshot);
    }

    function syncSnapshot(snapshot) {
      state.snapshot = snapshot || services.getSnapshot({});
      state.nodeLibrary = resolveNodeLibrary(state.snapshot);
      state.hierarchy = (state.snapshot && state.snapshot.hierarchy) || { groups: {}, nodes: {} };
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
      ensureExplorerPathValid();
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
      syncExplorerToNode(nodeId);
      renderForm();
      renderChart();
      renderNodeList();
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

    function buildAncestorPath(nodeId) {
      var path = [];
      var visited = {};
      var current = nodeId ? findNode(nodeId) : null;
      while (current && current.parentId) {
        if (visited[current.parentId]) {
          break;
        }
        visited[current.parentId] = true;
        path.unshift(current.parentId);
        current = findNode(current.parentId);
      }
      return path;
    }

    function ensureExplorerPathValid() {
      if (!Array.isArray(state.explorerPath)) {
        state.explorerPath = [];
        return;
      }
      var next = [];
      for (var i = 0; i < state.explorerPath.length; i += 1) {
        var candidate = state.explorerPath[i];
        if (candidate && findNode(candidate)) {
          next.push(candidate);
        } else {
          break;
        }
      }
      state.explorerPath = next;
    }

    function syncExplorerToNode(nodeId) {
      var ancestors = buildAncestorPath(nodeId);
      if (nodeId && findNode(nodeId) && ancestors.indexOf(nodeId) === -1) {
        ancestors.push(nodeId);
      }
      state.explorerPath = ancestors;
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
      if (!nodeModalImpactSelect || !nodeModalManualFields) {
        return;
      }
      nodeModalImpactSelect.innerHTML = "";
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
        nodeModalImpactSelect.appendChild(option);
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
            nodeModalImpactSelect.appendChild(childOption);
          });
        }
      });
      if (!nodeModalImpactSelect.options.length) {
        nodeModalImpactSelect.disabled = true;
      }
      applyNodeModalMode(state.nodeModalState ? state.nodeModalState.mode : "edit");
    }


    function getExplorerContext() {
      var context = {
        path: Array.isArray(state.explorerPath) ? state.explorerPath.slice() : [],
        currentId: null,
        group: null,
        groups: [],
        nodes: []
      };
      if (context.path.length) {
        context.currentId = context.path[context.path.length - 1];
        context.group = findNode(context.currentId);
      }
      var list = (state.snapshot && state.snapshot.nodes) || [];
      for (var i = 0; i < list.length; i += 1) {
        var entry = list[i];
        if (!entry || !entry.id) {
          continue;
        }
        var parentId = entry.parentId || null;
        if (parentId === (context.currentId || null)) {
          context.groups.push(entry);
        }
      }
      if (context.group && Array.isArray(context.group.children)) {
        for (var j = 0; j < context.group.children.length; j += 1) {
          var child = context.group.children[j];
          if (!child || !child.id) {
            continue;
          }
          context.nodes.push({
            id: child.id,
            name: child.name,
            unit: child.unit,
            lower: child.lower,
            center: child.center,
            upper: child.upper,
            manual: child.manual,
            manualStep: child.manualStep,
            mesSourceId: child.mesSourceId || null,
            parentId: context.group.id
          });
        }
      }
      return context;
    }

    function formatExplorerBound(value) {
      if (typeof value !== "number" || !isFinite(value)) {
        return "";
      }
      var fixed = value.toFixed(3);
      while (fixed.indexOf('.') !== -1 && (fixed.charAt(fixed.length - 1) === '0' || fixed.charAt(fixed.length - 1) === '.')) {
        fixed = fixed.substring(0, fixed.length - 1);
      }
      return fixed;
    }

    function createExplorerItem(type, record, parentId) {
      var item = document.createElement("div");
      var className = "trend-explorer-item";
      if (type === "group") {
        className += " is-group";
        if (state.editingNodeId === record.id) {
          className += " is-active";
        }
      } else if (type === "output") {
        className += " is-output";
      } else {
        className += " is-node";
      }
      item.className = className;
      item.setAttribute("data-type", type);
      if (record.id) {
        item.setAttribute("data-id", record.id);
      }
      if (parentId) {
        item.setAttribute("data-parent", parentId);
      }
      var icon = document.createElement("div");
      icon.className = "trend-explorer-icon";
      item.appendChild(icon);
      var name = document.createElement("div");
      name.className = "trend-explorer-name";
      if (record.name) {
        name.textContent = record.name;
      } else if (type === "group") {
        name.textContent = "节点组";
      } else if (type === "output") {
        name.textContent = "引出量";
      } else {
        name.textContent = "节点";
      }
      item.appendChild(name);
      var meta = document.createElement("div");
      meta.className = "trend-explorer-meta";
      var parts = [];
      if (type === "group") {
        if (record.id) {
          parts.push("ID " + record.id);
        }
        var count = 0;
        if (Array.isArray(record.children)) {
          count = record.children.length;
        } else if (typeof record.nodeCount === "number") {
          count = record.nodeCount;
        }
        parts.push("节点 " + count);
        var aggregate = summarizeGroupChildren(Array.isArray(record.children) ? record.children : []);
        if (aggregate.displayUnit) {
          parts.push("涵盖单位 " + aggregate.displayUnit);
        }
        if (aggregate.lower !== null && aggregate.upper !== null) {
          parts.push("节点区间 " + aggregate.lower.toFixed(3) + " ~ " + aggregate.upper.toFixed(3));
        } else if (aggregate.center !== null) {
          parts.push("节点中值约 " + aggregate.center.toFixed(3));
        }
        if (record.simulate === false) {
          parts.push("演示停用");
        }
      } else if (type === "output") {
        var bounds = [];
        if (typeof record.center === "number") {
          bounds.push("中心 " + formatExplorerBound(record.center));
        }
        if (typeof record.lower === "number" && typeof record.upper === "number") {
          bounds.push("范围 " + formatExplorerBound(record.lower) + " ~ " + formatExplorerBound(record.upper));
        }
        if (record.unit) {
          bounds.push("单位 " + record.unit);
        }
        if (bounds.length) {
          parts.push(bounds.join(" · "));
        }
        if (record.note) {
          parts.push(record.note);
        }
        if (record.mesSourceId) {
          var mesDescriptor = findMesEndpointById(record.mesSourceId);
          parts.push("MES " + (mesDescriptor ? describeMesEndpoint(mesDescriptor) : record.mesSourceId));
        }
      } else {
        if (record.id) {
          parts.push("ID " + record.id);
        }
        if (record.unit) {
          parts.push("单位 " + record.unit);
        }
        if (typeof record.lower === "number") {
          parts.push("下限 " + formatExplorerBound(record.lower));
        }
        if (typeof record.center === "number") {
          parts.push("中值 " + formatExplorerBound(record.center));
        }
        if (typeof record.upper === "number") {
          parts.push("上限 " + formatExplorerBound(record.upper));
        }
        if (record.manual) {
          parts.push("手动节点");
        }
        if (record.mesSourceId) {
          var endpoint = findMesEndpointById(record.mesSourceId);
          if (endpoint) {
            parts.push("MES " + describeMesEndpoint(endpoint));
          } else {
            parts.push("MES " + record.mesSourceId);
          }
        }
      }
      meta.textContent = parts.join(" · ");
      item.appendChild(meta);
      if (type === "group" && record.note) {
        var note = document.createElement("div");
        note.className = "trend-explorer-note";
        note.textContent = record.note;
        item.appendChild(note);
      }
      item.addEventListener("click", function () {
        closeExplorerMenu();
        if (type === "group") {
          handleNodeSelection(record.id);
        } else if (type === "output") {
          openOutputNodeModal({ mode: "view" });
        } else if (parentId) {
          handleNodeSelection(parentId);
          openNodeEditor(parentId, record.id, false);
        }
      });
      item.addEventListener("dblclick", function () {
        closeExplorerMenu();
        if (type === "group") {
          enterExplorerGroup(record.id);
        } else if (type === "output") {
          openOutputNodeModal({ mode: "edit" });
        } else if (parentId) {
          openNodeEditor(parentId, record.id, true);
        }
      });
      item.addEventListener("contextmenu", function (evt) {
        openExplorerMenu(evt, {
          type: type,
          id: record.id,
          parentId: type === "group" ? record.id : parentId
        });
      });
      return item;
    }

    function renderExplorerBreadcrumb(context) {
      if (!explorerBreadcrumbEl) {
        return;
      }
      explorerBreadcrumbEl.innerHTML = "";
      var path = context && context.path ? context.path : [];
      var rootBtn = document.createElement("button");
      rootBtn.type = "button";
      rootBtn.textContent = "顶层节点组";
      rootBtn.setAttribute("data-depth", "0");
      explorerBreadcrumbEl.appendChild(rootBtn);
      for (var i = 0; i < path.length; i += 1) {
        var group = findNode(path[i]);
        var crumb = document.createElement("button");
        crumb.type = "button";
        crumb.textContent = group && group.name ? group.name : "节点组";
        crumb.setAttribute("data-depth", String(i + 1));
        explorerBreadcrumbEl.appendChild(crumb);
      }
    }

    function buildOutputExplorerRecord() {
      var record = buildOutputNodeRecord();
      if (!record) {
        return null;
      }
      return {
        id: record.id,
        name: record.name,
        lower: record.lower,
        center: record.center,
        upper: record.upper,
        unit: record.unit,
        note: record.note,
        mesSourceId: record.mesSourceId
      };
    }

    function renderNodeList() {
      if (!explorerGridEl) {
        return;
      }
      ensureExplorerPathValid();
      closeExplorerMenu();
      var context = getExplorerContext();
      renderExplorerBreadcrumb(context);
      if (explorerAddNodeBtn) {
        explorerAddNodeBtn.disabled = !context.currentId;
      }
      if (explorerUpBtn) {
        explorerUpBtn.disabled = !context.path.length;
      }
      explorerGridEl.innerHTML = "";
      var hasContent = false;
      var i;
      for (i = 0; i < context.groups.length; i += 1) {
        var groupItem = createExplorerItem("group", context.groups[i], context.currentId);
        explorerGridEl.appendChild(groupItem);
        hasContent = true;
      }
      for (i = 0; i < context.nodes.length; i += 1) {
        var nodeItem = createExplorerItem("node", context.nodes[i], context.currentId);
        explorerGridEl.appendChild(nodeItem);
        hasContent = true;
      }
      if (explorerEmptyEl) {
        explorerEmptyEl.hidden = hasContent;
        if (!hasContent) {
          explorerEmptyEl.textContent = context.currentId ? "该节点组下暂无内容，右键创建子节点组或节点。" : "暂无节点组，请使用右键菜单或按钮创建。";
        }
      }
    }


    function resolveExplorerItemElement(element) {
      var current = element;
      while (current && current !== explorerContainer) {
        if (current.classList && current.classList.contains("trend-explorer-item")) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    }

    function enterExplorerGroup(groupId) {
      if (!groupId) {
        return;
      }
      ensureExplorerPathValid();
      var path = Array.isArray(state.explorerPath) ? state.explorerPath.slice() : [];
      var index = -1;
      for (var i = 0; i < path.length; i += 1) {
        if (path[i] === groupId) {
          index = i;
          break;
        }
      }
      if (index !== -1) {
        state.explorerPath = path.slice(0, index + 1);
      } else {
        path.push(groupId);
        state.explorerPath = path;
      }
      renderNodeList();
    }

    function exitExplorerGroup() {
      if (!Array.isArray(state.explorerPath) || !state.explorerPath.length) {
        return;
      }
      state.explorerPath.pop();
      renderNodeList();
    }

    function navigateExplorerToDepth(depth) {
      if (!Array.isArray(state.explorerPath)) {
        state.explorerPath = [];
        renderNodeList();
        return;
      }
      var nextDepth = depth;
      if (typeof nextDepth !== "number") {
        nextDepth = parseInt(nextDepth, 10);
      }
      if (isNaN(nextDepth) || nextDepth < 0) {
        nextDepth = 0;
      }
      if (nextDepth > state.explorerPath.length) {
        nextDepth = state.explorerPath.length;
      }
      state.explorerPath = state.explorerPath.slice(0, nextDepth);
      renderNodeList();
    }

    function openExplorerMenu(evt, context) {
      if (!explorerMenuEl) {
        return;
      }
      if (!context) {
        return;
      }
      evt.preventDefault();
      closeExplorerMenu();
      buildExplorerMenu(context);
      if (!explorerMenuEl.childNodes.length) {
        return;
      }
      explorerMenuContext = context;
      var left = evt.clientX;
      var top = evt.clientY;
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || explorerMenuEl.offsetWidth;
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || explorerMenuEl.offsetHeight;
      if (left < 0) {
        left = 0;
      }
      if (top < 0) {
        top = 0;
      }
      explorerMenuEl.style.left = left + "px";
      explorerMenuEl.style.top = top + "px";
      explorerMenuEl.hidden = false;
      var menuRect = explorerMenuEl.getBoundingClientRect();
      var adjustedLeft = left;
      var adjustedTop = top;
      if (adjustedLeft + menuRect.width > viewportWidth) {
        adjustedLeft = Math.max(0, viewportWidth - menuRect.width - 12);
      }
      if (adjustedTop + menuRect.height > viewportHeight) {
        adjustedTop = Math.max(0, viewportHeight - menuRect.height - 12);
      }
      explorerMenuEl.style.left = adjustedLeft + "px";
      explorerMenuEl.style.top = adjustedTop + "px";
    }

    function closeExplorerMenu() {
      if (explorerMenuEl) {
        explorerMenuEl.hidden = true;
      }
      explorerMenuContext = null;
    }

    function openConsolePanel() {
      if (!consolePanelEl) {
        return;
      }
      consolePanelEl.classList.remove("hidden");
    }

    function closeConsolePanelOverlay() {
      if (!consolePanelEl) {
        return;
      }
      consolePanelEl.classList.add("hidden");
    }

    function focusConsoleSettings() {
      openConsolePanel();
      if (targetCenterInput) {
        window.setTimeout(function () {
          try {
            targetCenterInput.focus();
            targetCenterInput.select();
          } catch (err) {}
        }, 0);
      }
    }

    function focusConsoleMes() {
      openConsolePanel();
      window.setTimeout(function () {
        try {
          if (endpointListEl && endpointListEl.scrollIntoView) {
            endpointListEl.scrollIntoView({ behavior: "smooth", block: "center" });
          } else if (addEndpointBtn && addEndpointBtn.focus) {
            addEndpointBtn.focus();
          }
        } catch (err) {}
      }, 0);
    }

    function buildExplorerMenu(context) {
      if (!explorerMenuEl) {
        return;
      }
      explorerMenuEl.innerHTML = "";
      var actions = [];
      if (!context) {
        return;
      }
      if (context.type === "group") {
        actions.push({
          label: "打开节点组",
          handler: function (groupId) {
            return function () {
              enterExplorerGroup(groupId);
            };
          }(context.id)
        });
        actions.push({
          label: "查看趋势",
          handler: function (groupId) {
            return function () {
              viewGroupTrend(groupId);
            };
          }(context.id)
        });
        actions.push({
          label: "上移节点组",
          handler: function (groupId) {
            return function () {
              if (services.reorderGroup) {
                services.reorderGroup(groupId, "up");
              }
            };
          }(context.id)
        });
        actions.push({
          label: "下移节点组",
          handler: function (groupId) {
            return function () {
              if (services.reorderGroup) {
                services.reorderGroup(groupId, "down");
              }
            };
          }(context.id)
        });
        actions.push("divider");
        actions.push({
          label: "新建子节点组",
          handler: function (groupId) {
            return function () {
              startCreateGroup(groupId);
            };
          }(context.id)
        });
        actions.push({
          label: "新建节点",
          handler: function (groupId) {
            return function () {
              startCreateNode(groupId);
            };
          }(context.id)
        });
        actions.push("divider");
        actions.push({
          label: "复制节点组",
          handler: function (groupId) {
            return function () {
              duplicateGroup(groupId);
            };
          }(context.id)
        });
        actions.push({
          label: "编辑节点组",
          handler: function (groupId) {
            return function () {
              openGroupModal(groupId, null);
            };
          }(context.id)
        });
        actions.push({
          label: "删除节点组",
          handler: function (groupId) {
            return function () {
              deleteGroup(groupId);
            };
          }(context.id)
        });
        actions.push({
          label: "打开系统设置",
          handler: function () {
            openSettingsModal();
          }
        });
      } else if (context.type === "node") {
        actions.push({
          label: "查看节点详情",
          handler: function (groupId, nodeId) {
            return function () {
              openNodeEditor(groupId, nodeId, false);
            };
          }(context.parentId, context.id)
        });
        actions.push({
          label: "编辑节点",
          handler: function (groupId, nodeId) {
            return function () {
              openNodeEditor(groupId, nodeId, true);
            };
          }(context.parentId, context.id)
        });
        actions.push({
          label: "查看所属节点组趋势",
          handler: function (groupId) {
            return function () {
              viewGroupTrend(groupId);
            };
          }(context.parentId)
        });
      } else if (context.type === "output") {
        actions.push({
          label: "查看引出量详情",
          handler: function () {
            openOutputNodeModal({ mode: "view" });
          }
        });
        actions.push({
          label: "编辑引出量目标",
          handler: function () {
            openOutputNodeModal({ mode: "edit" });
          }
        });
        actions.push({
          label: "打开趋势控制台",
          handler: function () {
            openConsolePanel();
          }
        });
        actions.push({
          label: "打开系统设置",
          handler: function () {
            openSettingsModal();
          }
        });
      } else {
        actions.push({
          label: "新建节点组",
          handler: function (parentId) {
            return function () {
              startCreateGroup(parentId || null);
            };
          }(context.parentId || null)
        });
        if (context.parentId) {
          actions.push({
            label: "新建节点",
            handler: function (parentId) {
              return function () {
                startCreateNode(parentId);
              };
            }(context.parentId)
          });
        }
        actions.push("divider");
        actions.push({
          label: "打开趋势控制台",
          handler: function () {
            openConsolePanel();
          }
        });
        actions.push({
          label: "打开系统设置",
          handler: function () {
            openSettingsModal();
          }
        });
        actions.push({
          label: "打开 MES 设置",
          handler: function () {
            openSettingsModal();
          }
        });
      }
      for (var i = 0; i < actions.length; i += 1) {
        var action = actions[i];
        if (action === "divider") {
          var hr = document.createElement("hr");
          explorerMenuEl.appendChild(hr);
          continue;
        }
        if (!action || typeof action.handler !== "function") {
          continue;
        }
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = action.label;
        btn.addEventListener("click", (function (handler) {
          return function () {
            handler();
            closeExplorerMenu();
          };
        })(action.handler));
        explorerMenuEl.appendChild(btn);
      }
    }

    function startCreateGroup(parentId) {
      closeExplorerMenu();
      openGroupModal(null, parentId || null);
    }

    function startCreateNode(parentId) {
      closeExplorerMenu();
      var targetParent = parentId || null;
      if (!targetParent) {
        var context = getExplorerContext();
        targetParent = context && context.currentId ? context.currentId : null;
      }
      if (!targetParent) {
        if (services.toast) {
          services.toast("请先选择节点组");
        }
        return;
      }
      var group = findNode(targetParent);
      if (!group) {
        if (services.toast) {
          services.toast("未找到节点组");
        }
        return;
      }
      state.editingNodeId = targetParent;
      state.editingSubNodes = ensureEditingChildren(clone(group.children) || []);
      openNodeModal(state.editingSubNodes.length, { isNew: true });
    }

    function editGroup(groupId) {
      closeExplorerMenu();
      if (!groupId) {
        return;
      }
      openGroupModal(groupId, null);
    }

    function editGroupNote(groupId) {
      closeExplorerMenu();
      if (!groupId) {
        return;
      }
      openGroupModal(groupId, null);
    }

    function duplicateGroup(groupId) {
      closeExplorerMenu();
      if (!groupId) {
        return;
      }
      var source = findNode(groupId);
      if (!source) {
        if (services.toast) {
          services.toast("未找到节点组");
        }
        return;
      }
      var payload = clone(source);
      payload.originalId = null;
      payload.id = generateUniqueGroupId();
      payload.name = (source.name || "节点组") + " 副本";
      payload.parentId = source.parentId || null;
      payload.positionMode = "after";
      payload.positionRef = null;
      payload.children = [];
      if (Array.isArray(source.children)) {
        for (var i = 0; i < source.children.length; i += 1) {
          var child = source.children[i];
          if (!child) {
            continue;
          }
          var childCopy = clone(child);
          childCopy.originalId = child.id || child.originalId || null;
          childCopy.id = generateUniqueNodeId();
          payload.children.push(childCopy);
        }
      }
      var saved = services.upsertNode(payload);
      if (saved && saved.id) {
        openConsolePanel();
        handleNodeSelection(saved.id);
      }
      if (services.toast) {
        services.toast("节点组已复制");
      }
      render();
    }

    function deleteGroup(groupId) {
      closeExplorerMenu();
      if (!groupId) {
        return;
      }
      var target = findNode(groupId);
      if (!target) {
        if (services.toast) {
          services.toast("未找到节点组");
        }
        return;
      }
      var message = "确认删除节点组“" + (target.name || groupId) + "”及其所有子节点？";
      if (typeof window.confirm === "function" && !window.confirm(message)) {
        return;
      }
      if (services.removeNode) {
        services.removeNode(groupId);
      }
      if (state.editingNodeId === groupId) {
        state.editingNodeId = null;
        state.editingSubNodes = [];
      }
      render();
    }

    function populateGroupModalParentOptions(currentId) {
      if (!groupModalParentSelect) {
        return;
      }
      groupModalParentSelect.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "顶层节点组";
      groupModalParentSelect.appendChild(placeholder);
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
        option.textContent = formatGroupPathLabel(group.id) || group.name || "节点组";
        groupModalParentSelect.appendChild(option);
      });
    }

    function openGroupModal(groupId, defaultParentId) {
      if (!groupModalEl || !groupModalForm) {
        return;
      }
      var record = groupId ? findNode(groupId) : null;
      var mode = record ? "edit" : "create";
      state.groupModalState = {
        mode: mode,
        originalId: record ? record.id : null
      };
      populateGroupModalParentOptions(record ? record.id : null);
      if (groupModalKeyInput) {
        groupModalKeyInput.value = record ? record.id : generateUniqueGroupId();
      }
      if (groupModalNameInput) {
        groupModalNameInput.value = record && record.name ? record.name : "";
      }
      if (groupModalNoteInput) {
        groupModalNoteInput.value = record && record.note ? record.note : "";
      }
      if (groupModalParentSelect) {
        var parentValue = record ? record.parentId || "" : (defaultParentId || "");
        groupModalParentSelect.value = parentValue;
      }
      var titleEl = document.getElementById("trendGroupModalTitle");
      if (titleEl) {
        titleEl.textContent = record ? "编辑节点组" : "新建节点组";
      }
      if (groupModalDuplicateBtn) {
        if (record) {
          groupModalDuplicateBtn.classList.remove("hidden");
        } else {
          groupModalDuplicateBtn.classList.add("hidden");
        }
      }
      groupModalEl.classList.remove("hidden");
      window.setTimeout(function () {
        try {
          if (groupModalNameInput) {
            if (record) {
              groupModalNameInput.select();
            }
            groupModalNameInput.focus();
          }
        } catch (err) {}
      }, 0);
    }

    function closeGroupModal() {
      if (!groupModalEl) {
        return;
      }
      groupModalEl.classList.add("hidden");
      state.groupModalState = null;
    }

    function submitGroupModal(evt) {
      if (evt) {
        evt.preventDefault();
      }
      if (!groupModalForm) {
        return;
      }
      var idValue = groupModalKeyInput && groupModalKeyInput.value ? groupModalKeyInput.value.trim() : "";
      if (!idValue) {
        if (services.toast) {
          services.toast("请输入节点组标识");
        }
        return;
      }
      var originalId = state.groupModalState && state.groupModalState.originalId ? state.groupModalState.originalId : null;
      if (isGroupIdTaken(idValue, originalId || null)) {
        if (services.toast) {
          services.toast("节点组 ID 已存在，请更换");
        }
        return;
      }
      var nameValue = groupModalNameInput && groupModalNameInput.value ? groupModalNameInput.value.trim() : "";
      var noteValue = groupModalNoteInput && groupModalNoteInput.value ? groupModalNoteInput.value.trim() : "";
      var parentValue = groupModalParentSelect && groupModalParentSelect.value ? groupModalParentSelect.value : null;
      var payload = {
        id: idValue,
        originalId: originalId,
        name: nameValue || "节点组",
        note: noteValue,
        parentId: parentValue,
        positionMode: "after"
      };
      var saved = services.upsertNode(payload);
      closeGroupModal();
      if (saved && saved.id) {
        state.editingNodeId = saved.id;
        render();
      }
      if (services.toast) {
        services.toast(originalId ? "节点组已更新" : "节点组已创建");
      }
    }

    var targetModalMode = "edit";
    var targetModalSubmitBtn = targetModalForm ? targetModalForm.querySelector('button[type="submit"]') : null;

    function applyTargetModalMode() {
      if (!targetModalForm) {
        return;
      }
      var viewMode = targetModalMode === "view";
      var inputs = [targetModalLowerInput, targetModalCenterInput, targetModalUpperInput];
      for (var i = 0; i < inputs.length; i += 1) {
        if (!inputs[i]) {
          continue;
        }
        inputs[i].readOnly = viewMode;
        inputs[i].disabled = viewMode;
        if (viewMode) {
          inputs[i].classList.add("input-readonly");
        } else {
          inputs[i].classList.remove("input-readonly");
        }
      }
      if (targetModalSubmitBtn) {
        targetModalSubmitBtn.classList.toggle("hidden", viewMode);
      }
      if (targetModalCancelBtn) {
        targetModalCancelBtn.textContent = viewMode ? "关闭" : "取消";
      }
      if (targetModalForm) {
        if (viewMode) {
          targetModalForm.classList.add("is-view");
        } else {
          targetModalForm.classList.remove("is-view");
        }
      }
      if (targetSummaryEl) {
        if (viewMode) {
          targetSummaryEl.classList.remove("hidden");
        } else {
          targetSummaryEl.classList.add("hidden");
        }
      }
    }

    function openTargetModal(options) {
      if (!targetModalEl || !targetModalForm) {
        return;
      }
      targetModalMode = options && options.mode === "view" ? "view" : "edit";
      var target = state.snapshot && state.snapshot.settings ? state.snapshot.settings.outputTarget || {} : {};
      if (targetModalLowerInput) {
        targetModalLowerInput.value = typeof target.lower === "number" ? target.lower : "";
      }
      if (targetModalCenterInput) {
        targetModalCenterInput.value = typeof target.center === "number" ? target.center : "";
      }
      if (targetModalUpperInput) {
        targetModalUpperInput.value = typeof target.upper === "number" ? target.upper : "";
      }
      renderTargetSummary(target);
      applyTargetModalMode();
      targetModalEl.classList.remove("hidden");
      window.setTimeout(function () {
        try {
          if (targetModalCenterInput && targetModalMode !== "view") {
            targetModalCenterInput.focus();
            targetModalCenterInput.select();
          }
        } catch (err) {}
      }, 0);
    }

    function closeTargetModal() {
      if (!targetModalEl) {
        return;
      }
      targetModalEl.classList.add("hidden");
    }

    function submitTargetModal(evt) {
      if (evt) {
        evt.preventDefault();
      }
      if (targetModalMode === "view") {
        closeTargetModal();
        return;
      }
      var centerValue = targetModalCenterInput && targetModalCenterInput.value ? parseFloat(targetModalCenterInput.value) : null;
      if (centerValue === null || isNaN(centerValue)) {
        if (services.toast) {
          services.toast("请填写引出量中心");
        }
        return;
      }
      var lowerValue = targetModalLowerInput && targetModalLowerInput.value ? parseFloat(targetModalLowerInput.value) : null;
      var upperValue = targetModalUpperInput && targetModalUpperInput.value ? parseFloat(targetModalUpperInput.value) : null;
      services.updateSettings({
        outputTarget: {
          center: centerValue,
          lower: lowerValue,
          upper: upperValue
        }
      });
      closeTargetModal();
      if (services.toast) {
        services.toast("引出量目标已更新");
      }
    }

    function openSettingsModal() {
      if (!settingsModalEl) {
        return;
      }
      state.settingsModalState = { openedAt: Date.now() };
      renderSettingsForm();
      renderEndpoints();
      settingsModalEl.classList.remove("hidden");
    }

    function closeSettingsModal() {
      if (!settingsModalEl) {
        return;
      }
      settingsModalEl.classList.add("hidden");
      state.settingsModalState = null;
    }

    function submitSettingsModal(evt) {
      if (evt) {
        evt.preventDefault();
      }
      var sampleValue = settingsModalSampleInput && settingsModalSampleInput.value ? parseInt(settingsModalSampleInput.value, 10) : null;
      var lookbackValue = settingsModalLookbackInput && settingsModalLookbackInput.value ? parseInt(settingsModalLookbackInput.value, 10) : null;
      var predictionValue = settingsModalPredictionInput && settingsModalPredictionInput.value ? parseInt(settingsModalPredictionInput.value, 10) : null;
      var lowerValue = settingsModalLowerInput && settingsModalLowerInput.value !== "" ? parseFloat(settingsModalLowerInput.value) : null;
      var centerValue = settingsModalCenterInput && settingsModalCenterInput.value !== "" ? parseFloat(settingsModalCenterInput.value) : null;
      var upperValue = settingsModalUpperInput && settingsModalUpperInput.value !== "" ? parseFloat(settingsModalUpperInput.value) : null;
      services.updateSettings({
        sampleIntervalMs: sampleValue || 60000,
        lookbackMinutes: lookbackValue || 120,
        predictionMinutes: predictionValue || 30,
        outputTarget: {
          lower: lowerValue === null || isNaN(lowerValue) ? null : lowerValue,
          center: centerValue === null || isNaN(centerValue) ? null : centerValue,
          upper: upperValue === null || isNaN(upperValue) ? null : upperValue
        }
      });
      closeSettingsModal();
      if (services.toast) {
        services.toast("设置已更新");
      }
    }

    function openEndpointModal(endpoint) {
      if (!endpointModalEl || !endpointModalForm) {
        return;
      }
      var mode = endpoint && endpoint.id ? "edit" : "create";
      state.endpointModalState = {
        mode: mode,
        id: endpoint && endpoint.id ? endpoint.id : null
      };
      if (endpointModalNameInput) {
        endpointModalNameInput.value = endpoint && endpoint.name ? endpoint.name : "";
      }
      if (endpointModalTypeSelect) {
        endpointModalTypeSelect.value = endpoint && endpoint.type ? endpoint.type : "rest";
      }
      if (endpointModalEnabledSelect) {
        endpointModalEnabledSelect.value = endpoint && endpoint.enabled === false ? "false" : "true";
      }
      if (endpointModalUrlInput) {
        endpointModalUrlInput.value = endpoint && endpoint.url ? endpoint.url : "";
      }
      if (endpointModalDatabaseInput) {
        endpointModalDatabaseInput.value = endpoint && endpoint.database ? endpoint.database : "";
      }
      if (endpointModalTableInput) {
        endpointModalTableInput.value = endpoint && endpoint.table ? endpoint.table : "";
      }
      if (endpointModalNotesInput) {
        endpointModalNotesInput.value = endpoint && endpoint.notes ? endpoint.notes : "";
      }
      var titleEl = document.getElementById("trendEndpointModalTitle");
      if (titleEl) {
        titleEl.textContent = mode === "edit" ? "编辑数据源" : "新增数据源";
      }
      endpointModalEl.classList.remove("hidden");
      window.setTimeout(function () {
        try {
          if (endpointModalNameInput) {
            endpointModalNameInput.focus();
            endpointModalNameInput.select();
          }
        } catch (err) {}
      }, 0);
    }

    function closeEndpointModal() {
      if (!endpointModalEl) {
        return;
      }
      endpointModalEl.classList.add("hidden");
      state.endpointModalState = null;
    }

    function submitEndpointModal(evt) {
      if (evt) {
        evt.preventDefault();
      }
      if (!endpointModalForm) {
        return;
      }
      var nameValue = endpointModalNameInput && endpointModalNameInput.value ? endpointModalNameInput.value.trim() : "";
      if (!nameValue) {
        if (services.toast) {
          services.toast("请输入数据源名称");
        }
        return;
      }
      var payload = {
        name: nameValue,
        type: endpointModalTypeSelect ? endpointModalTypeSelect.value : "rest",
        enabled: !endpointModalEnabledSelect || endpointModalEnabledSelect.value !== "false",
        url: endpointModalUrlInput ? endpointModalUrlInput.value.trim() : "",
        database: endpointModalDatabaseInput ? endpointModalDatabaseInput.value.trim() : "",
        table: endpointModalTableInput ? endpointModalTableInput.value.trim() : "",
        notes: endpointModalNotesInput ? endpointModalNotesInput.value.trim() : ""
      };
      if (state.endpointModalState && state.endpointModalState.mode === "edit" && state.endpointModalState.id) {
        services.updateEndpoint(state.endpointModalState.id, payload);
      } else {
        services.registerEndpoint(payload);
      }
      closeEndpointModal();
      if (services.toast) {
        services.toast("数据源已保存");
      }
    }

    function viewGroupTrend(groupId) {
      closeExplorerMenu();
      if (!groupId) {
        return;
      }
      openConsolePanel();
      handleNodeSelection(groupId);
    }

    function openNodeEditor(groupId, nodeId, allowEdit) {
      if (!groupId || !nodeId) {
        return;
      }
      handleNodeSelection(groupId);
      if (!state.editingSubNodes || !state.editingSubNodes.length) {
        return;
      }
      var index = -1;
      for (var i = 0; i < state.editingSubNodes.length; i += 1) {
        var sub = state.editingSubNodes[i];
        if (sub && sub.id === nodeId) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        if (services.toast) {
          services.toast("未找到该节点");
        }
        return;
      }
      if (allowEdit) {
        openNodeModal(index, { isNew: false, mode: "edit" });
      } else {
        openNodeModal(index, { isNew: false, mode: "view" });
      }
    }

    function openOutputNodeModal(options) {
      if (!nodeModalEl || !nodeModalForm) {
        return;
      }
      var record = buildOutputNodeRecord();
      if (!record) {
        return;
      }
      var draft = {
        id: record.id,
        originalId: record.id,
        name: record.name || "引出量中心",
        unit: record.unit || "",
        lower: typeof record.lower === "number" ? record.lower : null,
        center: typeof record.center === "number" ? record.center : null,
        upper: typeof record.upper === "number" ? record.upper : null,
        manual: false,
        manualStep: null,
        manualTargets: [],
        mesSourceId: record.mesSourceId || null,
        simulate: true
      };
      var mode = options && options.mode === "edit" ? "edit" : "view";
      state.nodeModalState = {
        index: -1,
        isNew: false,
        draft: draft,
        mode: mode,
        groupId: null,
        isOutput: true
      };
      populateNodeModal(draft);
      applyNodeModalMode(mode);
      nodeModalEl.classList.remove("hidden");
    }

    function handleExplorerDocumentClick(evt) {
      if (!explorerMenuEl || explorerMenuEl.hidden) {
        return;
      }
      var target = evt.target;
      if (target === explorerMenuEl) {
        return;
      }
      if (explorerMenuEl.contains(target)) {
        return;
      }
      closeExplorerMenu();
    }

    function handleExplorerKeydown(evt) {
      var key = evt.key || evt.keyCode;
      if (!(key === "Escape" || key === "Esc" || key === 27)) {
        return;
      }
      var handled = false;
      if (explorerMenuEl && !explorerMenuEl.hidden) {
        closeExplorerMenu();
        handled = true;
      }
      if (consolePanelEl && !consolePanelEl.classList.contains("hidden")) {
        closeConsolePanelOverlay();
        handled = true;
      }
      if (handled) {
        evt.preventDefault();
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

    function summarizeGroupChildren(children) {
      if (!Array.isArray(children)) {
        children = [];
      }
      var units = [];
      var firstUnit = "";
      var lowers = [];
      var uppers = [];
      var centers = [];
      var manualCount = 0;
      children.forEach(function (child) {
        if (!child || typeof child !== "object") {
          return;
        }
        if (child.unit && units.indexOf(child.unit) === -1) {
          units.push(child.unit);
          if (!firstUnit) {
            firstUnit = child.unit;
          }
        }
        if (typeof child.lower === "number") {
          lowers.push(child.lower);
        }
        if (typeof child.upper === "number") {
          uppers.push(child.upper);
        }
        if (typeof child.center === "number") {
          centers.push(child.center);
        }
        if (child.manual) {
          manualCount += 1;
        }
      });
      var displayUnit = "";
      if (units.length === 1) {
        displayUnit = units[0];
      } else if (units.length > 1) {
        displayUnit = "多种";
      }
      var lower = lowers.length ? Math.min.apply(null, lowers) : null;
      var upper = uppers.length ? Math.max.apply(null, uppers) : null;
      var center = null;
      if (centers.length) {
        var sum = 0;
        centers.forEach(function (value) {
          sum += value;
        });
        center = sum / centers.length;
      }
      return {
        storedUnit: firstUnit || "",
        displayUnit: displayUnit,
        lower: typeof lower === "number" ? parseFloat(lower.toFixed(3)) : null,
        upper: typeof upper === "number" ? parseFloat(upper.toFixed(3)) : null,
        center: typeof center === "number" ? parseFloat(center.toFixed(3)) : null,
        manualCount: manualCount
      };
    }

    function buildOutputNodeRecord() {
      if (!state.snapshot || !state.snapshot.settings) {
        return null;
      }
      var settings = state.snapshot.settings;
      var target = settings.outputTarget || {};
      var id = settings.outputNodeId && settings.outputNodeId.trim() ? settings.outputNodeId.trim() : "__output__";
      return {
        id: id,
        name: settings.outputName || "引出量中心",
        lower: typeof target.lower === "number" ? target.lower : null,
        center: typeof target.center === "number" ? target.center : null,
        upper: typeof target.upper === "number" ? target.upper : null,
        unit: settings.outputUnit || "",
        note: settings.outputNote || "",
        mesSourceId: settings.outputMesSourceId ? String(settings.outputMesSourceId) : null
      };
    }

    function renderGroupSummary(group) {
      var children = state.editingSubNodes || [];
      var summary = summarizeGroupChildren(children);
      if (groupBoundsInfoEl) {
        if (!children.length) {
          groupBoundsInfoEl.textContent = "暂无节点，请新增监测点";
        } else {
          var infoParts = ["节点数 " + children.length];
          if (summary.displayUnit) {
            infoParts.push("涵盖单位 " + summary.displayUnit);
          }
          if (summary.lower !== null && summary.upper !== null) {
            infoParts.push("区间 " + summary.lower.toFixed(3) + " ~ " + summary.upper.toFixed(3));
          } else if (summary.center !== null) {
            infoParts.push("中值约 " + summary.center.toFixed(3));
          }
          if (summary.manualCount) {
            infoParts.push("手动节点 " + summary.manualCount + " 个");
          }
          groupBoundsInfoEl.textContent = infoParts.join(" · ");
        }
      }
      if (groupAnalyticsEl) {
        groupAnalyticsEl.innerHTML = "";
        var series = group && group.id ? collectFullSeries(group.id, null) : [];
        if (!series.length) {
          var empty = document.createElement("div");
          empty.className = "trend-group-analytics-empty";
          empty.textContent = "暂无趋势数据";
          groupAnalyticsEl.appendChild(empty);
        } else {
          var analytics = computeIntervalProfiles(series, state.selectedRange || 180);
          var table = document.createElement("table");
          var thead = document.createElement("thead");
          var headRow = document.createElement("tr");
          ["时间窗口", "斜率", "持续时间", "评价", "波动"].forEach(function (label) {
            var th = document.createElement("th");
            th.textContent = label;
            headRow.appendChild(th);
          });
          thead.appendChild(headRow);
          table.appendChild(thead);
          var tbody = document.createElement("tbody");
          analytics.forEach(function (entry) {
            var tr = document.createElement("tr");
            var evalClass = entry.evaluationLevel === "warning" || entry.evaluationLevel === "critical"
              ? "trend-analytics-warning"
              : "trend-analytics-eval";
            var cells = [entry.label, entry.slope, entry.duration, entry.evaluation, entry.fluctuations];
            for (var i = 0; i < cells.length; i += 1) {
              var td = document.createElement("td");
              td.textContent = cells[i];
              if (i === 3) {
                td.className = evalClass;
              }
              tr.appendChild(td);
            }
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          groupAnalyticsEl.appendChild(table);
        }
      }
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
        if (nodeParentSelect) {
          populateParentOptions(null);
          nodeParentSelect.value = state.pendingParentId || "";
        }
        if (nodePositionSelect) {
          nodePositionSelect.value = "after";
        }
        if (nodeRefField) {
          nodeRefField.hidden = true;
        }
        state.editingSubNodes = ensureEditingChildren([]);
        renderSubNodes();
        renderGroupSummary(null);
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
      if (nodeParentSelect) {
        populateParentOptions(node.id);
        nodeParentSelect.value = node.parentId || "";
      }
      if (nodePositionSelect) {
        nodePositionSelect.value = node.positionMode || "after";
      }
      if (nodeRefSelect) {
        nodeRefSelect.innerHTML = "";
        var nodes = (state.snapshot && state.snapshot.nodes) || [];
        nodes.forEach(function (candidate) {
          if (!candidate || candidate.id === node.id) {
            return;
          }
          var option = document.createElement("option");
          option.value = candidate.id;
          option.textContent = formatGroupPathLabel(candidate.id) || candidate.name;
          nodeRefSelect.appendChild(option);
        });
        if (node.positionRef) {
          nodeRefSelect.value = node.positionRef;
        }
      }
      if (nodeRefField) {
        nodeRefField.hidden = !nodePositionSelect || nodePositionSelect.value === "after";
      }
      state.editingSubNodes = node ? ensureEditingChildren(clone(node.children) || []) : [];
      renderSubNodes();
      renderGroupSummary(node);
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
        header.textContent = (item.name || ("节点 " + (index + 1)));
        card.appendChild(header);
        var info = document.createElement("div");
        info.className = "trend-subnode-meta";
        var parts = [];
        parts.push("ID " + (item.id || "--"));
        if (item.unit) {
          parts.push("单位 " + item.unit);
        }
        if (typeof item.lower === "number" && typeof item.upper === "number") {
          parts.push("范围 " + item.lower + " ~ " + item.upper);
        } else if (typeof item.center === "number") {
          parts.push("中值 " + item.center);
        }
        if (item.manual) {
          parts.push("手动节点");
        }
        if (item.simulate === false) {
          parts.push("演示停用");
        }
        if (item.mesSourceId) {
          var mesEndpoint = findMesEndpointById(item.mesSourceId);
          if (mesEndpoint) {
            parts.push("MES " + describeMesEndpoint(mesEndpoint));
          } else {
            parts.push("MES " + item.mesSourceId);
          }
        }
        info.textContent = parts.join(" · ");
        card.appendChild(info);
        var tools = document.createElement("div");
        tools.className = "trend-subnode-tools";
        var viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "ghost-button";
        viewBtn.textContent = "查看 / 编辑";
        viewBtn.addEventListener("click", function () {
          editSubNode(index);
        });
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost-button danger";
        removeBtn.textContent = "删除";
        removeBtn.addEventListener("click", function () {
          state.editingSubNodes.splice(index, 1);
          renderSubNodes();
          renderGroupSummary(findNode(state.editingNodeId));
        });
        tools.appendChild(viewBtn);
        tools.appendChild(removeBtn);
        card.appendChild(tools);
        subNodeListEl.appendChild(card);
      });
    }

    function updateNodeModalModeUI(editable) {
      var controls = [
        nodeModalKeyInput,
        nodeModalNameInput,
        nodeModalUnitInput,
        nodeModalSimulateSelect,
        nodeModalLowerInput,
        nodeModalCenterInput,
        nodeModalUpperInput,
        nodeModalMesSelect,
        nodeModalManualSelect,
        nodeModalStepInput
      ];
      for (var i = 0; i < controls.length; i += 1) {
        if (controls[i]) {
          controls[i].disabled = !editable;
        }
      }
      if (nodeModalImpactSelect) {
        var shouldDisableImpact = !editable || !state.nodeModalState || !state.nodeModalState.draft || !state.nodeModalState.draft.manual;
        nodeModalImpactSelect.disabled = shouldDisableImpact;
      }
      if (nodeModalSaveBtn) {
        if (editable) {
          nodeModalSaveBtn.classList.remove("hidden");
        } else {
          nodeModalSaveBtn.classList.add("hidden");
        }
      }
      if (nodeModalEditBtn) {
        if (editable) {
          nodeModalEditBtn.classList.add("hidden");
        } else {
          nodeModalEditBtn.classList.remove("hidden");
        }
      }
      var isOutput = state.nodeModalState && state.nodeModalState.isOutput;
      if (nodeModalDetailBtn) {
        if (isOutput) {
          nodeModalDetailBtn.classList.add("hidden");
        } else {
          nodeModalDetailBtn.classList.remove("hidden");
        }
      }
      if (isOutput) {
        if (nodeModalManualSelect) {
          nodeModalManualSelect.value = "false";
          nodeModalManualSelect.disabled = true;
        }
        if (nodeModalManualFields) {
          nodeModalManualFields.style.display = "none";
        }
        if (nodeModalImpactSelect) {
          nodeModalImpactSelect.innerHTML = "";
          nodeModalImpactSelect.disabled = true;
        }
        if (nodeModalSimulateSelect) {
          nodeModalSimulateSelect.value = "true";
          nodeModalSimulateSelect.disabled = true;
        }
      } else {
        if (nodeModalManualSelect) {
          nodeModalManualSelect.disabled = !editable;
        }
        if (nodeModalManualFields) {
          nodeModalManualFields.style.display = nodeModalManualSelect && nodeModalManualSelect.value === "true" ? "grid" : "none";
        }
        if (nodeModalImpactSelect && state.nodeModalState && state.nodeModalState.draft) {
          nodeModalImpactSelect.disabled = !editable || !state.nodeModalState.draft.manual;
        }
      }
    }

    function applyNodeModalMode(mode) {
      if (!state.nodeModalState) {
        return;
      }
      var nextMode = mode || state.nodeModalState.mode || "edit";
      state.nodeModalState.mode = nextMode;
      var editable = nextMode !== "view";
      updateNodeModalModeUI(editable);
    }

    function openNodeModal(index, options) {
      options = options || {};
      if (!nodeModalEl || !nodeModalForm) {
        return;
      }
      var draft;
      if (options.isNew) {
        draft = {
          id: generateUniqueNodeId(),
          originalId: null,
          name: "",
          unit: summarizeGroupChildren(state.editingSubNodes || []).storedUnit || "",
          lower: null,
          center: null,
          upper: null,
          manual: false,
          manualStep: null,
          manualTargets: [],
          mesSourceId: null,
          simulate: true
        };
      } else {
        var base = state.editingSubNodes[index];
        if (!base) {
          return;
        }
        draft = clone(base) || {};
        draft.originalId = draft.originalId || draft.id;
      }
      var mode = options.mode || (options.isNew ? "edit" : "edit");
      state.nodeModalState = {
        index: index,
        isNew: !!options.isNew,
        draft: draft,
        mode: mode,
        groupId: state.editingNodeId || null,
        isOutput: false
      };
      populateNodeModal(draft);
      applyNodeModalMode(mode);
      nodeModalEl.classList.remove("hidden");
    }

    function closeNodeModal() {
      if (!nodeModalEl) {
        return;
      }
      nodeModalEl.classList.add("hidden");
      state.nodeModalState = null;
    }

    function populateNodeModal(draft) {
      if (!draft) {
        return;
      }
      if (nodeModalKeyInput) {
        nodeModalKeyInput.value = draft.id || generateUniqueNodeId();
      }
      if (nodeModalNameInput) {
        nodeModalNameInput.value = draft.name || "";
      }
      if (nodeModalUnitInput) {
        nodeModalUnitInput.value = draft.unit || "";
      }
      if (nodeModalSimulateSelect) {
        nodeModalSimulateSelect.value = draft.simulate === false ? "false" : "true";
      }
      if (nodeModalLowerInput) {
        nodeModalLowerInput.value = typeof draft.lower === "number" ? draft.lower : "";
      }
      if (nodeModalCenterInput) {
        nodeModalCenterInput.value = typeof draft.center === "number" ? draft.center : "";
      }
      if (nodeModalUpperInput) {
        nodeModalUpperInput.value = typeof draft.upper === "number" ? draft.upper : "";
      }
      if (nodeModalManualSelect) {
        nodeModalManualSelect.value = draft.manual ? "true" : "false";
      }
      if (nodeModalStepInput) {
        nodeModalStepInput.value = typeof draft.manualStep === "number" ? draft.manualStep : "";
      }
      var selectedMesId = draft.mesSourceId ? String(draft.mesSourceId) : "";
      populateNodeMesOptions(selectedMesId);
      if (nodeModalMesSelect) {
        nodeModalMesSelect.value = selectedMesId;
      }
      renderManualImpactOptions(draft);
      if (nodeModalManualFields) {
        nodeModalManualFields.style.display = draft.manual ? "grid" : "none";
      }
      var series = state.editingNodeId ? collectFullSeries(state.editingNodeId, draft.id) : [];
      drawSeries(nodeModalChart, series, {
        color: "#2563eb",
        lower: typeof draft.lower === "number" ? draft.lower : null,
        upper: typeof draft.upper === "number" ? draft.upper : null,
        center: typeof draft.center === "number" ? draft.center : null,
        unit: draft.unit || ""
      });
      if (nodeModalMeta) {
        var metaLines = [];
        if (series.length) {
          var latest = series[series.length - 1];
          metaLines.push(
            "最新值 " + (typeof latest.value === "number" ? latest.value.toFixed(3) : "--") + (draft.unit ? " " + draft.unit : "")
          );
          metaLines.push("更新时间 " + formatDateTime(latest.capturedAt));
        } else {
          metaLines.push("暂无实时数据");
        }
        metaLines.push("演示模拟：" + (draft.simulate === false ? "停用" : "启用"));
        if (draft.manual) {
          metaLines.push("手动节点 · 标准调整 " + (draft.manualStep !== null ? draft.manualStep : 0));
        }
        if (selectedMesId) {
          var mesDescriptor = findMesEndpointById(selectedMesId);
          metaLines.push("MES 数据源：" + (mesDescriptor ? describeMesEndpoint(mesDescriptor) : selectedMesId));
        } else {
          metaLines.push("MES 数据源：未绑定");
        }
        nodeModalMeta.innerHTML = metaLines.join("<br>");
      }
      if (nodeModalAnalytics) {
        nodeModalAnalytics.innerHTML = "";
        if (!series.length) {
          var noData = document.createElement("div");
          noData.className = "trend-group-analytics-empty";
          noData.textContent = "暂无趋势数据";
          nodeModalAnalytics.appendChild(noData);
        } else {
          var rows = computeIntervalProfiles(series, state.selectedRange || 180);
          var table = document.createElement("table");
          var thead = document.createElement("thead");
          var headRow = document.createElement("tr");
          ["时间窗口", "斜率", "持续时间", "评价", "波动"].forEach(function (label) {
            var th = document.createElement("th");
            th.textContent = label;
            headRow.appendChild(th);
          });
          thead.appendChild(headRow);
          table.appendChild(thead);
          var tbody = document.createElement("tbody");
          rows.forEach(function (entry) {
            var tr = document.createElement("tr");
            var evalClass = entry.evaluationLevel === "warning" || entry.evaluationLevel === "critical"
              ? "trend-analytics-warning"
              : "trend-analytics-eval";
            [entry.label, entry.slope, entry.duration, entry.evaluation, entry.fluctuations].forEach(function (value, cellIndex) {
              var td = document.createElement("td");
              td.textContent = value;
              if (cellIndex === 3) {
                td.className = evalClass;
              }
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          nodeModalAnalytics.appendChild(table);
        }
      }
    }

    function collectNodeModalData() {
      if (!nodeModalKeyInput) {
        return null;
      }
      var key = nodeModalKeyInput.value ? nodeModalKeyInput.value.trim() : "";
      if (!key) {
        key = generateUniqueNodeId();
      }
      var draft = state.nodeModalState && state.nodeModalState.draft ? state.nodeModalState.draft : null;
      var originalId = draft && draft.originalId ? draft.originalId : key;
      if (isNodeIdTaken(key, originalId)) {
        if (services.toast) {
          services.toast("节点 ID 已存在，请重新输入");
        }
        return null;
      }
      var manual = nodeModalManualSelect && nodeModalManualSelect.value === "true";
      var lower = nodeModalLowerInput && nodeModalLowerInput.value ? parseFloat(nodeModalLowerInput.value) : null;
      var center = nodeModalCenterInput && nodeModalCenterInput.value ? parseFloat(nodeModalCenterInput.value) : null;
      var upper = nodeModalUpperInput && nodeModalUpperInput.value ? parseFloat(nodeModalUpperInput.value) : null;
      var manualStep = nodeModalStepInput && nodeModalStepInput.value ? parseFloat(nodeModalStepInput.value) : null;
      if (lower !== null && isNaN(lower)) {
        lower = null;
      }
      if (center !== null && isNaN(center)) {
        center = null;
      }
      if (upper !== null && isNaN(upper)) {
        upper = null;
      }
      if (manualStep !== null && isNaN(manualStep)) {
        manualStep = null;
      }
      var manualTargets = [];
      if (manual && nodeModalImpactSelect) {
        for (var i = 0; i < nodeModalImpactSelect.options.length; i += 1) {
          var opt = nodeModalImpactSelect.options[i];
          if (!opt || !opt.selected || !opt.value) {
            continue;
          }
          var parts = opt.value.split("::");
          manualTargets.push({ nodeId: parts[0], subNodeId: parts.length > 1 ? parts[1] : null });
        }
      }
      var mesSourceId = nodeModalMesSelect && nodeModalMesSelect.value ? nodeModalMesSelect.value.trim() : "";
      if (!mesSourceId) {
        mesSourceId = null;
      }
      return {
        id: key,
        originalId: originalId,
        name: nodeModalNameInput && nodeModalNameInput.value ? nodeModalNameInput.value.trim() || "节点" : "节点",
        unit: nodeModalUnitInput && nodeModalUnitInput.value ? nodeModalUnitInput.value.trim() : "",
        lower: lower,
        center: center,
        upper: upper,
        manual: manual,
        manualStep: manual ? (manualStep !== null ? manualStep : 0) : null,
        manualTargets: manual ? manualTargets : [],
        mesSourceId: mesSourceId,
        simulate: nodeModalSimulateSelect && nodeModalSimulateSelect.value === "false" ? false : true
      };
    }

    function saveNodeModal() {
      var data = collectNodeModalData();
      if (!data) {
        return;
      }
      if (state.nodeModalState && state.nodeModalState.isOutput) {
        services.updateSettings({
          outputNodeId: data.id,
          outputName: data.name,
          outputUnit: data.unit,
          outputMesSourceId: data.mesSourceId || null,
          outputTarget: {
            lower: data.lower,
            center: data.center,
            upper: data.upper
          }
        });
        closeNodeModal();
        if (services.toast) {
          services.toast("引出量节点已更新");
        }
        return;
      }
      if (state.nodeModalState && state.nodeModalState.isNew) {
        data.originalId = data.originalId || data.id;
        state.editingSubNodes.push(data);
      } else if (state.nodeModalState) {
        state.editingSubNodes[state.nodeModalState.index] = data;
      }
      closeNodeModal();
      renderSubNodes();
      renderGroupSummary(findNode(state.editingNodeId));
      var groupId = state.nodeModalState && state.nodeModalState.groupId ? state.nodeModalState.groupId : state.editingNodeId;
      if (groupId) {
        var base = findNode(groupId);
        var payload = {
          id: groupId,
          originalId: groupId,
          name: base && base.name ? base.name : "节点组",
          note: base && base.note ? base.note : "",
          parentId: base && base.parentId ? base.parentId : null,
          children: ensureEditingChildren(clone(state.editingSubNodes) || [])
        };
        if (base && typeof base.positionMode === "string") {
          payload.positionMode = base.positionMode;
        }
        if (base && typeof base.positionRef === "string") {
          payload.positionRef = base.positionRef;
        }
        if (base && typeof base.simulate === "boolean") {
          payload.simulate = base.simulate;
        }
        if (base && typeof base.lower === "number") {
          payload.lower = base.lower;
        }
        if (base && typeof base.center === "number") {
          payload.center = base.center;
        }
        if (base && typeof base.upper === "number") {
          payload.upper = base.upper;
        }
        services.upsertNode(payload);
        render();
        if (services.toast) {
          services.toast("节点已保存");
        }
      }
    }

    function addSubNode() {
      openNodeModal(state.editingSubNodes.length, { isNew: true });
    }

    function editSubNode(index) {
      openNodeModal(index, { isNew: false });
    }

    function serializeNodeForm() {
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
        unit: null,
        manual: false,
        manualStep: 0,
        lower: null,
        center: null,
        upper: null,
        positionMode: nodePositionSelect ? nodePositionSelect.value : "after",
        positionRef: nodeRefSelect && nodeRefSelect.value ? nodeRefSelect.value : null,
        parentId: nodeParentSelect && nodeParentSelect.value ? nodeParentSelect.value : null,
        children: ensureEditingChildren(clone(state.editingSubNodes) || []),
        simulate: true
      };
      if (state.editingNodeId && state.editingNodeId !== keyValue) {
        payload.originalId = state.editingNodeId;
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

    function formatTargetNumber(value) {
      if (typeof value !== "number" || !isFinite(value)) {
        return "--";
      }
      return value.toFixed(3);
    }

    function formatIntervalMs(ms) {
      if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) {
        return "--";
      }
      if (ms >= 60000) {
        var minutes = ms / 60000;
        var label = minutes >= 10 ? minutes.toFixed(0) : minutes.toFixed(1);
        return label.replace(/\.0$/, "") + " 分钟";
      }
      if (ms >= 1000) {
        var seconds = ms / 1000;
        var secLabel = seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1);
        return secLabel.replace(/\.0$/, "") + " 秒";
      }
      return Math.round(ms) + " 毫秒";
    }

    function formatMinutesDuration(minutes) {
      if (typeof minutes !== "number" || !isFinite(minutes) || minutes <= 0) {
        return "--";
      }
      if (minutes >= 60) {
        var hours = minutes / 60;
        var hourLabel = hours >= 10 ? hours.toFixed(0) : hours.toFixed(1);
        return hourLabel.replace(/\.0$/, "") + " 小时";
      }
      var minuteLabel = minutes >= 10 ? minutes.toFixed(0) : minutes.toFixed(1);
      return minuteLabel.replace(/\.0$/, "") + " 分钟";
    }

    function renderTargetSummary(target) {
      target = target || {};
      if (!targetSummaryCenterEl && !targetSummaryEl) {
        return;
      }
      var lower = typeof target.lower === "number" ? target.lower : null;
      var center = typeof target.center === "number" ? target.center : null;
      var upper = typeof target.upper === "number" ? target.upper : null;
      if (targetSummaryCenterEl) {
        targetSummaryCenterEl.textContent = center !== null ? formatTargetNumber(center) : "--";
      }
      if (targetSummaryRangeEl) {
        if (lower !== null || upper !== null) {
          var lowerText = lower !== null ? formatTargetNumber(lower) : "--";
          var upperText = upper !== null ? formatTargetNumber(upper) : "--";
          targetSummaryRangeEl.textContent = lowerText + " ~ " + upperText;
        } else {
          targetSummaryRangeEl.textContent = "--";
        }
      }
      var settings = state.snapshot && state.snapshot.settings ? state.snapshot.settings : {};
      var sampleInterval = typeof settings.sampleIntervalMs === "number" ? settings.sampleIntervalMs : null;
      var lookback = typeof settings.lookbackMinutes === "number" ? settings.lookbackMinutes : null;
      var prediction = typeof settings.predictionMinutes === "number" ? settings.predictionMinutes : null;
      if (targetSummaryWindowEl) {
        var windowParts = [];
        if (sampleInterval) {
          windowParts.push("采样 " + formatIntervalMs(sampleInterval));
        }
        if (lookback) {
          windowParts.push("历史 " + formatMinutesDuration(lookback));
        }
        if (prediction) {
          windowParts.push("预测 " + formatMinutesDuration(prediction));
        }
        targetSummaryWindowEl.textContent = windowParts.length ? windowParts.join(" · ") : "--";
      }
      var library = (state.snapshot && state.snapshot.nodeLibrary) || [];
      var manualCount = library.filter(function (node) { return node && node.manual; }).length;
      var endpoints = settings && Array.isArray(settings.mesEndpoints)
        ? settings.mesEndpoints.filter(function (item) { return item && item.enabled !== false; }).length
        : 0;
      if (targetSummaryContextEl) {
        targetSummaryContextEl.textContent = library.length + " 个节点 / " + manualCount + " 个手动 / " + endpoints + " 个数据源";
      }
      if (targetSummaryStatusEl) {
        var suggestions = (state.snapshot && state.snapshot.suggestions) || [];
        var activeSuggestions = suggestions.filter(function (item) { return item && item.status === "active"; }).length;
        var feedback = (state.snapshot && state.snapshot.feedback) || [];
        if (activeSuggestions || feedback.length) {
          targetSummaryStatusEl.textContent = "活跃建议 " + activeSuggestions + " 条 · 反馈记录 " + feedback.length + " 条";
        } else {
          targetSummaryStatusEl.textContent = "引出量目标用于衡量整体引出量稳定性。";
        }
      }
    }

    function collectOutputCompositeSeries(minutes) {
      var snapshot = state.snapshot;
      if (!snapshot || !Array.isArray(snapshot.streams)) {
        return [];
      }
      var windowMinutes = typeof minutes === "number" && minutes > 0 ? minutes : 30;
      var cutoff = Date.now() - windowMinutes * 60000;
      var buckets = {};
      var keys = [];
      for (var i = 0; i < snapshot.streams.length; i += 1) {
        var sample = snapshot.streams[i];
        if (!sample || typeof sample.value !== "number") {
          continue;
        }
        var stamp = sample.capturedAt || sample.receivedAt;
        var ts = new Date(stamp || Date.now()).getTime();
        if (!isFinite(ts) || ts < cutoff) {
          continue;
        }
        var bucketKey = Math.floor(ts / 60000) * 60000;
        if (!buckets[bucketKey]) {
          buckets[bucketKey] = { sum: 0, count: 0 };
          keys.push(bucketKey);
        }
        buckets[bucketKey].sum += sample.value;
        buckets[bucketKey].count += 1;
      }
      keys.sort(function (a, b) {
        return a - b;
      });
      var series = [];
      for (var k = 0; k < keys.length; k += 1) {
        var key = keys[k];
        var bucket = buckets[key];
        if (!bucket || !bucket.count) {
          continue;
        }
        var avg = bucket.sum / bucket.count;
        if (!isFinite(avg)) {
          continue;
        }
        series.push({ capturedAt: new Date(key).toISOString(), value: parseFloat(avg.toFixed(3)) });
      }
      return series;
    }

    function forecastOutputValue(series, horizonMinutes) {
      if (!Array.isArray(series) || series.length < 2) {
        return null;
      }
      var latest = series[series.length - 1];
      if (!latest || typeof latest.value !== "number") {
        return null;
      }
      var profile = analyzeTrendProfile(series, { windowSize: Math.min(series.length, 60) });
      var slope = typeof profile.slope === "number" && isFinite(profile.slope) ? profile.slope : 0;
      var horizon = typeof horizonMinutes === "number" && horizonMinutes > 0 ? horizonMinutes : 30;
      return {
        value: latest.value + slope * horizon,
        horizonMinutes: horizon,
        slope: slope
      };
    }

    function buildOutputBrief(series, bounds) {
      var settings = state.snapshot && state.snapshot.settings ? state.snapshot.settings : {};
      var unit = typeof settings.outputUnit === "string" ? settings.outputUnit : "";
      var horizon = typeof settings.predictionMinutes === "number" && settings.predictionMinutes > 0
        ? settings.predictionMinutes
        : 30;
      if (!Array.isArray(series) || !series.length) {
        return "暂无实时数据";
      }
      var latest = series[series.length - 1];
      var latestValue = latest && typeof latest.value === "number" ? latest.value : null;
      var parts = [];
      if (latestValue !== null) {
        var status = bounds ? describeLevel(latestValue, bounds) : null;
        var label = status && status.label ? status.label : null;
        var currentText = "当前值 " + formatNumber(latestValue, unit);
        if (label && label !== "平稳") {
          currentText += "（" + label + "）";
        }
        parts.push(currentText);
      }
      var profile = analyzeTrendProfile(series, { windowSize: Math.min(series.length, 60) });
      var evaluation = evaluateTrendProfile(profile);
      if (evaluation && evaluation.text) {
        parts.push(evaluation.text);
      }
      var forecast = forecastOutputValue(series, horizon);
      if (forecast && typeof forecast.value === "number" && isFinite(forecast.value)) {
        parts.push("预测 " + forecast.horizonMinutes + " 分钟后约 " + formatNumber(forecast.value, unit));
      }
      if (bounds && typeof bounds.center === "number" && latestValue !== null) {
        var delta = latestValue - bounds.center;
        if (Math.abs(delta) < 0.001) {
          parts.push("已贴合中心");
        } else {
          var deltaText = (delta > 0 ? "高于中心 " : "低于中心 ") + Math.abs(delta).toFixed(3);
          if (unit) {
            deltaText += " " + unit;
          }
          parts.push(deltaText);
        }
      }
      if (!parts.length) {
        return "暂无实时数据";
      }
      return parts.join(" · ");
    }

    function renderTargetCard() {
      if (!targetCenterEl || !targetRangeEl) {
        return;
      }
      var target = state.snapshot && state.snapshot.settings ? state.snapshot.settings.outputTarget : null;
      var lowerValue = target && typeof target.lower === "number" ? target.lower : null;
      var centerValue = target && typeof target.center === "number" ? target.center : null;
      var upperValue = target && typeof target.upper === "number" ? target.upper : null;
      if (!target) {
        targetCenterEl.textContent = "--";
        targetRangeEl.textContent = "上下限 -- / --";
      } else {
        targetCenterEl.textContent = formatTargetNumber(centerValue);
        var lower = formatTargetNumber(lowerValue);
        var upper = formatTargetNumber(upperValue);
        targetRangeEl.textContent = "上下限 " + lower + " / " + upper;
      }
      var bounds = {
        lower: typeof lowerValue === "number" ? lowerValue : null,
        upper: typeof upperValue === "number" ? upperValue : null,
        center: typeof centerValue === "number" ? centerValue : null
      };
      var series = collectOutputCompositeSeries(30);
      if (targetBriefEl) {
        targetBriefEl.textContent = buildOutputBrief(series, bounds);
      }
      if (targetSparkline) {
        drawSeries(targetSparkline, series, {
          mini: true,
          color: "#7c3aed",
          lower: bounds.lower,
          upper: bounds.upper,
          center: bounds.center,
          background: "transparent"
        });
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
      var parent = node.parentId ? findNode(node.parentId) : null;
      var bounds = resolveNodeBounds(parent || node, parent ? node : null);
      var unit = node && node.unit ? node.unit : parent && parent.unit ? parent.unit : "";
      drawSeries(chartCanvas, series, {
        color: "#2563eb",
        lower: bounds.lower,
        upper: bounds.upper,
        center: bounds.center,
        unit: unit
      });
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

    function collectFullSeries(nodeId, subNodeId) {
      var all = (state.snapshot && state.snapshot.streams) || [];
      var series = [];
      if (!nodeId) {
        return series;
      }
      for (var i = 0; i < all.length; i += 1) {
        var sample = all[i];
        if (!sample || sample.nodeId !== nodeId) {
          continue;
        }
        if (subNodeId) {
          if (sample.subNodeId !== subNodeId) {
            continue;
          }
        } else if (sample.subNodeId) {
          continue;
        }
        if (typeof sample.value !== "number" || !sample.capturedAt) {
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
        var aggregate = summarizeGroupChildren(Array.isArray(group.children) ? group.children : []);
        if (lower === null) {
          if (aggregate.lower !== null) {
            lower = aggregate.lower;
          } else if (typeof group.lower === "number") {
            lower = group.lower;
          }
        }
        if (upper === null) {
          if (aggregate.upper !== null) {
            upper = aggregate.upper;
          } else if (typeof group.upper === "number") {
            upper = group.upper;
          }
        }
        if (center === null) {
          if (aggregate.center !== null) {
            center = aggregate.center;
          } else if (typeof group.center === "number") {
            center = group.center;
          }
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
          var trendProfile = analyzeTrendProfile(series, { windowSize: 24 });
          var trendLabel = trendProfile.label;
          var trendDuration = trendProfile.durationMinutes || 0;
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
          var displayUnit = "";
          if (innerNode) {
            displayUnit = innerNode.unit || "";
          } else {
            var aggregateUnit = summarizeGroupChildren(Array.isArray(group.children) ? group.children : []);
            displayUnit = aggregateUnit.displayUnit && aggregateUnit.displayUnit !== "多种" ? aggregateUnit.displayUnit : "";
          }
          valueRow.textContent = latest ? formatNumber(latest.value, displayUnit) : "--";
          card.appendChild(valueRow);
          var meta = document.createElement("div");
          meta.className = "trend-matrix-meta";
          var metaText = latest ? formatTime(latest.capturedAt) + " 更新" : "无数据";
          metaText += " · 趋势 " + trendLabel;
          if (trendDuration > 0 && trendLabel !== "平稳") {
            metaText += " · " + trendDuration + " 分钟";
          }
          meta.textContent = metaText;
          card.appendChild(meta);
          var spark = document.createElement("canvas");
          spark.className = "trend-matrix-spark";
          card.appendChild(spark);
          matrixGridEl.appendChild(card);
          window.requestAnimationFrame(function () {
            drawSeries(spark, series.slice(-20), { color: "#0ea5e9", mini: true });
          });
        });
      });
    }

    function renderNodeLibrary() {
      if (!libraryListEl) {
        return;
      }
      libraryListEl.innerHTML = "";
      var library = state.nodeLibrary || [];
      if (!library.length) {
        var empty = document.createElement("div");
        empty.className = "trend-library-empty";
        empty.textContent = "尚未创建监测节点";
        libraryListEl.appendChild(empty);
        return;
      }
      var grouped = {};
      for (var i = 0; i < library.length; i += 1) {
        var record = library[i];
        if (!record) {
          continue;
        }
        var key = Array.isArray(record.groupPath) && record.groupPath.length
          ? record.groupPath.join("::")
          : "__root";
        if (!grouped[key]) {
          grouped[key] = {
            label: Array.isArray(record.groupNamePath) && record.groupNamePath.length
              ? record.groupNamePath.join(" / ")
              : (record.groupPath && record.groupPath.length ? record.groupPath[record.groupPath.length - 1] : "未分组"),
            nodes: []
          };
        }
        grouped[key].nodes.push(record);
      }
      var keys = Object.keys(grouped).sort();
      keys.forEach(function (key) {
        var bucket = grouped[key];
        var block = document.createElement("div");
        block.className = "trend-library-group";
        var head = document.createElement("div");
        head.className = "trend-library-group-head";
        head.textContent = bucket.label || "节点组";
        block.appendChild(head);
        var list = document.createElement("div");
        list.className = "trend-library-rows";
        bucket.nodes.sort(function (a, b) {
          var aName = a && a.name ? a.name : "";
          var bName = b && b.name ? b.name : "";
          return aName.localeCompare(bName, "zh-Hans-CN");
        });
        bucket.nodes.forEach(function (node) {
          if (!node) {
            return;
          }
          var row = document.createElement("div");
          row.className = "trend-library-row";
          var title = document.createElement("div");
          title.className = "trend-library-title";
          title.textContent = node.name || "节点";
          row.appendChild(title);
          var meta = document.createElement("div");
          meta.className = "trend-library-meta";
          var idLabel = document.createElement("span");
          idLabel.className = "trend-library-id";
          idLabel.textContent = node.id || "--";
          meta.appendChild(idLabel);
          if (node.unit) {
            var unitLabel = document.createElement("span");
            unitLabel.textContent = "单位 " + node.unit;
            meta.appendChild(unitLabel);
          }
          var range = document.createElement("span");
          var lowerText = typeof node.lower === "number" ? node.lower : "--";
          var upperText = typeof node.upper === "number" ? node.upper : "--";
          var centerText = typeof node.center === "number" ? node.center : "--";
          range.textContent = "范围 " + lowerText + " ~ " + upperText + " · 中值 " + centerText;
          meta.appendChild(range);
          if (node.manual) {
            var manual = document.createElement("span");
            manual.className = "trend-library-flag";
            manual.textContent = "手动节点" + (typeof node.manualStep === "number" && node.manualStep ? " · 步长 " + node.manualStep : "");
            meta.appendChild(manual);
          }
          if (node.simulate === false) {
            var demo = document.createElement("span");
            demo.className = "trend-library-flag muted";
            demo.textContent = "演示停用";
            meta.appendChild(demo);
          }
          row.appendChild(meta);
          list.appendChild(row);
        });
        block.appendChild(list);
        libraryListEl.appendChild(block);
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
        var trendText = forecast.trendLabel || "平稳";
        if (forecast.trendDuration && forecast.trendDuration > 0 && trendText !== "平稳") {
          trendText += " · " + forecast.trendDuration + " 分钟";
        }
        meta.textContent = "前瞻 " + (forecast.horizonMinutes || 0) + " 分钟 · 置信度 " + Math.round((forecast.confidence || 0) * 100) + "% · 趋势 " + trendText;
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
          var trendText = item.forecast.trendLabel || "平稳";
          if (item.forecast.trendDuration && item.forecast.trendDuration > 0 && trendText !== "平稳") {
            trendText += " · " + item.forecast.trendDuration + " 分钟";
          }
          forecastInfo.textContent = "预测 " + (item.forecast.horizonMinutes || 0) + " 分钟后 " + formatNumber(item.forecast.value, item.unit || "") + " · 置信度 " + Math.round(((item.forecast.confidence || 0) * 100)) + "% · 趋势 " + trendText;
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

    function buildEndpointCard(endpoint) {
      var card = document.createElement("div");
      card.className = "trend-endpoint-item";
      var header = document.createElement("header");
      var title = document.createElement("div");
      title.textContent = endpoint.name + " · " + (endpoint.type || "rest");
      header.appendChild(title);
      var status = document.createElement("span");
      status.className = "trend-endpoint-status";
      status.textContent = endpoint.enabled ? "启用" : "停用";
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
        openEndpointModal(endpoint);
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
      return card;
    }

    function renderEndpointList(container, endpoints) {
      if (!container) {
        return;
      }
      container.innerHTML = "";
      if (!endpoints.length) {
        var empty = document.createElement("div");
        empty.className = "trend-endpoint-empty";
        empty.textContent = "尚未注册 MES 数据源。";
        container.appendChild(empty);
        return;
      }
      endpoints.forEach(function (endpoint) {
        container.appendChild(buildEndpointCard(endpoint));
      });
    }

    function renderEndpoints() {
      var endpoints = (state.snapshot && state.snapshot.settings && state.snapshot.settings.mesEndpoints) || [];
      renderEndpointList(endpointListEl, endpoints);
      renderEndpointList(settingsModalEndpointList, endpoints);
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
      openEndpointModal(endpoint);
    }

    function addEndpoint() {
      openEndpointModal(null);
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
      var sampleValue = state.snapshot.settings.sampleIntervalMs || 60000;
      var lookbackValue = state.snapshot.settings.lookbackMinutes || 120;
      var predictionValue = state.snapshot.settings.predictionMinutes || 30;
      var target = state.snapshot.settings.outputTarget || {};
      var centerValue = typeof target.center === "number" ? target.center : "";
      var lowerValue = typeof target.lower === "number" ? target.lower : "";
      var upperValue = typeof target.upper === "number" ? target.upper : "";
      if (sampleIntervalInput) {
        sampleIntervalInput.value = sampleValue;
      }
      if (lookbackInput) {
        lookbackInput.value = lookbackValue;
      }
      if (predictionInput) {
        predictionInput.value = predictionValue;
      }
      if (targetCenterInput) {
        targetCenterInput.value = centerValue;
      }
      if (targetLowerInput) {
        targetLowerInput.value = lowerValue;
      }
      if (targetUpperInput) {
        targetUpperInput.value = upperValue;
      }
      if (settingsModalSampleInput) {
        settingsModalSampleInput.value = sampleValue;
      }
      if (settingsModalLookbackInput) {
        settingsModalLookbackInput.value = lookbackValue;
      }
      if (settingsModalPredictionInput) {
        settingsModalPredictionInput.value = predictionValue;
      }
      if (settingsModalCenterInput) {
        settingsModalCenterInput.value = centerValue;
      }
      if (settingsModalLowerInput) {
        settingsModalLowerInput.value = lowerValue;
      }
      if (settingsModalUpperInput) {
        settingsModalUpperInput.value = upperValue;
      }
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
      ], {
        lower: typeof entry.lower === "number" ? entry.lower : null,
        upper: typeof entry.upper === "number" ? entry.upper : null,
        center: typeof entry.center === "number" ? entry.center : null,
        unit: entry.unit || ""
      });
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
      renderNodeLibrary();
      renderForecasts();
      renderAdvice();
      renderEndpoints();
      renderFeedbackOptions();
      renderSettingsForm();
      renderScenarioForm();
      renderScenarioResult();
      renderScenarioSaved();
      if (state.nodeModalState && state.nodeModalState.draft) {
        var mesId = state.nodeModalState.draft.mesSourceId ? String(state.nodeModalState.draft.mesSourceId) : "";
        populateNodeMesOptions(mesId);
        if (nodeModalMesSelect) {
          nodeModalMesSelect.value = mesId;
        }
      }
    }

    if (explorerUpBtn) {
      explorerUpBtn.addEventListener("click", function () {
        exitExplorerGroup();
      });
    }

    if (explorerAddGroupBtn) {
      explorerAddGroupBtn.addEventListener("click", function () {
        var parentId = state.explorerPath && state.explorerPath.length ? state.explorerPath[state.explorerPath.length - 1] : null;
        startCreateGroup(parentId);
      });
    }

    if (explorerAddNodeBtn) {
      explorerAddNodeBtn.addEventListener("click", function () {
        var parentId = state.explorerPath && state.explorerPath.length ? state.explorerPath[state.explorerPath.length - 1] : null;
        startCreateNode(parentId);
      });
    }

    if (explorerConsoleBtn) {
      explorerConsoleBtn.addEventListener("click", function () {
        openConsolePanel();
      });
    }

    if (consoleCloseBtn) {
      consoleCloseBtn.addEventListener("click", function () {
        closeConsolePanelOverlay();
      });
    }

    if (consolePanelEl) {
      consolePanelEl.addEventListener("click", function (evt) {
        if (evt.target === consolePanelEl) {
          closeConsolePanelOverlay();
        }
      });
    }

    function populateNodeMesOptions(selectedId) {
      if (!nodeModalMesSelect) {
        return;
      }
      nodeModalMesSelect.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "未绑定";
      nodeModalMesSelect.appendChild(placeholder);
      var endpoints = listMesEndpoints(true);
      var found = false;
      for (var i = 0; i < endpoints.length; i += 1) {
        var endpoint = endpoints[i];
        if (!endpoint || !endpoint.id) {
          continue;
        }
        var option = document.createElement("option");
        option.value = endpoint.id;
        option.textContent = describeMesEndpoint(endpoint);
        if (endpoint.id === selectedId) {
          option.selected = true;
          found = true;
        }
        nodeModalMesSelect.appendChild(option);
      }
      if (selectedId && !found) {
        var fallback = document.createElement("option");
        fallback.value = selectedId;
        fallback.textContent = selectedId + "（未注册）";
        fallback.selected = true;
        nodeModalMesSelect.appendChild(fallback);
      }
    }

    if (outputCard) {
      outputCard.addEventListener("click", function () {
        openOutputNodeModal({ mode: "view" });
      });
      outputCard.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          openOutputNodeModal({ mode: "view" });
        }
      });
      outputCard.addEventListener("contextmenu", function (evt) {
        var record = buildOutputNodeRecord();
        openExplorerMenu(evt, {
          type: "output",
          id: record && record.id ? record.id : "__output__",
          parentId: null
        });
      });
    }

    if (nodeModalMesSelect) {
      nodeModalMesSelect.addEventListener("change", function () {
        if (!state.nodeModalState || !state.nodeModalState.draft) {
          return;
        }
        var rawValue = nodeModalMesSelect.value ? nodeModalMesSelect.value.trim() : "";
        state.nodeModalState.draft.mesSourceId = rawValue ? rawValue : null;
        if (nodeModalMeta) {
          var descriptor = rawValue ? findMesEndpointById(rawValue) : null;
          var message = rawValue
            ? "MES 数据源：" + (descriptor ? describeMesEndpoint(descriptor) : rawValue)
            : "MES 数据源：未绑定";
          var html = nodeModalMeta.innerHTML ? nodeModalMeta.innerHTML.split("<br>") : [];
          if (html.length) {
            html[html.length - 1] = message;
          } else {
            html.push(message);
          }
          nodeModalMeta.innerHTML = html.join("<br>");
        }
      });
    }

    if (explorerBreadcrumbEl) {
      explorerBreadcrumbEl.addEventListener("click", function (evt) {
        var target = evt.target;
        while (target && target !== explorerBreadcrumbEl) {
          if (target.tagName && target.tagName.toLowerCase() === "button" && target.hasAttribute("data-depth")) {
            var depthValue = target.getAttribute("data-depth");
            var depth = parseInt(depthValue, 10);
            navigateExplorerToDepth(isNaN(depth) ? 0 : depth);
            break;
          }
          target = target.parentNode;
        }
      });
    }

    if (explorerContainer) {
      explorerContainer.addEventListener("contextmenu", function (evt) {
        var item = resolveExplorerItemElement(evt.target);
        if (item) {
          return;
        }
        openExplorerMenu(evt, {
          type: "background",
          parentId: state.explorerPath && state.explorerPath.length ? state.explorerPath[state.explorerPath.length - 1] : null
        });
      });
      explorerContainer.addEventListener("scroll", function () {
        closeExplorerMenu();
      });
    }

    if (typeof document !== "undefined") {
      document.addEventListener("click", handleExplorerDocumentClick);
      document.addEventListener("keydown", handleExplorerKeydown);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", closeExplorerMenu);
    }

    if (nodeKeyInput) {
      nodeKeyInput.addEventListener("change", function () {
        var value = nodeKeyInput.value ? nodeKeyInput.value.trim() : "";
        if (!state.editingNodeId) {
          state.pendingNodeKey = value || state.pendingNodeKey;
        }
      });
    }

    if (nodeModalManualSelect && nodeModalManualFields) {
      nodeModalManualSelect.addEventListener("change", function () {
        if (state.nodeModalState && state.nodeModalState.isOutput) {
          nodeModalManualSelect.value = "false";
          nodeModalManualFields.style.display = "none";
          return;
        }
        if (state.nodeModalState && state.nodeModalState.mode === "view") {
          nodeModalManualSelect.value = state.nodeModalState.draft && state.nodeModalState.draft.manual ? "true" : "false";
          return;
        }
        var isManual = nodeModalManualSelect.value === "true";
        nodeModalManualFields.style.display = isManual ? "grid" : "none";
        if (state.nodeModalState && state.nodeModalState.draft) {
          state.nodeModalState.draft.manual = isManual;
          if (!isManual) {
            state.nodeModalState.draft.manualTargets = [];
          }
        }
        if (isManual) {
          renderManualImpactOptions(state.nodeModalState ? state.nodeModalState.draft : null);
        }
        if (!isManual && nodeModalImpactSelect) {
          for (var i = 0; i < nodeModalImpactSelect.options.length; i += 1) {
            nodeModalImpactSelect.options[i].selected = false;
          }
        }
        applyNodeModalMode(state.nodeModalState ? state.nodeModalState.mode : "edit");
      });
    }

    if (nodeModalSimulateSelect) {
      nodeModalSimulateSelect.addEventListener("change", function () {
        if (!state.nodeModalState || !state.nodeModalState.draft) {
          return;
        }
        state.nodeModalState.draft.simulate = nodeModalSimulateSelect.value === "false" ? false : true;
      });
    }

    if (nodeModalForm) {
      nodeModalForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        saveNodeModal();
      });
    }

    if (nodeModalCloseBtn) {
      nodeModalCloseBtn.addEventListener("click", function () {
        closeNodeModal();
      });
    }

    if (nodeModalCancelBtn) {
      nodeModalCancelBtn.addEventListener("click", function (evt) {
        evt.preventDefault();
        closeNodeModal();
      });
    }

    if (nodeModalDetailBtn) {
      nodeModalDetailBtn.addEventListener("click", function (evt) {
        evt.preventDefault();
        if (!state.nodeModalState) {
          return;
        }
        var groupId = state.nodeModalState.groupId || state.editingNodeId;
        if (!groupId) {
          return;
        }
        var draft = state.nodeModalState.draft;
        if (!draft || !draft.id) {
          return;
        }
        var url = "ai-trend-history.html?node=" + encodeURIComponent(groupId) + "&sub=" + encodeURIComponent(draft.id);
        window.open(url, "_blank");
      });
    }

    if (nodeModalEditBtn) {
      nodeModalEditBtn.addEventListener("click", function (evt) {
        evt.preventDefault();
        if (!state.nodeModalState) {
          return;
        }
        applyNodeModalMode("edit");
        window.setTimeout(function () {
          try {
            if (nodeModalNameInput) {
              nodeModalNameInput.focus();
              nodeModalNameInput.select();
            }
          } catch (err) {}
        }, 0);
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

    if (groupModalForm) {
      groupModalForm.addEventListener("submit", submitGroupModal);
    }
    if (groupModalCloseBtn) {
      groupModalCloseBtn.addEventListener("click", function () {
        closeGroupModal();
      });
    }
    if (groupModalCancelBtn) {
      groupModalCancelBtn.addEventListener("click", function (evt) {
        evt.preventDefault();
        closeGroupModal();
      });
    }
    if (groupModalDuplicateBtn) {
      groupModalDuplicateBtn.addEventListener("click", function () {
        if (state.groupModalState && state.groupModalState.originalId) {
          var sourceId = state.groupModalState.originalId;
          closeGroupModal();
          duplicateGroup(sourceId);
        }
      });
    }
    if (targetModalForm) {
      targetModalForm.addEventListener("submit", submitTargetModal);
    }
    if (targetModalCloseBtn) {
      targetModalCloseBtn.addEventListener("click", function () {
        closeTargetModal();
      });
    }
    if (targetModalCancelBtn) {
      targetModalCancelBtn.addEventListener("click", function (evt) {
        evt.preventDefault();
        closeTargetModal();
      });
    }
    if (settingsModalForm) {
      settingsModalForm.addEventListener("submit", submitSettingsModal);
    }
    if (settingsModalCloseBtn) {
      settingsModalCloseBtn.addEventListener("click", function () {
        closeSettingsModal();
      });
    }
    if (settingsModalAddEndpointBtn) {
      settingsModalAddEndpointBtn.addEventListener("click", function () {
        openEndpointModal(null);
      });
    }
    if (endpointModalForm) {
      endpointModalForm.addEventListener("submit", submitEndpointModal);
    }
    if (endpointModalCloseBtn) {
      endpointModalCloseBtn.addEventListener("click", function () {
        closeEndpointModal();
      });
    }
    if (endpointModalCancelBtn) {
      endpointModalCancelBtn.addEventListener("click", function (evt) {
        evt.preventDefault();
        closeEndpointModal();
      });
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
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        var pendingSelection = window.sessionStorage.getItem("trend:selectedNodeId");
        if (pendingSelection) {
          window.sessionStorage.removeItem("trend:selectedNodeId");
          var pendingNode = findNode(pendingSelection);
          if (pendingNode) {
            openConsolePanel();
            handleNodeSelection(pendingSelection);
          }
        }
      } catch (err) {}
    }
  }

  window.AIToolsTrend = { mount: mount };
})();
