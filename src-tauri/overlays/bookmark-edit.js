(function () {
  var mode = __BM_MODE__;
  var title = mode === 'edit' ? 'Edit Bookmark' : 'Add Bookmark';
  var o = xrviewModal('__xrview_bookmark_edit', title);
  if (!o) return;

  var inputStyle =
    'width:100%;padding:0.5rem 1rem;background:#121212;color:#e0e0e0;' +
    'border:1px solid #3a3a3a;outline:none;box-sizing:border-box';

  var lbl = document.createElement('label');
  lbl.textContent = 'Label';
  lbl.style.cssText = 'color:#888;';
  var labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = __BM_LABEL__;
  labelInput.style.cssText = inputStyle;

  var ulbl = document.createElement('label');
  ulbl.textContent = 'URL';
  ulbl.style.cssText = 'color:#888;';
  var urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = __BM_URL__;
  urlInput.style.cssText = inputStyle;

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px';

  var btnBase = 'padding:0.5rem 1rem;border:none;cursor:pointer;';

  if (mode === 'edit') {
    var delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.style.cssText = btnBase + 'background:#7f1d1d;color:#fca5a5;margin-right:auto';
    delBtn.onclick = function () {
      document.getElementById('__xrview_bookmark_edit').remove();
      window.location.href =
        'http://xrview.internal/delete-bookmark?id=' + encodeURIComponent(__BM_ID__);
    };
  }

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = btnBase + 'background:#333;color:#ccc';
  cancelBtn.onclick = function () {
    document.getElementById('__xrview_bookmark_edit').remove();
  };

  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = btnBase + 'background:#2563eb;color:#fff';
  saveBtn.onclick = function () {
    document.getElementById('__xrview_bookmark_edit').remove();
    window.location.href =
      'http://xrview.internal/save-bookmark' +
      '?id=' + encodeURIComponent(__BM_ID__) +
      '&label=' + encodeURIComponent(labelInput.value) +
      '&url=' + encodeURIComponent(urlInput.value);
  };

  o.body.appendChild(lbl);
  o.body.appendChild(labelInput);
  o.body.appendChild(ulbl);
  o.body.appendChild(urlInput);
  o.body.appendChild(btnRow);
  if (mode === 'edit') btnRow.appendChild(delBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  o.show();
  labelInput.focus();
})();
