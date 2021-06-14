const {CliCommand} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {mergeMap, map, reduce} = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

/**
 * Enable (or disable) API endpoints based on user predicate
 *
 * @author Aurelien Bourdon
 */
class EnableEndpoints extends CliCommand {

    constructor() {
        super(
            'enable-endpoints',
            'Enable/Disable API endpoint(s)',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-group-name': {
                    describe: "Filter APIs against endpoint group name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-name': {
                    describe: "Filter APIs against endpoint name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-target': {
                    describe: "Filter APIs against endpoint target (insensitive regex)",
                    type: 'string'
                },
                'action': {
                    describe: 'The desired action',
                    choices: ['enable', 'disable'],
                    demandOption: true
                },
                'ask-for-approval': {
                    describe: "Ask for user approval before setting endpoints",
                    type: 'boolean',
                    default: true
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
                mergeMap(_token => managementApi.listApisDetails({
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path'],
                    byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                    byEndpointName: this.argv['filter-by-endpoint-name'],
                    byEndpointTarget: this.argv['filter-by-endpoint-target'],
                })),

                // Retrieve matching endpoint groups
                mergeMap(api => {
                    if (!api.details.proxy.groups) {
                        return Rx.EMPTY;
                    }
                    const filteredEndpointGroups = api.details.proxy.groups.filter(group => !this.argv['filter-by-endpoint-group-name'] || StringUtils.caseInsensitiveMatches(group.name, this.argv['filter-by-endpoint-group-name']))
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
                mergeMap(apiAndFilteredEndpointGroup => {
                    if (!apiAndFilteredEndpointGroup.filteredEndpointGroup.endpoints) {
                        return Rx.EMPTY;
                    }
                    const filteredEndpoints = apiAndFilteredEndpointGroup.filteredEndpointGroup.endpoints.filter(endpoint => {
                        const checkByEndpointName = !this.argv['filter-by-endpoint-name'] || StringUtils.caseInsensitiveMatches(endpoint.name, this.argv['filter-by-endpoint-name']);
                        const checkByEndpointTarget = !this.argv['filter-by-endpoint-target'] || StringUtils.caseInsensitiveMatches(endpoint.target, this.argv['filter-by-endpoint-target']);
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
                    (acc, apiAndFilteredEndpoint) => acc.concat([apiAndFilteredEndpoint]), []
                )
            )

            // Then ask for confirmation if necessary and proceed changes
            .subscribe(
                apisAndfilteredEndpoints => {
                    if (this.argv['ask-for-approval']) {
                        this.askForApproval(
                            apisAndfilteredEndpoints.map(
                                apiAndFilteredEndpoint => util.format(
                                    "Endpoint '%s' of API '%s' (from endpoint group '%s' with target '%s')",
                                    apiAndFilteredEndpoint.filteredEndpoint.name,
                                    apiAndFilteredEndpoint.api.name,
                                    apiAndFilteredEndpoint.filteredGroup.name,
                                    apiAndFilteredEndpoint.filteredEndpoint.target
                                )
                            ),
                            this.enableOrDisableEndpoints.bind(this, apisAndfilteredEndpoints, managementApi),
                            this.handleError.bind(this, 'Aborted.')
                        );
                    } else {
                        this.enableOrDisableEndpoints(apisAndfilteredEndpoints, managementApi);
                    }
                },
                this.handleError.bind(this),
                _complete => {
                }
            );
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
                    apiAndFilteredEndpoint.filteredEndpoint.backup = this.argv['action'] === 'disable';
                    return apiAndFilteredEndpoint;
                }),

                // Finally import API with new endpoint definition (without deploy it)
                mergeMap(apiAndFilteredEndpoint => managementApi
                    .import(apiAndFilteredEndpoint.api.details, apiAndFilteredEndpoint.api.id)
                    .pipe(
                        mergeMap(importedApi => managementApi.deploy(importedApi.id)
                            .pipe(
                                map(() => apiAndFilteredEndpoint)
                            )
                        )
                    )
                )
            )
            .subscribe(this.defaultSubscriber(apiAndFilteredEndpoint => this.displayRaw(
                util.format("- Operation done for endpoint '%s' (API '%s', endpoint group '%s', target '%s').",
                    apiAndFilteredEndpoint.filteredEndpoint.name,
                    apiAndFilteredEndpoint.api.name,
                    apiAndFilteredEndpoint.filteredGroup.name,
                    apiAndFilteredEndpoint.filteredEndpoint.target
                )
            )));
    }

}

new EnableEndpoints().run();