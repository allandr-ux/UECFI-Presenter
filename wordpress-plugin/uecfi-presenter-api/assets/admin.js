/**
 * Media-library file picker & automatic song-title extractor for the Release Details meta box.
 * No dependencies beyond jQuery + wp.media (enqueued by the plugin).
 */
(function ($) {
  'use strict';

  function decodeEntities(str) {
    if (!str) return '';
    return String(str)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, dec) {
        return String.fromCharCode(parseInt(dec, 10));
      })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
      .replace(/&amp;/g, '&');
  }

  function extractTitlesFromText(raw) {
    if (!raw || typeof raw !== 'string') return [];
    var text = raw.replace(/^\uFEFF/, '').trim();
    if (!text) return [];
    var titles = [];

    var songRegex = /<song\b[^>]*>([\s\S]*?)<\/song>/gi;
    var match;
    while ((match = songRegex.exec(text)) !== null) {
      var block = match[1] || '';
      var nameMatch = block.match(/<(?:name|title)\b[^>]*>([\s\S]*?)<\/(?:name|title)>/i);
      if (nameMatch && nameMatch[1] != null) {
        var val = String(nameMatch[1]).trim();
        var cdataMatch = val.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
        if (cdataMatch) {
          val = cdataMatch[1];
        } else {
          val = decodeEntities(val);
        }
        val = val.replace(/<[^>]*>/g, '').trim();
        if (val) titles.push(val);
      }
    }

    if (titles.length === 0 && (text.charAt(0) === '[' || text.charAt(0) === '{')) {
      try {
        var parsed = JSON.parse(text);
        var rows = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.songs) ? parsed.songs : []);
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].name) {
            var t = String(rows[i].name).replace(/<[^>]*>/g, '').trim();
            if (t) titles.push(t);
          }
        }
      } catch (e) {}
    }

    return titles;
  }

  function renderSongTitlesPreview(titles, statusText) {
    var countEl = $('#uecfi-song-titles-count');
    var previewEl = $('#uecfi-song-titles-preview');
    var hiddenEl = $('#uecfi-song-titles-auto');
    if (!countEl.length) return;

    if (Array.isArray(titles) && titles.length > 0) {
      countEl.text(titles.length + (titles.length === 1 ? ' song detected in pack' : ' songs detected in pack'));
      hiddenEl.val(titles.join('\n'));
      var ol = $('<ol style="margin:0 0 0 18px;padding:0;"></ol>');
      for (var i = 0; i < titles.length; i++) {
        ol.append($('<li style="margin-bottom:2px;"></li>').text(titles[i]));
      }
      previewEl.empty().append(ol).show();
    } else {
      countEl.text(statusText || 'No songs extracted yet — choose a song pack XML/JSON file above.');
      hiddenEl.val('');
      previewEl.empty().hide();
    }
  }

  function autoExtractFromUrl(fileUrl) {
    var countEl = $('#uecfi-song-titles-count');
    if (!countEl.length || !fileUrl) return;
    countEl.text('Extracting song titles from file…');
    fetch(fileUrl, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var titles = extractTitlesFromText(text);
        if (titles.length > 0) {
          renderSongTitlesPreview(titles);
        } else {
          renderSongTitlesPreview([], 'Selected file will be scanned for song titles when you save.');
        }
      })
      .catch(function () {
        renderSongTitlesPreview([], 'Song titles will be extracted automatically on the server when you save.');
      });
  }

  function wire() {
    var pickBtn = $('#uecfi-pick-file');
    if (!pickBtn.length || typeof wp === 'undefined' || !wp.media) {
      return;
    }
    var frame = null;

    pickBtn.on('click', function (e) {
      e.preventDefault();
      if (frame) {
        frame.open();
        return;
      }
      frame = wp.media({
        title: 'Select release file',
        button: { text: 'Use this file' },
        multiple: false
      });
      frame.on('select', function () {
        var att = frame.state().get('selection').first();
        if (!att) {
          return;
        }
        var file = att.toJSON();
        $('#uecfi-file-id').val(file.id);
        $('#uecfi-file-name').text(file.filename || file.title || ('#' + file.id));
        if (file.url) {
          autoExtractFromUrl(file.url);
        }
      });
      frame.open();
    });

    $('#uecfi-clear-file').on('click', function (e) {
      e.preventDefault();
      $('#uecfi-file-id').val('0');
      $('#uecfi-file-name').text('No file selected.');
      var extUrl = ($('#uecfi-file-url').val() || '').trim();
      if (extUrl) {
        autoExtractFromUrl(extUrl);
      } else {
        renderSongTitlesPreview([]);
      }
    });

    $('#uecfi-file-url').on('change', function () {
      var extUrl = ($(this).val() || '').trim();
      if (extUrl) {
        autoExtractFromUrl(extUrl);
      }
    });
  }

  $(document).ready(wire);
})(jQuery);
