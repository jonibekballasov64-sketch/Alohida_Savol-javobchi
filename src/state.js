// Jarayon davomida xotirada saqlanadigan holatlar.
// Eslatma: Railway konteyner qayta ishga tushsa (deploy/restart), bu holatlar yo'qoladi.
// Tugallangan mavzular va natijalar baribir DB'da saqlanadi - xavfsiz.

const adminStates = new Map(); // adminId -> { step, topicId, mode }
const studentStates = new Map(); // studentId -> { step }
const timers = new Map(); // sessionId -> { firstTimeout, secondTimeout }

function clearTimers(sessionId) {
  const t = timers.get(sessionId);
  if (t) {
    clearTimeout(t.firstTimeout);
    clearTimeout(t.secondTimeout);
    timers.delete(sessionId);
  }
}

module.exports = { adminStates, studentStates, timers, clearTimers };
