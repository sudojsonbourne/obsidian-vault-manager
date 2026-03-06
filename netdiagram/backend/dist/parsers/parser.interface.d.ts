export interface ParsedInterface {
    name: string;
    ips: string[];
    speed?: string;
    vlan?: number;
    zone?: string;
    description?: string;
    properties?: Record<string, any>;
}
export interface ParsedDevice {
    hostname: string;
    vendor: string;
    model?: string;
    interfaces: ParsedInterface[];
    properties?: Record<string, any>;
}
export interface ParsedConnection {
    sourceHostname: string;
    sourceInterface?: string;
    targetHostname: string;
    targetInterface?: string;
    vlan?: number;
    speed?: string;
}
export interface ParsedVlan {
    id: number;
    name?: string;
    subnet?: string;
}
export interface ParsedConfig {
    devices: ParsedDevice[];
    connections: ParsedConnection[];
    vlans: ParsedVlan[];
}
export interface IParser {
    canHandle(filename: string, content: Buffer): boolean;
    parse(filename: string, content: Buffer): Promise<ParsedConfig>;
}
