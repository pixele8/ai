(function (global) {
  'use strict';

  var catalog = [
    {
      id: 'temperature_celsius',
      symbol: '℃',
      alias: ['°C', 'C'],
      name: '摄氏温度',
      category: 'temperature',
      base: 'kelvin',
      offset: 273.15,
      scale: 1,
      description: '相对摄氏零点的温度刻度，广泛用于热过程与环境监测。',
      formulaSummary: 'T(K) = T(℃) + 273.15',
      related: ['热负荷', '热脏污', '能耗'],
      relations: [
        { target: 'J', weight: 0.6, note: '温差乘以比热可估算能量变化。' }
      ]
    },
    {
      id: 'flow_nm3h',
      symbol: 'Nm³/h',
      alias: ['Nm3/h', 'NM3/H'],
      name: '标况体积流量',
      category: 'flow',
      description: '以标况计的体积流量，常用于气体输送。',
      formulaSummary: 'Q(Nm³/h) = Q(m³/h) × (P/P₀) × (T₀/T)',
      related: ['m/s', 'Pa', 'kPa'],
      relations: [
        { target: 'm/s', weight: 0.7, note: '与截面积组合可换算为线速度。' }
      ]
    },
    {
      id: 'pressure_pa',
      symbol: 'Pa',
      alias: ['pa'],
      name: '帕斯卡',
      category: 'pressure',
      description: '国际单位制压力单位，等于牛顿每平方米。',
      formulaSummary: '1 Pa = 1 N/m²',
      related: ['kPa', 'MPa', 'kg/cm²'],
      relations: [
        { target: 'kPa', weight: 0.95, note: '1 kPa = 1000 Pa。' },
        { target: 'kg/cm²', weight: 0.7, note: '1 kg/cm² ≈ 98.0665 kPa。' }
      ]
    },
    {
      id: 'pressure_kpa',
      symbol: 'kPa',
      alias: ['KPa'],
      name: '千帕',
      category: 'pressure',
      description: '常用工程压力单位，适合中低压场景。',
      formulaSummary: '1 kPa = 1000 Pa',
      related: ['Pa', 'MPa', 'kg/cm²'],
      relations: [
        { target: 'MPa', weight: 0.9, note: '1 MPa = 1000 kPa。' },
        { target: 'kg/cm²', weight: 0.75, note: '1 kg/cm² ≈ 98.0665 kPa。' }
      ]
    },
    {
      id: 'pressure_mpa',
      symbol: 'MPa',
      alias: ['Mpa', 'mpa'],
      name: '兆帕',
      category: 'pressure',
      description: '高压场景常用单位，等于 10⁶ Pa。',
      formulaSummary: '1 MPa = 10⁶ Pa',
      related: ['kPa', 'Pa'],
      relations: [
        { target: 'kPa', weight: 0.9, note: '高压与中压换算，1 MPa = 1000 kPa。' }
      ]
    },
    {
      id: 'length_mm',
      symbol: 'mm',
      alias: ['毫米'],
      name: '毫米',
      category: 'length',
      description: '长度子单位，常用于厚度与位移。',
      formulaSummary: '1 mm = 10⁻³ m',
      related: ['m/s'],
      relations: [
        { target: 'm/s', weight: 0.5, note: '位移差与时间可计算速度。' }
      ]
    },
    {
      id: 'ratio_percent',
      symbol: '%',
      alias: ['percent'],
      name: '百分比',
      category: 'ratio',
      description: '比例与开度常用单位。',
      formulaSummary: 'x% = x / 100',
      related: ['kW', 'A'],
      relations: [
        { target: 'kW', weight: 0.4, note: '负载百分比可对应功率输出。' }
      ]
    },
    {
      id: 'pressure_kgcm2',
      symbol: 'kg/cm²',
      alias: ['kgf/cm²'],
      name: '公斤力每平方厘米',
      category: 'pressure',
      description: '传统压力单位，常见于液压系统。',
      formulaSummary: '1 kg/cm² ≈ 98.0665 kPa',
      related: ['Pa', 'kPa', 'MPa']
    },
    {
      id: 'velocity_ms',
      symbol: 'm/s',
      alias: ['M/S'],
      name: '米每秒',
      category: 'velocity',
      description: '线速度单位，用于风速、流速等。',
      formulaSummary: 'v = s / t',
      related: ['Nm³/h'],
      relations: [
        { target: 'Nm³/h', weight: 0.7, note: '流速 × 截面积可转成体积流量。' }
      ]
    },
    {
      id: 'power_kw',
      symbol: 'kW',
      alias: ['KW', 'kw'],
      name: '千瓦',
      category: 'power',
      description: '功率单位，表示每秒做功 1000 焦耳。',
      formulaSummary: '1 kW = 1000 W',
      related: ['W', 'A', 'V'],
      relations: [
        { target: 'W', weight: 0.95, note: '1 kW = 1000 W。' },
        { target: 'A', weight: 0.7, note: '与电压共同决定电功率：P = U × I。' }
      ]
    },
    {
      id: 'power_w',
      symbol: 'W',
      alias: ['w'],
      name: '瓦特',
      category: 'power',
      description: '国际单位制功率单位。',
      formulaSummary: '1 W = 1 J/s',
      related: ['kW', 'J']
    },
    {
      id: 'current_a',
      symbol: 'A',
      alias: ['amp'],
      name: '安培',
      category: 'electric_current',
      description: '电流强度单位，与电压、电功率关联紧密。',
      formulaSummary: 'P = U × I',
      related: ['V', 'kW', 'W']
    },
    {
      id: 'voltage_v',
      symbol: 'V',
      alias: ['volt'],
      name: '伏特',
      category: 'voltage',
      description: '电压单位，表示电势差。',
      formulaSummary: 'V = W/Q',
      related: ['A', 'kW', 'W']
    },
    {
      id: 'frequency_hz',
      symbol: 'Hz',
      alias: ['hz'],
      name: '赫兹',
      category: 'frequency',
      description: '每秒周期数，用于电机与振动分析。',
      formulaSummary: 'f = 1/T',
      related: ['kW', 'A']
    },
    {
      id: 'mass_g',
      symbol: 'g',
      alias: ['gram'],
      name: '克',
      category: 'mass',
      description: '质量子单位，常用于配方或杂质测量。',
      formulaSummary: '1 g = 10⁻³ kg',
      related: ['kg/h']
    },
    {
      id: 'flow_kgh',
      symbol: 'kg/h',
      alias: ['Kg/h', 'KG/H'],
      name: '质量流量',
      category: 'mass_flow',
      description: '每小时的质量通量，可与能耗、产量相关。',
      formulaSummary: 'ṁ = Δm / Δt',
      related: ['Nm³/h', 'kW'],
      relations: [
        { target: 'Nm³/h', weight: 0.6, note: '结合密度可换算体积流量。' }
      ]
    },
    {
      id: 'energy_j',
      symbol: 'J',
      alias: ['joule'],
      name: '焦耳',
      category: 'energy',
      description: '能量单位，表示做功或热量。',
      formulaSummary: '1 J = 1 N·m',
      related: ['kW', '℃']
    }
  ];

  var aliasMap = {};
  var unitsBySymbol = {};

  function clone(unit) {
    var copy = {};
    for (var key in unit) {
      if (!Object.prototype.hasOwnProperty.call(unit, key)) {
        continue;
      }
      if (Array.isArray(unit[key])) {
        copy[key] = unit[key].slice();
      } else if (unit[key] && typeof unit[key] === 'object') {
        copy[key] = Object.assign({}, unit[key]);
      } else {
        copy[key] = unit[key];
      }
    }
    return copy;
  }

  function registerUnit(unit) {
    if (!unit || !unit.symbol) {
      return;
    }
    var canonical = unit.symbol;
    unitsBySymbol[canonical] = unit;
    aliasMap[canonical] = canonical;
    aliasMap[canonical.toLowerCase()] = canonical;
    if (Array.isArray(unit.alias)) {
      unit.alias.forEach(function (alias) {
        if (!alias) {
          return;
        }
        var key = alias.toString().trim();
        aliasMap[key] = canonical;
        aliasMap[key.toLowerCase()] = canonical;
      });
    }
  }

  catalog.forEach(registerUnit);

  function normalize(symbol) {
    if (!symbol) {
      return '';
    }
    var key = symbol.toString().trim();
    if (aliasMap[key]) {
      return aliasMap[key];
    }
    var lower = key.toLowerCase();
    if (aliasMap[lower]) {
      return aliasMap[lower];
    }
    return key;
  }

  function getUnit(symbol) {
    var canonical = normalize(symbol);
    return unitsBySymbol[canonical] || null;
  }

  function listUnits() {
    return catalog.map(clone);
  }

  function describe(symbol) {
    var unit = getUnit(symbol);
    if (!unit) {
      return '';
    }
    var parts = [];
    parts.push(unit.symbol + (unit.name ? '（' + unit.name + '）' : ''));
    if (unit.description) {
      parts.push(unit.description);
    }
    if (unit.formulaSummary) {
      parts.push(unit.formulaSummary);
    }
    if (unit.related && unit.related.length) {
      parts.push('常见关联：' + unit.related.join('、'));
    }
    return parts.join(' · ');
  }

  function relate(symbol) {
    var unit = getUnit(symbol);
    if (!unit || !unit.relations) {
      return [];
    }
    return unit.relations.slice();
  }

  global.UnitKnowledge = {
    units: listUnits(),
    listUnits: listUnits,
    getUnit: getUnit,
    describe: describe,
    relate: relate,
    normalize: normalize
  };
})(typeof window !== 'undefined' ? window : this);
