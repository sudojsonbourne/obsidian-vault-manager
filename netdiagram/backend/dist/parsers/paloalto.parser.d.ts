import { IParser, ParsedConfig } from './parser.interface';
export declare class PaloAltoParser implements IParser {
    canHandle(filename: string, content: Buffer): boolean;
    parse(filename: string, content: Buffer): Promise<ParsedConfig>;
    private _parseXml;
    private _parseEthernetEntry;
    private _parseUnitEntry;
    private _extractIps;
    private _parseJson;
    private _maskToPrefix;
}
