import { GraphService, FilterCriteria } from './graph.service';
export declare class GraphController {
    private readonly graphService;
    constructor(graphService: GraphService);
    getFullGraph(): Promise<import("./graph.service").GraphData>;
    getFilteredGraph(criteria: FilterCriteria): Promise<import("./graph.service").GraphData>;
}
