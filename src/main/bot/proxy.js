'use strict';
// Compatibility export; all transports share bounded DNS and cancellation.
const { ConnectionAttempt, resolveTarget } = require('./connection-transport');
function buildConnect(proxy, logger, target) {
  if (!proxy || !proxy.host || !target || !target.host) return null;
  const attempt = new ConnectionAttempt(target, proxy, logger);
  const connect = attempt.connect;
  connect.abort = () => attempt.abort();
  return connect;
}
module.exports = { buildConnect, resolveTarget };
