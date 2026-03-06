import { IParser, ParsedConfig } from './parser.interface';
export declare class CiscoParser implements IParser {
    canHandle(filename: string, _content: Buffer): boolean;
    private _looksLikeXml;
    parse(_filename: string, content: Buffer): Promise<ParsedConfig>;
    private _maskToPrefix;
    private _maskToCidr;
    private _popcount;
}
