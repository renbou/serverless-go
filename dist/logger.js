"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Logger_instances, _Logger_namespace, _Logger_serverlessLog, _Logger_logMessage;
Object.defineProperty(exports, "__esModule", { value: true });
// Logger util class based on available serverless.cli.log in order to
// make logging more declarative and simple.
class Logger {
    constructor(namespace, serverlessLog) {
        _Logger_instances.add(this);
        _Logger_namespace.set(this, void 0);
        _Logger_serverlessLog.set(this, void 0);
        __classPrivateFieldSet(this, _Logger_namespace, namespace, "f");
        __classPrivateFieldSet(this, _Logger_serverlessLog, serverlessLog, "f");
    }
    error(message) {
        return __classPrivateFieldGet(this, _Logger_instances, "m", _Logger_logMessage).call(this, "error", message);
    }
    info(message) {
        return __classPrivateFieldGet(this, _Logger_instances, "m", _Logger_logMessage).call(this, "info", message);
    }
    debug(message) {
        return __classPrivateFieldGet(this, _Logger_instances, "m", _Logger_logMessage).call(this, "debug", message);
    }
}
_Logger_namespace = new WeakMap(), _Logger_serverlessLog = new WeakMap(), _Logger_instances = new WeakSet(), _Logger_logMessage = function _Logger_logMessage(level, message) {
    return __classPrivateFieldGet(this, _Logger_serverlessLog, "f").call(this, message, __classPrivateFieldGet(this, _Logger_namespace, "f"), Logger.logStyles[level]);
};
Logger.logStyles = {
    error: {
        bold: true,
        color: "red",
    },
    info: {},
    debug: {
        color: "white",
    },
};
exports.default = Logger;
