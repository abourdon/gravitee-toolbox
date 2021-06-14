const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const ElasticSearch = require('./lib/elasticsearch');
const {PLAN_SECURITY_TYPE, SUBSCRIPTION_STATUS} = require('./lib/management-api');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {filter, mergeMap, map, reduce} = require('rxjs/operators');
const util = require('util');

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
                },
                'with-number-of-requests': {
                    describe: "Indicates whether the number of requests must be calculated for each subscription",
                    type: 'boolean',
                    default: false
                },
                'runtime-duration': {
                    describe: "Runtime time range duration",
                    type: 'string',
                    default: '1M'
                },
                'elasticsearch-url': {
                    describe: 'Elasticsearch base URL',
                    type: 'string'
                },
                'elasticsearch-url-header': {
                    describe: 'Additional HTTP header',
                    type: 'array'
                },
                'elasticsearch-index': {
                    describe: 'Elasticsearch request index',
                    type: 'string',
                    default: 'gravitee-request-*'
                }
            }
        );
    }

    definition(managementApi) {
        // Get number of requests by subscription for all APIs
        (this.argv['with-number-of-requests']
            ? this.getSubscriptionsNumberOfRequests()
            : Rx.of({}))
            .pipe(
                mergeMap(subscriptionsNumberOfRequests => this.getApis(managementApi).pipe(
                    // Get subscriptions and enrich them with the current API
                    mergeMap(api => managementApi.getApiSubscriptions(api.id, this.argv['filter-by-subscription-status']).pipe(
                        map(subscription => Object.assign(subscription, {api: api}))
                    )),

                    // Filter by application id if necessary
                    filter(subscription => !this.argv['application-id'] || subscription.application.id === this.argv['application-id']),

                    // Filter by application name if necessary
                    filter(subscription => !this.argv['filter-by-application-name'] || StringUtils.caseInsensitiveMatches(subscription.application.name, this.argv['filter-by-application-name'])),

                    // Filter by plan name if necessary
                    filter(subscription => !this.argv['filter-by-plan-name'] || StringUtils.caseInsensitiveMatches(subscription.plan.name, this.argv['filter-by-plan-name'])),

                    // Filter by subscription status if necessary
                    filter(subscription => !this.argv['filter-by-subscription-status'] || this.argv['filter-by-subscription-status'].includes(subscription.status)),

                    // Enrich with API key and filter them if necessary
                    mergeMap(subscription => {
                        if (PLAN_SECURITY_TYPE.API_KEY !== subscription.plan.security) {
                            return Rx.of(subscription);
                        }
                        return managementApi.getApiSubscriptionKeys(subscription.api.id, subscription.id).pipe(
                        filter(key => !this['filter-by-subscription-token'] || StringUtils.caseInsensitiveMatches(key.key, this['filter-by-subscription-token'])),
                            map(key => Object.assign(subscription, {key: key.key}))
                        );
                    }),
                    map(subscription => this.enrichSubscriptionWithNumberOfRequests(subscriptionsNumberOfRequests, subscription)),

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
                        subscription.key ? subscription.key : 'none',
                        subscription.numberOfRequests
                    ])
                ))
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
                    'Subscription token',
                    'Number of requests'
                ],
                this
            ));
    }

    getApis(managementApi) {
        return managementApi.login(this.argv['username'], this.argv['password']).pipe(
            mergeMap(_token => this.argv['api-id'] !== undefined
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
            mergeMap(plans => managementApi.getApiSubscriptions(api.id, this.argv['subscription-status'], SUBSCRIPTION_PAGE_SIZE).pipe(
                mergeMap(subscriptions => this.extractApiSubscriptions(api, plans, subscriptions))
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

    getSubscriptionsNumberOfRequests() {
        const elasticsearch = ElasticSearch.createInstance(new ElasticSearch.Settings(this.argv['elasticsearch-url'], this.argv['elasticsearch-url-header']));
        const aggregation = {
            "RequestsByApi" : {
              "terms": {
                "field": "api",
                "size": 1000
              },
              "aggs": {
                "SecurityTypeFilter": {
                  "filter": {
                    "term": {
                      "security-type": "API_KEY"
                    }
                  },
                  "aggs": {
                    "RequestsBySubscription": {
                      "terms": {
                        "field": "security-token",
                        "size": 1000
                      }
                    }
                  }
                }
              }
            }
        };

        return elasticsearch.aggregateHits(
            new ElasticSearch.Search(this.argv['elasticsearch-index'], [], util.format("now-%s", this.argv['runtime-duration'])),
            aggregation
        ).pipe(
            mergeMap(esResult => Rx.from(esResult.aggregations.RequestsByApi.buckets).pipe(
                mergeMap(apiResult => Rx.from(apiResult.SecurityTypeFilter.RequestsBySubscription.buckets).pipe(
                    map(subscriptionResult => Object.assign({
                        "api": apiResult.key,
                        "subscription": subscriptionResult.key,
                        "count": subscriptionResult.doc_count
                    }))
                )),
                reduce((acc, subscriptionNumberOfRequests) => acc.concat(subscriptionNumberOfRequests), [])
            ))
        );
    }

    enrichSubscriptionWithNumberOfRequests(subscriptionsNumberOfRequests, subscription) {
        if (this.argv['with-number-of-requests']) {
            const foundSubscription = subscriptionsNumberOfRequests
               .find(s => s.api === subscription.api.id && s.subscription === subscription.key);
            subscription.numberOfRequests = foundSubscription !== undefined ? foundSubscription.count : 0;
        } else {
            subscription.numberOfRequests = 'N/A';
        }
        return subscription;
    }

}

new ListSubscriptions().run();
