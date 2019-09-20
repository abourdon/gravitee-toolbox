const StringUtils = require('./string-utils');
const util = require('util')
const https = require('https')
const Axios = require('axios')
const Rx = require('rxjs')
const {concatMap, expand, filter, flatMap, map, reduce, take, tap} = require('rxjs/operators');

const DEFAULT_TIMEOUT = 10000;
const HEADER_SEPARATOR = ':';

/**
 * Gravitee.io APIM's Management API client instance.
 *
 * @author Aurelien Bourdon
 */
class ManagementApi {

    /**
     * Create a new ManagementApi client instance according to the given settings
     *
     * @param {object} managementApiSettings settings of this ManagementApi client instance
     */
    constructor(managementApiSettings) {
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
        return this._request({
            method: 'post',
            url: 'user/login',
            auth: {
                username: username,
                password: password
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
            method: 'post',
            url: 'user/logout'
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
     * - byName: to search against API name (insensitive regular expression)
     * - byContextPath: to search against context paths (insensitive regular expression)
     *
     * @param {object} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     * @param {number} timeout threshold for request to time out
     */
    listApis(filters = {}, delayPeriod = 50, timeout = DEFAULT_TIMEOUT) {
        const requestSettings = {
            method: 'get',
            url: 'apis',
            timeout: timeout
        };
        return this._request(requestSettings)
            .pipe(
                // Emit each API found
                flatMap(apis => Rx.from(apis)),

                // Apply filter on name if necessary
                filter(api => !filters.byName || StringUtils.caseInsensitiveMatches(api.name, filters.byName)),

                // Apply filter on context-path if necessary
                filter(api => !filters.byContextPath || StringUtils.caseInsensitiveMatches(api.context_path, filters.byContextPath)),

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
     * This listing requires to get API details for each API, through export feature, which is time consuming. If you do not need API details or specific filters, prefer using #listApis() instead.
     *
     * Available filters are:
     * - byName: to search against API name (insensitive regular expression)
     * - byContextPath: to search against context paths (insensitive regular expression)
     * - byEndpointGroupName: to search against endpoint group names (insensitive regular expression)
     * - byEndpointName: to search against endpoint name (insensitive regular expression)
     * - byEndpointTarget: to search against endpoint target (insensitive regular expression)
     * - byPlanName: to search against plan name (insensitive regular expression)
     *
     * @param {object} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     * @param {number} timeout threshold for request to time out
     */
    listApisDetails(filters = {}, delayPeriod = 50, timeout = DEFAULT_TIMEOUT) {
        return this.listApis(filters, delayPeriod, timeout)
            .pipe(
                // Enrich API definition with the API export to allow deeper filtering
                // API export result will be available through the details attribute
                flatMap(api => this.export(api.id)
                    .pipe(
                        // Add a details attribute that contain API export information
                        map(apiExport => Object.assign(api, {
                            details: apiExport
                        }))
                    )
                ),

                // Apply filter on endpoint group attributes if necessary
                flatMap(api => {
                    if (!filters.byEndpointGroupName) {
                        return Rx.of(api);
                    }
                    if (!api.proxy.groups) {
                        return Rx.EMPTY;
                    }
                    return Rx
                        .from(api.details.proxy.groups.filter(group => StringUtils.caseInsensitiveMatches(group.name, filters.byEndpointGroupName)))
                        .pipe(
                            map(() => api)
                        );
                }),

                // Apply filter on endpoint attributes if necessary
                flatMap(api => {
                    if (!filters.byEndpointName && !filters.byEndpointTarget) {
                        return Rx.of(api);
                    }
                    return Rx
                        .of(api)
                        .pipe(
                            flatMap(api => api.details.proxy.groups ? Rx.from(api.details.proxy.groups) : Rx.EMPTY),
                            flatMap(group => group.endpoints ? Rx.from(group.endpoints) : Rx.EMPTY),
                            filter(endpoint => {
                                const checkEndpointName = !filters.byEndpointName || StringUtils.caseInsensitiveMatches(endpoint.name, filters.byEndpointName);
                                const checkEndpointTarget = !filters.byEndpointTarget || StringUtils.caseInsensitiveMatches(endpoint.target, filters.byEndpointTarget);
                                return checkEndpointName && checkEndpointTarget;
                            }),
                            map(() => api)
                        );
                }),

                // Apply filter on plans if necessary
                flatMap(api => {
                    if (!filters.byPlanName) {
                        return Rx.of(api);
                    }
                    return Rx
                        .of(api)
                        .pipe(
                            flatMap(api => api.details.plans ? Rx.from(api.details.plans) : Rx.EMPTY),
                            filter(plan => StringUtils.caseInsensitiveMatches(plan.name, filters.byPlanName)),
                            map(() => api)
                        )
                })
            );
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
            method: 'get',
            url: 'applications',
            timeout: timeout
        };
        return this._request(requestSettings)
            .pipe(
                // Emit each application found
                flatMap(apps => Rx.from(apps)),

                // Apply filter on name if necessary
                filter(app => !filters.byName || StringUtils.caseInsensitiveMatches(app.name, filters.byName)),

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
            method: 'get',
            url: util.format('apis/%s', apiId)
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
            method: 'get',
            url: util.format('apis/%s/state', apiId)
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
            method: 'get',
            url: util.format('apis/%s/quality', apiId)
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
            method: 'get',
            url: util.format('apis/%s/metadata', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get API health-check availability.
     *
     * @param apiId the API identifier from which getting health-check availability
     * @returns {Observable<any>}
     */
    getApiHealthCheckAvailability(apiId) {
        const requestSettings = {
            method: 'get',
            url: util.format('/apis/%s/health?type=availability', apiId)
        };
        return this._request(requestSettings);
    }

    /**
     * Get API subscriptions.
     *
     * @param apiId the API identifier from which getting subscriptions.
     * @returns {Observable<any>}
     */
    getApiSubscriptions(apiId, subscriptionStatus = ['ACCEPTED', 'PENDING', 'PAUSED'], size = 10) {
        var status = subscriptionStatus.reduce((acc, s) => acc + (acc.length > 0 ? "," : "") + s, "");
        const requestSettings = {
            method: 'get',
            url: util.format('/apis/%s/subscriptions?size=%d&status=%s', apiId, size, status)
        };
        return this._request(requestSettings);
    }

    /**
     * Get export of the API with given apiId
     *
     * @param {string} apiId to identify the API to export
     * @param {string} exclude list of fields to exclude from export (e.g 'pages,groups')
     */
    export(apiId, exclude) {
        const requestSettings = {
            method: 'get',
            url: util.format('apis/%s/export', apiId)
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
            method: 'post',
            data: api
        };
        requestSettings.url = apiId ? util.format('apis/%s/import', apiId) : 'apis/import';
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
            method: 'get',
            url: util.format('applications/%s', applicationId)
        };
        return this._request(requestSettings);
    }

    /**
     * Updates API identified by the given API identifier.
     *
     * @param {object} api the API definition to update
     * @param {string} apiId identifier of the API to update
     */
    update(api, apiId) {
        var data = Object.assign(api);
        delete data.id;
        delete data.state;
        delete data.context_path;
        delete data.deployed_at;
        delete data.created_at;
        delete data.updated_at;
        delete data.owner;
        delete data.picture_url;
        const requestSettings = {
            method: 'put',
            data: data,
            url: util.format('apis/%s', apiId)
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
            method: 'post',
            url: util.format('apis/%s/deploy', apiId)
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
            method: 'get',
            url: util.format('search/users?q=%s', searchTerm)
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
            method: 'post',
            url: util.format('%ss/%s/members/transfer_ownership', elementType, elementId),
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
            method: 'get',
            url: util.format('users?page=%d&size=%d', pageNumber, pageSize)
        };
        return this._request(requestSettings).pipe(
            expand(response => {
                return response.page.current == response.page.total_pages
                    ? Rx.empty()
                    : this._request({
                        method: 'get',
                        url: util.format('users?page=%d&size=%d', response.page.current + 1, pageSize)
                    });
            }),
            flatMap(response => response.data),
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
            method: 'get',
            url: util.format('/users/%s/memberships?type=%s', userId, type)
        };
        return this._request(requestSettings).pipe(
            flatMap(response => Rx.from(response.memberships).pipe(
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
            })
        }

        // If no timeout is defined then set a default one to 10s
        if (!requestSettings.timeout) {
            requestSettings.timeout = DEFAULT_TIMEOUT;
        }

        return Rx.from(Axios.request(requestSettings))
            .pipe(
                // Only emit answer data
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

module.exports = {
    Settings: ManagementApi.Settings,
    createInstance: function (settings) {
        return new ManagementApi(settings);
    }
};