const mysql = require('mysql2/promise');
const { normalizeMysqlTimezone } = require('./businessTime');

function normalizeResult(value) {
  if (Array.isArray(value)) return value.map(row => ({ ...row }));
  if (value && typeof value === 'object') {
    return {
      affectedRows: value.affectedRows || 0,
      insertId: value.insertId || 0,
      changedRows: value.changedRows || 0,
      warningStatus: value.warningStatus || 0,
    };
  }
  return value;
}

function init(config) {
  let connectionPromise = null;
  const getConnection = () => {
    if (!connectionPromise) {
      const timezone = normalizeMysqlTimezone(config.timezone);
      connectionPromise = mysql.createConnection({ ...config, timezone }).then(async connection => {
        await connection.query('SET time_zone = ?', [timezone]);
        return connection;
      });
    }
    return connectionPromise;
  };

  return async function handle(message) {
    switch (message.type) {
      case 'dispose':
        if (connectionPromise) {
          const connection = await connectionPromise;
          await connection.end();
          connectionPromise = null;
        }
        return null;
      case 'query': {
        const connection = await getConnection();
        const [result] = await connection.query(message.sql, message.params || []);
        return normalizeResult(result);
      }
      default:
        throw new Error(`Unsupported mysql2 sync message: ${message.type}`);
    }
  };
}

module.exports = init;
