const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const webDir = path.join(rootDir, 'web');
const databaseDir = path.join(rootDir, 'backend', 'database');

module.exports = {
  port: Number(process.env.GARPERLUX_PORT || 3000),
  rootDir,
  webDir,
  databaseDir,
  databaseFile: process.env.GARPERLUX_DB || path.join(databaseDir, 'garperlux.sqlite'),
  sessionTtlHours: 12,
};
