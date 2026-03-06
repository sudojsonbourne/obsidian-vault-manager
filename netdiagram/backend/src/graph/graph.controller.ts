import {
  Controller,
  Get,
  Post,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { GraphService, FilterCriteria } from './graph.service';

@Controller('graph')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  /**
   * GET /graph
   * Returns the full device graph (all nodes and edges).
   */
  @Get()
  async getFullGraph() {
    return this.graphService.getFullGraph();
  }

  /**
   * POST /graph/filter
   * Returns a filtered subgraph based on criteria.
   *
   * Body: FilterCriteria
   * {
   *   "interface": "GigabitEthernet0/0",   // optional: interface name substring
   *   "zone": "trust",                      // optional: zone name
   *   "ip": "192.168.1.5",                  // optional: exact IP involved in flows
   *   "protocol": "TCP",                    // optional: protocol
   *   "port": 443,                          // optional: port number
   *   "minOccurrences": 10,                 // optional: min flow count
   *   "showAllEdges": false                 // optional: show all edges between matched devices
   * }
   */
  @Post('filter')
  async getFilteredGraph(@Body() criteria: FilterCriteria) {
    return this.graphService.getFilteredGraph(criteria);
  }
}
