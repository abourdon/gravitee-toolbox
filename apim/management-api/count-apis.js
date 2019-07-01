const ManagementApiScript = require('./lib/management-api-script');
const { count, flatMap } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered APIs by displaying their name and context path.
 * 
 * @author Aurelien Bourdon
 */
class CountApis extends ManagementApiScript {

    constructor() {
        super(
            'count-apis',
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
                count()
            )
            .subscribe(this.defaultSubscriber(
                apiCount => this.displayRaw(util.format('There are %s APIs in the requested environment according to the given search predicate', apiCount))
            ));
    }

    hasDetailsFilters() {
        return this.argv['filter-by-endpoint-group-name'] || this.argv['filter-by-endpoint-name'] || this.argv['filter-by-endpoint-target'];
    }
}
new CountApis().run();