const { Markup } = require('telegraf');
const { query } = require('../db');
const { studentStates, timers, clearTimers } = require('../state');
const { isGroupMember } = require('../middleware/groupCheck');
const { isAnswerCorrect } = require('../utils/fuzzyMatch');
const { ADMIN_IDS, INVITE_USERNAME, MAX_ATTEMPTS, FIRST_TIMEOUT_MS, SECOND_TIMEOUT_MS } = require('../config');

const MD = { parse_mode: 'Markdown' };

function studentDisplayName(from) {
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'O\'quvchi';
}

function escapeMd(text) {
  return String(text || '').replace(/([_*`[\]])/g, '\\$1');
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CORRECT_REPLIES = [
  "✅️ *Ajoyib!* Javobingiz to'g'ri 🎉",
  "✅️ *Zo'r!* Aynan shunday 👏",
  "✅️ *Barakalla!* To'g'ri javob shu 🌟",
  "✅️ *Mukammal!* Xuddi shunday bo'lishi kerak edi 😊",
  "✅️ *Tabriklayman!* Bexato javob berdingiz 🎯",
];

const WRONG_REPLIES = [
  "❌️ Biroz adashdingiz, davom etamiz 🫡",
  "❌️ Unchalik emas, lekin harakatingiz yaxshi — davom etaylik 🙂",
  "❌️ Bu safar noto'g'ri chiqdi, xafa bo'lmang, oldinga yuraveramiz 💪",
  "❌️ Yo'q, boshqacharoq edi. Keyingisida albatta uddalaysiz 🌱",
  "❌️ Afsuski xato, lekin bu ham o'rganish jarayoni — davom etamiz 📚",
];

async function sendQuestion(bot, session) {
  const qRes = await query(
    'SELECT * FROM questions WHERE topic_id=$1 ORDER BY order_index ASC OFFSET $2 LIMIT 1',
    [session.topic_id, session.current_index]
  );
  if (qRes.rowCount === 0) {
    return finishSession(bot, session);
  }
  const question = qRes.rows[0];
  await query('UPDATE sessions SET last_question_at=now() WHERE id=$1', [session.id]);
  await bot.telegram.sendMessage(session.student_tg_id, `⁉️ *${escapeMd(question.question)}*`, MD);
  scheduleTimeouts(bot, session.id);
}

function scheduleTimeouts(bot, sessionId) {
  clearTimers(sessionId);
  const firstTimeout = setTimeout(async () => {
    try {
      const sRes = await query('SELECT * FROM sessions WHERE id=$1', [sessionId]);
      const session = sRes.rows[0];
      if (!session || session.status !== 'active') return;
      await bot.telegram.sendMessage(
        session.student_tg_id,
        "_⏳ Vaqt tugadi. Javobingizni kuting yoki tez orada yozing..._",
        MD
      );
      const secondTimeout = setTimeout(async () => {
        await handleTimeout(bot, sessionId);
      }, SECOND_TIMEOUT_MS);
      timers.set(sessionId, { firstTimeout, secondTimeout });
    } catch (e) {
      console.error(e);
    }
  }, FIRST_TIMEOUT_MS);
  timers.set(sessionId, { firstTimeout, secondTimeout: null });
}

async function handleTimeout(bot, sessionId) {
  const sRes = await query('SELECT * FROM sessions WHERE id=$1', [sessionId]);
  const session = sRes.rows[0];
  if (!session || session.status !== 'active') return;

  const qRes = await query(
    'SELECT * FROM questions WHERE topic_id=$1 ORDER BY order_index ASC OFFSET $2 LIMIT 1',
    [session.topic_id, session.current_index]
  );
  const question = qRes.rows[0];

  if (question) {
    await query(
      'INSERT INTO session_answers (session_id, question_id, student_answer, is_correct) VALUES ($1,$2,$3,false)',
      [session.id, question.id, '(javob berilmadi)']
    );
    await query('UPDATE sessions SET wrong_count = wrong_count + 1 WHERE id=$1', [session.id]);
  }

  await query("UPDATE sessions SET status='paused' WHERE id=$1", [session.id]);

  const answerLine = question ? `\n\n*Javob:* \`${escapeMd(question.answer)}\`` : '';
  await bot.telegram.sendMessage(
    session.student_tg_id,
    `_2 daqiqa davomida yozmaganligingiz uchun savol-javob avtomatik to'xtatildi._${answerLine}`,
    { ...MD, ...Markup.inlineKeyboard([[Markup.button.callback('▶️ Davom ettirish', `continue_${session.id}`)]]) }
  );
}

async function finishSession(bot, session) {
  clearTimers(session.id);
  const total = session.correct_count + session.wrong_count;
  const percent = total > 0 ? Math.round((session.correct_count / total) * 100) : 0;
  await query("UPDATE sessions SET status='finished', finished_at=now() WHERE id=$1", [session.id]);

  const topicRes = await query('SELECT * FROM topics WHERE id=$1', [session.topic_id]);
  const topic = topicRes.rows[0];

  await bot.telegram.sendMessage(
    session.student_tg_id,
    `🎉 *Tabriklaymiz, ${escapeMd(session.student_name)}!*\n\n` +
      `Mavzu: *${escapeMd(topic.name)}*\n` +
      `Natija: \`${session.correct_count}/${total}\` to'g'ri (*${percent}%*)\n\n` +
      `_Bilimingizni oshirishda davom eting! Keyingi savol-javobda ko'rishguncha, xayr 🖐_`,
    MD
  );

  if (session.attempt_number === 1) {
    const usernamePart = session.tg_username ? `@${session.tg_username}` : "(username yo'q)";
    const line =
      `📊 Hisobot\n` +
      `Kod: ${session.code}\n` +
      `Mavzu: ${topic.name}\n` +
      `Ism: ${session.student_name}\n` +
      `Username: ${usernamePart}\n` +
      `Telegram ID: ${session.student_tg_id}\n` +
      `Natija: ${session.correct_count}/${total} (${percent}%)`;
    for (const adminId of ADMIN_IDS) {
      bot.telegram.sendMessage(adminId, line).catch(() => {});
    }
  }
}

async function processAnswer(bot, session, studentAnswerText) {
  const qRes = await query(
    'SELECT * FROM questions WHERE topic_id=$1 ORDER BY order_index ASC OFFSET $2 LIMIT 1',
    [session.topic_id, session.current_index]
  );
  const question = qRes.rows[0];
  if (!question) return finishSession(bot, session);

  clearTimers(session.id);

  const correct = isAnswerCorrect(studentAnswerText, question.answer);
  await query(
    'INSERT INTO session_answers (session_id, question_id, student_answer, is_correct) VALUES ($1,$2,$3,$4)',
    [session.id, question.id, studentAnswerText, correct]
  );

  if (correct) {
    await query('UPDATE sessions SET correct_count = correct_count + 1 WHERE id=$1', [session.id]);
    await bot.telegram.sendMessage(session.student_tg_id, '✅️');
    await bot.telegram.sendMessage(
      session.student_tg_id,
      `${pick(CORRECT_REPLIES)}\n\n_Javob:_ \`${escapeMd(question.answer)}\``,
      MD
    );
  } else {
    await query('UPDATE sessions SET wrong_count = wrong_count + 1 WHERE id=$1', [session.id]);
    await bot.telegram.sendMessage(session.student_tg_id, '❌️');
    await bot.telegram.sendMessage(
      session.student_tg_id,
      `${pick(WRONG_REPLIES)}\n\n_To'g'ri javob:_ \`${escapeMd(question.answer)}\``,
      MD
    );
  }

  const nextIndex = session.current_index + 1;
  await query('UPDATE sessions SET current_index=$1 WHERE id=$2', [nextIndex, session.id]);

  const updated = { ...session, current_index: nextIndex };
  await sendQuestion(bot, updated);
}

function registerStudentHandlers(bot) {
  bot.start(async (ctx) => {
    const isMember = await isGroupMember(bot.telegram, ctx.from.id);
    if (!isMember) {
      return ctx.reply(
        `Bot faqat yopiq guruh a'zolariga xizmat qiladi.\nGuruhga qo'shilish uchun ${INVITE_USERNAME} ga yozing.`
      );
    }

    await ctx.reply(`Assalomu alaykum🖐\n\nMen *Nargiza Olimovnaning* yordamchisiman.`, MD);
    await ctx.reply(
      "Bugun siz bilan maxsus videodars asosida savol-javob qilaman. Buning uchun *6 xonali savol-javob kodini* kiriting. Bu kod guruhga berilgan bo'lishi kerak.\n\n_Hozir faqat 6 ta belgili kod yuboring, ortiqcha narsalar yozmang._",
      MD
    );
    studentStates.set(ctx.from.id, { step: 'awaiting_code' });
  });

  bot.action(/continue_(\d+)/, async (ctx) => {
    const sessionId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});

    const sRes = await query('SELECT * FROM sessions WHERE id=$1', [sessionId]);
    const session = sRes.rows[0];
    if (!session) return;

    const nextIndex = session.current_index + 1;
    await query("UPDATE sessions SET status='active', current_index=$1 WHERE id=$2", [nextIndex, sessionId]);
    await sendQuestion(bot, { ...session, current_index: nextIndex });
  });

  bot.action(/start_quiz_(\d+)/, async (ctx) => {
    const sessionId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});

    const sRes = await query('SELECT * FROM sessions WHERE id=$1', [sessionId]);
    const session = sRes.rows[0];
    if (!session) return;

    await query("UPDATE sessions SET status='active' WHERE id=$1", [sessionId]);
    studentStates.delete(ctx.from.id);
    await sendQuestion(bot, session);
  });

  bot.on('text', async (ctx, next) => {
    const state = studentStates.get(ctx.from.id);
    const text = ctx.message.text.trim();

    // 1) Kod kutilayotgan holat
    if (state && state.step === 'awaiting_code') {
      const code = text.toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        return ctx.reply("Kod 6 ta harf/raqamdan iborat bo'lishi kerak. Qaytadan yuboring:");
      }

      const topicRes = await query('SELECT * FROM topics WHERE code=$1 AND finalized=true', [code]);
      if (topicRes.rowCount === 0) {
        return ctx.reply("Bunday kod topilmadi. Kodni tekshirib qaytadan yuboring:");
      }
      const topic = topicRes.rows[0];

      const attemptsRes = await query(
        'SELECT COUNT(*) FROM sessions WHERE code=$1 AND student_tg_id=$2',
        [code, ctx.from.id]
      );
      const attemptsUsed = Number(attemptsRes.rows[0].count);
      if (attemptsUsed >= MAX_ATTEMPTS) {
        return ctx.reply(`Siz ushbu kod bilan ${MAX_ATTEMPTS} marta urinish huquqingizni ishlatib bo'lgansiz.`);
      }

      const name = studentDisplayName(ctx.from);
      const insertRes = await query(
        `INSERT INTO sessions (topic_id, code, student_tg_id, student_name, tg_profile_name, tg_username, attempt_number, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
        [topic.id, code, ctx.from.id, name, name, ctx.from.username || null, attemptsUsed + 1]
      );
      const sessionId = insertRes.rows[0].id;
      studentStates.delete(ctx.from.id);

      await ctx.reply(
        `Kod qabul qilindi ✅️\n\n` +
          `MAVZU: *${escapeMd(topic.name)}*\n\n` +
          `⚠️ _D I Q Q A T_ bitta mavzuda ${MAX_ATTEMPTS} marta qayta-qayta savol-javob qilishimiz mumkin. Lekin faqat birinchi natija haqiqiy hisoblanadi va Nargiza ustozlarga ko'rinadi.`,
        { ...MD, ...Markup.inlineKeyboard([[Markup.button.callback('▶️ Boshlash', `start_quiz_${sessionId}`)]]) }
      );
      return;
    }

    // 2) Aktiv sessiyada javob kutilyapti
    const activeRes = await query(
      "SELECT * FROM sessions WHERE student_tg_id=$1 AND status='active' ORDER BY id DESC LIMIT 1",
      [ctx.from.id]
    );
    if (activeRes.rowCount > 0) {
      const session = activeRes.rows[0];
      await processAnswer(bot, session, text);
      return;
    }

    // 3) "Boshlash" tugmasi bosilishini kutayotgan holat
    const pendingRes = await query(
      "SELECT * FROM sessions WHERE student_tg_id=$1 AND status='pending' ORDER BY id DESC LIMIT 1",
      [ctx.from.id]
    );
    if (pendingRes.rowCount > 0) {
      const session = pendingRes.rows[0];
      await ctx.reply(
        "Savol-javobni boshlash uchun yuqoridagi *▶️ Boshlash* tugmasini bosing.",
        { ...MD, ...Markup.inlineKeyboard([[Markup.button.callback('▶️ Boshlash', `start_quiz_${session.id}`)]]) }
      );
      return;
    }

    // 4) Paused holatda (vaqt tugagan) bo'lsa ham eslatma
    const pausedRes = await query(
      "SELECT * FROM sessions WHERE student_tg_id=$1 AND status='paused' ORDER BY id DESC LIMIT 1",
      [ctx.from.id]
    );
    if (pausedRes.rowCount > 0) {
      const session = pausedRes.rows[0];
      await ctx.reply(
        "Davom etish uchun yuqoridagi *▶️ Davom ettirish* tugmasini bosing.",
        { ...MD, ...Markup.inlineKeyboard([[Markup.button.callback('▶️ Davom ettirish', `continue_${session.id}`)]]) }
      );
      return;
    }

    return next();
  });
}

module.exports = { registerStudentHandlers };
