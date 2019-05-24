const ManagementApi = require('./lib/management-api-script');
const Rx = require('rxjs');
const { filter, flatMap, map, reduce } = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

/**
 * Enable (or disable) API endpoints based on user predicate
 * 
 * @author Aurelien Bourdon
 */
class EnableEndpoints extends ManagementApi.Script {
    get name() {
        return 'enable-endpoints';
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
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // Search for API with desired context-path
                flatMap(_token => managementApi.listApis()),

                // Enrich API definition by a full export
                flatMap(api => managementApi.export(api.id)),

                // Filter by context-path
                filter(api => this.argv['context-path'] ? api.proxy.context_path.search(this.argv['context-path']) !== -1 : true),

                // Filter by groups
                flatMap(api => {
                    if (!api.proxy.groups) {
                        return Rx.empty();
                    }
                    const filteredGroups = api.proxy.groups.filter(group => this.argv['endpoint-group'] ? group.name.search(this.argv['endpoint-group']) !== -1 : true);
                    if (filteredGroups.length === 0) {
                        return Rx.empty();
                    }
                    return Rx
                        .from(filteredGroups)
                        .pipe(
                            map(filteredGroup => {
                                return {
                                    api: api,
                                    filteredGroup: filteredGroup
                                }
                            })
                        );
                }),

                // Filter by endpoints
                flatMap(apiAndFilteredGroups => {
                    const endpoints = apiAndFilteredGroups.filteredGroup.endpoints;
                    if (!endpoints) {
                        return Rx.empty();
                    }
                    const filteredEndpoints = endpoints.filter(endpoint => this.argv['endpoint'] ? endpoint.name.search(this.argv['endpoint']) !== -1 : true);
                    if (filteredEndpoints.length === 0) {
                        return Rx.empty();
                    }
                    return Rx
                        .from(filteredEndpoints)
                        .pipe(
                            map(filteredEndpoint => {
                                return {
                                    api: apiAndFilteredGroups.api,
                                    filteredEndpoint: filteredEndpoint
                                }
                            })
                        );
                }),

                // Reduce all api and endpoints to finally have only one result structure
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
                        this.displayInfo('Operation complete.');
                        return;
                    }
                    this.askForConfirmation(apisAndfilteredEndpoints, managementApi);
                },
                this.handleError,
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
                    "\t- '%s', from API '%s', with target '%s'\n",
                    apiAndFilteredEndpoint.filteredEndpoint.name,
                    apiAndFilteredEndpoint.api.name,
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
                this.displayRaw('Aborted');
                this.displayInfo('Operation complete.');
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
                flatMap(apiAndFilteredEndpoint => managementApi.update(apiAndFilteredEndpoint.api, apiAndFilteredEndpoint.api.id))
            )
            .subscribe(this.defaultSubscriber(
                _next => { }
            ));
    }

}
new EnableEndpoints({
    'c': {
        alias: 'context-path',
        describe: "Add a regex filter on API context-path value",
        type: 'string'
    },
    'g': {
        alias: 'endpoint-group',
        describe: 'Add a regex filter on endpoint-group names',
        type: 'string'
    },
    'e': {
        alias: 'endpoint',
        describe: 'Add a regex filter on endpoint names',
        type: 'string'
    },
    'a': {
        alias: 'action',
        describe: 'The desired action',
        choices: ['enable', 'disable'],
        demandOption: true
    }
}).run();