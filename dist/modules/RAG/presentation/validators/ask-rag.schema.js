"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askRagSchema = void 0;
const zod_1 = require("zod");
exports.askRagSchema = zod_1.z.object({
    question: zod_1.z.string().trim().min(1, 'question is required'),
    contextLimit: zod_1.z.number().int().min(1).max(10).optional(),
});
//# sourceMappingURL=ask-rag.schema.js.map