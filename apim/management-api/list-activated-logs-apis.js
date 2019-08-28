const ManagementApiScript = require('./lib/management-api-script');
const Rx = require('rxjs')
const { filter, flatMap, map } = require('rxjs/operators');
const util = require('util');

const API_STATE_STARTED = 'started';
const LOGGING_MODE_DISABLED = 'NONE';
const TIMESTAMP_CONDITION_PREFIX = '#request.timestamp <= ';

const now = (new Date).getTime();

/**
 * List all APIs with detailed logs activated.
 *
 * @author Alexandre Carbenay
 */
class ListActivatedLogsApis extends ManagementApiScript {

    constructor() {
        super(
            'list-activated-logs-apis',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)"
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
                flatMap(_token => managementApi.listApisDetails({
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path'],
                })),
                map(api => api.details),
                filter(api => api.proxy.logging != undefined &&
                              api.proxy.logging.mode != LOGGING_MODE_DISABLED &&
                              this.isLoggingConditionActive(api.proxy.logging.condition)),
                flatMap(api => managementApi.getApi(api.id)),
                flatMap(api => managementApi.getApiState(api.id).pipe(
                    map(state => {
                        api.is_synchronized = state.is_synchronized;
                        return api;
                    })
                )),
                flatMap(api => this.disableLogs(managementApi, api)),
            )
            .subscribe(this.defaultSubscriber(api => {
                this.displayRaw(util.format('%s (%s) - Logging condition: %s', api.name, api.id, api.proxy.logging.condition));
            }));
    }

    isLoggingConditionActive(condition) {
        return condition == undefined || !this.isLoggingConditionATimestamp(condition) || this.isTimestampConditionEnabled(condition);
    }

    isLoggingConditionATimestamp(condition) {
        return condition.startsWith(TIMESTAMP_CONDITION_PREFIX);
    }

    isTimestampConditionEnabled(condition) {
        var timestamp = condition.substring(TIMESTAMP_CONDITION_PREFIX.length, condition.length - 1);
        return Number(timestamp) > now;
    }

    disableLogs(managementApi, api) {
        if (!this.argv['disable-logs']) {
            return Rx.of(api);
        }
        if (!api.is_synchronized) {
            this.displayRaw(util.format('Logs for API %s (%s) have not been disabled: last changes have not been deployed', api.name, api.id));
            return Rx.of(api);
        }
        delete api.is_synchronized;

        api.proxy.logging.mode = LOGGING_MODE_DISABLED;
        return managementApi
            .update(api, api.id)
            .pipe(
                flatMap(updatedApi => managementApi.deploy(updatedApi.id))
            );
    }

}
new ListActivatedLogsApis().run();