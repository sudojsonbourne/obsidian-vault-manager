/**
 * Normalized interface/device data structures produced by all parsers.
 * These are technology-agnostic and map directly to TypeORM entities.
 */

export interface ParsedInterface {
  name: string;
  ips: string[]; // CIDR strings
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

/** All parsers must implement this interface */
export interface IParser {
  /** Returns true if this parser can handle the given file (by extension/content) */
  canHandle(filename: string, content: Buffer): boolean;
  /** Parse content and return normalized config */
  parse(filename: string, content: Buffer): Promise<ParsedConfig>;
}
