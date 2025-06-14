let user = null;
async function initApp() {
  const r = await get('/api/me');
  if (!r.success) { localStorage.removeItem('token'); location.href = 'index.html'; return; }
  user = r.data;
  document.getElementById('userName').innerText = user.username + (user.role === 'admin' ? ' [管理员]' : '');
  if (user.role === 'admin') document.getElementById('navUsers').style.display = '';
  else document.getElementById('navUsers').style.display = 'none';
  showTab('visits');
}
function showTab(tab) {
  ['tabVisits','tabUsers'].forEach(id=>document.getElementById(id).style.display='none');
  ['tabVisits','tabUsers'].forEach(id=>document.getElementById(id).classList.remove('active'));
  document.getElementById('tab'+tab[0].toUpperCase()+tab.slice(1)).style.display = 'block';
  document.getElementById('tab'+tab[0].toUpperCase()+tab.slice(1)).classList.add('active');
  if (tab === 'visits') renderVisits();
  if (tab === 'users') renderUsers();
}
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    showTab(btn.dataset.tab);
  };
});
document.getElementById('btnLogout').onclick = () => {
  localStorage.removeItem('token');
  location.href = 'index.html';
};
document.getElementById('btnChangePw').onclick = () => {
  Swal.fire({
    title: '更改密码',
    html: `
      <div class="swal-form-row"><label>当前密码</label><input id="currPw" type="password" class="swal2-input" autocomplete="current-password"></div>
      <div class="swal-form-row"><label>新密码</label><input id="newPw" type="password" class="swal2-input" autocomplete="new-password"></div>
      <div class="swal-form-row"><label>确认新密码</label><input id="confirmPw" type="password" class="swal2-input" autocomplete="new-password"></div>
    `,
    showCancelButton: true,
    confirmButtonText: '更改',
    cancelButtonText: '取消',
    focusConfirm: false,
    customClass: { popup: 'swal2-popup-wide' },
    preConfirm: async () => {
      const curr = document.getElementById('currPw').value;
      const next = document.getElementById('newPw').value;
      const confirm = document.getElementById('confirmPw').value;
      if (!curr || !next || !confirm) return Swal.showValidationMessage('请填写所有项');
      if (next.length < 6) return Swal.showValidationMessage('新密码至少6位');
      if (next !== confirm) return Swal.showValidationMessage('两次新密码输入不一致');
      return { curr, next, confirm };
    }
  }).then(async r => {
    if (r.isConfirmed) {
      Swal.showLoading();
      const res = await post('/api/change-pw', r.value);
      Swal.close();
      if (res.success) {
        Swal.fire({icon:'success',title:'修改成功，请重新登录',confirmButtonText:'确定'})
          .then(()=>{localStorage.removeItem('token');location.href='index.html';});
      } else {
        Swal.fire({icon:'error',title:res.message||'修改失败',confirmButtonText:'确定'});
      }
    }
  });
};
initApp();