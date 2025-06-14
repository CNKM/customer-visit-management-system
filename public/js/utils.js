async function post(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: JSON.stringify(data)
  }).then(r => r.json());
}
async function get(url) {
  return fetch(url, { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} }).then(r => r.json());
}
function getToken() { return localStorage.getItem('token') || ''; }
function msg(main, type = 'info', extra = '', confirmAction) {
  if(confirmAction) {
    Swal.fire({
      icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'question',
      title: main,
      showCancelButton: true,
      confirmButtonText: '是',
      cancelButtonText: '否',
      customClass: { popup: 'swal2-popup-wide' }
    }).then(r=>confirmAction(r.isConfirmed));
    return;
  }
  Swal.fire({
    icon: type === 'error' ? 'error' : type === 'success' ? 'success' : (type === 'info' ? 'info' : 'question'),
    title: main,
    html: extra,
    customClass: { popup: 'swal2-popup-wide' },
    timer: type === 'loading' ? undefined : 2200,
    showConfirmButton: type === 'loading' ? false : true
  });
}
function loading(text){ msg(text || '加载中...', 'loading'); }