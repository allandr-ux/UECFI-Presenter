/**
 * Modern Native UI Component Service
 * 
 * Replaces legacy Yahoo! YUI2 widgets with clean, standard Web APIs:
 * - AppModal: Replaces YAHOO.widget.Panel with HTML5 <dialog> and Tailwind CSS
 * - AppTabs: Replaces YAHOO.widget.TabView with lightweight DOM tab switcher
 * - AppSlider: Replaces YAHOO.widget.Slider with standard <input type="range">
 * - AppColorPicker: Replaces YAHOO.widget.ColorPicker with standard <input type="color">
 * - AppDataTable: Replaces YAHOO.widget.DataTable with lightweight responsive list
 * - AppEvents: Standard Event listener helpers replacing YAHOO.util.Event
 */
(function(global) {
  'use strict';

  class AppModal {
    constructor(id, options = {}) {
      this.id = id;
      this.options = options;

      // Check if dialog element already exists or create new
      let dialog = document.getElementById(id);
      if (!dialog || dialog.tagName.toLowerCase() !== 'dialog') {
        dialog = document.createElement('dialog');
        dialog.id = id;
      }
      dialog.className = 'app-modern-modal bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 p-0 max-w-2xl w-full backdrop:bg-slate-900/50 backdrop:backdrop-blur-xs';

      this.dialog = dialog;
      this.header = document.createElement('div');
      this.header.className = 'flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 rounded-t-2xl';
      
      this.titleEl = document.createElement('div');
      this.titleEl.className = 'font-bold text-sm text-slate-800';
      
      this.closeBtn = document.createElement('button');
      this.closeBtn.type = 'button';
      this.closeBtn.innerHTML = '<span class="material-symbols-outlined text-lg">close</span>';
      this.closeBtn.className = 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition leading-none flex items-center justify-center';
      this.closeBtn.onclick = () => this.hide();

      this.header.appendChild(this.titleEl);
      this.header.appendChild(this.closeBtn);

      this.body = document.createElement('div');
      this.body.className = 'p-5 max-h-[75vh] overflow-y-auto text-sm text-slate-600';

      this.dialog.innerHTML = '';
      this.dialog.appendChild(this.header);
      this.dialog.appendChild(this.body);

      // Close when clicking modal backdrop
      this.dialog.addEventListener('click', (e) => {
        const rect = this.dialog.getBoundingClientRect();
        const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
          && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
        if (!isInDialog) {
          this.hide();
        }
      });
    }

    render(parent) {
      if (parent) {
        parent.appendChild(this.dialog);
      } else if (!document.body.contains(this.dialog)) {
        document.body.appendChild(this.dialog);
      }
    }

    setHeader(titleHtml) {
      this.titleEl.innerHTML = titleHtml;
    }

    setBody(bodyHtml) {
      this.body.innerHTML = bodyHtml;
    }

    show() {
      this.render();
      if (!this.dialog.open) {
        try {
          this.dialog.showModal();
        } catch(e) {
          this.dialog.setAttribute('open', '');
        }
      }
    }

    hide() {
      if (this.dialog.open) {
        try {
          this.dialog.close();
        } catch(e) {
          this.dialog.removeAttribute('open');
        }
      }
    }

    bringToTop() {}
  }

  class AppTabs {
    constructor(config = {}) {
      this.tabs = [];
      this.activeTab = null;
      this.listeners = {};
      this.container = document.createElement('div');
      this.container.className = 'app-modern-tabs flex flex-col w-full flex-1 min-h-0';

      this.tabList = document.createElement('ul');
      this.tabList.className = 'app-tab-list flex border-b border-slate-200 gap-1 px-2 pt-2 bg-slate-50/50';

      this.contentArea = document.createElement('div');
      this.contentArea.className = 'app-tab-content flex-1 overflow-auto';

      this.container.appendChild(this.tabList);
      this.container.appendChild(this.contentArea);
    }

    addTab(tabConfig) {
      const tabObj = {
        label: tabConfig.label,
        content: tabConfig.content || '',
        active: tabConfig.active || false
      };
      this.tabs.push(tabObj);

      const li = document.createElement('li');
      li.innerText = tabObj.label;
      li.className = 'px-4 py-2 text-xs font-semibold rounded-t-lg cursor-pointer transition text-slate-500 hover:text-slate-800 hover:bg-slate-100';
      li.onclick = () => this.selectTab(this.tabs.indexOf(tabObj));
      tabObj.li = li;
      this.tabList.appendChild(li);

      const div = document.createElement('div');
      div.innerHTML = tabObj.content;
      div.style.display = 'none';
      tabObj.div = div;
      this.contentArea.appendChild(div);

      if (tabObj.active || this.tabs.length === 1) {
        this.selectTab(this.tabs.indexOf(tabObj));
      }
    }

    selectTab(index) {
      const tab = this.tabs[index];
      if (!tab) return;
      this.tabs.forEach((t) => {
        if (t.li) t.li.className = 'px-4 py-2 text-xs font-semibold rounded-t-lg cursor-pointer transition text-slate-500 hover:text-slate-800 hover:bg-slate-100';
        if (t.div) t.div.style.display = 'none';
      });
      tab.li.className = 'px-4 py-2 text-xs font-semibold rounded-t-lg cursor-pointer transition bg-white text-brand-600 border-t-2 border-brand-600 shadow-xs';
      tab.div.style.display = 'block';
      this.activeTab = tab;
      if (this.listeners['activeTabChange']) {
        this.listeners['activeTabChange']();
      }
    }

    getTab(index) {
      return this.tabs[index] || null;
    }

    removeTab(tabOrIndex) {
      const idx = typeof tabOrIndex === 'number' ? tabOrIndex : this.tabs.indexOf(tabOrIndex);
      if (idx !== -1 && this.tabs[idx]) {
        const tab = this.tabs[idx];
        if (tab.li && tab.li.parentNode) tab.li.parentNode.removeChild(tab.li);
        if (tab.div && tab.div.parentNode) tab.div.parentNode.removeChild(tab.div);
        this.tabs.splice(idx, 1);
        if (this.activeTab === tab && this.tabs.length > 0) {
          this.selectTab(0);
        }
      }
    }

    get(prop) {
      if (prop === 'activeTab') {
        const active = this.activeTab;
        if (!active) return null;
        return {
          get: (key) => {
            if (key === 'label') return active.label;
            return null;
          }
        };
      }
      return null;
    }

    appendTo(parent) {
      const el = typeof parent === 'string' ? document.getElementById(parent) : parent;
      if (el) el.appendChild(this.container);
    }

    addListener(evt, cb) {
      this.listeners[evt] = cb;
    }
  }

  class AppColorPicker {
    constructor(id) {
      this.id = id;
      this.el = typeof id === 'string' ? document.getElementById(id) : id;
      this.listeners = {};
      this.hex = 'FFFFFF';

      if (this.el) {
        this.el.innerHTML = `
          <div class="flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-lg shadow-xs max-w-sm">
            <input type="color" id="${this.id}_colorInput" value="#ffffff" 
                   class="w-10 h-10 p-0.5 rounded cursor-pointer border border-slate-300 bg-white" />
            <div class="flex flex-col">
              <span class="text-xs font-semibold text-slate-700">Choose Font Color</span>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="text-[10px] font-mono font-bold text-slate-400">HEX:</span>
                <span id="${this.id}_hexLabel" class="text-xs font-mono font-bold text-slate-800">#FFFFFF</span>
              </div>
            </div>
          </div>
        `;
        const input = document.getElementById(`${this.id}_colorInput`);
        const label = document.getElementById(`${this.id}_hexLabel`);
        if (input) {
          input.addEventListener('input', (e) => {
            const val = e.target.value.replace('#', '').toUpperCase();
            this.hex = val;
            if (label) label.textContent = '#' + val;
            this.fireEvent('rgbChange', { hex: val });
          });
        }
      }
    }

    get(prop) {
      if (prop === 'hex') return this.hex;
      return null;
    }

    setValue(rgbArr) {
      if (Array.isArray(rgbArr) && rgbArr.length >= 3) {
        const hex = rgbArr.map(x => {
          const h = Number(x).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('').toUpperCase();
        this.hex = hex;
        const input = document.getElementById(`${this.id}_colorInput`);
        const label = document.getElementById(`${this.id}_hexLabel`);
        if (input) input.value = '#' + hex;
        if (label) label.textContent = '#' + hex;
      }
    }

    on(event, cb) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(cb);
    }

    fireEvent(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => {
          try { cb(data); } catch(e) { console.error(e); }
        });
      }
    }
  }

  class AppDataTable {
    constructor(id, columns, dataSource, config = {}) {
      this.el = typeof id === 'string' ? document.getElementById(id) : id;
      this.columns = columns || [];
      this.data = (dataSource && dataSource.data) ? dataSource.data : (Array.isArray(dataSource) ? dataSource : []);
      this.config = config;
      this.selectedIndex = -1;
      this.selectedRow = null;
      this.listeners = {};
      this.render();
    }

    setData(data) {
      this.data = Array.isArray(data) ? data : [];
      this.render();
    }

    render() {
      if (!this.el) return;
      let html = '<div class="h-full overflow-y-auto bg-white/70 border border-slate-200 rounded-xl shadow-xs"><table class="w-full border-collapse text-xs font-sans"><tbody>';
      for (let i = 0; i < this.data.length; i++) {
        const item = this.data[i];
        const title = item.Title || item.name || item.title || 'Untitled';
        const isSelected = (this.selectedIndex === i);
        const rowClass = isSelected
          ? 'app-row-selected bg-brand-50 font-bold text-brand-700 border-l-4 border-brand-600'
          : 'hover:bg-slate-50 text-slate-700 border-b border-slate-100';
        html += `<tr data-idx="${i}" class="cursor-pointer transition px-3 py-2 ${rowClass}"><td class="p-2.5">${title}</td></tr>`;
      }
      html += '</tbody></table></div>';
      this.el.innerHTML = html;

      const rows = this.el.querySelectorAll('tr');
      rows.forEach(r => {
        r.onclick = () => {
          const idx = parseInt(r.getAttribute('data-idx'), 10);
          this.selectRow(idx);
        };
      });
    }

    selectRow(idx) {
      this.selectedIndex = idx;
      this.selectedRow = this.data[idx] || null;
      const rows = this.el ? this.el.querySelectorAll('tr') : [];
      rows.forEach((r, i) => {
        if (i === idx) {
          r.className = 'cursor-pointer transition px-3 py-2 app-row-selected bg-brand-50 font-bold text-brand-700 border-l-4 border-brand-600';
        } else {
          r.className = 'cursor-pointer transition px-3 py-2 hover:bg-slate-50 text-slate-700 border-b border-slate-100';
        }
      });
      this.fireEvent('select', this.selectedRow);
    }

    getSelectedRows() {
      return this.selectedIndex >= 0 ? [this.selectedIndex] : [0];
    }

    getRecord(idx) {
      const item = this.data[idx] || this.selectedRow;
      if (!item) return null;
      return {
        getData: (k) => item[k]
      };
    }

    on(event, cb) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(cb);
    }

    fireEvent(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => {
          try { cb(data); } catch(e) { console.error(e); }
        });
      }
    }
  }

  const AppUI = {
    Modal: AppModal,
    Tabs: AppTabs,
    ColorPicker: AppColorPicker,
    DataTable: AppDataTable,
    
    // Helper to add event listener safely by element ID or node
    on(target, event, callback) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.addEventListener(event, callback);
    },

    // Simple slider initializer
    createSlider(containerId, min, max, value = 0, onChange = null) {
      const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      if (!container) return null;
      container.innerHTML = `<input type="range" min="${min}" max="${max}" value="${value}" class="w-full accent-brand-600 cursor-pointer">`;
      const input = container.querySelector('input');
      if (onChange) input.addEventListener('input', (e) => onChange(parseInt(e.target.value, 10)));
      return input;
    },

    // Build and set Electron application menu from XML file
    async setupApplicationMenu(xmlPath) {
      try {
        const xmlStr = await AppStorage.readFile(xmlPath);
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'text/xml');

        function parseNode(node) {
          let template = [];
          for (let i = 0; i < node.childNodes.length; i++) {
            let child = node.childNodes[i];
            if (child.nodeType !== 1) continue;
            if (child.nodeName === 'menu') {
              template.push({
                label: child.getAttribute('label'),
                submenu: parseNode(child)
              });
            } else if (child.nodeName === 'menuItem') {
              if (child.getAttribute('type') === 'separator') {
                template.push({ type: 'separator' });
              } else {
                const item = {
                  label: child.getAttribute('label')
                };
                // Standard Electron roles (undo/redo/cut/copy/paste/selectAll...).
                // These enable OS-native behavior -- notably, macOS routes
                // Cmd+C/X/V/A/Z through the menu bar, so clipboard shortcuts
                // only work when these role items exist.
                const role = child.getAttribute('role');
                if (role) {
                  item.role = role;
                }
                const onSelect = child.getAttribute('onSelect');
                if (onSelect) {
                  item.id = onSelect;
                }
                template.push(item);
              }
            }
          }
          return template;
        }

        const template = parseNode(doc.documentElement);
        if (window.electronBridge && typeof window.electronBridge.setMenu === 'function') {
          window.electronBridge.setMenu(template);
          if (!window._menuListenerBound) {
            window.electronBridge.onMenuClick((funcName) => {
              if (typeof window[funcName] === 'function') {
                window[funcName]();
              } else {
                console.error('Menu function not found:', funcName);
              }
            });
            window._menuListenerBound = true;
          }
        }
      } catch(e) {
        console.warn('[AppUI] Error setting up menu from ' + xmlPath, e);
      }
    }
  };

  global.AppUI = AppUI;
})(typeof window !== 'undefined' ? window : this);
