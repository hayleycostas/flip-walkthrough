const DB = 'https://zanco-e2a3f-default-rtdb.firebaseio.com';

async function fbUpdate(path, data) {
  const secret = process.env.FIREBASE_DB_SECRET;
  const res = await fetch(`${DB}/${path}.json?auth=${secret}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase write failed: ${res.status}`);
}

function parseDollar(val) {
  if (!val || val === '-' || val === '–') return 0;
  return parseFloat(String(val).replace(/[$,\s]/g, '')) || 0;
}

// Parse a CSV line respecting quoted fields
function parseCSVLine(line) {
  const cells = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { cells.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cells.push(cur.trim());
  return cells;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { propId, sheetId, tabName } = body;
  if (!propId || !sheetId || !tabName) {
    return { statusCode: 400, body: 'Missing propId, sheetId, or tabName' };
  }

  // Fetch CSV export — no API key needed for publicly shared sheets
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const sheetsRes = await fetch(url, { redirect: 'follow' });

  if (!sheetsRes.ok) {
    return { statusCode: 502, body: `Could not fetch sheet (${sheetsRes.status}). Make sure it is shared as "Anyone with the link can view".` };
  }

  const csv = await sheetsRes.text();
  if (!csv || csv.includes('<!DOCTYPE')) {
    return { statusCode: 403, body: 'Sheet is not publicly accessible. Share it as "Anyone with the link can view".' };
  }

  const rows = csv.trim().split('\n').map(parseCSVLine);

  // Find the header row — the one that has "Category" and "Amount" columns
  let categoryCol = -1, amountCol = -1;
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].map(c => c.toLowerCase());
    const catIdx = r.findIndex(c => c.includes('category'));
    const amtIdx = r.findIndex(c => c.includes('amount'));
    if (catIdx !== -1 && amtIdx !== -1) {
      categoryCol = catIdx;
      amountCol = amtIdx;
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return { statusCode: 404, body: `Could not find header row with "Category" and "Amount" columns in tab "${tabName}".` };
  }

  // Sum amounts by category for all data rows after the header
  let materialsSpent = 0, laborSpent = 0, otherSpent = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const category = String(row[categoryCol] || '').trim().toLowerCase();
    const amount = parseDollar(row[amountCol]);
    if (category === 'materials') materialsSpent += amount;
    else if (category === 'labor') laborSpent += amount;
    else if (category === 'other') otherSpent += amount;
  }

  // Round to 2 decimal places
  materialsSpent = Math.round(materialsSpent * 100) / 100;
  laborSpent     = Math.round(laborSpent * 100) / 100;
  otherSpent     = Math.round(otherSpent * 100) / 100;

  await fbUpdate(`projects/${propId}/budget`, {
    materialsSpent,
    laborSpent,
    otherSpent,
    lastSync: Date.now(),
    sheetId,
    sheetTab: tabName,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ materialsSpent, laborSpent, otherSpent }),
  };
};
