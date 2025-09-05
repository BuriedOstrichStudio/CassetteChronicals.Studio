// Robust scripts.js - Window system + blog loader + menu wiring
'use strict';

/* ----------------------
   Drag singleton
   ---------------------- */
const drag = (() => {
  const instance = {};
  let object = null;
  let x, y, _threshold;

  instance.start = (obj, e, threshold) => {
    e.preventDefault();
    object = obj;
    _threshold = threshold || 0;
    _threshold *= _threshold;
    x = e.clientX;
    y = e.clientY;
  };

  document.addEventListener('mousemove', e => {
    if (!object) return;
    let dx = e.clientX - x;
    let dy = e.clientY - y;
    if (_threshold) {
      if (dx * dx + dy * dy < _threshold) return;
      _threshold = 0;
    }
    try { object.dragMove(dx, dy, e); } catch (err) { console.error('dragMove error', err); }
    x = e.clientX;
    y = e.clientY;
  });

  document.addEventListener('mouseup', () => {
    if (!object) return;
    try { if (!_threshold) object.dragEnd(); } catch (err) { console.error('dragEnd error', err); }
    object = null;
  });

  return instance;
})();

/* ----------------------
   WindowHost + Window
   ---------------------- */
class WindowHost {
  constructor(root) {
    // root should be a DOM element; fallback to body if falsy
    this.root = root || document.body;
    this.edgeMaximize = true;
    this.windows = [];
    this.activeWindow = null;
    this.maxZIndex = 1000; // Starting z-index for windows

    // clicking background unfocuses windows
    this.root.addEventListener('mousedown', () => this.focus(null));

    window.addEventListener('resize', () => {
      for (let w of this.windows) w.reposition();
    });
  }

  // create window wrapper for DOM element (or return existing)
  create(windowElement) {
    if (!windowElement) return null;
    if (windowElement.csWindow) {
      // already created
      windowElement.csWindow.reposition();
      windowElement.csWindow.focus();
      return windowElement.csWindow;
    }
    const w = new Window(windowElement, this);
    this.windows.push(w);
    w.focus();
    return w;
  }

  // find window instance by DOM id
  getWindowById(id) {
    return this.windows.find(w => w.root && w.root.id === id) || null;
  }

  focus(w) {
    if (this.activeWindow && this.activeWindow !== w) this.activeWindow.setActive(false);
    this.activeWindow = w;
    if (this.activeWindow) {
      this.activeWindow.setActive(true);
      this.bringToFront(this.activeWindow);
    }
  }

  // Bring a window to the front by giving it the highest z-index
  bringToFront(windowInstance) {
    if (!windowInstance || !windowInstance.root) return;

    this.maxZIndex++;
    windowInstance.root.style.zIndex = this.maxZIndex;
  }
}

class Window {
  constructor(root, host) {
    this.root = root;
    this.root.csWindow = this;
    this.host = host;
    // use .title-bar-text or fallback to .title-bar
    this.titleBarText = root.querySelector('.title-bar-text') || root.querySelector('.title-bar') || root;
    this.resizeX = 0; this.resizeY = 0; this.resizeCursor = '';
    this.resizing = false; this.maximized = false; this.oldPosition = null;

    this.x = 0; this.y = 0; this.width = 300; this.height = 200;

    this.init();
    this.initButtons();
    this.attachEvents();
  }

  init() {
    // try to measure the element; if display:none rect.width is 0 => try computed style or defaults
    const hostRect = this.host.root.getBoundingClientRect();
    const rect = this.root.getBoundingClientRect();
    this.root.style.position = 'absolute';
    if (rect.width > 0) {
      this.x = Math.max(0, rect.left - hostRect.left);
      this.y = Math.max(0, rect.top - hostRect.top);
      this.width = rect.width;
      this.height = rect.height;
    } else {
      // fallback: use computed styles or center in host
      const cs = getComputedStyle(this.root);
      this.width = parseInt(cs.width) || this.width;
      this.height = parseInt(cs.height) || this.height;
      this.x = Math.max(0, Math.round((hostRect.width - this.width) / 2));
      this.y = Math.max(0, Math.round((hostRect.height - this.height) / 2));
    }
    this.updatePosition();
  }

  initButtons() {
    const buttons = this.root.querySelectorAll('.title-bar-buttons > button');
    for (let b of buttons) {
      if (b.hasAttribute('data-maximize')) {
        b.addEventListener('click', () => this.maximize());
      }
      if (b.hasAttribute('data-close')) {
        b.addEventListener('click', () => {
          // hide window and unfocus
          this.root.style.display = 'none';
          this.host.focus(null);
        });
      }
    }
  }

  attachEvents() {
    // drag start on title
    if (this.titleBarText) {
      this.titleBarText.addEventListener('mousedown', e => drag.start(this, e, this.maximized ? 10 : 0));
      this.titleBarText.addEventListener('dblclick', () => this.maximize());
    }
    // focus on mousedown
    this.root.addEventListener('mousedown', e => { e.stopPropagation(); this.focus(); });

    // edge detection for resize cursor
    this.root.addEventListener('mousemove', e => {
      if (this.resizing) return;
      this.resizeX = this.resizeY = 0; this.resizeCursor = '';
      if (e.target === this.root && !this.maximized) {
        const rect = this.root.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (y < 20) this.resizeY = -1;
        else if (y > rect.height - 20) this.resizeY = 1;
        if (x < 20) this.resizeX = -1;
        else if (x > rect.width - 20) this.resizeX = 1;
      }
      if (this.resizeX || this.resizeY) {
        if (this.resizeY < 0) this.resizeCursor += 'n';
        else if (this.resizeY > 0) this.resizeCursor += 's';
        if (this.resizeX < 0) this.resizeCursor += 'w';
        else if (this.resizeX > 0) this.resizeCursor += 'e';
        this.resizeCursor += '-resize';
      }
      this.root.style.cursor = this.resizeCursor;
    });

    // start resizing when clicking edges
    this.root.addEventListener('mousedown', e => {
      if (e.target === this.root && !this.maximized && (this.resizeX || this.resizeY)) {
        e.stopPropagation();
        this.resizing = true;
        document.body.style.cursor = this.resizeCursor;
        drag.start(this, e, 0);
      }
    });
  }

  setActive(active) {
    if (active) this.root.classList.add('active'); else this.root.classList.remove('active');
  }

  focus() { this.host.focus(this); }

  dragMove(dx, dy, e) {
    if (this.resizing) {
      if (this.resizeX < 0) this.x += dx;
      if (this.resizeY < 0) this.y += dy;
      this.width += dx * this.resizeX;
      this.height += dy * this.resizeY;
      this.updatePosition();
      return;
    }

    const hostRect = this.host.root.getBoundingClientRect();

    if (this.host.edgeMaximize && e.clientY - hostRect.top < 5) {
      if (!this.maximized) this.maximize();
      return;
    } else if (this.maximized) {
      this.maximized = false;
      this.root.classList.remove('maximized');
      if (this.oldPosition) {
        this.width = this.oldPosition.width;
        this.height = this.oldPosition.height;
        this.x = Math.floor(e.clientX - hostRect.left - this.width * e.clientX / hostRect.width);
      }
    }

    this.x += dx;
    this.y += dy;
    this.updatePosition();
  }

  dragEnd() {
    if (this.resizing) {
      this.resizing = false;
      this.resizeCursor = '';
      this.resizeX = this.resizeY = 0;
      this.root.style.cursor = '';
      document.body.style.cursor = '';
    }
    this.reposition();
  }

  reposition() {
    const hostRect = this.host.root.getBoundingClientRect();
    if (this.maximized) {
      this.x = 0; this.y = 0;
      this.width = hostRect.width;
      this.height = hostRect.height;
    } else {
      if (this.y < 0) this.y = 0;
      else if (this.y + 30 > hostRect.height) this.y = hostRect.height - 30;
      if (this.x + this.width < 50) this.x = 50 - this.width;
      else if (this.x + 30 > hostRect.width) this.x = hostRect.width - 30;
    }
    this.updatePosition();
  }

  updatePosition() {
  // Position & size the window shell
  this.root.style.left   = this.x + 'px';
  this.root.style.top    = this.y + 'px';
  this.root.style.width  = this.width + 'px';
  this.root.style.height = this.height + 'px';

  // Make the body fill the remaining vertical space under the title bar
  const body  = this.root.querySelector('.window-body');
  if (body) {
    const title = this.root.querySelector('.title-bar, .titlebar');
    const titleH = title ? title.offsetHeight : 0;

    const csRoot = getComputedStyle(this.root);
    const padV = (parseInt(csRoot.paddingTop) || 0) + (parseInt(csRoot.paddingBottom) || 0);

    const csBody = getComputedStyle(body);
    const bodyBorderV = (parseInt(csBody.borderTopWidth) || 0) + (parseInt(csBody.borderBottomWidth) || 0);

    const chrome = titleH + padV + bodyBorderV;
    const bodyH = Math.max(0, this.height - chrome);
    body.style.height = bodyH + 'px';
  }
}

  maximize() {
    this.maximized = !this.maximized;
    if (this.maximized) {
      this.root.classList.add('maximized');
      this.oldPosition = { x: this.x, y: this.y, width: this.width, height: this.height };
      this.reposition();
    } else {
      this.root.classList.remove('maximized');
      if (this.oldPosition) {
        Object.assign(this, this.oldPosition);
        this.reposition();
      }
    }
  }

  // show/hide helpers:
  show() {
    this.root.style.display = 'block';
    // recalc size if visible
    const rect = this.root.getBoundingClientRect();
    if (rect.width > 0) { this.width = rect.width; this.height = rect.height; }
    this.reposition();
    this.focus();
  }
  hide() { this.root.style.display = 'none'; this.host.focus(null); }
}

/* ----------------------
   Blog tree & entries loader (per-blog)
   ---------------------- */
let blogTreesCache = {};
let blogEntriesCache = {};

async function loadBlogTree(blogId, treeFile, treeContainerId, entriesFile) {
  try {
    if (blogTreesCache[blogId]) return;

    const response = await fetch(treeFile);
    if (!response.ok) {
      console.warn('Failed to load tree file:', treeFile, response.status);
      document.getElementById(treeContainerId).innerHTML = `<p style="color:red;">Failed to load ${treeFile}</p>`;
      return;
    }
    const htmlText = await response.text();
    const container = document.getElementById(treeContainerId);
    if (!container) {
      console.warn('Missing tree container', treeContainerId);
      return;
    }
    container.innerHTML = htmlText;

    // init expand/collapse if initTrees exists
    if (typeof initTrees === 'function') initTrees(container);

    // hook links to load content
    container.querySelectorAll('.tree-link[data-content]').forEach(link => {
      link.addEventListener('click', async e => {
        e.preventDefault();
        const contentId = link.getAttribute('data-content');
        const blogContent = document.querySelector(`#${blogId} .blog-content`);
        if (!blogContent) return;

        // load entries file once and cache
        if (!blogEntriesCache[blogId]) {
          const r2 = await fetch(entriesFile);
          if (!r2.ok) {
            blogContent.innerHTML = `<p style="color:red;">Failed to load entries: ${entriesFile}</p>`;
            return;
          }
          const text = await r2.text();
          const wrap = document.createElement('div');
          wrap.innerHTML = text;
          blogEntriesCache[blogId] = wrap;
        }

        const entry = blogEntriesCache[blogId].querySelector('#' + contentId);
        if (entry) blogContent.innerHTML = entry.innerHTML;
        else blogContent.innerHTML = `<p style="color:red;">Entry not found: ${contentId}</p>`;
      });
    });

    blogTreesCache[blogId] = true;
  } catch (err) {
    console.error('loadBlogTree error', err);
  }
}

/* ----------------------
   openWindowById - robust
   ---------------------- */
// hostRef will be set at DOMContentLoaded
let hostRef = null;

function openWindowById(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn('openWindowById: element not found', id);
    return;
  }

  // ensure visible immediately
  el.style.display = 'block';

  // if host exists and knows this window, use its methods
  if (hostRef) {
    const inst = hostRef.getWindowById(id);
    if (inst) {
      inst.show();
      hostRef.bringToFront(inst); // Bring to front when opened
      return;
    } else {
      // create and show
      const newInst = hostRef.create(el);
      hostRef.bringToFront(newInst); // Bring to front when created
      return;
    }
  } else {
    // no host: just ensure simple focus class
    el.classList.add('active');
  }
}

// Function to open AOL window (called by double-clicking AOL icon)
function openAOL() {
  openWindowById('aolWindow');
}

// Function to close AOL window (called by close button)
function closeAOL() {
  const aolWindow = document.getElementById('aolWindow');
  if (aolWindow) {
    aolWindow.style.display = 'none';
  }
}

// Function to show password hint window
function showHint() {
  openWindowById('hintWindow');
}

// Function to close password hint window
function closeHint() {
  const hintWindow = document.getElementById('hintWindow');
  if (hintWindow) {
    hintWindow.style.display = 'none';
  }
}

// Function to close sign-on success window
function closeSignon() {
  const signonWindow = document.getElementById('signonWindow');
  if (signonWindow) {
    signonWindow.style.display = 'none';
  }
}

// Function to center sign-on window over AOL window
function centerSignonWindow() {
  const aolWindow = document.getElementById('aolWindow');
  const signonWindow = document.getElementById('signonWindow');

  if (aolWindow && signonWindow) {
    const aolRect = aolWindow.getBoundingClientRect();
    const signonWidth = 350;
    const signonHeight = 200;

    // Calculate center position
    const centerX = aolRect.left + (aolRect.width / 2) - (signonWidth / 2);
    const centerY = aolRect.top + (aolRect.height / 2) - (signonHeight / 2);

    // Set position
    signonWindow.style.left = centerX + 'px';
    signonWindow.style.top = centerY + 'px';
  }
}

// Function for SignOn button (placeholder functionality)
function signOn() {
  const screenname = document.getElementById('screenname').value;
  const password = document.getElementById('password').value;
  const location = document.getElementById('location').value;

  if (!password) {
    // Show error in sign-on window
    const signonWindow = document.getElementById('signonWindow');
    const signonMessage = document.getElementById('signonMessage');
    if (signonWindow && signonMessage) {
      signonMessage.textContent = 'Please enter a password';
      signonMessage.style.color = 'red';
      centerSignonWindow(); // Center over AOL window
      openWindowById('signonWindow');
    }
    return;
  }

  // Simple authentication simulation
  if (password === 'TheBigBoulder') {
    // Show success in sign-on window
    const signonWindow = document.getElementById('signonWindow');
    const signonMessage = document.getElementById('signonMessage');
    if (signonWindow && signonMessage) {
      signonMessage.textContent = `Welcome ${screenname}! You are now signed on to America Online.`;
      signonMessage.style.color = 'black';
      centerSignonWindow(); // Center over AOL window
      openWindowById('signonWindow');
    }
    closeAOL(); // Close the login window after successful sign-on
  } else {
    // Show error in sign-on window
    const signonWindow = document.getElementById('signonWindow');
    const signonMessage = document.getElementById('signonMessage');
    if (signonWindow && signonMessage) {
      signonMessage.textContent = 'Invalid password. Please try again.';
      signonMessage.style.color = 'red';
      centerSignonWindow(); // Center over AOL window
      openWindowById('signonWindow');
    }
  }
}

/* ----------------------
   Menu helpers (closeAllMenus) - minimal implementation
   ---------------------- */
function closeAllMenus() {
  const menubar = document.querySelector('[role="menubar"]');
  if (!menubar) return;
  menubar.querySelectorAll('li').forEach(li => { try { li.blur && li.blur(); } catch(e){} });
  if (document.activeElement) document.activeElement.blur();
}

/* ----------------------
   Lightweight tree initializer (if you don't have one)
   - Adds toggles for li that have child ULs
   ---------------------- */
function initTrees(root) {
  const roots = root.querySelectorAll ? root.querySelectorAll('.tree') : [];
  for (let tree of roots) {
    const parents = tree.querySelectorAll('li[role="treeitem"]');
    for (let item of parents) {
      const group = item.querySelector(':scope > ul[role="group"]');
      if (!group) continue;
      if (!item.hasAttribute('aria-expanded')) item.setAttribute('aria-expanded', 'false');

      // add toggle span if missing
      let toggle = item.querySelector(':scope > .toggle');
      if (!toggle) {
        toggle = document.createElement('span');
        toggle.className = 'toggle';
        toggle.setAttribute('aria-hidden', 'true');
        item.insertBefore(toggle, item.firstChild);
      }
      toggle.textContent = item.getAttribute('aria-expanded') === 'true' ? '▾' : '▸';

      // click handlers
      toggle.addEventListener('click', e => { e.stopPropagation(); toggleExpand(item); });
      item.addEventListener('click', e => {
        if (e.target.closest('a')) return; // let links function
        toggleExpand(item);
      });
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(item); }
      });
    }
  }
}
function toggleExpand(item) {
  const expanded = item.getAttribute('aria-expanded') === 'true';
  item.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  const toggle = item.querySelector(':scope > .toggle');
  if (toggle) toggle.textContent = expanded ? '▸' : '▾';
}

/* ----------------------
   DOMContentLoaded initialization
   ---------------------- */
window.addEventListener('DOMContentLoaded', () => {
  // pick a host root sensibly: <main> -> .desktop-container -> body
  const hostRoot = document.querySelector('main') || document.querySelector('.desktop-container') || document.body;
  hostRef = new WindowHost(hostRoot);

  // create Window wrappers for .window elements
  const windows = Array.from(document.getElementsByClassName('window') || []);
  // Temporarily reveal hidden ones to measure them correctly
  const hidden = windows.filter(w => getComputedStyle(w).display === 'none');
  for (let h of hidden) h.style.display = 'block';

  for (let w of windows) {
    hostRef.create(w);
  }
  // re-hide those that were hidden originally
  for (let h of hidden) h.style.display = 'none';

  // Attach "About This Mac" menu item
  const aboutMenuEl = document.getElementById('openAboutWindow');
  if (aboutMenuEl) {
    aboutMenuEl.addEventListener('click', e => {
      e.stopPropagation();
      openWindowById('aboutWindow');
      closeAllMenus();
    });
  }

  // Attach "About This Fake OS" help menu item
  const helpMenuEl = document.getElementById('openHelpWindow');
  if (helpMenuEl) {
    helpMenuEl.addEventListener('click', e => {
      e.stopPropagation();
      openWindowById('helpWindow');
      closeAllMenus();
    });
  }

  // Attach blog menu items safely (only if present)
  const blogMap = [
    {menuId:'openBlog1', winId:'blogWindow1', treeFile:'blogs/blogtrees/Randome_Thoughts_Tree.html', treeContainer:'blogTree1', entries:'blogs/blogentries/Random_Thought_Entries.html'},
    {menuId:'openBlog2', winId:'blogWindow2', treeFile:'blogs/blogtrees/Cassette_Chronicles_News_Tree.html', treeContainer:'blogTree2', entries:'blogs/blogentries/Cassette_Chronicles_News_Entries.html'},
    {menuId:'openBlog3', winId:'blogWindow3', treeFile:'blogs/blogtrees/Gaming_News_Tree.html', treeContainer:'blogTree3', entries:'blogs/blogentries/Gaming_News_Entries.html'}
  ];

  for (let b of blogMap) {
    const menuEl = document.getElementById(b.menuId);
    if (!menuEl) {
      console.warn('menu item missing:', b.menuId);
      continue;
    }
    menuEl.addEventListener('click', e => {
      e.stopPropagation();
      openWindowById(b.winId);
      loadBlogTree(b.winId, b.treeFile, b.treeContainer, b.entries);
      closeAllMenus();
    });
  }

  // small: ensure menubar click/focus behavior still works if present
  const menubar = document.querySelector('[role="menubar"]');
  if (menubar) {
    const topMenus = menubar.querySelectorAll(':scope > li[tabindex]');
    topMenus.forEach(li => {
      li.addEventListener('mousedown', e => e.preventDefault());
      li.addEventListener('click', e => {
        e.stopPropagation();
        const alreadyOpen = li.matches(':focus-within');
        closeAllMenus();
        if (!alreadyOpen) li.focus();
      });
    });
    document.addEventListener('mousedown', e => { if (!e.target.closest('[role="menubar"]')) closeAllMenus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllMenus(); });
  }

  // set interval for clock display if present
  const timeEl = document.getElementById('timeDisplay');
  if (timeEl) {
    function updateTimeNow() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    }
    updateTimeNow();
    setInterval(updateTimeNow, 1000);
  }

  window.addEventListener('load', () => openWindowById('whatsnewWindow'));

  // Load What's New content from external file
  fetch('/extras/whatsnew.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('whatsnewContent').innerHTML = html;
    })
    .catch(err => {
      console.error('Failed to load whatsnew.html', err);
      document.getElementById('whatsnewContent').innerHTML =
        '<p style="color:red;">Could not load updates.</p>';
    });
});
