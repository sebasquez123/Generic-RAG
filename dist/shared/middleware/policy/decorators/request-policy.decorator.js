"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestPolicy = exports.REQUEST_POLICY_REQUIRED = void 0;
const common_1 = require("@nestjs/common");
exports.REQUEST_POLICY_REQUIRED = 'REQUEST_POLICY_REQUIRED';
const RequestPolicy = () => (0, common_1.SetMetadata)(exports.REQUEST_POLICY_REQUIRED, true);
exports.RequestPolicy = RequestPolicy;
//# sourceMappingURL=request-policy.decorator.js.map