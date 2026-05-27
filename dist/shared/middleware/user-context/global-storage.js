"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalStorage = void 0;
class GlobalStorage {
    static userContext = {};
    static setUserContext(context) {
        this.userContext = context;
    }
    static getUserContext() {
        return this.userContext;
    }
}
exports.GlobalStorage = GlobalStorage;
//# sourceMappingURL=global-storage.js.map