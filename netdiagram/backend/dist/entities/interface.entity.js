"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterfaceEntity = void 0;
const typeorm_1 = require("typeorm");
const device_entity_1 = require("./device.entity");
let InterfaceEntity = class InterfaceEntity {
};
exports.InterfaceEntity = InterfaceEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], InterfaceEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], InterfaceEntity.prototype, "deviceId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => device_entity_1.DeviceEntity, (device) => device.interfaces, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'deviceId' }),
    __metadata("design:type", device_entity_1.DeviceEntity)
], InterfaceEntity.prototype, "device", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], InterfaceEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-array', nullable: true }),
    __metadata("design:type", Array)
], InterfaceEntity.prototype, "ips", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], InterfaceEntity.prototype, "speed", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], InterfaceEntity.prototype, "vlan", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], InterfaceEntity.prototype, "zone", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], InterfaceEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: '{}' }),
    __metadata("design:type", Object)
], InterfaceEntity.prototype, "properties", void 0);
exports.InterfaceEntity = InterfaceEntity = __decorate([
    (0, typeorm_1.Entity)('interfaces')
], InterfaceEntity);
//# sourceMappingURL=interface.entity.js.map