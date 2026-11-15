const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host: 'localhost', port: 3306, user: 'root', password: 'Laboratori0', database: 'hyrox_db' });
  const [d] = await c.query('SELECT categoria, categoria_id, COUNT(*) n FROM participantes GROUP BY categoria, categoria_id ORDER BY n DESC LIMIT 20');
  console.log('PART_CATS:', JSON.stringify(d));
  const [n] = await c.query('SELECT COUNT(*) n FROM participantes');
  console.log('TOTAL_PARTS:', JSON.stringify(n));
  const [ref] = await c.query('SELECT categoria_id, COUNT(*) n FROM participantes WHERE categoria_id IS NOT NULL GROUP BY categoria_id ORDER BY n DESC LIMIT 10');
  console.log('REFS_CAT_ID:', JSON.stringify(ref));
  const [h] = await c.query('SELECT categoria_id, COUNT(*) n FROM heats GROUP BY categoria_id');
  console.log('HEATS_REFS:', JSON.stringify(h));
  const [cc] = await c.query('SELECT categoria_id, COUNT(*) n FROM competencia_categorias GROUP BY categoria_id LIMIT 10');
  console.log('COMPCAT_REFS:', JSON.stringify(cc));
  await c.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
