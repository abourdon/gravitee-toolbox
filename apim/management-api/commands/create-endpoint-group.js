const {CliCommand} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');
const ManagementApi = require('./lib/management-api');
const Rx = require('rxjs');
const {flatMap, map, reduce, tap} = require('rxjs/operators');
const util = require('util');
const readline = require('readline');

const ENDPOINT_GROUP_CREATION_TEMPLATE = {
    "http": {
        "connectTimeout": 5000,
        "encodeURI": false,
        "followRedirects": false,
        "idleTimeout": 60000,
        "keepAlive": true,
        "maxConcurrentConnections": 100,
        "pipelining": false,
        "readTimeout": 10000,
        "useCompression": true
    },
    "load_balancing": {
        "type": "ROUND_ROBIN"
    },
    "name": undefined, // to fill
    "proxy": {
        "enabled": false,
        "host": "null",
        "port": 0,
        "type": "HTTP"
    },
    "services": {
        "discovery": {
            "enabled": false
        }
    },
    "ssl": {
        "hostnameVerifier": false,
        "trustAll": false
    }
};

/**
 * Create an API endpoint group that match user predicate
 *
 * @author Aurelien Bourdon
 */
class CreateEndpointGroup extends CliCommand {

    constructor() {
        super(
            'create-endpoint-group', {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'endpoint-group-name': {
                    describe: "Name of the endpoint group to add",
                    type: 'string',
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
        // Operation will be done in chain by first selecting APIs that match with user predicate
        this.definition_selectApis(managementApi);
    }

    /**
     * First step of the script definition: select endpoints according to user predicate
     *
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    definition_selectApis(managementApi) {
        managementApi
        // Select Apis...
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApisBasics({
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
                            this.definition_addEndpointGroup.bind(this, apis, managementApi),
                            this.handleError.bind(this, 'Aborted.')
                        );
                    } else {
                        this.definition_addEndpointGroup(apis, managementApi);
                    }
                },
                error => this.handleError(error)
            );
    }

    /**
     * Last step of the command definition: Add endpoint group to selected APIs
     *
     * @param {object} apis the list of selected APIs
     * @param {object} managementApi the ManagementApi instance from which request for Management API resources
     */
    definition_addEndpointGroup(apis, managementApi) {
        Rx
            .from(apis)
            .pipe(
                // Get details about selected APIs
                flatMap(api => managementApi.export(api.id, Object.values(ManagementApi.EXPORT_EXCLUDE).join())),

                // Conditionally create endpoint for APIs
                flatMap(api => {
                    if (!api.proxy.groups) {
                        return Rx.EMPTY;
                    }

                    // Check if group name exists
                    let existingGroup = api.proxy.groups.filter(group => group.name === this.argv['endpoint-group-name']);
                    if (existingGroup.length > 0) {
                        this.displayWarning(util.format("Endpoint group cannot be created: API '%s' already has an endpoint group with name '%s'.", api.name, this.argv['endpoint-group-name']));
                        return Rx.EMPTY;
                    }

                    // If not, then we can create endpoint group
                    const createdEndpointGroup = Object.assign({}, ENDPOINT_GROUP_CREATION_TEMPLATE);
                    createdEndpointGroup.name = this.argv['endpoint-group-name'];
                    api.proxy.groups.push(createdEndpointGroup);
                    return Rx.of(api);
                }),

                // Apply changes
                flatMap(api => managementApi
                    .import(api, api.id)
                    .pipe(
                        flatMap(importedApi => managementApi.deploy(importedApi.id)
                            .pipe(
                                map(() => api)
                            )
                        )
                    )
                )
            )
            .subscribe(this.defaultSubscriber(api => this.displayRaw(util.format("Endpoint group added for API '%s' ('%s')", api.name, api.proxy.context_path))));
    }

}

new CreateEndpointGroup().run();