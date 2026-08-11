const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');

/**
 * rows: [{ name, correct, total, percent }] - foiz bo'yicha kamayish tartibida
 * Natija: Buffer (PDF fayl)
 */
function buildReportPdf({ topicName, code, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = new PassThrough();
    const chunks = [];

    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);

    doc.fontSize(18).text('Savol-javob hisoboti', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Mavzu: ${topicName}`);
    doc.text(`Kod: ${code}`);
    doc.text(`Sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    doc.moveDown();

    const tableTop = doc.y;
    const col = { num: 40, name: 80, score: 330, percent: 420 };

    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('#', col.num, tableTop);
    doc.text("Ism", col.name, tableTop);
    doc.text('Natija', col.score, tableTop);
    doc.text('Foiz', col.percent, tableTop);
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
    doc.font('Helvetica');

    let y = doc.y + 5;
    rows.forEach((r, i) => {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      doc.fontSize(11);
      doc.text(String(i + 1), col.num, y);
      doc.text(r.name, col.name, y, { width: 240 });
      doc.text(`${r.correct}/${r.total}`, col.score, y);
      doc.text(`${r.percent}%`, col.percent, y);
      y += 20;
    });

    if (rows.length === 0) {
      doc.text("Hozircha hech kim ushbu kod bilan test topshirmagan.", 40, y);
    }

    doc.end();
  });
}

module.exports = { buildReportPdf };
