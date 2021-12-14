const {CliCommand} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');
const ManagementApi = require('./lib/management-api');
const Rx = require('rxjs');
const {mergeMap, map, reduce, tap} = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

const ENDPOINT_CREATION_TEMPLATE = {
    name: undefined, // to fill
    target: undefined, // to fill
    tenants: undefined, // to fill
    weight: 1,
    backup: false,
    type: 'HTTP',
    inherit: true
};

/**
 * Create an API endpoint that match user predicate
 *
 * @author Aurelien Bourdon
 */
class CreateEndpoint extends CliCommand {

    constructor() {
        super(
            'create-endpoint',
            'Create an API endpoint',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'endpoint-group-name': {
                    describe: "Name of the endpoint group that will own the endpoint to create",
                    type: 'string',
                    demandOption: true
                },
                'endpoint-name': {
                    describe: "Name of the endpoint to create",
                    type: 'string',
                    demandOption: true
                },
                'endpoint-target': {
                    describe: "URL of the endpoint to create",
                    type: 'string',
                    demandOption: true
                },
                'endpoint-tenant': {
                    describe: "Tenant to link with the created endpoint (can be defined multiple times, nothing by default)",
                    type: 'array'
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
        // Operation will be done in chain by first checking argument
        this.definition_checkArguments(managementApi);
    }

    /**
     * First step of the script definition: Check arguments before executing command
     *
     * @param managementApi
     */
    definition_checkArguments(managementApi) {
        // Only one check has to be done for tenants to control if values currently exist on the Gravitee platform.
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                mergeMap(_token => managementApi.getTenants())
            )
            .subscribe(
                expectedTenants => {
                    const actualTenants = this.argv['endpoint-tenant'];
                    if (actualTenants) {
                        const expectedTenantIds = expectedTenants.map(tenant => tenant.id);
                        const invalidTenants = actualTenants.filter(actualTenant => {
                            return !expectedTenantIds.includes(actualTenant);
                        });
                        if (invalidTenants.length > 0) {
                            this.handleError(util.format('Invalid tenant(s). Received %s, expected %s', invalidTenants, expectedTenantIds));
                        }
                    }
                },
                error => this.handleError(error),
                // If operation succeed, then start by selecting APIs that match user predicate
                () => this.definition_selectApis(managementApi)
            )
    }

    /**
     * Second step of the script definition: select endpoints according to user predicate
     *
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    definition_selectApis(managementApi) {
        managementApi
            // Select Apis...
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                mergeMap(_token => managementApi.listApisBasics({
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path']
                })),

                reduce(
                    (acc, apis) => acc.concat([apis]), []
                )
            )

            // ... then ask for confirmation if necessary and process changes
            .subscribe(
                apis => {
                    if (this.argv['ask-for-approval']) {
                        this.askForApproval(
                            apis.map(
                                api => util.format(
                                    "API '%s' (context path '%s', owner '%s <%s>')",
                                    api.name,
                                    api.context_path,
                                    api.owner.displayName,
                                    api.owner.email,
                                )
                            ),
                            this.definition_addEndpoint.bind(this, apis, managementApi),
                            this.handleError.bind(this, 'Aborted.')
                        );
                    } else {
                        this.definition_addEndpoint(apis, managementApi);
                    }
                },
                error => this.handleError(error)
            );
    }

    /**
     * Last step of the command definition: Add endpoint to selected APIs
     *
     * @param {object} apis the list of selected APIs
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    definition_addEndpoint(apis, managementApi) {
        Rx
            .from(apis)
            .pipe(
                // Get details about selected APIs
                mergeMap(api => managementApi.export(api.id, Object.values(ManagementApi.EXPORT_EXCLUDE).join())),

                // Conditionally create endpoint for APIs
                mergeMap(api => {
                    if (!api.proxy.groups) {
                        return Rx.EMPTY;
                    }

                    // Check if group name exists
                    let filteredGroup = api.proxy.groups.filter(group => group.name === this.argv['endpoint-group-name']);
                    if (filteredGroup.length === 0) {
                        this.console.warn(util.format("Endpoint cannot be created: API '%s' has not endpoint group with name '%s'.", api.name, this.argv['endpoint-group-name']));
                        return Rx.EMPTY;
                    }
                    filteredGroup = filteredGroup[0];

                    // Check if endpoint name does not already exist (from any API endpoint group)
                    const alreadyExistingEndpointName = api.proxy.groups.filter(group => group.endpoints && group.endpoints.filter(endpoint => endpoint.name === this.argv['endpoint-name']).length > 0);
                    if (alreadyExistingEndpointName.length > 0) {
                        this.console.warn(util.format("Endpoint cannot be created: Endpoint name already exists for API '%s' from group '%s'.", api.name, alreadyExistingEndpointName[0].name));
                        return Rx.EMPTY;
                    }

                    // Then we can create endpoint
                    const createdEndpoint = Object.assign({}, ENDPOINT_CREATION_TEMPLATE);
                    createdEndpoint.name = this.argv['endpoint-name'];
                    createdEndpoint.target = this.argv['endpoint-target'];
                    createdEndpoint.tenants = this.argv['endpoint-tenant'];
                    if (!filteredGroup.endpoints) {
                        filteredGroup.endpoints = [];
                    }
                    filteredGroup.endpoints.push(createdEndpoint);
                    return Rx.of(api);
                }),

                // Apply changes
                mergeMap(api => managementApi
                    .import(api, api.id)
                    .pipe(
                        mergeMap(importedApi => managementApi.deploy(importedApi.id)
                            .pipe(
                                map(() => api)
                            )
                        )
                    )
                )
            )
            .subscribe(this.defaultSubscriber(api => this.console.raw(util.format("Endpoint added for API '%s' ('%s')", api.name, api.proxy.context_path))));
    }

}

new CreateEndpoint().run();