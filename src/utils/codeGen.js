const { query } = require('../db');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // I,O,0,1 chalkashmasin deb olib tashlandi

function randomCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

async function generateUniqueCode() {
  let code;
  let exists = true;
  while (exists) {
    code = randomCode(6);
    const res = await query('SELECT 1 FROM topics WHERE code = $1', [code]);
    exists = res.rowCount > 0;
  }
  return code;
}

module.exports = { generateUniqueCode };
