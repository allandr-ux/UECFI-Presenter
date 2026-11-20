/**
 * Bible AI Search Engine (Groq Cloud AI with Local Offline Fallback)
 * 
 * Provides semantic, thematic, and natural language search for Bible verses
 * using Groq's high-speed LPU inference (Llama 3.3 70B / Llama 3.1 8B).
 * Resolves AI-located Scripture references into exact local XML verses.
 */
class BibleAISearch {
  constructor() {
    this.STORAGE_KEYS = {
      apiKey: 'uecfi_groq_api_key',
      model: 'uecfi_groq_model',
      enabled: 'uecfi_ai_search_enabled'
    };
    this.defaultModel = 'llama-3.3-70b-versatile';
    this.isSearching = false;
  }

  getApiKey() {
    try {
      return (typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEYS.apiKey) : '') || '';
    } catch (e) {
      return '';
    }
  }

  setApiKey(key) {
    try {
      localStorage.setItem(this.STORAGE_KEYS.apiKey, String(key || '').trim());
    } catch (e) {}
  }

  getModel() {
    try {
      return (typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEYS.model) : '') || this.defaultModel;
    } catch (e) {
      return this.defaultModel;
    }
  }

  setModel(model) {
    try {
      localStorage.setItem(this.STORAGE_KEYS.model, String(model || '').trim());
    } catch (e) {}
  }

  isEnabled() {
    try {
      const val = localStorage.getItem(this.STORAGE_KEYS.enabled);
      // Default to true if key exists, false if no key has ever been set
      if (val === null) {
        return Boolean(this.getApiKey());
      }
      return val === 'true';
    } catch (e) {
      return Boolean(this.getApiKey());
    }
  }

  setEnabled(enabled) {
    try {
      localStorage.setItem(this.STORAGE_KEYS.enabled, String(!!enabled));
      this.updateUI();
    } catch (e) {}
  }

  toggleEnabled() {
    if (!this.getApiKey()) {
      this.openSettings();
      return;
    }
    this.setEnabled(!this.isEnabled());
  }

  updateUI() {
    const btn = document.getElementById('btnToggleAISearch');
    const txt = document.getElementById('txtAISearchStatus');
    const enabled = this.isEnabled() && Boolean(this.getApiKey());
    
    if (btn) {
      if (enabled) {
        btn.className = 'px-2.5 py-1.5 text-xs font-bold rounded-lg border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs';
      } else {
        btn.className = 'px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition flex items-center gap-1.5 shrink-0 cursor-pointer';
      }
    }
    if (txt) {
      txt.textContent = enabled ? 'AI: ON' : (this.getApiKey() ? 'AI: OFF' : 'Setup AI');
    }
  }

  openSettings() {
    const modal = document.getElementById('modalGroqSettings');
    const inputKey = document.getElementById('groqApiKeyInput');
    const selectModel = document.getElementById('groqModelSelect');
    const customRow = document.getElementById('groqCustomModelRow');
    const customInput = document.getElementById('groqCustomModelInput');
    const feedback = document.getElementById('groqTestFeedback');

    if (inputKey) inputKey.value = this.getApiKey();
    const currentModel = this.getModel();
    if (selectModel) {
      const match = Array.from(selectModel.options).some(o => o.value === currentModel);
      if (match) {
        selectModel.value = currentModel;
        if (customRow) customRow.classList.add('hidden');
      } else {
        selectModel.value = 'custom';
        if (customRow) customRow.classList.remove('hidden');
        if (customInput) customInput.value = currentModel;
      }
    }
    if (feedback) {
      feedback.className = 'hidden';
      feedback.innerHTML = '';
    }
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      if (inputKey) setTimeout(() => inputKey.focus(), 100);
    }
  }

  closeSettings() {
    const modal = document.getElementById('modalGroqSettings');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  saveSettings() {
    const inputKey = document.getElementById('groqApiKeyInput');
    const selectModel = document.getElementById('groqModelSelect');
    const customInput = document.getElementById('groqCustomModelInput');
    const keyVal = inputKey ? inputKey.value.trim() : '';
    let modelVal = selectModel ? selectModel.value : this.defaultModel;
    if (modelVal === 'custom' && customInput && customInput.value.trim()) {
      modelVal = customInput.value.trim();
    }

    this.setApiKey(keyVal);
    this.setModel(modelVal);
    if (keyVal) {
      this.setEnabled(true);
    }
    this.closeSettings();
    this.updateUI();
  }

  async testConnection() {
    const inputKey = document.getElementById('groqApiKeyInput');
    const selectModel = document.getElementById('groqModelSelect');
    const customInput = document.getElementById('groqCustomModelInput');
    const feedback = document.getElementById('groqTestFeedback');
    const btnTest = document.getElementById('btnTestGroqKey');

    const key = inputKey ? inputKey.value.trim() : this.getApiKey();
    let model = selectModel ? selectModel.value : this.getModel();
    if (model === 'custom' && customInput && customInput.value.trim()) {
      model = customInput.value.trim();
    }

    if (!key) {
      if (feedback) {
        feedback.className = 'p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200';
        feedback.textContent = 'Please paste your Groq API key first.';
      }
      return;
    }

    if (btnTest) {
      btnTest.disabled = true;
      btnTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing...';
    }

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Reply with the word OK' }],
          max_tokens: 5
        })
      });

      if (resp.ok) {
        if (feedback) {
          feedback.className = 'p-2.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200';
          feedback.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i> <b>Connected successfully!</b> Groq AI is ready for live Scripture lookup.';
        }
      } else {
        const err = await resp.json().catch(() => ({}));
        const msg = (err && err.error && err.error.message) || `Error ${resp.status}: ${resp.statusText}`;
        if (feedback) {
          feedback.className = 'p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200';
          feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-600 mr-1.5"></i> ${msg}`;
        }
      }
    } catch (e) {
      if (feedback) {
        feedback.className = 'p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200';
        feedback.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-600 mr-1.5"></i> Network error: ${e.message || e}`;
      }
    } finally {
      if (btnTest) {
        btnTest.disabled = false;
        btnTest.innerHTML = '<i class="fa-solid fa-plug"></i> Test Key';
      }
    }
  }

  /**
   * Detects the natural language of a configured Bible version
   */
  getVersionLanguage(versionIdx) {
    try {
      if (typeof bibleVersionArray === 'undefined' || !bibleVersionArray[versionIdx]) {
        return 'English';
      }
      const entry = bibleVersionArray[versionIdx];
      const name = String(entry[0] || '').toLowerCase();
      const file = String(entry[1] || '').toLowerCase();
      const combined = `${name} ${file}`;

      if (combined.includes('tagalog') || combined.includes('dating biblia') || combined.includes('filipino') || combined.includes('mbb') || combined.includes('adb')) {
        return 'Tagalog';
      }
      if (combined.includes('pampango') || combined.includes('kapampangan')) {
        return 'Kapampangan';
      }
      if (combined.includes('ilonggo') || combined.includes('hiligaynon')) {
        return 'Ilonggo (Hiligaynon)';
      }
      if (combined.includes('ilocano') || combined.includes('iloko')) {
        return 'Ilocano';
      }
      if (combined.includes('cebuano') || combined.includes('bisaya') || combined.includes('binisaya')) {
        return 'Cebuano';
      }
      if (combined.includes('spanish') || combined.includes('espanol') || combined.includes('reina')) {
        return 'Spanish';
      }
      return 'English';
    } catch (e) {
      return 'English';
    }
  }

  getActiveLanguages() {
    const v1 = (typeof version1 !== 'undefined') ? version1 : 1;
    const v2 = (typeof version2 !== 'undefined') ? version2 : 1;
    const lang1 = this.getVersionLanguage(v1);
    const lang2 = this.getVersionLanguage(v2);
    return { lang1, lang2 };
  }

  /**
   * Performs semantic Scripture search using Groq API
   * Returns array of { bookNum, chNum, verseNum, aiReason, isAI: true } or null on failure
   */
  async searchWithGroq(query) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const model = this.getModel();

    const systemPrompt = `You are a specialized Bible scripture retrieval assistant.
When a user provides a search query—which may be a topic, emotion, story, theme, moral question, or paraphrased wording in English, Tagalog/Filipino, or other languages—you determine the 3 to 7 most relevant Bible scripture passages.

CRITICAL JSON RULES:
1. Output ONLY a valid JSON object with a single "results" array. No chat, no markdown codeblocks, no explanations outside JSON.
2. Format:
{
  "results": [
    {
      "book": "Standard English Book Name",
      "chapter": 4,
      "verse": 6,
      "endVerse": 7,
      "reason": "Short 4-8 word reason in English why this matches"
    }
  ]
}
3. The "book" MUST be one of standard 66 books: Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation.
4. "chapter", "verse", and "endVerse" MUST be integers (1-based).
5. The "reason" MUST ALWAYS be written in clear, concise English.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500); // 6.5s timeout for live responsiveness

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[BibleAISearch] Groq API returned status ${response.status}`);
        return null;
      }

      const data = await response.json();
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) return null;

      let parsed = null;
      try {
        parsed = JSON.parse(content);
      } catch (pe) {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      }

      if (!parsed || !Array.isArray(parsed.results)) return null;

      return this.resolvePassagesToLocalVerses(parsed.results);
    } catch (err) {
      console.warn('[BibleAISearch] Groq API request failed or timed out:', err);
      return null;
    }
  }

  /**
   * Maps AI returned book names and chapters to 1-based indices that match local Bible XML
   */
  resolvePassagesToLocalVerses(results) {
    const rows = [];
    const standardBooks = [
      "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
      "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
      "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
      "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
      "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
      "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
      "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
      "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
      "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
    ];

    const bookMap = new Map();
    standardBooks.forEach((name, idx) => {
      bookMap.set(name.toLowerCase(), idx + 1);
      bookMap.set(name.toLowerCase().replace(/\s+/g, ''), idx + 1);
    });

    bookMap.set("psalm", 19);
    bookMap.set("song of songs", 22);
    bookMap.set("canticles", 22);
    bookMap.set("first samuel", 9);
    bookMap.set("second samuel", 10);
    bookMap.set("first kings", 11);
    bookMap.set("second kings", 12);
    bookMap.set("first chronicles", 13);
    bookMap.set("second chronicles", 14);
    bookMap.set("first corinthians", 46);
    bookMap.set("second corinthians", 47);
    bookMap.set("first thessalonians", 52);
    bookMap.set("second thessalonians", 53);
    bookMap.set("first timothy", 54);
    bookMap.set("second timothy", 55);
    bookMap.set("first peter", 60);
    bookMap.set("second peter", 61);
    bookMap.set("first john", 62);
    bookMap.set("second john", 63);
    bookMap.set("third john", 64);
    bookMap.set("apocalypse", 66);

    for (const item of results) {
      if (!item || !item.book) continue;
      const rawBook = String(item.book).trim().toLowerCase();
      let bookNum = bookMap.get(rawBook) || bookMap.get(rawBook.replace(/\s+/g, ''));
      
      if (!bookNum) {
        for (const [key, num] of bookMap.entries()) {
          if (rawBook.startsWith(key) || key.startsWith(rawBook)) {
            bookNum = num;
            break;
          }
        }
      }

      if (!bookNum || bookNum < 1 || bookNum > 66) continue;

      const chNum = parseInt(item.chapter, 10);
      const startV = parseInt(item.verse, 10);
      let endV = parseInt(item.endVerse, 10);
      if (isNaN(endV) || endV < startV) endV = startV;
      // Cap multi-verse spans to 3 verses max so results stay concise
      if (endV - startV > 2) endV = startV + 2;

      if (isNaN(chNum) || chNum < 1 || isNaN(startV) || startV < 1) continue;

      for (let v = startV; v <= endV; v++) {
        try {
          const root = (typeof bible !== "undefined" && typeof version1 !== "undefined" && bible[version1]) ? bible[version1] : null;
          if (root) {
            const bNode = root.getElementsByTagName("b")[bookNum - 1];
            const cNode = bNode ? bNode.getElementsByTagName("c")[chNum - 1] : null;
            const vNode = cNode ? cNode.getElementsByTagName("v")[v - 1] : null;
            if (!vNode) continue;
          }
        } catch (e) {
          continue;
        }

        rows.push({
          bookNum: bookNum,
          chNum: chNum,
          verseNum: v,
          aiReason: item.reason || item.reason_v1 || item.reason_v2 || null,
          reasonV1: item.reason_v1 || item.reason || null,
          reasonV2: item.reason_v2 || item.reason || null,
          isAI: true
        });
      }
    }

    return rows;
  }
}

if (typeof window !== 'undefined') {
  window.bibleAISearch = new BibleAISearch();
  // Ensure UI initializes on DOM load or tab switch
  window.addEventListener('DOMContentLoaded', () => {
    if (window.bibleAISearch) window.bibleAISearch.updateUI();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BibleAISearch;
}
