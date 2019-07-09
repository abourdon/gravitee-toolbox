const util = require('util')
const https = require('https')
const Axios = require('axios')
const Rx = require('rxjs')
const { concatMap, filter, flatMap, map, take, tap } = require('rxjs/operators');

/**
 * Numeric value if no result is given when String.search() is applied
 *
 * @type {number}
 */
const NO_RESULT_ON_STRING_SEARCH = -1;

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
     * - byName: to search against API name (regular expression)
     * - byContextPath: to search against context paths (regular expression)
     *
     * @param {object} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     */
    listApis(filters = {}, delayPeriod = 50) {
        const requestSettings = {
            method: 'get',
            url: 'apis'
        };
        return this._request(requestSettings)
            .pipe(
                // Emit each API found
                flatMap(apis => Rx.from(apis)),
                // Apply delay between API emission
                concatMap(api => Rx
                    .interval(delayPeriod)
                    .pipe(
                        take(1),
                        map(_second => api)
                    )
                ),

                // Apply filter on name if necessary
                filter(api => !filters.byName || api.name.search(filters.byName) !== NO_RESULT_ON_STRING_SEARCH),

                // Apply filter on context-path if necessary
                filter(api => !filters.byContextPath || api.context_path.search(filters.byContextPath) !== NO_RESULT_ON_STRING_SEARCH)
            );
    }

    /**
     * List all APIs according to the optional given filters.
     * Each matched API is emitted individually, by allowing delay between events according to the given delayPeriod (by default 50 milliseconds) in order to avoid huge flooding in case of high number of APIs.
     * This listing requires to get API details for each API, through export feature, which is time consuming. If you do not need API details or specific filters, prefer using #listApis() instead.
     * 
     * Available filters are:
     * - byName: to search against API name (regular expression)
     * - byContextPath: to search against context paths (regular expression)
     * - byEndpointGroupName: to search against endpoint group names (regular expression)
     * - byEndpointName: to search against endpoint name (regular expression)
     * - byEndpointTarget: to search against endpoint target (regular expression)
     * - byPlanName: to search against plan name (regular expression)
     * 
     * @param {object} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     */
    listApisDetails(filters = {}, delayPeriod = 50) {
        return this.listApis(filters, delayPeriod)
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
                        .from(api.details.proxy.groups.filter(group => group.name.search(filters.byEndpointGroupName) !== NO_RESULT_ON_STRING_SEARCH))
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
                                const checkEndpointName = !filters.byEndpointName || endpoint.name.search(filters.byEndpointName) !== NO_RESULT_ON_STRING_SEARCH;
                                const checkEndpointTarget = !filters.byEndpointTarget || endpoint.target.search(filters.byEndpointTarget) !== NO_RESULT_ON_STRING_SEARCH;
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
                            filter(plan => plan.name.search(filters.byPlanName) !== NO_RESULT_ON_STRING_SEARCH),
                            map(() => api)
                        )
                })
            );
    }

    /**
     * List all Applications
     *
     * @param delayPeriod the delay period to apply before emission of an Application (default 50ms)
     * @return {Observable<any>} an emission of each Application that match with given filters
     */
    listApplications(delayPeriod = 50) {
        const requestSettings = {
            method: 'get',
            url: 'applications'
        };
        return this._request(requestSettings)
            .pipe(
                // Emit each API found
                flatMap(apps => Rx.from(apps)),
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

    getApiMetadata(apiId) {
        const requestSettings = {
            method: 'get',
            url: util.format('apis/%s/metadata', apiId)
        }
        return this._request(requestSettings);
    }

    /**
     * Get export of the API with given apiId
     * 
     * @param {string} apiId to identify the API to export
     * @param {string} exclude list of fields to exclude from export (e.g 'pages,groups')
     */
    export (apiId, exclude) {
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
    import (api, apiId) {
        const requestSettings = {
            method: 'post',
            data: api
        };
        requestSettings.url = apiId ? util.format('apis/%s/import', apiId) : 'apis/import';
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
     * Do a request to the Management API
     * 
     * @param {object} requestDetails details of the Management API request
     */
    _request(requestDetails) {
        const requestSettings = Object.assign({}, requestDetails);
        requestSettings.baseURL = this.settings.apimUrl
            // If login bearer is present, then add it to the request and eventually remove any configured authorization
        if (this.settings.bearer) {
            requestSettings.headers = Object.assign({}, requestSettings.headers);
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
            requestSettings.timeout = 10000;
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
    constructor(apimUrl) {
        this.apimUrl = apimUrl;
    }
};

module.exports = {
    Settings: ManagementApi.Settings,
    createInstance: function(settings) {
        return new ManagementApi(settings);
    }
};