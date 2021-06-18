const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const Rx = require('rxjs')
const { filter, mergeMap, map, tap, } = require('rxjs/operators');
const util = require('util');

const API_STATE_STARTED = 'started';
const LOGGING_MODE_DISABLED = 'NONE';
const TIMESTAMP_CONDITION_PREFIX = '#request.timestamp <= ';

/**
 * List all APIs with detailed logs activated, in CSV format.
 *
 * @author Alexandre Carbenay
 */
class ListActivatedLogsApis extends CliCommand {

    constructor() {
        super(
            'list-apis-with-activated-logs',
            'List all APIs with detailed logs currently activated (and optionnally disabled them) in CSV format',
            {
                'filter-by-id': {
                    describe: "Filter APIs against their id (exact match)",
                    type: 'string'
                },
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'disable-logs': {
                    describe: "Flag used to disable detailed logs for found APIs",
                    type: 'boolean',
                    default: false
                }   
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(

                mergeMap(_token => managementApi.listApisDetails({
                    byId: this.argv['filter-by-id'],
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path'],
                })),

                map(api => api.details),

                filter(api => this.hasDetailedLogsActivated(api)),

                mergeMap(api => managementApi.getApiState(api.id).pipe(
                    tap(state => api.is_synchronized = state.is_synchronized),
                    map(_ => api)
                )),

                mergeMap(api => this.disableLogs(managementApi, api)),
                
                map(api => [
                    api.id,
                    api.name,
                    api.proxy.logging.condition !== undefined ? api.proxy.logging.condition : '<Just disabled>'
                ])
            )
            .subscribe(new CsvCliCommandReporter([
                'API ID',
                'API name',
                'Logging condition'
            ], this));
    }

    hasDetailedLogsActivated(api) {
        return this.isLoggingModeEnabled(api) && this.isLoggingConditionActive(api);
    }

    isLoggingModeEnabled(api) {
        return api.proxy.logging !== undefined && api.proxy.logging.mode !== LOGGING_MODE_DISABLED
    }

    isLoggingConditionActive(api) {
        return api.proxy.logging.condition !== undefined && (!this.isLoggingConditionATimestamp(api.proxy.logging.condition) || this.isTimestampConditionActive(api.proxy.logging.condition));
    }

    isLoggingConditionATimestamp(condition) {
        return condition.startsWith(TIMESTAMP_CONDITION_PREFIX);
    }

    isTimestampConditionActive(condition) {
        var timestamp = condition.substring(TIMESTAMP_CONDITION_PREFIX.length, condition.length - 1);
        return Number(timestamp) > new Date().getTime();
    }

    disableLogs(managementApi, api) {
        if (!this.argv['disable-logs']) {
            return Rx.of(api);
        }
        if (!api.is_synchronized) {
            this.console.warn(util.format('Logs for API %s (%s) have not been disabled because API is currently out of sync', api.name, api.id));
            return Rx.of(api);
        }
        delete api.is_synchronized;

        api.proxy.logging.mode = LOGGING_MODE_DISABLED;
        delete api.proxy.logging.condition;
        return managementApi
            .import(api, api.id)
            .pipe(
                mergeMap(updatedApi => managementApi.deploy(updatedApi.id)),
                tap(_ => this.console.warn(util.format('Logs for API %s (%s) have been disabled', api.name, api.id)))
            );
    }

}
new ListActivatedLogsApis().run();