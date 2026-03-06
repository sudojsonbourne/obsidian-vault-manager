import { IParser, ParsedConfig } from './parser.interface';
export declare class JuniperParser implements IParser {
    canHandle(filename: string, content: Buffer): boolean;
    private _looksLikeJunos;
    parse(filename: string, content: Buffer): Promise<ParsedConfig>;
    private _isSetStyle;
    private _parseSetStyle;
    private _parseHierarchical;
    private _tokenize;
    private _get;
    private _getBlock;
    private _ensureInterface;
    private _applyZones;
    private _normalizeSpeed;
}
