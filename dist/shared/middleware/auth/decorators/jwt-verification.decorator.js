"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtVerification = exports.JWT_VERIFICATION_REQUIRED = void 0;
const common_1 = require("@nestjs/common");
exports.JWT_VERIFICATION_REQUIRED = 'JWT_VERIFICATION_REQUIRED';
const JwtVerification = () => (0, common_1.SetMetadata)(exports.JWT_VERIFICATION_REQUIRED, true);
exports.JwtVerification = JwtVerification;
//# sourceMappingURL=jwt-verification.decorator.js.map