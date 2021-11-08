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
var _Validator_service, _Validator_logger;
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("./constants");
// Validator makes validating serverless config easier
class Validator {
    constructor(service, logger) {
        _Validator_service.set(this, void 0);
        _Validator_logger.set(this, void 0);
        __classPrivateFieldSet(this, _Validator_service, service, "f");
        __classPrivateFieldSet(this, _Validator_logger, logger, "f");
    }
    validateFunction(functionName) {
        const slsFunction = __classPrivateFieldGet(this, _Validator_service, "f").getFunction(functionName);
        const runtime = slsFunction.runtime || __classPrivateFieldGet(this, _Validator_service, "f").provider.runtime;
        // Skip non-go runtimes
        if (runtime !== constants_1.GO_RUNTIME) {
            return null;
        }
        // Make sure we have a valid handler-function definition
        if (!Object.prototype.hasOwnProperty.call(slsFunction, "handler")) {
            __classPrivateFieldGet(this, _Validator_logger, "f").error(`Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`);
            return null;
        }
        if ([slsFunction.package?.exclude, slsFunction.package?.include].some(Boolean)) {
            __classPrivateFieldGet(this, _Validator_logger, "f").error(`${functionName} package references exclude or include, which are deprecated`);
        }
        return slsFunction;
    }
}
_Validator_service = new WeakMap(), _Validator_logger = new WeakMap();
exports.default = Validator;
