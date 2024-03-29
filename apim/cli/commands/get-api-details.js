const util = require('util');
const Rx = require('rxjs');
const { mergeMap, map } = require('rxjs/operators');
const { JSONPath } = require('jsonpath-plus');
const {CliCommand, JsonCliCommandReporter} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');

/**
 * Get API details.
 *
 * @author Aurelien Bourdon
 */
class ApiDetails extends CliCommand {

    constructor() {
        super(
            'get-api-details',
            'Display API details (full API configuration extract), by allowing filter-out the display following a json path (extended) predicate',
            {
                'api-id': {
                    describe: 'API UUID',
                    type: 'string',
                    demandOption: true
                },
                'filter-output': {
                    describe: 'Filter output to only extract values that match the given json path (extended) predicate. See https://www.npmjs.com/package/jsonpath-plus for more details',
                    type: 'string'
                }
            }
        );
    }

    definition(managementApi) {
        return managementApi.login(this.argv['username'], this.argv['password']).pipe(
            mergeMap(_token => managementApi.export(this.argv['api-id'])),
            map(details => this.argv['filter-output'] ? StringUtils.jsonPathSearch(details, this.argv['filter-output']) : details)
        )
        .subscribe(new JsonCliCommandReporter(this));
    }

}

new ApiDetails().run();
