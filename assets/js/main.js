/* ==========================================================================
   BUXIN · 个人主页脚本
   - GitHub 仓库：运行时请求 API，sessionStorage 缓存 30 分钟
   - 非 GitHub 项目与站点：读取根目录 project.json
   - 两个数据源独立请求、独立失败，互不影响
   ========================================================================== */
(function () {
  'use strict';

  var GH_USER = 'BUXIN-A';
  var SELF_REPO = 'buxin-a/buxin-a';
  var API_URL = 'https://api.github.com/users/' + GH_USER + '/repos?per_page=100&sort=updated';
  var CACHE_KEY = 'buxin-a:gh-repos:v1';
  var CACHE_TTL = 30 * 60 * 1000;
  var IS_FILE = location.protocol === 'file:';

  var LANG_COLORS = {
    JavaScript: '#F1E05A', TypeScript: '#3178C6', Python: '#3572A5',
    HTML: '#E34C26', CSS: '#563D7C', SCSS: '#C6538C', Vue: '#41B883',
    Svelte: '#FF3E00', Astro: '#FF5A03', Shell: '#89E051', PowerShell: '#012456',
    Go: '#00ADD8', Java: '#B07219', Kotlin: '#A97BFF', Swift: '#F05138',
    Dart: '#00B4AB', 'C': '#555555', 'C++': '#F34B7D', 'C#': '#178600',
    Rust: '#DEA584', PHP: '#4F5D95', Ruby: '#701516', Lua: '#000080',
    'Jupyter Notebook': '#DA5B0B', Dockerfile: '#384D54', Nix: '#7E7EFF',
    MDX: '#FCB32C', Zig: '#EC915C', Assembly: '#6E4C13', Makefile: '#427819'
  };

  var ICONS = {
    star: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5z"/></svg>',
    fork: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>',
    clock: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.2 1.6"/></svg>',
    globe: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M1.9 6h12.2M1.9 10h12.2"/><path d="M8 1.8c1.7 1.9 2.5 4 2.5 6.2S9.7 12.3 8 14.2C6.3 12.3 5.5 10.2 5.5 8S6.3 3.7 8 1.8Z"/></svg>',
    link: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.5 9.5 9.5 6.5"/><path d="M7 4.6l1-1a2.4 2.4 0 0 1 3.4 3.4l-1 1"/><path d="M9 11.4l-1 1a2.4 2.4 0 0 1-3.4-3.4l1-1"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>'
  };

  var state = {
    sites: [],
    localProjects: [],
    ghProjects: [],
    localStatus: 'loading',   // loading | ok | error | file
    ghStatus: 'loading',      // loading | ok | stale | rate | error | file
    sort: 'updated',
    since: null
  };

  /* ---------- 工具 ---------- */
  function $(sel) { return document.querySelector(sel); }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function txt(value) { return document.createTextNode(value); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconSpan(name) {
    var span = el('span', 'ico');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = ICONS[name] || '';
    return span;
  }

  function isHttpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
  }

  function hostOf(value) {
    try {
      return new URL(value, location.href).hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  function normLink(value) {
    try {
      var url = new URL(String(value), location.href);
      return (url.hostname.toLowerCase().replace(/^www\./, '') + url.pathname.replace(/\/+$/, ''));
    } catch (e) {
      return String(value || '').trim().toLowerCase();
    }
  }

  function initial(name) {
    var s = String(name || '').trim();
    return s ? s.charAt(0).toUpperCase() : '#';
  }

  function formatCount(n) {
    var num = Number(n) || 0;
    if (num < 1000) return String(num);
    var k = num / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }

  function relTime(value) {
    var time = Date.parse(value || '');
    if (!time) return '';
    var diff = Date.now() - time;
    if (diff < 0) return '刚刚';
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hours = Math.floor(min / 60);
    if (hours < 24) return hours + ' 小时前';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + ' 天前';
    var months = Math.floor(days / 30);
    if (months < 12) return months + ' 个月前';
    return Math.floor(months / 12) + ' 年前';
  }

  function langColor(name) {
    return LANG_COLORS[name] || 'var(--text-3)';
  }

  /* ---------- 骨架屏 ---------- */
  function skeletonCard() {
    var box = el('div', 'card project-card is-skeleton');
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '<span class="skel-row"><span class="skel skel-icon-sm"></span><span class="skel w50"></span></span>' +
      '<span class="skel"></span><span class="skel w80"></span><span class="skel w40"></span>';
    return box;
  }

  function skeletonSite() {
    var box = el('div', 'card site-card is-skeleton');
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '<span class="skel skel-icon"></span>' +
      '<span class="site-body"><span class="skel w50"></span><span class="skel w70"></span></span>';
    return box;
  }

  /* ---------- 卡片 ---------- */
  function metaItem(iconName, text) {
    var span = el('span', 'meta-item');
    span.appendChild(iconSpan(iconName));
    span.appendChild(txt(text));
    return span;
  }

  function projectCard(item) {
    var card = el('a', 'card project-card');
    card.href = item.link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    var head = el('span', 'pcard-head');
    var icon = el('span', 'pcard-icon', initial(item.name));
    icon.setAttribute('aria-hidden', 'true');
    head.appendChild(icon);
    head.appendChild(el('span', 'pcard-name', item.name));
    if (item.archived) head.appendChild(el('span', 'badge', '已归档'));
    card.appendChild(head);

    card.appendChild(el('span', 'pcard-desc' + (item.description ? '' : ' is-empty'),
      item.description || '暂无描述'));

    var meta = el('span', 'pcard-meta');
    if (item.language) {
      var lang = el('span', 'lang');
      var dot = el('i', 'lang-dot');
      dot.style.setProperty('--dot', langColor(item.language));
      lang.appendChild(dot);
      lang.appendChild(txt(item.language));
      meta.appendChild(lang);
    }
    if (item.source === 'github') {
      meta.appendChild(metaItem('star', formatCount(item.stars)));
      meta.appendChild(metaItem('fork', formatCount(item.forks)));
      var updated = relTime(item.updated);
      if (updated) meta.appendChild(metaItem('clock', updated));
    } else {
      var host = hostOf(item.link);
      if (host) meta.appendChild(metaItem('link', host));
    }
    card.appendChild(meta);

    if (item.tags && item.tags.length) {
      var tags = el('span', 'pcard-tags');
      item.tags.slice(0, 3).forEach(function (tag) {
        tags.appendChild(el('span', 'tag', tag));
      });
      card.appendChild(tags);
    }

    if (isHttpUrl(item.homepage)) {
      var foot = el('span', 'pcard-foot');
      foot.appendChild(iconSpan('globe'));
      foot.appendChild(el('span', null, hostOf(item.homepage)));
      card.appendChild(foot);
    }

    return card;
  }

  function siteCard(site) {
    var card = el('a', 'card site-card');
    card.href = site.link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    var icon = el('span', 'site-icon', site.icon || initial(site.name));
    icon.setAttribute('aria-hidden', 'true');
    card.appendChild(icon);

    var body = el('span', 'site-body');
    body.appendChild(el('span', 'site-name', site.name));
    if (site.description) body.appendChild(el('span', 'site-desc', site.description));
    var host = hostOf(site.link);
    if (host) body.appendChild(el('span', 'site-domain', host));
    card.appendChild(body);

    var arrow = el('span', 'site-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = ICONS.arrow;
    card.appendChild(arrow);

    return card;
  }

  function emptyCard(text) {
    return el('div', 'empty-card', text);
  }

  /* ---------- 提示 ---------- */
  function buildNotice(title, nodes) {
    var p = el('p', 'notice');
    p.appendChild(el('strong', null, title));
    nodes.forEach(function (node) { p.appendChild(node); });
    return p;
  }

  function makeLink(href, text) {
    var a = el('a', null, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function ghNotice() {
    var status = state.ghStatus;
    if (status === 'ok' || status === 'loading') return null;

    if (status === 'file') {
      return buildNotice('本地文件方式无法读取数据：', [
        txt('当前页面以 file:// 打开，浏览器会拦截 GitHub 接口与 project.json 的请求。请在仓库目录启动本地服务器预览，例如 '),
        el('code', null, 'python -m http.server 8000'),
        txt('，再访问 http://localhost:8000（本机可用 E:\\environment\\python\\python313\\python.exe -m http.server 8000）。')
      ]);
    }
    if (status === 'rate') {
      return buildNotice('GitHub 接口达到访问频率上限：', [
        txt('未认证请求每小时 60 次，仓库列表暂时无法更新。已显示可用的项目数据，稍后刷新会自动重试，或'),
        makeLink('https://github.com/' + GH_USER, '直接前往 GitHub 主页查看全部仓库'),
        txt('。')
      ]);
    }
    if (status === 'stale') {
      return buildNotice('GitHub 数据可能不是最新：', [
        txt('本次请求失败，当前展示的是本会话缓存（最长 30 分钟）中的仓库数据。稍后刷新会重新拉取。')
      ]);
    }
    return buildNotice('GitHub 仓库列表加载失败：', [
      txt('请检查网络或代理设置后刷新页面，也可以'),
      makeLink('https://github.com/' + GH_USER, '直接前往 GitHub 主页查看全部仓库'),
      txt('。')
    ]);
  }

  function localNotice() {
    if (state.localStatus === 'ok' || state.localStatus === 'loading' || state.localStatus === 'file') return null;
    return buildNotice('project.json 加载失败：', [
      txt('站点与补充项目未能读取。请确认该文件位于仓库根目录且为合法的 JSON 格式。')
    ]);
  }

  function renderNotes() {
    var projectSlot = $('#projects-note');
    clear(projectSlot);
    var gh = ghNotice();
    if (gh) projectSlot.appendChild(gh);
    var local = localNotice();
    if (local) projectSlot.appendChild(local);

    var siteSlot = $('#sites-note');
    clear(siteSlot);
    if (state.localStatus === 'error') {
      siteSlot.appendChild(buildNotice('站点数据加载失败：', [
        txt('未能读取 project.json，请确认文件存在且格式正确。')
      ]));
    } else if (state.localStatus === 'file') {
      siteSlot.appendChild(buildNotice('站点数据未加载：', [
        txt('file:// 方式下无法读取 project.json，请使用本地服务器预览。')
      ]));
    }
  }

  /* ---------- 渲染 ---------- */
  function sortProjects(items) {
    return items.slice().sort(function (a, b) {
      if (state.sort === 'stars') {
        var diff = (Number(b.stars) || 0) - (Number(a.stars) || 0);
        if (diff) return diff;
      }
      var ta = Date.parse(a.updated || '') || 0;
      var tb = Date.parse(b.updated || '') || 0;
      return tb - ta;
    });
  }

  function mergedProjects() {
    var seen = Object.create(null);
    var merged = [];
    function push(item) {
      var key = normLink(item.link);
      if (!key || seen[key]) return;
      seen[key] = true;
      merged.push(item);
    }
    state.ghProjects.forEach(push);
    state.localProjects.forEach(push);
    return sortProjects(merged);
  }

  function renderProjects() {
    var grid = $('#projects-grid');
    var items = mergedProjects();
    var loading = state.ghStatus === 'loading' || state.localStatus === 'loading';
    var frag = document.createDocumentFragment();

    items.forEach(function (item) { frag.appendChild(projectCard(item)); });

    if (loading) {
      var pending = state.ghStatus === 'loading' ? 3 : 1;
      for (var i = 0; i < pending; i++) frag.appendChild(skeletonCard());
    } else if (!items.length && state.ghStatus === 'ok' && state.localStatus === 'ok') {
      frag.appendChild(emptyCard('暂时没有可展示的项目。'));
    }

    clear(grid);
    grid.appendChild(frag);
    grid.setAttribute('aria-busy', loading ? 'true' : 'false');
    renderNotes();
  }

  function renderSites() {
    var grid = $('#sites-grid');
    clear(grid);

    if (state.localStatus === 'loading') {
      grid.appendChild(skeletonSite());
      grid.appendChild(skeletonSite());
      grid.appendChild(skeletonSite());
      grid.setAttribute('aria-busy', 'true');
    } else {
      state.sites.forEach(function (site) { grid.appendChild(siteCard(site)); });
      if (!state.sites.length && state.localStatus === 'ok') {
        grid.appendChild(emptyCard('暂时没有可展示的站点。'));
      }
      grid.setAttribute('aria-busy', 'false');
    }
    renderNotes();
  }

  function updateStats() {
    var ghReady = state.ghStatus === 'ok' || state.ghStatus === 'stale';
    if (ghReady) $('#stat-repos').textContent = String(state.ghProjects.length);
    if (state.localStatus === 'ok') $('#stat-sites').textContent = String(state.sites.length);

    if (state.since) {
      $('#stat-since').textContent = String(state.since);
      var year = new Date().getFullYear();
      $('#footer-year').textContent = state.since < year ? state.since + '–' + year : String(year);
    }
  }

  /* ---------- 数据：project.json ---------- */
  function normalizeLocalProject(raw) {
    var tags = Array.isArray(raw.tags) ? raw.tags : [];
    return {
      name: String(raw.name).trim(),
      link: String(raw.link).trim(),
      description: typeof raw.description === 'string' ? raw.description.trim() : '',
      tags: tags.filter(function (t) {
        return typeof t === 'string' && t.trim();
      }).map(function (t) { return t.trim(); }),
      language: typeof raw.language === 'string' ? raw.language.trim() : '',
      stars: 0,
      forks: 0,
      updated: '',
      homepage: '',
      archived: false,
      source: 'local'
    };
  }

  function loadLocal() {
    if (IS_FILE) {
      state.localStatus = 'file';
      renderSites();
      renderProjects();
      updateStats();
      return;
    }

    fetch('project.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var sites = data && Array.isArray(data.sites) ? data.sites : [];
        var projects = data && Array.isArray(data.projects) ? data.projects : [];

        state.sites = sites.filter(function (s) {
          return s && typeof s.name === 'string' && s.name.trim() && isHttpUrl(s.link);
        }).map(function (s) {
          return {
            name: String(s.name).trim(),
            link: String(s.link).trim(),
            description: typeof s.description === 'string' ? s.description.trim() : '',
            icon: typeof s.icon === 'string' ? s.icon.trim() : ''
          };
        });

        state.localProjects = projects.filter(function (p) {
          return p && typeof p.name === 'string' && p.name.trim() && isHttpUrl(p.link);
        }).map(normalizeLocalProject);

        state.localStatus = 'ok';
      })
      .catch(function () {
        state.localStatus = 'error';
      })
      .then(function () {
        renderSites();
        renderProjects();
        updateStats();
      });
  }

  /* ---------- 数据：GitHub ---------- */
  function normalizeRepos(list) {
    return list.filter(function (repo) {
      if (!repo || !isHttpUrl(repo.html_url)) return false;
      if (repo.fork || repo.archived) return false;
      if (String(repo.full_name || '').toLowerCase() === SELF_REPO) return false;
      return true;
    }).map(function (repo) {
      var topics = Array.isArray(repo.topics) ? repo.topics : [];
      return {
        name: repo.name,
        link: repo.html_url,
        description: typeof repo.description === 'string' ? repo.description : '',
        language: repo.language || '',
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        updated: repo.pushed_at || repo.updated_at || '',
        created: repo.created_at || '',
        homepage: typeof repo.homepage === 'string' ? repo.homepage.trim() : '',
        tags: topics.slice(0, 3),
        archived: false,
        source: 'github'
      };
    });
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (!cached || !Array.isArray(cached.items) || typeof cached.t !== 'number') return null;
      return { items: cached.items, fresh: Date.now() - cached.t < CACHE_TTL };
    } catch (e) {
      return null;
    }
  }

  function writeCache(items) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: items }));
    } catch (e) {
      /* 隐私模式或超配额时忽略缓存 */
    }
  }

  function computeSince(items) {
    var earliest = null;
    items.forEach(function (item) {
      var time = Date.parse(item.created || '');
      if (time && (earliest === null || time < earliest)) earliest = time;
    });
    return earliest ? new Date(earliest).getFullYear() : null;
  }

  function afterGitHub() {
    state.since = computeSince(state.ghProjects);
    updateStats();
    renderProjects();
  }

  function loadGitHub() {
    if (IS_FILE) {
      state.ghStatus = 'file';
      renderProjects();
      updateStats();
      return;
    }

    var cached = readCache();
    if (cached && cached.fresh) {
      state.ghProjects = cached.items;
      state.ghStatus = 'ok';
      afterGitHub();
      return;
    }

    fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) {
        if (!res.ok) {
          var error = new Error('HTTP ' + res.status);
          error.kind = (res.status === 403 || res.status === 429) ? 'rate' : 'error';
          throw error;
        }
        return res.json();
      })
      .then(function (list) {
        if (!Array.isArray(list)) throw new Error('unexpected payload');
        state.ghProjects = normalizeRepos(list);
        state.ghStatus = 'ok';
        writeCache(state.ghProjects);
        afterGitHub();
      })
      .catch(function (error) {
        if (cached && cached.items.length) {
          state.ghProjects = cached.items;
          state.ghStatus = 'stale';
        } else {
          state.ghStatus = (error && error.kind) || 'error';
        }
        afterGitHub();
      });
  }

  /* ---------- 主题 / 菜单 / 排序 ---------- */
  function initTheme() {
    var root = document.documentElement;
    var button = $('#theme-toggle');

    function sync() {
      var dark = root.dataset.theme === 'dark';
      var label = dark ? '切换到浅色模式' : '切换到深色模式';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }

    button.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('buxin-theme', next); } catch (e) {}
      sync();
    });

    sync();
  }

  function initMenu() {
    var button = $('#menu-btn');
    var nav = $('#site-nav');
    if (!button || !nav) return;

    function close() {
      nav.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', '打开导航菜单');
    }

    button.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) close();
    });

    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || button.contains(event.target)) return;
      close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        close();
        button.focus();
      }
    });
  }

  function initSort() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.sort-toggle button'));
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.sort = button.dataset.sort === 'stars' ? 'stars' : 'updated';
        buttons.forEach(function (item) {
          item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
        });
        renderProjects();
      });
    });
  }

  function init() {
    initTheme();
    initMenu();
    initSort();
    loadLocal();
    loadGitHub();
  }

  init();
})();
