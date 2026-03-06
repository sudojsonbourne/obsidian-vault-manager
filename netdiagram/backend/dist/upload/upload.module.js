"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadModule = void 0;
const common_1 = require("@nestjs/common");
const upload_controller_1 = require("./upload.controller");
const upload_service_1 = require("./upload.service");
const graph_module_1 = require("../graph/graph.module");
const flows_module_1 = require("../flows/flows.module");
const jobs_module_1 = require("../jobs/jobs.module");
const cisco_parser_1 = require("../parsers/cisco.parser");
const juniper_parser_1 = require("../parsers/juniper.parser");
const paloalto_parser_1 = require("../parsers/paloalto.parser");
const excel_parser_1 = require("../parsers/excel.parser");
const parser_factory_1 = require("../parsers/parser.factory");
let UploadModule = class UploadModule {
};
exports.UploadModule = UploadModule;
exports.UploadModule = UploadModule = __decorate([
    (0, common_1.Module)({
        imports: [graph_module_1.GraphModule, flows_module_1.FlowsModule, jobs_module_1.JobsModule],
        controllers: [upload_controller_1.UploadController],
        providers: [
            upload_service_1.UploadService,
            cisco_parser_1.CiscoParser,
            juniper_parser_1.JuniperParser,
            paloalto_parser_1.PaloAltoParser,
            excel_parser_1.ExcelParser,
            parser_factory_1.ParserFactory,
        ],
    })
], UploadModule);
//# sourceMappingURL=upload.module.js.map