const ManagementApiScript = require('./lib/management-api-script');
const Rx = require('rxjs');
const { flatMap, map, reduce } = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

/**
 * Enable (or disable) API endpoints based on user predicate
 * 
 * @author Aurelien Bourdon
 */
class EnableEndpoints extends ManagementApiScript {

    constructor() {
        super(
            'enable-endpoints',
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
                'action': {
                    describe: 'The desired action',
                    choices: ['enable', 'disable'],
                    demandOption: true
                }
            }
        );
    }

    definition(managementApi) {
        // First select endpoints and then ask for confirmation and finally update selected endpoints
        // All is done in chain, by applying first the endpoints selection
        this.selectEndpoints(managementApi);
    }

    /**
     * First step of the script definition: select endpoints according to user predicate
     * 
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    selectEndpoints(managementApi) {
        managementApi
            // Login with credentials
            .login(this.argv['username'], this.argv['password'])

            .pipe(
                // Filter APIs according to given filters
                flatMap(_token => managementApi.listApis({
                    byFreeText: this.argv['filter-by-free-text'],
                    byContextPath: this.argv['filter-by-context-path'],
                    byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                    byEndpointName: this.argv['filter-by-endpoint-name'],
                    byEndpointTarget: this.argv['filter-by-endpoint-target'],
                })),

                // Retrieve matching endpoint groups
                flatMap(api => {
                    if (!api.proxy.groups) {
                        return Rx.empty();
                    }
                    const filteredEndpointGroups = api.proxy.groups.filter(group => !this.argv['filter-by-endpoint-group-name'] || group.name.search(this.argv['filter-by-endpoint-group-name']) != -1)
                    return Rx
                        .from(filteredEndpointGroups)
                        .pipe(
                            map(filteredEndpointGroup => {
                                return {
                                    api: api,
                                    filteredEndpointGroup: filteredEndpointGroup
                                }
                            })
                        );
                }),

                // Retrieve matching endpoints
                flatMap(apiAndFilteredEndpointGroup => {
                    if (!apiAndFilteredEndpointGroup.filteredEndpointGroup.endpoints) {
                        return Rx.empty();
                    }
                    const filteredEndpoints = apiAndFilteredEndpointGroup.filteredEndpointGroup.endpoints.filter(endpoint => {
                        const checkByEndpointName = !this.argv['filter-by-endpoint-name'] || endpoint.name.search(this.argv['filter-by-endpoint-name']) !== -1;
                        const checkByEndpointTarget = !this.argv['filter-by-endpoint-target'] || endpoint.target.search(this.argv['filter-by-endpoint-target']) !== -1;
                        return checkByEndpointName && checkByEndpointTarget;
                    });
                    return Rx
                        .from(filteredEndpoints)
                        .pipe(
                            map(filteredEndpoint => {
                                return {
                                    api: apiAndFilteredEndpointGroup.api,
                                    filteredGroup: apiAndFilteredEndpointGroup.filteredEndpointGroup,
                                    filteredEndpoint: filteredEndpoint
                                }
                            })
                        );
                }),

                // Reduce all result items into a only one
                reduce(
                    (acc, apiAndFilteredEndpoint) => acc.concat([apiAndFilteredEndpoint]),
                    []
                )
            )

            // Then ask for confirmation
            .subscribe(
                apisAndfilteredEndpoints => {
                    if (!apisAndfilteredEndpoints || apisAndfilteredEndpoints.length === 0) {
                        this.displayRaw('No match found.');
                        this.displayInfo('Done.')
                        return;
                    }
                    this.askForConfirmation(apisAndfilteredEndpoints, managementApi);
                },
                this.handleError.bind(this),
                _complete => { }
            );
    }

    /**
     * Second step of the script definition: ask for user confirmation regarding on selected endpoints
     * 
     * @param {object} apisAndfilteredEndpoints the list of selected endpoints with their associated APIs
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    askForConfirmation(apisAndfilteredEndpoints, managementApi) {
        var question = apisAndfilteredEndpoints.reduce(
            (acc, apiAndFilteredEndpoint) =>
                acc + util.format(
                    "\t- '%s' (API '%s', endpoint group '%s', target '%s')\n",
                    apiAndFilteredEndpoint.filteredEndpoint.name,
                    apiAndFilteredEndpoint.api.name,
                    apiAndFilteredEndpoint.filteredGroup.name,
                    apiAndFilteredEndpoint.filteredEndpoint.target
                ),
            "The following endpoints match with predicate:\n"
        );
        question += util.format('These endpoints will be %sd. Continue? (y/n) ', this.argv['action']);
        const ask = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        ask.question(question, answer => {
            // Close user interface
            ask.close();

            // If user cancels, then abort and exit
            if (answer !== 'y') {
                this.displayRaw('Aborted.');
                this.displayInfo('Done.')
                return;
            }

            // Else, apply update on filtered endpoints
            this.enableOrDisableEndpoints(apisAndfilteredEndpoints, managementApi);
        });
    }

    /**
     * Last step of the script definition: apply update on selected endpoints to enable or disable them
     * 
     * @param {object} apisAndfilteredEndpoints the list of selected endpoints with their associated APIs
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    enableOrDisableEndpoints(apisAndFilteredEndpoints, managementApi) {
        Rx
            .from(apisAndFilteredEndpoints)
            .pipe(
                // Enable/disable endpoint
                map(apiAndFilteredEndpoint => {
                    apiAndFilteredEndpoint.filteredEndpoint.backup = this.argv['action'] === 'disable'
                    return apiAndFilteredEndpoint;
                }),

                // Finally update API with new endpoint definition
                flatMap(apiAndFilteredEndpoint => managementApi
                    .update(apiAndFilteredEndpoint.api, apiAndFilteredEndpoint.api.id)
                    .pipe(
                        map(() => apiAndFilteredEndpoint)
                    )
                )
            )
            .subscribe(this.defaultSubscriber(apiAndFilteredEndpoint => this.displayRaw(
                util.format("Operation done for endpoint '%s' (API '%s', endpoint group '%s', target '%s').",
                    apiAndFilteredEndpoint.filteredEndpoint.name,
                    apiAndFilteredEndpoint.api.name,
                    apiAndFilteredEndpoint.filteredGroup.name,
                    apiAndFilteredEndpoint.filteredEndpoint.target
                )
            )));
    }

}
new EnableEndpoints().run();