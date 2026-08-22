const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fetch = require('node-fetch');  // <-- استيراد node-fetch
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const rooms = new Map();

async function generateQuestions(category, difficulty, count = 10) {
  try {
    const prompt = `أنشئ ${count} أسئلة متعددة الخيارات في فئة "${category}" بمستوى ${difficulty}. الصيغة JSON: [{"question":"...","options":["أ","ب","ج","د"],"correct":0,"time":20}]`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'أنت مولد أسئلة ألعاب. أعد الرد بصيغة JSON فقط.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
  } catch (error) {
    console.error('خطأ في توليد الأسئلة:', error);
    return getFallbackQuestions(category, count);
  }
}

function getFallbackQuestions(category, count) {
  const fallback = {
    'عام': [
      { question: "ما هي عاصمة المملكة العربية السعودية؟", options: ["جدة", "الرياض", "مكة", "الدمام"], correct: 1, time: 15 },
      { question: "كم عدد أيام السنة؟", options: ["365", "360", "355", "370"], correct: 0, time: 10 },
      { question: "ما هو أكبر كوكب في المجموعة الشمسية؟", options: ["الأرض", "المريخ", "المشتري", "زحل"], correct: 2, time: 15 }
    ],
    'رياضة': [
      { question: "كم عدد لاعبي فريق كرة القدم؟", options: ["9", "10", "11", "12"], correct: 2, time: 10 },
      { question: "في أي سنة أقيمت كأس العالم الأولى؟", options: ["1928", "1930", "1932", "1934"], correct: 1, time: 20 }
    ],
    'علوم': [
      { question: "ما هو العنصر الكيميائي الذي رمزه O؟", options: ["أكسجين", "ذهب", "فضة", "حديد"], correct: 0, time: 10 },
      { question: "كم عدد الكروموسومات في الإنسان؟", options: ["42", "44", "46", "48"], correct: 2, time: 15 }
    ]
  };
  return (fallback[category] || fallback['عام']).slice(0, count);
}

io.on('connection', (socket) => {
  socket.on('create-room', async (data, callback) => {
    try {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const questions = await generateQuestions(data.category, data.difficulty, data.questionCount || 10);
      rooms.set(roomId, {
        host: socket.id,
        players: [{ id: socket.id, name: data.hostName, score: 0 }],
        questions, currentQuestion: -1, status: 'waiting',
        category: data.category, difficulty: data.difficulty
      });
      socket.join(roomId);
      callback({ success: true, roomId, questionsCount: questions.length });
    } catch (error) {
      console.error('خطأ:', error);
      callback({ success: false, error: 'فشل في توليد الأسئلة' });
    }
  });

  socket.on('join-room', (data, callback) => {
    const room = rooms.get(data.roomId);
    if (!room) return callback({ success: false, error: 'الغرفة غير موجودة' });
    if (room.status !== 'waiting') return callback({ success: false, error: 'اللعبة بدأت' });
    room.players.push({ id: socket.id, name: data.playerName, score: 0 });
    socket.join(data.roomId);
    io.to(data.roomId).emit('player-joined', { players: room.players, newPlayer: data.playerName });
    callback({ success: true, room });
  });

  socket.on('start-game', (roomId) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return;
    room.status = 'playing'; room.currentQuestion = 0;
    io.to(roomId).emit('game-started', { question: room.questions[0] });
    startQuestionTimer(roomId);
  });

  socket.on('submit-answer', (data) => {
    const room = rooms.get(data.roomId);
    if (!room || room.status !== 'playing') return;
    const player = room.players.find(p => p.id === socket.id);
    const question = room.questions[room.currentQuestion];
    if (data.answerIndex === question.correct) {
      player.score += 100 + Math.floor((data.timeLeft / question.time) * 50);
    }
    io.to(data.roomId).emit('answer-result', { playerId: socket.id, playerName: player.name, correct: data.answerIndex === question.correct, score: player.score });
  });

  socket.on('next-question', (roomId) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return;
    room.currentQuestion++;
    if (room.currentQuestion >= room.questions.length) {
      room.status = 'finished';
      io.to(roomId).emit('game-ended', { winners: [...room.players].sort((a, b) => b.score - a.score) });
    } else {
      io.to(roomId).emit('new-question', { question: room.questions[room.currentQuestion], questionNumber: room.currentQuestion + 1, totalQuestions: room.questions.length });
      startQuestionTimer(roomId);
    }
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        room.players.length === 0 ? rooms.delete(roomId) : io.to(roomId).emit('player-left', { players: room.players });
      }
    });
  });
});

function startQuestionTimer(roomId) {
  const room = rooms.get(roomId); if (!room) return;
  let timeLeft = room.questions[room.currentQuestion].time;
  room.timer = setInterval(() => {
    timeLeft--;
    io.to(roomId).emit('timer-update', { timeLeft });
    if (timeLeft <= 0) { clearInterval(room.timer); io.to(roomId).emit('time-up', { correctAnswer: room.questions[room.currentQuestion].correct }); }
  }, 1000);
}

app.get('/', (req, res) => res.json({ message: 'Live Game Show API - عالم التحديات', status: 'running' }));
app.get('/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

server.listen(PORT, () => console.log(`🎮 Server running on port ${PORT}`));
