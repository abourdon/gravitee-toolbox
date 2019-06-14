const util = require('util')
const https = require('https')
const Axios = require('axios')
const Rx = require('rxjs')
const { concatMap, filter, flatMap, map, take, tap } = require('rxjs/operators')

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
     * 
     * Available filters are:
     * - byFreeText: apply a full text search
     * - byContxtPath: to search against context paths (regular expression)
     * - byEndpointGroupName: to search against endpoint group names (regular expression)
     * - byEndointName: to search against endpoint name (regular expression)
     * - byEndpointTarget: to search against endpoint target (regular expression)
     * 
     * @param {string} filters an object containing desired filters if necessary
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     */
    listApis(filters = {}, delayPeriod = 50) {
        const requestSettings = filters.byFreeText ? {
            method: 'post',
            url: 'apis/_search',
            params: {
                q: filters.byFreeText
            }
        } : {
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

                // Enrich API definition to allow deeper filtering
                flatMap(api => this.export(api.id)),

                // Apply filter on context-path if necessary
                filter(api => !filters.byContextPath || api.proxy.context_path.search(filters.byContextPath) !== -1),

                // Apply filter on endpoint group attributes if necessary
                flatMap(api => {
                    if (!filters.byEndpointGroupName) {
                        return Rx.of(api);
                    }
                    if (!api.proxy.groups) {
                        return Rx.empty();
                    }
                    return Rx
                        .from(api.proxy.groups.filter(group => group.name.search(filters.byEndpointGroupName) !== -1))
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
                            flatMap(api => api.proxy.groups ? Rx.from(api.proxy.groups) : Rx.empty()),
                            flatMap(group => group.endpoints ? Rx.from(group.endpoints) : Rx.empty()),
                            filter(endpoint => {
                                const checkEndpointName = !filters.byEndpointName || endpoint.name.search(filters.byEndpointName) !== -1;
                                const checkEndpointTarget = !filters.byEndpointTarget || endpoint.target.search(filters.byEndpointTarget) !== -1;
                                return checkEndpointName && checkEndpointTarget;
                            }),
                            map(() => api)
                        );
                })
            )
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
        }
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
        }
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
}

module.exports = {
    Settings: ManagementApi.Settings,
    createInstance: function(settings) {
        return new ManagementApi(settings);
    }
}