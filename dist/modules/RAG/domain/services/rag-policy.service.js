"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagPolicyService = void 0;
const rag_query_entity_1 = require("../entities/rag-query.entity");
class RagPolicyService {
    normalizeQuery(question, contextLimit = 5) {
        return new rag_query_entity_1.RagQuery(question.trim(), Math.max(1, Math.min(contextLimit, 10)));
    }
}
exports.RagPolicyService = RagPolicyService;
//# sourceMappingURL=rag-policy.service.js.map