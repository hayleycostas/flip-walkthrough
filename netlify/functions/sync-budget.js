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

  // Use Google's public CSV export — no API key needed for publicly shared sheets
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const sheetsRes = await fetch(url, { redirect: 'follow' });

  if (!sheetsRes.ok) {
    return { statusCode: 502, body: `Could not fetch sheet (${sheetsRes.status}). Make sure it is shared as "Anyone with the link can view".` };
  }

  const csv = await sheetsRes.text();
  if (!csv || csv.includes('<!DOCTYPE')) {
    return { statusCode: 403, body: 'Sheet is not publicly accessible. Share it as "Anyone with the link can view".' };
  }

  // Parse CSV rows
  const rows = csv.trim().split('\n').map(line =>
    line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '').trim())
  );

  // Find the TOTAL row
  const totalRow = rows.find(r => String(r[0] || '').trim().toUpperCase() === 'TOTAL');
  if (!totalRow) {
    return { statusCode: 404, body: `No TOTAL row found in tab "${tabName}". Rows seen: ${rows.slice(0,5).map(r=>r[0]).join(', ')}` };
  }

  // Column layout: A=Payment Method, B=Materials, C=Labor, D=Other, E=Closing Cost
  const materialsSpent = parseDollar(totalRow[1]);
  const laborSpent     = parseDollar(totalRow[2]);
  const otherSpent     = parseDollar(totalRow[3]);
  const closingCost    = parseDollar(totalRow[4]);

  await fbUpdate(`projects/${propId}/budget`, {
    materialsSpent,
    laborSpent,
    otherSpent,
    closingCost,
    lastSync: Date.now(),
    sheetId,
    sheetTab: tabName,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ materialsSpent, laborSpent, otherSpent, closingCost }),
  };
};
