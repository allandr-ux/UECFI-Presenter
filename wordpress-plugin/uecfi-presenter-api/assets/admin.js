/**
 * Media-library file picker for the Release Details meta box.
 * No dependencies beyond jQuery + wp.media (enqueued by the plugin).
 */
(function ($) {
  'use strict';

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
      });
      frame.open();
    });

    $('#uecfi-clear-file').on('click', function (e) {
      e.preventDefault();
      $('#uecfi-file-id').val('0');
      $('#uecfi-file-name').text('No file selected.');
    });
  }

  $(document).ready(wire);
})(jQuery);
