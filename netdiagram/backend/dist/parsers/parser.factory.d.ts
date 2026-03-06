import { ParsedConfig } from './parser.interface';
import { CiscoParser } from './cisco.parser';
import { JuniperParser } from './juniper.parser';
import { PaloAltoParser } from './paloalto.parser';
import { ExcelParser } from './excel.parser';
export declare class ParserFactory {
    private readonly ciscoParser;
    private readonly juniperParser;
    private readonly paloAltoParser;
    private readonly excelParser;
    private readonly parsers;
    constructor(ciscoParser: CiscoParser, juniperParser: JuniperParser, paloAltoParser: PaloAltoParser, excelParser: ExcelParser);
    parse(filename: string, content: Buffer): Promise<ParsedConfig>;
}
