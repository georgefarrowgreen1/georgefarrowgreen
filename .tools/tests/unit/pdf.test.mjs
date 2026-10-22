// The account's PDF writer (account/pdf.js): text as Windows Latin 1 or not at all, Helvetica's widths, wrapping, and a
// file whose every object is where its cross-reference table says
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ansi, PDF, Flow } from '../../../account/pdf.js';

const latin1 = (buf) => Buffer.from(buf).toString('latin1');
// a JPEG's start and frame header (2 high, 3 wide, 3 colours): enough for its size to be read
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9]);

test('text Helvetica can show, as Windows Latin 1; text it can\'t, as null', () => {
  assert.deepEqual(ansi('Hi (1)'), [72, 105, 32, 40, 49, 41]);
  assert.deepEqual(ansi('Kraków café'), [75, 114, 97, 107, 0xf3, 119, 32, 99, 97, 102, 0xe9]);
  assert.deepEqual(ansi('€ – — ’ “ ” • …'), [0x80, 32, 0x96, 32, 0x97, 32, 0x92, 32, 0x93, 32, 0x94, 32, 0x95, 32, 0x85]);
  assert.deepEqual(ansi('22 30 a b'), ansi('22 30 a b'), 'thin and narrow spaces as spaces');
  assert.equal(ansi('Łódź'), null);
  assert.equal(ansi('東京'), null);
  assert.equal(ansi('Rowan 🐦'), null);
});

test('widths: Helvetica\'s own, and bold\'s', () => {
  const pdf = new PDF();
  assert.equal(pdf.measure('Hello', 10).toFixed(2), '22.78');            // H 722, e 556, l 222, l 222, o 556
  assert.equal(pdf.measure('Hello', 10, true).toFixed(2), '24.45');      // H 722, e 556, l 278, l 278, o 611
  assert.equal(pdf.measure('AB', 10, false, 1).toFixed(2), '15.34');     // and letter spacing after each
  // (text it can't show, measured by what will draw it)
  assert.equal(new PDF({ raster: { measure: () => 42 } }).measure('Łódź', 10), 42);
});

test('a paragraph wraps to its width, and runs on to a new page', () => {
  const pdf = new PDF(), f = new Flow(pdf);
  const lines = f.lines('the quick brown fox jumps over the lazy dog', 60, 10);
  assert.ok(lines.length > 2 && lines.every((l) => pdf.measure(l, 10) <= 60), lines.join('|'));
  assert.equal(lines.join(' '), 'the quick brown fox jumps over the lazy dog');
  assert.ok(f.lines('Supercalifragilisticexpialidocious', 40, 10).every((l) => pdf.measure(l, 10) <= 40), 'a word too long broken where it must');
  for (let i = 0; i < 80; i++) f.para('A line of text.');
  assert.ok(pdf.pages.length >= 2, 'more than a page of lines: a second page');
});

test('the file: every object where the table says, the pages counted, text escaped, pictures in', async () => {
  const pdf = new PDF({ title: 'Your data · Łukasz', author: 'Rowan (@rowan)' });
  const p1 = pdf.page(), p2 = pdf.page(), im = pdf.jpeg(JPEG);
  assert.deepEqual([im.w, im.h, im.comps], [3, 2, 3], 'the JPEG\'s size from its frame header');
  pdf.text(p1, 50, 60, 'a (b) c\\ é', { size: 12, bold: true, color: '#2f6be8' });
  pdf.text(p1, 50, 80, 'Łódź');                                         // (no way to draw it: "?" where it can't show)
  pdf.rect(p1, 40, 100, 200, 50, { fill: '#f2f5fc', r: 12 });
  pdf.line(p2, 40, 40, 300, 40, { color: '#e2e6f0' });
  pdf.draw(p2, im, 50, 60, 64, 64, { r: 32 });
  const out = await pdf.build(new Date('2026-10-22T21:30:00Z')), s = latin1(out);
  assert.ok(s.startsWith('%PDF-1.7\n'));
  assert.ok(s.endsWith('%%EOF\n'));
  const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)[1]);
  assert.equal(s.slice(xref, xref + 4), 'xref', 'startxref points at the table');
  const [, n] = /xref\n0 (\d+)\n/.exec(s.slice(xref));
  const offsets = s.slice(xref).split('\n').slice(3, 2 + Number(n)).map((l) => Number(l.slice(0, 10)));
  offsets.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} where the table says`));
  assert.match(s, /\/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R\] \/Count 2/);
  assert.match(s, /\/Title <FEFF0059006F0075007200200064006100740061002000B700200141[0-9A-F]*>/, 'the title as UTF-16 (Ł and all)');
  assert.match(s, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(s, /\/Subtype \/Image \/Width 3 \/Height 2 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode/);
  assert.match(s, /\/CreationDate \(D:20261022213000Z\)/);
  // (the pages' contents, deflated: inflated here to look inside)
  const { inflateSync } = await import('node:zlib');
  const streams = [...s.matchAll(/\/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/g)].map((m) => inflateSync(Buffer.from(out.subarray(m.index + m[0].length, m.index + m[0].length + Number(m[1])))).toString('latin1'));
  const all = streams.join('\n');
  assert.ok(all.includes('/F2 12 Tf 0.18 0.42 0.91 rg 1 0 0 1 50 781.89 Tm (a \\(b\\) c\\\\ \\351) Tj'), 'bold, blue, on its baseline, escaped');
  assert.ok(all.includes('(?\\363d?) Tj'), 'what Helvetica can\'t show, as "?" when there\'s nothing to draw it');
  assert.ok(/ c h f/.test(all), 'a rounded rectangle, filled');
  const spaced = new PDF(), sp = spaced.page();
  spaced.text(sp, 0, 10, 'LABEL', { spacing: 1 }); spaced.text(sp, 0, 20, 'next'); spaced.text(sp, 0, 30, 'and next');
  assert.deepEqual(sp.ops.map((o) => / Tc /.exec(o) && /([\d.]+) Tc/.exec(o)[1]), ['1', '0', null], 'letter spacing set back for the text after');
  assert.ok(/W n 64 0 0 64 50 717.89 cm \/Im1 Do Q/.test(all), 'the picture, clipped round, in its box');
});

test('text it can\'t show, drawn as a picture of itself when it can be', async () => {
  const raster = { measure: () => 30, draw: () => ({ rgb: new Uint8Array(2 * 2 * 3).fill(200), w: 2, h: 2, width: 30, height: 13, ascent: 10 }) };
  const pdf = new PDF({ raster }), p = pdf.page();
  pdf.text(p, 50, 60, 'Łódź', { size: 10 });
  assert.equal(pdf.images.length, 1);
  assert.match(p.ops.join('\n'), /30 0 0 13 50 778\.89 cm \/Im1 Do Q/);
  const s = latin1(await pdf.build());
  assert.match(s, /\/Subtype \/Image \/Width 2 \/Height 2 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode/);
});
