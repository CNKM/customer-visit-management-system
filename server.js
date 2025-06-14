require('dotenv').config();
const express = require('express');
const Datastore = require('@seald-io/nedb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const users = new Datastore({ filename: './db/users.db', autoload: true });
const visits = new Datastore({ filename: './db/visits.db', autoload: true });

const {
  PORT = 3000,
  JWT_SECRET,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
} = process.env;

function sendErr(res, msg, code = 400) {
  res.status(code).json({ success: false, message: msg });
}

function auth(role) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendErr(res, '未认证，请登录', 401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return sendErr(res, '认证无效', 401);
      req.user = user;
      if (role && (!user.role || (Array.isArray(role) ? !role.includes(user.role) : user.role !== role))) {
        return sendErr(res, '无权限', 403);
      }
      next();
    });
  };
}

// 管理员自动初始化
users.findOne({ username: ADMIN_USERNAME }, (err, u) => {
  if (!u) {
    bcrypt.hash(ADMIN_PASSWORD, 10, (err, hash) => {
      users.insert({
        _id: uuidv4(),
        username: ADMIN_USERNAME,
        password: hash,
        role: 'admin',
        status: 'active',
        superiorId: null
      });
    });
  }
});

// 注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6)
    return sendErr(res, '用户名和新密码长度不少于6');
  users.findOne({ username }, (err, u) => {
    if (u) return sendErr(res, '用户名已存在');
    bcrypt.hash(password, 10, (err, hash) => {
      users.insert({
        _id: uuidv4(),
        username,
        password: hash,
        role: 'user',
        status: 'pending',
        superiorId: null
      }, () => res.json({ success: true }));
    });
  });
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  users.findOne({ username }, (err, u) => {
    if (!u) return sendErr(res, '用户名或密码错误');
    if (u.status === 'pending') return sendErr(res, '账号待激活');
    if (u.status === 'disabled') return sendErr(res, '账号已禁用');
    bcrypt.compare(password, u.password, (err, ok) => {
      if (!ok) return sendErr(res, '用户名或密码错误');
      const token = jwt.sign({ id: u._id, username: u.username, role: u.role }, JWT_SECRET, { expiresIn: '2d' });
      res.json({ success: true, token, user: { id: u._id, username: u.username, role: u.role, superiorId: u.superiorId } });
    });
  });
});

// 修改密码
app.post('/api/change-pw', auth(), (req, res) => {
  const { curr, next, confirm } = req.body;
  if (!curr || !next || !confirm || next.length < 6 || next !== confirm)
    return sendErr(res, '密码输入有误');
  users.findOne({ _id: req.user.id }, (err, u) => {
    bcrypt.compare(curr, u.password, (err, ok) => {
      if (!ok) return sendErr(res, '当前密码错误');
      bcrypt.hash(next, 10, (err, hash) => {
        users.update({ _id: u._id }, { $set: { password: hash } }, () => res.json({ success: true }));
      });
    });
  });
});

// 退出登录（前端处理，后端无需实现）

// 用户列表（仅管理员）
app.get('/api/users', auth('admin'), (req, res) => {
  users.find({ role: 'user' }, (err, list) => {
    res.json({ success: true, data: list });
  });
});

// 激活/禁用用户
app.post('/api/users/status', auth('admin'), (req, res) => {
  const { uid, status } = req.body;
  if (!['pending', 'active', 'disabled'].includes(status)) return sendErr(res, '状态无效');
  users.update({ _id: uid }, { $set: { status } }, {}, () => res.json({ success: true }));
});

// 重置密码
app.post('/api/users/resetpw', auth('admin'), (req, res) => {
  const { uid, password } = req.body;
  if (!password || password.length < 6) return sendErr(res, '密码长度不足');
  bcrypt.hash(password, 10, (err, hash) => {
    users.update({ _id: uid }, { $set: { password: hash } }, {}, () => res.json({ success: true }));
  });
});

// 设置上级
app.post('/api/users/superior', auth('admin'), (req, res) => {
  const { uid, superiorId } = req.body;
  if (uid === superiorId) return sendErr(res, '不可设置自己为上级');
  if (superiorId) {
    // 循环引用检测
    let chain = [uid];
    function checkLoop(id, cb) {
      users.findOne({ _id: id }, (err, u) => {
        if (!u || !u.superiorId) return cb(false);
        if (chain.includes(u.superiorId)) return cb(true);
        chain.push(u.superiorId);
        checkLoop(u.superiorId, cb);
      });
    }
    checkLoop(superiorId, isLoop => {
      if (isLoop) return sendErr(res, '循环上级关系');
      users.update({ _id: uid }, { $set: { superiorId } }, {}, () => res.json({ success: true }));
    });
  } else {
    users.update({ _id: uid }, { $set: { superiorId: null } }, {}, () => res.json({ success: true }));
  }
});

// 拜访记录创建
app.post('/api/visits', auth('user'), (req, res) => {
  const { title, customer, planDate, desc } = req.body;
  if (!title || !customer || !planDate)
    return sendErr(res, '必填项缺失');
  visits.insert({
    _id: uuidv4(),
    title,
    customer,
    planDate,
    desc: desc || '',
    status: 'draft',
    creator: req.user.id,
    feedback: '',
    createdAt: Date.now()
  }, (err, v) => res.json({ success: true, data: v }));
});

// 拜访记录列表
app.get('/api/visits', auth(), (req, res) => {
  const { status, userId, page = 1, pageSize = 10 } = req.query;
  let query = {};
  if (req.user.role === 'admin') {
    if (userId) query.creator = userId;
  } else {
    query = { $or: [{ creator: req.user.id }] };
    if (req.user.role === 'user') {
      // 作为上级
      users.find({ superiorId: req.user.id }, (err, subs) => {
        const subIds = subs.map(s => s._id);
        if (subIds.length)
          query.$or.push({ creator: { $in: subIds }, status: { $in: ['submitted', 'feedback'] } });
        filterVisit(query);
      });
      return;
    }
  }
  if (status) query.status = status;
  filterVisit(query);

  function filterVisit(q) {
    visits.count(q, (err, total) => {
      visits.find(q).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(Number(pageSize)).exec((err, list) => {
        // 获取创建者姓名
        const ids = [...new Set(list.map(x => x.creator))];
        users.find({ _id: { $in: ids } }, (err, us) => {
          const map = {};
          us.forEach(u => map[u._id] = u.username);
          res.json({
            success: true,
            data: list.map(x => ({ ...x, creatorName: map[x.creator] || '' })),
            total
          });
        });
      });
    });
  }
});

// 拜访记录统计
app.get('/api/visits/stat', auth(), (req, res) => {
  let query = {};
  if (req.user.role === 'admin') { }
  else {
    query = { creator: req.user.id };
  }
  visits.find(query, (err, list) => {
    const stat = { draft: 0, submitted: 0, feedback: 0 };
    list.forEach(x => stat[x.status]++);
    res.json({ success: true, data: stat });
  });
});

// 拜访记录操作（详情、提交、修改、删除、反馈）
app.get('/api/visits/:id', auth(), (req, res) => {
  visits.findOne({ _id: req.params.id }, (err, v) => {
    if (!v) return sendErr(res, '记录不存在');
    users.findOne({ _id: v.creator }, (err, u) => {
      res.json({ success: true, data: { ...v, creatorName: u?.username || '' } });
    });
  });
});
app.post('/api/visits/:id/submit', auth(), (req, res) => {
  visits.findOne({ _id: req.params.id }, (err, v) => {
    if (!v) return sendErr(res, '记录不存在');
    if (v.creator !== req.user.id || v.status !== 'draft') return sendErr(res, '无权限');
    visits.update({ _id: v._id }, { $set: { status: 'submitted' } }, {}, () => res.json({ success: true }));
  });
});
app.post('/api/visits/:id/edit', auth(), (req, res) => {
  const { title, customer, planDate, desc } = req.body;
  visits.findOne({ _id: req.params.id }, (err, v) => {
    if (!v) return sendErr(res, '记录不存在');
    if (v.creator !== req.user.id || v.status !== 'draft') return sendErr(res, '无权限');
    visits.update({ _id: v._id }, { $set: { title, customer, planDate, desc } }, {}, () => res.json({ success: true }));
  });
});
app.post('/api/visits/:id/delete', auth(), (req, res) => {
  visits.findOne({ _id: req.params.id }, (err, v) => {
    if (!v) return sendErr(res, '记录不存在');
    if (v.creator !== req.user.id || v.status !== 'draft') return sendErr(res, '无权限');
    visits.remove({ _id: v._id }, {}, () => res.json({ success: true }));
  });
});
app.post('/api/visits/:id/feedback', auth(['admin', 'user']), (req, res) => {
  visits.findOne({ _id: req.params.id }, (err, v) => {
    if (!v) return sendErr(res, '记录不存在');
    if (v.status !== 'submitted') return sendErr(res, '只能对已提交记录反馈');
    if (req.user.role === 'admin') doFeedback();
    else {
      // 上级判定
      users.findOne({ _id: v.creator }, (err, u) => {
        if (u?.superiorId !== req.user.id) return sendErr(res, '无权限反馈');
        doFeedback();
      });
    }
    function doFeedback() {
      visits.update({ _id: v._id }, { $set: { status: 'feedback', feedback: req.body.feedback || '' } }, {}, () => res.json({ success: true }));
    }
  });
});

// 用户信息
app.get('/api/me', auth(), (req, res) => {
  users.findOne({ _id: req.user.id }, (err, u) => {
    res.json({ success: true, data: u });
  });
});

// 管理员导出所有用户及拜访信息为 xlsx（美观、汇总、无技术字段）
app.get('/api/export', auth('admin'), async (req, res) => {
  try {
    users.find({ role: 'user' }, async (err, userList) => {
      if (err) return sendErr(res, '用户查询失败');
      visits.find({}, async (err, visitList) => {
        if (err) return sendErr(res, '拜访查询失败');
        // 统计数据
        const stat = { total: visitList.length, draft: 0, submitted: 0, feedback: 0 };
        visitList.forEach(x => stat[x.status]++);
        const activeUsers = userList.filter(u => u.status === 'active').length;
        // 用户ID到用户名映射
        const userMap = {};
        userList.forEach(u => userMap[u._id] = u.username);
        // 创建工作簿
        const wb = new ExcelJS.Workbook();
        wb.creator = '系统自动导出';
        wb.created = new Date();
        // 汇总sheet
        const sumSheet = wb.addWorksheet('汇总', {properties:{tabColor:{argb:'FF4CAF50'}}});
        sumSheet.addRow(['用户总数', userList.length]);
        sumSheet.addRow(['激活用户数', activeUsers]);
        sumSheet.addRow(['拜访总数', stat.total]);
        sumSheet.addRow(['草稿拜访数', stat.draft]);
        sumSheet.addRow(['已提交拜访数', stat.submitted]);
        sumSheet.addRow(['已反馈拜访数', stat.feedback]);
        sumSheet.getColumn(1).width = 16;
        sumSheet.getColumn(2).width = 12;
        sumSheet.eachRow(r=>{r.font={bold:true};r.alignment={vertical:'middle',horizontal:'center'};});
        sumSheet.getCell('A1').fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF2196F3'}};
        // 用户信息sheet
        const userSheet = wb.addWorksheet('用户信息', {properties:{tabColor:{argb:'FF4CAF50'}}});
        userSheet.columns = [
          { header: '用户名', key: 'username', width: 18 },
          { header: '状态', key: 'status', width: 12 },
          { header: '上级', key: 'superiorName', width: 18 }
        ];
        userSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        userSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
        userList.forEach(u => {
          userSheet.addRow({
            username: u.username,
            status: u.status === 'active' ? '已激活' : u.status === 'pending' ? '待激活' : '已禁用',
            superiorName: userMap[u.superiorId] || ''
          });
        });
        // 拜访信息sheet
        const visitSheet = wb.addWorksheet('拜访信息', {properties:{tabColor:{argb:'FF2196F3'}}});
        visitSheet.columns = [
          { header: '标题', key: 'title', width: 18 },
          { header: '客户', key: 'customer', width: 18 },
          { header: '计划日期', key: 'planDate', width: 14 },
          { header: '状态', key: 'status', width: 12 },
          { header: '反馈', key: 'feedback', width: 24 },
          { header: '创建人', key: 'creatorName', width: 18 },
          { header: '创建时间', key: 'createdAt', width: 20 }
        ];
        visitSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        visitSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2196F3' } };
        visitList.forEach(v => {
          visitSheet.addRow({
            title: v.title,
            customer: v.customer,
            planDate: v.planDate,
            status: v.status === 'draft' ? '草稿' : v.status === 'submitted' ? '已提交' : '已反馈',
            feedback: v.feedback || '',
            creatorName: userMap[v.creator] || '',
            createdAt: v.createdAt ? new Date(v.createdAt).toLocaleString() : ''
          });
        });
        // 美化边框
        [userSheet, visitSheet].forEach(sheet => {
          sheet.eachRow((row, rowNum) => {
            row.eachCell(cell => {
              cell.border = {
                top: {style:'thin', color:{argb:'FFCCCCCC'}},
                left: {style:'thin', color:{argb:'FFCCCCCC'}},
                bottom: {style:'thin', color:{argb:'FFCCCCCC'}},
                right: {style:'thin', color:{argb:'FFCCCCCC'}}
              };
              cell.alignment = {vertical:'middle',horizontal:'center'};
            });
          });
        });
        // 导出
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="export.xlsx"');
        await wb.xlsx.write(res);
        res.end();
      });
    });
  } catch (e) {
    sendErr(res, '导出失败');
  }
});

app.listen(PORT, () => console.log(' Server running on http://localhost:' + PORT));
