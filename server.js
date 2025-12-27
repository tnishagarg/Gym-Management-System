require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT;

app.use(express.static(path.join(__dirname,'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// DB connection (callback-style)
const con = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  dateStrings: true
});

con.connect((err) => {
  if (err) {
    console.error('DB connect error:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL');
});

function requireLogin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/');
}

// Auth
app.post('/login', (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  const sql = 'SELECT admin_id, name, email FROM admin WHERE email = ? AND password = ? LIMIT 1';
  con.query(sql, [email, password], (err, results) => {
    if (err) throw err;
    if (!results || results.length === 0) {
      return res.send('<script>alert("Invalid credentials");location.href="/";</script>');
    }
    req.session.admin = results[0];
    res.redirect('/dashboard.html');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    res.redirect('/');
  });
});

// ---------- Gyms ----------
// list or get single
app.get('/api/gyms', requireLogin, (req, res) => {
  if (req.query.id) {
    con.query('SELECT g.*, gt.type FROM gym g LEFT JOIN gym_type gt ON g.gym_id=gt.gym_id WHERE g.gym_id=?', [req.query.id], (err, rows)=>{
      if (err) throw err;
      res.json(rows[0]||{});
    });
    return;
  }
  const sql = 'SELECT g.*, gt.type FROM gym g LEFT JOIN gym_type gt ON g.gym_id = gt.gym_id';
  con.query(sql, (err, rows) => { if (err) throw err; res.json(rows); });
});

app.post('/api/gyms', requireLogin, (req, res) => {
  const { gym_name, street_no, street_name, pin_code, landmark, type } = req.body;
  con.query('INSERT INTO gym (gym_name, street_no, street_name, pin_code, landmark) VALUES (?,?,?,?,?)',
    [gym_name, street_no, street_name, pin_code, landmark], (err, result) => {
      if (err) throw err;
      const gymId = result.insertId;
      con.query('INSERT INTO gym_type (gym_id, type) VALUES (?,?)', [gymId, type], (err2) => {
        if (err2) throw err2;
        res.json({ gym_id: gymId });
      });
  });
});

app.post('/api/gyms/update', requireLogin, (req, res) => {
  const { gym_id, gym_name, street_no, street_name, pin_code, landmark, type } = req.body;
  con.query('UPDATE gym SET gym_name=?, street_no=?, street_name=?, pin_code=?, landmark=? WHERE gym_id=?',
    [gym_name, street_no, street_name, pin_code, landmark, gym_id], (err) => {
      if (err) throw err;
      con.query('INSERT INTO gym_type (gym_id,type) VALUES (?,?) ON DUPLICATE KEY UPDATE type=VALUES(type)', [gym_id, type], (err2)=>{
        if (err2) throw err2;
        res.json({ ok: true });
      });
  });
});

app.post('/api/gyms/delete', requireLogin, (req, res) => {
  const id = req.body.gym_id;
  con.query('DELETE FROM gym WHERE gym_id = ?', [id], (err) => { if (err) throw err; res.json({ ok: true }); });
});

// ---------- Members ----------
// list or single (include age calculated by DB)
app.get('/api/members', requireLogin, (req, res) => {
  if (req.query.id) {
    con.query('SELECT m.*, DATE_FORMAT(m.dob, "%Y-%m-%d") AS dob, GROUP_CONCAT(mm.mobile_no) AS mobiles, m.trainer_id FROM member m LEFT JOIN mem_mobile_no mm ON m.mem_id=mm.mem_id WHERE m.mem_id=? GROUP BY m.mem_id', [req.query.id], (err, rows)=>{
      if (err) throw err;
      res.json(rows[0]||{});
    });
    return;
  }
  const sql = `SELECT m.*, getAge(m.dob) AS age, GROUP_CONCAT(mm.mobile_no) AS mobiles, t.trainer_first_name, t.trainer_last_name
               FROM member m
               LEFT JOIN member_detail md ON m.mem_id = md.mem_id
               LEFT JOIN mem_mobile_no mm ON m.mem_id = mm.mem_id
               LEFT JOIN trainer t ON m.trainer_id = t.trainer_id
               GROUP BY m.mem_id`;
  con.query(sql, (err, rows) => { if (err) throw err; res.json(rows); });
});

app.post('/api/members', requireLogin, (req, res) => {
  const { mem_first_name, mem_last_name, dob, trainer_id, mobiles } = req.body;
  con.query('INSERT INTO member (mem_first_name, mem_last_name, dob, trainer_id) VALUES (?,?,?,?)',
    [mem_first_name, mem_last_name, dob, trainer_id || null], (err, result) => {
      if (err) throw err;
      const memId = result.insertId;
      con.query('INSERT INTO member_detail (mem_id) VALUES (?)', [memId], (err2) => {
        if (err2) throw err2;
        if (mobiles && mobiles.length) {
          const vals = mobiles.map(m => [memId, m]);
          con.query('INSERT INTO mem_mobile_no (mem_id, mobile_no) VALUES ?', [vals], (err3) => { if (err3) throw err3; res.json({ mem_id: memId }); });
        } else {
          res.json({ mem_id: memId });
        }
      });
  });
});

app.post('/api/members/update', requireLogin, (req, res) => {
  const { mem_id, mem_first_name, mem_last_name, dob, trainer_id, mobiles } = req.body;
  con.query('UPDATE member SET mem_first_name=?, mem_last_name=?, dob=?, trainer_id=? WHERE mem_id=?',
    [mem_first_name, mem_last_name, dob, trainer_id || null, mem_id], (err) => {
      if (err) throw err;
      // replace mobiles
      con.query('DELETE FROM mem_mobile_no WHERE mem_id=?', [mem_id], (err2)=>{
        if (err2) throw err2;
        if (mobiles && mobiles.length) {
          const vals = mobiles.map(m => [mem_id, m]);
          con.query('INSERT INTO mem_mobile_no (mem_id, mobile_no) VALUES ?', [vals], (err3)=>{ if (err3) throw err3; res.json({ ok: true }); });
        } else res.json({ ok: true });
      });
  });
});

app.post('/api/members/delete', requireLogin, (req, res) => {
  const id = req.body.mem_id;
  con.query('DELETE FROM member WHERE mem_id = ?', [id], (err) => { if (err) throw err; res.json({ ok: true }); });
});

// ---------- Trainers ----------
app.get('/api/trainers', requireLogin, (req, res) => {
  if (req.query.id) {
    const sql = `
      SELECT 
        t.*, 
        (SELECT GROUP_CONCAT(time) FROM trainer_time WHERE trainer_id = t.trainer_id) AS times,
        (SELECT GROUP_CONCAT(mobile_no) FROM trainer_mobile_no WHERE trainer_id = t.trainer_id) AS mobiles
      FROM trainer t
      WHERE t.trainer_id = ?`;
    con.query(sql, [req.query.id], (err, rows) => {
      if (err) throw err;
      res.json(rows[0] || {}); 
    });
    return;
  }

  const sql = `
    SELECT 
      t.*,
      (SELECT GROUP_CONCAT(time) FROM trainer_time WHERE trainer_id = t.trainer_id) AS times,
      (SELECT GROUP_CONCAT(mobile_no) FROM trainer_mobile_no WHERE trainer_id = t.trainer_id) AS mobiles
    FROM trainer t`;
  con.query(sql, (err, rows) => {
    if (err) throw err;
    res.json(rows);
  });
});


app.post('/api/trainers', requireLogin, (req, res) => {
  const { trainer_first_name, trainer_last_name, times, mobiles } = req.body;
  con.query('INSERT INTO trainer (trainer_first_name, trainer_last_name) VALUES (?,?)',
    [trainer_first_name, trainer_last_name], (err, result) => {
      if (err) throw err;
      const trainerId = result.insertId;
      if (times && times.length) {
        const tvals = times.map(t => [trainerId, t]);
        con.query('INSERT INTO trainer_time (trainer_id, time) VALUES ?', [tvals], (err2) => { if (err2) throw err2;
          if (mobiles && mobiles.length) {
            const mvals = mobiles.map(m => [trainerId, m]);
            con.query('INSERT INTO trainer_mobile_no (trainer_id, mobile_no) VALUES ?', [mvals], (err3) => { if (err3) throw err3; res.json({ trainer_id: trainerId }); });
          } else res.json({ trainer_id: trainerId });
        });
      } else if (mobiles && mobiles.length) {
        const mvals = mobiles.map(m => [trainerId, m]);
        con.query('INSERT INTO trainer_mobile_no (trainer_id, mobile_no) VALUES ?', [mvals], (err3) => { if (err3) throw err3; res.json({ trainer_id: trainerId }); });
      } else res.json({ trainer_id: trainerId });
  });
});

app.post('/api/trainers/update', (req, res) => {
    const { trainer_id, trainer_first_name, trainer_last_name } = req.body;

    // mobiles field ko phones me map karo
    const phones = req.body.phones || req.body.mobiles || '';
    const times = req.body.times || '';

    const sql = `CALL UpdateTrainerFull(?, ?, ?, ?, ?)`;
    con.query(sql, [
        trainer_id,
        trainer_first_name,
        trainer_last_name,
        phones,
        times
    ], (err) => {
        if (err) {
            console.error("Error updating trainer:", err);
            return res.status(500).send("Error updating trainer");
        }
        res.send("Trainer updated successfully");
    });
});



app.post('/api/trainers/delete', requireLogin, (req, res) => {
  const id = req.body.trainer_id;
  con.query('DELETE FROM trainer WHERE trainer_id = ?', [id], (err) => { if (err) throw err; res.json({ ok: true }); });
});

// ---------- Workouts ----------
app.get('/api/workouts', requireLogin, (req, res) => {
  if (req.query.id) {
    con.query('SELECT w.*, wp.workout_schedule, wp.workout_repetition FROM workout w LEFT JOIN workout_plan wp ON w.workout_id=wp.workout_id WHERE w.workout_id=?', [req.query.id], (err, rows)=>{ if (err) throw err; res.json(rows[0]||{}); });
    return;
  }
  const sql = 'SELECT w.*, wp.workout_schedule, wp.workout_repetition FROM workout w LEFT JOIN workout_plan wp ON w.workout_id = wp.workout_id';
  con.query(sql, (err, rows) => { if (err) throw err; res.json(rows); });
});

app.post('/api/workouts', requireLogin, (req, res) => {
  const { workout_name, description, schedule, repetition } = req.body;
  con.query('INSERT INTO workout (workout_name, description) VALUES (?,?)', [workout_name, description], (err, result) => {
    if (err) throw err;
    const wid = result.insertId;
    if (schedule) {
      con.query('INSERT INTO workout_plan (workout_id, workout_schedule, workout_repetition) VALUES (?,?,?)', [wid, schedule, repetition || 0], (err2) => { if (err2) throw err2; res.json({ workout_id: wid }); });
    } else res.json({ workout_id: wid });
  });
});

app.post('/api/workouts/update', requireLogin, (req, res) => {
  const { workout_id, workout_name, description, schedule, repetition } = req.body;
  con.query('UPDATE workout SET workout_name=?, description=? WHERE workout_id=?', [workout_name, description, workout_id], (err)=>{
    if (err) throw err;
    con.query('DELETE FROM workout_plan WHERE workout_id=?', [workout_id], (err2)=>{
      if (err2) throw err2;
      if (schedule) {
        con.query('INSERT INTO workout_plan (workout_id, workout_schedule, workout_repetition) VALUES (?,?,?)', [workout_id, schedule, repetition || 0], (err3)=>{ if (err3) throw err3; res.json({ ok: true }); });
      } else res.json({ ok: true });
    });
  });
});

app.post('/api/workouts/delete', requireLogin, (req, res) => {
  const id = req.body.workout_id;
  con.query('DELETE FROM workout WHERE workout_id = ?', [id], (err) => { if (err) throw err; res.json({ ok: true }); });
});

// ---------- Enrollments ----------
app.get('/api/enrolls', requireLogin, (req, res) => {
  if (req.query.old_mem && req.query.old_wid) {
    con.query('SELECT * FROM enrolls_to WHERE mem_id=? AND workout_id=?', [req.query.old_mem, req.query.old_wid], (err, rows)=>{ if (err) throw err; res.json(rows[0]||{}); });
    return;
  }
  const sql = `SELECT e.*, m.mem_first_name, m.mem_last_name, w.workout_name FROM enrolls_to e
               LEFT JOIN member m ON e.mem_id = m.mem_id
               LEFT JOIN workout w ON e.workout_id = w.workout_id`;
  con.query(sql, (err, rows)=>{ if (err) throw err; res.json(rows); });
});

app.post('/api/enrolls', requireLogin, (req, res) => {
  const { mem_id, workout_id, date } = req.body;
  con.query('INSERT INTO enrolls_to (mem_id, workout_id, date) VALUES (?,?,?)', [mem_id, workout_id, date || new Date()], (err)=>{ if (err) throw err; res.json({ ok: true }); });
});

app.post('/api/enrolls/update', requireLogin, (req, res) => {
  const { old_mem_id, old_workout_id, mem_id, workout_id, date } = req.body;
  con.query('DELETE FROM enrolls_to WHERE mem_id=? AND workout_id=?', [old_mem_id, old_workout_id], (err)=>{
    if (err) throw err;
    con.query('INSERT INTO enrolls_to (mem_id, workout_id, date) VALUES (?,?,?)', [mem_id, workout_id, date || new Date()], (err2)=>{
      if (err2) throw err2;
      res.json({ ok: true });
    });
  });
});

app.post('/api/enrolls/delete', requireLogin, (req, res) => {
  const { mem_id, workout_id } = req.body;
  con.query('DELETE FROM enrolls_to WHERE mem_id=? AND workout_id=?', [mem_id, workout_id], (err)=>{ if (err) throw err; res.json({ ok: true }); });
});

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`✅ Server running on port ${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1); // try next port
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}

startServer(PORT);
