const ManagementApiScript = require('./lib/management-api-script');
const Rx = require('rxjs');
const {filter, flatMap, map, reduce, tap} = require('rxjs/operators');
const util = require('util');

const LOGGING_CONDITION_KEY = 'condition';
const LOGGING_MODE_KEY = 'mode';
const LOGGING_MODES = {
    'none': 'NONE',
    'application_only': 'CLIENT',
    'api_only': 'PROXY',
    'application_and_api': 'CLIENT_PROXY'
};
const TIMESTAMP_CONDITION_PREFIX = '#request.timestamp <= ';

const NOW_MILLIS = (new Date).getTime();
const ONE_HOUR_MILLIS = 60 * 60 * 1000;

/**
 * Enable (or disable) detailed logs on APIs that match user predicate.
 *
 * @author Aurelien Bourdon
 */
class EnableLogs extends ManagementApiScript {

    constructor() {
        super(
            'enable-logs',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'logging-mode': {
                    describe: "Logging mode to set for found APIs",
                    choices: Object.keys(LOGGING_MODES),
                    demandOption: true
                },
                'logging-condition': {
                    describe: "Condition until logging will be activated (1 hour since now by default)",
                    type: 'string'
                },
                'ask-for-approval': {
                    describe: "Ask for user approval before setting APIs",
                    type: 'boolean',
                    default: true
                }
            }
        );
    }

    definition(managementApi) {
        this.retrieveApis(managementApi);
    }

    retrieveApis(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // Retrieve API details that match user predicate
                flatMap(_token => managementApi.listApisDetails({
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path'],
                })),

                // Only keep APIs without ongoing changes
                flatMap(api =>
                    managementApi.getApiState(api.id)
                        .pipe(
                            tap(state => api.is_synchronized = state.is_synchronized),
                            map(state => api)
                        )
                ),
                filter(api => {
                    if (!api.is_synchronized) {
                        this.displayRaw(util.format('- API %s (%s) has NOT been set because having ongoing changes that have not been synchronized', api.name, api.id));
                        return false;
                    }
                    return true;
                }),

                // Retrieve all APIs to send only one result
                reduce(
                    (acc, api) => acc.concat([api]), []
                )
            )
            .subscribe(
                apis => {
                    if (this.argv['ask-for-approval']) {
                        this.askForApproval(
                            apis.map(api => util.format('API %s (%s, %s)', api.name, api.context_path, api.id)),
                            this.applyLoggingConfiguration.bind(this, apis, managementApi),
                            this.handleError.bind(this, 'Aborted.')
                        );
                    } else {
                        this.applyLoggingConfiguration(apis, managementApi);
                    }
                },
                this.handleError.bind(this),
                _complete => {}
            )
        ;
    }

    applyLoggingConfiguration(apis, managementApi) {
        Rx.from(apis)
            .pipe(
                // Set logging configuration for found APIs
                tap(api => this.setLoggingConfiguration(api.details)),

                // Finally update APIs
                flatMap(api => managementApi.import(api.details, api.id)
                    .pipe(
                        flatMap(api => managementApi.deploy(api.id))
                    )
                )
            )
            .subscribe(this.defaultSubscriber(api => {
                this.displayRaw(util.format('- API %s (%s) has been set', api.name, api.id));
            }));
    }

    /**
     * Set logging configuration in the given API details object (so with edge effect)
     *
     * @param apiDetails the API details object to update
     */
    setLoggingConfiguration(apiDetails) {
        // Recreate logging configuration from scratch
        apiDetails.proxy.logging = {};

        // Add mandatory logging mode
        const loggingMode = LOGGING_MODES[this.argv['logging-mode']];
        apiDetails.proxy.logging[LOGGING_MODE_KEY] = loggingMode;

        // Add logging condition if logging is enabled
        if (loggingMode !== LOGGING_MODES['none']) {
            const loggingCondition = this.argv['logging-condition']
                ? this.argv['logging-condition']
                : util.format("%s%sl", TIMESTAMP_CONDITION_PREFIX, NOW_MILLIS + ONE_HOUR_MILLIS);
            apiDetails.proxy.logging[LOGGING_CONDITION_KEY] = loggingCondition;
        }
    }

}

new EnableLogs().run();