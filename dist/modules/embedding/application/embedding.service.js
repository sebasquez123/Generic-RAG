"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
let EmbeddingService = class EmbeddingService {
    embed(input) {
        const normalized = input.trim().toLowerCase();
        const vector = Array.from({ length: 8 }, () => 0);
        for (let index = 0; index < normalized.length; index += 1) {
            const bucket = index % vector.length;
            vector[bucket] += normalized.charCodeAt(index) / 255;
        }
        return this.normalize(vector);
    }
    normalize(vector) {
        const magnitude = Math.hypot(...vector) || 1;
        return vector.map((value) => Number((value / magnitude).toFixed(6)));
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = __decorate([
    (0, common_1.Injectable)()
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map