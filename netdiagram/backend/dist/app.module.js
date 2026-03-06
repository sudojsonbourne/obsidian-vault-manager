"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const upload_module_1 = require("./upload/upload.module");
const graph_module_1 = require("./graph/graph.module");
const flows_module_1 = require("./flows/flows.module");
const jobs_module_1 = require("./jobs/jobs.module");
const device_entity_1 = require("./entities/device.entity");
const interface_entity_1 = require("./entities/interface.entity");
const connection_entity_1 = require("./entities/connection.entity");
const flow_record_entity_1 = require("./entities/flow-record.entity");
const vlan_entity_1 = require("./entities/vlan.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot({
                type: 'postgres',
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432', 10),
                username: process.env.DB_USERNAME || 'postgres',
                password: process.env.DB_PASSWORD || 'postgres',
                database: process.env.DB_DATABASE || 'netdiagram',
                entities: [
                    device_entity_1.DeviceEntity,
                    interface_entity_1.InterfaceEntity,
                    connection_entity_1.ConnectionEntity,
                    flow_record_entity_1.FlowRecordEntity,
                    vlan_entity_1.VlanEntity,
                ],
                synchronize: true,
                logging: process.env.NODE_ENV === 'development',
            }),
            upload_module_1.UploadModule,
            graph_module_1.GraphModule,
            flows_module_1.FlowsModule,
            jobs_module_1.JobsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map