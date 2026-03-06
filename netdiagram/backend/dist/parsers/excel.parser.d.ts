import { IParser, ParsedConfig } from './parser.interface';
export declare class ExcelParser implements IParser {
    canHandle(filename: string, _content: Buffer): boolean;
    parse(_filename: string, content: Buffer): Promise<ParsedConfig>;
    private _getHeaders;
    private _cellValue;
    private _tryParseJson;
}
