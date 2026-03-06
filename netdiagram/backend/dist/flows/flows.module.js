"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const flows_service_1 = require("./flows.service");
const flow_record_entity_1 = require("../entities/flow-record.entity");
const interface_entity_1 = require("../entities/interface.entity");
let FlowsModule = class FlowsModule {
};
exports.FlowsModule = FlowsModule;
exports.FlowsModule = FlowsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([flow_record_entity_1.FlowRecordEntity, interface_entity_1.InterfaceEntity])],
        providers: [flows_service_1.FlowsService],
        exports: [flows_service_1.FlowsService],
    })
], FlowsModule);
//# sourceMappingURL=flows.module.js.map