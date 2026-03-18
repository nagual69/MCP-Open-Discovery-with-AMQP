"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setManagedTransports = setManagedTransports;
exports.getManagedTransports = getManagedTransports;
exports.clearManagedTransports = clearManagedTransports;
let managedTransports = null;
function setManagedTransports(transports) {
    managedTransports = transports;
}
function getManagedTransports() {
    return managedTransports;
}
function clearManagedTransports() {
    managedTransports = null;
}
//# sourceMappingURL=transport-state.js.map