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
  ['tabVisits','tabUsers','tabPw'].forEach(id=>document.getElementById(id).style.display='none');
  ['tabVisits','tabUsers','tabPw'].forEach(id=>document.getElementById(id).classList.remove('active'));
  document.getElementById('tab'+tab[0].toUpperCase()+tab.slice(1)).style.display = 'block';
  document.getElementById('tab'+tab[0].toUpperCase()+tab.slice(1)).classList.add('active');
  if (tab === 'visits') renderVisits();
  if (tab === 'users') renderUsers();
  if (tab === 'pw') renderPw();
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
function renderPw() {
  const box = document.getElementById('tabPw');
  box.innerHTML = `<form id="pwForm" style="max-width:340px;margin:auto;">
    <h3>修改密码</h3>
    <input type="password" name="curr" placeholder="当前密码" required autocomplete="current-password">
    <input type="password" name="next" placeholder="新密码(≥6位)" required autocomplete="new-password">
    <input type="password" name="confirm" placeholder="确认新密码" required autocomplete="new-password">
    <button type="submit" class="btn primary">修改</button>
  </form>`;
  box.querySelector('#pwForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const curr = fd.get('curr'), next = fd.get('next'), confirm = fd.get('confirm');
    if (!curr || !next || next.length < 6 || next !== confirm) return msg('密码输入有误', 'error');
    loading('修改中...');
    const r = await post('/api/change-pw', { curr, next, confirm });
    if (r.success) msg('修改成功，请重新登录', 'success', '', ()=>{localStorage.removeItem('token');location.href='index.html';});
    else msg(r.message, 'error');
  };
}
initApp();