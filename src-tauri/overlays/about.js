(function () {
  var o = xrviewModal('__xrview_about_overlay', 'XR View');
  if (!o) return;

  var disc = document.createElement('p');
  disc.style.cssText =
    'color:#d44;font-weight:700';
  disc.innerHTML =
    'This is an experimental developer tool, not a general-purpose web browser.<br/>' +
    'It loads untrusted web content in an OS webview - use at your own risk.<br/>' +
    'The author(s) make no guarantees about security, stability, or fitness for any particular purpose.<br/>' +
    'This project is licensed under the MIT License.';
  o.body.appendChild(disc);

  var lic = document.createElement('pre');
  lic.readOnly = true;
  lic.textContent = __LICENSES__;
  lic.style.cssText = 'width:100%;text-wrap:auto;overflow:scroll;';
  o.body.appendChild(lic);

  o.show();
})();
