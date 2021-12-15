const {CliCommand} = require('./lib/cli-command');
const {mergeMap, toArray, map} = require('rxjs/operators');
const {throwError} = require('rxjs');
const util = require('util');
const fsp = require('fs').promises;
const Rx = require('rxjs');

/**
 * Import existing API (update) depending a search. Import only if search returns exactly one result.
 *
 * @author Soann Dewasme
 */
class ImportApi extends CliCommand {

    constructor() {
        super(
            'import-api',
            'Import existing API (update) depending a search. Import only if search returns exactly one result',
            {
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
                'e': {
                    alias: "encoding",
                    describe: "Imported file encoding",
                    type: 'string',
                    default: 'utf8'
                },
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
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                mergeMap(_token =>
                    Rx.from(fsp.readFile(this.argv['filepath'], this.argv['encoding']))
                        .pipe(
                            map(content => {
                                var apiFilters = {
                                    byName: this.argv['filter-by-name'],
                                    byContextPath: this.argv['filter-by-context-path'],
                                    byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                                    byEndpointName: this.argv['filter-by-endpoint-name'],
                                    byEndpointTarget: this.argv['filter-by-endpoint-target']
                                };
                                if (!this.argv['new'] && !this._hasDefinedFilters(apiFilters)) {
                                    const jsonContent = JSON.parse(content);
                                    this.console.info(util.format("No defined filters. Use context path from import file: %s", jsonContent.proxy.context_path));
                                    apiFilters.byContextPath = util.format("^%s$", jsonContent.proxy.context_path);
                                }
                                return new ImportContext(_token, content, apiFilters);
                            })
                        )
                ),
                mergeMap(context => {
                    if (this.argv['new']) {
                        this.console.info("Create new API from import file");
                        return Rx.of(Object.assign({content: context.importedFileContent, id: null}))
                    }

                    return managementApi.listApisBasics(context.apiFilters)
                        .pipe(
                            // Merge all APIs emitted into array
                            toArray(),
                            mergeMap(apis => {
                                // Throw error if more (or less) than one result
                                if (apis.length !== 1) {
                                    var msg = util.format('%s APIs found, must find a single result. Be more precise in filters.', apis.length);
                                    apis.forEach(function (api) {
                                        msg += util.format('\n   - %s (%s)', api.name, api.proxy.context_path);
                                    });
                                    return throwError(msg);
                                }
                                this.console.info(util.format("Found API %s", apis[0].id));
                                return Rx.of(Object.assign({content: context.importedFileContent, id: apis[0].id}));
                            })
                        )
                }),
                // Import and deploy if flag is set
                mergeMap(api => (!this.argv['deploy']) ? managementApi.updateApi(api.content, api.id) :
                    managementApi.updateApi(api.content, api.id)
                        .pipe(
                            mergeMap(importedApi => managementApi.deploy(importedApi.id))
                        )
                )
            ).subscribe(
            this.defaultSubscriber(
                () => {
                },
                error => {
                    const errorMessage = error.hasOwnProperty('message') && error.hasOwnProperty('response')
                        ? util.format('%s. Response body is <%s>)', error.message, util.inspect(error.response.data))
                        : error;
                    this.handleError(errorMessage);
                }
            )
        );
    }

    /*
     * Indicates whether at least one API filter has been defined.
     */
    _hasDefinedFilters(filters) {
        return Object.keys(filters)
            .filter(k => filters[k] !== undefined)
            .length > 0;
    }
}

/**
 * Import context, containing information about executing import.
 */
ImportContext = class {
    constructor(token, importedFileContent, apiFilters) {
        this.token = token;
        this.importedFileContent = importedFileContent;
        this.apiFilters = apiFilters;
    }
};

new ImportApi().run();