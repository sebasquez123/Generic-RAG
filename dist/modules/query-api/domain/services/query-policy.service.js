"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryPolicyService = void 0;
const semantic_query_entity_1 = require("../entities/semantic-query.entity");
class QueryPolicyService {
    normalize(question, contextLimit = 5) {
        return new semantic_query_entity_1.SemanticQuery(question.trim(), Math.max(1, Math.min(contextLimit, 10)));
    }
}
exports.QueryPolicyService = QueryPolicyService;
//# sourceMappingURL=query-policy.service.js.map