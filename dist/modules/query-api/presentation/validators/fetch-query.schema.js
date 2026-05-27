"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchQuerySchema = void 0;
const zod_1 = require("zod");
exports.fetchQuerySchema = zod_1.z.object({
    question: zod_1.z.string().trim().min(1),
    contextLimit: zod_1.z.number().int().min(1).max(10).optional(),
});
//# sourceMappingURL=fetch-query.schema.js.map