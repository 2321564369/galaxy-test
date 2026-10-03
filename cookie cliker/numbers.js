// Golden Timer — minimal Cookie Monster-style mod.
// Features (each with its own on/off switch in Options):
//   1. Golden cookie timer bar
//   2. "No e+" — shows huge numbers as "1.75 undecillion" instead of "1.75e+35"

var GoldenTimerMod = {
  timerOn: true,
  noEOn: true,
  origBeautify: null,

  // ---------- number names ----------
  _small: ['million','billion','trillion','quadrillion','quintillion','sextillion','septillion','octillion','nonillion'],
  _units: ['','un','duo','tre','quattuor','quin','sex','septen','octo','novem'],
  _tens:  ['','dec','vigint','trigint','quadragint','quinquagint','sexagint','septuagint','octogint','nonagint'],

  // n = 1 -> million, 2 -> billion, ... 10 -> decillion ...
  nameFor: function (n) {
    var M = GoldenTimerMod;
    if (n < 1 || n > 99) return null;
    if (n < 10) return M._small[n - 1];
    return M._units[n % 10] + M._tens[Math.floor(n / 10)] + 'illion';
  },

  // turns 1.75e+35 into "1.75 undecillion"
  bigFormat: function (val) {
    var M = GoldenTimerMod;
    var neg = val < 0, a = Math.abs(val);
    if (!isFinite(a) || a < 1e6) return null;
    var idx = Math.floor(Math.log(a) / Math.LN10 / 3);       // groups of 1000
    var m = a / Math.pow(10, idx * 3);
    var r = Math.round(m * 1000) / 1000;
    if (r >= 1000) { r = 1; idx++; }
    var name = M.nameFor(idx - 1);
    if (!name) return null;                                    // past centillion -> leave as is
    return (neg ? '-' : '') + r + ' ' + name;
  },

  init: function () {
    var M = GoldenTimerMod;

    // ---------- timer bar ----------
    var css = document.createElement('style');
    css.textContent =
      '#gtBar{position:fixed;top:40px;left:10px;width:260px;height:22px;z-index:1000;' +
      'background:rgba(0,0,0,.65);border:1px solid #000;border-radius:4px;overflow:hidden;' +
      'font:bold 12px Tahoma,Arial,sans-serif;color:#fff;pointer-events:none;}' +
      '#gtFill{position:absolute;left:0;top:0;bottom:0;width:0;background:#8a7a2a;}' +
      '#gtMark{position:absolute;top:0;bottom:0;width:2px;background:#fff;opacity:.7;}' +
      '#gtText{position:absolute;left:0;right:0;top:0;bottom:0;line-height:22px;text-align:center;' +
      'text-shadow:0 0 3px #000,0 0 3px #000;}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'gtBar';
    bar.innerHTML = '<div id="gtFill"></div><div id="gtMark"></div><div id="gtText"></div>';
    document.body.appendChild(bar);
    M.bar = bar;
    M.fill = bar.querySelector('#gtFill');
    M.mark = bar.querySelector('#gtMark');
    M.text = bar.querySelector('#gtText');
    M.apply();
    Game.registerHook('draw', M.update);

    // ---------- no-e+ number formatting ----------
    M.origBeautify = window.Beautify || Game.Beautify;
    var wrapped = function (val, floats) {
      var out = M.origBeautify.apply(this, arguments);
      if (M.noEOn && typeof out === 'string' && out.indexOf('e+') !== -1) {
        var fixed = M.bigFormat(val);
        if (fixed) return fixed;
      }
      return out;
    };
    Game.Beautify = wrapped;
    window.Beautify = wrapped;

    // ---------- options menu ----------
    Game.customOptionsMenu.push(function () {
      var d = document.createElement('div');
      d.className = 'listing';
      d.innerHTML =
        M.optionHtml('timerOn', 'Golden cookie timer', 'Shows when the next golden cookie can appear and how long the current one lasts.') +
        M.optionHtml('noEOn', 'Replace e+ notation', 'Shows huge numbers as "1.75 undecillion" instead of "1.75e+35".');
      var sub = l('menu').childNodes[2];
      sub.insertBefore(d, sub.childNodes[sub.childNodes.length - 1]);
    });
  },

  optionHtml: function (key, label, desc) {
    var on = GoldenTimerMod[key];
    return '<div class="listing"><a class="option' + (on ? '' : ' off') + '" ' + Game.clickStr +
      '="GoldenTimerMod.toggle(\'' + key + '\');PlaySound(\'snd/tick.mp3\');">' +
      label + ' ' + (on ? 'ON' : 'OFF') + '</a><label>' + desc + '</label></div>';
  },

  toggle: function (key) {
    GoldenTimerMod[key] = !GoldenTimerMod[key];
    GoldenTimerMod.apply();
    Game.UpdateMenu();
  },

  apply: function () {
    var M = GoldenTimerMod;
    if (M.bar) M.bar.style.display = M.timerOn ? 'block' : 'none';
  },

  fmt: function (frames) {
    var s = Math.max(0, Math.ceil(frames / Game.fps));
    var m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2);
  },

  update: function () {
    var M = GoldenTimerMod;
    if (!M.timerOn || !M.bar) return;
    try {
      var gc = null;
      for (var i = 0; i < Game.shimmers.length; i++) {
        if (Game.shimmers[i].type === 'golden') { gc = Game.shimmers[i]; break; }
      }
      if (gc) {
        var total = Math.ceil(gc.dur * Game.fps);
        M.fill.style.width = (100 * gc.life / total) + '%';
        M.fill.style.background = gc.wrath ? '#a02020' : '#2e8b2e';
        M.mark.style.display = 'none';
        M.text.textContent = (gc.wrath ? 'Wrath cookie' : 'Golden cookie') + ' on screen: ' + M.fmt(gc.life);
        return;
      }
      var s = Game.shimmerTypes.golden;
      var t = s.time;
      var min = s.getMinTime ? s.getMinTime(s) : s.minTime;
      var max = s.getMaxTime ? s.getMaxTime(s) : s.maxTime;
      M.mark.style.display = 'block';
      M.mark.style.left = (100 * min / max) + '%';
      M.fill.style.width = Math.min(100, 100 * t / max) + '%';
      if (t < min) {
        M.fill.style.background = '#8a7a2a';
        M.text.textContent = 'Golden cookie possible in ' + M.fmt(min - t);
      } else {
        M.fill.style.background = '#d4a017';
        M.text.textContent = 'Golden cookie guaranteed within ' + M.fmt(max - t);
      }
    } catch (e) {
      M.text.textContent = 'Golden timer: waiting for game...';
    }
  },

  // ---------- save / load settings ----------
  save: function () {
    return JSON.stringify({ timerOn: GoldenTimerMod.timerOn, noEOn: GoldenTimerMod.noEOn });
  },
  load: function (str) {
    var M = GoldenTimerMod;
    try {
      var o = JSON.parse(str);
      M.timerOn = o.timerOn !== false;
      M.noEOn = o.noEOn !== false;
    } catch (e) {
      M.timerOn = (str !== '0');   // old save format
    }
    M.apply();
  }
};

Game.registerMod('goldenTimer', GoldenTimerMod);
