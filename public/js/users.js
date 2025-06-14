async function renderUsers(){
  const box = document.getElementById('tabUsers');
  const r = await get('/api/users');
  if(!r.success) return box.innerHTML='加载失败';
  let html = `<h3>用户管理</h3><table><tr><th>用户名</th><th>角色</th><th>状态</th><th>上级ID</th><th>操作</th></tr>`;
  r.data.forEach(u=>{
    html+=`<tr>
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${showUserStatus(u.status)}</td>
      <td>${u.superiorId||'-'}</td>
      <td>
        <button class="btn mini" onclick="changeStatus('${u._id}','${u.status==='active'?'disabled':'active'}')">${u.status==='active'?'禁用':'激活'}</button>
        <button class="btn mini" onclick="resetPw('${u._id}')">重置密码</button>
        <button class="btn mini" onclick="setSuperior('${u._id}','${u.superiorId||''}')">设置上级</button>
      </td>
    </tr>`;
  });
  html+='</table>';
  box.innerHTML = html;
}
function showUserStatus(s){return s==='pending'?'待激活':s==='active'?'已激活':'已禁用';}
function changeStatus(uid, status){
  msg('确认更改状态？','question','',b=>{if(b)post('/api/users/status',{uid,status}).then(r=>{if(r.success)renderUsers(),Swal.fire({icon:'success',title:'操作成功',timer:1000,showConfirmButton:false});else msg(r.message,'error');})});
}
function resetPw(uid){
  Swal.fire({
    title:'重置密码',
    html:`<div class="swal-form-row"><label>新密码</label><input id="rpwInput" type="password" class="swal2-input" autocomplete="new-password"></div>`,
    showCancelButton:true,
    confirmButtonText:'重置',
    cancelButtonText:'取消',
    customClass:{popup:'swal2-popup-wide'},
    preConfirm:()=>{
      let p=document.getElementById('rpwInput').value;
      if(!p||p.length<6)return Swal.showValidationMessage('密码至少6位');
      return p;
    }
  }).then(async r=>{
    if(r.isConfirmed){
      Swal.showLoading();
      const res = await post('/api/users/resetpw',{uid,password:r.value});
      Swal.close();
      if(res.success) renderUsers(),Swal.fire({icon:'success',title:'重置成功',timer:1000,showConfirmButton:false}); else msg(res.message,'error');
    }
  });
}
function setSuperior(uid, curr){
  get('/api/users').then(r=>{
    if(!r.success)return msg('加载失败','error');
    let html='<select id="superiorSel"><option value="">无</option>';
    r.data.filter(u=>u._id!==uid).forEach(u=>{
      html+=`<option value="${u._id}"${curr===u._id?' selected':''}>${u.username}</option>`;
    });
    html+='</select>';
    Swal.fire({title:'设置上级',html,showCancelButton:true,confirmButtonText:'保存',cancelButtonText:'取消',customClass:{popup:'swal2-popup-wide'}})
    .then(async res=>{
      if(res.isConfirmed){
        const superiorId = document.getElementById('superiorSel').value;
        Swal.showLoading();
        const r2 = await post('/api/users/superior',{uid,superiorId:superiorId||null});
        Swal.close();
        if(r2.success) renderUsers(),Swal.fire({icon:'success',title:'设置成功',timer:1000,showConfirmButton:false}); else msg(r2.message,'error');
      }
    });
  });
}