/**
 * 批量地理编码脚本
 * 为已有人脉补全 lat/lng 坐标
 * 用法: node server/geocode-migration.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const TMAP_KEY = 'BFBBZ-CNXC4-XEWUR-KQN7R-QOUGJ-Q4B66';
const DELAY_MS = 220; // 控制在 5次/秒 限流内

const db = new Database(path.join(__dirname, 'data.db'));

async function geocode(address) {
  const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(address)}&key=${TMAP_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 0 && data.result?.location) {
      return { lat: data.result.location.lat, lng: data.result.location.lng };
    }
  } catch (e) {
    console.error(`  编码失败: ${e.message}`);
  }
  return null;
}

async function main() {
  // 查询需要编码的记录：lat 为空 且 有 city 或 address
  const rows = db.prepare(`
    SELECT id, name, city, address FROM persons
    WHERE lat IS NULL AND (
      (city IS NOT NULL AND city != '') OR
      (address IS NOT NULL AND address != '')
    )
  `).all();

  console.log(`找到 ${rows.length} 条需要编码的记录\n`);

  const update = db.prepare('UPDATE persons SET lat=?, lng=? WHERE id=?');
  let success = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const firstCity = (r.city || '').split(',')[0].trim();
    const fullAddress = (firstCity + (r.address || '')).trim();

    if (!fullAddress) {
      console.log(`[${i + 1}/${rows.length}] ${r.name} - 无地址信息，跳过`);
      fail++;
      continue;
    }

    const result = await geocode(fullAddress);
    if (result) {
      update.run(result.lat, result.lng, r.id);
      console.log(`[${i + 1}/${rows.length}] ${r.name} (${fullAddress}) -> (${result.lat}, ${result.lng})`);
      success++;
    } else {
      console.log(`[${i + 1}/${rows.length}] ${r.name} (${fullAddress}) -> 编码失败`);
      fail++;
    }

    // 限流延迟
    if (i < rows.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n完成！成功: ${success}, 失败: ${fail}`);
  db.close();
}

main();
