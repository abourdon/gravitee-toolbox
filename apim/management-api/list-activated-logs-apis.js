const ManagementApiScript = require('./lib/management-api-script');
const { tap, filter, flatMap, map } = require('rxjs/operators');
const util = require('util');

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
                              api.proxy.logging.mode != 'NONE' &&
                              this.isLoggingConditionEnabled(api.proxy.logging.condition)),
            )
            .subscribe(this.defaultSubscriber(
                api => this.displayRaw(util.format('%s (%s): %s - %s', api.name, api.id, api.proxy.logging.mode, api.proxy.logging.condition))
            ));
    }

    isLoggingConditionEnabled(condition) {
        return condition == undefined || !this.isLoggingConditionATimestamp(condition) || this.isTimestampConditionEnabled(condition);
    }

    isLoggingConditionATimestamp(condition) {
        return condition.startsWith(TIMESTAMP_CONDITION_PREFIX);
    }

    isTimestampConditionEnabled(condition) {
        var timestamp = condition.substring(TIMESTAMP_CONDITION_PREFIX.length, condition.length - 1);
        return Number(timestamp) > now;
    }

}
new ListActivatedLogsApis().run();