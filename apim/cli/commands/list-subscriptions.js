const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {PLAN_SECURITY_TYPE, SUBSCRIPTION_STATUS} = require('./lib/management-api');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {filter, flatMap, map, tap} = require('rxjs/operators');

const DEFAULT_DELAY_PERIOD = 50;

/**
 * List all subscriptions corresponding to the provided filters, in CSV format.
 *
 * @author Alexandre Carbenay
 */
class ListSubscriptions extends CliCommand {

    constructor() {
        super(
            'list-subscriptions',
            'List all subscriptions corresponding to the provided filters, in CSV format',
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
                'application-id': {
                    describe: 'Application UUID',
                    type: 'string'
                },
                'filter-by-application-name': {
                    describe: 'Filter applications against their name (insensitive regex)',
                    type: 'string'
                },
                'filter-by-plan-name': {
                    describe: 'Filter subscriptions against its plan name (insensitive regex)',
                    type: 'string'
                },
                'filter-by-subscription-token': {
                    describe: 'Filter subscriptions against its token if token is available (insensitive regex)',
                    type: 'string'
                },
                'filter-by-subscription-status': {
                    describe: 'Subscription status to filter on',
                    type: 'array',
                    choices: Object.values(SUBSCRIPTION_STATUS),
                    default: [SUBSCRIPTION_STATUS.ACCEPTED, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAUSED]
                }
            }
        );
    }

    definition(managementApi) {
        managementApi.login(this.argv['username'], this.argv['password'])
            .pipe(
                // Get API(s)
                flatMap(_token => this.argv['api-id'] ?
                    managementApi.getApi(this.argv['api-id']) :
                    managementApi.listApisBasics({
                        byName: this.argv['filter-by-name'],
                        byContextPath: this.argv['filter-by-context-path'],
                        byPrimaryOwner: this.argv['filter-by-primary-owner']
                    })),

                // Get subscriptions and enrich them with the current API
                flatMap(api => managementApi.getApiSubscriptions(api.id, this.argv['filter-by-subscription-status']).pipe(
                    map(subscription => Object.assign(subscription, {api: api}))
                )),

                // Filter by application id if necessary
                filter(subscription => !this.argv['application-id'] || subscription.application.id === this.argv['application-id']),

                // Filter by application name if necessary
                filter(subscription => !this.argv['filter-by-application-name'] || StringUtils.caseInsensitiveSearch(subscription.application.name, this.argv['filter-by-application-name'])),

                // Filter by plan name if necessary
                filter(subscription => !this.argv['filter-by-plan-name'] || StringUtils.caseInsensitiveSearch(subscription.plan.name, this.argv['filter-by-plan-name'])),

                // Filter by subscription status if necessary
                filter(subscription => !this.argv['filter-by-subscription-status'] || this.argv['filter-by-subscription-status'].includes(subscription.status)),

                // Enrich with API key and filter them if necessary
                flatMap(subscription => {
                    if (PLAN_SECURITY_TYPE.API_KEY !== subscription.plan.security) {
                        return Rx.of(subscription);
                    }
                    return managementApi.getApiSubscriptionKeys(subscription.api.id, subscription.id).pipe(
                        filter(key => !this['filter-by-subscription-token'] || StringUtils.caseInsensitiveMatches(key.key, this['filter-by-subscription-token'])),
                        map(key => Object.assign(subscription, {key: key.key}))
                    );
                }),

                // Finally format result to be taken into the CsvCliCommandReporter
                map(subscription => [
                    subscription.api.name,
                    subscription.api.id,
                    subscription.api.context_path,
                    subscription.application.name,
                    subscription.application.id,
                    subscription.plan.name,
                    subscription.plan.security,
                    subscription.status,
                    subscription.key ? subscription.key : 'none'
                ])
            )
            .subscribe(new CsvCliCommandReporter(
                [
                    'API name',
                    'API id',
                    'API context path',
                    'Application name',
                    'Application id',
                    'Plan name',
                    'Plan security type',
                    'Subscription status',
                    'Subscription token'
                ],
                this
            ));
    }

}

new ListSubscriptions().run();
