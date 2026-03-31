(function () {
  var o = xrviewModal('__xrview_help_overlay', '\u{1F3AE} XR Controls');
  if (!o) return;

  var table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%';

  var rows = [
    ['Enter Play Mode', '\u25B6 Play button in overlay'],
    ['Look around', 'Mouse move'],
    ['Walk', 'Hold <b>Shift</b> + <b>W/A/S/D</b>'],
    ['Right trigger', 'Left click'],
    ['Left trigger', 'Right click'],
    ['Exit Play Mode', '<b>Esc</b>'],
  ];

  rows.forEach(function (r) {
    const cssTextStyle = 'padding:4px 16px 4px 0;white-space:nowrap';
    var tr = document.createElement('tr');
    var td1 = document.createElement('td');
    td1.style.cssText = cssTextStyle;
    td1.style.color = '#7f7f7f';
    td1.textContent = r[0];
    var td2 = document.createElement('td');
    td2.style.cssText = cssTextStyle;
    td2.style.color = '#e0e0e0';
    td2.innerHTML = r[1];
    tr.appendChild(td1);
    tr.appendChild(td2);
    table.appendChild(tr);
  });

  o.body.appendChild(table);
  o.show();
})();
