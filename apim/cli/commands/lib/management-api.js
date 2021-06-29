const StringUtils = require('./string-utils');
const util = require('util');
const gaxios = require('gaxios');
const https = require('https');
const Rx = require('rxjs');
const {concatMap, distinct, expand, filter, mergeMap, map, reduce, take, tap} = require('rxjs/operators');

const DEFAULT_TIMEOUT = 120000; // in ms
const DEFAULT_RETRY_DELAY = 5000; // in ms
const DEFAULT_RETRY_ATTEMPT = 3;
const HEADER_SEPARATOR = ':';
const EXPORT_EXCLUDE = {
    GROUPS: 'groups',
    MEMBERS: 'members',
    PAGES: 'pages',
    PLANS: 'plans'
};
const API_PORTAL_VISBILITY = {
    PRIVATE: 'private',
    PUBLIC: 'public'
};
const EVENT_TYPE = {
    USER_CONNECTED: 'USER_CONNECTED'
};
const PLAN_STATUS = {
    STAGING: 'staging',
    PUBLISHED: 'published',
    DEPRECATED: 'deprecated',
    CLOSED: 'closed'
};
const PLAN_SECURITY_TYPE = {
    API_KEY: 'api_key',
    KEYLESS: 'key_less',
    JWT: 'jwt',
    OAUTH2: 'oauth2'
};
const SUBSCRIPTION_STATUS = {
    ACCEPTED: 'accepted',
    PENDING: 'pending',
    PAUSED: 'paused',
    REJECTED: 'rejected',
    CLOSED: 'closed'
};
const POLICY_CONFIGURATION_KEY = {
    METHODS: 'methods',
    DESCRIPTION: 'description',
    ENABLED: 'enabled'
};
const HEALTH_LOG_STATES = [
    'DOWN',
    'TRANSITIONALLY_DOWN',
    'TRANSITIONALLY_UP',
    'UP'
];

/**
 * Gravitee.io APIM's Management API client instance.
 *
 * @author Aurelien Bourdon
 */
class ManagementApi {

    /**
     * Create a new ManagementApi client instance according to the given settings
     *
     * @param {object} console the Console allowing this ManagementAPI instance to display log to user
     * @param {object} managementApiSettings settings of this ManagementApi client instance
     */
    constructor(console, managementApiSettings) {
        this.console = console;
        this.settings = managementApiSettings;
    }

    /**
     * Ask for login, based on the given credentials
     * Once logged the Apim instance's Apim.Settings will be set by the login bearer token
     *
     * @param {string} username the username to login
     * @param {string} password the username's password
     * @returns {Obervable}
     */
    login(username, password) {
        const credentials = Buffer.from(util.format('%s:%s', username, password)).toString('base64')
        return this._request({
            method: 'POST',
            url: '/user/login',
            headers: {
                Authorization: 'Basic ' + credentials
            }
        }).pipe(
            // Add the login bearer token to the current Apim.Settings
            tap(access => this.settings.bearer = access.token)
        );
    }

    /**
     * Ask for logout, based on the Apim instance's Apim.Settings.
     * Once logout, then remove the Apim instance's Apim.Settings login bearer token
     *
     * @returns {Observable}
     */
    logout() {
        return this._request({
            method: 'POST',
            url: '/user/logout'
        }).pipe(
            // Remove the login bearer token
            tap(_answer => delete this.settings.bearer)
        )
    }

    /**
     * List all APIs according to the optional given filters.
     * Each matched API is emitted individually, by allowing delay between events according to the given delayPeriod (by default 50 milliseconds) in order to avoid huge flooding in case of high number of APIs.
     * This listing retrieve APIs basic information. If you need API details or specific filters, prefer using #listApisDetails() instead.
     *
     * Available filters are:
     * - byId: to search against API id (exact match)
     * - byName: to search against API name (insensitive regular expression)
     * - byContextPath: to search against context paths (insensitive regular expression)
     *
     * @param {object} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     * @param {number} timeout threshold for request to time out
     */
    listApisBasics(filters = {}, delayPeriod = 50, timeout = DEFAULT_TIMEOUT) {
        const requestSettings = {
            method: 'GET',
            url: '/apis',
            timeout: timeout
        };
        return this._request(requestSettings)
            .pipe(
                // Emit each API found
                mergeMap(apis => Rx.from(apis)),

                // Apply filter on id if necessary (strict matches),
                filter(api => !filters.byId || api.id === filters.byId),

                // Apply filter on name if necessary
                filter(api => !filters.byName || StringUtils.caseInsensitiveMatches(api.name, filters.byName)),

                // Apply filter on context-path if necessary
                filter(api => !filters.byContextPath || StringUtils.caseInsensitiveMatches(api.context_path, filters.byContextPath)),

                // Apply filter on primary owner if necessary
                filter(api => !filters.byPrimaryOwner && typeof api.owner !== 'undefined'
                    || StringUtils.caseInsensitiveMatches(api.owner.displayName, filters.byPrimaryOwner)
                    || (typeof api.owner.email !== 'undefined' && StringUtils.caseInsensitiveMatches(api.owner.email, filters.byPrimaryOwner))
                ),

                // Apply filter on portal visibility if necessary
                filter(api => !filters.byPortalVisibility || filters.byPortalVisibility.includes(api.visibility)),

                // Apply delay between API emission
                concatMap(api => Rx
                    .interval(delayPeriod)
                    .pipe(
                        take(1),
                        map(_second => api)
                    )
                )
            );
    }

    /**
     * List all APIs according to the optional given filters.
     * Each matched API is emitted individually, by allowing delay between events according to the given delayPeriod (by default 50 milliseconds) in order to avoid huge flooding in case of high number of APIs.
     * This listing requires to get API details for each API, through export feature, which is time consuming. If you do not need API details or specific filters, prefer using #listApisBasics() instead.
     *
     * Available filters are:
     * - filters from listApisBasics, plus:
     * - byEndpointGroupName: to search against endpoint group names (insensitive regular expression)
     * - byEndpointName: to search against endpoint name (insensitive regular expression)
     * - byEndpointTarget: to search against endpoint target (insensitive regular expression)
     * - byPlanName: to search against plan name (insensitive regular expression)
     * - byPlanSecurityType: to search against plan security type
     * - byPolicyTechnicalName: to search against the policy technical name (insensitive regular expression)
     * - byPolicyContent: to search against the policy content by evaluating a json path (extended) predicate
     * - byAny: to search against the full technical structure of the API (json path predicate)
     *
     * @param {object} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     * @param {number} timeout threshold for request to time out
     */
    listApisDetails(filters = {}, delayPeriod = 50, timeout = DEFAULT_TIMEOUT) {
        return this.listApisBasics(filters, delayPeriod, timeout)
            .pipe(
                // Enrich API definition with the API export to allow deeper filtering
                // API export result will be available through the details attribute
                mergeMap(api => this.export(api.id)
                    .pipe(
                        // Add a details attribute that contain API export information
                        map(apiExport => Object.assign(api, {
                            details: apiExport
                        }))
                    )
                ),

                // Apply filter on endpoint group attributes if necessary
                mergeMap(api => {
                    if (!filters.byEndpointGroupName) {
                        return Rx.of(api);
                    }
                    if (!api.details.proxy.groups) {
                        return Rx.EMPTY;
                    }
                    return Rx
                        .from(api.details.proxy.groups.filter(group => StringUtils.caseInsensitiveMatches(group.name, filters.byEndpointGroupName)))
                        .pipe(
                            map(() => api),

                            // Only keep unique API result
                            distinct(api => api.id)
                        );
                }),

                // Apply filter on endpoint attributes if necessary
                mergeMap(api => {
                    if (!filters.byEndpointName && !filters.byEndpointTarget) {
                        return Rx.of(api);
                    }
                    return Rx
                        .of(api)
                        .pipe(
                            mergeMap(api => api.details.proxy.groups ? Rx.from(api.details.proxy.groups) : Rx.EMPTY),
                            mergeMap(group => group.endpoints ? Rx.from(group.endpoints) : Rx.EMPTY),
                            filter(endpoint => {
                                const checkEndpointName = !filters.byEndpointName || StringUtils.caseInsensitiveMatches(endpoint.name, filters.byEndpointName);
                                const checkEndpointTarget = !filters.byEndpointTarget || StringUtils.caseInsensitiveMatches(endpoint.target, filters.byEndpointTarget);
                                return checkEndpointName && checkEndpointTarget;
                            }),
                            map(() => api),

                            // Only keep unique API result
                            distinct(api => api.id)
                        );
                }),

                // Apply filter on plans if necessary
                mergeMap(api => {
                    if (!filters.byPlanName && !filters.byPlanSecurityType) {
                        return Rx.of(api);
                    }
                    return Rx
                        .of(api)
                        .pipe(
                            mergeMap(api => api.details.plans ? Rx.from(api.details.plans) : Rx.EMPTY),
                            filter(plan => !filters.byPlanName || StringUtils.caseInsensitiveMatches(plan.name, filters.byPlanName)),
                            filter(plan => !filters.byPlanSecurityType || filters.byPlanSecurityType.filter(filter => filter.toUpperCase() === plan.security).length !== 0),
                            map(() => api),

                            // Only keep unique API result
                            distinct(api => api.id)
                        )
                }),

                // Apply filter on policy name if necessary
                mergeMap(api => {
                    if (!filters.byPolicyTechnicalName) {
                        return Rx.of(api);
                    }
                    return _applyFilterOnBothPlansAndDesignPaths(api, (api, paths) => {
                        return paths.pipe(
                            // For each path
                            mergeMap(paths => Object.values(paths)),

                            // And each policy
                            mergeMap(policies => policies),

                            // Get its configuration keys
                            mergeMap(policy => Rx.from(Object.keys(policy))),

                            // Retrieve only the policy name
                            filter(policyConfigurationKey => !Object.values(POLICY_CONFIGURATION_KEY).includes(policyConfigurationKey)),

                            // Then filter the policy technical name according to the given filter
                            filter(policyTechnicalName => StringUtils.caseInsensitiveMatches(policyTechnicalName, filters.byPolicyTechnicalName))
                        )});
                }),

                // Apply filter on policy content if necessary
                mergeMap(api => {
                    if (!filters.byPolicyContent) {
                        return Rx.of(api);
                    }
                    return _applyFilterOnBothPlansAndDesignPaths(api, (api, paths) => {
                        return paths.pipe(
                            // For each path
                            mergeMap(paths => Object.values(paths)),

                            // And each policy
                            mergeMap(policies => policies),

                            // Filter its content based on the given jsonpath predicate
                            filter(policy => StringUtils.jsonPathMatches(policy, filters.byPolicyContent))
                        )});
                }),

                // Apply filter on the full structure if necessary
                mergeMap(api => {
                    if (!filters.byAny) {
                        return Rx.of(api);
                    }
                    return Rx.of(api).pipe(
                        filter(api => StringUtils.jsonPathMatches(api, filters.byAny))
                    );
                })
            );

        /**
         * Utility function that applies a given filter on both API design and plans' paths
         *
         * @param api the api from which filter their plans and design paths
         * @param filter the filter to apply (that takes the api and the path in argument)
         * @returns {*}
         * @private
         */
        function _applyFilterOnBothPlansAndDesignPaths(api, filter) {
            const designPaths = api.details.paths === undefined ? Rx.EMPTY : Rx.of(api.details.paths);
            const plansPaths = api.details.plans === undefined ? Rx.EMPTY : Rx.from(api.details.plans).pipe(
                map(plan => plan.paths)
            );
            return Rx.merge(filter(api, designPaths), filter(api, plansPaths)).pipe(
                map(() => api),
                distinct(api => api.id)
            );
        }
    }

    /**
     * List all applications according to the optional given filters.
     * Each matched application is emitted individually, by allowing delay between events according to the given delayPeriod (by default 50 milliseconds) in order to avoid huge flooding in case of high number of applications.
     *
     * Available filters are:
     * - byName: to search against application name (insensitive regular expression)
     *
     * @param {object} filters an object containing desired filters if necessary
     * @param delayPeriod the delay period to apply before emission of an Application (default 50ms)
     * @param {number} timeout threshold for request to time out
     * @return {Observable<any>} an emission of each Application that match with given filters
     */
    listApplications(filters = {}, delayPeriod = 50, timeout = DEFAULT_TIMEOUT) {
        const requestSettings = {
            method: 'GET',
            url: '/applications',
            timeout: timeout
        };
        return this._request(requestSettings)
            .pipe(
                // Emit each application found
                mergeMap(apps => Rx.from(apps)),

                // Filter on application id if necessary
                filter(app => !filters.byId || StringUtils.matches(app.id, filters.byId)),

                // Filter on application name if necessary
                filter(app => !filters.byName || StringUtils.caseInsensitiveMatches(app.name, filters.byName)),

                // Apply filter on primary owner if necessary
                filter(app => !filters.byPrimaryOwner && typeof app.owner !== 'undefined'
                    || StringUtils.caseInsensitiveMatches(app.owner.displayName, filters.byPrimaryOwner)
                    || (typeof app.owner.email !== 'undefined' && StringUtils.caseInsensitiveMatches(app.owner.email, filters.byPrimaryOwner))
                ),

                // Apply delay between API emission
                concatMap(app => Rx
                    .interval(delayPeriod)
                    .pipe(
                        take(1),
                        map(_second => app)
                    )
                )
            );
    }

    /**
     * Get API information.
     *
     * @param {string} apiId the API identifier from which getting information
     * @returns {Observable<any>}
     */
    getApi(apiId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s', apiId),
        };
        return this._request(requestSettings);
    }

    /**
     * Get API state.
     *
     * @param {string} apiId the API identifier from which getting state
     * @returns {Observable<any>}
     */
    getApiState(apiId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/state', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get quality information about the given API identifier
     *
     * @param apiId the API identifier from which getting quality information
     * @returns {Observable<any>}
     */
    getQuality(apiId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/quality', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get the quality rules.
     *
     * @returns {Observable<any>} the list of quality rules.
     */
    getQualityRules() {
        const requestSettings = {
            method: 'GET',
            url: '/configuration/quality-rules'
        };
        return this._request(requestSettings);
    }

    /**
     * Gets the quality rule corresponding to the specified rule ID.
     *
     * @param apiId the API identifier from which getting quality rules.
     * @param ruleId the rule identifier.
     * @returns {Observable<any>} an observable containing the rule corresponding to ruleId, or undefined if none corresponds.
     */
    getQualityRule(apiId, ruleId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/quality-rules', apiId)
        }
        return this._request(requestSettings).pipe(
            mergeMap(rules => {
                var found = Rx.of(undefined);
                rules.forEach(rule => {
                    if (rule.quality_rule === ruleId) {
                        found = Rx.of(rule);
                    }
                });
                return found;
            })
        );
    }

    /**
     * Create the specified quality rule for the specified API.
     *
     * @param apiId the API identifier
     * @param ruleId the quality rule identifier
     * @param checked indicates whether the quality rule is checked for the API
     * @returns {Observable<any>}
     */
    createQualityRule(apiId, ruleId, checked) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/apis/%s/quality-rules', apiId),
            data: {"api": apiId, "quality_rule": ruleId, "checked": checked}
        };
        return this._request(requestSettings);
    }

    /**
     * Updates the specified quality rule for the specified API.
     *
     * @param apiId the API identifier
     * @param ruleId the quality rule identifier
     * @param checked indicates whether the quality rule is checked for the API
     * @returns {Observable<any>}
     */
    updateQualityRule(apiId, ruleId, checked) {
        const requestSettings = {
            method: 'PUT',
            url: util.format('/apis/%s/quality-rules/%s', apiId, ruleId),
            data: {"checked": checked},
            retry: true
        };
        return this._request(requestSettings);
    }

    /**
     * Get API metadata.
     *
     * @param apiId the API identifier from which getting metadata
     * @returns {Observable<any>}
     */
    getApiMetadata(apiId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/metadata', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get plan of the specified API and plan identifiers
     *
     * @param apiId the API identifier from which getting the plan
     * @param planId the plan identifier from which getting plan information
     * @returns {Observable<ObservedValueOf<*>>}
     */
    getApiPlan(apiId, planId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/plans/%s')
        };
        return this._request(requestSettings);
    }

    /**
     * Get API plans.
     *
     * @param apiId the API identifier from which getting plans.
     * @param {array} planStatusToInclude status of plans to retrieve.
     * @param {array} securityTypeToExclude security types of plans to exclude.
     * @param additionalFilters additional filters to apply when getting API plans (by name...)
     * @returns {Observable<B>} emit each plan
     */
    getApiPlans(apiId, planStatusToInclude = Object.values(PLAN_STATUS), securityTypesToExclude = [], additionalFilters = {}) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/plans', apiId),
            params: {
                status: planStatusToInclude.join(',')
            }
        };
        return this._request(requestSettings)
            .pipe(
                // Emit any plan
                mergeMap(plans => plans),

                // Exclude non desired security types
                filter(plan => !securityTypesToExclude.includes(plan.security)),

                // Filter plan by its name
                filter(plan => !additionalFilters.byName || StringUtils.caseInsensitiveMatches(plan.name, additionalFilters.byName))
            );
    }

    /**
     * Get API subscriptions.
     *
     * // TODO handle pagination
     *
     * @param apiId the API identifier from which getting subscriptions.
     * @param subscriptionStatus status of the subscriptions to retrieve.
     * @param size number of subscriptions to retrieve.
     * @returns {Observable<B>} emit each subscription
     */
    getApiSubscriptions(apiId, subscriptionStatus = [SUBSCRIPTION_STATUS.ACCEPTED, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAUSED], size = 100) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/subscriptions', apiId),
            params: {
                size: size,
                status: subscriptionStatus.join(',')
            }
        };
        return this._request(requestSettings).pipe(
            // Emit each subscription
            mergeMap(subscriptions => subscriptions.data),

            // Get details about the subscription
            mergeMap(subscription => this.getApiSubscription(apiId, subscription.id)),
        );
    }

    /**
     * Get details about an API subscription
     *
     * @param apiId the API identifier from which getting the subscription
     * @param subscriptionId the subscription identifier from which getting details
     * @returns {Observable<ObservedValueOf<*>>}
     */
    getApiSubscription(apiId, subscriptionId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/subscriptions/%s', apiId, subscriptionId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get API subscription keys.
     *
     * @param apiId the API identifier the subscription belongs to.
     * @param subscriptionId the subscription identifier from which getting keys.
     * @returns {Observable<any>}
     */
    getApiSubscriptionKeys(apiId, subscriptionId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/subscriptions/%s/keys', apiId, subscriptionId)
        };
        return this._request(requestSettings).pipe(
            // Emit each key
            mergeMap(keys => keys)
        );
    }

    /**
     * Get application subscriptions.
     *
     * @param applicationId the application identifier from which getting subscriptions.
     * @returns {Observable<any>}
     */
    getApplicationSubscriptions(applicationId, subscriptionStatus = ['ACCEPTED', 'PENDING', 'PAUSED'], size = 10) {
        var status = subscriptionStatus.reduce((acc, s) => acc + (acc.length > 0 ? "," : "") + s, "");
        const requestSettings = {
            method: 'GET',
            url: util.format('/applications/%s/subscriptions?size=%d&status=%s', applicationId, size, status)
        };
        return this._request(requestSettings).pipe(
            // Emit each subscription
            mergeMap(subscriptions => subscriptions.data),

            // Get details about the subscription
            mergeMap(subscription => this.getApplicationSubscription(applicationId, subscription.id)),
        )
    }

    /**
     * Get details about an Application subscription
     *
     * @param applicationId the Application identifier from which getting the subscription
     * @param subscriptionId the subscription identifier from which getting details
     * @returns {Observable<ObservedValueOf<*>>}
     */
    getApplicationSubscription(applicationId, subscriptionId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/applications/%s/subscriptions/%s', applicationId, subscriptionId)
        };
        return this._request(requestSettings);
    }

    /**
     * List all documentation pages related to an API according to the optional given filters.
     * Each matched documentation page is emitted individually
     *
     * Available filters are:
     * - byName: to search against documentation page name (insensitive regular expression)
     * - byType: to search against documentation page type
     *
     * @param {string} the API containing documentation pages
     * @param {object} filters an object containing desired filters if necessary
     * @returns {Observable<any>} the filtered pages
     */
    getDocumentationPages(apiId, filters = {}) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/pages', apiId)
        };
        return this._request(requestSettings)
            .pipe(
                mergeMap(pages => Rx.from(pages)),
                filter(page => !filters.byName || StringUtils.caseInsensitiveMatches(page.name, filters.byName)),
                filter(page => !filters.byType || StringUtils.caseInsensitiveMatches(page.type, filters.byType))
            );
    }

    /**
     * Fetches a documentation page corresponding to an API
     *
     * @param apiId the API identifier
     * @param pageId the page identifier
     * @returns {Observable<any>} the page
     */
    fetchDocumentationPage(apiId, pageId) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/apis/%s/pages/%s/_fetch', apiId, pageId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get API health logs.
     *
     * @param apiId the API identifier from which getting health logs.
     * @param transition indicates whether only transition health logs are retrieved.
     * @param pageSize number of health logs to retrieve per page.
     * @returns {Observable<B>} emit each health log.
     */
    getApiHealthLogs(apiId, transition = true, pageSize = 10) {
        var currentPage = 1;
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/health/logs', apiId),
            params: {
                page: currentPage,
                size: pageSize,
                transition: transition
            }
        };
        return this._request(requestSettings).pipe(
            expand(response => {
                return response.total - (pageSize * currentPage++) <= 0
                    ? Rx.EMPTY
                    : this._request({
                        method: 'GET',
                        url: util.format('/apis/%s/health/logs', apiId),
                        params: {
                            page: currentPage,
                            size: pageSize,
                            transition: transition
                        }
                    });
            }),
            mergeMap(response => Rx.from(response.logs).pipe(
                tap(healthLog => {
                    healthLog.state = HEALTH_LOG_STATES[healthLog.state];
                    healthLog.gateway = response.metadata[healthLog.gateway].hostname
                })
            ))
        );
    }

    /**
     * Get export of the API with given apiId
     *
     * @param {string} apiId to identify the API to export
     * @param {string} exclude list of fields to exclude from export (e.g 'pages,groups')
     */
    export(apiId, exclude) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/export', apiId)
        };
        if (exclude) {
            requestSettings.params = {
                exclude: exclude
            }
        }
        return this._request(requestSettings)
            .pipe(
                // Add the API identifier to the export to be eventually used later
                map(api => {
                    api.id = apiId;
                    return api;
                })
            );
    }

    /**
     * Create or update the given API definition.
     *
     * @param {object} api the API definition to create or update
     * @param {string} apiId if given then update API with apiId identifier with the given API definition
     */
    import(api, apiId) {
        const requestSettings = {
            method: 'POST',
            data: api
        };
        requestSettings.url = apiId ? util.format('/apis/%s/import', apiId) : '/apis/import';
        return this._request(requestSettings);
    }

    /**
     * Get application information.
     *
     * @param {string} applicationId the application identifier from which getting information
     * @returns {Observable<any>}
     */
    getApplication(applicationId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/applications/%s', applicationId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get tenants currently configured in the platform
     *
     * @returns {Obser  vable<ObservedValueOf<*>>} the list of tenants currently configured in the platform
     */
    getTenants() {
        const requestSettings = {
            method: 'GET',
            url: '/configuration/tenants'
        };
        return this._request(requestSettings);
    }

    /**
     * Deploy API identified by the given API identifier
     *
     * @param {string} apiId identifier of the API to deploy
     */
    deploy(apiId) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/apis/%s/deploy', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Search users by given search term.
     *
     * @param {string} user search term (either its name or LDAP UID)
     */
    searchUsers(searchTerm) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/search/users?q=%s', searchTerm)
        };
        return this._request(requestSettings);
    }

    /**
     * Get information about the given user identifier
     *
     * @param userId the user identifier from which getting user information
     * @returns {Observable<ObservedValueOf<*>>} the found user
     */
    getUser(userId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('users/%s', userId)
        };
        return this._request(requestSettings);
    }

    /**
     * Transfer ownership of the given element referenced by its id and type (api or application)
     *
     * @param {string} api or application ID
     * @param {string} element type: api or application
     * @param {string} user reference, retrieved from user search
     * @param {string} previous owner role: USER or OWNER
     */
    transferOwnership(elementId, elementType, reference, oldOwnerRole) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/%ss/%s/members/transfer_ownership', elementType, elementId),
            data: {'reference': reference, 'role': oldOwnerRole}
        };
        return this._request(requestSettings);
    }

    /**
     * List users from LDAP source.
     *
     * @param {number} pageNumber current page number.
     * @param {number} pageSize page size.
     */
    listLdapUsers(pageNumber = 1, pageSize = 100) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/users?page=%d&size=%d', pageNumber, pageSize)
        };
        return this._request(requestSettings).pipe(
            expand(response => {
                return response.page.current == response.page.total_pages
                    ? Rx.EMPTY
                    : this._request({
                        method: 'GET',
                        url: util.format('/users?page=%d&size=%d', response.page.current + 1, pageSize)
                    });
            }),
            mergeMap(response => response.data),
            filter(user => user.source == 'ldap')
        );
    }

    /**
     * List memberships for user, as a list of elements containing the referenced API or application ID and name.
     *
     * @param {string} userId user ID.
     * @param {string} membership type (either api or application).
     */
    listUserMemberships(userId, type) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/users/%s/memberships?type=%s', userId, type)
        };
        return this._request(requestSettings).pipe(
            mergeMap(response => Rx.from(response.memberships).pipe(
                filter(membership => response.metadata[membership.reference]),
                map(membership => Object.assign({
                    id: membership.reference,
                    name: response.metadata[membership.reference].name
                })),
                reduce((acc, membership) => acc.concat(membership), [])
            ))
        );
    }

    /**
     * Get API direct members.
     *
     * @param apiId the API identifier.
     * @returns {Observable<any>}
     */
    getApiDirectMembers(apiId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/apis/%s/members', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Delete an API direct member.
     *
     * @param apiId the API identifier.
     * @param userId the member identifier.
     * @returns {Observable<any>}
     */
    deleteApiDirectMember(apiId, userId) {
        const requestSettings = {
            method: 'DELETE',
            url: util.format('/apis/%s/members?user=%s', apiId, userId)
        };
        return this._request(requestSettings).pipe(
            map(_response => userId)
        );
    }

    /**
     * Get group members.
     *
     * @param groupId the group identifier.
     * @returns {Observable<any>}
     */
    getGroupMembers(groupId) {
        const requestSettings = {
            method: 'GET',
            url: util.format('/configuration/groups/%s/members', groupId)
        };
        return this._request(requestSettings);
    }

    /**
     * List all audit events based on predicate
     *
     * @param eventType the event type to select (e.g. EVENT_TYPE#USER_CONNECTED)
     * @param from the start date from which select audit events
     * @param to the end date to which select audit events (default now)
     * @param page the start page from which start audit event select (default 1)
     * @param size the page size (default 2000)
     * @param delayBetweenRequests delay between paged requests to get audit events (default 0ms, means no delay)
     * @returns {Observable<unknown>} a stream of single audit events
     */
    listAudits(eventType = undefined, from = undefined, to = new Date().getTime(), page = 1, size = 2000, delayBetweenRequests = 0) {
        const initialRequest = {
            method: 'GET',
            url: util.format('/audit'),
            params: {
                event: eventType,
                from: from,
                to: to,
                page: page,
                size: size
            }
        };
        return this._requestAllPages(
            initialRequest,
            pagedResult => {
                if (pagedResult.response && pagedResult.response.content.length === 0) {
                    return Rx.EMPTY;
                }
                return this
                    ._request(pagedResult.nextRequest)
                    .pipe(
                        map(result => {
                            const nextRequest = Object.assign({}, pagedResult.nextRequest);
                            nextRequest.params.page++;
                            return new PagedResult(nextRequest, result);
                        }),
                        // Apply delay between API emission
                        concatMap(api => Rx
                            .interval(delayBetweenRequests)
                            .pipe(
                                take(1),
                                map(_second => api)
                            )
                        )
                    );
            },
            pagedResult => pagedResult.response.content
        );
    }

    /**
     * Subscribe the given Application identifier to the given Plan identifier
     *
     * @param applicationId the Application identifier to subscribe to the given Plan identifier
     * @param planId the Plan identifier from which the given Application will subscribe
     */
    subscribe(applicationId, planId) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/applications/%s/subscriptions', applicationId),
            params: {
                plan: planId
            }
        };
        return this._request(requestSettings);
    }

    /**
     * Validate pending subscription on given API
     *
     * @param apiId the API identifier from which validate pending subscription
     * @param subscriptionId the subscription identifier to validate
     */
    validateSubscription(apiId, subscriptionId) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/apis/%s/subscriptions/%s/_process', apiId, subscriptionId),
            data: {
                accepted: true
            }
        };
        return this._request(requestSettings);
    }

    /**
     * Do an APIM paged request.
     * This implies running multiple requests to APIM and concatenating responses.
     *
     * @param initialRequest the initial request that will be executed recursively
     * @param recursiveRequest the process to execute recursively, that will be used by the Rx#expand() operator
     * @param resultsToEmit the result list to select for emission from PagedResult#response
     * @returns {Observable<any | Subscribable<never> extends ObservableInput<infer T> ? T : never | {}>} a stream of single items
     * @private
     */
    _requestAllPages(initialRequest, recursiveRequest, resultsToEmit) {
        return Rx
            .of(new PagedResult(initialRequest))
            .pipe(
                expand(recursiveRequest),
                filter(pagedResult => pagedResult.response),
                mergeMap(resultsToEmit)
            );
    }

    /**
     * Do a request to the Management API
     *
     * @param {object} requestDetails details of the Management API request
     */
    _request(requestDetails) {
        // Clone the request details to operate over without edge effects
        const requestSettings = Object.assign({}, requestDetails);

        // Set request to access to the Management API
        requestSettings.baseURL = this.settings.apimUrl;

        // Add optional headers needed to access to the Management API
        // To do so, recreate headers by first using one in Settings then second by overriding with those given in the current requestDetails
        const requestHeaders = Object.assign({}, this.settings.apimHeaders);
        requestSettings.headers = Object.assign(requestHeaders, requestSettings.headers);

        // If login bearer is present, then add it to the request and eventually remove any configured authorization
        if (this.settings.bearer) {
            requestSettings.headers.Cookie = util.format('%s=Bearer %s', 'Auth-Graviteeio-APIM', this.settings.bearer);
            delete requestSettings.auth;
        }

        // Trust any SSL/TLS HTTP certificate by default
        if (!requestSettings.httpsAgent) {
            requestSettings.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
        }

        // If no timeout is defined then set a default one to DEFAULT_TIMEOUT
        if (!requestSettings.timeout) {
            requestSettings.timeout = DEFAULT_TIMEOUT;
        }

        // Any GET requests are retried by default
        if (requestSettings.method === 'GET') {
            requestSettings.retry = true;
        }
        // If a retry mechanism has been set, then apply the default configuration if necessary
        if (requestSettings.retry) {
            if (!requestSettings.retryConfig) {
                requestSettings.retryConfig = {};
            }
            if (!requestSettings.retryConfig.retry) {
                requestSettings.retryConfig.retry = DEFAULT_RETRY_ATTEMPT;
            }
            if (!requestSettings.retryConfig.noResponseRetry) {
                requestSettings.retryConfig.noResponseRetry = DEFAULT_RETRY_ATTEMPT;
            }
            if (!requestSettings.retryConfig.retryDelay) {
                requestSettings.retryConfig.retryDelay = DEFAULT_RETRY_DELAY;
            }
            if (!requestSettings.retryConfig.onRetryAttempt) {
                const localConsole = this.console;
                requestSettings.retryConfig.onRetryAttempt = function (err) {
                    localConsole.warn(util.format("Error in calling the Management API (%s, %s). Retrying...", err.code, err.message));
                };
            }
            requestSettings.retryConfig.httpMethodsToRetry = [requestSettings.method];
        }

        // Finally do the request and extract answer payload
        return Rx.from(gaxios.request(requestSettings)).pipe(
            map(answer => answer.data)
        );
    }
}

/**
 * Associated settings to any ManagementAPI instance
 */
ManagementApi.Settings = class {

    constructor(apimUrl, apimHeaders = []) {
        this.apimUrl = apimUrl;
        this.apimHeaders = this.formatHeaders(apimHeaders);
    }

    formatHeaders(apimHeaders) {
        return apimHeaders.reduce((acc, header) => {
                const [key, value] = header.split(HEADER_SEPARATOR);
                acc[key] = value;
                return acc;
            }, {}
        );
    };
};

class PagedResult {
    constructor(nextRequest, response) {
        this.nextRequest = nextRequest;
        this.response = response
    }
}

module.exports = {
    Settings: ManagementApi.Settings,
    EXPORT_EXCLUDE: EXPORT_EXCLUDE,
    API_PORTAL_VISBILITY: API_PORTAL_VISBILITY,
    EVENT_TYPE: EVENT_TYPE,
    PLAN_STATUS: PLAN_STATUS,
    PLAN_SECURITY_TYPE: PLAN_SECURITY_TYPE,
    SUBSCRIPTION_STATUS: SUBSCRIPTION_STATUS,
    createInstance: function (console, settings) {
        return new ManagementApi(console, settings);
    }
};
