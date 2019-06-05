const ManagementApiScript = require('./lib/management-api-script');
const { flatMap, toArray, map } = require('rxjs/operators');
const { throwError } = require('rxjs');
const util = require('util');
const fs = require('fs');
const Rx = require('rxjs');

/**
 * Import existing API (update) depending a search. Import only if search returns exactly one result.
 * 
 * @author Soann Dewasme
 */
class ImportApi extends ManagementApiScript {

    constructor() {
        super(
            'import-api', {
                'f': {
                    alias: "filepath",
                    describe: "File path containing API definition to import",
                    type: 'string',
                    demandOption: true
                },
                'd': {
                    alias: "deploy",
                    describe: "Deploy after import",
                    type: 'boolean',
                    default: false
                },
                'n': {
                    alias: "new",
                    describe: "Import a new API",
                    type: 'boolean',
                    default: false
                },
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
                }
            }
        );
    }

    /**
     * Create a promise to read imported file content.
     * @param {*} filepath File path
     */
    readFilePromise(filepath) {
        return Rx.from(new Promise(function(resolve, reject) {
            fs.readFile(filepath, "utf8", function(err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ content: data });
                }
            });
        }));
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => {
                    // In case of new API, we do not need to get APIs
                    if (this.argv['new']) {
                        return this.readFilePromise(this.argv['filepath']);
                    }

                    // Search APIs
                    return managementApi.listApis({
                        byFreeText: this.argv['filter-by-free-text'],
                        byContextPath: this.argv['filter-by-context-path'],
                        byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                        byEndpointName: this.argv['filter-by-endpoint-name'],
                        byEndpointTarget: this.argv['filter-by-endpoint-target']
                    }).pipe(
                        // Merge all APIs emitted into array
                        toArray(),
                        flatMap(apis => {
                            // Throw error if more (or less) than one result
                            if (apis.length !== 1) {
                                var msg = util.format('%s APIs found, must find a single result. Be more precise in filters.', apis.length);
                                apis.forEach(function(api) {
                                    msg = msg + util.format('\n   - %s (%s)', api.name, api.proxy.context_path);
                                });
                                return throwError(msg);
                            }

                            // Return promise with import file content
                            return this.readFilePromise(this.argv['filepath'])
                                .pipe(
                                    // Add id to json object (for update)
                                    map(x => Object.assign(x, { id: apis[0].id }))
                                );
                        }),
                    )
                }),
                // Import or update API, depending deploy flag
                flatMap(api => (this.argv['deploy']) ? managementApi.update(api.content, api.id) : managementApi.import(api.content, api.id))
            )
            .subscribe(
                // ###################### TOFIX #############################
                // It's mandatory to have error function here and not a function
                // in management-api-script : we lose script name.
                //
                // See TOFIX in management-api-script
                // ##########################################################
                this.defaultSubscriber(
                    () => {},
                    event => {
                        // Error from Management, show body
                        if (event.hasOwnProperty('message') && event.hasOwnProperty('response')) {
                            console.error(
                                util.format('%s: Error: %s, response body is <%s>',
                                    this.name,
                                    event.message,
                                    JSON.stringify(event.response.data)
                                )
                            );
                        } else { // Error on something else, just show content
                            console.error(util.format('%s: Error: %s.', this.name, event));
                        }
                    }
                )
            );
    }
}

new ImportApi().run();