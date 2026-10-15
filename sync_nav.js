function setupModernNavSync() {
    // 1. Build interceptors for selectedIndex
    function intercept(id, onIndexChange) {
        const el = document.getElementById(id);
        const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
        Object.defineProperty(el, 'selectedIndex', {
            get: function() { return desc.get.call(this); },
            set: function(val) {
                desc.set.call(this, val);
                onIndexChange();
            }
        });
    }

    // 2. Build MutationObservers to catch when options are repopulated by legacy JS
    function observeOptions(id, onRebuild) {
        const el = document.getElementById(id);
        const observer = new MutationObserver((mutations) => {
            let optionsChanged = false;
            mutations.forEach(m => {
                if (m.type === 'childList') optionsChanged = true;
            });
            if (optionsChanged) onRebuild();
        });
        observer.observe(el, { childList: true });
    }

    // 3. Render functions
    function renderBookList() {
        const legacySelect = document.getElementById('bookList');
        const modernContainer = document.getElementById('modernBookList');
        const activeIdx = legacySelect.selectedIndex;
        
        let html = '';
        for(let i=0; i < legacySelect.options.length; i++) {
            const name = legacySelect.options[i].text;
            const isActive = (i === activeIdx);
            const classes = isActive 
                ? 'bg-brand-600 text-white rounded font-bold' 
                : 'text-slate-700 hover:bg-slate-200 rounded font-medium';
            html += `
                <button onclick="document.getElementById('bookList').selectedIndex = ${i}; document.getElementById('bookList').dispatchEvent(new Event('change'));" 
                        class="w-full text-left px-2 py-1.5 transition ${classes}">
                    <div class="text-[11px] leading-tight">${name}</div>
                    <div class="text-[9px] opacity-70 leading-none mt-0.5">${name}</div>
                </button>
            `;
        }
        modernContainer.innerHTML = html;
        if(modernContainer.children[activeIdx]) modernContainer.children[activeIdx].scrollIntoView({block: 'nearest'});
    }

    function renderChapterList() {
        const legacySelect = document.getElementById('chapterList');
        const modernContainer = document.getElementById('modernChapterList');
        const activeIdx = legacySelect.selectedIndex;
        
        let html = '';
        for(let i=0; i < legacySelect.options.length; i++) {
            const num = legacySelect.options[i].text;
            const isActive = (i === activeIdx);
            const classes = isActive 
                ? 'bg-brand-600 text-white rounded font-bold' 
                : 'text-slate-700 hover:bg-slate-200 rounded font-medium';
            html += `
                <button onclick="document.getElementById('chapterList').selectedIndex = ${i}; document.getElementById('chapterList').dispatchEvent(new Event('change'));" 
                        class="w-full text-center py-1 transition ${classes}">
                    ${num}
                </button>
            `;
        }
        modernContainer.innerHTML = html;
        if(modernContainer.children[activeIdx]) modernContainer.children[activeIdx].scrollIntoView({block: 'nearest'});
    }

    function renderVerseList() {
        const legacySelect = document.getElementById('verseList');
        const modernContainer = document.getElementById('modernVerseList');
        const activeIdx = legacySelect.selectedIndex;
        
        let html = '';
        for(let i=0; i < legacySelect.options.length; i++) {
            const num = legacySelect.options[i].text;
            const isActive = (i === activeIdx);
            const classes = isActive 
                ? 'bg-brand-600 text-white rounded font-bold' 
                : 'text-slate-700 hover:bg-slate-200 rounded font-medium';
            html += `
                <button onclick="document.getElementById('verseList').selectedIndex = ${i}; document.getElementById('verseList').dispatchEvent(new Event('change'));" 
                        class="w-full text-center py-1 transition ${classes}">
                    ${num}
                </button>
            `;
        }
        modernContainer.innerHTML = html;
        if(modernContainer.children[activeIdx]) modernContainer.children[activeIdx].scrollIntoView({block: 'nearest'});
    }

    // Set up everything
    intercept('bookList', renderBookList);
    intercept('chapterList', renderChapterList);
    intercept('verseList', renderVerseList);

    observeOptions('bookList', renderBookList);
    observeOptions('chapterList', renderChapterList);
    observeOptions('verseList', renderVerseList);
    
    // Initial render
    setTimeout(() => {
        renderBookList();
        renderChapterList();
        renderVerseList();
    }, 100);
}
