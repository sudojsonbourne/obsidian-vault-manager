import { Injectable } from '@nestjs/common';
import { IParser, ParsedConfig } from './parser.interface';
import { CiscoParser } from './cisco.parser';
import { JuniperParser } from './juniper.parser';
import { PaloAltoParser } from './paloalto.parser';
import { ExcelParser } from './excel.parser';

/**
 * ParserFactory selects the appropriate parser for a given file and delegates parsing.
 * Parsers are tried in priority order: XML/Excel before Juniper before Cisco text.
 */
@Injectable()
export class ParserFactory {
  private readonly parsers: IParser[];

  constructor(
    private readonly ciscoParser: CiscoParser,
    private readonly juniperParser: JuniperParser,
    private readonly paloAltoParser: PaloAltoParser,
    private readonly excelParser: ExcelParser,
  ) {
    // Priority order matters:
    //  1. PaloAlto (XML/JSON) — most specific extension
    //  2. Excel (.xlsx/.xls)
    //  3. Juniper (.junos/.juniper/.jnpr or JunOS-flavored .txt/.cfg)
    //  4. Cisco — catch-all for remaining .txt/.cfg/.conf/.ios
    this.parsers = [
      this.paloAltoParser,
      this.excelParser,
      this.juniperParser,
      this.ciscoParser,
    ];
  }

  /**
   * Find the right parser and return the parsed config.
   * Throws if no parser can handle the file.
   */
  async parse(filename: string, content: Buffer): Promise<ParsedConfig> {
    for (const parser of this.parsers) {
      if (parser.canHandle(filename, content)) {
        return parser.parse(filename, content);
      }
    }
    throw new Error(
      `No parser found for file "${filename}". ` +
        `Supported formats: ` +
        `Cisco (.txt, .cfg, .conf, .ios), ` +
        `Juniper JunOS (.junos, .juniper, .jnpr), ` +
        `Palo Alto (.xml, .json), ` +
        `Excel (.xlsx, .xls).`,
    );
  }
}
