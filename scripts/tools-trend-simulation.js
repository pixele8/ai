(function () {
  function isNumber(value) {
    return typeof value === "number" && !isNaN(value) && isFinite(value);
  }

  function formatClock(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return "--:--:--";
    }
    var hours = date.getHours().toString().padStart(2, "0");
    var minutes = date.getMinutes().toString().padStart(2, "0");
    var seconds = date.getSeconds().toString().padStart(2, "0");
    return hours + ":" + minutes + ":" + seconds;
  }

  function flattenNodes(snapshot) {
    var results = [];
    var settings = snapshot && snapshot.settings ? snapshot.settings : null;
    if (settings) {
      var target = settings.outputTarget || {};
      var outputId = typeof settings.outputNodeId === "string" && settings.outputNodeId.trim()
        ? settings.outputNodeId.trim()
        : "__output__";
      var lower = isNumber(target.lower) ? target.lower : null;
      var upper = isNumber(target.upper) ? target.upper : null;
      var center = isNumber(target.center) ? target.center : null;
      results.push({
        groupId: outputId,
        nodeId: null,
        key: outputId + "::output",
        name: settings.outputName || "引出量中心",
        unit: settings.outputUnit || "",
        lower: lower,
        upper: upper,
        center: center,
        manual: false,
        simulate: true
      });
    }
    if (!snapshot || !Array.isArray(snapshot.nodes)) {
      return results;
    }
    snapshot.nodes.forEach(function (group) {
      if (!group || !group.id || !Array.isArray(group.children)) {
        return;
      }
      group.children.forEach(function (child) {
        if (!child || !child.id) {
          return;
        }
        if (group.simulate === false || child.simulate === false) {
          return;
        }
        var key = group.id + "::" + child.id;
        var lower = isNumber(child.lower) ? child.lower : null;
        var upper = isNumber(child.upper) ? child.upper : null;
        var center = isNumber(child.center) ? child.center : null;
        if (center === null && lower !== null && upper !== null) {
          center = (lower + upper) / 2;
        }
        results.push({
          groupId: group.id,
          nodeId: child.id,
          key: key,
          name: child.name || "节点",
          unit: child.unit || "",
          lower: lower,
          upper: upper,
          center: center,
          manual: !!child.manual
        });
      });
    });
    return results;
  }

  function clamp(value, lower, upper) {
    if (isNumber(lower) && value < lower) {
      return lower;
    }
    if (isNumber(upper) && value > upper) {
      return upper;
    }
    return value;
  }

  function nextValue(entry, lastValue) {
    var lower = entry.lower;
    var upper = entry.upper;
    var center = entry.center;
    var base;
    if (isNumber(lastValue)) {
      base = lastValue;
    } else if (isNumber(center)) {
      base = center;
    } else if (isNumber(lower) && isNumber(upper)) {
      base = (lower + upper) / 2;
    } else {
      base = 0;
    }
    var span;
    if (isNumber(lower) && isNumber(upper) && upper > lower) {
      span = Math.max((upper - lower) * 0.08, 0.0001);
    } else if (isNumber(center)) {
      span = Math.max(Math.abs(center) * 0.08, 0.5);
    } else {
      span = 1;
    }
    var step = span * (entry.manual ? 0.4 : 0.2);
    var delta = (Math.random() - 0.5) * 2 * step;
    var candidate = base + delta;
    candidate = clamp(candidate, lower !== null ? lower : undefined, upper !== null ? upper : undefined);
    if (!isNumber(candidate)) {
      return 0;
    }
    return parseFloat(candidate.toFixed(5));
  }

  function createSimulationModule() {
    var toggleBtn = document.getElementById("trendSimulationToggle");
    var statusEl = document.getElementById("trendSimulationStatus");
    if (!toggleBtn || !statusEl) {
      return null;
    }
    var state = {
      services: null,
      nodes: [],
      lastValues: {},
      timer: null,
      lastRun: null,
      unsubscribe: null,
      active: false
    };

    function updateStatus(snapshot) {
      var simState = null;
      if (snapshot && snapshot.simulation) {
        simState = snapshot.simulation;
      } else if (state.services && typeof state.services.getSimulationState === "function") {
        simState = state.services.getSimulationState();
      }
      simState = simState || { active: false };
      var previousActive = state.active;
      state.active = !!simState.active;
      if (!state.active && previousActive) {
        if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
        state.lastRun = null;
        state.lastValues = {};
      }
      toggleBtn.setAttribute("aria-pressed", state.active ? "true" : "false");
      if (state.active) {
        toggleBtn.classList.add("is-active");
      } else {
        toggleBtn.classList.remove("is-active");
      }
      var count = state.nodes.length;
      if (!state.active) {
        statusEl.textContent = "模拟模式未开启。";
      } else {
        var updated = state.lastRun ? formatClock(state.lastRun) : formatClock(simState.updatedAt ? new Date(simState.updatedAt) : new Date());
        statusEl.textContent = "模拟模式运行中 · 节点 " + count + " · 上次更新 " + updated;
      }
    }

    function syncSnapshot(snapshot) {
      state.nodes = flattenNodes(snapshot);
      updateStatus(snapshot);
    }

    function stopSimulation(options) {
      options = options || {};
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
      state.lastRun = null;
      state.lastValues = {};
      state.active = false;
      if (state.services) {
        if (!options.skipSignal && typeof state.services.setSimulationActive === "function") {
          state.services.setSimulationActive(false);
        }
        if (!options.skipSignal && typeof state.services.clearSimulation === "function") {
          state.services.clearSimulation();
        }
      }
      updateStatus();
    }

    function tick() {
      if (!state.services) {
        return;
      }
      if (!state.active) {
        return;
      }
      if (!state.nodes.length) {
        stopSimulation({ skipSignal: true });
        return;
      }
      var now = new Date();
      var samples = [];
      for (var i = 0; i < state.nodes.length; i += 1) {
        var entry = state.nodes[i];
        if (!entry) {
          continue;
        }
        var key = entry.key;
        var lastValue = Object.prototype.hasOwnProperty.call(state.lastValues, key) ? state.lastValues[key] : null;
        var value = nextValue(entry, lastValue);
        state.lastValues[key] = value;
        samples.push({
          nodeId: entry.groupId,
          subNodeId: entry.nodeId,
          value: value,
          source: "simulation",
          capturedAt: new Date(now.getTime() - i * 10).toISOString(),
          confidence: 0.85
        });
      }
      if (samples.length && typeof state.services.recordSamples === "function") {
        state.services.recordSamples(samples);
      }
      state.lastRun = now;
      updateStatus();
    }

    function ensureNodesLoaded() {
      if (!state.services) {
        return [];
      }
      var snapshot = state.services.getSnapshot ? state.services.getSnapshot({}) : null;
      state.nodes = flattenNodes(snapshot);
      return state.nodes.slice();
    }

    function startSimulation(options) {
      options = options || {};
      ensureNodesLoaded();
      if (!state.nodes.length) {
        state.active = false;
        if (state.services && typeof state.services.setSimulationActive === "function") {
          state.services.setSimulationActive(false);
        }
        if (!options.resume && state.services && typeof state.services.toast === "function") {
          state.services.toast("当前没有可模拟的节点");
        }
        updateStatus();
        return;
      }
      state.lastValues = {};
      state.lastRun = null;
      if (!options.resume && state.services) {
        if (typeof state.services.clearSimulation === "function") {
          state.services.clearSimulation();
        }
        if (typeof state.services.setSimulationActive === "function") {
          state.services.setSimulationActive(true);
        }
      }
      if (state.timer) {
        clearInterval(state.timer);
      }
      state.active = true;
      tick();
      state.timer = setInterval(tick, 1000);
      if (!options.resume && state.services && typeof state.services.toast === "function") {
        state.services.toast("已进入模拟模式");
      }
    }

    function toggleSimulation() {
      if (!state.active) {
        startSimulation({ resume: false });
      } else {
        stopSimulation();
        if (state.services && typeof state.services.toast === "function") {
          state.services.toast("已退出模拟模式");
        }
      }
    }

    function mount(services) {
      state.services = services;
      if (services && typeof services.subscribe === "function") {
        state.unsubscribe = services.subscribe(function (snapshot) {
          syncSnapshot(snapshot);
        });
      } else {
        syncSnapshot(services && typeof services.getSnapshot === "function" ? services.getSnapshot({}) : null);
      }
      toggleBtn.addEventListener("click", function () {
        toggleSimulation();
      });
      var simState = services && typeof services.getSimulationState === "function"
        ? services.getSimulationState()
        : { active: false };
      if (simState && simState.active) {
        startSimulation({ resume: true });
      } else {
        updateStatus();
      }
      window.addEventListener("beforeunload", function () {
        if (state.timer) {
          clearInterval(state.timer);
        }
        if (state.unsubscribe) {
          try {
            state.unsubscribe();
          } catch (err) {}
        }
      });
    }

    return {
      mount: mount,
      toggle: toggleSimulation,
      stop: stopSimulation
    };
  }

  function init(services) {
    var module = createSimulationModule();
    if (!module) {
      return;
    }
    module.mount(services || {});
  }

  window.initTrendSimulationModule = init;
  if (window.__pendingTrendSimulationInit) {
    init(window.__pendingTrendSimulationInit);
    window.__pendingTrendSimulationInit = null;
  }
})();
