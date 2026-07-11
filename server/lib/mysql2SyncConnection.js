const path = require('path');
const rpc = require('sync-rpc');

class Mysql2SyncConnection {
  constructor(config) {
    this.client = rpc(path.join(__dirname, 'mysql2SyncWorker.js'), {
      ...config,
      namedPlaceholders: false,
      multipleStatements: false,
      dateStrings: true,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
  }

  query(sql, params = []) {
    return this.client({ type: 'query', sql, params });
  }

  dispose() {
    return this.client({ type: 'dispose' });
  }
}

module.exports = Mysql2SyncConnection;
