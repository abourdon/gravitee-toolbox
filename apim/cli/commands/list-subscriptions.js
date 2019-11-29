const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {filter, flatMap, map} = require('rxjs/operators');

const DEFAULT_DELAY_PERIOD = 50;
const SUBSCRIPTION_PAGE_SIZE = 100;

/**
 * List all subscriptions corresponding to the provided filters.
 *
 * @author Alexandre Carbenay
 */
class ListSubscriptions extends CliCommand {

    constructor() {
        super(
            'list-subscriptions',
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
                'filter-by-subscription-status': {
                    describe: 'Subscription status to filter on',
                    type: 'string',
                    choices: ['ACCEPTED', 'PENDING', 'PAUSED', 'REJECTED', 'CLOSED'],
                    default: ['ACCEPTED', 'PENDING', 'PAUSED']
                }
            }
        );
    }

    definition(managementApi) {
        this.getApis(managementApi)
            .pipe(
                // Get API subscriptions
                flatMap(api => this.getApiSubscriptions(managementApi, api)),

                // Enrich them with subscription token
                flatMap(subscription => this.enrichSubscriptionWithKey(managementApi, subscription)),

                // Finally format result to be taken into the CsvCliCommandReporter
                map(subscription => [
                    subscription.api.name,
                    subscription.api.id,
                    subscription.api.context_path,
                    subscription.application.name,
                    subscription.application.id,
                    subscription.plan.name,
                    subscription.plan.security,
                    subscription.subscription.status,
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

    getApis(managementApi) {
        return managementApi.login(this.argv['username'], this.argv['password']).pipe(
            flatMap(_token => this.argv['api-id'] !== undefined
                ? managementApi.getApi(this.argv['api-id'])
                : managementApi.listApisBasics({
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path'],
                    byPrimaryOwner: this.argv['filter-by-primary-owner']
                }, DEFAULT_DELAY_PERIOD).pipe(
                    filter(api => api.manageable)
                )
            )
        );
    }

    getApiSubscriptions(managementApi, api) {
        return managementApi.getApiPlans(api.id).pipe(
            flatMap(plans => managementApi.getApiSubscriptions(api.id, this.argv['subscription-status'], SUBSCRIPTION_PAGE_SIZE).pipe(
                flatMap(subscriptions => this.extractApiSubscriptions(api, plans, subscriptions))
            ))
        );
    }

    extractApiSubscriptions(api, plans, subscriptions) {
        return Rx.from(subscriptions.data).pipe(
            map(subscription => Object.assign({
                api: api,
                application: this.getSubscriptionApplication(subscription.application, subscriptions.metadata),
                plan: plans.filter(plan => plan.id === subscription.plan)[0],
                subscription: subscription
            })),
            filter(subscription => this.argv['application-id'] === undefined
                || subscription.application.id === this.argv['application-id']),
            filter(subscription => this.argv['filter-by-application-name'] === undefined
                || StringUtils.caseInsensitiveMatches(subscription.application.name, this.argv['filter-by-application-name'])),
            filter(subscription => this.argv['filter-by-plan-name'] === undefined
                || StringUtils.caseInsensitiveMatches(subscription.plan.name, this.argv['filter-by-plan-name']))
        );
    }

    getSubscriptionApplication(applicationId, metadata) {
        return Object.assign({id: applicationId, name: metadata[applicationId].name});
    }

    enrichSubscriptionWithKey(managementApi, subscription) {
        return managementApi.getSubscriptionKeys(subscription.api.id, subscription.subscription.id).pipe(
            map(keys => {
                var validKeys = keys.filter(key => !key.revoked && !key.paused && !key.expired);
                if (validKeys.length > 0) {
                    subscription.key = validKeys[0].key;
                }
                return subscription;
            })
        );
    }

}

new ListSubscriptions().run();
