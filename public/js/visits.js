let visitPage = 1, visitStatus = '', visitUid = '', visitTotal = 0;
async function renderVisits() {
  const box = document.getElementById('tabVisits');
  box.innerHTML = `<div class="visit-toolbar">
    <button class="btn primary btn-visit-new" id="btnVisitNew"><i class="fas fa-plus"></i> 新建拜访</button>
    <select id="visitStatus" class="visit-filter"><option value="">全部状态</option><option value="draft">草稿</option><option value="submitted">已提交</option><option value="feedback">已反馈</option></select>
    <select id="visitUser" class="visit-filter" style="display:none"></select>
    <span id="visitStat" class="visit-stat"></span>
  </div>
  <div id="visitList"></div>
  <div class="pager"></div>`;
  // 统计
  get('/api/visits/stat').then(r=>{
    if(r.success) document.getElementById('visitStat').innerHTML = `
      <span class="stat-chip stat-draft">草稿: ${r.data.draft}</span>
      <span class="stat-chip stat-submitted">已提交: ${r.data.submitted}</span>
      <span class="stat-chip stat-feedback">已反馈: ${r.data.feedback}</span>
    `;
  });
  // 管理员/上级可筛选
  if(user.role==='admin'||user.role==='user'){
    get('/api/users').then(r=>{
      if(r.success){
        let html = `<option value="">全部用户</option>`;
        r.data.forEach(u=>html+=`<option value="${u._id}">${u.username}</option>`);
        let sel = document.getElementById('visitUser');
        sel.innerHTML = html;
        sel.style.display = '';
        sel.onchange = e => { visitUid = e.target.value; visitPage=1; renderVisitList(); };
      }
    });
  }
  document.getElementById('visitStatus').onchange = e => { visitStatus = e.target.value; visitPage=1; renderVisitList(); };
  document.getElementById('btnVisitNew').onclick = () => showVisitEdit();
  renderVisitList();
}
async function renderVisitList() {
  let url = `/api/visits?status=${visitStatus}&userId=${visitUid}&page=${visitPage}`;
  const r = await get(url);
  const box = document.getElementById('visitList');
  visitTotal = r.total || 0;
  if (!r.success) return box.innerHTML = '加载失败';
  let html = `<table><tr><th>标题</th><th>客户</th><th>计划日期</th><th>状态</th>`;
  if(user.role==='admin'||user.role==='user') html+='<th>创建者</th>';
  html+='<th style="text-align:center;">操作</th></tr>';
  r.data.forEach(v=>{
    html+=`<tr>
      <td>${v.title}</td>
      <td>${v.customer}</td>
      <td>${v.planDate}</td>
      <td class="status-${v.status}">${showStatus(v.status)}</td>
      ${user.role==='admin'||user.role==='user'?`<td>${v.creatorName}</td>`:''}
      <td style="text-align:center;">
        <button class="btn mini" onclick="showVisitDetail('${v._id}')">详情</button>
        ${v.creator===user._id&&v.status==='draft'?`<button class="btn mini" onclick="showVisitEdit('${v._id}')">编辑</button>
        <button class="btn danger mini" onclick="delVisit('${v._id}')">删除</button>
        <button class="btn mini" onclick="submitVisit('${v._id}')">提交</button>`:''}
        ${canFeedback(v)?`<button class="btn mini" onclick="showFeedback('${v._id}')">反馈</button>`:''}
      </td>
    </tr>`;
  });
  html+='</table>';
  box.innerHTML = html;
  // 分页
  const pager = document.querySelector('.pager');
  let totalPage = Math.ceil(visitTotal/10);
  pager.innerHTML = totalPage>1?
    `<button class="btn mini"${visitPage<=1?' disabled':''} onclick="visitPrev()">上一页</button>
    <span>${visitPage}/${totalPage}</span>
    <button class="btn mini"${visitPage>=totalPage?' disabled':''} onclick="visitNext()">下一页</button>`:'';
}
function visitPrev(){ if(visitPage>1){visitPage--;renderVisitList();}}
function visitNext(){ let tp=Math.ceil(visitTotal/10);if(visitPage<tp){visitPage++;renderVisitList();}}
function showStatus(s){return s==='draft'?'草稿':s==='submitted'?'已提交':'已反馈';}
function canFeedback(v){
  if(user.role==='admin') return v.status==='submitted';
  if(user._id && v.status==='submitted' && v.creator!==user._id && user.role==='user') return true;
  return false;
}
async function showVisitDetail(id){
  const r = await get('/api/visits/'+id);
  if(!r.success) return msg('加载失败','error');
  const v = r.data;
  Swal.fire({
    title: '拜访详情',
    html: `
      <div class="swal-form-col">
        <div class="swal-form-row"><label>标题</label><div style="flex:1;">${v.title}</div></div>
        <div class="swal-form-row"><label>客户</label><div style="flex:1;">${v.customer}</div></div>
        <div class="swal-form-row"><label>计划日期</label><div style="flex:1;">${v.planDate}</div></div>
        <div class="swal-form-row"><label>状态</label><div style="flex:1;">${showStatus(v.status)}</div></div>
        <div class="swal-form-row"><label>创建者</label><div style="flex:1;">${v.creatorName}</div></div>
        <div class="swal-form-row"><label>描述</label><div style="flex:1;white-space:pre-line;">${v.desc||'-'}</div></div>
        <div class="swal-form-row"><label>反馈</label><div style="flex:1;white-space:pre-line;">${v.feedback||'-'}</div></div>
      </div>
    `,
    confirmButtonText: '关闭',
    customClass:{popup:'swal2-popup-wide'}
  });
}
function showVisitEdit(id){
  let isEdit = !!id;
  let v = { title:'', customer:'', planDate: (new Date).toISOString().slice(0,10), desc:'' };
  if(isEdit) get('/api/visits/'+id).then(r=>{
    if(r.success){v=r.data;open();}
    else Swal.fire({icon:'error',title:'加载失败',confirmButtonText:'确定'});
  }); else open();
  function open(){
    Swal.fire({
      title: isEdit?'编辑拜访':'新建拜访',
      html: `
        <div class="swal-form-col">
          <div class="swal-form-row"><label>标题</label><input id="fTitle" class="swal2-input" value="${v.title||''}" maxlength="32"></div>
          <div class="swal-form-row"><label>客户</label><input id="fCus" class="swal2-input" value="${v.customer||''}" maxlength="32"></div>
          <div class="swal-form-row"><label>计划日期</label><input id="fDate" type="date" class="swal2-input" value="${v.planDate||''}"></div>
          <div class="swal-form-row" style="align-items:flex-start;"><label style="line-height:1.7em;">描述</label><textarea id="fDesc" class="swal2-textarea" rows="3" style="resize:vertical;">${v.desc||''}</textarea></div>
        </div>
      `,
      showCancelButton:true,
      confirmButtonText: isEdit?'保存':'创建',
      cancelButtonText:'取消',
      customClass:{popup:'swal2-popup-wide'},
      preConfirm:()=>{
        let title=document.getElementById('fTitle').value.trim(),
            customer=document.getElementById('fCus').value.trim(),
            planDate=document.getElementById('fDate').value,
            desc=document.getElementById('fDesc').value.trim();
        if(!title||!customer||!planDate) return Swal.showValidationMessage('标题、客户、日期为必填');
        return { title, customer, planDate, desc };
      }
    }).then(async r=>{
      if(r.isConfirmed){
        let d=r.value;
        Swal.showLoading();
        let res = isEdit? await post('/api/visits/'+id+'/edit',d) : await post('/api/visits',d);
        Swal.close();
        if(res.success) renderVisitList(),Swal.fire({icon:'success',title:'操作成功',timer:1000,showConfirmButton:false});
        else Swal.fire({icon:'error',title:res.message,confirmButtonText:'确定'});
      }
    });
  }
}
function delVisit(id){
  msg('确认删除？','question','',b=>{if(b)post('/api/visits/'+id+'/delete',{}).then(r=>{if(r.success)renderVisitList(),Swal.fire({icon:'success',title:'删除成功',timer:800,showConfirmButton:false});else msg(r.message,'error');})});
}
function submitVisit(id){
  msg('确认提交？提交后不可修改','question','',b=>{if(b)post('/api/visits/'+id+'/submit',{}).then(r=>{if(r.success)renderVisitList(),Swal.fire({icon:'success',title:'提交成功',timer:800,showConfirmButton:false});else msg(r.message,'error');})});
}
function showFeedback(id){
  Swal.fire({
    title:'反馈',
    html:`<div class="swal-form-row"><label>反馈内容</label><textarea id="fbInput" class="swal2-textarea" rows="3" style="resize:vertical;"></textarea></div>`,
    showCancelButton:true,
    confirmButtonText:'提交反馈',
    cancelButtonText:'取消',
    customClass:{popup:'swal2-popup-wide'},
    preConfirm:()=>{
      let content=document.getElementById('fbInput').value.trim();
      if(!content) return Swal.showValidationMessage('请填写反馈内容');
      return content;
    }
  }).then(async r=>{
    if(r.isConfirmed){
      Swal.showLoading();
      const res = await post('/api/visits/'+id+'/feedback',{feedback:r.value});
      Swal.close();
      if(res.success) renderVisitList(),Swal.fire({icon:'success',title:'反馈成功',timer:1000,showConfirmButton:false}); else msg(res.message,'error');
    }
  });
}