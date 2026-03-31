// Shared modal helper for XR View injected modals.
// Both help.js and about.js call xrviewModal() to get a consistent look.
//
// Usage:
//   var parts = xrviewModal(id, title);
//   // parts.body  -- append your content here
//   // parts.show() -- attach to DOM
//
// Clicking the backdrop or the X button removes the overlay.
// Calling the same overlay again toggles it off.

// eslint-disable-next-line no-unused-vars
function xrviewModal(id, title) {
  var existing = document.getElementById(id);
  if (existing) { existing.remove(); return null; }

  // Backdrop
  var bg = document.createElement('div');
  bg.id = id;
  bg.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;' +
    'background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;' +
    'font-family:system-ui,-apple-system,sans-serif;color:#e0e0e0';
  bg.onclick = function () { bg.remove(); };

  // Dialog
  var dialog = document.createElement('div');
  dialog.style.cssText =
    'position:relative;background:#1e1e1e;border:1px solid #444;' +
    'padding:24px 28px;max-width:90vw;min-width:50vw;max-height:85vh;' +
    'display:flex;flex-direction:column;gap:12px;' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.7);overflow:hidden';
  dialog.onclick = function (e) { e.stopPropagation(); };

  // Close button
  var close = document.createElement('span');
  close.textContent = '\u2715';
  close.style.cssText =
    'position:absolute;top:8px;right:12px;cursor:pointer;color:#888;' +
    'font-size:18px;padding:4px';
  close.onmouseover = function () { close.style.color = '#fff'; };
  close.onmouseout = function () { close.style.color = '#888'; };
  close.onclick = function () { bg.remove(); };
  dialog.appendChild(close);

  // Title
  var h = document.createElement('h2');
  h.textContent = title;
  h.style.cssText = 'color:#e0e0e0;margin:0;';
  dialog.appendChild(h);

  // Body container -- caller appends content here
  var body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;overflow:hidden';
  dialog.appendChild(body);

  bg.appendChild(dialog);

  return {
    body: body,
    show: function () { document.body.appendChild(bg); }
  };
}
