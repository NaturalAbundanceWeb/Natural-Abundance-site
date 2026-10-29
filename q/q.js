/* Saves questionnaire progress on this device so clients can finish later. */
(function () {
  var form = document.getElementById('q-form');
  if (!form) return;
  var key = 'na-q:' + location.pathname;
  var store;
  try { store = window.localStorage; store.getItem('x'); } catch (e) { store = null; }
  if (!store) return;

  function save() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'hidden' || el.name === 'company') return;
      if (el.type === 'radio' || el.type === 'checkbox') {
        if (el.checked) (data[el.name] = data[el.name] || []).push(el.value);
      } else if (el.value) {
        data[el.name] = el.value;
      }
    });
    try { store.setItem(key, JSON.stringify(data)); } catch (e) {}
  }

  function restore() {
    var data;
    try { data = JSON.parse(store.getItem(key) || '{}'); } catch (e) { return; }
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in data)) return;
      var v = data[el.name];
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = v.indexOf(el.value) !== -1;
      else if (typeof v === 'string') el.value = v;
    });
  }

  restore();
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  form.addEventListener('submit', function () {
    try { store.removeItem(key); } catch (e) {}
  });
})();
