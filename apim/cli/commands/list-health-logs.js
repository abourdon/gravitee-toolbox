const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {filter, flatMap, map, tap} = require('rxjs/operators');

const DEFAULT_DELAY_PERIOD = 50;

/**
 * List all health logs corresponding to the provided filters, in CSV format.
 *
 * @author Alexandre Carbenay
 */
class ListHealthLogs extends CliCommand {

    constructor() {
        super(
            'list-health-logs',
            'List all health logs corresponding to the provided filters, in CSV format',
            {
                'api-id': {
                    describe: 'API UUID',
                    type: 'string'
                },
                'filter-by-name': {
                    describe: 'Filter APIs against their name (insensitive regex)',
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: 'Filter APIs against context-path (insensitive regex)',
                    type: 'string'
                },
                'filter-by-primary-owner': {
                    describe: 'Filter APIs against its primary owner name or address (insensitive regex)',
                    type: 'string'
                },
                'transition-only': {
                    describe: 'Indicate whether only transition health logs should be retrieved',
                    type: 'boolean',
                    default: true
                },
                'request-page-size': {
                    describe: 'Size of pages for each request',
                    type: 'number',
                    default: 10
                }
            }
        );
    }

    definition(managementApi) {
        managementApi.login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => this.argv['api-id'] ?
                    managementApi.getApi(this.argv['api-id']) :
                    managementApi.listApisBasics({
                        byName: this.argv['filter-by-name'],
                        byContextPath: this.argv['filter-by-context-path'],
                        byPrimaryOwner: this.argv['filter-by-primary-owner']
                    })
                ),

                flatMap(api => managementApi.getApiHealthLogs(api.id, this.argv['transition-only'], this.argv['request-page-size']).pipe(
                    map(healthLog => Object.assign(healthLog, {api: api}))
                )),

                map(healthLog => [
                    healthLog.api.name,
                    healthLog.api.id,
                    healthLog.api.context_path,
                    new Date(healthLog.timestamp).toISOString(),
                    healthLog.endpoint,
                    healthLog.gateway,
                    healthLog.success,
                    healthLog.state,
                    healthLog.available,
                    healthLog.response.status,
                    healthLog.responseTime
                ])
            )
            .subscribe(new CsvCliCommandReporter(
                [
                    'API name',
                    'API id',
                    'API context path',
                    'Log date',
                    'Endpoint',
                    'Gateway',
                    'Success',
                    'Health state',
                    'Availability',
                    'Response status',
                    'Response time'
                ],
                this
            ));
    }

}

new ListHealthLogs().run();
