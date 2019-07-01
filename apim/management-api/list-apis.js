const ManagementApiScript = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered APIs by displaying their name and context path.
 * 
 * @author Aurelien Bourdon
 */
class ListApis extends ManagementApiScript {

    constructor() {
        super(
            'list-apis',
            {
                'filter-by-free-text': {
                    describe: "Filter APIs by a free text (full text search)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-group-name': {
                    describe: "Filter APIs against endpoint group name (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-name': {
                    describe: "Filter APIs against endpoint name (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-target': {
                    describe: "Filter APIs against endpoint target (regex)",
                    type: 'string'
                },
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => {
                    return this.hasDetailsFilters() ?
                        managementApi.listApisDetails({
                            byFreeText: this.argv['filter-by-free-text'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                            byEndpointName: this.argv['filter-by-endpoint-name'],
                            byEndpointTarget: this.argv['filter-by-endpoint-target'],
                        }) : managementApi.listApis({
                            byFreeText: this.argv['filter-by-free-text'],
                            byContextPath: this.argv['filter-by-context-path'],
                        }, NO_DELAY_PERIOD);
                }),
            )
            .subscribe(this.defaultSubscriber(
                api => this.displayRaw(util.format('%s (%s)', api.name, this.hasDetailsFilters() ? api.proxy.context_path : api.context_path))
            ));
    }

    hasDetailsFilters() {
        return this.argv['filter-by-endpoint-group-name'] || this.argv['filter-by-endpoint-name'] || this.argv['filter-by-endpoint-target'];
    }
}
new ListApis().run();