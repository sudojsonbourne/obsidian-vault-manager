"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const graph_service_1 = require("./graph.service");
const graph_controller_1 = require("./graph.controller");
const device_entity_1 = require("../entities/device.entity");
const interface_entity_1 = require("../entities/interface.entity");
const connection_entity_1 = require("../entities/connection.entity");
const flow_record_entity_1 = require("../entities/flow-record.entity");
const vlan_entity_1 = require("../entities/vlan.entity");
let GraphModule = class GraphModule {
};
exports.GraphModule = GraphModule;
exports.GraphModule = GraphModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                device_entity_1.DeviceEntity,
                interface_entity_1.InterfaceEntity,
                connection_entity_1.ConnectionEntity,
                flow_record_entity_1.FlowRecordEntity,
                vlan_entity_1.VlanEntity,
            ]),
        ],
        providers: [graph_service_1.GraphService],
        controllers: [graph_controller_1.GraphController],
        exports: [graph_service_1.GraphService],
    })
], GraphModule);
//# sourceMappingURL=graph.module.js.map