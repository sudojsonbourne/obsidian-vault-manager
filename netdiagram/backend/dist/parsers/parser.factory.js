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
exports.ParserFactory = void 0;
const common_1 = require("@nestjs/common");
const cisco_parser_1 = require("./cisco.parser");
const juniper_parser_1 = require("./juniper.parser");
const paloalto_parser_1 = require("./paloalto.parser");
const excel_parser_1 = require("./excel.parser");
let ParserFactory = class ParserFactory {
    constructor(ciscoParser, juniperParser, paloAltoParser, excelParser) {
        this.ciscoParser = ciscoParser;
        this.juniperParser = juniperParser;
        this.paloAltoParser = paloAltoParser;
        this.excelParser = excelParser;
        this.parsers = [
            this.paloAltoParser,
            this.excelParser,
            this.juniperParser,
            this.ciscoParser,
        ];
    }
    async parse(filename, content) {
        for (const parser of this.parsers) {
            if (parser.canHandle(filename, content)) {
                return parser.parse(filename, content);
            }
        }
        throw new Error(`No parser found for file "${filename}". ` +
            `Supported formats: ` +
            `Cisco (.txt, .cfg, .conf, .ios), ` +
            `Juniper JunOS (.junos, .juniper, .jnpr), ` +
            `Palo Alto (.xml, .json), ` +
            `Excel (.xlsx, .xls).`);
    }
};
exports.ParserFactory = ParserFactory;
exports.ParserFactory = ParserFactory = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cisco_parser_1.CiscoParser,
        juniper_parser_1.JuniperParser,
        paloalto_parser_1.PaloAltoParser,
        excel_parser_1.ExcelParser])
], ParserFactory);
//# sourceMappingURL=parser.factory.js.map