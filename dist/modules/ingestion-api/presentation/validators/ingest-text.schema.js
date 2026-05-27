"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestTextSchema = void 0;
const zod_1 = require("zod");
exports.ingestTextSchema = zod_1.z.object({
    source: zod_1.z.string().trim().min(1),
    content: zod_1.z.string().trim().min(1),
});
//# sourceMappingURL=ingest-text.schema.js.map